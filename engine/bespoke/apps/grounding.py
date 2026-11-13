"""Semantics: grounding an unseen phrase to an ontology value.

The shipped grounder (groundFuzzy in web/lib/engine/lexicon.ts) takes the ontology form with the highest
character-trigram Dice score and answers only above 0.5. Here it is re-implemented, checked against the
TypeScript on every gold phrase, and compared with edit distance and a sentence-embedding similarity, each with
an abstention threshold. Gold: data/gold/grounding.jsonl (phrases the gazetteer does not contain; null = not in
the ontology, so the right answer is to abstain).
"""
from __future__ import annotations

import json
import subprocess
from functools import lru_cache

import numpy as np

from ..lexicon import ontology
from .common import GOLD, ROOT, bootstrap_ci, read_jsonl, write_result

SCORERS = ("trigram_dice", "edit_similarity", "embedding_cosine")
THRESHOLDS = [round(0.30 + 0.02 * i, 2) for i in range(36)]
EMBED_MODEL = "BAAI/bge-small-en-v1.5"


def trigrams(s: str) -> set[str]:
    p = f"  {s} "
    return {p[i:i + 3] for i in range(len(p) - 2)}


def dice(a: str, b: str) -> float:
    ta, tb = trigrams(a), trigrams(b)
    return 2 * len(ta & tb) / (len(ta) + len(tb))


def levenshtein(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def edit_similarity(a: str, b: str) -> float:
    return 1 - levenshtein(a, b) / max(len(a), len(b))


@lru_cache(maxsize=None)
def forms_of(tag: str) -> list[tuple[str, str]]:
    return [(f, v) for v, e in ontology()["lexicon"][tag].items() for f in e["forms"]]


def best(phrase: str, tag: str, sim) -> tuple[str, float]:
    """Highest-scoring (value, score) over the tag's forms; ties keep the first form, as the shipped code does."""
    top = ("", -1.0)
    for form, value in forms_of(tag):
        s = sim(phrase, form)
        if s > top[1]:
            top = (value, s)
    return top


EDIT_GATE = 0.66  # the shipped rule since main 0ec0b5d: the best trigram form must also be this close in spelling


def shipped(phrase: str, tag: str) -> tuple[str, float]:
    """groundFuzzy as shipped: best trigram form, answered only if its Dice is at least 0.5 and its edit similarity at least 0.66.
    A phrase that fails the gate gets score -1, so the 0.5 threshold abstains on it."""
    top, top_form = ("", -1.0), ""
    for form, value in forms_of(tag):
        s = dice(phrase, form)
        if s > top[1]:
            top, top_form = (value, s), form
    return top if edit_similarity(phrase.lower(), top_form.lower()) >= EDIT_GATE else (top[0], -1.0)


class Embedder:
    """Cosine similarity of CLS embeddings of a phrase and each form. English-only model: Hinglish forms are its blind spot."""

    def __init__(self) -> None:
        import torch
        from transformers import AutoModel, AutoTokenizer

        self.torch = torch
        self.tok = AutoTokenizer.from_pretrained(EMBED_MODEL)
        self.model = AutoModel.from_pretrained(EMBED_MODEL).eval()
        self.cache: dict[str, np.ndarray] = {}

    def vec(self, text: str) -> np.ndarray:
        if text not in self.cache:
            with self.torch.no_grad():
                out = self.model(**self.tok(text, return_tensors="pt")).last_hidden_state[0, 0]
            v = out.numpy()
            self.cache[text] = v / np.linalg.norm(v)
        return self.cache[text]

    def sim(self, a: str, b: str) -> float:
        return float(self.vec(a) @ self.vec(b))


def predictions(rows: list[dict], embedder: Embedder) -> dict[str, list[tuple[str, float]]]:
    sims = {"trigram_dice": dice, "edit_similarity": edit_similarity, "embedding_cosine": embedder.sim}
    return {name: [best(r["phrase"], r["tag"], sim) for r in rows] for name, sim in sims.items()}


def judge(rows: list[dict], preds: list[tuple[str, float]], thr: float) -> dict:
    """Precision: of the answers given, how many name the right value. Recall: of the groundable phrases, how many are answered correctly."""
    fired = [(r, p) for r, p in zip(rows, preds) if p[1] >= thr]
    right = sum(1 for r, p in fired if r["value"] == p[0])
    groundable = sum(1 for r in rows if r["value"])
    wrong_on_oov = sum(1 for r, _ in fired if r["value"] is None)
    precision = right / len(fired) if fired else 1.0
    recall = right / groundable
    return {"threshold": thr, "fire_rate": round(len(fired) / len(rows), 4), "precision": round(precision, 4), "recall": round(recall, 4),
            "f1": round(2 * precision * recall / (precision + recall), 4) if precision + recall else 0.0,
            "false_grounds_on_out_of_ontology": wrong_on_oov, "out_of_ontology": len(rows) - groundable}


def node_reference(path) -> list[dict]:
    out = subprocess.run(["node", "--experimental-strip-types", str(ROOT / "web" / "scripts" / "eval-ground.mjs"), str(path)],
                         cwd=ROOT / "web", capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def run() -> dict:
    rows = read_jsonl(GOLD / "grounding.jsonl")
    embedder = Embedder()
    preds = predictions(rows, embedder)

    # the Python trigram score must reproduce the deployed answers, or nothing below is about the product
    ref = node_reference(GOLD / "grounding.jsonl")
    preds["shipped_rule"] = [shipped(r["phrase"], r["tag"]) for r in rows]
    parity = sum(1 for r, p in zip(ref, preds["shipped_rule"]) if (r["value"] if p[1] >= 0.5 else None) == (p[0] if p[1] >= 0.5 else None))
    assert parity == len(rows), f"python and TypeScript groundings differ on {len(rows) - parity} phrases"

    tune = [i for i in range(len(rows)) if i % 2 == 0]
    test = [i for i in range(len(rows)) if i % 2 == 1]
    pick = lambda idx, xs: [xs[i] for i in idx]  # noqa: E731
    out: dict = {"task": "fuzzy grounding of unseen phrases to ontology values, with abstention",
                 "n_phrases": len(rows), "n_groundable": sum(1 for r in rows if r["value"]), "n_out_of_ontology": sum(1 for r in rows if not r["value"]),
                 "split": "threshold chosen on even-numbered phrases, reported on odd-numbered", "seed": 13,
                 "gold_note": "typos and respellings written by one annotator; out-of-ontology words are real garment vocabulary the ontology lacks",
                 "embedding_model": EMBED_MODEL, "parity_with_typescript": f"{parity}/{len(rows)} phrases", "systems": {}}
    for name in SCORERS:
        sweep = [judge(pick(tune, rows), pick(tune, preds[name]), t) for t in THRESHOLDS]
        chosen = max(sweep, key=lambda s: (s["f1"], -s["false_grounds_on_out_of_ontology"], s["threshold"]))["threshold"]
        held = judge(pick(test, rows), pick(test, preds[name]), chosen)
        pairs = [(rows[i], preds[name][i]) for i in test]
        held["f1_ci95"] = bootstrap_ci(pairs, lambda ps: judge([a for a, _ in ps], [b for _, b in ps], chosen)["f1"])
        out["systems"][name] = {"chosen_threshold": chosen, "held_out": held,
                                "all_phrases_at_chosen": judge(rows, preds[name], chosen),
                                "sweep_all_phrases": [judge(rows, preds[name], t) for t in THRESHOLDS[::3]]}
    out["deployed"] = {"system": "trigram Dice at 0.5 plus edit similarity at least 0.66, as shipped", "all_phrases": judge(rows, preds["shipped_rule"], 0.5)}
    out["before_edit_gate"] = {"system": "trigram Dice at 0.5 alone, the rule before main 0ec0b5d", "all_phrases": judge(rows, preds["trigram_dice"], 0.5)}
    wrong = [{"phrase": r["phrase"], "tag": r["tag"], "gold": r["value"], "answered": p[0], "score": round(p[1], 3)}
             for r, p in zip(rows, preds["shipped_rule"]) if p[1] >= 0.5 and r["value"] != p[0]]
    out["deployed_errors"] = wrong
    write_result("grounding", out)
    return out
