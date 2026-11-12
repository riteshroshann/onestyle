"""Bridge to scripts/ladder.py: its HMM, CRF features and gold split, imported rather than copied."""
from __future__ import annotations

import sys
import time
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ENGINE / "scripts"))

import ladder  # noqa: E402

from ..lexicon import spans_to_bio, tag_rules  # noqa: E402
from . import corpus  # noqa: E402

Tags = list[str]


def crf_features(tokens: list[str], gaz: bool, groups: frozenset[str] | None = None) -> list[dict]:
    """ladder.word_features, optionally restricted to feature groups (see sequence.GROUPS) plus the gazetteer tag."""
    g = ladder.gazetteer_feats(tokens) if gaz else None
    out = []
    for i in range(len(tokens)):
        f = ladder.word_features(tokens, i)
        if groups is not None:
            f = {k: v for k, v in f.items() if group_of(k) in groups}
        if gaz:
            f["gaz"] = g[i]
        out.append(f)
    return out


def group_of(key: str) -> str:
    if key in ("suf3", "suf2", "pre3"):
        return "affix"
    if key in ("len", "digit", "deva", "hash"):
        return "shape"
    if key == "w":
        return "word"
    return "window"  # w-2, w-1, w1, w2


def fit_crf(rows: list[dict], gaz: bool, c1: float = 0.05, c2: float = 0.05, groups: frozenset[str] | None = None,
            max_iterations: int = 150):
    import sklearn_crfsuite
    crf = sklearn_crfsuite.CRF(algorithm="lbfgs", c1=c1, c2=c2, max_iterations=max_iterations, all_possible_transitions=True)
    crf.fit([crf_features(r["tokens"], gaz, groups) for r in rows], [r["tags"] for r in rows])
    return crf


def rules_predict(tokens: list[str]) -> Tags:
    return spans_to_bio(len(tokens), tag_rules(tokens))


def timed(fn):
    t0 = time.time()
    out = fn()
    return out, round(time.time() - t0, 1)


def train_dicts() -> list[dict]:
    return corpus.to_dicts(corpus.train_rows())


CACHE = ENGINE / "models" / "nlp_cache"  # engine/models is gitignored


def cached(name: str, build):
    """Load a trained model from the cache, or build and store it. Delete the file to retrain."""
    import joblib
    path = CACHE / f"{name}.joblib"
    if path.exists():
        return joblib.load(path)
    obj = build()
    CACHE.mkdir(parents=True, exist_ok=True)
    joblib.dump(obj, path)
    return obj
