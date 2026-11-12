"""Summarisation study: ROUGE, TextRank and the gold thread file."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD, read_jsonl  # noqa: E402
from bespoke.apps.summarise import lcs, pick, rouge, textrank  # noqa: E402


def test_rouge_identity_and_disjoint():
    r = rouge("a red silk kurti", "a red silk kurti")
    assert r == {"rouge1": 1.0, "rouge2": 1.0, "rougeL": 1.0}
    assert rouge("blue", "red")["rouge1"] == 0.0


def test_rouge1_counts_clipped_overlap():
    # 2 of 3 predicted words and 2 of 4 reference words overlap: P 2/3, R 1/2, F1 4/7
    assert abs(rouge("red red silk", "red silk kurti dress")["rouge1"] - 4 / 7) < 1e-9


def test_lcs():
    assert lcs(list("abcd"), list("acbd")) == 3


def test_textrank_prefers_the_central_sentence():
    s = ["navy cotton kurti with v neck", "navy cotton kurti please", "what time is it in paris"]
    scores = textrank(s)
    assert scores[2] < min(scores[0], scores[1])
    assert pick(s, scores, 2) == "navy cotton kurti with v neck navy cotton kurti please"


def test_gold_threads_are_alternating_turns_with_a_reference():
    for r in read_jsonl(GOLD / "summaries.jsonl"):
        assert r["reference"] and all(t[:3] in ("C: ", "M: ") for t in r["thread"]), r["id"]
