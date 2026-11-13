"""Association measures match nltk's reference implementations."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp import colloc  # noqa: E402


def test_measures_match_nltk():
    from nltk.metrics import BigramAssocMeasures as B
    c_xy, c_x, c_y, n = 30, 80, 120, 5000
    assert colloc.pmi(c_xy, c_x, c_y, n) == pytest.approx(B.pmi(c_xy, (c_x, c_y), n))
    assert colloc.t_score(c_xy, c_x, c_y, n) == pytest.approx(B.student_t(c_xy, (c_x, c_y), n), rel=1e-6)
    assert colloc.llr(c_xy, c_x, c_y, n) == pytest.approx(B.likelihood_ratio(c_xy, (c_x, c_y), n), rel=1e-6)


def test_npmi_is_one_for_perfect_pair():
    assert colloc.npmi(50, 50, 50, 10000) == pytest.approx(1.0)


def test_score_bigrams_ranks_a_planted_collocation_first():
    sents = [["puff", "sleeve", "x"], ["a", "puff", "sleeve"]] * 10 + [["a", "b", "c", "d"]] * 10
    ranked = colloc.score_bigrams(sents, min_count=5)
    assert ranked["llr"][0][0] == ("puff", "sleeve")
