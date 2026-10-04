"""Train and evaluate the tagging ladder on one test set.

  L0 rules (gazetteer)  ->  L2a HMM  ->  L2b CRF  ->  L3 transformer encoder + constrained Viterbi

usage:
  python scripts/ladder.py data                       # build train/dev/test jsonl
  python scripts/ladder.py classic                    # rules, HMM, CRF
  python scripts/ladder.py bert --model microsoft/MiniLM-L12-H384-uncased --name minilm
  python scripts/ladder.py export --name minilm       # int8 ONNX for the browser
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

ENGINE = Path(__file__).resolve().parents[1]
ROOT = ENGINE.parent
sys.path.insert(0, str(ENGINE))

from bespoke.data import catalogue_titles, read_gold, synth_sentence  # noqa: E402
from bespoke.decode import viterbi  # noqa: E402
from bespoke.lexicon import labels, spans_to_bio, tag_rules  # noqa: E402

DATA = ROOT / "data" / "processed"
RESULTS = ROOT / "results"
MODELS = ENGINE / "models"
# Myntra catalogue (Kaggle "Fashion Product Images", styles.csv); optional weak-label source
MYNTRA = Path(os.environ.get("BESPOKE_MYNTRA_CSV", ROOT / "data" / "raw" / "styles.csv"))
SEED = 13


def save_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf8") as f:
        for r in rows:
            f.write(json.dumps({"tokens": [t for t, _ in r], "tags": [g for _, g in r]}, ensure_ascii=False) + "\n")


def load_jsonl(path: Path):
    return [json.loads(l) for l in path.read_text(encoding="utf8").splitlines()]


def cmd_data(_):
    rng = random.Random(SEED)
    synth = [synth_sentence(rng) for _ in range(9000)]
    cat = catalogue_titles(MYNTRA, 4000, rng) if MYNTRA.exists() else []
    train = synth[:8000] + cat
    rng.shuffle(train)
    gold = read_gold(ROOT / "data" / "gold" / "requests.txt")
    save_jsonl(DATA / "train.jsonl", train)
    save_jsonl(DATA / "synth_dev.jsonl", synth[8000:])
    save_jsonl(DATA / "dev.jsonl", gold[:30])
    save_jsonl(DATA / "test.jsonl", gold[30:])
    print(f"train {len(train)} (synthetic {8000}, catalogue {len(cat)}), dev {30}, test {len(gold) - 30}")


# ---------------------------------------------------------------- metrics
def evaluate(gold_rows, pred_tags, name):
    from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
    y_true = [r["tags"] for r in gold_rows]
    rep = classification_report(y_true, pred_tags, output_dict=True, zero_division=0)
    res = {
        "system": name,
        "precision": round(precision_score(y_true, pred_tags), 4),
        "recall": round(recall_score(y_true, pred_tags), 4),
        "f1": round(f1_score(y_true, pred_tags), 4),
        "per_type": {k: round(v["f1-score"], 3) for k, v in rep.items() if k.isupper() and "avg" not in k},
    }
    print(f"{name:28s} P {res['precision']:.3f}  R {res['recall']:.3f}  F1 {res['f1']:.3f}")
    return res


def bootstrap_ci(gold_rows, pred_tags, n=1000):
    from seqeval.metrics import f1_score
    rng = np.random.default_rng(SEED)
    idx = np.arange(len(gold_rows))
    vals = []
    for _ in range(n):
        s = rng.choice(idx, len(idx))
        vals.append(f1_score([gold_rows[i]["tags"] for i in s], [pred_tags[i] for i in s]))
    return [round(float(np.percentile(vals, 2.5)), 4), round(float(np.percentile(vals, 97.5)), 4)]


def write_result(res, gold_rows, pred_tags):
    res["f1_ci95"] = bootstrap_ci(gold_rows, pred_tags)
    RESULTS.mkdir(exist_ok=True)
    path = RESULTS / "tagging.json"
    allres = json.loads(path.read_text()) if path.exists() else {}
    allres[res["system"]] = res
    path.write_text(json.dumps(allres, indent=1, ensure_ascii=False))


# ---------------------------------------------------------------- classic
def word_features(toks, i):
    w = toks[i]
    f = {"w": w, "suf3": w[-3:], "suf2": w[-2:], "pre3": w[:3], "len": min(len(w), 8),
         "digit": w.isdigit(), "deva": any("ऀ" <= c <= "ॿ" for c in w), "hash": w.startswith("#")}
    for d in (-2, -1, 1, 2):
        j = i + d
        f[f"w{d}"] = toks[j] if 0 <= j < len(toks) else ("<s>" if j < 0 else "</s>")
    return f


def gazetteer_feats(toks):
    g = spans_to_bio(len(toks), tag_rules(toks))
    return g


class HMM:
    """First-order HMM with add-k smoothing; unknown words emit via a suffix class."""

    def fit(self, rows, k=0.1):
        self.labels = labels()
        L = {l: i for i, l in enumerate(self.labels)}
        n = len(self.labels)
        trans = np.full((n, n), k)
        start = np.full(n, k)
        emit = defaultdict(lambda: np.full(n, k))
        for r in rows:
            prev = None
            for w, t in zip(r["tokens"], r["tags"]):
                j = L[t]
                emit[w][j] += 1
                emit["<suf>" + w[-3:]][j] += 1
                if prev is None:
                    start[j] += 1
                else:
                    trans[prev, j] += 1
                prev = j
        self.trans = np.log(trans / trans.sum(1, keepdims=True))
        self.start = np.log(start / start.sum())
        tot = np.sum([v for v in emit.values()], axis=0)
        self.emit = {w: np.log(v / tot) for w, v in emit.items()}
        self.unk = np.log(np.full(n, k) / tot)
        return self

    def predict(self, toks):
        n = len(self.labels)
        if not toks:
            return []
        e = [self.emit.get(w, self.emit.get("<suf>" + w[-3:], self.unk)) for w in toks]
        score = self.start + e[0]
        back = []
        for i in range(1, len(toks)):
            cand = score[:, None] + self.trans
            back.append(cand.argmax(0))
            score = cand.max(0) + e[i]
        best = [int(score.argmax())]
        for b in reversed(back):
            best.append(int(b[best[-1]]))
        return [self.labels[j] for j in reversed(best)]


def cmd_classic(_):
    import sklearn_crfsuite
    train = load_jsonl(DATA / "train.jsonl")
    test = load_jsonl(DATA / "test.jsonl")

    pred = [spans_to_bio(len(r["tokens"]), tag_rules(r["tokens"])) for r in test]
    write_result(evaluate(test, pred, "L0 rules (gazetteer)"), test, pred)

    hmm = HMM().fit(train)
    pred = [hmm.predict(r["tokens"]) for r in test]
    write_result(evaluate(test, pred, "L2a HMM"), test, pred)

    def feats(r, gaz):
        g = gazetteer_feats(r["tokens"]) if gaz else None
        out = []
        for i in range(len(r["tokens"])):
            f = word_features(r["tokens"], i)
            if gaz:
                f["gaz"] = g[i]
            out.append(f)
        return out

    for gaz in (False, True):
        crf = sklearn_crfsuite.CRF(algorithm="lbfgs", c1=0.05, c2=0.05, max_iterations=150, all_possible_transitions=True)
        t0 = time.time()
        crf.fit([feats(r, gaz) for r in train], [r["tags"] for r in train])
        pred = crf.predict([feats(r, gaz) for r in test])
        name = "L2b CRF + gazetteer feature" if gaz else "L2b CRF"
        res = evaluate(test, pred, name)
        res["train_seconds"] = round(time.time() - t0, 1)
        write_result(res, test, pred)


# ---------------------------------------------------------------- transformer
def encode_words(tok, words, max_len=128):
    ids, first = [tok.cls_token_id], []
    for w in words:
        sub = tok(w, add_special_tokens=False)["input_ids"] or [tok.unk_token_id]
        if len(ids) + len(sub) >= max_len - 1:
            break
        first.append(len(ids))
        ids += sub
    ids.append(tok.sep_token_id)
    return ids, first


def batches(rows, tok, L, bs, shuffle, rng):
    order = list(range(len(rows)))
    if shuffle:
        rng.shuffle(order)
    for s in range(0, len(order), bs):
        chunk = [rows[i] for i in order[s:s + bs]]
        enc = [encode_words(tok, r["tokens"]) for r in chunk]
        m = max(len(e[0]) for e in enc)
        ids = np.full((len(enc), m), tok.pad_token_id)
        att = np.zeros((len(enc), m), dtype=np.int64)
        lab = np.full((len(enc), m), -100)
        for b, ((x, first), r) in enumerate(zip(enc, chunk)):
            ids[b, :len(x)] = x
            att[b, :len(x)] = 1
            for wi, pos in enumerate(first):
                lab[b, pos] = L[r["tags"][wi]]
        yield chunk, enc, ids, att, lab


def bio_spans(tags):
    out, i = [], 0
    while i < len(tags):
        if tags[i] != "O":
            j = i + 1
            while j < len(tags) and tags[j] == "I-" + tags[i][2:]:
                j += 1
            out.append((i, j))
            i = j
        else:
            i += 1
    return out


def predict_rows(model, tok, rows, lab_list, device):
    import torch
    out = []
    L = {l: i for i, l in enumerate(lab_list)}
    model.eval()
    with torch.no_grad():
        for chunk, enc, ids, att, _ in batches(rows, tok, L, 64, False, None):
            logits = model(input_ids=torch.tensor(ids, device=device), attention_mask=torch.tensor(att, device=device)).logits
            logp = torch.log_softmax(logits.float(), -1).cpu().numpy()
            for b, (x, first) in enumerate(enc):
                words = logp[b, first]
                tags = viterbi(words, lab_list) if len(first) else []
                tags += ["O"] * (len(chunk[b]["tokens"]) - len(tags))
                out.append(tags)
    return out


def cmd_bert(a):
    import torch
    from seqeval.metrics import f1_score
    from transformers import AutoModelForTokenClassification, AutoTokenizer, get_linear_schedule_with_warmup

    torch.manual_seed(a.seed)
    rng = random.Random(a.seed)
    lab_list = labels()
    L = {l: i for i, l in enumerate(lab_list)}
    train = load_jsonl(DATA / "train.jsonl")
    dev = load_jsonl(DATA / "dev.jsonl")
    test = load_jsonl(DATA / "test.jsonl")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForTokenClassification.from_pretrained(
        a.model, num_labels=len(lab_list), id2label=dict(enumerate(lab_list)), label2id=L).to(device)
    head = [p for n, p in model.named_parameters() if "classifier" in n]
    body = [p for n, p in model.named_parameters() if "classifier" not in n]
    opt = torch.optim.AdamW([{"params": body, "lr": a.lr}, {"params": head, "lr": 1e-3}], weight_decay=0.01)
    steps = a.epochs * math.ceil(len(train) / a.bs)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    best, best_state, log = -1.0, None, []
    t0 = time.time()
    for ep in range(a.epochs):
        model.train()
        tot = 0.0
        for _, _, ids, att, lab in batches(train, tok, L, a.bs, True, rng):
            with torch.autocast(device_type=device, dtype=torch.bfloat16, enabled=device == "cuda"):
                loss = model(input_ids=torch.tensor(ids, device=device), attention_mask=torch.tensor(att, device=device),
                             labels=torch.tensor(lab, device=device)).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad()
            tot += loss.item()
        f1 = f1_score([r["tags"] for r in dev], predict_rows(model, tok, dev, lab_list, device))
        log.append({"epoch": ep + 1, "train_loss": round(tot, 2), "dev_f1": round(f1, 4)})
        print(log[-1])
        if f1 > best:
            best, best_state = f1, {k: v.detach().clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)
    pred = predict_rows(model, tok, test, lab_list, device)
    res = evaluate(test, pred, f"L3 {a.name}")
    res.update({"model": a.model, "params_M": round(sum(p.numel() for p in model.parameters()) / 1e6, 1),
                "best_dev_f1": round(best, 4), "train_seconds": round(time.time() - t0, 1), "epochs": log})
    write_result(res, test, pred)
    # the deployed configuration: gazetteer spans first (high precision), model spans fill every gap
    combo = []
    for r, p in zip(test, pred):
        rules = tag_rules(r["tokens"])
        tags = spans_to_bio(len(r["tokens"]), rules)
        covered = {i for s in rules for i in range(s.start, s.end)}
        for s in bio_spans(p):
            if not covered & set(range(*s)):
                tags[s[0]] = p[s[0]]
                for i in range(s[0] + 1, s[1]):
                    tags[i] = p[i]
        combo.append(tags)
    write_result(evaluate(test, combo, f"L3 {a.name} + gazetteer"), test, combo)
    out = MODELS / a.name
    model.save_pretrained(out)
    tok.save_pretrained(out)
    (out / "test_predictions.json").write_text(json.dumps(pred))


def cmd_export(a):
    """int8 ONNX in the layout transformers.js expects: config.json, tokenizer.json, onnx/model_quantized.onnx."""
    import shutil
    import torch
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    src = MODELS / a.name
    dst = ROOT / "web" / "public" / "models" / "bespoke-tagger"
    (dst / "onnx").mkdir(parents=True, exist_ok=True)
    model = AutoModelForTokenClassification.from_pretrained(src).eval()
    tok = AutoTokenizer.from_pretrained(src)
    ex = tok("v neck thoda deep", return_tensors="pt")
    fp32 = dst / "onnx" / "model.onnx"
    with torch.no_grad():
        torch.onnx.export(model, (ex["input_ids"], ex["attention_mask"], ex["token_type_ids"]), str(fp32),
                          input_names=["input_ids", "attention_mask", "token_type_ids"], output_names=["logits"],
                          dynamic_axes={k: {0: "batch", 1: "seq"} for k in ["input_ids", "attention_mask", "token_type_ids", "logits"]},
                          opset_version=17, dynamo=False)
    quantize_dynamic(str(fp32), str(dst / "onnx" / "model_quantized.onnx"), weight_type=QuantType.QInt8)
    fp32.unlink()
    model.config.save_pretrained(dst)
    tok.save_pretrained(dst)
    for f in ("special_tokens_map.json", "vocab.txt"):
        if (dst / f).exists() and f == "vocab.txt":
            pass
    shutil.copy(ROOT / "ontology" / "bespoke.json", ROOT / "web" / "lib" / "ontology.json")
    size = (dst / "onnx" / "model_quantized.onnx").stat().st_size / 1e6
    print(f"exported to {dst} ({size:.1f} MB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["data", "classic", "bert", "export"])
    ap.add_argument("--model", default="microsoft/MiniLM-L12-H384-uncased")
    ap.add_argument("--name", default="minilm")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--seed", type=int, default=SEED)
    a = ap.parse_args()
    {"data": cmd_data, "classic": cmd_classic, "bert": cmd_bert, "export": cmd_export}[a.cmd](a)
