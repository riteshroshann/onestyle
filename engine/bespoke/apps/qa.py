"""Question answering for the help chatbot: a dense and a hybrid retrieval arm next to the deployed BM25.

BM25 scores come from the shipped JavaScript (web/scripts/eval-retrieval.mjs --scores), so the baseline is the
product, not a copy. The dense arm embeds passages and questions with bge-small-en-v1.5 (English-only, 33M
parameters); the hybrid fuses the two rankings by reciprocal rank (k = 60, no tuned weights).
Writes results/retrieval_dense.json. Run `node scripts/eval-retrieval.mjs` first for results/retrieval.json.
"""
from __future__ import annotations

import json
import subprocess

import numpy as np

from .common import GOLD, ROOT, bootstrap_ci, read_jsonl, write_result

MODEL = "BAAI/bge-small-en-v1.5"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "  # the model card's recipe for short queries
RRF_K = 60


def bm25_scores() -> tuple[list[str], dict[str, dict[str, float]]]:
    out = subprocess.run(["node", "--experimental-strip-types", "scripts/eval-retrieval.mjs", "--scores"], cwd=ROOT / "web",
                         capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    return data["chunks"], {r["id"]: r["scores"] for r in data["rows"]}


def embed(texts: list[str]) -> np.ndarray:
    import torch
    from transformers import AutoModel, AutoTokenizer

    tok, model = AutoTokenizer.from_pretrained(MODEL), AutoModel.from_pretrained(MODEL).eval()
    vecs = []
    for i in range(0, len(texts), 16):
        with torch.no_grad():
            enc = tok(texts[i:i + 16], padding=True, truncation=True, max_length=512, return_tensors="pt")
            v = model(**enc).last_hidden_state[:, 0]
        vecs.append(torch.nn.functional.normalize(v, dim=-1).numpy())
    return np.concatenate(vecs)


def ranks_of(scores: np.ndarray) -> np.ndarray:
    order = np.argsort(-scores, kind="stable")
    r = np.empty(len(scores), dtype=int)
    r[order] = np.arange(1, len(scores) + 1)
    return r


def rrf(*score_rows: np.ndarray) -> np.ndarray:
    return sum(1.0 / (RRF_K + ranks_of(s)) for s in score_rows)


def retrieval_metrics(gold_ix: list[int], score_rows: list[np.ndarray]) -> dict:
    rank = [int(ranks_of(s)[g]) for g, s in zip(gold_ix, score_rows)]
    f = lambda rs: {"recall_at_1": round(float(np.mean([r <= 1 for r in rs])), 4), "recall_at_3": round(float(np.mean([r <= 3 for r in rs])), 4),  # noqa: E731
                    "recall_at_5": round(float(np.mean([r <= 5 for r in rs])), 4), "mrr": round(float(np.mean([1 / r for r in rs])), 4)}
    m = f(rank)
    m["recall_at_1_ci95"] = bootstrap_ci(rank, lambda rs: float(np.mean([r <= 1 for r in rs])))
    m["mrr_ci95"] = bootstrap_ci(rank, lambda rs: float(np.mean([1 / r for r in rs])))
    return m


def auroc(pos: list[float], neg: list[float]) -> float:
    return float(np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg]))


def run() -> dict:
    rows = read_jsonl(GOLD / "retrieval.jsonl")
    chunks_meta = json.loads((ROOT / "web" / "lib" / "assistant" / "index.json").read_text(encoding="utf8"))["chunks"]
    ids, bm = bm25_scores()
    assert ids == [c["id"] for c in chunks_meta]
    P = embed([f"{c['title']}. {c['text']}" for c in chunks_meta])
    Q = embed([QUERY_PREFIX + r["q"] for r in rows])
    dense = Q @ P.T
    bm_rows = [np.array([bm[r["id"]].get(i, 0.0) for i in ids]) for r in rows]
    arms = {"bm25_deployed": bm_rows, "dense_bge_small": list(dense), "hybrid_rrf": [rrf(b, d) for b, d in zip(bm_rows, dense)]}
    ans = [k for k, r in enumerate(rows) if r["chunk"]]
    gold_ix = [ids.index(rows[k]["chunk"]) for k in ans]
    out: dict = {"task": "retrieval arms on the held-out help questions", "gold": "data/gold/retrieval.jsonl", "n_answerable": len(ans),
                 "n_unanswerable": len(rows) - len(ans), "embedding_model": MODEL, "fusion": f"reciprocal rank, k={RRF_K}", "seed": 13,
                 "interval": "bootstrap over questions, 1000 resamples", "arms": {}}
    for name, score_rows in arms.items():
        out["arms"][name] = retrieval_metrics(gold_ix, [score_rows[k] for k in ans])
    # answerability from the top score: bm25 score and dense cosine; the hybrid has no calibrated score, so it reuses the dense one
    for name, score_rows in (("bm25_top_score", bm_rows), ("dense_top_cosine", list(dense))):
        top = [float(s.max()) for s in score_rows]
        pos = [top[k] for k in ans]
        neg = [top[k] for k in range(len(rows)) if not rows[k]["chunk"]]
        grid = sorted(set(round(t, 3) for t in top))
        best_j = max(grid, key=lambda t: np.mean([p >= t for p in pos]) - np.mean([n >= t for n in neg]))
        out.setdefault("answerability", {})[name] = {
            "auroc": round(auroc(pos, neg), 4), "auroc_ci95": bootstrap_ci(list(zip(top, [bool(r["chunk"]) for r in rows])),
                                                                          lambda xs: auroc([t for t, a in xs if a], [t for t, a in xs if not a])),
            "youden_threshold_on_all_questions": best_j, "answers_given_to_answerable": round(float(np.mean([p >= best_j for p in pos])), 4),
            "answers_given_to_unanswerable": round(float(np.mean([n >= best_j for n in neg])), 4),
            "note": "threshold picked on the same questions it is scored on, so optimistic"}
    write_result("retrieval_dense", out)
    return out
