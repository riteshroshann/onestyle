"""HMM: Viterbi equals brute force, forward-backward equals enumeration, emissions normalise per tag, EM raises likelihood."""
import itertools
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.hmm import HMM, forward_backward, viterbi_log  # noqa: E402

RNG = np.random.default_rng(3)
K, T = 3, 4
START = np.log(RNG.dirichlet(np.ones(K)))
TRANS = np.log(RNG.dirichlet(np.ones(K), K))
EMIT = np.log(RNG.dirichlet(np.ones(K), T))


def path_score(path):
    s = START[path[0]] + EMIT[0, path[0]]
    for t in range(1, T):
        s += TRANS[path[t - 1], path[t]] + EMIT[t, path[t]]
    return s


def test_viterbi_matches_brute_force():
    best = max(itertools.product(range(K), repeat=T), key=path_score)
    assert tuple(viterbi_log(START, TRANS, EMIT)) == best


def test_forward_backward_matches_enumeration():
    paths = list(itertools.product(range(K), repeat=T))
    scores = np.array([path_score(p) for p in paths])
    ll = np.log(np.exp(scores).sum())
    gamma, xi, got = forward_backward(START, TRANS, EMIT)
    assert got == pytest.approx(ll)
    want = np.zeros((T, K))
    for p, s in zip(paths, scores):
        for t, j in enumerate(p):
            want[t, j] += np.exp(s - ll)
    np.testing.assert_allclose(gamma, want, atol=1e-9)
    assert xi.sum() == pytest.approx(T - 1)


ROWS = [{"tokens": ["red", "kurti", "chahiye"], "tags": ["B-COLOUR", "B-GARMENT", "O"]},
        {"tokens": ["blue", "kurta", "please"], "tags": ["B-COLOUR", "B-GARMENT", "O"]}] * 5


def test_emissions_sum_to_one_per_tag_over_the_word_table():
    m = HMM().fit(ROWS)
    words = [k for k in m.emit if not k.startswith(("s3:", "s2:"))]
    total = sum(np.exp(m.emit[w]) for w in words)
    assert total[m.L["B-COLOUR"]] < 1 and total[m.L["B-COLOUR"]] > 0.9  # the rest is the unseen-word mass


def test_unseen_word_uses_suffix_backoff():
    assert HMM().fit(ROWS).predict(["green", "kurtas"])[1] == "B-GARMENT"
    assert HMM().fit(ROWS).predict(["blue", "kurta"]) == ["B-COLOUR", "B-GARMENT"]


def test_baum_welch_does_not_lower_likelihood():
    m = HMM().fit(ROWS[:2])
    unl = [["red", "kurti"], ["blue", "kurta", "chahiye"]] * 3
    lls = m.baum_welch(unl, iterations=3)
    assert lls[-1] >= lls[0] - 1e-6
