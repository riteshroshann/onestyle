"""Run one syllabus study and write its results/<topic>.json.

usage: python scripts/apps.py <topic>
topics: ner, grounding, qa, sentiment, summarise, translate
"""
from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TOPICS = {"ner": "ner", "grounding": "grounding", "qa": "qa", "sentiment": "sentiment", "summarise": "summarise", "translate": "translate"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("topic", choices=sorted(TOPICS))
    a = ap.parse_args()
    importlib.import_module(f"bespoke.apps.{TOPICS[a.topic]}").run()


if __name__ == "__main__":
    main()
