"""Word n-gram language models in pure Python: add-k, interpolated Witten-Bell and interpolated Kneser-Ney.

Kneser-Ney follows Chen and Goodman (1998): lower orders use continuation counts (how many distinct words
precede an n-gram), and the discount depends on the count, D1, D2 and D3+ ("modified"); with `modified=False`
one discount D = n1 / (n1 + 2 n2) is used per order. Probabilities over the closed vocabulary sum to one.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict

BOS, EOS, UNK = "<s>", "</s>", "<unk>"

Gram = tuple[str, ...]


def pad(sentence: list[str], order: int) -> list[str]:
    return [BOS] * (order - 1) + sentence + [EOS]


class NGramLM:
    def __init__(self, order: int = 3, method: str = "kn", k: float = 0.1, modified: bool = True, min_count: int = 1,
                 discount: float | None = None):
        assert method in ("addk", "wb", "kn") and order >= 1
        self.order, self.method, self.k, self.modified, self.min_count = order, method, k, modified, min_count
        self.discount = discount

    def fit(self, sentences: list[list[str]]) -> "NGramLM":
        freq = Counter(w for s in sentences for w in s)
        self.known = {w for w, c in freq.items() if c >= self.min_count}
        self.vocab = sorted(self.known | {EOS, UNK})
        self.V = len(self.vocab)
        raw: list[Counter[Gram]] = [Counter() for _ in range(self.order + 1)]
        for s in sentences:
            p = pad([self._map(w) for w in s], self.order)
            for n in range(1, self.order + 1):
                for i in range(len(p) - n + 1):
                    if p[i + n - 1] == BOS:  # padding is context only, never predicted
                        continue
                    raw[n][tuple(p[i:i + n])] += 1
        # counts used at each order: raw at the top, continuation counts below (KN only)
        self.c: list[Counter[Gram]] = [Counter() for _ in range(self.order + 1)]
        self.c[self.order] = raw[self.order]
        for n in range(1, self.order):
            if self.method == "kn":
                cont: Counter[Gram] = Counter()
                for g in raw[n + 1]:
                    cont[g[1:]] += 1
                for g, v in raw[n].items():
                    if g[0] == BOS:  # no left context exists for an n-gram that starts the sentence
                        cont[g] = v
                self.c[n] = cont
            else:
                self.c[n] = raw[n]
        self.total: list[dict[Gram, int]] = [defaultdict(int) for _ in range(self.order + 1)]
        self.follow: list[dict[Gram, list[int]]] = [defaultdict(lambda: [0, 0, 0]) for _ in range(self.order + 1)]
        for n in range(1, self.order + 1):
            for g, v in self.c[n].items():
                self.total[n][g[:-1]] += v
                self.follow[n][g[:-1]][min(v, 3) - 1] += 1
        self.D = [self._discounts(n) for n in range(self.order + 1)]
        return self

    def _map(self, w: str) -> str:
        return w if w in self.known or w in (BOS, EOS) else UNK

    def _discounts(self, n: int) -> tuple[float, float, float]:
        if n == 0 or self.method != "kn":
            return (0.0, 0.0, 0.0)
        if self.discount is not None:
            return (self.discount,) * 3
        nk = Counter(min(v, 5) for v in self.c[n].values() if v <= 4)
        n1, n2, n3, n4 = (max(nk.get(i, 0), 1) for i in (1, 2, 3, 4))
        y = n1 / (n1 + 2 * n2)
        if not self.modified:
            d = y
            return (d, d, d)
        d = (1 - 2 * y * n2 / n1, 2 - 3 * y * n3 / n2, 3 - 4 * y * n4 / n3)
        return tuple(min(max(x, 0.05), k) for k, x in enumerate(d, 1))  # keep 0 < D_k < k on tiny counts

    def prob(self, word: str, history: tuple[str, ...]) -> float:
        w = self._map(word)
        h = tuple(self._map(x) if x != BOS else x for x in history[-(self.order - 1):]) if self.order > 1 else ()
        return self._p(w, h, len(h) + 1)

    def _p(self, w: str, h: Gram, n: int) -> float:
        if n == 0:
            return 1 / self.V
        lower = lambda: self._p(w, h[1:], n - 1)  # noqa: E731
        tot = self.total[n].get(h, 0)
        count = self.c[n].get(h + (w,), 0)
        if self.method == "addk":
            return (count + self.k) / (tot + self.k * self.V)
        if tot == 0:
            return lower()
        f1, f2, f3 = self.follow[n][h] if h in self.follow[n] else (0, 0, 0)
        if self.method == "wb":
            types = f1 + f2 + f3
            return (count + types * lower()) / (tot + types)
        d1, d2, d3 = self.D[n]
        disc = d1 if count == 1 else d2 if count == 2 else d3
        gamma = (d1 * f1 + d2 * f2 + d3 * f3) / tot
        return max(count - (disc if count else 0), 0) / tot + gamma * lower()

    def log2prob(self, sentence: list[str]) -> float:
        p = pad(sentence, self.order)
        return sum(math.log2(self.prob(p[i], tuple(p[max(0, i - self.order + 1):i]))) for i in range(self.order - 1, len(p)))

    def perplexity(self, sentences: list[list[str]]) -> float:
        n = sum(len(s) + 1 for s in sentences)
        return 2 ** (-sum(self.log2prob(s) for s in sentences) / n)

    def score(self, sentence: list[str]) -> float:
        """Mean log2 probability per token (EOS included): comparable across lengths."""
        return self.log2prob(sentence) / (len(sentence) + 1)
