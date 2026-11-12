"""One place for the text every study reads, so each result names the same data.

Sources: gold requests (82, split 30 dev / 52 test exactly as scripts/ladder.py does), synthetic requests from the
template generator, Myntra catalogue titles (optional, English only), the ontology's forms and the assistant guides.
"""
from __future__ import annotations

import os
import random
import re
from functools import lru_cache
from pathlib import Path

from ..data import catalogue_titles, read_gold, synth_sentence
from ..lexicon import ROOT, ontology, tokenize

SEED = 13  # the ladder's seed, so synthetic and gold splits match results/tagging.json
MYNTRA = Path(os.environ.get("BESPOKE_MYNTRA_CSV", ROOT / "data" / "raw" / "styles.csv"))
GOLD = ROOT / "data" / "gold" / "requests.txt"
GUIDES = ROOT / "web" / "lib" / "assistant" / "corpus"
RESULTS = ROOT / "results"
FIGURES = RESULTS / "figures"

Row = list[tuple[str, str]]


def catalogue_available() -> bool:
    return MYNTRA.exists()


@lru_cache(maxsize=1)
def gold_rows() -> list[Row]:
    return read_gold(GOLD)


def gold_dev() -> list[Row]:
    return gold_rows()[:30]


def gold_test() -> list[Row]:
    return gold_rows()[30:]


@lru_cache(maxsize=1)
def train_rows() -> list[Row]:
    """The ladder's training set: 8,000 synthetic requests plus up to 4,000 weakly labelled catalogue titles."""
    rng = random.Random(SEED)
    synth = [synth_sentence(rng) for _ in range(9000)]
    cat = catalogue_titles(MYNTRA, 4000, rng) if catalogue_available() else []
    train = synth[:8000] + cat
    rng.shuffle(train)
    return train


def to_dicts(rows: list[Row]) -> list[dict]:
    return [{"tokens": [t for t, _ in r], "tags": [g for _, g in r]} for r in rows]


@lru_cache(maxsize=1)
def catalogue_frame():
    """The Myntra styles table (None without the CSV). Rows with a missing title are dropped."""
    if not catalogue_available():
        return None
    import pandas as pd
    df = pd.read_csv(MYNTRA, on_bad_lines="skip", encoding="utf8", encoding_errors="ignore")
    return df.dropna(subset=["productDisplayName"]).reset_index(drop=True)


@lru_cache(maxsize=1)
def catalogue_tokens() -> list[list[str]]:
    df = catalogue_frame()
    return [] if df is None else [tokenize(t) for t in df["productDisplayName"]]


@lru_cache(maxsize=1)
def synthetic_tokens() -> list[list[str]]:
    rng = random.Random(SEED)
    return [[t for t, _ in synth_sentence(rng)] for _ in range(8000)]


@lru_cache(maxsize=1)
def guide_paragraphs() -> list[str]:
    """Assistant guide prose, one paragraph per entry, markdown markers removed."""
    out: list[str] = []
    for path in sorted(GUIDES.glob("*.md")):
        for para in re.split(r"\n\s*\n", path.read_text(encoding="utf8")):
            text = re.sub(r"[#*`>|_-]+", " ", para).strip()
            if len(text.split()) >= 4:
                out.append(text)
    return out


def gold_sentences() -> list[list[str]]:
    return [[t for t, _ in r] for r in gold_rows()]


def ontology_forms() -> list[tuple[str, str, str]]:
    """(tag, canonical value, form) for every surface form."""
    return [(tag, value, form) for tag, values in ontology()["lexicon"].items()
            for value, entry in values.items() for form in entry["forms"]]


def text_sources() -> dict[str, list[list[str]]]:
    """Tokenised sentences by source name; the catalogue is empty when styles.csv is missing."""
    return {
        "gold": gold_sentences(),
        "synthetic": synthetic_tokens(),
        "catalogue": catalogue_tokens(),
        "guides": [tokenize(p) for p in guide_paragraphs()],
    }


def sizes() -> dict[str, int]:
    return {k: sum(len(s) for s in v) for k, v in text_sources().items()}


def write_json(name: str, payload: dict) -> Path:
    import json
    RESULTS.mkdir(exist_ok=True)
    path = RESULTS / f"{name}.json"
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf8")
    return path
