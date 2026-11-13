"""Run one syllabus study; each writes results/<topic>.json (and figures) from Bespoke's own text.

usage:  python scripts/syllabus.py <topic>      (python scripts/syllabus.py --list)
"""
from __future__ import annotations

import importlib
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# topic -> (module in bespoke.nlp, function)
TOPICS = {
    "morph": ("morph_eval", "run"),
    "colloc": ("colloc", "run"),
    "robust": ("robust", "run"),
    "onehot": ("vectors_eval", "run_onehot"),
    "bow": ("vectors_eval", "run_bow"),
    "tfidf": ("vectors_eval", "run_tfidf"),
    "ngram": ("ngram_eval", "run"),
    "embed": ("embed_eval", "run"),
    "classic": ("classic", "run"),
    "hmm": ("seq_eval", "run_hmm"),
    "crf": ("seq_eval", "run_crf"),
    "topics": ("topics", "run"),
    "graph": ("graph", "run"),
    "analysis": ("analysis", "run"),
    "figures": ("viz", "run"),
}


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] in ("-h", "--help", "--list"):
        print("topics:", ", ".join(TOPICS), "| all")
        return 0
    names = list(TOPICS) if argv[1] == "all" else [argv[1]]
    for name in names:
        if name not in TOPICS:
            print(f"unknown topic {name!r}; choose from {', '.join(TOPICS)}")
            return 2
        module, fn = TOPICS[name]
        t0 = time.time()
        getattr(importlib.import_module(f"bespoke.nlp.{module}"), fn)()
        print(f"{name}: done in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
