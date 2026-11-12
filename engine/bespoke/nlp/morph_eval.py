"""Measure the morphological fallback: leave-one-form-out recall, false accepts, gold span F1, inflection stress."""
from __future__ import annotations

import random
from collections import Counter

from ..data import DISTRACTORS
from ..lexicon import form_index, tokenize
from . import corpus
from .morph import Lemmatiser, bio_with_fallback, induce_swaps, single_token_vocab
from .stats import bootstrap_ci, span_f1
from ..lexicon import spans_to_bio, tag_rules


def leave_one_out(routes: tuple[str, ...], limit: int = 400) -> dict:
    """Delete one form at a time, rebuild the lemmatiser, ask it to recover that form's (tag, value)."""
    vocab = single_token_vocab()
    forms = sorted(f for f in vocab if len(f) >= 5)
    random.Random(corpus.SEED).shuffle(forms)
    right = wrong = 0
    n = min(limit, len(forms))
    for f in forms[:n]:
        rest = {k: v for k, v in vocab.items() if k != f}
        hit = Lemmatiser.build(rest, routes).lemma(f)
        if hit:
            right += hit[0] == vocab[f]
            wrong += hit[0] != vocab[f]
    return {"n": n, "recovered": right, "wrong": wrong, "recall": round(right / n, 3),
            "precision": round(right / (right + wrong), 3) if right + wrong else None}


def negatives(lem: Lemmatiser) -> dict[str, list[str]]:
    """Words that must stay unmapped: the generator's off-ontology distractors and unknown guide words."""
    guide = Counter(t for s in corpus.text_sources()["guides"] for t in s)
    idx = {k[0] for k in form_index() if len(k) == 1}
    distract = sorted({t for d in DISTRACTORS for t in tokenize(d) if t.isalpha() and len(t) >= 4 and t not in idx})
    prose = sorted(w for w in guide if w.isalpha() and len(w) >= 4 and w not in idx)
    return {"distractors": distract, "guide_words": prose}


def false_accepts(lem: Lemmatiser) -> dict:
    out = {}
    for name, words in negatives(lem).items():
        accepted = {w: f"{lem.lemma(w)[0][1]} ({lem.lemma(w)[1]})" for w in words if lem.lemma(w)}
        out[name] = {"n": len(words), "accepted": len(accepted), "rate": round(len(accepted) / len(words), 3), "examples": dict(list(accepted.items())[:25])}
    return out


def gold_f1(lem: Lemmatiser | None, rows: list[corpus.Row]) -> dict:
    gold = [[g for _, g in r] for r in rows]
    toks = [[t for t, _ in r] for r in rows]
    pred = [spans_to_bio(len(t), tag_rules(t)) if lem is None else bio_with_fallback(t, lem) for t in toks]
    return {"n": len(rows), "f1": round(span_f1(gold, pred), 4), "ci95": bootstrap_ci(gold, pred)}


def stress_rows(rows: list[corpus.Row], swaps: list[tuple[str, str]], seed: int = corpus.SEED) -> list[corpus.Row]:
    """Replace entity tokens by an unseen inflection (a swap that lands outside the gazetteer); labels are kept."""
    rng = random.Random(seed)
    vocab = single_token_vocab()
    out = []
    for r in rows:
        new = []
        for tok, tag in r:
            if tag != "O" and tok in vocab and len(tok) >= 5:
                variants = []
                for a, b in swaps:
                    if tok.endswith(a) or a == "":
                        v = tok[: len(tok) - len(a)] + b
                        if v not in vocab and v.isalpha() and (tok[: len(tok) - len(a)] + b) != tok:
                            variants.append(v)
                if variants:
                    tok = rng.choice(variants)
            new.append((tok, tag))
        out.append(new)
    return out


def run() -> dict:
    dev, test = corpus.gold_dev(), corpus.gold_test()
    configs = {"none": None, "suffix": ("suffix",), "suffix+sound": ("suffix", "sound")}
    lems = {k: (Lemmatiser.build(routes=v) if v else None) for k, v in configs.items()}
    dev_f1 = {k: gold_f1(l, dev)["f1"] for k, l in lems.items()}
    # the fallback is adopted only if dev says it helps; ties keep the smaller config
    chosen = max(configs, key=lambda k: (dev_f1[k], -list(configs).index(k)))
    test_f1 = {k: gold_f1(l, test) for k, l in lems.items()}
    full = lems["suffix+sound"]
    stress = stress_rows(test, full.swaps)
    changed = sum(a != b for ra, rb in zip(test, stress) for a, b in zip(ra, rb))
    res = {
        "topic": "morphology",
        "seed": corpus.SEED,
        "vocabulary": {"single_token_forms": len(single_token_vocab()), "induced_swaps": sorted(induce_swaps(single_token_vocab()))},
        "leave_one_form_out": {k: leave_one_out(v) for k, v in configs.items() if v},
        "false_accepts": false_accepts(full),
        "gold_span_f1": {"split": "dev (n=30, selection) / test (n=52, report)", "dev": dev_f1, "test": test_f1, "chosen_on_dev": chosen},
        "inflection_stress": {"note": "test requests with entity tokens replaced by an unseen inflection; labels unchanged",
                              "tokens_changed": changed,
                              "without": gold_f1(None, stress), "with_fallback": gold_f1(full, stress)},
        "caveat": "Gold has 82 requests; most entity tokens are already in the gazetteer, so gold gains are small. Stress rows are synthetic perturbations of gold.",
    }
    corpus.write_json("morph", res)
    return res
