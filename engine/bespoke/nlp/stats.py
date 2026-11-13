"""Shared evaluation helpers: strict span F1 over rows, request-level bootstrap and paired bootstrap."""
from __future__ import annotations

import numpy as np
from seqeval.metrics import f1_score

SEED = 13


def span_f1(gold: list[list[str]], pred: list[list[str]]) -> float:
    return float(f1_score(gold, pred)) if any(any(t != "O" for t in g) for g in gold) else 0.0


def bootstrap_ci(gold: list[list[str]], pred: list[list[str]], n: int = 1000, seed: int = SEED) -> list[float]:
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        s = rng.integers(0, len(gold), len(gold))
        vals.append(span_f1([gold[i] for i in s], [pred[i] for i in s]))
    return [round(float(np.percentile(vals, 2.5)), 4), round(float(np.percentile(vals, 97.5)), 4)]


def paired_bootstrap(gold: list[list[str]], a: list[list[str]], b: list[list[str]], n: int = 2000, seed: int = SEED) -> dict:
    """F1(a) - F1(b) on the same resampled requests: mean difference, 95% interval, two-sided p."""
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n):
        s = rng.integers(0, len(gold), len(gold))
        g = [gold[i] for i in s]
        diffs.append(span_f1(g, [a[i] for i in s]) - span_f1(g, [b[i] for i in s]))
    d = np.array(diffs)
    p = 2 * min((d <= 0).mean(), (d >= 0).mean())
    return {"delta": round(span_f1(gold, a) - span_f1(gold, b), 4),
            "ci95": [round(float(np.percentile(d, 2.5)), 4), round(float(np.percentile(d, 97.5)), 4)],
            "p": round(float(max(p, 1 / n)), 4), "resamples": n}


def bootstrap_mean_ci(values: np.ndarray, n: int = 2000, seed: int = SEED) -> list[float]:
    rng = np.random.default_rng(seed)
    means = [values[rng.integers(0, len(values), len(values))].mean() for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4), round(float(np.percentile(means, 97.5)), 4)]
