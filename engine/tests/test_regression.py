"""Regression gates on the trained models and the gold set. Fails if a change makes the deployed tagger worse."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
R = json.loads((ROOT / "results" / "tagging.json").read_text(encoding="utf8"))


def test_deployed_configuration_holds_its_score():
    assert R["L3 minilm + gazetteer"]["f1"] >= 0.93


def test_deployed_beats_every_single_rung():
    deployed = R["L3 minilm + gazetteer"]["f1"]
    for name, row in R.items():
        if name != "L3 minilm + gazetteer" and "ONNX" not in name:
            assert deployed >= row["f1"], f"{name} {row['f1']} beats the deployed {deployed}"


def test_browser_model_matches_pytorch():
    assert abs(R["L3 minilm"]["f1"] - R["L3 minilm int8 ONNX (browser)"]["f1"]) <= 0.03


def test_classic_ladder_is_ordered():
    assert R["L2b CRF + gazetteer feature"]["f1"] > R["L2b CRF"]["f1"] > R["L2a HMM"]["f1"]


def test_gold_set_is_intact():
    lines = [l for l in (ROOT / "data" / "gold" / "requests.txt").read_text(encoding="utf8").splitlines() if l.strip() and not l.startswith("#")]
    assert len(lines) == 82
