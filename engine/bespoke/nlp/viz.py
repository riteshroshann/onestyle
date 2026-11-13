"""Reproducible figures from the results files. Every figure is drawn from results/*.json (or the cached
fastText vectors written by the embeddings study); rerun `python scripts/syllabus.py figures` to regenerate.
One accent colour, grey for everything else.
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from . import corpus  # noqa: E402

ACCENT, GREY, LIGHT = "#c2410c", "#6b7280", "#d1d5db"
plt.rcParams.update({"font.family": "serif", "axes.spines.top": False, "axes.spines.right": False, "axes.edgecolor": GREY,
                     "axes.labelcolor": "#111827", "xtick.color": GREY, "ytick.color": GREY, "figure.dpi": 100, "savefig.dpi": 200,
                     "svg.hashsalt": "bespoke", "figure.facecolor": "white", "axes.facecolor": "white"})


def _load(name: str) -> dict | None:
    p = corpus.RESULTS / f"{name}.json"
    return json.loads(p.read_text(encoding="utf8")) if p.exists() else None


def _save(fig, name: str) -> Path:
    corpus.FIGURES.mkdir(parents=True, exist_ok=True)
    path = corpus.FIGURES / f"{name}.png"
    fig.savefig(path, bbox_inches="tight", metadata={"Software": None})
    plt.close(fig)
    return path


def perplexity_by_order() -> Path | None:
    r = _load("ngram")
    if not r or not isinstance(r.get("catalogue_perplexity_by_order"), dict):
        return None
    table = r["catalogue_perplexity_by_order"]["table"]
    orders = sorted(table)
    fig, ax = plt.subplots(figsize=(5.2, 3.4))
    for i, m in enumerate(["add-k", "Witten-Bell", "Kneser-Ney (modified)"]):
        y = [table[o][m]["perplexity"] for o in orders]
        ax.plot(range(1, len(orders) + 1), y, marker="o", color=ACCENT if m.startswith("Kneser") else (GREY, LIGHT)[i == 0], label=m)
    ax.set_yscale("log")
    ax.set_xticks(range(1, len(orders) + 1))
    ax.set_xlabel("n-gram order")
    ax.set_ylabel("held-out perplexity (log)")
    ax.legend(frameon=False)
    return _save(fig, "ngram_perplexity")


def embedding_projection() -> Path | None:
    path = corpus.CACHE / "ontology_fasttext.npz"
    if not path.exists():
        return None
    from sklearn.decomposition import PCA
    d = np.load(path)
    xy = PCA(2, random_state=corpus.SEED).fit_transform(d["vecs"])
    tags = d["tags"]
    fig, ax = plt.subplots(figsize=(5.6, 4.6))
    focus = ["GARMENT", "COLOUR", "FABRIC", "NECKLINE"]
    ax.scatter(xy[:, 0], xy[:, 1], s=8, color=LIGHT, label="other tags")
    for t, c in zip(focus, [ACCENT, "#111827", GREY, "#9a3412"]):
        m = tags == t
        ax.scatter(xy[m, 0], xy[m, 1], s=14, color=c, marker="os^D"[focus.index(t)], label=t.lower())
    ax.set_xlabel("PCA 1")
    ax.set_ylabel("PCA 2")
    ax.legend(frameon=False, fontsize=8)
    return _save(fig, "embedding_projection_fasttext")


def topic_words() -> Path | None:
    r = _load("topics")
    if not r or "settings" not in r:
        return None
    best = r["settings"]["all content words"]["best_by_npmi"]
    topics = best["topics"][:8]
    fig, ax = plt.subplots(figsize=(7, 0.5 * len(topics) + 0.6))
    ax.axis("off")
    for i, t in enumerate(topics):
        ax.text(0, -i, f"{i + 1}", color=ACCENT, fontsize=10, va="center", ha="right")
        ax.text(0.02, -i, "  ".join(t[:8]), fontsize=10, va="center", color="#111827")
    ax.set_xlim(-0.05, 1)
    ax.set_ylim(-len(topics) + 0.5, 0.7)
    ax.set_title(f"{best['method']}, k={best['k']}: top words per topic", loc="left", fontsize=10, color=GREY)
    return _save(fig, "topic_words")


def _heat(matrix: list[list[int]], labels: list[str], name: str, title: str) -> Path:
    m = np.array(matrix, dtype=float)
    keep = [i for i in range(len(labels)) if m[i].sum() + m[:, i].sum() > 0]
    m, labs = m[np.ix_(keep, keep)], [labels[i] for i in keep]
    norm = m / np.maximum(m.sum(1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(0.42 * len(labs) + 2, 0.42 * len(labs) + 1.6))
    ax.imshow(norm, cmap="Oranges", vmin=0, vmax=1)
    ax.set_xticks(range(len(labs)), labs, rotation=90, fontsize=7)
    ax.set_yticks(range(len(labs)), labs, fontsize=7)
    ax.set_xlabel("predicted")
    ax.set_ylabel("gold")
    ax.set_title(title, loc="left", fontsize=9, color=GREY)
    for s in ax.spines.values():
        s.set_visible(False)
    return _save(fig, name)


def confusion_matrices() -> list[Path]:
    out = []
    a = _load("analysis")
    if a:
        c = a["token_confusion"]["L2b CRF + gazetteer"]
        out.append(_heat(c["matrix"], c["labels"], "confusion_tokens_crf_gazetteer", "Token-level entity type, CRF + gazetteer (rows sum to 1)"))
    k = _load("classic")
    if k:
        c = k["confusion_logreg"]
        out.append(_heat(c["matrix"], c["labels"], "confusion_guard_logreg", "Guard classifier, cross-validated (rows sum to 1)"))
    return out


def robustness_curve() -> Path | None:
    r = _load("robustness")
    if not r:
        return None
    levels = [k for k in r["table"] if k.startswith("char noise")]
    xs = [int(k.split()[-1].rstrip("%")) for k in levels]
    fig, ax = plt.subplots(figsize=(5.2, 3.4))
    for name, col in (("L0 gazetteer", LIGHT), ("L0 + morphology", ACCENT), ("CRF + gazetteer", GREY)):
        ax.plot(xs, [r["table"][k][name]["f1"] for k in levels], marker="o", color=col, label=name)
    ax.set_xlabel("share of entity words with a typo (%)")
    ax.set_ylabel("span F1, gold test")
    ax.legend(frameon=False)
    return _save(fig, "robustness_noise")


def completion_bars() -> Path | None:
    r = _load("graph")
    if not r or "completion" not in r:
        return None
    c = r["completion"]["co-occurrence edges only"]
    names = [k for k in c if isinstance(c[k], dict)]
    vals = [c[k]["mrr"] for k in names]
    fig, ax = plt.subplots(figsize=(5.6, 2.8))
    ax.barh(names[::-1], vals[::-1], color=[ACCENT if v == max(vals) else LIGHT for v in vals[::-1]])
    ax.set_xlabel("mean reciprocal rank, held-out items")
    return _save(fig, "graph_completion")


def run() -> dict:
    made = [perplexity_by_order(), embedding_projection(), topic_words(), robustness_curve(), completion_bars(), *confusion_matrices()]
    done = [str(p.relative_to(corpus.ROOT)).replace("\\", "/") for p in made if p]
    print("\n".join(done))
    return {"figures": done}
