"""Embedding wrappers: OOV behaviour differs by model, and the trigram baseline sees shared letters."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.embed import char_trigrams, train_fasttext, train_word2vec, unit  # noqa: E402
from bespoke.nlp.embed_eval import synonym_retrieval  # noqa: E402

SENTS = [["blue", "kurti", "with", "puff", "sleeve"], ["red", "kurta", "with", "puff", "sleeve"], ["blue", "kurta", "for", "office"]] * 20


def test_word2vec_cannot_embed_an_unseen_word_but_fasttext_can():
    w2v, ft = train_word2vec(SENTS, dim=16, epochs=3), train_fasttext(SENTS, dim=16, epochs=3)
    assert w2v.vector("kurtii") is None and w2v.vector("kurti") is not None
    assert ft.vector("kurtii").shape == (16,)


def test_trigram_baseline_puts_kurti_nearer_kurta_than_blue():
    e = char_trigrams(["kurti", "kurta", "blue"])
    a, b, c = (unit(e.vector(w)) for w in ("kurti", "kurta", "blue"))
    assert a @ b > a @ c


def test_synonym_retrieval_reports_chance_and_coverage():
    forms = {"kurti": ("GARMENT", "kurti"), "kurta": ("GARMENT", "kurti"), "blue": ("COLOUR", "blue"), "navy": ("COLOUR", "blue")}
    out = synonym_retrieval(char_trigrams(list(forms)), forms)
    assert out["coverage"] == 1.0 and 0 < out["chance_same_value"] < 1 and np.isfinite(out["hit@1_same_value"]["value"])
