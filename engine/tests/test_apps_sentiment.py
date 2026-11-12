"""Sentiment study: negation scope in the lexicon baseline, synthetic generator, metrics and gold file shape."""
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD, read_jsonl  # noqa: E402
from bespoke.apps.sentiment import lexicon_polarity, macro_f1, synthetic  # noqa: E402


def test_lexicon_negation_scope():
    assert lexicon_polarity("love this neckline") == "pos"
    assert lexicon_polarity("not bad, i like the length") == "pos"
    assert lexicon_polarity("no embroidery") == "neg"
    assert lexicon_polarity("this is not good") == "neg"
    assert lexicon_polarity("the fit is too tight") == "neg"
    assert lexicon_polarity("kurti chahiye") == "neu"


def test_synthetic_lines_are_balanced_and_deterministic():
    a, b = synthetic(5, random.Random(1)), synthetic(5, random.Random(1))
    assert a == b and Counter(r["label"] for r in a) == {"neg": 5, "neu": 5, "pos": 5}


def test_macro_f1_perfect_and_wrong():
    assert macro_f1(["neg", "neu", "pos"], ["neg", "neu", "pos"]) == 1.0
    assert macro_f1(["neg", "neu"], ["neu", "neg"]) == 0.0


def test_gold_is_balanced_and_split_cleanly():
    rows = read_jsonl(GOLD / "sentiment.jsonl")
    assert Counter((r["split"], r["label"]) for r in rows) == {(s, c): n for s, n in (("train", 30), ("test", 40)) for c in ("neg", "neu", "pos")}
    assert not {r["text"] for r in rows if r["split"] == "train"} & {r["text"] for r in rows if r["split"] == "test"}
