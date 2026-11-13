"""CRF helpers: feature groups partition the ladder's features, transitions analysis flags BIO-invalid moves."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp import ladder_io as L  # noqa: E402
from bespoke.nlp.seq_eval import transition_analysis  # noqa: E402

ROWS = [{"tokens": ["red", "kurti", "chahiye"], "tags": ["B-COLOUR", "B-GARMENT", "O"]},
        {"tokens": ["deep", "v", "neck"], "tags": ["B-DIM", "B-NECKLINE", "I-NECKLINE"]}] * 10


def test_groups_cover_every_feature_once():
    keys = L.ladder.word_features(["a", "b", "c"], 1).keys()
    assert {L.group_of(k) for k in keys} == {"word", "affix", "shape", "window"}
    f = L.crf_features(["red", "kurti"], gaz=True, groups=frozenset({"word"}))[0]
    assert set(f) == {"w", "gaz"}


def test_transition_analysis_penalises_invalid_bio():
    crf = L.fit_crf(ROWS, gaz=False, max_iterations=40)
    t = transition_analysis(crf)
    assert t["invalid_bio"]["mean_weight"] < t["valid_mean_weight"]
