"""Perturbations keep labels and length, are deterministic, and the identity rewrite changes nothing."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.data import parse_markup  # noqa: E402
from bespoke.nlp.robust import elongate, noise, perturb, romanise  # noqa: E402

ROWS = [parse_markup("[kurti|GARMENT] chahiye, [dheela|FIT] [georgette|FABRIC] please")]


def test_zero_noise_is_identity():
    assert perturb(ROWS, noise(0.0)) == ROWS


def test_labels_and_length_survive_and_runs_repeat():
    for fn in (noise(1.0), romanise, elongate):
        out = perturb(ROWS, fn)
        assert [t for _, t in out[0]] == [t for _, t in ROWS[0]]
        assert out == perturb(ROWS, fn)


def test_non_entity_tokens_are_untouched():
    out = perturb(ROWS, noise(1.0))
    assert [w for w, t in out[0] if t == "O"] == [w for w, t in ROWS[0] if t == "O"]
