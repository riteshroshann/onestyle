"""Sequence-to-sequence: a request in, a linearised spec out.

A small encoder-decoder (t5-small) is fine-tuned on synthetic requests to write the updates the binder would
extract ("set sleeve.fit=loose ; add colour=blue"), with the targets produced by the shipped TypeScript binder
on exact spans. It is then scored on the hand-annotated gold of data/gold/binding.jsonl against the deployed
pipeline (gazetteer, then binder), with greedy decoding and with constrained decoding: a trie of the triples seen
in training, so every output is a well-formed, known update. Intensity is left out of the targets (T5's
vocabulary has no "~") and of the scoring key.
"""
from __future__ import annotations

import json
import random
import subprocess
from collections import Counter

import numpy as np

from ..data import synth_sentence
from ..lexicon import bio_to_spans, tokenize
from .common import GOLD, ROOT, SEED, bootstrap_ci, read_jsonl, write_result

MODEL = "t5-small"
N_TRAIN = 6000
EPOCHS = 6
SEP = ";"


def node(items: list[dict]) -> list[dict]:
    out = subprocess.run(["node", "--experimental-strip-types", "scripts/eval-bridge.mjs"], cwd=ROOT / "web", input=json.dumps({"items": items}),
                         capture_output=True, text=True, check=True, encoding="utf8")
    return json.loads(out.stdout)


def triple_text(t: dict) -> str:
    base = f"{t['op']} {t['slot']}={t['value']}"
    return f"{base} @{t['ref']}" if t.get("ref") else base


def target_of(triples: list[dict]) -> list[str]:
    return sorted({triple_text(t) for t in triples})


def synthetic_pairs(n: int) -> list[tuple[str, list[str]]]:
    rng = random.Random(SEED)
    rows = [synth_sentence(rng) for _ in range(n)]
    items = []
    for r in rows:
        toks = [w for w, _ in r]
        spans = bio_to_spans(toks, [t for _, t in r])
        items.append({"tokens": toks, "spans": [{"start": s.start, "end": s.end, "tag": s.tag, "value": s.value} for s in spans]})
    res = node(items)
    return [(" ".join(it["tokens"]), target_of(o["triples"])) for it, o in zip(items, res)]


class Trie:
    def __init__(self, seqs: list[list[int]]) -> None:
        self.root: dict = {}
        for s in seqs:
            node_ = self.root
            for t in s:
                node_ = node_.setdefault(t, {})
            node_["end"] = {}

    def next(self, prefix: list[int]) -> tuple[list[int], bool]:
        node_ = self.root
        for t in prefix:
            node_ = node_.get(t)
            if node_ is None:
                return [], False
        return [k for k in node_ if k != "end"], "end" in node_


def run() -> dict:
    import torch
    from transformers import AutoTokenizer, T5ForConditionalGeneration, get_linear_schedule_with_warmup

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(SEED)
    pairs = synthetic_pairs(N_TRAIN)
    tok = AutoTokenizer.from_pretrained(MODEL)
    sep = tok(SEP, add_special_tokens=False).input_ids[-1]
    enc_t = lambda t: tok(t, add_special_tokens=False).input_ids  # noqa: E731
    vocab = sorted({t for _, ts in pairs for t in ts})
    for t in vocab:
        assert tok.decode(enc_t(t)) == t, f"T5 cannot round-trip {t!r}"
    trie = Trie([enc_t(t) for t in vocab])

    def labels_of(ts: list[str]) -> list[int]:
        ids: list[int] = []
        for k, t in enumerate(ts):
            ids += ([sep] if k else []) + enc_t(t)
        return ids + [tok.eos_token_id]

    model = T5ForConditionalGeneration.from_pretrained(MODEL).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=5e-4, weight_decay=0.01)
    steps = EPOCHS * -(-len(pairs) // 32)
    sched = get_linear_schedule_with_warmup(opt, int(0.05 * steps), steps)
    rng = random.Random(SEED)
    model.train()
    for ep in range(EPOCHS):
        rng.shuffle(pairs)
        total = 0.0
        for i in range(0, len(pairs), 32):
            b = pairs[i:i + 32]
            x = tok([s for s, _ in b], return_tensors="pt", padding=True, truncation=True, max_length=64).to(dev)
            y = [labels_of(ts) for _, ts in b]
            m = max(map(len, y))
            lab = torch.tensor([r + [-100] * (m - len(r)) for r in y], device=dev)
            loss = model(**x, labels=lab).loss
            loss.backward()
            opt.step(); sched.step(); opt.zero_grad()
            total += loss.item()
        print("epoch", ep + 1, round(total, 2), flush=True)
    model.eval()

    def constrained(batch_id: int, ids: torch.Tensor) -> list[int]:
        seq = ids.tolist()[1:]  # drop the decoder start token
        cur: list[int] = []
        for t in seq:
            if t == sep:
                cur = []
            else:
                cur.append(t)
        nxt, complete = trie.next(cur)
        allowed = list(nxt) + ([sep, tok.eos_token_id] if complete else [])
        return allowed or [tok.eos_token_id]

    def generate(texts: list[str], use_trie: bool) -> list[list[str]]:
        out: list[list[str]] = []
        for i in range(0, len(texts), 16):
            x = tok(texts[i:i + 16], return_tensors="pt", padding=True, truncation=True, max_length=64).to(dev)
            with torch.no_grad():
                g = model.generate(**x, max_new_tokens=120, num_beams=1, do_sample=False, prefix_allowed_tokens_fn=constrained if use_trie else None)
            for row in g.tolist():
                ids = [t for t in row[1:] if t not in (tok.eos_token_id, tok.pad_token_id)]
                parts, cur = [], []
                for t in ids + [sep]:
                    if t == sep:
                        if cur:
                            parts.append(tok.decode(cur))
                        cur = []
                    else:
                        cur.append(t)
                out.append(sorted(set(parts)))
        return out

    def gold_keys(row: dict) -> set[str]:
        keys = set()
        for t in row["triples"]:
            op, rest = t.split(" ", 1)
            rest = rest.split(" ~")[0]
            keys.add(f"{op} {rest}")
        return keys

    rows = [r for r in read_jsonl(GOLD / "binding.jsonl") if r["split"] in ("test", "requests")]
    texts = [" ".join(tokenize(r["text"])) for r in rows]
    gold = [gold_keys(r) for r in rows]
    deployed = [set(target_of(o["triples"][0])) for o in node([{"messages": [r["text"]]} for r in rows])]
    systems = {"deployed_gazetteer_plus_binder": deployed, "t5_small_greedy": [set(p) for p in generate(texts, False)], "t5_small_constrained": [set(p) for p in generate(texts, True)]}

    def prf(ix: list[int], pred: list[set[str]]) -> dict:
        tp = sum(len(gold[i] & pred[i]) for i in ix)
        np_, ng = sum(len(pred[i]) for i in ix), sum(len(gold[i]) for i in ix)
        p, r = tp / np_ if np_ else 0.0, tp / ng
        return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(2 * p * r / (p + r), 4) if p + r else 0.0}

    out: dict = {"task": "request to linearised spec", "model": MODEL, "train_requests": N_TRAIN, "epochs": EPOCHS, "seed": SEED, "teacher": "binder on exact spans of synthetic requests",
                 "n_gold_requests": len(rows), "interval": "bootstrap over requests, 1000 resamples", "valid_triples_in_trie": len(vocab), "systems": {}}
    idx = list(range(len(rows)))
    for name, pred in systems.items():
        out["systems"][name] = {**prf(idx, pred), "f1_ci95": bootstrap_ci(idx, lambda ix: prf(list(ix), pred)["f1"]),
                                "exact_match_requests": round(float(np.mean([gold[i] == pred[i] for i in idx])), 4)}
    c = Counter(name for name, pred in systems.items() for i in idx if not pred[i] <= set(vocab) and name != "deployed_gazetteer_plus_binder")
    out["outputs_with_a_triple_outside_the_training_vocabulary"] = dict(c)
    out["examples"] = [{"text": texts[i], "gold": sorted(gold[i]), **{k: sorted(v[i]) for k, v in systems.items()}} for i in (0, 5, 12, 30)]
    write_result("seq2seq", out)
    return out
