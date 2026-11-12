"""Shared paths, gold readers, bootstrap intervals and result writing for the studies."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

from ..data import read_gold

ENGINE = Path(__file__).resolve().parents[2]
ROOT = ENGINE.parent
RESULTS = ROOT / "results"
GOLD = ROOT / "data" / "gold"
TAGGER_DIR = ROOT / "web" / "public" / "models" / "bespoke-tagger"
SEED = 13
N_DEV = 30  # same dev/test split as scripts/ladder.py


def gold_requests() -> tuple[list[list[tuple[str, str]]], list[list[tuple[str, str]]]]:
    """(dev, test) token/BIO rows of data/gold/requests.txt."""
    rows = read_gold(GOLD / "requests.txt")
    return rows[:N_DEV], rows[N_DEV:]


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf8").splitlines() if l.strip()]


def write_result(name: str, result: dict) -> Path:
    RESULTS.mkdir(exist_ok=True)
    path = RESULTS / f"{name}.json"
    path.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf8")
    return path


def bootstrap_ci(items: Sequence, stat: Callable[[Sequence], float], n: int = 1000, seed: int = SEED) -> list[float]:
    """95% percentile bootstrap over items."""
    rng = np.random.default_rng(seed)
    idx = np.arange(len(items))
    vals = [stat([items[i] for i in rng.choice(idx, len(idx))]) for _ in range(n)]
    return [round(float(np.percentile(vals, 2.5)), 4), round(float(np.percentile(vals, 97.5)), 4)]


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"precision": round(p, 4), "recall": round(r, 4), "f1": round(2 * p * r / (p + r), 4) if p + r else 0.0}
