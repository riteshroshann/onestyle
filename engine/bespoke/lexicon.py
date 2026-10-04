"""Ontology loading, tokenisation and the gazetteer tagger (ladder rung L0).

The tokeniser and matcher are mirrored line for line in web/lib/engine/lexicon.ts;
tests/parity_fixtures.json keeps the two in agreement.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ONTOLOGY_PATH = ROOT / "ontology" / "bespoke.json"

TOKEN_RE = re.compile(
    r"#\d+|\d+(?:\.\d+)?(?:/\d+)?(?:th)?|[A-Za-zÀ-ɏऀ-ॿ]+(?:[-'][A-Za-zऀ-ॿ]+)*|\S"
)
ELONGATION_RE = re.compile(r"([a-z])\1{2,}")
MAX_SPAN = 6


@dataclass(frozen=True)
class Span:
    start: int  # token index, inclusive
    end: int    # token index, exclusive
    tag: str
    value: str  # canonical ontology value ("" for NUM)


def normalise(text: str) -> str:
    text = text.lower().replace("’", "'").replace("“", '"').replace("”", '"')
    return ELONGATION_RE.sub(r"\1\1", text)


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(normalise(text))


@lru_cache(maxsize=1)
def ontology() -> dict:
    return json.loads(ONTOLOGY_PATH.read_text(encoding="utf8"))


@lru_cache(maxsize=1)
def form_index() -> dict[tuple[str, ...], tuple[str, str]]:
    """Map a token tuple to (tag, canonical value). Earlier tags win on exact clashes."""
    index: dict[tuple[str, ...], tuple[str, str]] = {}
    for tag, values in ontology()["lexicon"].items():
        for canonical, entry in values.items():
            for form in entry["forms"]:
                key = tuple(tokenize(form))
                if key and key not in index:
                    index[key] = (tag, canonical)
    return index


def labels() -> list[str]:
    tags = ontology()["tags"]
    return ["O"] + [f"{p}-{t}" for t in tags for p in ("B", "I")]


def _unit_at(tokens: list[str], i: int) -> int:
    units = [u for forms in ontology()["num_units"].values() for u in forms]
    if i < len(tokens) and tokens[i] in units:
        return 1
    return 0


def tag_rules(tokens: list[str]) -> list[Span]:
    """Greedy longest match over the gazetteer, plus numbers with units."""
    index = form_index()
    spans: list[Span] = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if re.fullmatch(r"\d+(?:\.\d+)?", tok) and _unit_at(tokens, i + 1):
            spans.append(Span(i, i + 2, "NUM", ""))
            i += 2
            continue
        for n in range(min(MAX_SPAN, len(tokens) - i), 0, -1):
            hit = index.get(tuple(tokens[i:i + n]))
            if hit:
                spans.append(Span(i, i + n, hit[0], hit[1]))
                i += n
                break
        else:
            i += 1
    return spans


def spans_to_bio(n: int, spans: list[Span]) -> list[str]:
    tags = ["O"] * n
    for s in spans:
        tags[s.start] = f"B-{s.tag}"
        for k in range(s.start + 1, s.end):
            tags[k] = f"I-{s.tag}"
    return tags


def bio_to_spans(tokens: list[str], tags: list[str]) -> list[Span]:
    """Decode BIO into spans; values are grounded by exact lookup, else left empty."""
    index = form_index()
    spans, i = [], 0
    while i < len(tags):
        if tags[i].startswith(("B-", "I-")):
            t = tags[i][2:]
            j = i + 1
            while j < len(tags) and tags[j] == f"I-{t}":
                j += 1
            hit = index.get(tuple(tokens[i:j]))
            spans.append(Span(i, j, t, hit[1] if hit and hit[0] == t else ""))
            i = j
        else:
            i += 1
    return spans
