"""Grounding study: similarity functions, the abstention judge, and the gold file against the ontology."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD, read_jsonl  # noqa: E402
from bespoke.apps.grounding import best, dice, edit_similarity, judge, levenshtein  # noqa: E402
from bespoke.lexicon import form_index, ontology, tokenize  # noqa: E402


def test_levenshtein_and_similarity():
    assert levenshtein("kitten", "sitting") == 3
    assert edit_similarity("abc", "abc") == 1.0


def test_dice_identity_and_typo():
    assert dice("georgette", "georgette") == 1.0
    assert dice("georget", "georgette") > 0.5 > dice("georget", "cotton")


def test_best_picks_the_value_of_the_closest_form():
    assert best("lavendar", "COLOUR", edit_similarity)[0] == "lavender"


def test_judge_counts_abstention_and_false_grounds():
    rows = [{"phrase": "a", "tag": "FIT", "value": "loose"}, {"phrase": "b", "tag": "FIT", "value": None}]
    s = judge(rows, [("loose", 0.9), ("loose", 0.9)], 0.5)
    assert s["precision"] == 0.5 and s["recall"] == 1.0 and s["false_grounds_on_out_of_ontology"] == 1
    assert judge(rows, [("loose", 0.2), ("loose", 0.2)], 0.5)["fire_rate"] == 0.0


def test_gold_phrases_are_unseen_and_values_exist():
    onto = ontology()["lexicon"]
    index = form_index()
    for r in read_jsonl(GOLD / "grounding.jsonl"):
        assert tuple(tokenize(r["phrase"])) not in index, r["phrase"]
        assert r["value"] is None or r["value"] in onto[r["tag"]], r


def test_shipped_rule_abstains_when_spelling_is_far_even_if_trigrams_overlap():
    from bespoke.apps.grounding import shipped

    assert shipped("lavendar", "COLOUR") == ("lavender", shipped("lavendar", "COLOUR")[1]) and shipped("lavendar", "COLOUR")[1] >= 0.5
    assert shipped("skintight", "FIT")[1] < 0.5  # fails the 0.5 threshold through the edit-similarity gate
