"""Unit tests for the Python engine: tokenizer, gazetteer, markup parser, decoding, training-data generator."""
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.data import parse_markup, synth_sentence  # noqa: E402
from bespoke.decode import allowed, viterbi  # noqa: E402
from bespoke.lexicon import bio_to_spans, form_index, labels, ontology, spans_to_bio, tag_rules, tokenize  # noqa: E402


def test_tokenize_basics():
    assert tokenize("Deeper than #2, 42 Inch") == ["deeper", "than", "#2", ",", "42", "inch"]
    assert tokenize("loooose") == ["loose"]
    assert tokenize("लाल कुर्ती") == ["लाल", "कुर्ती"]
    assert tokenize("") == []


def test_gazetteer_longest_match_and_units():
    spans = tag_rules(tokenize("deep v neck, 42 inch"))
    assert [(s.tag, s.value) for s in spans] == [("NECKLINE", "deep v"), ("NUM", "")]
    assert tag_rules(tokenize("42 people")) == []


def test_ontology_has_no_form_claimed_twice():
    seen = {}
    for tag, values in ontology()["lexicon"].items():
        for value, entry in values.items():
            for form in entry["forms"]:
                key = tuple(tokenize(form))
                assert seen.get(key, (tag, value)) == (tag, value), f"{form!r} claimed by {seen[key]} and {(tag, value)}"
                seen[key] = (tag, value)
    assert len(form_index()) > 1000


def test_bio_round_trip():
    toks = tokenize("a navy silk kurti with puff sleeves")
    spans = tag_rules(toks)
    back = bio_to_spans(toks, spans_to_bio(len(toks), spans))
    assert [(s.start, s.end, s.tag, s.value) for s in back] == [(s.start, s.end, s.tag, s.value) for s in spans]


def test_markup_parser():
    rows = parse_markup("[kurti|GARMENT] in [pastel blue|COLOUR] for [summer|O]")
    assert rows == [("kurti", "B-GARMENT"), ("in", "O"), ("pastel", "B-COLOUR"), ("blue", "I-COLOUR"), ("for", "O"), ("summer", "O")]


def test_bio_transitions():
    assert allowed("B-FIT", "I-FIT") and allowed("I-FIT", "I-FIT")
    assert not allowed("O", "I-FIT") and not allowed("B-PART", "I-FIT")


def test_viterbi_never_emits_invalid_bio():
    L = labels()
    rng = np.random.default_rng(0)
    for _ in range(200):
        tags = viterbi(np.log(rng.dirichlet(np.ones(len(L)), size=rng.integers(1, 12))), L)
        prev = "O"
        for t in tags:
            assert allowed(prev, t), (prev, t)
            prev = t


def test_synthetic_sentences_are_well_formed():
    rng = random.Random(1)
    for _ in range(300):
        rows = synth_sentence(rng)
        assert rows, "empty sentence"
        prev = "O"
        for tok, tag in rows:
            assert tok and tag in labels()
            assert allowed(prev, tag) or tag.startswith("B-") or tag == "O"
            prev = tag
