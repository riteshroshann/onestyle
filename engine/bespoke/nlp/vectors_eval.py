"""Measured studies for one-hot, the BoW dictionary and TF-IDF on Bespoke's text."""
from __future__ import annotations

import json
import shutil
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from ..lexicon import form_index, tokenize
from . import corpus
from .vectors import BagOfWords, Tfidf, Vocabulary, bm25_scores, cosine, join_multiword, one_hot

SEED = corpus.SEED
HERE = Path(__file__).parent


def _catalogue_or_fallback() -> tuple[list[list[str]], str]:
    cat = corpus.catalogue_tokens()
    if cat:
        return cat, "catalogue titles (Myntra styles.csv)"
    src = corpus.text_sources()
    return src["synthetic"][:5000] + src["guides"] + src["gold"], "synthetic + guides + gold (styles.csv missing)"


def _split(docs: list, seed: int = SEED, frac: float = 0.8) -> tuple[list, list]:
    idx = np.random.default_rng(seed).permutation(len(docs))
    cut = int(frac * len(docs))
    return [docs[i] for i in idx[:cut]], [docs[i] for i in idx[cut:]]


def sibling_groups() -> dict[tuple[str, str], list[str]]:
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for key, hit in form_index().items():
        if len(key) == 1 and key[0].isalpha():
            groups[hit].append(key[0])
    return {g: f for g, f in groups.items() if len(f) >= 2}


def run_onehot() -> dict:
    docs, source = _catalogue_or_fallback()
    vocab = Vocabulary.build(docs + corpus.text_sources()["gold"])
    sib = [(a, b) for forms in sibling_groups().values() for a in forms for b in forms
           if a < b and a in vocab.index and b in vocab.index]
    onehot_cos = [float((one_hot(vocab, [a]) @ one_hot(vocab, [b]).T).toarray()[0, 0]) for a, b in sib]
    trigrams = {g: i for i, g in enumerate(sorted({w[i:i + 3] for w in vocab.index for i in range(len(w) - 2)}))}

    def tri(w: str) -> np.ndarray:  # contrast: character trigrams see that kurti and kurta share letters
        v = np.zeros(len(trigrams))
        for g in {w[i:i + 3] for i in range(len(w) - 2)}:
            v[trigrams[g]] = 1
        return v

    rng = np.random.default_rng(SEED)
    words = list(vocab.index)
    rand = [tuple(rng.choice(words, 2, replace=False)) for _ in range(len(sib))]
    res = {
        "topic": "one-hot encoding", "source": source, "seed": SEED,
        "vocabulary_size": len(vocab), "dimension": len(vocab),
        "dense_matrix_for_vocab_MB": round(len(vocab) ** 2 * 8 / 1e6, 1),
        "sibling_pairs": {"n": len(sib), "note": "forms the ontology maps to one canonical value (kurti/kurta, dheela/dheeli)"},
        "mean_cosine": {
            "one_hot_siblings": round(float(np.mean(onehot_cos)), 4),
            "one_hot_random_pairs": 0.0,
            "char_trigram_siblings": round(float(np.mean([cosine(tri(a), tri(b)) for a, b in sib])), 4),
            "char_trigram_random_pairs": round(float(np.mean([cosine(tri(a), tri(b)) for a, b in rand])), 4),
        },
        "reading": "Every distinct word is orthogonal to every other, so one-hot cannot tell that kurti and kurta mean the same; "
                   "dimension equals vocabulary size and unseen words encode to zero.",
    }
    corpus.write_json("onehot", res)
    return res


def run_bow() -> dict:
    docs, source = _catalogue_or_fallback()
    train, held = _split(docs)
    gold = corpus.text_sources()["gold"]
    table = {}
    for min_df in (1, 2, 5, 10):
        bow = BagOfWords(min_df=min_df).fit(train)
        table[f"unigram min_df={min_df}"] = {"vocab": len(bow.vocab), "oov_heldout_titles": round(bow.vocab.oov_rate(held), 4),
                                             "oov_gold_requests": round(bow.vocab.oov_rate(gold), 4)}
    for join in (False, True):
        bow = BagOfWords(ngram=(1, 2), min_df=2, max_features=30000, join=join).fit(train)
        cov = bow.transform(held[:2000], binary=True)
        table[f"uni+bigram min_df=2 cap 30000, join multiword={join}"] = {
            "vocab": len(bow.vocab), "multiword_units": sum("_" in k for k in bow.vocab.index),
            "avg_features_per_title": round(float(cov.sum(1).mean()), 2)}
    res = {"topic": "bag-of-words dictionary", "source": source, "seed": SEED, "split": f"{len(train)} fit / {len(held)} held-out titles",
           "table": table, "join_example": join_multiword(tokenize("a puff sleeve kurti with v neck and boat neck")),
           "caveat": "Held-out OOV is measured on English catalogue titles; the 82 gold requests include Hinglish that this text never "
                     "contains, so their OOV rate is high by design. That is the argument for the morphology fallback and subword embeddings."}
    corpus.write_json("bow", res)
    return res


RETRIEVAL_CASES = [  # the 17 labelled queries in web/tests/assistant.test.ts
    ("neckline depth kaise batau", "sheet/neckline-depth-what-it-means"), ("how do I measure my bust", "measuring/how-to-measure-your-bust"),
    ("what does ease mean", "sheet/ease-what-it-means"), ("how do I tell the tailor not this colour", "moodboard/saying-not-this-colour"),
    ("what happens after I send my design", "makers/what-happens-after-you-send-your-design"), ("what are the request statuses", "makers/request-statuses"),
    ("baazu ki length kaise naap", "measuring/how-to-measure-sleeve-length"), ("hip kaise naapte hain", "measuring/how-to-measure-your-hip"),
    ("how does the maker flag missing details", "makers/how-a-maker-flags-missing-details"), ("can I get the tailor sheet in Hindi", "sheet/english-and-hindi-sheets"),
    ("how do I circle a sleeve on a picture", "moodboard/circling-a-detail"), ("how do I say deeper than picture 1", "moodboard/comparing-pictures-deeper-than-1"),
    ("does bespoke give prices", "limits/prices-and-delivery"), ("what is a maker account", "makers/maker-accounts"),
    ("what fabrics are good for winter", "glossary/glossary-winter-fabrics"), ("what does a declined request mean", "makers/if-a-request-is-declined"),
    ("darzi ko kaise bheju design", "makers/sending-a-design-to-a-maker"),
]


def _product_top1(queries: list[str]) -> list[str | None] | None:
    node = shutil.which("node")
    if not node:
        return None
    out = subprocess.run([node, str(HERE / "retrieve_probe.mjs")], input=json.dumps(queries), capture_output=True, text=True, timeout=60)
    return json.loads(out.stdout) if out.returncode == 0 else None


def _rank_metrics(ranks: list[int]) -> dict:
    r = np.array(ranks, dtype=float)
    return {"hit@1": round(float((r == 1).mean()), 3), "hit@3": round(float((r <= 3).mean()), 3), "mrr": round(float((1 / r).mean()), 3)}


def retrieval_study() -> dict:
    chunks = json.loads((corpus.GUIDES.parent / "index.json").read_text(encoding="utf8"))["chunks"]
    docs = [tokenize(f"{c['title']} {c['title']} {c['text']}") for c in chunks]
    bow = BagOfWords().fit(docs)
    counts = bow.transform(docs)
    tfidf = Tfidf(sublinear=True).fit(counts)
    mat = tfidf.transform(counts)
    ids = [c["id"] for c in chunks]
    ranks: dict[str, list[int]] = {"tfidf cosine": [], "bm25 (numpy, same tokens)": []}
    for q, want in RETRIEVAL_CASES:
        scores = {
            "tfidf cosine": (mat @ tfidf.transform(bow.transform([tokenize(q)])).T).toarray().ravel(),
            "bm25 (numpy, same tokens)": bm25_scores(counts, [bow.vocab.index[t] for t in tokenize(q) if t in bow.vocab.index]),
        }
        for name, s in scores.items():
            order = list(np.argsort(-s, kind="stable"))
            ranks[name].append(order.index(ids.index(want)) + 1 if s.max() > 0 else len(ids))
    out: dict = {name: _rank_metrics(r) for name, r in ranks.items()}
    prod = _product_top1([q for q, _ in RETRIEVAL_CASES])
    if prod:
        out["product BM25 (retrieve.js, hand Hindi folding)"] = {"hit@1": round(float(np.mean([p == w for p, (_, w) in zip(prod, RETRIEVAL_CASES)])), 3)}
    out["n_queries"] = len(RETRIEVAL_CASES)
    out["misses_tfidf"] = [q for (q, _), r in zip(RETRIEVAL_CASES, ranks["tfidf cosine"]) if r > 1]
    return out


def classification_study() -> dict | None:
    df = corpus.catalogue_frame()
    if df is None:
        return None
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import f1_score
    keep = df[df["usage"].isin(["Casual", "Sports", "Ethnic", "Formal"])].reset_index(drop=True)
    docs = [tokenize(t) for t in keep["productDisplayName"]]
    y = keep["usage"].to_numpy()
    idx = np.random.default_rng(SEED).permutation(len(docs))
    cut = int(0.8 * len(docs))
    tr, te = idx[:cut], idx[cut:]
    train_docs, test_docs = [docs[i] for i in tr], [docs[i] for i in te]
    res: dict = {}
    configs = {
        "multi-hot (binary) unigrams": ((1, 1), "binary"),
        "counts unigrams": ((1, 1), "counts"),
        "tf-idf unigrams": ((1, 1), "tfidf"),
        "tf-idf uni+bigrams, sublinear": ((1, 2), "tfidf_sub"),
    }
    for name, (ngram, mode) in configs.items():
        bow = BagOfWords(ngram=ngram, min_df=2, max_features=30000).fit(train_docs)
        xt, xe = bow.transform(train_docs, binary=mode == "binary"), bow.transform(test_docs, binary=mode == "binary")
        if mode.startswith("tfidf"):
            t = Tfidf(sublinear=mode == "tfidf_sub").fit(xt)
            xt, xe = t.transform(xt), t.transform(xe)
        clf = LogisticRegression(C=10, max_iter=300, class_weight="balanced").fit(xt, y[tr])
        pred = clf.predict(xe)
        rng = np.random.default_rng(SEED)
        boots = [f1_score(y[te][s], pred[s], average="macro") for s in (rng.integers(0, len(te), len(te)) for _ in range(100))]
        res[name] = {"macro_f1": round(float(f1_score(y[te], pred, average="macro")), 4),
                     "ci95": [round(float(np.percentile(boots, 2.5)), 4), round(float(np.percentile(boots, 97.5)), 4)],
                     "accuracy": round(float((pred == y[te]).mean()), 4), "features": xt.shape[1]}
        if mode == "tfidf_sub":
            terms = np.array(sorted(bow.vocab.index, key=bow.vocab.index.get))
            res["top_terms_per_class"] = {c: terms[np.argsort(-clf.coef_[k])[:8]].tolist() for k, c in enumerate(clf.classes_)}
    res["majority_class_accuracy"] = round(float(Counter(y[te]).most_common(1)[0][1] / len(te)), 4)
    res["task"] = "Myntra title to usage (Casual, Sports, Ethnic, Formal); labels come from the catalogue, not from the gazetteer"
    res["split"] = f"{len(tr)} train / {len(te)} test titles, seed {SEED}"
    return res


def mine_candidates(limit: int = 30) -> list[dict]:
    """Frequent catalogue words the gazetteer lacks, ranked by df * idf: a reviewer's shortlist for ontology growth."""
    docs = corpus.catalogue_tokens()
    if not docs:
        return []
    known = {k[0] for k in form_index() if len(k) == 1}
    df = Counter(t for d in docs for t in set(d))
    n = len(docs)
    rows = [(t, c, c * np.log(n / c)) for t, c in df.items() if t.isalpha() and len(t) >= 4 and t not in known and c >= 20]
    rows.sort(key=lambda r: -r[2])
    return [{"word": t, "titles": c} for t, c, _ in rows[:limit]]


def run_tfidf() -> dict:
    res = {"topic": "TF-IDF", "seed": SEED, "implementation": "from scratch (bespoke/nlp/vectors.py), checked against sklearn TfidfTransformer",
           "help_retrieval": retrieval_study(),
           "retrieval_caveat": "17 queries, the same ones the product's BM25 was tuned on; a sanity check, not an unbiased test.",
           "usage_classification": classification_study() or "skipped: data/raw/styles.csv missing",
           "ontology_candidates_by_df_idf": mine_candidates()}
    corpus.write_json("tfidf", res)
    return res
