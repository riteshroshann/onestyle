"""Do the embeddings put the ontology's forms where the ontology says they belong? Synonym retrieval and typo recovery."""
from __future__ import annotations

import random

import numpy as np

from ..data import _noise
from . import corpus
from .embed import Embedder, SEED, char_trigrams, minilm_static, train_fasttext, train_word2vec, unit
from .morph import Lemmatiser, single_token_vocab
from .stats import bootstrap_mean_ci


def _index(emb: Embedder, forms: dict[str, tuple[str, str]]) -> tuple[list[str], np.ndarray]:
    kept = [(f, emb.vector(f)) for f in forms]
    kept = [(f, v) for f, v in kept if v is not None]
    return [f for f, _ in kept], np.array([unit(v) for _, v in kept])


def _ci(hits: list[float]) -> dict:
    return {"value": round(float(np.mean(hits)), 3), "ci95": bootstrap_mean_ci(np.array(hits)), "n": len(hits)}


def synonym_retrieval(emb: Embedder, forms: dict[str, tuple[str, str]]) -> dict:
    names, mat = _index(emb, forms)
    sims = mat @ mat.T
    np.fill_diagonal(sims, -2)
    labels = [forms[n] for n in names]
    same_value, same_tag, chance = [], [], []
    for i, lab in enumerate(labels):
        siblings = sum(1 for j, l in enumerate(labels) if j != i and l == lab)
        if not siblings:
            continue
        j = int(sims[i].argmax())
        same_value.append(float(labels[j] == lab))
        same_tag.append(float(labels[j][0] == lab[0]))
        chance.append(siblings / (len(labels) - 1))
    return {"coverage": round(len(names) / len(forms), 3), "hit@1_same_value": _ci(same_value),
            "hit@1_same_tag": _ci(same_tag), "chance_same_value": round(float(np.mean(chance)), 4)}


def typo_recovery(emb: Embedder | None, forms: dict[str, tuple[str, str]], queries: list[tuple[str, str]], lem: Lemmatiser | None = None) -> dict:
    """Noisy form in, nearest ontology form out; a hit when it carries the original's (tag, value)."""
    hits = []
    if lem is not None:
        for noisy, orig in queries:
            got = lem.lemma(noisy)
            hits.append(float(bool(got) and got[0] == forms[orig]))
        return _ci(hits)
    names, mat = _index(emb, forms)
    for noisy, orig in queries:
        v = emb.vector(noisy)
        hits.append(float(v is not None and forms[names[int((mat @ unit(v)).argmax())]] == forms[orig]))
    return _ci(hits)


def run() -> dict:
    forms = {f: h for f, h in single_token_vocab().items() if len(f) >= 3}
    sentences = _sentences()
    models: list[Embedder] = [train_word2vec(sentences), train_fasttext(sentences), char_trigrams(list(forms))]
    centred = minilm_static(centre_on=list(forms))
    raw = minilm_static()
    models += [m for m in (raw, centred) if m]
    rng = random.Random(SEED)
    queries = []
    for f in sorted(forms):
        if len(f) >= 6:
            noisy = _noise(f, rng)
            if noisy != f and noisy not in forms:
                queries.append((noisy, f))
    res = {"topic": "neural word embeddings", "seed": SEED,
           "training_text": {"sentences": len(sentences), "tokens": sum(len(s) for s in sentences),
                             "note": "catalogue titles (English, no Hinglish) plus 70 assistant guide chunks; small for word2vec"},
           "ontology_forms": len(forms), "typo_queries": len(queries),
           "models": {}, "minilm": "base checkpoint the product's tagger was fine-tuned from, used as a static encoder" if raw else "skipped: weights not in the local Hugging Face cache"}
    for m in models:
        res["models"][m.name] = {"dim": m.dim, "synonym_retrieval": synonym_retrieval(m, forms), "typo_recovery": typo_recovery(m, forms, queries)}
    res["models"]["morphological fallback (bespoke/nlp/morph.py)"] = {"typo_recovery": typo_recovery(None, forms, queries, Lemmatiser.build())}
    res["caveat"] = ("word2vec only embeds forms the catalogue contains, so its synonym retrieval covers few Hinglish forms (see coverage) and it cannot "
                     "embed a typo at all. Typo queries are synthetic noise on the forms. Nothing here is a downstream product metric.")
    corpus.write_json("embeddings", res)
    _save_vectors(models, forms)
    return res


def _sentences() -> list[list[str]]:
    from .embed import training_sentences
    return training_sentences()


def _save_vectors(models: list[Embedder], forms: dict[str, tuple[str, str]]) -> None:
    """Projection data for figures: fastText vectors of the ontology forms, cached outside git."""
    ft = next(m for m in models if m.name.startswith("fastText"))
    names = sorted(forms)
    path = corpus.CACHE / "ontology_fasttext.npz"
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, names=np.array(names), tags=np.array([forms[n][0] for n in names]), vecs=np.array([ft.vector(n) for n in names]))
