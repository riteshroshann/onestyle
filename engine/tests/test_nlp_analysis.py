"""Evaluation helpers: span error kinds, token confusion, paired bootstrap direction, figure code runs headless."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.analysis import span_errors, to_spans, token_confusion  # noqa: E402
from bespoke.nlp.stats import paired_bootstrap  # noqa: E402

G = [["B-COLOUR", "B-GARMENT", "I-GARMENT", "O", "B-FIT"]]


def test_spans():
    assert to_spans(G[0]) == {(0, 1, "COLOUR"), (1, 3, "GARMENT"), (4, 5, "FIT")}


def test_error_kinds_are_counted_once():
    pred = [["B-FABRIC", "B-GARMENT", "O", "B-FIT", "O"]]  # wrong type, boundary, spurious, missed
    e = span_errors(G, pred)
    assert e == {"correct": 0, "wrong type": 1, "boundary": 1, "spurious": 1, "missed": 1}


def test_token_confusion_counts_types_not_bio_prefixes():
    c = token_confusion(G, [["B-FABRIC", "B-GARMENT", "I-GARMENT", "O", "O"]], ["COLOUR", "GARMENT", "FIT", "FABRIC"])
    assert {"gold": "COLOUR", "predicted": "FABRIC", "tokens": 1} in c["largest_confusions"] and c["matrix"][c["labels"].index("GARMENT")][c["labels"].index("GARMENT")] == 2


def test_paired_bootstrap_sign_and_significance():
    gold = [["B-FIT"]] * 30
    good, bad = [["B-FIT"]] * 30, [["O"]] * 30
    r = paired_bootstrap(gold, good, bad, n=200)
    assert r["delta"] == 1.0 and r["p"] < 0.05 and r["ci95"][0] > 0


def test_figures_module_imports_and_skips_missing_results(tmp_path, monkeypatch):
    from bespoke.nlp import corpus, viz
    monkeypatch.setattr(corpus, "RESULTS", tmp_path)
    monkeypatch.setattr(corpus, "CACHE", tmp_path)
    assert viz.perplexity_by_order() is None and viz.embedding_projection() is None
