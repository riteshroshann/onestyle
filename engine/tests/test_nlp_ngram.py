"""N-gram models: probabilities normalise, smoothing orders as expected, agreement with nltk within its conventions."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.ngram import NGramLM  # noqa: E402

S = [["a", "puff", "sleeve", "kurti"], ["a", "kurti", "with", "puff", "sleeve"], ["a", "v", "neck", "kurti"], ["kurti", "with", "v", "neck"]] * 3 + [["a", "b"]]


@pytest.mark.parametrize("method,kw", [("kn", {}), ("kn", {"modified": False}), ("wb", {}), ("addk", {})])
@pytest.mark.parametrize("order", [1, 2, 3, 4])
def test_probabilities_sum_to_one(method, kw, order):
    m = NGramLM(order, method, **kw).fit(S)
    for hist in [("a", "puff", "x"), ("<s>", "<s>", "<s>"), ("zzz", "qqq", "rrr")]:
        assert sum(m.prob(w, hist[:order - 1]) for w in m.vocab) == pytest.approx(1.0)


def test_kneser_ney_close_to_nltk_with_fixed_discount():
    from nltk.lm import KneserNeyInterpolated
    from nltk.lm.preprocessing import padded_everygram_pipeline
    train, vocab = padded_everygram_pipeline(2, S)
    ref = KneserNeyInterpolated(2, discount=0.75)
    ref.fit(train, vocab)
    mine = NGramLM(2, "kn", modified=False, discount=0.75).fit(S)
    for h, w in [("a", "puff"), ("puff", "sleeve"), ("kurti", "with")]:
        assert mine.prob(w, (h,)) == pytest.approx(ref.score(w, [h]), abs=0.01)  # nltk sizes its uniform floor differently


def test_perplexity_of_seen_text_beats_unseen_text():
    m = NGramLM(3, "kn").fit(S)
    assert m.perplexity([["a", "puff", "sleeve", "kurti"]]) < m.perplexity([["sleeve", "a", "kurti", "puff"]])


def test_unseen_word_maps_to_unk_and_keeps_mass():
    m = NGramLM(2, "kn", min_count=2).fit(S)
    assert 0 < m.prob("zzz", ("a",)) < 0.2


def test_modified_discounts_are_ordered():
    d1, d2, d3 = NGramLM(3, "kn").fit(S).D[3]
    assert 0 < d1 < 1 and 0 < d2 < 2 and 0 < d3 < 3  # Chen and Goodman's bounds
