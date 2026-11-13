"""Collocation extraction: association measures over bigrams, written from the formulas.

PMI = log2 p(xy)/(p(x)p(y)); NPMI = PMI / -log2 p(xy); t-score = (c(xy) - E) / sqrt(c(xy));
Dunning's log-likelihood ratio G2 = 2 * sum O ln(O/E) over the 2x2 contingency table.
The measures are checked against nltk in tests/test_nlp_colloc.py.
"""
from __future__ import annotations

import math
from collections import Counter

from ..lexicon import form_index
from . import corpus
from .stats import bootstrap_mean_ci

import numpy as np

Bigram = tuple[str, str]
AUDIENCE = {"men", "women", "boys", "girls", "kids", "unisex"}  # catalogue audience words pair with everything


def count_ngrams(sentences: list[list[str]]) -> tuple[Counter[str], Counter[Bigram], int]:
    uni: Counter[str] = Counter()
    bi: Counter[Bigram] = Counter()
    for s in sentences:
        uni.update(s)
        bi.update(zip(s, s[1:]))
    return uni, bi, sum(bi.values())


def pmi(c_xy: int, c_x: int, c_y: int, n: int) -> float:
    return math.log2(c_xy * n / (c_x * c_y))


def npmi(c_xy: int, c_x: int, c_y: int, n: int) -> float:
    return pmi(c_xy, c_x, c_y, n) / -math.log2(c_xy / n)


def t_score(c_xy: int, c_x: int, c_y: int, n: int) -> float:
    return (c_xy - c_x * c_y / n) / math.sqrt(c_xy)


def llr(c_xy: int, c_x: int, c_y: int, n: int) -> float:
    o = [c_xy, c_x - c_xy, c_y - c_xy, n - c_x - c_y + c_xy]
    rows, cols = (o[0] + o[1], o[2] + o[3]), (o[0] + o[2], o[1] + o[3])
    e = [rows[0] * cols[0] / n, rows[0] * cols[1] / n, rows[1] * cols[0] / n, rows[1] * cols[1] / n]
    return 2 * sum(a * math.log(a / b) for a, b in zip(o, e) if a > 0)


MEASURES = {"frequency": lambda c, x, y, n: float(c), "pmi": pmi, "npmi": npmi, "t_score": t_score, "llr": llr}


def score_bigrams(sentences: list[list[str]], min_count: int = 5) -> dict[str, list[tuple[Bigram, float]]]:
    """Ranked bigrams per measure. Only alphabetic pairs seen at least min_count times are scored."""
    uni, bi, n = count_ngrams(sentences)
    pairs = [p for p, c in bi.items() if c >= min_count and p[0].isalpha() and p[1].isalpha()]
    return {m: sorted(((p, f(bi[p], uni[p[0]], uni[p[1]], n)) for p in pairs), key=lambda x: -x[1]) for m, f in MEASURES.items()}


def ontology_bigrams() -> set[Bigram]:
    return {k for k in form_index() if len(k) == 2}


def precision_at(ranked: list[tuple[Bigram, float]], gold: set[Bigram], k: int) -> float:
    return sum(p in gold for p, _ in ranked[:k]) / k


def candidates(ranked: list[tuple[Bigram, float]], limit: int = 25) -> list[dict]:
    """High-LLR bigrams with at least one ontology word that no form covers yet: a reviewer's shortlist."""
    index = form_index()
    singles = {k[0] for k in index if len(k) == 1}
    out = []
    for (a, b), score in ranked:
        if (a, b) in index or not ({a, b} & singles) or {a, b} & AUDIENCE:
            continue
        out.append({"bigram": f"{a} {b}", "llr": round(score, 1), "tags": sorted({index[(w,)][0] for w in (a, b) if (w,) in index})})
        if len(out) == limit:
            break
    return out


def run() -> dict:
    gold = ontology_bigrams()
    res: dict = {"topic": "collocation", "ontology_bigram_forms": len(gold),                  "note": "Precision@k is the share of top-k bigrams that are already multiword ontology forms; median rank percentile is where "
                         "the attested forms sit in each ranking (0 = top). Only a few ontology forms occur in these corpora, and the catalogue is "
                         "English, mostly menswear and footwear; the guides are 7k tokens. Candidates are a reviewer's shortlist, not accepted forms.",
                 "sources": {}}
    for name, sents in corpus.text_sources().items():
        if name in ("gold", "synthetic") or not sents:
            continue  # gold is too small; synthetic bigrams reflect the templates, not usage
        scored = score_bigrams(sents, min_count=5 if name == "catalogue" else 2)
        seen = {p for p in gold if any(p == q for q, _ in scored["frequency"])}
        entry = {"tokens": sum(len(s) for s in sents), "scored_bigrams": len(scored["frequency"]),
                 "ontology_bigrams_attested": len(seen), "measures": {}}
        for m, ranked in scored.items():
            ks = [k for k in (50, 100, 200) if k <= len(ranked)]
            entry["measures"][m] = {f"precision@{k}": round(precision_at(ranked, gold, k), 3) for k in ks}
            if seen:
                ranks = {p: i for i, (p, _) in enumerate(ranked)}
                top = ranks_to_recall(ranks, seen, 500)
                entry["measures"][m]["recall_of_attested@500"] = top
                entry["measures"][m]["median_rank_percentile_of_attested"] = round(float(np.median([ranks[p] / len(ranked) for p in seen])), 3)
        entry["candidate_new_forms_by_llr"] = candidates(scored["llr"])
        if name == "catalogue":
            entry["precision@100_ci95"] = precision_ci(scored["llr"], gold)
        res["sources"][name] = entry
    corpus.write_json("collocation", res)
    return res


def ranks_to_recall(ranks: dict[Bigram, int], attested: set[Bigram], k: int) -> float:
    return round(sum(ranks[p] < k for p in attested) / len(attested), 3)


def precision_ci(ranked: list[tuple[Bigram, float]], gold: set[Bigram], k: int = 100) -> list[float]:
    hits = np.array([p in gold for p, _ in ranked[:k]], dtype=float)
    return bootstrap_mean_ci(hits)
