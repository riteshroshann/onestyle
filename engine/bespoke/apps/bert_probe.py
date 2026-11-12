"""BERT: a look inside the deployed MiniLM tagger.

The probe runs on the int8 ONNX graph the browser ships, with the per-layer outputs and attention softmaxes
added as extra graph outputs, so it describes the deployed weights, not a retrained copy.

1. Layer-wise probing. A linear classifier is trained on each layer's first-subword vector to predict the entity
   type of a word (22 classes with O), on synthetic requests, and scored on the gold test requests. A control task
   (each word type gets a random label, Hewitt and Liang 2019) gives the selectivity: how much of the accuracy
   is the representation rather than the probe memorising words.
2. Attention. For words that carry a value (fit, length, dimension, sleeve style), how much attention goes to the
   part and location cue words in the same request, against the share uniform attention would give them.
"""
from __future__ import annotations

import random

import numpy as np
import onnx
import onnxruntime as ort

from ..data import synth_sentence
from .common import SEED, TAGGER_DIR, gold_requests, write_result

N_LAYERS = 12
N_TRAIN_SENTENCES = 1500
VALUE_TAGS = {"FIT", "LENGTH", "DIM", "SLEEVE", "SILHOUETTE", "NECKLINE"}
CUE_TAGS = {"PART", "LOC"}


class Probe:
    def __init__(self) -> None:
        from transformers import AutoTokenizer

        model = onnx.load(str(TAGGER_DIR / "onnx" / "model_quantized.onnx"))
        self.layer_outputs = ["/bert/embeddings/LayerNorm/LayerNormalization_output_0"] + [f"/bert/encoder/layer.{i}/output/LayerNorm/LayerNormalization_output_0" for i in range(N_LAYERS)]
        self.attn_outputs = [f"/bert/encoder/layer.{i}/attention/self/Softmax_output_0" for i in range(N_LAYERS)]
        for name in self.layer_outputs + self.attn_outputs:
            model.graph.output.append(onnx.helper.make_empty_tensor_value_info(name))
        self.session = ort.InferenceSession(model.SerializeToString(), providers=["CPUExecutionProvider"])
        self.tok = AutoTokenizer.from_pretrained(str(TAGGER_DIR))

    def run(self, tokens: list[str]) -> tuple[np.ndarray, np.ndarray, list[tuple[int, int]]]:
        """(hidden [13, words, 384], attention [12 layers, 12 heads, seq, seq], subword span of each word)."""
        ids, spans = [self.tok.cls_token_id], []
        for w in tokens:
            sub = self.tok(w, add_special_tokens=False)["input_ids"] or [self.tok.unk_token_id]
            spans.append((len(ids), len(ids) + len(sub)))
            ids += sub
        ids.append(self.tok.sep_token_id)
        x = np.array([ids], dtype=np.int64)
        outs = self.session.run(self.layer_outputs + self.attn_outputs, {"input_ids": x, "attention_mask": np.ones_like(x), "token_type_ids": np.zeros_like(x)})
        first = [s for s, _ in spans]
        hidden = np.stack([o[0][first] for o in outs[:N_LAYERS + 1]])
        attn = np.stack([o[0] for o in outs[N_LAYERS + 1:]])
        return hidden, attn, spans


def entity_type(tag: str) -> str:
    return tag[2:] if tag != "O" else "O"


def control_labels(words: list[str], labels: list[str], rng: random.Random) -> dict[str, str]:
    """A random type for every word type, drawn from the label distribution: only memorisation can solve it."""
    table: dict[str, str] = {}
    for w in sorted(set(words)):
        table[w] = rng.choice(labels)
    return table


def fit_probe(X: np.ndarray, y: list[str], Xt: np.ndarray, yt: list[str]) -> tuple[float, float]:
    """Linear softmax probe on standardised vectors, full-batch AdamW; returns (accuracy, macro F1 over the non-O types)."""
    import torch

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(SEED)
    classes = sorted(set(y))
    mu, sd = X.mean(0), X.std(0) + 1e-6
    x = torch.tensor((X - mu) / sd, dtype=torch.float32, device=dev)
    xt = torch.tensor((Xt - mu) / sd, dtype=torch.float32, device=dev)
    t = torch.tensor([classes.index(c) for c in y], device=dev)
    lin = torch.nn.Linear(x.shape[1], len(classes)).to(dev)
    opt = torch.optim.AdamW(lin.parameters(), lr=0.02, weight_decay=1e-3)
    for _ in range(300):
        opt.zero_grad()
        torch.nn.functional.cross_entropy(lin(x), t).backward()
        opt.step()
    pred = [classes[i] for i in lin(xt).argmax(-1).tolist()]
    f1s = []
    for c in sorted(set(yt) - {"O"}):
        tp = sum(a == c and b == c for a, b in zip(yt, pred))
        fp = sum(a != c and b == c for a, b in zip(yt, pred))
        fn = sum(a == c and b != c for a, b in zip(yt, pred))
        f1s.append(2 * tp / (2 * tp + fp + fn) if tp else 0.0)
    return float(np.mean([a == b for a, b in zip(yt, pred)])), float(np.mean(f1s))


def attention_lift(probe: Probe, rows: list[list[tuple[str, str]]]) -> dict:
    """Observed attention mass from value words onto cue words, divided by the uniform share, per layer and head."""
    obs = np.zeros((N_LAYERS, 12))
    exp = np.zeros((N_LAYERS, 12))
    n_pairs = 0
    for row in rows:
        toks, tags = [w for w, _ in row], [entity_type(t) for _, t in row]
        q = [i for i, t in enumerate(tags) if t in VALUE_TAGS]
        cues = [i for i, t in enumerate(tags) if t in CUE_TAGS]
        if not q or not cues:
            continue
        _, attn, spans = probe.run(toks)
        key_pos = [p for i in cues for p in range(*spans[i])]
        share = len(key_pos) / attn.shape[-1]
        for i in q:
            obs += attn[:, :, spans[i][0], :][:, :, key_pos].sum(-1)
            exp += share
            n_pairs += 1
    lift = obs / exp
    top = sorted(((float(lift[l, h]), l, h) for l in range(N_LAYERS) for h in range(12)), reverse=True)[:5]
    return {"n_value_words": n_pairs, "mean_lift_by_layer": [round(float(v), 3) for v in lift.mean(1)],
            "top_heads": [{"layer": l, "head": h, "lift": round(v, 3), "mean_attention_on_cues": round(float(obs[l, h] / n_pairs), 3)} for v, l, h in top]}


def run() -> dict:
    probe = Probe()
    rng = random.Random(SEED)
    train_rows = [synth_sentence(rng) for _ in range(N_TRAIN_SENTENCES)]
    _, test_rows = gold_requests()

    def collect(rows: list[list[tuple[str, str]]]):
        H, words, labels = [], [], []
        for row in rows:
            toks = [w for w, _ in row]
            hidden, _, _ = probe.run(toks)
            H.append(hidden)
            words += toks
            labels += [entity_type(t) for _, t in row]
        return np.concatenate(H, axis=1), words, labels

    Xtr, wtr, ytr = collect(train_rows)
    Xte, wte, yte = collect(test_rows)
    ctrl = control_labels(wtr + wte, sorted(set(ytr)), random.Random(SEED))
    ctr, cte = [ctrl[w] for w in wtr], [ctrl[w] for w in wte]
    layers = []
    for layer in range(N_LAYERS + 1):
        acc, f1 = fit_probe(Xtr[layer], ytr, Xte[layer], yte)
        cacc, _ = fit_probe(Xtr[layer], ctr, Xte[layer], cte)
        layers.append({"layer": layer, "accuracy": round(acc, 4), "macro_f1_over_types": round(f1, 4), "control_accuracy": round(cacc, 4), "selectivity": round(acc - cacc, 4)})
        print(layers[-1])
    out = {"task": "layer-wise probing and attention of the deployed MiniLM tagger (int8 ONNX)", "seed": SEED, "n_probe_train_words": len(wtr), "n_probe_test_words": len(wte),
           "n_types": len(set(ytr)), "probe": "linear softmax on standardised first-subword vectors (300 AdamW steps); train on synthetic requests, test on the 52 gold test requests",
           "majority_class_accuracy": round(max(yte.count(t) for t in set(yte)) / len(yte), 4), "layers": layers,
           "attention_value_to_cue": attention_lift(probe, [r for r in gold_requests()[0] + test_rows])}
    write_result("bert_probe", out)
    return out
