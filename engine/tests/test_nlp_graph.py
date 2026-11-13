"""PageRank and label propagation match networkx and scikit-learn; the value graph keeps ontology nodes."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.graph import ValueGraph, label_propagation, pagerank  # noqa: E402

RNG = np.random.default_rng(5)
A = RNG.random((8, 8)) * (RNG.random((8, 8)) > 0.5)
W = np.triu(A, 1) + np.triu(A, 1).T
W[7] = 0
W[:, 7] = 0  # node 7 is isolated, so the dangling rule is exercised


def test_personalised_pagerank_matches_networkx():
    import networkx as nx
    g = nx.from_numpy_array(W)
    pers = {i: (3.0 if i == 2 else 1.0) for i in range(8)}
    want = nx.pagerank(g, alpha=0.85, personalization=pers, tol=1e-12, max_iter=1000)
    got = pagerank(W, np.array([[pers[i] for i in range(8)]]))[0]
    np.testing.assert_allclose(got, [want[i] for i in range(8)], atol=1e-8)


def test_label_propagation_matches_sklearn_label_spreading():
    from sklearn.semi_supervised import LabelSpreading
    y = np.full(8, -1)
    y[0], y[1] = 0, 1
    onehot = np.zeros((8, 2))
    onehot[0, 0] = onehot[1, 1] = 1
    got = label_propagation(W, onehot, alpha=0.9, iterations=500)
    ref = LabelSpreading(kernel=lambda a, b: W[np.ix_(a[:, 0].astype(int), b[:, 0].astype(int))], alpha=0.9, max_iter=500, tol=1e-10)
    ref.fit(np.arange(8)[:, None].astype(float), y)
    connected = np.arange(7)
    np.testing.assert_allclose(got[connected] / got[connected].sum(1, keepdims=True), ref.label_distributions_[connected], atol=1e-6)


def test_value_graph_nodes_and_cooccurrence_edges():
    items = [frozenset({("GARMENT", "kurti"), ("COLOUR", "blue")})] * 6 + [frozenset({("GARMENT", "kurti"), ("COLOUR", "red")})] * 2
    g = ValueGraph(items, min_count=5)
    i, j, k = g.index[("GARMENT", "kurti")], g.index[("COLOUR", "blue")], g.index[("COLOUR", "red")]
    assert g.cond[i, j] == pytest.approx(6 / 8) and g.cond[j, i] == 1.0
    assert g.count[i, k] == 0 and g.w.shape == (len(g.nodes),) * 2 and (g.w == g.w.T).all()


def test_pagerank_rows_are_distributions():
    r = pagerank(W, np.eye(8)[:3] + 1e-9)
    np.testing.assert_allclose(r.sum(1), 1.0)
