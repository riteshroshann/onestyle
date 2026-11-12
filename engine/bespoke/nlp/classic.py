"""Machine learning for NLP: a discriminative classifier with TF-IDF features against the product's regex guard.

Task: sort an assistant message into ok / injection / secrets / advice / unsafe / self_harm. The incumbent is the 14
regexes in web/lib/assistant/guard.js, run unchanged through node. The learner is word and character TF-IDF into
logistic regression (C chosen by inner cross-validation) and a linear SVM, scored by stratified 5-fold cross-validation.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score, recall_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.svm import LinearSVC

from . import corpus
from .guard_data import CLASSES, labelled

SEED = corpus.SEED
HERE = Path(__file__).parent


def incumbent(texts: list[str]) -> list[str] | None:
    node = shutil.which("node")
    if not node:
        return None
    out = subprocess.run([node, str(HERE / "guard_probe.mjs")], input=json.dumps(texts), capture_output=True, text=True, timeout=60)
    return json.loads(out.stdout) if out.returncode == 0 else None


class TfidfFeatures:
    """Word 1-2 grams plus character 2-5 grams (word-bounded), fitted on training text only."""

    def fit(self, texts: list[str]) -> "TfidfFeatures":
        self.word = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, lowercase=True).fit(texts)
        self.char = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, lowercase=True).fit(texts)
        return self

    def transform(self, texts: list[str]):
        return hstack([self.word.transform(texts), self.char.transform(texts)]).tocsr()


def ece(prob: np.ndarray, correct: np.ndarray, bins: int = 10) -> float:
    conf = prob.max(1)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(total)


def out_of_fold(texts: list[str], labels: list[str]) -> dict[str, np.ndarray]:
    y = np.array(labels)
    preds = {"logreg": np.empty(len(y), dtype=object), "linear svm": np.empty(len(y), dtype=object)}
    proba = np.zeros((len(y), len(CLASSES)))
    chosen_c = []
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=SEED).split(texts, y):
        feats = TfidfFeatures().fit([texts[i] for i in tr])
        xt, xe = feats.transform([texts[i] for i in tr]), feats.transform([texts[i] for i in te])
        grid = {"C": [0.3, 1, 3, 10, 30, 100]}
        lr = GridSearchCV(LogisticRegression(max_iter=500, class_weight="balanced"), grid, cv=StratifiedKFold(4, shuffle=True, random_state=SEED),
                          scoring="f1_macro").fit(xt, y[tr])
        chosen_c.append(lr.best_params_["C"])
        preds["logreg"][te] = lr.predict(xe)
        order = [list(lr.classes_).index(c) for c in CLASSES]
        proba[te] = lr.predict_proba(xe)[:, order]
        svm = GridSearchCV(LinearSVC(class_weight="balanced"), {"C": [0.1, 0.3, 1, 3, 10]}, cv=StratifiedKFold(4, shuffle=True, random_state=SEED),
                           scoring="f1_macro").fit(xt, y[tr])
        preds["linear svm"][te] = svm.predict(xe)
    return {"preds": preds, "proba": proba, "chosen_c": chosen_c}


def hybrid(regex: list[str], proba: np.ndarray, threshold: float) -> list[str]:
    """Regex verdict stands; where regex says ok, an unsafe class needs probability above threshold to override."""
    out = []
    for r, p in zip(regex, proba):
        k = int(p.argmax())
        out.append(r if r != "ok" else (CLASSES[k] if CLASSES[k] != "ok" and p[k] >= threshold else "ok"))
    return out


def paired_macro_f1(y: np.ndarray, a: np.ndarray, b: np.ndarray, n: int = 2000) -> dict:
    rng = np.random.default_rng(SEED)
    d = []
    for _ in range(n):
        s = rng.integers(0, len(y), len(y))
        d.append(f1_score(y[s], a[s], average="macro", labels=CLASSES, zero_division=0) - f1_score(y[s], b[s], average="macro", labels=CLASSES, zero_division=0))
    d = np.array(d)
    return {"delta": round(float(f1_score(y, a, average="macro", labels=CLASSES, zero_division=0) - f1_score(y, b, average="macro", labels=CLASSES, zero_division=0)), 4),
            "ci95": [round(float(np.percentile(d, 2.5)), 4), round(float(np.percentile(d, 97.5)), 4)],
            "p": round(float(max(2 * min((d <= 0).mean(), (d >= 0).mean()), 1 / n)), 4)}


def _score(y: np.ndarray, pred: np.ndarray) -> dict:
    rng = np.random.default_rng(SEED)
    boots = [f1_score(y[s], pred[s], average="macro", labels=CLASSES, zero_division=0) for s in (rng.integers(0, len(y), len(y)) for _ in range(500))]
    rec = recall_score(y, pred, labels=CLASSES, average=None, zero_division=0)
    return {"macro_f1": round(float(f1_score(y, pred, average="macro", labels=CLASSES, zero_division=0)), 4),
            "ci95": [round(float(np.percentile(boots, 2.5)), 4), round(float(np.percentile(boots, 97.5)), 4)],
            "accuracy": round(float((y == pred).mean()), 4), "recall_per_class": dict(zip(CLASSES, np.round(rec, 3).tolist()))}


def run() -> dict:
    texts, labels = labelled()
    y = np.array(labels)
    regex = incumbent(texts)
    oof = out_of_fold(texts, labels)
    systems = {"regex guard (guard.js)": np.array(regex)} if regex else {}
    systems["tf-idf + logistic regression"] = oof["preds"]["logreg"]
    systems["tf-idf + linear SVM"] = oof["preds"]["linear svm"]
    res = {"topic": "machine learning for NLP", "seed": SEED, "n_messages": len(texts), "classes": {c: labels.count(c) for c in CLASSES},
           "protocol": "stratified 5-fold cross-validation, one prediction per message from a model that never saw it; C chosen by inner 4-fold CV",
           "systems": {k: _score(y, v) for k, v in systems.items()}, "chosen_C_per_fold": oof["chosen_c"]}
    correct = oof["preds"]["logreg"] == y
    res["logreg_ece"] = round(ece(oof["proba"], correct.astype(float)), 4)
    if regex:
        res["logreg_vs_regex_paired_bootstrap"] = paired_macro_f1(y, oof["preds"]["logreg"], np.array(regex))
        res["hybrid_regex_first"] = {}
        ok = y == "ok"
        for thr in (0.2, 0.3, 0.4, 0.5):
            h = np.array(hybrid(regex, oof["proba"], thr))
            res["hybrid_regex_first"][f"threshold {thr}"] = {**_score(y, h), "false_refusal_rate_on_ok": round(float((h[ok] != "ok").mean()), 4)}
        res["regex_false_refusal_rate_on_ok"] = round(float((np.array(regex)[ok] != "ok").mean()), 4)
        res["regex_misses"] = [t for t, r, c in zip(texts, regex, labels) if c != "ok" and r == "ok"][:12]
        res["regex_false_refusals"] = [t for t, r, c in zip(texts, regex, labels) if c == "ok" and r != "ok"]
    res["confusion_logreg"] = {"labels": CLASSES, "matrix": confusion_matrix(y, oof["preds"]["logreg"], labels=CLASSES).tolist()}
    res["caveat"] = ("About 200 messages written for this study by the project's author: same author as the regexes, small per class, in-sample phrasing. "
                     "The regexes are a hand-tuned system and the learner a baseline; neither number is a field measurement. self_harm has 15 messages. "
                     "Safety stays regex-first in any deployment (the hybrid row), so the learner can only add refusals.")
    corpus.write_json("classic", res)
    return res
