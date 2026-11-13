"""Morphological fallback: known words never change, unseen inflections and spellings reach the right value."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.lexicon import tag_rules, tokenize  # noqa: E402
from bespoke.nlp.morph import Lemmatiser, edit_distance, sound_key, tag_with_fallback  # noqa: E402

LEM = Lemmatiser.build()


def test_known_word_is_left_to_the_gazetteer():
    assert LEM.lemma("kurti") is None


def test_hindi_gender_swap_is_induced_from_the_ontology():
    assert ("a", "i") in LEM.swaps or ("i", "a") in LEM.swaps
    assert LEM.lemma("dheelay")[0] == ("FIT", "loose")


def test_spelling_variants_route_by_sound():
    assert LEM.lemma("georget")[0] == ("FABRIC", "georgette")
    assert LEM.lemma("anarkalli")[0] == ("GARMENT", "anarkali")


def test_short_and_nonsense_words_stay_unmapped():
    assert LEM.lemma("cat") is None and LEM.lemma("zzzzzz") is None and LEM.lemma("42nd") is None


def test_fallback_only_adds_spans():
    toks = tokenize("georget kurti with puff sleeves")
    base = {(s.start, s.end) for s in tag_rules(toks)}
    assert base <= {(s.start, s.end) for s in tag_with_fallback(toks, LEM)}
    assert len(tag_with_fallback(toks, LEM)) == len(tag_rules(toks)) + 1


def test_sound_key_and_edit_distance():
    assert sound_key("dheela") == sound_key("dhila")
    assert edit_distance("kitten", "sitting") == 3
