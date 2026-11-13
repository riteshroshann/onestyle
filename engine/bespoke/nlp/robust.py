"""Robustness to the variation Hinglish users produce: spelling noise, romanisation variants, elongation.

Each perturbation rewrites tokens of the 52 gold test requests and keeps the labels, so the score drop is
attributable to the rewrite. Systems: gazetteer (L0), gazetteer + morphological fallback, CRF + gazetteer feature.
The fine-tuned MiniLM is not scored here: its weights are not in the repository.
"""
from __future__ import annotations

import random
from typing import Callable

from ..data import _noise
from ..lexicon import normalise
from . import corpus, ladder_io as L
from .morph import Lemmatiser, bio_with_fallback
from .stats import bootstrap_ci, span_f1

ROMAN_RULES = [("ee", "i"), ("aa", "a"), ("oo", "u"), ("ey", "e"), ("ay", "e"), ("kh", "k"), ("ph", "f"), ("ai", "ay"), ("i", "ee"), ("a", "aa"), ("u", "oo")]
Rewrite = Callable[[str, random.Random], str]


def noise(p: float) -> Rewrite:
    return lambda w, rng: _noise(w, rng) if rng.random() < p else w


def romanise(w: str, rng: random.Random) -> str:
    rules = [(a, b) for a, b in ROMAN_RULES if a in w and len(w) >= 4]
    if not rules or rng.random() > 0.5:
        return w
    a, b = rng.choice(rules)
    return w.replace(a, b, 1)


def elongate(w: str, rng: random.Random) -> str:
    vowels = [i for i, c in enumerate(w) if c in "aeiou"]
    if len(w) < 4 or not vowels or rng.random() > 0.5:
        return w
    i = rng.choice(vowels)
    return normalise(w[:i] + w[i] * 3 + w[i + 1:])  # what the product would see after its own normaliser


def perturb(rows: list[corpus.Row], fn: Rewrite, seed: int = corpus.SEED) -> list[corpus.Row]:
    rng = random.Random(seed)
    return [[(fn(t, rng) if tag != "O" else t, tag) for t, tag in r] for r in rows]


def systems() -> dict[str, Callable[[list[str]], list[str]]]:
    lem = Lemmatiser.build()
    crf = L.cached("crf_gaz", lambda: L.fit_crf(L.train_dicts(), gaz=True))
    return {
        "L0 gazetteer": L.rules_predict,
        "L0 + morphology": lambda toks: bio_with_fallback(toks, lem),
        "CRF + gazetteer": lambda toks: crf.predict_single(L.crf_features(toks, True)),
    }


def run() -> dict:
    test = corpus.gold_test()
    perturbations: dict[str, Rewrite] = {f"char noise {int(p * 100)}%": noise(p) for p in (0.0, 0.1, 0.2, 0.3)}
    perturbations["romanisation variants"] = romanise
    perturbations["vowel elongation"] = elongate
    sys_fns = systems()
    table: dict = {}
    for pname, fn in perturbations.items():
        rows = perturb(test, fn)
        gold = [[g for _, g in r] for r in rows]
        changed = sum(a != b for ra, rb in zip(test, rows) for (a, _), (b, _) in zip(ra, rb))
        table[pname] = {"tokens_changed": changed}
        for sname, predict in sys_fns.items():
            pred = [predict([t for t, _ in r]) for r in rows]
            table[pname][sname] = {"f1": round(span_f1(gold, pred), 4), "ci95": bootstrap_ci(gold, pred, n=500)}
    res = {"topic": "other NLP problems: normalisation, spelling, transliteration robustness", "seed": corpus.SEED,
           "split": "gold test, n=52 requests, entity tokens rewritten, labels kept", "table": table,
           "caveat": "Perturbations are programmatic rewrites, not collected user text. Code-mixing is not varied: the 52 requests are as written. "
                     "The product's normaliser collapses a letter run to two letters, so elongating a single-letter vowel (kurta to kurtaaa) leaves 'kurtaa': "
                     "a gap the morphological fallback closes. MiniLM is not scored (weights not in the repo)."}
    corpus.write_json("robustness", res)
    return res
