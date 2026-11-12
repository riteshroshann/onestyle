"""Text summarisation of a customer-maker thread into the one line a tailor needs.

Extractive TextRank and lead baselines pick turns from the thread; the engine's own `phrase()` (run in Node on
the customer turns, so it is the deployed summariser) writes a line from the extracted design. All are scored
with ROUGE-1/2/L F1 against hand-written one-line references (data/gold/summaries.jsonl, 24 threads, one annotator).
ROUGE here is implemented directly: lower-cased word tokens, no stemming, so absolute values are not comparable
with other toolkits.
"""
from __future__ import annotations

import itertools
import json
import math
import re
import subprocess
from collections import Counter

import numpy as np

from .common import GOLD, ROOT, bootstrap_ci, read_jsonl, write_result

TOKEN = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


def words(text: str) -> list[str]:
    return TOKEN.findall(text.lower())


def ngrams(toks: list[str], n: int) -> Counter:
    return Counter(tuple(toks[i:i + n]) for i in range(len(toks) - n + 1))


def f1(overlap: int, n_pred: int, n_ref: int) -> float:
    if not overlap:
        return 0.0
    p, r = overlap / n_pred, overlap / n_ref
    return 2 * p * r / (p + r)


def lcs(a: list[str], b: list[str]) -> int:
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if x == y else max(prev[j], cur[j - 1]))
        prev = cur
    return prev[-1]


def rouge(pred: str, ref: str) -> dict[str, float]:
    p, r = words(pred), words(ref)
    out = {}
    for n in (1, 2):
        pg, rg = ngrams(p, n), ngrams(r, n)
        out[f"rouge{n}"] = f1(sum((pg & rg).values()), sum(pg.values()), sum(rg.values()))
    out["rougeL"] = f1(lcs(p, r), len(p), len(r))
    return out


def textrank(sentences: list[str], damping: float = 0.85, iters: int = 50) -> list[float]:
    """PageRank over a sentence graph whose edge weights are TF-IDF cosine similarities."""
    docs = [Counter(words(s)) for s in sentences]
    df = Counter(t for d in docs for t in d)
    n = len(docs)
    vocab = {t: i for i, t in enumerate(df)}
    X = np.zeros((n, len(vocab)))
    for i, d in enumerate(docs):
        for t, c in d.items():
            X[i, vocab[t]] = (1 + math.log(c)) * math.log((1 + n) / (1 + df[t]) + 1)
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    X = X / np.where(norms == 0, 1, norms)
    W = X @ X.T
    np.fill_diagonal(W, 0)
    col = W.sum(0)
    M = W / np.where(col == 0, 1, col)
    r = np.full(n, 1 / n)
    for _ in range(iters):
        r = (1 - damping) / n + damping * M @ r
    return list(r)


def pick(turns: list[str], scores: list[float], k: int) -> str:
    top = sorted(sorted(range(len(turns)), key=lambda i: -scores[i])[:k])
    return " ".join(turns[i] for i in top)


def deployed_phrases(customer_turns: list[list[str]]) -> list[str]:
    """engine phrase() on the customer's messages, run by the shipped TypeScript."""
    items = [{"messages": m} for m in customer_turns]
    out = subprocess.run(["node", "--experimental-strip-types", "scripts/eval-bridge.mjs"], cwd=ROOT / "web", input=json.dumps({"items": items}),
                         capture_output=True, text=True, check=True, encoding="utf8")
    return [r["phrase"] for r in json.loads(out.stdout)]


def oracle(turns: list[str], ref: str, k: int) -> str:
    """Best k turns by ROUGE-L against the reference: the ceiling for any extractive method."""
    best = max(itertools.combinations(range(len(turns)), k), key=lambda c: rouge(" ".join(turns[i] for i in c), ref)["rougeL"])
    return " ".join(turns[i] for i in best)


def run() -> dict:
    rows = read_jsonl(GOLD / "summaries.jsonl")
    turns = [[t.split(": ", 1)[1] for t in r["thread"]] for r in rows]
    customer = [[t.split(": ", 1)[1] for t in r["thread"] if t.startswith("C:")] for r in rows]
    refs = [r["reference"] for r in rows]
    systems = {
        "lead_1_turn": [t[0] for t in turns],
        "lead_2_turns": [" ".join(t[:2]) for t in turns],
        "last_customer_turn": [c[-1] for c in customer],
        "all_customer_turns": [" ".join(c) for c in customer],
        "textrank_top_2_turns": [pick(t, textrank(t), 2) for t in turns],
        "textrank_top_2_customer_turns": [pick(c, textrank(c), 2) for c in customer],
        "oracle_best_2_turns": [oracle(t, ref, 2) for t, ref in zip(turns, refs)],
        "engine_phrase": deployed_phrases(customer),
    }
    out: dict = {"task": "one-line thread summaries", "gold": "data/gold/summaries.jsonl", "n_threads": len(rows), "seed": 13,
                 "interval": "bootstrap over threads, 1000 resamples", "mean_reference_words": round(float(np.mean([len(words(r)) for r in refs])), 1), "systems": {}}
    for name, preds in systems.items():
        per = [rouge(p, r) for p, r in zip(preds, refs)]
        entry = {"mean_words": round(float(np.mean([len(words(p)) for p in preds])), 1)}
        for m in ("rouge1", "rouge2", "rougeL"):
            vals = [x[m] for x in per]
            entry[m] = round(float(np.mean(vals)), 4)
            entry[f"{m}_ci95"] = bootstrap_ci(vals, lambda v: float(np.mean(v)))
        out["systems"][name] = entry
    out["examples"] = [{"id": rows[i]["id"], "reference": refs[i], "engine_phrase": systems["engine_phrase"][i], "textrank": systems["textrank_top_2_turns"][i]} for i in (0, 1, 12)]
    write_result("summarisation", out)
    return out
