"""Text as vectors, from scratch: one-hot, bag-of-words dictionary, TF-IDF. numpy and scipy only.

tests/test_nlp_vectors.py checks each against scikit-learn on a small corpus.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp

from ..lexicon import form_index, tag_rules


@dataclass
class Vocabulary:
    """Token to column. Columns are alphabetical, so they line up with scikit-learn's."""
    index: dict[str, int]

    @classmethod
    def build(cls, docs: list[list[str]], min_df: int = 1, max_features: int | None = None) -> "Vocabulary":
        df: Counter[str] = Counter()
        for d in docs:
            df.update(set(d))
        keep = [t for t, c in df.items() if c >= min_df]
        if max_features and len(keep) > max_features:
            tf: Counter[str] = Counter(t for d in docs for t in d)
            keep = sorted(keep, key=lambda t: (-tf[t], t))[:max_features]
        return cls({t: i for i, t in enumerate(sorted(keep))})

    def __len__(self) -> int:
        return len(self.index)

    def oov_rate(self, docs: list[list[str]]) -> float:
        toks = [t for d in docs for t in d]
        return sum(t not in self.index for t in toks) / max(len(toks), 1)


def one_hot(vocab: Vocabulary, tokens: list[str]) -> sp.csr_matrix:
    """One row per token, a single 1 in that token's column; unknown tokens give an all-zero row."""
    rows = [i for i, t in enumerate(tokens) if t in vocab.index]
    cols = [vocab.index[tokens[i]] for i in rows]
    return sp.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(tokens), len(vocab)))


def join_multiword(tokens: list[str]) -> list[str]:
    """Merge every multiword ontology form into one unit ('puff', 'sleeve' becomes 'puff_sleeve')."""
    out, i = [], 0
    spans = {s.start: s for s in tag_rules(tokens) if s.end - s.start > 1}
    while i < len(tokens):
        if i in spans:
            out.append("_".join(tokens[i:spans[i].end]))
            i = spans[i].end
        else:
            out.append(tokens[i])
            i += 1
    return out


def features(tokens: list[str], ngram: tuple[int, int] = (1, 1), join: bool = False) -> list[str]:
    toks = join_multiword(tokens) if join else tokens
    out = []
    for n in range(ngram[0], ngram[1] + 1):
        out += [" ".join(toks[i:i + n]) for i in range(len(toks) - n + 1)]
    return out


class BagOfWords:
    """Dictionary plus count vectors. min_df and max_features are the frequency cut-offs."""

    def __init__(self, ngram: tuple[int, int] = (1, 1), min_df: int = 1, max_features: int | None = None, join: bool = False):
        self.ngram, self.min_df, self.max_features, self.join = ngram, min_df, max_features, join

    def _feats(self, docs: list[list[str]]) -> list[list[str]]:
        return [features(d, self.ngram, self.join) for d in docs]

    def fit(self, docs: list[list[str]]) -> "BagOfWords":
        self.vocab = Vocabulary.build(self._feats(docs), self.min_df, self.max_features)
        return self

    def transform(self, docs: list[list[str]], binary: bool = False) -> sp.csr_matrix:
        rows, cols, vals = [], [], []
        for r, feats in enumerate(self._feats(docs)):
            for f, c in Counter(f for f in feats if f in self.vocab.index).items():
                rows.append(r)
                cols.append(self.vocab.index[f])
                vals.append(1.0 if binary else float(c))
        return sp.csr_matrix((vals, (rows, cols)), shape=(len(docs), len(self.vocab)))


class Tfidf:
    """idf = ln((1 + n) / (1 + df)) + 1 (smoothed), tf optionally 1 + ln tf, rows scaled to unit length."""

    def __init__(self, sublinear: bool = False):
        self.sublinear = sublinear

    def fit(self, counts: sp.csr_matrix) -> "Tfidf":
        n = counts.shape[0]
        df = np.bincount(counts.indices, minlength=counts.shape[1])
        self.idf = np.log((1 + n) / (1 + df)) + 1
        return self

    def transform(self, counts: sp.csr_matrix) -> sp.csr_matrix:
        x = counts.copy().astype(float)
        if self.sublinear:
            x.data = 1 + np.log(x.data)
        x = x.multiply(self.idf).tocsr()
        norms = np.sqrt(x.multiply(x).sum(1)).A1
        norms[norms == 0] = 1
        return sp.diags(1 / norms) @ x


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    d = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / d) if d else 0.0


def bm25_scores(counts: sp.csr_matrix, query_ids: list[int], k1: float = 1.5, b: float = 0.75) -> np.ndarray:
    """Okapi BM25 of one query (column ids) against every document row of a count matrix."""
    n = counts.shape[0]
    df = np.bincount(counts.indices, minlength=counts.shape[1])
    idf = np.log(1 + (n - df + 0.5) / (df + 0.5))
    lens = np.asarray(counts.sum(1)).ravel()
    dense = counts[:, sorted(set(query_ids))].toarray()
    cols = np.array(sorted(set(query_ids)))
    norm = k1 * (1 - b + b * lens / lens.mean())[:, None]
    return (idf[cols] * dense * (k1 + 1) / (dense + norm)).sum(1) if len(cols) else np.zeros(n)


def multiword_forms() -> set[tuple[str, ...]]:
    return {k for k in form_index() if len(k) > 1}
