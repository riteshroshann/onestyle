"""Guard classifier: data is clean, features fit on training text only, the hybrid never weakens a regex refusal."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.classic import TfidfFeatures, ece, hybrid  # noqa: E402
from bespoke.nlp.guard_data import CLASSES, MESSAGES, labelled  # noqa: E402


def test_data_has_every_class_and_no_duplicates():
    texts, labels = labelled()
    assert set(labels) == set(CLASSES) and all(len(MESSAGES[c]) >= 15 for c in CLASSES)
    assert len({t.lower() for t in texts}) == len(texts)


def test_tfidf_features_ignore_test_vocabulary():
    f = TfidfFeatures().fit(["puff sleeve", "boat neck"])
    assert f.transform(["zebra"]).nnz < f.transform(["puff sleeve"]).nnz + 5
    assert "zebra" not in f.word.vocabulary_


def test_hybrid_keeps_regex_refusals_and_only_adds():
    proba = np.array([[0.9, 0.1, 0, 0, 0, 0], [0.1, 0.8, 0.1, 0, 0, 0], [0.1, 0.8, 0.1, 0, 0, 0]])
    out = hybrid(["self_harm", "ok", "ok"], proba, 0.5)
    assert out == ["self_harm", "injection", "injection"]
    assert hybrid(["ok", "ok", "ok"], proba, 0.95) == ["ok", "ok", "ok"]


def test_ece_of_a_perfectly_calibrated_toy_is_small():
    prob = np.array([[1.0, 0.0]] * 10)
    assert ece(prob, np.ones(10)) == 0.0
