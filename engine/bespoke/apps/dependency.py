"""Dependency parsing as attachment: which garment part does a value belong to?

Gold attachments come from data/gold/binding.jsonl: every value span (fit, length, depth, silhouette...) whose
gold update is part-specific ("sleeve.fit=loose") is attached to that part group, and the request has a cue span
for the group (a part or location word such as "sleeves", "waist", "neck"). Three attachers choose, for each
value, the group of one cue span of the request:
  * the deployed binder (run in Node on gold spans), correct when it emits the gold update;
  * spaCy en_core_web_sm: the cue closest in the dependency tree (ties by distance in words);
  * the cue nearest in words.
Only English-only requests are used, since there is no parser for romanised Hindi; the set is small and says
what an off-the-shelf parser would add, as an upper-bound study, not a replacement.
"""
from __future__ import annotations

import json
import subprocess

import numpy as np

from ..lexicon import form_index
from .common import GOLD, ROOT, bootstrap_ci, read_jsonl, write_result
from .pos import HINDI_FUNCTION

# group of a cue word: the part of the garment it points at
PART_GROUP = {"neckline": "neckline", "back": "back", "sleeve": "sleeve", "shoulder": "sleeve", "bodice": "bodice", "waist": "bodice", "yoke": "bodice",
              "hip": "lower", "lower": "lower", "hem": "lower"}
LOC_GROUP = {"lower": "lower", "back": "back", "upper": "bodice"}
VALUE_TAGS = {"FIT", "LENGTH", "DIM", "SILHOUETTE", "SLEEVE", "NECKLINE"}


def cue_group(tag: str, value: str, tokens: list[str]) -> str | None:
    if tag == "PART":
        return PART_GROUP.get(value)
    if tag == "LOC":
        return LOC_GROUP.get(value)
    return None


def span_value(tokens: list[str], span: list) -> tuple[str, str]:
    a, b, tag = span
    hit = form_index().get(tuple(tokens[a:b]))
    return tag, hit[1] if hit and hit[0] == tag else ""


def attachments(row: dict, tokens: list[str]) -> list[dict]:
    """Value spans with the part group they attach to, and the cue spans of the request."""
    cues = []
    for s in row["spans"]:
        tag, value = span_value(tokens, s)
        g = cue_group(tag, value, tokens)
        if g:
            cues.append({"start": s[0], "end": s[1], "group": g})
    out = []
    for t in row["triples"]:
        op, rest = t.split(" ", 1)
        slot, _, value = rest.partition("=")
        value = value.split(" ~")[0]
        if "." not in slot or op == "compare" or slot.split(".")[0] not in set(PART_GROUP.values()):
            continue
        group = slot.split(".")[0]
        for s in row["spans"]:
            tag, canon = span_value(tokens, s)
            if tag in VALUE_TAGS and canon == value and not (tag == "NECKLINE" or tag == "SLEEVE") and any(c["group"] == group for c in cues):
                out.append({"value": [s[0], s[1]], "group": group, "key": f"{op}|{slot}|{value}|", "cues": cues})
                break
    return out


def tree_distance(doc, i: int, j: int) -> int:
    def up(k):
        path = [k]
        while doc[path[-1]].head.i != path[-1]:
            path.append(doc[path[-1]].head.i)
        return path

    a, b = up(i), up(j)
    common = next((x for x in a if x in b), None)
    return 99 if common is None else a.index(common) + b.index(common)


def choose(cues: list[dict], value: list[int], dist) -> str:
    return min(cues, key=lambda c: (dist(c), abs(c["start"] - value[0])))["group"]


def run() -> dict:
    import spacy
    from spacy.tokens import Doc

    nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer"])
    rows = [r for r in read_jsonl(GOLD / "binding.jsonl") if r["split"] in ("dev", "test", "requests", "attach_en")]
    out = subprocess.run(["node", "--experimental-strip-types", "scripts/eval-binding.mjs", "--predictions"], cwd=ROOT / "web", capture_output=True, text=True, check=True)
    binder = {k: set(v) for k, v in json.loads(out.stdout).items()}
    from ..lexicon import tokenize

    rows_en = [r for r in rows if not any(w in HINDI_FUNCTION for w in tokenize(r["text"]))]
    hits = {"binder": [], "spacy_tree_nearest": [], "linear_nearest": []}
    n_requests = 0
    for r in rows_en:
        tokens = tokenize(r["text"])
        att = attachments(r, tokens)
        if not att:
            continue
        n_requests += 1
        doc = nlp(Doc(nlp.vocab, words=tokens))
        for a in att:
            hits["binder"].append(a["key"] in binder[r["id"]])
            hits["spacy_tree_nearest"].append(choose(a["cues"], a["value"], lambda c: tree_distance(doc, a["value"][1] - 1, c["end"] - 1)) == a["group"])
            hits["linear_nearest"].append(choose(a["cues"], a["value"], lambda c: 0) == a["group"])
    res: dict = {"task": "value-to-part attachment on English-only gold requests", "n_requests": n_requests, "n_attachments": len(hits["binder"]),
                 "note": "binder scored on gold spans; spaCy and linear choose among the cue spans of the request, so they are not penalised for missing cues",
                 "interval": "bootstrap over attachments, 1000 resamples", "systems": {}}
    for name, h in hits.items():
        res["systems"][name] = {"attachment_accuracy": round(float(np.mean(h)), 4), "ci95": bootstrap_ci(h, lambda v: float(np.mean(v))), "correct": int(sum(h))}
    write_result("dependency", res)
    return res
