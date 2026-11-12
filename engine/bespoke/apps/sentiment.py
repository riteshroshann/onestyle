"""Sentiment: the stance of a customer or maker line towards the design under discussion.

Three classes: pos (wants or likes it), neg (rejects or dislikes it, including "no embroidery" and "not too deep"),
neu (states or asks, no stance). A lexicon with negation scope is compared with a TF-IDF logistic regression and a
fine-tuned MiniLM, the last two trained on 90 hand-written lines plus lines generated from the ontology.
Gold: data/gold/sentiment.jsonl (90 train, 120 test, one annotator).
"""
from __future__ import annotations

import random
import re

import numpy as np

from ..lexicon import ontology, tokenize
from .common import GOLD, SEED, bootstrap_ci, read_jsonl, write_result

CLASSES = ["neg", "neu", "pos"]
POS_WORDS = {"love", "loved", "loving", "like", "liked", "perfect", "great", "beautiful", "gorgeous", "lovely", "pretty", "nice", "amazing",
             "wonderful", "elegant", "adore", "happy", "exactly", "sundar", "accha", "achha", "pasand", "mast", "sahi", "super", "flattering", "thanks", "thank"}
NEG_WORDS = {"hate", "hated", "dislike", "ugly", "bad", "terrible", "wrong", "cheap", "poor", "unhappy", "bura", "galat", "loud", "ajeeb", "disappointing", "remove"}
# a negator reverses the sentiment words in the next few tokens; a negator with none in reach rejects the feature itself
NEGATORS = {"no", "not", "never", "nahi", "nahin", "mat", "without", "dont", "don't", "cannot", "cant", "nothing"}
TOO = {"too", "zyada", "bahut"}  # "too tight", "bahut zyada heavy": excess is a complaint
EXCESS_TARGETS = {"tight", "loose", "short", "long", "heavy", "deep", "shiny", "flashy", "revealing", "bright", "dark", "light", "chhoti", "chhota"}
SCOPE = 3


def lexicon_polarity(text: str) -> str:
    toks = tokenize(text.replace("n't", " not").replace("do not", "dont"))
    score, rejected = 0, False
    for i, t in enumerate(toks):
        s = 1 if t in POS_WORDS else -1 if t in NEG_WORDS else 0
        if t in EXCESS_TARGETS and any(w in TOO for w in toks[max(0, i - 2):i]):
            s = -1
        if s:
            if any(w in NEGATORS for w in toks[max(0, i - SCOPE):i]):
                s = -s
            score += s
    if any(t in NEGATORS for t in toks) and score == 0:
        rejected = not any(t in POS_WORDS or t in NEG_WORDS for t in toks)
    return "neg" if score < 0 or rejected else "pos" if score > 0 else "neu"


def synthetic(n_per_class: int, rng: random.Random) -> list[dict]:
    """Stance lines built from ontology forms: negation and approval templates around real garment vocabulary."""
    lex = ontology()["lexicon"]
    pool = [f for tag in ("EMBELL", "PATTERN", "FABRIC", "STYLE", "COLOUR", "NECKLINE", "SLEEVE", "GARMENT", "SILHOUETTE") for v in lex[tag].values() for f in v["forms"]]
    tpl = {"neg": ["no {x}", "{x} nahi chahiye", "without {x}", "{x} mat rakhna", "not too {x}", "i dont want {x}", "i dislike the {x}", "remove the {x}", "{x} is too much"],
           "pos": ["love the {x}", "{x} pasand hai", "i like the {x}", "the {x} looks great", "{x} is perfect", "yes keep the {x}", "{x} bahut accha hai", "the {x} is beautiful"],
           "neu": ["{x} chahiye", "i want {x}", "{x} please", "make it {x}", "what is {x}", "kya aap {x} bana doge", "a design with {x}", "need {x}"]}
    return [{"text": rng.choice(ts).format(x=rng.choice(pool)), "label": c} for c, ts in tpl.items() for _ in range(n_per_class)]


def macro_f1(y: list[str], p: list[str]) -> float:
    fs = []
    for c in CLASSES:
        tp = sum(a == c and b == c for a, b in zip(y, p))
        fp = sum(a != c and b == c for a, b in zip(y, p))
        fn = sum(a == c and b != c for a, b in zip(y, p))
        fs.append(2 * tp / (2 * tp + fp + fn) if tp else 0.0)
    return float(np.mean(fs))


def report(y: list[str], p: list[str], texts: list[str]) -> dict:
    acc = lambda ys, ps: float(np.mean([a == b for a, b in zip(ys, ps)]))  # noqa: E731
    pairs = list(zip(y, p))
    neg_ix = [i for i, _ in enumerate(y) if re.search(r"\b(no|not|never|nahi|mat|without|dont)\b", texts[i])]
    return {"accuracy": round(acc(y, p), 4), "accuracy_ci95": bootstrap_ci(pairs, lambda ps: acc([a for a, _ in ps], [b for _, b in ps])),
            "macro_f1": round(macro_f1(y, p), 4), "macro_f1_ci95": bootstrap_ci(pairs, lambda ps: macro_f1([a for a, _ in ps], [b for _, b in ps])),
            "accuracy_on_lines_with_a_negator": round(acc([y[i] for i in neg_ix], [p[i] for i in neg_ix]), 4), "n_lines_with_a_negator": len(neg_ix),
            "confusion_gold_to_predicted": {c: {d: sum(a == c and b == d for a, b in pairs) for d in CLASSES} for c in CLASSES}}


def logreg(train: list[dict], test_texts: list[str]) -> list[str]:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline, make_union

    feats = make_union(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True), TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True))
    clf = make_pipeline(feats, LogisticRegression(C=10, max_iter=2000, random_state=SEED))
    clf.fit([r["text"] for r in train], [r["label"] for r in train])
    return list(clf.predict(test_texts))


def minilm(train: list[dict], test_texts: list[str], seed: int, epochs: int = 8) -> list[str]:
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    torch.manual_seed(seed)
    rng = random.Random(seed)
    name = "microsoft/MiniLM-L12-H384-uncased"
    tok = AutoTokenizer.from_pretrained(name)
    model = AutoModelForSequenceClassification.from_pretrained(name, num_labels=3).to("cuda" if torch.cuda.is_available() else "cpu")
    dev = next(model.parameters()).device
    opt = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=0.01)
    steps = epochs * -(-len(train) // 32)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    for _ in range(epochs):
        model.train()
        rng.shuffle(train)
        for i in range(0, len(train), 32):
            b = train[i:i + 32]
            enc = tok([r["text"] for r in b], padding=True, truncation=True, max_length=48, return_tensors="pt").to(dev)
            loss = model(**enc, labels=torch.tensor([CLASSES.index(r["label"]) for r in b], device=dev)).loss
            loss.backward()
            opt.step(); sched.step(); opt.zero_grad()
    model.eval()
    with torch.no_grad():
        enc = tok(test_texts, padding=True, truncation=True, max_length=48, return_tensors="pt").to(dev)
        return [CLASSES[i] for i in model(**enc).logits.argmax(-1).tolist()]


def run() -> dict:
    rows = read_jsonl(GOLD / "sentiment.jsonl")
    train, test = [r for r in rows if r["split"] == "train"], [r for r in rows if r["split"] == "test"]
    texts, y = [r["text"] for r in test], [r["label"] for r in test]
    synth = synthetic(100, random.Random(SEED))
    out: dict = {"task": "stance polarity of design lines: neg / neu / pos", "gold": "data/gold/sentiment.jsonl", "n_train_hand_written": len(train),
                 "n_train_synthetic": len(synth), "n_test": len(test), "test_class_counts": {c: y.count(c) for c in CLASSES}, "seed": SEED,
                 "interval": "bootstrap over test lines, 1000 resamples", "systems": {}}
    out["systems"]["majority_class"] = report(y, ["neu"] * len(y), texts)
    out["systems"]["lexicon_with_negation_scope"] = report(y, [lexicon_polarity(t) for t in texts], texts)
    out["systems"]["tfidf_logreg_hand_written_only"] = report(y, logreg(train, texts), texts)
    out["systems"]["tfidf_logreg_plus_synthetic"] = report(y, logreg(train + synth, texts), texts)
    runs = [minilm(list(train + synth), texts, s) for s in (SEED, SEED + 1, SEED + 2)]
    out["systems"]["minilm_finetuned_plus_synthetic"] = {**report(y, runs[0], texts), "macro_f1_over_3_seeds": [round(macro_f1(y, r), 4) for r in runs],
                                                         "note": "interval and confusion are for seed 13"}
    out["lexicon_errors"] = [{"text": t, "gold": g, "predicted": p} for t, g in zip(texts, y) if (p := lexicon_polarity(t)) != g]
    write_result("sentiment", out)
    return out
