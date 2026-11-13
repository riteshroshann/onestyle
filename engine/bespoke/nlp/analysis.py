"""Evaluation beyond one F1: paired significance between ladder rungs, per-type confusion, span error kinds, slices, calibration.

Rungs scored (gold test, 52 requests): L0 gazetteer, HMM, CRF, CRF + gazetteer, and L0 + the morphological fallback.
The fine-tuned MiniLM rungs are not scored here because their weights and predictions are not in the repository.
"""
from __future__ import annotations

from collections import Counter

import numpy as np

from ..lexicon import bio_to_spans, form_index
from . import corpus, ladder_io as L
from .morph import Lemmatiser, bio_with_fallback
from .stats import bootstrap_ci, paired_bootstrap, span_f1

SEED = corpus.SEED
# closed list of Hinglish function and content words, checked by hand against the 82 gold requests
HINGLISH = set("chahiye chaahiye pe par ke ki ka ko ho hai hain aur nahi mat thoda bahut zyada kam tak theek rakho rakhna karna banana mujhe mein wala wali wale "
               "jaisi jaisa se aage peeche neeche upar kuch liye chalega gehra chauda comfortable_x".split())
Span = tuple[int, int, str]


def systems(test: list[dict]) -> dict[str, list[list[str]]]:
    train = L.train_dicts()
    lem = Lemmatiser.build()
    hmm = L.ladder.HMM().fit(train)
    crf = L.cached("crf_nogaz", lambda: L.fit_crf(train, gaz=False))
    crf_gaz = L.cached("crf_gaz", lambda: L.fit_crf(train, gaz=True))
    toks = [r["tokens"] for r in test]
    return {
        "L0 gazetteer": [L.rules_predict(t) for t in toks],
        "L2a HMM": [hmm.predict(t) for t in toks],
        "L2b CRF": crf.predict([L.crf_features(t, False) for t in toks]),
        "L2b CRF + gazetteer": crf_gaz.predict([L.crf_features(t, True) for t in toks]),
        "L0 + morphology (study)": [bio_with_fallback(t, lem) for t in toks],
    }


def to_spans(tags: list[str]) -> set[Span]:
    out, i = set(), 0
    while i < len(tags):
        if tags[i] != "O":
            j = i + 1
            while j < len(tags) and tags[j] == "I-" + tags[i][2:]:
                j += 1
            out.add((i, j, tags[i][2:]))
            i = j
        else:
            i += 1
    return out


def span_errors(gold: list[list[str]], pred: list[list[str]]) -> dict[str, int]:
    c: Counter[str] = Counter()
    for g, p in zip(gold, pred):
        gs, ps = to_spans(g), to_spans(p)
        c["correct"] += len(gs & ps)
        for s in gs - ps:
            overlap = [q for q in ps if q[0] < s[1] and s[0] < q[1]]
            if not overlap:
                c["missed"] += 1
            elif any(q[:2] == s[:2] for q in overlap):
                c["wrong type"] += 1
            elif any(q[2] == s[2] for q in overlap):
                c["boundary"] += 1
            else:
                c["wrong type and boundary"] += 1
        c["spurious"] += sum(1 for q in ps - gs if not any(q[0] < s[1] and s[0] < q[1] for s in gs))
    return dict(c)


def token_confusion(gold: list[list[str]], pred: list[list[str]], tags: list[str]) -> dict:
    classes = ["O"] + tags
    ix = {t: i for i, t in enumerate(classes)}
    m = np.zeros((len(classes), len(classes)), dtype=int)
    strip = lambda t: "O" if t == "O" else t[2:]  # noqa: E731
    for g, p in zip(gold, pred):
        for a, b in zip(g, p):
            m[ix[strip(a)], ix[strip(b)]] += 1
    off = sorted(((int(m[i, j]), classes[i], classes[j]) for i in range(len(classes)) for j in range(len(classes)) if i != j and m[i, j]), reverse=True)
    return {"labels": classes, "matrix": m.tolist(), "largest_confusions": [{"gold": a, "predicted": b, "tokens": n} for n, a, b in off[:10]]}


def slice_f1(rows: list[dict], preds: dict[str, list[list[str]]], mask: list[bool]) -> dict:
    idx = [i for i, m in enumerate(mask) if m]
    out: dict = {"requests": len(idx)}
    for name, pred in preds.items():
        g = [rows[i]["tags"] for i in idx]
        p = [pred[i] for i in idx]
        out[name] = {"f1": round(span_f1(g, p), 4), "ci95": bootstrap_ci(g, p, n=500)} if idx else None
    return out


def span_recall_by_vocab(rows: list[dict], preds: dict[str, list[list[str]]]) -> dict:
    """Recall of gold spans the gazetteer can match by exact lookup, against those it cannot (typos and unlisted forms)."""
    index = form_index()
    known_mask = []
    for r in rows:
        toks = r["tokens"]
        known_mask.append({(s[0], s[1], s[2]): (tuple(toks[s[0]:s[1]]) in index and index[tuple(toks[s[0]:s[1]])][0] == s[2]) for s in to_spans(r["tags"])})
    out: dict = {}
    for name, pred in preds.items():
        hit = {True: [0, 0], False: [0, 0]}
        for r, k, p in zip(rows, known_mask, pred):
            ps = to_spans(p)
            for s, in_vocab in k.items():
                hit[in_vocab][1] += 1
                hit[in_vocab][0] += s in ps
        out[name] = {"in_gazetteer": {"recall": round(hit[True][0] / hit[True][1], 3), "spans": hit[True][1]},
                     "not_in_gazetteer": {"recall": round(hit[False][0] / hit[False][1], 3), "spans": hit[False][1]} if hit[False][1] else None}
    return out


def crf_calibration(crf, rows: list[dict], bins: int = 10) -> dict:
    """Token-level reliability of the CRF's marginal probabilities: does a 0.9 mean right 90% of the time?"""
    marg = crf.predict_marginals([L.crf_features(r["tokens"], True) for r in rows])
    conf, correct = [], []
    for r, m in zip(rows, marg):
        for tag, d in zip(r["tags"], m):
            best = max(d, key=d.get)
            conf.append(d[best])
            correct.append(best == tag)
    conf, correct = np.array(conf), np.array(correct, dtype=float)
    edges = np.linspace(0, 1, bins + 1)
    ece, table = 0.0, []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mk = (conf > lo) & (conf <= hi)
        if mk.any():
            ece += mk.mean() * abs(correct[mk].mean() - conf[mk].mean())
            table.append({"bin": f"{lo:.1f}-{hi:.1f}", "tokens": int(mk.sum()), "mean_confidence": round(float(conf[mk].mean()), 3), "accuracy": round(float(correct[mk].mean()), 3)})
    return {"tokens": int(len(conf)), "token_accuracy": round(float(correct.mean()), 4), "ece": round(float(ece), 4), "reliability": table}


def run() -> dict:
    test = corpus.to_dicts(corpus.gold_test())
    gold = [r["tags"] for r in test]
    preds = systems(test)
    names = list(preds)
    pairs = [("L2b CRF + gazetteer", "L0 gazetteer"), ("L0 gazetteer", "L2a HMM"), ("L2b CRF", "L2a HMM"), ("L2b CRF + gazetteer", "L2b CRF"),
             ("L2b CRF + gazetteer", "L2a HMM"), ("L0 + morphology (study)", "L0 gazetteer")]
    tags = [t for t in __import__("bespoke.lexicon", fromlist=["ontology"]).ontology()["tags"]]
    hing = [any(t in HINGLISH for t in r["tokens"]) for r in test]
    crf_gaz = L.cached("crf_gaz", lambda: None)
    res = {
        "topic": "evaluation metrics", "seed": SEED, "split": "gold test, n=52 requests",
        "scores": {n: {"f1": round(span_f1(gold, p), 4), "ci95": bootstrap_ci(gold, p)} for n, p in preds.items()},
        "paired_bootstrap_f1_difference": {f"{a} minus {b}": paired_bootstrap(gold, preds[a], preds[b]) for a, b in pairs},
        "span_error_kinds": {n: span_errors(gold, p) for n, p in preds.items()},
        "token_confusion": {n: token_confusion(gold, preds[n], tags) for n in ("L0 gazetteer", "L2b CRF + gazetteer")},
        "slices": {"english_only": slice_f1(test, preds, [not h for h in hing]), "hinglish": slice_f1(test, preds, hing),
                   "devanagari": {"requests": 0, "note": "the gold set has no Devanagari request"}},
        "span_recall_by_gazetteer_coverage": span_recall_by_vocab(test, preds),
        "crf_calibration": crf_calibration(crf_gaz, test),
        "caveat": "52 test requests: intervals are wide and most differences between neighbouring rungs are not significant at this size. "
                  "MiniLM rungs (0.812, 0.953 in results/tagging.json) are not re-scored: their weights are not in the repository. "
                  "A request is Hinglish if it contains a word from a hand-checked closed list.",
    }
    corpus.write_json("analysis", res)
    return res
