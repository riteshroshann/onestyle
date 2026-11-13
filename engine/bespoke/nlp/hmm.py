"""Hidden Markov Model tagger with per-tag emission normalisation, Viterbi and Baum-Welch, in numpy.

Emissions are modelled as p(w | t) = (c(t, w) + k) / (N_t + k (V + 1)): each tag's distribution sums to one over
the word table. An unseen word backs off to its 3-letter suffix table, then its 2-letter suffix table, then a flat
unknown mass. Transitions are add-k smoothed. Baum-Welch re-estimates all tables from expected counts, which lets
unlabelled sentences sharpen a model trained on few labelled ones.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ..lexicon import labels


def viterbi_log(start: np.ndarray, trans: np.ndarray, emit: np.ndarray) -> list[int]:
    """Best state path. start [K], trans [K, K] (from, to), emit [T, K], all log-probabilities."""
    t_len, k = emit.shape
    score = start + emit[0]
    back = np.zeros((t_len, k), dtype=int)
    for t in range(1, t_len):
        cand = score[:, None] + trans
        back[t] = cand.argmax(0)
        score = cand.max(0) + emit[t]
    path = [int(score.argmax())]
    for t in range(t_len - 1, 0, -1):
        path.append(int(back[t][path[-1]]))
    return path[::-1]


def forward_backward(start: np.ndarray, trans: np.ndarray, emit: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    """Posterior state marginals gamma [T, K], expected transitions xi [K, K] summed over positions, and log-likelihood.

    Inputs are log-probabilities; the recursion runs in probability space with per-step scaling, which is
    both stable and an order of magnitude faster than log-sum-exp at K = 43.
    """
    t_len, k = emit.shape
    a = np.exp(trans)
    b = np.exp(emit - emit.max(1, keepdims=True))
    shift = emit.max(1).sum()
    alpha = np.zeros((t_len, k))
    c = np.zeros(t_len)
    alpha[0] = np.exp(start) * b[0]
    c[0] = alpha[0].sum()
    alpha[0] /= c[0]
    for t in range(1, t_len):
        alpha[t] = (alpha[t - 1] @ a) * b[t]
        c[t] = alpha[t].sum()
        alpha[t] /= c[t]
    beta = np.ones((t_len, k))
    for t in range(t_len - 2, -1, -1):
        beta[t] = (a @ (b[t + 1] * beta[t + 1])) / c[t + 1]
    gamma = alpha * beta
    xi = a * (alpha[:-1].T @ (b[1:] * beta[1:] / c[1:, None])) if t_len > 1 else np.zeros((k, k))
    return gamma, xi, float(np.log(c).sum() + shift)


class HMM:
    def __init__(self, k_trans: float = 0.1, k_emit: float = 0.1):
        self.k_trans, self.k_emit = k_trans, k_emit
        self.labels = labels()
        self.L = {l: i for i, l in enumerate(self.labels)}
        self.K = len(self.labels)

    def _keys(self, w: str) -> tuple[str, str, str]:
        return w, "s3:" + w[-3:], "s2:" + w[-2:]

    def fit(self, rows: list[dict]) -> "HMM":
        K = self.K
        self.trans_c, self.start_c = np.zeros((K, K)), np.zeros(K)
        self.emit_c: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(K))
        for r in rows:
            prev = None
            for w, t in zip(r["tokens"], r["tags"]):
                j = self.L[t]
                for key in self._keys(w):
                    self.emit_c[key][j] += 1
                if prev is None:
                    self.start_c[j] += 1
                else:
                    self.trans_c[prev, j] += 1
                prev = j
        self._finalise(self.emit_c, self.trans_c, self.start_c)
        return self

    def _finalise(self, emit_c, trans_c, start_c) -> None:
        k, kt = self.k_emit, self.k_trans
        self.trans = np.log((trans_c + kt) / (trans_c + kt).sum(1, keepdims=True))
        self.start = np.log((start_c + kt) / (start_c + kt).sum())
        # N_t and table sizes are kept per table, so every tag's emission distribution is normalised on its own
        self.table_n: dict[str, np.ndarray] = {}
        self.table_v: dict[str, int] = {}
        for prefix in ("", "s3:", "s2:"):
            items = [v for key, v in emit_c.items() if (key.startswith(prefix) if prefix else not key.startswith(("s3:", "s2:")))]
            self.table_n[prefix] = np.sum(items, axis=0) if items else np.zeros(self.K)
            self.table_v[prefix] = len(items)
        self.emit = {key: self._norm(key, v) for key, v in emit_c.items()}

    def _norm(self, key: str, counts: np.ndarray) -> np.ndarray:
        prefix = key[:3] if key.startswith(("s3:", "s2:")) else ""
        return np.log((counts + self.k_emit) / (self.table_n[prefix] + self.k_emit * (self.table_v[prefix] + 1)))

    def emission(self, w: str) -> np.ndarray:
        for key in self._keys(w):
            if key in self.emit:
                return self.emit[key]
        return np.log(self.k_emit / (self.table_n[""] + self.k_emit * (self.table_v[""] + 1)))

    def predict(self, tokens: list[str]) -> list[str]:
        if not tokens:
            return []
        e = np.array([self.emission(w) for w in tokens])
        return [self.labels[j] for j in viterbi_log(self.start, self.trans, e)]

    def baum_welch(self, sentences: list[list[str]], iterations: int = 3, weight: float = 1.0, on_iteration=None) -> list[float]:
        """Semi-supervised EM: labelled counts plus `weight` times expected counts from unlabelled sentences."""
        lls = []
        for it in range(iterations):
            trans_c, start_c = self.trans_c.copy(), self.start_c.copy()
            emit_c: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(self.K))
            for key, v in self.emit_c.items():
                emit_c[key] += v
            total = 0.0
            for toks in sentences:
                if not toks:
                    continue
                e = np.array([self.emission(w) for w in toks])
                gamma, xi, ll = forward_backward(self.start, self.trans, e)
                total += ll
                start_c += weight * gamma[0]
                trans_c += weight * xi
                for w, g in zip(toks, gamma):
                    for key in self._keys(w):
                        emit_c[key] += weight * g
            self._finalise(emit_c, trans_c, start_c)
            lls.append(total / len(sentences))
            if on_iteration:
                on_iteration(it + 1)
        return lls

    def invalid_transition_mass(self) -> float:
        """Average probability, over tags, of moving to an I-X tag that does not continue X (should be 0 for a BIO tagger)."""
        bad = np.array([[b.startswith("I-") and a not in (f"B-{b[2:]}", b) for b in self.labels] for a in self.labels])
        return float((np.exp(self.trans) * bad).sum(1).mean())
