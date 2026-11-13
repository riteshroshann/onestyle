"""Graph NLP: an ontology-value graph from catalogue co-occurrence, with PageRank and label propagation written in numpy.

Nodes are canonical ontology values (tag, value). An edge joins two values that appear together in catalogue items,
weighted by positive PMI; optional structural edges join garments of one family. Two held-out tasks:
  completion   hide one attribute of a held-out item, rank the candidates of that tag from the rest
  propagation  label a few values with the usage class their items have, spread labels over the graph
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations

import numpy as np

from ..lexicon import ontology, tag_rules, tokenize
from . import corpus
from .stats import bootstrap_mean_ci

SEED = corpus.SEED
Node = tuple[str, str]
MIN_COUNT = 5
USAGES = ["Casual", "Sports", "Ethnic", "Formal"]


# ------------------------------------------------------------------ algorithms
def pagerank(w: np.ndarray, personalisation: np.ndarray, alpha: float = 0.85, tol: float = 1e-12, max_iter: int = 200) -> np.ndarray:
    """Personalised PageRank by power iteration. Rows of `personalisation` are restart distributions (batched).
    Dangling nodes restart from the personalisation vector, as networkx does."""
    p = personalisation / personalisation.sum(1, keepdims=True)
    deg = w.sum(1)
    trans = np.divide(w, deg[:, None], out=np.zeros_like(w), where=deg[:, None] > 0)
    dangling = deg == 0
    r = p.copy()
    for _ in range(max_iter):
        nxt = alpha * (r @ trans + r[:, dangling].sum(1, keepdims=True) * p) + (1 - alpha) * p
        if np.abs(nxt - r).sum(1).max() < tol:
            return nxt
        r = nxt
    return r


def label_propagation(w: np.ndarray, y: np.ndarray, alpha: float = 0.9, iterations: int = 200) -> np.ndarray:
    """Label spreading (Zhou et al. 2004): F <- alpha S F + (1 - alpha) Y with S = D^-1/2 W D^-1/2. y is [n, classes], zero rows are unlabelled."""
    d = w.sum(1)
    inv = np.divide(1, np.sqrt(d), out=np.zeros_like(d), where=d > 0)
    s = inv[:, None] * w * inv[None, :]
    f = y.copy()
    for _ in range(iterations):
        f = alpha * s @ f + (1 - alpha) * y
    return f


# ------------------------------------------------------------------ graph from items
def item_values(tokens: list[str]) -> frozenset[Node]:
    return frozenset((s.tag, s.value) for s in tag_rules(tokens) if s.value)


def catalogue_items() -> tuple[list[frozenset[Node]], list[str]]:
    df = corpus.catalogue_frame()
    items, usage = [], []
    for title, art, col, season, use in zip(df["productDisplayName"], df["articleType"], df["baseColour"], df["season"], df["usage"]):
        toks = tokenize(str(title)) + tokenize(str(art)) + tokenize(str(col)) + tokenize(str(season))
        items.append(item_values(toks))
        usage.append(use if isinstance(use, str) else "")
    return items, usage


def structure_edges() -> list[tuple[Node, Node]]:
    fam = ontology()["garment_family"]
    return [(("GARMENT", a), ("GARMENT", b)) for members in fam.values() for a, b in combinations(members, 2)]


class ValueGraph:
    def __init__(self, items: list[frozenset[Node]], structure: float = 0.0, min_count: int = MIN_COUNT):
        self.nodes: list[Node] = sorted({(t, v) for t, vs in ontology()["lexicon"].items() if t != "NUM" for v in vs})
        self.index = {n: i for i, n in enumerate(self.nodes)}
        n = len(self.nodes)
        single, pair = Counter(), Counter()
        for it in items:
            single.update(it)
            pair.update(combinations(sorted(it), 2))
        total = len(items)
        w, count, cond = np.zeros((n, n)), np.zeros((n, n)), np.zeros((n, n))
        for (a, b), c in pair.items():
            if c >= min_count and a in self.index and b in self.index:
                i, j = self.index[a], self.index[b]
                count[i, j] = count[j, i] = c
                cond[i, j], cond[j, i] = c / single[a], c / single[b]  # cond[i, j] = P(j | i)
                v = np.log(c * total / (single[a] * single[b]))
                if v > 0:
                    w[i, j] = w[j, i] = v
        for a, b in structure_edges():
            if structure and a in self.index and b in self.index:
                w[self.index[a], self.index[b]] = w[self.index[b], self.index[a]] = w[self.index[a], self.index[b]] + structure
        self.w, self.count, self.cond = w, count, cond
        self.prior = np.array([single[nd] for nd in self.nodes], dtype=float) + 1
        self.tag_mask = {t: np.array([nd[0] == t for nd in self.nodes]) for t in ontology()["tags"]}

    def seeds(self, known: list[list[Node]]) -> np.ndarray:
        s = np.full((len(known), len(self.nodes)), 1e-9)
        for r, vs in enumerate(known):
            for v in vs:
                if v in self.index:
                    s[r, self.index[v]] += 1
        return s


# ------------------------------------------------------------------ evaluation
def split_items(items: list, frac: float = 0.8) -> tuple[list[int], list[int]]:
    idx = np.random.default_rng(SEED).permutation(len(items)).tolist()
    cut = int(frac * len(items))
    return idx[:cut], idx[cut:]


def completion_study(items: list[frozenset[Node]], train_idx: list[int], test_idx: list[int], structure: float) -> dict:
    g = ValueGraph([items[i] for i in train_idx], structure=structure)
    rng = np.random.default_rng(SEED)
    cases = []
    for i in test_idx:
        vals = sorted(v for v in items[i] if v in g.index and v[0] in ("GARMENT", "COLOUR", "FABRIC", "PATTERN", "OCCASION", "STYLE", "SLEEVE", "NECKLINE"))
        if len(items[i]) >= 3 and vals:
            hidden = vals[int(rng.integers(len(vals)))]
            cases.append((hidden, [v for v in items[i] if v != hidden]))
    seeds = g.seeds([k for _, k in cases])
    ppr = pagerank(g.w, seeds)
    vote = seeds @ g.w
    scores = {
        "frequency prior": np.tile(g.prior, (len(cases), 1)),
        "conditional-probability vote": seeds @ g.cond,
        "PPMI neighbour vote": vote,
        "personalised PageRank, PPMI edges": ppr,
        "personalised PageRank, count edges": pagerank(g.count, seeds),
    }
    out = {}
    for name, s in scores.items():
        ranks = []
        for (hidden, _), row in zip(cases, s):
            mask = g.tag_mask[hidden[0]]
            cand = np.where(mask)[0]
            order = cand[np.argsort(-row[cand], kind="stable")]
            ranks.append(int(np.where(order == g.index[hidden])[0][0]) + 1)
        r = np.array(ranks, dtype=float)
        out[name] = {"hit@1": round(float((r == 1).mean()), 4), "hit@3": round(float((r <= 3).mean()), 4), "mrr": round(float((1 / r).mean()), 4),
                     "mrr_ci95": bootstrap_mean_ci(1 / r)}
    out["n_cases"] = len(cases)
    out["graph_edges"] = int((g.w > 0).sum() // 2)
    return out


def propagation_study(items: list[frozenset[Node]], usage: list[str], train_idx: list[int], test_idx: list[int]) -> dict:
    g = ValueGraph([items[i] for i in train_idx])
    truth: dict[Node, Counter] = {}
    for i in test_idx:
        if usage[i] in USAGES:
            for v in items[i]:
                truth.setdefault(v, Counter())[usage[i]] += 1
    nodes = [v for v, c in truth.items() if sum(c.values()) >= 10 and v in g.index and g.w[g.index[v]].sum() > 0]
    label = {v: USAGES.index(truth[v].most_common(1)[0][0]) for v in nodes}
    majority = Counter(label.values()).most_common(1)[0][0]
    rng = np.random.default_rng(SEED)
    acc_graph, acc_major, bal_graph, bal_major = [], [], [], []
    for _ in range(50):
        perm = rng.permutation(len(nodes))
        seed_nodes = [nodes[i] for i in perm[: max(len(nodes) // 5, 4)]]
        y = np.zeros((len(g.nodes), len(USAGES)))
        for v in seed_nodes:
            y[g.index[v], label[v]] = 1
        f = label_propagation(g.w, y)
        rest = [v for v in nodes if v not in set(seed_nodes)]
        acc_graph.append(np.mean([f[g.index[v]].argmax() == label[v] and f[g.index[v]].max() > 0 for v in rest]))
        acc_major.append(np.mean([label[v] == majority for v in rest]))
        bal_graph.append(_balanced([label[v] for v in rest], [int(f[g.index[v]].argmax()) for v in rest]))
        bal_major.append(_balanced([label[v] for v in rest], [majority] * len(rest)))
    return {"labelled_values": len(nodes), "seeds_per_run": max(len(nodes) // 5, 4), "runs": 50,
            "accuracy_label_propagation": {"mean": round(float(np.mean(acc_graph)), 4), "ci95": bootstrap_mean_ci(np.array(acc_graph))},
            "accuracy_majority_class": {"mean": round(float(np.mean(acc_major)), 4), "ci95": bootstrap_mean_ci(np.array(acc_major))},
            "balanced_accuracy": {"label_propagation": round(float(np.mean(bal_graph)), 4), "majority_class": round(float(np.mean(bal_major)), 4)},
            "note": "values are labelled with the dominant usage of held-out items that contain them (at least 10 items); a few are seeds, the rest are scored"}


def _balanced(true: list[int], pred: list[int]) -> float:
    classes = sorted(set(true))
    return float(np.mean([np.mean([p == t for p, t0 in zip(pred, true) if t0 == t]) for t in classes]))


def run() -> dict:
    if not corpus.catalogue_available():
        res = {"topic": "graph NLP", "skipped": "data/raw/styles.csv is missing; 82 gold requests are too few for co-occurrence statistics"}
        corpus.write_json("graph", res)
        return res
    items, usage = catalogue_items()
    train_idx, test_idx = split_items(items)
    res = {"topic": "graph NLP", "seed": SEED, "items": len(items), "split": f"{len(train_idx)} items build the graph / {len(test_idx)} held out",
           "nodes": 0, "completion": {}, "label_propagation": propagation_study(items, usage, train_idx, test_idx),
           "caveat": "Catalogue items are English product titles plus structured fields, mostly menswear, footwear and accessories; garment and colour "
                     "co-occurrence there is not tailoring-request co-occurrence. Hidden values are drawn from values the gazetteer found, so the task is "
                     "consistent with how the graph was built."}
    for name, s in (("co-occurrence edges only", 0.0), ("co-occurrence + garment-family edges", 1.0)):
        res["completion"][name] = completion_study(items, train_idx, test_idx, s)
    res["nodes"] = len(ValueGraph([]).nodes)
    corpus.write_json("graph", res)
    return res
