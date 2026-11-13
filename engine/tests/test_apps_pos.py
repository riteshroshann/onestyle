"""POS study: the HMM, the silver rules, the gold file, and the probe's helper functions."""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.bert_probe import control_labels, entity_type  # noqa: E402
from bespoke.apps.common import GOLD, read_jsonl  # noqa: E402
from bespoke.apps.pos import CLASS_POS, HINDI_FUNCTION, HMM, UPOS  # noqa: E402
from bespoke.lexicon import ontology, tokenize  # noqa: E402


def test_hmm_uses_context_for_an_ambiguous_word():
    sents = [["the", "fit", "is", "good"], ["fit", "the", "kurti"]] * 5
    tags = [["DET", "NOUN", "AUX", "ADJ"], ["VERB", "DET", "NOUN"]] * 5
    m = HMM().fit(sents, tags)
    assert m.predict(["the", "fit", "is", "good"]) == ["DET", "NOUN", "AUX", "ADJ"]
    assert m.predict(["fit", "the", "kurti"]) == ["VERB", "DET", "NOUN"]
    assert len(m.predict(["zzz", "kurti"])) == 2  # unknown words do not crash


def test_silver_rule_tables_use_universal_tags_and_cover_the_ontology():
    assert set(HINDI_FUNCTION.values()) <= set(UPOS) and set(CLASS_POS.values()) <= set(UPOS)
    assert set(ontology()["tags"]) <= set(CLASS_POS)


def test_gold_pos_matches_the_tokeniser_and_the_tagset():
    rows = read_jsonl(GOLD / "pos.jsonl")
    assert len(rows) == 60
    texts = {r["id"].replace("gold", "pos"): r["text"] for r in read_jsonl(GOLD / "binding.jsonl")}
    for r in rows:
        assert r["tokens"] == tokenize(texts[r["id"]]) and len(r["tags"]) == len(r["tokens"]) and set(r["tags"]) <= set(UPOS), r["id"]


def test_probe_helpers():
    assert entity_type("B-FIT") == "FIT" and entity_type("O") == "O"
    a = control_labels(["x", "y", "x"], ["A", "B"], random.Random(1))
    assert a == control_labels(["y", "x"], ["A", "B"], random.Random(1)) and set(a) == {"x", "y"}


def test_pos_feature_builder_adds_neighbour_tags():
    from bespoke.apps.pos_ner import features

    f = features(["a", "kurti"], ["DET", "NOUN"], False, lambda ws, i: {"w": ws[i]})
    assert f[0]["pos"] == "DET" and f[0]["pos-1"] == "<s>" and f[0]["pos+1"] == "NOUN" and f[1]["pos+1"] == "</s>"
    assert "pos" not in features(["a"], None, False, lambda ws, i: {"w": ws[i]})[0]
