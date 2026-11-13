"""Does a POS feature help the slot tagger?

The CRF tagger of scripts/ladder.py (word features, with and without its gazetteer feature) is trained on synthetic
requests with and without a spaCy POS feature (own tag and the neighbours' tags), over three synthetic seeds, and
scored on the gold test requests. The POS comes from a free tagger that never saw the ontology, so it is an independent signal.
"""
from __future__ import annotations

import random
import sys

import numpy as np

from ..data import synth_sentence
from .common import ENGINE, SEED, bootstrap_ci, gold_requests, write_result
from .pos import gazetteer_classes, spacy_tags

N_TRAIN = 3000


def features(ws: list[str], pos: list[str] | None, gaz: bool, word_features) -> list[dict]:
    g = gazetteer_classes(ws) if gaz else None
    out = []
    for i in range(len(ws)):
        f = word_features(ws, i)
        if g:
            f["gaz"] = g[i]
        if pos:
            f["pos"] = pos[i]
            f["pos-1"] = pos[i - 1] if i else "<s>"
            f["pos+1"] = pos[i + 1] if i + 1 < len(ws) else "</s>"
        out.append(f)
    return out


def run() -> dict:
    import sklearn_crfsuite
    import spacy
    from seqeval.metrics import f1_score

    sys.path.insert(0, str(ENGINE / "scripts"))
    import ladder

    nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer"])
    _, test = gold_requests()
    tw, tg = [[w for w, _ in r] for r in test], [[t for _, t in r] for r in test]
    tpos = [spacy_tags(ws, nlp) for ws in tw]
    arms = {"words": (False, False), "words_plus_pos": (False, True), "words_plus_gazetteer": (True, False), "words_plus_gazetteer_plus_pos": (True, True)}
    runs: dict[str, list[list[list[str]]]] = {a: [] for a in arms}
    scores: dict[str, list[float]] = {a: [] for a in arms}
    for seed in (SEED, SEED + 1, SEED + 2):
        rng = random.Random(seed)
        train = [synth_sentence(rng) for _ in range(N_TRAIN)]
        trw, trg = [[w for w, _ in r] for r in train], [[t for _, t in r] for r in train]
        trpos = [spacy_tags(ws, nlp) for ws in trw]
        for arm, (gaz, use_pos) in arms.items():
            crf = sklearn_crfsuite.CRF(algorithm="lbfgs", c1=0.05, c2=0.05, max_iterations=80, all_possible_transitions=True)
            crf.fit([features(w, p if use_pos else None, gaz, ladder.word_features) for w, p in zip(trw, trpos)], trg)
            pred = crf.predict([features(w, p if use_pos else None, gaz, ladder.word_features) for w, p in zip(tw, tpos)])
            runs[arm].append(pred)
            scores[arm].append(round(float(f1_score(tg, pred)), 4))
            print(seed, arm, scores[arm][-1], flush=True)
    out: dict = {"task": "slot (NER) F1 of a CRF with and without a POS feature", "n_test_requests": len(test), "train_requests_per_seed": N_TRAIN, "seeds": [SEED, SEED + 1, SEED + 2],
                 "pos_source": "spaCy en_core_web_sm tags of the request tokens (own tag and both neighbours)", "arms": {}}
    for arm in arms:
        out["arms"][arm] = {"f1_per_seed": scores[arm], "f1_mean": round(float(np.mean(scores[arm])), 4), "f1_std": round(float(np.std(scores[arm])), 4)}
    for base, plus in (("words", "words_plus_pos"), ("words_plus_gazetteer", "words_plus_gazetteer_plus_pos")):
        idx = list(range(len(test)))
        diff = lambda ix: float(np.mean([f1_score([tg[i] for i in ix], [runs[plus][s][i] for i in ix]) - f1_score([tg[i] for i in ix], [runs[base][s][i] for i in ix]) for s in range(3)]))  # noqa: E731
        out["arms"][plus]["f1_gain_over_" + base] = {"mean": round(diff(idx), 4), "ci95_bootstrap_over_requests": bootstrap_ci(idx, diff, n=300)}
    write_result("pos_ner", out)
    return out
