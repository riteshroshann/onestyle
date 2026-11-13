"""Topic models recover two planted themes; coherence and diversity behave."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.nlp.topics import diversity, fit_nmf, npmi_coherence  # noqa: E402

SHOES = ["shoe", "sole", "lace", "sneaker"]
WATCH = ["dial", "strap", "quartz", "watch"]
BAGS = ["zip", "tote", "handle", "pocket"]
DOCS = [t[i % 4:] + t[:i % 4] for t in (SHOES, WATCH, BAGS) for i in range(40)]


def test_nmf_separates_two_themes():
    topics = fit_nmf(DOCS, 3)
    sets = [set(t[:4]) for t in topics]
    assert set(SHOES) in sets and set(WATCH) in sets


def test_coherence_prefers_a_real_topic_over_a_mixed_one():
    assert npmi_coherence([SHOES, WATCH], DOCS) > npmi_coherence([["shoe", "dial", "lace", "quartz"], ["sole", "strap", "sneaker", "watch"]], DOCS)


def test_diversity():
    assert diversity([["a", "b"], ["a", "c"]]) == 0.75
