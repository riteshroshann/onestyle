"""Translation study: the Hindi gold file and the sacrebleu metrics it is scored with."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD, read_jsonl  # noqa: E402


def test_gold_rows_are_hindi_with_the_part_label_first():
    rows = read_jsonl(GOLD / "translation.jsonl")
    assert len({r["id"] for r in rows}) == len(rows) == 69
    for r in rows:
        label, _, value = r["reference"].partition(": ")
        assert value and re.search("[ऀ-ॿ]", label), r["id"]


def test_chrf_is_perfect_on_identity_and_low_on_unrelated_text():
    from sacrebleu.metrics import CHRF

    chrf = CHRF(word_order=2)
    ref = "गला: बोट नेक"
    assert chrf.sentence_score(ref, [ref]).score == 100.0
    assert chrf.sentence_score("ऊपरी भाग: ढीला", [ref]).score < 50
