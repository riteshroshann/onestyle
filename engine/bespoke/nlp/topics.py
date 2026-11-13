"""Topic models over catalogue titles: LDA (gensim) and NMF on TF-IDF (scikit-learn), scored by NPMI coherence.

Fit on 80% of titles, coherence measured on the other 20% so a topic that only memorises its training titles scores badly.
Two vocabularies: all content words, and content words the gazetteer does not already know (the ontology-growth view).
"""
from __future__ import annotations

import numpy as np

from ..lexicon import form_index
from . import corpus

SEED = corpus.SEED
STOP = set("a an and the of for with in on to by at from is are this that it its as or be your you my our new men women man woman boys girls boy girl "
           "kids unisex pack set combo size pair".split())
TOP_N = 10


def prepare(known_removed: bool) -> list[list[str]]:
    known = {k[0] for k in form_index() if len(k) == 1}
    docs = []
    for toks in corpus.catalogue_tokens():
        words = [t for t in toks if t.isalpha() and len(t) >= 3 and t not in STOP and not (known_removed and t in known)]
        if len(words) >= 2:
            docs.append(words)
    return docs


def split(docs: list, frac: float = 0.8) -> tuple[list, list]:
    idx = np.random.default_rng(SEED).permutation(len(docs))
    cut = int(frac * len(docs))
    return [docs[i] for i in idx[:cut]], [docs[i] for i in idx[cut:]]


def fit_lda(train: list[list[str]], k: int):
    from gensim.corpora import Dictionary
    from gensim.models import LdaModel
    d = Dictionary(train)
    d.filter_extremes(no_below=5, no_above=0.4)
    bow = [d.doc2bow(x) for x in train]
    m = LdaModel(bow, num_topics=k, id2word=d, passes=4, iterations=40, random_state=SEED, alpha="auto", eta="auto")
    return [[d[i] for i, _ in m.get_topic_terms(t, TOP_N)] for t in range(k)]


def fit_nmf(train: list[list[str]], k: int):
    from sklearn.decomposition import NMF
    from sklearn.feature_extraction.text import TfidfVectorizer
    vec = TfidfVectorizer(analyzer=lambda x: x, min_df=5, max_df=0.4)
    x = vec.fit_transform(train)
    m = NMF(n_components=k, init="nndsvda", random_state=SEED, max_iter=300).fit(x)
    names = np.array(vec.get_feature_names_out())
    return [names[np.argsort(-row)[:TOP_N]].tolist() for row in m.components_]


def npmi_coherence(topics: list[list[str]], reference: list[list[str]]) -> float:
    from gensim.corpora import Dictionary
    from gensim.models import CoherenceModel
    d = Dictionary(reference)
    topics = [[w for w in t if w in d.token2id] for t in topics]
    topics = [t for t in topics if len(t) >= 2]
    cm = CoherenceModel(topics=topics, texts=reference, dictionary=d, coherence="c_npmi", window_size=10, processes=1)
    return float(cm.get_coherence())


def diversity(topics: list[list[str]]) -> float:
    words = [w for t in topics for w in t]
    return len(set(words)) / len(words)


def run() -> dict:
    if not corpus.catalogue_available():
        res = {"topic": "topic modelling", "skipped": "data/raw/styles.csv is missing; the guides (7k tokens) are too small for topic models"}
        corpus.write_json("topics", res)
        return res
    res: dict = {"topic": "topic modelling", "seed": SEED, "text": "Myntra catalogue titles, English; coherence is NPMI over the held-out 20% of titles",
                 "settings": {}}
    for name, removed in (("all content words", False), ("words the gazetteer does not know", True)):
        docs = prepare(removed)
        train, held = split(docs)
        held = held[:6000]
        table, models = {}, {}
        for k in (5, 10, 15, 20, 30):
            row = {}
            for method, fn in (("LDA", fit_lda), ("NMF (tf-idf)", fit_nmf)):
                topics = fn(train, k)
                models[(method, k)] = topics
                row[method] = {"npmi": round(npmi_coherence(topics, held), 4), "diversity": round(diversity(topics), 3)}
            table[f"k={k}"] = row
        best = max(((m, k) for (m, k) in models), key=lambda mk: table[f"k={mk[1]}"][mk[0]]["npmi"])
        res["settings"][name] = {"documents": len(docs), "train": len(train), "held_out_for_coherence": len(held), "table": table,
                                 "best_by_npmi": {"method": best[0], "k": best[1], "topics": models[best]}}
        if removed:
            res["settings"][name]["ontology_candidates"] = candidate_terms(models[best])
    res["caveat"] = ("The catalogue is English and mostly menswear, footwear and accessories, so topics describe product families and brands, not "
                     "tailoring requests. NPMI prefers small k on short titles; coherence does not say a topic is useful, so candidate terms need a human reviewer.")
    corpus.write_json("topics", res)
    return res


def candidate_terms(topics: list[list[str]], limit: int = 40) -> list[str]:
    known = {k[0] for k in form_index() if len(k) == 1}
    seen: list[str] = []
    for t in topics:
        for w in t[:5]:
            if w not in known and w not in seen:
                seen.append(w)
    return seen[:limit]
