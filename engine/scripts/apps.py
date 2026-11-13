"""Run one syllabus study and write its results/<topic>.json.

usage: python scripts/apps.py <topic>
topics: ner, grounding, qa, sentiment, summarise, translate, bert-probe, pos, pos-ner, gpt, dependency, seq2seq, seq2seq-deployed (re-score only the deployed row, no training)
"""
from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TOPICS = {"ner": "ner", "grounding": "grounding", "qa": "qa", "sentiment": "sentiment", "summarise": "summarise", "translate": "translate", "bert-probe": "bert_probe", "pos": "pos", "pos-ner": "pos_ner", "gpt": "gpt", "dependency": "dependency", "seq2seq": "seq2seq", "seq2seq-deployed": "seq2seq:refresh_deployed"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("topic", choices=sorted(TOPICS))
    a = ap.parse_args()
    mod, _, fn = TOPICS[a.topic].partition(":")
    getattr(importlib.import_module(f"bespoke.apps.{mod}"), fn or "run")()


if __name__ == "__main__":
    main()
