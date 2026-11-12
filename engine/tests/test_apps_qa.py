"""QA study: rank fusion, AUROC and the shape of the retrieval gold file."""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD, ROOT, read_jsonl  # noqa: E402
from bespoke.apps.qa import auroc, ranks_of, rrf  # noqa: E402


def test_ranks_of_is_one_for_the_top_score():
    assert list(ranks_of(np.array([0.1, 0.9, 0.5]))) == [3, 1, 2]


def test_rrf_rewards_agreement():
    a, b = np.array([3.0, 2.0, 1.0]), np.array([3.0, 1.0, 2.0])
    fused = rrf(a, b)
    assert fused.argmax() == 0 and fused[1] == fused[2]


def test_auroc_bounds():
    assert auroc([2, 3], [0, 1]) == 1.0
    assert auroc([1], [1]) == 0.5


def test_retrieval_gold_points_at_real_chunks():
    ids = {c["id"] for c in json.loads((ROOT / "web" / "lib" / "assistant" / "index.json").read_text(encoding="utf8"))["chunks"]}
    rows = read_jsonl(GOLD / "retrieval.jsonl")
    assert {r["kind"] for r in rows} == {"answerable", "off_topic", "near_topic"}
    for r in rows:
        assert (r["chunk"] in ids) if r["kind"] == "answerable" else r["chunk"] is None
