"""GPT: decoder-only language models on Bespoke requests.

Two measurable questions on the 52 gold test requests (tokenised, space-joined):
  * perplexity of GPT-2 and distilgpt2 as they come, and of distilgpt2 fine-tuned on 6000 synthetic requests
    (the domain-adaptation gain, split into English-only and Hinglish requests);
  * plausibility: how often a request has lower perplexity than the same words shuffled (50 shuffles each),
    a check that the model prefers real request syntax over a bag of words.
Perplexity is per GPT-2 subword token, so it is comparable between models that share the tokenizer.
"""
from __future__ import annotations

import math
import random

import numpy as np

from ..data import synth_sentence
from .common import SEED, bootstrap_ci, gold_requests, write_result
from .pos import HINDI_FUNCTION

N_TRAIN = 6000
EPOCHS = 2


def nll(model, tok, text: str, dev: str) -> tuple[float, int]:
    import torch

    ids = tok(tok.bos_token + text, return_tensors="pt").input_ids.to(dev)
    with torch.no_grad():
        loss = model(ids, labels=ids).loss.item()
    return loss * (ids.shape[1] - 1), ids.shape[1] - 1


def perplexity(model, tok, texts: list[str], dev: str) -> float:
    parts = [nll(model, tok, t, dev) for t in texts]
    return math.exp(sum(a for a, _ in parts) / sum(n for _, n in parts))


def plausibility(model, tok, texts: list[str], dev: str, rng: random.Random, n_shuffles: int = 50) -> list[float]:
    """Per request: the share of shuffles that have higher perplexity than the real order."""
    out = []
    for t in texts:
        real = nll(model, tok, t, dev)
        words = t.split()
        wins = 0
        for _ in range(n_shuffles):
            rng.shuffle(words)
            s = nll(model, tok, " ".join(words), dev)
            wins += s[0] / s[1] > real[0] / real[1]
        out.append(wins / n_shuffles)
    return out


def finetune(name: str, texts: list[str], dev: str):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, get_linear_schedule_with_warmup

    torch.manual_seed(SEED)
    rng = random.Random(SEED)
    tok = AutoTokenizer.from_pretrained(name)
    tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(name).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=0.01)
    steps = EPOCHS * -(-len(texts) // 32)
    sched = get_linear_schedule_with_warmup(opt, int(0.05 * steps), steps)
    model.train()
    for _ in range(EPOCHS):
        rng.shuffle(texts)
        for i in range(0, len(texts), 32):
            enc = tok([tok.bos_token + t + tok.eos_token for t in texts[i:i + 32]], return_tensors="pt", padding=True).to(dev)
            labels = enc.input_ids.masked_fill(enc.attention_mask == 0, -100)
            model(**enc, labels=labels).loss.backward()
            opt.step(); sched.step(); opt.zero_grad()
    return model.eval(), tok


def run() -> dict:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    _, test = gold_requests()
    texts = [" ".join(w for w, _ in r) for r in test]
    hinglish = [i for i, r in enumerate(test) if any(w in HINDI_FUNCTION for w, _ in r)]
    english = [i for i in range(len(test)) if i not in set(hinglish)]
    rng = random.Random(SEED)
    synth = [" ".join(w for w, _ in synth_sentence(rng)) for _ in range(N_TRAIN)]
    models = {}
    for name in ("gpt2", "distilgpt2"):
        tok = AutoTokenizer.from_pretrained(name)
        models[name] = (AutoModelForCausalLM.from_pretrained(name).to(dev).eval(), tok)
    models["distilgpt2_finetuned_on_synthetic"] = finetune("distilgpt2", synth, dev)
    out: dict = {"task": "decoder-only LMs on gold test requests", "n_requests": len(texts), "n_english_only": len(english), "n_hinglish": len(hinglish),
                 "train_requests": N_TRAIN, "epochs": EPOCHS, "seed": SEED, "interval": "bootstrap over requests, 1000 resamples", "models": {}}
    for name, (model, tok) in models.items():
        per = {"all": texts, "english_only": [texts[i] for i in english], "hinglish": [texts[i] for i in hinglish]}
        ppl = {k: round(perplexity(model, tok, v, dev), 2) for k, v in per.items()}
        ppl_ci = bootstrap_ci(texts, lambda ts: perplexity(model, tok, list(ts), dev), n=200)
        wins = plausibility(model, tok, texts, dev, random.Random(SEED))
        out["models"][name] = {"perplexity": ppl, "perplexity_all_ci95": ppl_ci, "real_beats_shuffled_mean": round(float(np.mean(wins)), 4),
                               "real_beats_shuffled_ci95": bootstrap_ci(wins, lambda v: float(np.mean(v)))}
        print(name, out["models"][name], flush=True)
    write_result("gpt", out)
    return out
