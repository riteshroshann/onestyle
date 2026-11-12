"""One-hot, BoW and TF-IDF match scikit-learn on a small corpus."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.vectors import BagOfWords, Tfidf, Vocabulary, bm25_scores, join_multiword, one_hot  # noqa: E402

DOCS = [["a", "puff", "sleeve", "kurti"], ["kurta", "kurti", "kurti"], ["puff", "sleeve", "blouse", "a"], ["v", "neck", "kurti"]]


def test_one_hot_words_are_orthogonal_and_unknown_is_zero():
    v = Vocabulary.build(DOCS)
    m = one_hot(v, ["kurti", "kurta", "zzz"]).toarray()
    assert m.shape == (3, len(v)) and m[0] @ m[1] == 0 and m[0] @ m[0] == 1 and m[2].sum() == 0


def test_bow_matches_countvectorizer_with_bigrams():
    from sklearn.feature_extraction.text import CountVectorizer
    ref = CountVectorizer(tokenizer=str.split, token_pattern=None, lowercase=False, ngram_range=(1, 2))
    want = ref.fit_transform(" ".join(d) for d in DOCS)
    bow = BagOfWords(ngram=(1, 2)).fit(DOCS)
    assert list(bow.vocab.index) == sorted(bow.vocab.index) and len(bow.vocab) == want.shape[1]
    assert (bow.transform(DOCS) != want).nnz == 0


def test_min_df_drops_rare_features():
    assert "blouse" not in BagOfWords(min_df=2).fit(DOCS).vocab.index


@pytest.mark.parametrize("sublinear", [False, True])
def test_tfidf_matches_sklearn(sublinear):
    from sklearn.feature_extraction.text import TfidfTransformer
    counts = BagOfWords().fit(DOCS).transform(DOCS)
    want = TfidfTransformer(sublinear_tf=sublinear).fit_transform(counts).toarray()
    got = Tfidf(sublinear).fit(counts).transform(counts).toarray()
    np.testing.assert_allclose(got, want, atol=1e-12)


def test_bm25_prefers_the_document_with_the_query_terms():
    counts = BagOfWords().fit(DOCS).transform(DOCS)
    bow = BagOfWords().fit(DOCS)
    s = bm25_scores(counts, [bow.vocab.index["blouse"], bow.vocab.index["puff"]])
    assert s.argmax() == 2


def test_multiword_ontology_forms_join():
    assert "v_neck" in join_multiword(["a", "v", "neck", "kurti"])
