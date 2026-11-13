"""Perplexity by order and smoothing, domain shift to gold requests, and a transcript-choice use case."""
from __future__ import annotations

import random

import numpy as np

from . import corpus
from .morph import edit_distance
from .ngram import NGramLM
from .stats import bootstrap_mean_ci

SEED = corpus.SEED
METHODS = {"add-k": "addk", "Witten-Bell": "wb", "Kneser-Ney (modified)": "kn"}


def _split(docs: list, frac: float = 0.8) -> tuple[list, list]:
    idx = np.random.default_rng(SEED).permutation(len(docs))
    cut = int(frac * len(docs))
    return [docs[i] for i in idx[:cut]], [docs[i] for i in idx[cut:]]


def best_k(train: list[list[str]], dev: list[list[str]], order: int) -> tuple[float, float]:
    """Add-k is tuned on dev only, so the baseline is not a straw man."""
    scores = {k: NGramLM(order, "addk", k=k, min_count=2).fit(train).perplexity(dev) for k in (0.001, 0.01, 0.1, 1.0)}
    k = min(scores, key=scores.get)
    return k, scores[k]


def catalogue_by_order(max_order: int = 4) -> dict | None:
    docs = corpus.catalogue_tokens()
    if not docs:
        return None
    train, held = _split(docs)
    train, dev = train[:-3000], train[-3000:]
    held = held[:3000]
    table: dict = {}
    for order in range(1, max_order + 1):
        row = {}
        for name, method in METHODS.items():
            if method == "addk":
                k, _ = best_k(train, dev, order)
                row[name] = {"perplexity": round(NGramLM(order, "addk", k=k, min_count=2).fit(train).perplexity(held), 2), "k": k}
            else:
                row[name] = {"perplexity": round(NGramLM(order, method, min_count=2).fit(train).perplexity(held), 2)}
        table[f"order {order}"] = row
    return {"train_titles": len(train), "held_out_titles": len(held), "unk_rule": "words seen once in training become <unk>", "table": table}


def gold_shift() -> dict:
    """Perplexity of the 52 test requests under models trained on different text; order and smoothing picked on the 30 dev requests."""
    dev, test = [[t for t, _ in r] for r in corpus.gold_dev()], [[t for t, _ in r] for r in corpus.gold_test()]
    src = corpus.text_sources()
    sets = {"synthetic requests (8,000, template text)": src["synthetic"], "assistant guides (70 chunks)": src["guides"]}
    if src["catalogue"]:
        sets["catalogue titles (English only)"] = src["catalogue"]
        sets["all three combined"] = src["synthetic"] + src["guides"] + src["catalogue"]
    out: dict = {}
    for name, train in sets.items():
        scored = {}
        for order in (1, 2, 3):
            for method in ("wb", "kn"):
                scored[(order, method)] = NGramLM(order, method, min_count=2).fit(train).perplexity(dev)
        order, method = min(scored, key=scored.get)
        model = NGramLM(order, method, min_count=2).fit(train)
        out[name] = {"chosen_on_dev": f"order {order}, {'Kneser-Ney' if method == 'kn' else 'Witten-Bell'}",
                     "dev_perplexity": round(scored[(order, method)], 1), "test_perplexity": round(model.perplexity(test), 1),
                     "test_unk_rate": round(sum(model._map(w) == "<unk>" for s in test for w in s) / sum(len(s) for s in test), 3)}
    return {"n_dev": len(dev), "n_test": len(test), "models": out,
            "caveat": "Synthetic requests are generated from templates, so a model trained on them looks sharp on template-like text; the gold "
                      "requests were written separately and contain Hinglish the catalogue never does."}


def confusion_choice() -> dict | None:
    """Can a language model pick the right word among in-vocabulary confusables (edit distance <= 2)? Study only: confusables are synthetic."""
    src = corpus.text_sources()
    train = src["synthetic"] + src["guides"] + src["catalogue"]
    kn = NGramLM(3, "kn", min_count=2).fit(train)
    uni = NGramLM(1, "kn", min_count=2).fit(train)
    words = sorted(kn.known)
    by_first: dict[str, list[str]] = {}
    for w in words:
        if w.isalpha() and len(w) >= 4:
            by_first.setdefault(w[0], []).append(w)
    rng = random.Random(SEED)
    wins = {"trigram KN": [], "unigram": []}
    for row in corpus.gold_test():
        toks = [t for t, _ in row]
        for i, (tok, tag) in enumerate(row):
            if tag == "O" or tok not in kn.known or not tok.isalpha() or len(tok) < 4:
                continue
            alts = [w for w in by_first[tok[0]] if w != tok and edit_distance(w, tok) <= 2]
            if not alts:
                continue
            bad = toks[:i] + [rng.choice(alts)] + toks[i + 1:]
            wins["trigram KN"].append(float(kn.score(toks) > kn.score(bad)))
            wins["unigram"].append(float(uni.score(toks) > uni.score(bad)))
    return {"pairs": len(wins["trigram KN"]),
            "accuracy": {k: {"value": round(float(np.mean(v)), 3), "ci95": bootstrap_mean_ci(np.array(v))} for k, v in wins.items()},
            "task": "gold test request vs the same request with one entity word swapped for a random in-vocabulary word within edit distance 2",
            "caveat": "Study only. Real recogniser errors are not random edit-distance neighbours, and 'tokens seen once' are <unk>; the product "
                      "would apply this to speech-to-text alternatives, which the browser does not expose today."}


def run() -> dict:
    res = {"topic": "n-gram language model", "seed": SEED, "implementation": "from scratch (bespoke/nlp/ngram.py); probabilities sum to 1 over the vocabulary (tested)",
           "catalogue_perplexity_by_order": catalogue_by_order() or "skipped: data/raw/styles.csv missing",
           "gold_domain_shift": gold_shift(), "word_choice_in_context": confusion_choice()}
    corpus.write_json("ngram", res)
    return res
