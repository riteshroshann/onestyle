"""Training data for the taggers.

Three sources, kept apart on purpose:
  * synthetic requests from clause templates (English and Hinglish). Slot fills are labelled by
    provenance, and a share of them get spelling noise, so a model must use context, not the gazetteer;
  * weakly labelled catalogue titles (Myntra) tagged by the gazetteer, for real-world vocabulary;
  * hand-written gold requests in bracket markup, used only for development and test.
"""
from __future__ import annotations

import csv
import random
import re
from pathlib import Path

from .lexicon import ontology, spans_to_bio, tag_rules, tokenize

MARKUP_RE = re.compile(r"\[([^\[\]|]+)\|([A-Z]+)\]")

# Clause templates. {TAG} samples any form of that tag; {TAG=value} samples a form of one value.
CLAUSES = [
    "i want a {SHADE} {COLOUR} {GARMENT} for my {OCCASION}",
    "looking for a {STYLE} {GARMENT} for a {OCCASION}",
    "{GARMENT} chahiye {OCCASION} ke liye",
    "mujhe ek {COLOUR} {GARMENT} banwana hai",
    "make me a {FABRIC} {GARMENT}",
    "{GARMENT} in {FABRIC} please",
    "{FIT} at the {PART=waist}",
    "{PART=waist} pe {FIT}",
    "{PART=waist} par {INT} {FIT=fitted}",
    "{LOC=lower} {INT} {FIT}",
    "{LOC=lower} {SILHOUETTE}",
    "{SILHOUETTE} from the {PART=waist}",
    "{SILHOUETTE} {GARMENT}",
    "{NECKLINE} neckline",
    "{NECKLINE} {INT} {DIM}",
    "{PART=neckline} {INT} {DIM} rakhna",
    "{DIM} {NECKLINE}",
    "{PART=neckline} {NECKLINE} hona chahiye",
    "{SLEEVE} sleeves",
    "{LENGTH} sleeves",
    "{PART=sleeve} {LENGTH} ho",
    "{INT} {FIT} {PART=sleeve}",
    "{SLEEVE} {PART=sleeve} with {EMBELL} at the {PART=hem}",
    "{LENGTH} length",
    "{LENGTH} {GARMENT}",
    "{PATTERN} {FABRIC}",
    "{COLOUR} with {COLOUR} {EMBELL}",
    "{SHADE} shades only",
    "{STYLE} and {STYLE}",
    "{INT} {STYLE} look",
    "{NEG} {EMBELL}",
    "{EMBELL} {NEG=not}",
    "{NEG} {COLOUR} please",
    "{COLOUR} {NEG=not} chahiye",
    "without {PATTERN}",
    "{NEG} {STYLE}",
    "{PART=neckline} {CMP} {REF}",
    "{CMP=more} {REF} but {CMP=less} {REF}",
    "{SLEEVE} like {REF}",
    "{PART=sleeve} {REF} {CMP=same}",
    "{PART=length} {NUM}",
    "{PART=neckline} {NUM} deep",
    "{PART=slit} {NUM}",
    "{EMBELL} on the {PART=yoke}",
    "{PART=back} {INT} {DIM}",
    "{LOC=back} se {DIM} {PART=neckline}",
]
JOINERS = [", ", " and ", " aur ", " but ", " with ", ". ", " , ", " par "]
UNITS = ["inch", "inches", "in", "cm"]


def _noise(word: str, rng: random.Random) -> str:
    if len(word) < 5 or not word.isalpha():
        return word
    i = rng.randrange(1, len(word) - 1)
    op = rng.random()
    if op < 0.4:
        return word[:i] + word[i + 1:]                    # drop
    if op < 0.7:
        return word[:i] + word[i + 1] + word[i] + word[i + 2:]  # swap
    return word[:i] + word[i] + word[i:]                  # double


def _fill(tag: str, value: str | None, rng: random.Random, noise: float) -> list[tuple[str, str]]:
    if tag == "NUM":
        n = rng.choice(["5", "6", "6.5", "7", "8", "14", "38", "40", "42", "44"])
        toks = [n, rng.choice(UNITS)]
    else:
        values = ontology()["lexicon"][tag]
        value = value or rng.choice(list(values))
        form = rng.choice(values[value]["forms"])
        toks = tokenize(form)
        if rng.random() < noise:
            toks = [_noise(t, rng) for t in toks]
    return [(t, ("B-" if k == 0 else "I-") + tag) for k, t in enumerate(toks)]


def _literal(text: str) -> list[tuple[str, str]]:
    toks = tokenize(text)
    return list(zip(toks, spans_to_bio(len(toks), tag_rules(toks))))


BAG_TAGS = ["COLOUR", "SHADE", "FABRIC", "PATTERN", "STYLE", "SILHOUETTE", "LENGTH", "EMBELL", "FIT"]
FILLERS = ["", "", "in", "with", "and", "type", "style", "wala", "look", "colour", "fabric", "vibe", "sa", "ka"]
# words that look like fashion content but are outside the ontology: the model must leave them O
DISTRACTORS = ["dupatta", "summer", "winter", "legs", "belted", "pockets", "buttons", "lining", "outfit", "design", "kaftan",
               "dhoti", "mom", "sister", "budget", "rs 3000", "quickly", "maybe", "chalega", "theek", "accha", "something",
               "wear", "nice", "beautiful", "cute", "event", "trip", "goa", "photos", "stitch", "tailor", "size m", "xl"]


def _bag(rng: random.Random, noise: float) -> list[tuple[str, str]]:
    """Attributes in random order, so position carries no label information."""
    out: list[tuple[str, str]] = []
    for tag in rng.sample(BAG_TAGS, rng.randint(1, 4)):
        out += _fill(tag, None, rng, noise)
        f = rng.choice(FILLERS)
        if f:
            out += _literal(f)
    if rng.random() < 0.6:
        out += _fill("GARMENT", None, rng, noise)
    return out


def synth_sentence(rng: random.Random, noise: float = 0.15) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    pieces = rng.sample(CLAUSES, rng.randint(1, 3)) + ["<bag>"] * rng.randint(0, 2) + ["<distractor>"] * (rng.random() < 0.5)
    rng.shuffle(pieces)
    for c, clause in enumerate(pieces):
        if c:
            out += _literal(rng.choice(JOINERS))
        if clause == "<bag>":
            out += _bag(rng, noise)
            continue
        if clause == "<distractor>":
            out += [(t, "O") for t in tokenize(rng.choice(DISTRACTORS))]
            continue
        if c:
            out += _literal(rng.choice(JOINERS))
        for piece in re.split(r"(\{[A-Z]+(?:=[^}]+)?\})", clause):
            if piece.startswith("{"):
                tag, _, value = piece[1:-1].partition("=")
                out += _fill(tag, value or None, rng, noise)
            elif piece.strip():
                out += _literal(piece)
    return out


def catalogue_titles(path: Path, n: int, rng: random.Random) -> list[list[tuple[str, str]]]:
    with path.open(encoding="utf8", errors="ignore") as f:
        names = [r.get("productDisplayName") or "" for r in csv.DictReader(f)]
    names = [x for x in names if x.strip()]
    rng.shuffle(names)
    out = []
    for name in names[:n]:
        toks = tokenize(name)
        out.append(list(zip(toks, spans_to_bio(len(toks), tag_rules(toks)))))
    return out


def parse_markup(line: str) -> list[tuple[str, str]]:
    """'kurti [fitted|FIT] at the [waist|PART]' -> [(token, BIO tag), ...]."""
    out: list[tuple[str, str]] = []
    pos = 0
    for m in MARKUP_RE.finditer(line):
        out += [(t, "O") for t in tokenize(line[pos:m.start()])]
        toks = tokenize(m.group(1))
        tag = m.group(2)
        out += [(t, "O" if tag == "O" else ("B-" if k == 0 else "I-") + tag) for k, t in enumerate(toks)]
        pos = m.end()
    out += [(t, "O") for t in tokenize(line[pos:])]
    return out


def read_gold(path: Path) -> list[list[tuple[str, str]]]:
    lines = [l.strip() for l in path.read_text(encoding="utf8").splitlines()]
    return [parse_markup(l) for l in lines if l and not l.startswith("#")]
