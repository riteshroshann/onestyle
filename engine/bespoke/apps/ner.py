"""Named-entity recognition, reported per entity type for the deployed configurations.

Three systems on the held-out gold requests: the gazetteer, the int8 ONNX tagger alone, and the browser path
(gazetteer spans first, tagger spans only where the gazetteer found nothing, as in web/lib/models.ts).
Entities are exact-match (start, end, type) spans, the seqeval convention.
"""
from __future__ import annotations

from collections import Counter

import numpy as np

from ..decode import viterbi
from ..lexicon import bio_to_spans, labels, spans_to_bio, tag_rules
from .common import TAGGER_DIR, bootstrap_ci, gold_requests, prf, write_result

MAX_WORDPIECES = 127  # same cut-off as the browser path


def log_softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(-1, keepdims=True)
    return x - np.log(np.exp(x).sum(-1, keepdims=True))


class OnnxTagger:
    """The exact artefact the browser loads: int8 ONNX plus its tokenizer, decoded with constrained Viterbi."""

    def __init__(self) -> None:
        import onnxruntime as ort
        from transformers import AutoTokenizer

        self.tok = AutoTokenizer.from_pretrained(str(TAGGER_DIR))
        self.session = ort.InferenceSession(str(TAGGER_DIR / "onnx" / "model_quantized.onnx"), providers=["CPUExecutionProvider"])
        self.labels = labels()

    def tag(self, tokens: list[str]) -> list[str]:
        ids = [self.tok.cls_token_id]
        first: list[int] = []
        for w in tokens:
            sub = self.tok(w, add_special_tokens=False)["input_ids"] or [self.tok.unk_token_id]
            if len(ids) + len(sub) >= MAX_WORDPIECES:
                break
            first.append(len(ids))
            ids += sub
        ids.append(self.tok.sep_token_id)
        x = np.array([ids], dtype=np.int64)
        logits = self.session.run(None, {"input_ids": x, "attention_mask": np.ones_like(x), "token_type_ids": np.zeros_like(x)})[0][0]
        tags = viterbi(log_softmax(logits)[first], self.labels) if first else []
        return tags + ["O"] * (len(tokens) - len(tags))


def browser_merge(tokens: list[str], model_tags: list[str]) -> list[str]:
    """Gazetteer spans win; a model span is kept only if it overlaps none of them."""
    rules = tag_rules(tokens)
    tags = spans_to_bio(len(tokens), rules)
    covered = {i for s in rules for i in range(s.start, s.end)}
    for s in bio_to_spans(tokens, model_tags):
        if not covered & set(range(s.start, s.end)):
            tags[s.start:s.end] = model_tags[s.start:s.end]
    return tags


def entities(tags: list[str]) -> set[tuple[int, int, str]]:
    out, i = set(), 0
    while i < len(tags):
        if tags[i] != "O":
            t, j = tags[i][2:], i + 1
            while j < len(tags) and tags[j] == f"I-{t}":
                j += 1
            out.add((i, j, t))
            i = j
        else:
            i += 1
    return out


def score(gold: list[list[str]], pred: list[list[str]]) -> dict:
    per: dict[str, Counter] = {}
    for g, p in zip(gold, pred):
        ge, pe = entities(g), entities(p)
        for e in ge & pe:
            per.setdefault(e[2], Counter())["tp"] += 1
        for e in pe - ge:
            per.setdefault(e[2], Counter())["fp"] += 1
        for e in ge - pe:
            per.setdefault(e[2], Counter())["fn"] += 1
    total: Counter = Counter()
    for c in per.values():
        total.update(c)
    return {"micro": prf(total["tp"], total["fp"], total["fn"]),
            "per_type": {t: {**prf(c["tp"], c["fp"], c["fn"]), "support": c["tp"] + c["fn"]} for t, c in sorted(per.items())}}


def confusion(gold: list[list[str]], pred: list[list[str]]) -> dict[str, dict[str, int]]:
    """Token-level entity type confusion, B- and I- merged; 'O' is no entity. Only off-diagonal cells."""
    cells: Counter = Counter()
    for g, p in zip(gold, pred):
        for a, b in zip(g, p):
            a, b = a[2:] or "O", b[2:] or "O"
            if a != b:
                cells[(a, b)] += 1
    out: dict[str, dict[str, int]] = {}
    for (a, b), n in sorted(cells.items(), key=lambda kv: -kv[1]):
        out.setdefault(a, {})[b] = n
    return out


def run() -> dict:
    dev, test = gold_requests()
    model = OnnxTagger()
    result: dict = {"task": "NER, exact-match entities, 21 types", "seed": 13, "interval": "bootstrap over requests, 1000 resamples",
                    "model": "web/public/models/bespoke-tagger (int8 ONNX, as served to the browser)", "splits": {}}
    for split, rows in (("dev", dev), ("test", test)):
        gold = [[t for _, t in r] for r in rows]
        toks = [[w for w, _ in r] for r in rows]
        model_tags = [model.tag(t) for t in toks]
        systems = {"gazetteer": [spans_to_bio(len(t), tag_rules(t)) for t in toks], "model_only": model_tags,
                   "browser_path": [browser_merge(t, m) for t, m in zip(toks, model_tags)]}
        out: dict = {"n_requests": len(rows), "n_entities": sum(len(entities(g)) for g in gold), "systems": {}}
        for name, pred in systems.items():
            s = score(gold, pred)
            pairs = list(zip(gold, pred))
            s["f1_ci95"] = bootstrap_ci(pairs, lambda ps: score([a for a, _ in ps], [b for _, b in ps])["micro"]["f1"])
            s["confusion"] = confusion(gold, pred)
            out["systems"][name] = s
        result["splits"][split] = out
    write_result("ner", result)
    return result
