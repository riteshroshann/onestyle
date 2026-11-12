"""Part-of-speech tagging for romanised Hinglish requests, and whether a POS feature helps the slot tagger.

There is no treebank for romanised Hindi, so the training tags are silver: Hindi function words and
ontology classes map to Universal POS by rule, and every other (English) token gets spaCy's tag in the context of
the whole request. An HMM, a CRF and a fine-tuned MiniLM learn from 6000 synthetic requests tagged this way and
are scored on a hand-tagged gold set (data/gold/pos.jsonl, 60 requests, 525 tokens, guidelines in
data/gold/pos-guidelines.md). spaCy tagging the gold directly is the off-the-shelf reference.
"""
from __future__ import annotations

import math
import random
from collections import Counter, defaultdict

import numpy as np

from ..data import synth_sentence
from ..lexicon import tag_rules
from .common import SEED, bootstrap_ci, gold_requests, read_jsonl, GOLD, write_result

N_SILVER = 6000
UPOS = ["ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM", "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "VERB", "X"]

HINDI_FUNCTION = {
    **{w: "ADP" for w in "ke ka ki ko se pe par mein tak liye jaisi jaisa jaise".split()},
    **{w: "AUX" for w in "chahiye hai hain ho hoga hona".split()},
    **{w: "VERB" for w in "rakhna rakho karna karo banana banwana chalega chahta".split()},
    **{w: "PART" for w in "nahi nahin mat".split()},
    **{w: "CCONJ" for w in "aur ya lekin magar".split()},
    **{w: "ADV" for w in "thoda thodi bahut zyada kam neeche upar aage peeche".split()},
    **{w: "PRON" for w in "mujhe mera meri mere".split()},
    **{w: "DET" for w in "kuch ek".split()},
}
# ontology class of a gazetteer span -> the part of speech its words usually have
CLASS_POS = {"GARMENT": "NOUN", "PART": "NOUN", "NECKLINE": "NOUN", "FABRIC": "NOUN", "EMBELL": "NOUN", "OCCASION": "NOUN", "COLOUR": "ADJ", "SHADE": "ADJ",
             "FIT": "ADJ", "LENGTH": "ADJ", "STYLE": "ADJ", "SLEEVE": "ADJ", "PATTERN": "ADJ", "SILHOUETTE": "ADJ", "DIM": "ADJ", "LOC": "ADV", "INT": "ADV",
             "NEG": "PART", "CMP": "ADV", "REF": "NUM", "NUM": "NUM"}


def silver_tags(tokens: list[str], nlp) -> list[str]:
    """Rules first, spaCy for the rest. spaCy runs on the full token sequence so English words keep their context."""
    from spacy.tokens import Doc

    tags: list[str | None] = [None] * len(tokens)
    for s in tag_rules(tokens):
        for i in range(s.start, s.end):
            tags[i] = CLASS_POS[s.tag]
    for i, t in enumerate(tokens):
        if tags[i] is None and t in HINDI_FUNCTION:
            tags[i] = HINDI_FUNCTION[t]
        elif tags[i] is None and t.replace(".", "").isdigit():
            tags[i] = "NUM"
    doc = nlp(Doc(nlp.vocab, words=tokens))
    return [t or ("NOUN" if d.pos_ == "PROPN" else d.pos_) for t, d in zip(tags, doc)]


def spacy_tags(tokens: list[str], nlp) -> list[str]:
    from spacy.tokens import Doc

    return [d.pos_ for d in nlp(Doc(nlp.vocab, words=tokens))]


class HMM:
    """Bigram tagger: add-k transitions, emissions with a hapax-estimated unknown word, Viterbi decoding."""

    def fit(self, sents: list[list[str]], tags: list[list[str]], k: float = 0.1) -> "HMM":
        self.tags = sorted({t for ts in tags for t in ts})
        wc: dict[str, Counter] = defaultdict(Counter)
        tr: dict[str, Counter] = defaultdict(Counter)
        for ws, ts in zip(sents, tags):
            prev = "<s>"
            for w, t in zip(ws, ts):
                wc[t][w] += 1
                tr[prev][t] += 1
                prev = t
            tr[prev]["</s>"] += 1
        vocab = {w for c in wc.values() for w in c}
        total_words = Counter(w for c in wc.values() for w in c.elements())
        self.k, self.V = k, len(vocab) + 1
        self.emit = {t: (c, sum(c.values())) for t, c in wc.items()}
        hapax = Counter(t for t, c in wc.items() for w, n in c.items() if total_words[w] == 1 for _ in range(n))
        self.unk = {t: (hapax[t] + k) / (sum(c.values()) + k * self.V) for t, c in wc.items()}
        self.trans = {a: (c, sum(c.values())) for a, c in tr.items()}
        self.vocab = vocab
        return self

    def _t(self, a: str, b: str) -> float:
        c, n = self.trans.get(a, (Counter(), 0))
        return math.log((c[b] + self.k) / (n + self.k * (len(self.tags) + 1)))

    def _e(self, t: str, w: str) -> float:
        c, n = self.emit[t]
        return math.log((c[w] + self.k) / (n + self.k * self.V)) if w in self.vocab else math.log(self.unk[t])

    def predict(self, ws: list[str]) -> list[str]:
        score = {t: self._t("<s>", t) + self._e(t, ws[0]) for t in self.tags}
        back: list[dict[str, str]] = []
        for w in ws[1:]:
            new, bp = {}, {}
            for t in self.tags:
                p = max(self.tags, key=lambda a: score[a] + self._t(a, t))
                new[t], bp[t] = score[p] + self._t(p, t) + self._e(t, w), p
            score, back = new, back + [bp]
        last = max(self.tags, key=lambda t: score[t] + self._t(t, "</s>"))
        out = [last]
        for bp in reversed(back):
            out.append(bp[out[-1]])
        return out[::-1]


def crf_features(ws: list[str], i: int, gazetteer: list[str] | None) -> dict:
    w = ws[i]
    f = {"w": w, "suf3": w[-3:], "suf2": w[-2:], "pre2": w[:2], "digit": w.isdigit(), "punct": not w.isalnum(), "hash": w.startswith("#")}
    for d in (-2, -1, 1, 2):
        j = i + d
        f[f"w{d}"] = ws[j] if 0 <= j < len(ws) else ("<s>" if j < 0 else "</s>")
    if gazetteer:
        f["gaz"] = gazetteer[i]
    return f


def gazetteer_classes(ws: list[str]) -> list[str]:
    out = ["-"] * len(ws)
    for s in tag_rules(ws):
        for i in range(s.start, s.end):
            out[i] = s.tag
    return out


def crf_fit_predict(train_w, train_t, test_w, gaz: bool) -> list[list[str]]:
    import sklearn_crfsuite

    feats = lambda ws: [crf_features(ws, i, gazetteer_classes(ws) if gaz else None) for i in range(len(ws))]  # noqa: E731
    crf = sklearn_crfsuite.CRF(algorithm="lbfgs", c1=0.05, c2=0.05, max_iterations=80, all_possible_transitions=True)
    crf.fit([feats(w) for w in train_w], train_t)
    return crf.predict([feats(w) for w in test_w])


def minilm_fit_predict(train_w, train_t, test_w, seed: int, epochs: int = 4) -> list[list[str]]:
    import sys

    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer, get_linear_schedule_with_warmup

    from .common import ENGINE
    sys.path.insert(0, str(ENGINE / "scripts"))
    import ladder  # the existing training helpers: word-to-subword batching with first-piece labels

    torch.manual_seed(seed)
    rng = random.Random(seed)
    L = {t: i for i, t in enumerate(UPOS)}
    name = "microsoft/MiniLM-L12-H384-uncased"
    tok = AutoTokenizer.from_pretrained(name)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModelForTokenClassification.from_pretrained(name, num_labels=len(UPOS)).to(dev)
    train = [{"tokens": w, "tags": t} for w, t in zip(train_w, train_t)]
    opt = torch.optim.AdamW(model.parameters(), lr=8e-5, weight_decay=0.01)
    steps = epochs * -(-len(train) // 32)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    for _ in range(epochs):
        model.train()
        for _, _, ids, att, lab in ladder.batches(train, tok, L, 32, True, rng):
            loss = model(input_ids=torch.tensor(ids, device=dev), attention_mask=torch.tensor(att, device=dev), labels=torch.tensor(lab, device=dev)).loss
            loss.backward()
            opt.step(); sched.step(); opt.zero_grad()
    model.eval()
    out = []
    test = [{"tokens": w, "tags": ["X"] * len(w)} for w in test_w]
    with torch.no_grad():
        for chunk, enc, ids, att, _ in ladder.batches(test, tok, L, 32, False, None):
            logits = model(input_ids=torch.tensor(ids, device=dev), attention_mask=torch.tensor(att, device=dev)).logits.argmax(-1).cpu().numpy()
            for b, (_, first) in enumerate(enc):
                pred = [UPOS[logits[b, p]] for p in first]
                out.append(pred + ["NOUN"] * (len(chunk[b]["tokens"]) - len(pred)))
    return out


def accuracy(gold: list[list[str]], pred: list[list[str]]) -> float:
    return float(np.mean([g == p for gs, ps in zip(gold, pred) for g, p in zip(gs, ps)]))


def report(gold: list[list[str]], pred: list[list[str]], sents: list[list[str]], subset: list[int] | None = None) -> dict:
    ix = subset if subset is not None else list(range(len(gold)))
    flat = [(g, p, w) for i in ix for g, p, w in zip(gold[i], pred[i], sents[i])]
    per_sentence = [([g == p for g, p in zip(gold[i], pred[i])]) for i in ix]
    acc = float(np.mean([a for s in per_sentence for a in s]))
    ci = bootstrap_ci(per_sentence, lambda ss: float(np.mean([a for s in ss for a in s])))
    errors = Counter((g, p) for g, p, _ in flat if g != p)
    return {"accuracy": round(acc, 4), "accuracy_ci95": ci, "n_tokens": len(flat), "top_confusions_gold_predicted": [[g, p, n] for (g, p), n in errors.most_common(5)]}


def run() -> dict:
    import spacy

    nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer"])
    gold = read_jsonl(GOLD / "pos.jsonl")
    gw, gt = [r["tokens"] for r in gold], [r["tags"] for r in gold]
    # a request is "English only" when no token is a Hindi function word and none carries a Hindi-only ontology form
    english = [i for i, ws in enumerate(gw) if not any(w in HINDI_FUNCTION for w in ws)]
    rng = random.Random(SEED)
    synth = [[w for w, _ in synth_sentence(rng)] for _ in range(N_SILVER)]
    silver = [silver_tags(ws, nlp) for ws in synth]
    out: dict = {"task": "Universal POS tagging of romanised Hinglish requests", "seed": SEED, "n_gold_requests": len(gold), "n_gold_tokens": sum(map(len, gw)),
                 "n_english_only_requests": len(english), "n_silver_requests": N_SILVER, "interval": "bootstrap over requests, 1000 resamples",
                 "silver": "ontology classes and Hindi function words by rule, spaCy en_core_web_sm for the rest", "systems": {}}
    freq: dict[str, Counter] = defaultdict(Counter)
    for ws, ts in zip(synth, silver):
        for w, t in zip(ws, ts):
            freq[w][t] += 1
    preds = {
        "most_frequent_tag_per_word": [[freq[w].most_common(1)[0][0] if w in freq else "NOUN" for w in ws] for ws in gw],
        "hmm": (lambda m: [m.predict(ws) for ws in gw])(HMM().fit(synth, silver)),
        "crf": crf_fit_predict(synth, silver, gw, gaz=False),
        "crf_plus_gazetteer_feature": crf_fit_predict(synth, silver, gw, gaz=True),
        "minilm_finetuned": minilm_fit_predict(synth, silver, gw, SEED),
        "spacy_en_core_web_sm_directly": [spacy_tags(ws, nlp) for ws in gw],
    }
    for name, pred in preds.items():
        out["systems"][name] = {"all_requests": report(gt, pred, gw), "english_only_requests": report(gt, pred, gw, english)}
    out["silver_vs_gold_accuracy"] = round(accuracy(gt, [silver_tags(ws, nlp) for ws in gw]), 4)
    write_result("pos", out)
    return out
