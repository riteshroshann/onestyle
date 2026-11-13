"""HMM and CRF studies: smoothing and regularisation tuned on dev, feature-group ablation, learned transitions.

Every choice is made on the 30 dev requests and reported on the 52 test requests. Dev is small, so a
chosen setting can lose to a neighbour on test; the curves are written out in full for that reason.
"""
from __future__ import annotations

import random

import numpy as np

from . import corpus, ladder_io as L
from .hmm import HMM
from .stats import bootstrap_ci, paired_bootstrap, span_f1

SEED = corpus.SEED


def _gold(rows: list[dict]) -> list[list[str]]:
    return [r["tags"] for r in rows]


def _score(rows: list[dict], pred: list[list[str]]) -> dict:
    return {"f1": round(span_f1(_gold(rows), pred), 4), "ci95": bootstrap_ci(_gold(rows), pred, n=500)}


def _hmm_f1(m: HMM, rows: list[dict]) -> float:
    return span_f1(_gold(rows), [m.predict(r["tokens"]) for r in rows])


def run_hmm() -> dict:
    train = L.train_dicts()
    dev, test = corpus.to_dicts(corpus.gold_dev()), corpus.to_dicts(corpus.gold_test())
    shipped = L.ladder.HMM().fit(train)
    shipped_pred = [shipped.predict(r["tokens"]) for r in test]
    curve, models = {}, {}
    for k in (0.01, 0.03, 0.1, 0.3, 1.0):
        models[k] = HMM(k, k).fit(train)
        curve[str(k)] = {"dev_f1": round(_hmm_f1(models[k], dev), 4), "test_f1": round(_hmm_f1(models[k], test), 4)}
    best = max(models, key=lambda k: (curve[str(k)]["dev_f1"], -k))
    best_pred = [models[best].predict(r["tokens"]) for r in test]
    res: dict = {
        "topic": "hidden markov model", "seed": SEED,
        "shipped_ladder_hmm": {"split": "test n=52", **_score(test, shipped_pred)},
        "per_tag_emission_hmm": {"k_sweep_on_dev": curve, "chosen_k_on_dev": best, "test": _score(test, best_pred),
                                 "vs_shipped_paired_bootstrap": paired_bootstrap(_gold(test), best_pred, shipped_pred)},
        "invalid_bio_transition_mass": {"note": "mean probability of a transition that puts I-X after something other than B-X or I-X",
                                         "per_tag_emission_hmm": round(models[best].invalid_transition_mass(), 5)},
        "semi_supervised": semi_supervised(train, dev, test),
        "caveat": "Dev has 30 requests, so k picked on dev can lose to its neighbours on the 52-request test; see the full sweep. "
                  "Training text is mostly template-generated.",
    }
    corpus.write_json("hmm", res)
    return res


def semi_supervised(train: list[dict], dev: list[dict], test: list[dict]) -> dict:
    """Few labelled sentences plus Baum-Welch over unlabelled ones. EM weight and iterations are chosen on dev."""
    out: dict = {"unlabelled_sentences": 3000, "grid": "EM weight {0.05, 0.2, 1.0} x iterations {1, 2, 3}, chosen on dev per run", "runs": {}}
    for n_lab in (100, 300, 1000):
        sup, semi = [], []
        for seed in (1, 2, 3):
            rng = random.Random(seed)
            idx = list(range(len(train)))
            rng.shuffle(idx)
            lab = [train[i] for i in idx[:n_lab]]
            unl = [train[i]["tokens"] for i in idx[n_lab:n_lab + 3000]]
            base = HMM(0.1, 0.1).fit(lab)
            sup.append(_hmm_f1(base, test))
            best_dev, best_test = _hmm_f1(base, dev), sup[-1]  # EM must beat supervised on dev to be adopted
            for w in (0.05, 0.2, 1.0):
                m = HMM(0.1, 0.1).fit(lab)
                for it in range(1, 4):
                    m.baum_welch(unl, iterations=1, weight=w)
                    d = _hmm_f1(m, dev)
                    if d > best_dev:
                        best_dev, best_test = d, _hmm_f1(m, test)
            semi.append(best_test)
        out["runs"][f"{n_lab} labelled"] = {"supervised_test_f1_mean": round(float(np.mean(sup)), 4), "semi_supervised_test_f1_mean": round(float(np.mean(semi)), 4),
                                             "per_seed_supervised": [round(x, 4) for x in sup], "per_seed_semi": [round(x, 4) for x in semi]}
    out["reading"] = "Each EM step is re-scored on dev and adopted only if it beats supervised-only on dev; 3 seeds per size."
    return out


# ------------------------------------------------------------------ CRF
def _fit_score(train: list[dict], dev: list[dict], test: list[dict], gaz: bool, c1: float, c2: float, groups, iters: int) -> tuple[float, float, object]:
    crf = L.fit_crf(train, gaz, c1, c2, groups, iters)
    f = lambda rows: span_f1(_gold(rows), crf.predict([L.crf_features(r["tokens"], gaz, groups) for r in rows]))  # noqa: E731
    return f(dev), f(test), crf


def run_crf() -> dict:
    train = L.train_dicts()
    dev, test = corpus.to_dicts(corpus.gold_dev()), corpus.to_dicts(corpus.gold_test())
    rng = random.Random(SEED)
    small = rng.sample(train, 4000)
    ALL = frozenset({"word", "affix", "shape", "window"})
    ITERS = 60
    ablation = {}
    for name, (gaz, groups) in {
        "all groups + gazetteer": (True, ALL),
        "minus word identity": (True, ALL - {"word"}),
        "minus affixes": (True, ALL - {"affix"}),
        "minus shape": (True, ALL - {"shape"}),
        "minus window (neighbour words)": (True, ALL - {"window"}),
        "minus gazetteer": (False, ALL),
        "gazetteer only": (True, frozenset()),
    }.items():
        d, t, _ = _fit_score(small, dev, test, gaz, 0.05, 0.05, groups, ITERS)
        ablation[name] = {"dev_f1": round(d, 4), "test_f1": round(t, 4)}
    grid = {}
    for c1 in (0.01, 0.05, 0.2):
        for c2 in (0.01, 0.05, 0.2):
            d, t, _ = _fit_score(small, dev, test, True, c1, c2, ALL, ITERS)
            grid[f"c1={c1}, c2={c2}"] = {"dev_f1": round(d, 4), "test_f1": round(t, 4)}
    best_key = max(grid, key=lambda k: grid[k]["dev_f1"])
    c1, c2 = (float(x.split("=")[1]) for x in best_key.split(", "))
    base_crf = L.cached("crf_gaz", lambda: L.fit_crf(train, gaz=True))
    tuned, secs = L.timed(lambda: L.fit_crf(train, True, c1, c2))
    base_pred = base_crf.predict([L.crf_features(r["tokens"], True) for r in test])
    tuned_pred = tuned.predict([L.crf_features(r["tokens"], True) for r in test])
    res = {
        "topic": "conditional random field", "seed": SEED,
        "protocol": f"ablation and grid on a {len(small)}-sentence subsample with {ITERS} L-BFGS iterations (about a minute each); the chosen setting is refit on all 12,000",
        "feature_group_ablation": ablation,
        "regularisation_grid_dev_chosen": {"grid": grid, "chosen": best_key},
        "full_training": {"default c1=c2=0.05": _score(test, base_pred), f"tuned {best_key}": {**_score(test, tuned_pred), "train_seconds": secs},
                          "paired_bootstrap_tuned_vs_default": paired_bootstrap(_gold(test), tuned_pred, base_pred)},
        "transitions": transition_analysis(tuned),
        "caveat": "Dev has 30 requests; many settings tie on dev and differences on test are within bootstrap noise. Ablation is on a subsample, so absolute F1 is below the full model's.",
    }
    corpus.write_json("crf", res)
    return res


def transition_analysis(crf) -> dict:
    """What the CRF learned about label order: BIO-invalid transitions should be strongly negative."""
    tr = crf.transition_features_
    invalid = {k: v for k, v in tr.items() if k[1].startswith("I-") and k[0] not in (f"B-{k[1][2:]}", k[1])}
    valid = {k: v for k, v in tr.items() if k not in invalid}
    top = sorted(tr.items(), key=lambda kv: -kv[1])
    return {
        "n_transitions": len(tr), "invalid_bio": {"n": len(invalid), "mean_weight": round(float(np.mean(list(invalid.values()))), 3),
                                                  "share_positive": round(float(np.mean([v > 0 for v in invalid.values()])), 3)},
        "valid_mean_weight": round(float(np.mean(list(valid.values()))), 3),
        "strongest_positive": [[a, b, round(v, 2)] for (a, b), v in top[:8]],
        "strongest_negative": [[a, b, round(v, 2)] for (a, b), v in top[-8:]],
    }
