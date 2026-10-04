"""BIO-constrained Viterbi over per-word label scores.

A softmax tagger can emit I-FIT after O. Decoding with hard transition constraints
(I-X only after B-X or I-X) gives the structural guarantee a CRF's transition matrix learns,
at zero training cost. The same function is ported to web/lib/engine/decode.ts.
"""
from __future__ import annotations

import numpy as np


def allowed(prev: str, cur: str) -> bool:
    if cur.startswith("I-"):
        return prev in (f"B-{cur[2:]}", cur)
    return True


def viterbi(logp: np.ndarray, labels: list[str]) -> list[str]:
    """logp: [n_words, n_labels] log-probabilities."""
    n, k = logp.shape
    if n == 0:
        return []
    neg = -1e9
    trans = np.array([[0.0 if allowed(a, b) else neg for b in labels] for a in labels])
    start = np.array([neg if l.startswith("I-") else 0.0 for l in labels])
    score = start + logp[0]
    back = np.zeros((n, k), dtype=int)
    for i in range(1, n):
        cand = score[:, None] + trans
        back[i] = cand.argmax(0)
        score = cand.max(0) + logp[i]
    best = [int(score.argmax())]
    for i in range(n - 1, 0, -1):
        best.append(int(back[i][best[-1]]))
    return [labels[j] for j in reversed(best)]
