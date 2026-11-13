"""GPT and seq2seq studies: the pure helpers (no model downloads)."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bespoke.apps.gpt import pooled_perplexity  # noqa: E402
from bespoke.apps.seq2seq import Trie, target_of, triple_text  # noqa: E402


def test_pooled_perplexity_is_exp_of_mean_nll_per_token():
    assert abs(pooled_perplexity([(2.0, 2), (4.0, 2)]) - math.exp(1.5)) < 1e-9


def test_triple_text_and_target_are_sorted_and_deduplicated():
    ts = [{"op": "set", "slot": "fabric", "value": "silk"}, {"op": "compare", "slot": "neckline.depth", "value": "more", "ref": "#1"}, {"op": "set", "slot": "fabric", "value": "silk"}]
    assert target_of(ts) == ["compare neckline.depth=more @#1", "set fabric=silk"]
    assert triple_text(ts[0]) == "set fabric=silk"


def test_trie_allows_only_known_continuations():
    t = Trie([[1, 2, 3], [1, 4]])
    assert t.next([]) == ([1], False)
    assert sorted(t.next([1])[0]) == [2, 4]
    assert t.next([1, 4]) == ([], True)
    assert t.next([9]) == ([], False)
