"""Dependency study: attachment extraction from the binding gold and tree distance."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.common import GOLD  # noqa: E402
from bespoke.apps.dependency import attachments, choose  # noqa: E402
from bespoke.lexicon import tokenize  # noqa: E402


def row(rid):
    return next(json.loads(l) for l in (GOLD / "binding.jsonl").read_text(encoding="utf8").splitlines() if json.loads(l)["id"] == rid)


def test_attachments_pair_each_value_with_its_part_group():
    r = row("att-01")  # sleeves loose and waist fitted
    att = attachments(r, tokenize(r["text"]))
    assert [(a["value"], a["group"]) for a in att] == [([1, 2], "sleeve"), ([4, 5], "bodice")]
    assert att[0]["key"] == "set|sleeve.fit|loose|"


def test_nearest_cue_chooser():
    cues = [{"start": 0, "end": 1, "group": "sleeve"}, {"start": 5, "end": 6, "group": "bodice"}]
    assert choose(cues, [4, 5], lambda c: 0) == "bodice"
