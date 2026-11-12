"""Word embeddings: gensim word2vec (skip-gram) and fastText trained on Bespoke text, plus MiniLM as a static word encoder.

Each model is wrapped as `Embedder` with `vector(word)` returning None when it cannot embed the word,
so out-of-vocabulary behaviour is part of what gets measured.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Callable

import numpy as np

from . import corpus

SEED = corpus.SEED
MINILM = "microsoft/MiniLM-L12-H384-uncased"  # the base the product's tagger was fine-tuned from


@dataclass
class Embedder:
    name: str
    vector: Callable[[str], np.ndarray | None]
    dim: int


def training_sentences() -> list[list[str]]:
    """Real text only: catalogue titles and assistant guides. Template-generated requests would teach the templates."""
    src = corpus.text_sources()
    return src["catalogue"] + src["guides"]


def train_word2vec(sentences: list[list[str]], dim: int = 100, epochs: int = 15) -> Embedder:
    from gensim.models import Word2Vec
    m = Word2Vec(sentences, vector_size=dim, window=5, min_count=2, sg=1, negative=10, epochs=epochs, seed=SEED, workers=1)
    return Embedder("word2vec (skip-gram)", lambda w: m.wv[w] if w in m.wv else None, dim)


def train_fasttext(sentences: list[list[str]], dim: int = 100, epochs: int = 15) -> Embedder:
    from gensim.models import FastText
    m = FastText(sentences, vector_size=dim, window=5, min_count=2, sg=1, negative=10, epochs=epochs, min_n=3, max_n=5, seed=SEED, workers=1)
    return Embedder("fastText (3-5 char n-grams)", lambda w: m.wv[w], dim)


def minilm_static(centre_on: list[str] | None = None) -> Embedder | None:
    """Mean of the last hidden states of a word's word-pieces, read in isolation. Optionally mean-centred."""
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    try:
        import torch
        from transformers import AutoModel, AutoTokenizer
        tok = AutoTokenizer.from_pretrained(MINILM)
        model = AutoModel.from_pretrained(MINILM).eval()
    except Exception:  # weights not cached: the comparison is reported as skipped
        return None
    cache: dict[str, np.ndarray] = {}

    def raw(word: str) -> np.ndarray:
        if word not in cache:
            enc = tok(word, return_tensors="pt")
            with torch.no_grad():
                h = model(**enc).last_hidden_state[0, 1:-1]
            cache[word] = h.mean(0).numpy()
        return cache[word]

    mu = np.mean([raw(w) for w in centre_on], axis=0) if centre_on else 0.0
    return Embedder("MiniLM-L12 static" + (" (mean-centred)" if centre_on else ""), lambda w: raw(w) - mu, model.config.hidden_size)


def char_trigrams(words: list[str]) -> Embedder:
    """Baseline with no learning: hashed-free character-trigram indicator vectors."""
    grams = {g: i for i, g in enumerate(sorted({f"<{w}>"[j:j + 3] for w in words for j in range(len(w))}))}

    def vec(w: str) -> np.ndarray:
        v = np.zeros(len(grams))
        for j in range(len(w)):
            i = grams.get(f"<{w}>"[j:j + 3])
            if i is not None:
                v[i] = 1
        return v
    return Embedder("character trigrams", vec, len(grams))


def unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n else v
