"""NER study: span extraction, per-type scoring, the browser merge rule, and the binding gold file's shape."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD  # noqa: E402
from bespoke.apps.ner import browser_merge, confusion, entities, score  # noqa: E402
from bespoke.lexicon import tokenize  # noqa: E402


def test_entities_decode_bio():
    assert entities(["B-FIT", "I-FIT", "O", "B-PART"]) == {(0, 2, "FIT"), (3, 4, "PART")}
    assert entities(["I-FIT"]) == {(0, 1, "FIT")}


def test_score_counts_exact_spans_only():
    gold = [["B-FIT", "I-FIT", "O"]]
    pred = [["B-FIT", "O", "O"]]
    s = score(gold, pred)
    assert s["per_type"]["FIT"]["recall"] == 0.0 and s["per_type"]["FIT"]["precision"] == 0.0
    assert score(gold, gold)["micro"]["f1"] == 1.0


def test_confusion_lists_only_errors():
    c = confusion([["B-FIT", "O"]], [["B-LENGTH", "B-PART"]])
    assert c == {"FIT": {"LENGTH": 1}, "O": {"PART": 1}}


def test_browser_merge_prefers_gazetteer_and_fills_gaps():
    toks = tokenize("kurti zzzz loose")
    model = ["O", "B-STYLE", "B-GARMENT"]  # disagrees with the gazetteer on "loose", adds a span on "zzzz"
    tags = browser_merge(toks, model)
    assert tags == ["B-GARMENT", "B-STYLE", "B-FIT"]


def test_binding_gold_is_well_formed():
    rows = [json.loads(l) for l in (GOLD / "binding.jsonl").read_text(encoding="utf8").splitlines() if l.strip()]
    assert len({r["id"] for r in rows}) == len(rows)
    for r in rows:
        n = len(tokenize(r["text"]))
        assert r["triples"], r["id"]
        for a, b, tag in r["spans"]:
            assert 0 <= a < b <= n and tag.isupper(), r["id"]
