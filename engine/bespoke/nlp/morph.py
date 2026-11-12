"""Morphological fallback for words the gazetteer has never seen ("dheelay", "skirts", "georgete").

A token missing from the gazetteer is mapped to a known form by three routes, tried in order, each accepted
only when it names exactly one (tag, value):
  suffix  swap the ending for one that the ontology itself shows interchangeable (kurta/kurti/kurtas,
          dheela/dheeli/dheele): pairs are induced from forms sharing a canonical value, kept when seen >= MIN_PAIRS
  sound   the consonant skeleton (the product's soundKey) matches one known form with the same first letter and
          edit distance 1 (2 for words of 9+ letters); words under 6 letters are left alone
Exact lookup always wins, so known words cannot change.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass

from ..lexicon import Span, form_index, spans_to_bio, tag_rules

MIN_PAIRS = 3
MIN_LEN = 4
ENGLISH_SWAPS = [("s", ""), ("", "s"), ("es", ""), ("ies", "y"), ("ing", ""), ("ing", "e"), ("ed", ""), ("ed", "e"), ("ly", ""), ("y", "")]
SOUND_MAP = {"c": "k", "q": "k", "g": "k", "d": "t", "b": "p", "w": "v", "z": "s", "x": "s"}

Hit = tuple[str, str]  # (tag, canonical value)


def sound_key(word: str) -> str:
    """Consonant skeleton; mirrors soundKey in web/lib/engine/lexicon.ts."""
    s = "".join(c for c in word.lower() if "a" <= c <= "z")
    for a, b in (("ph", "f"), ("ck", "k"), ("sh", "s"), ("ch", "c")):
        s = s.replace(a, b)
    out = ""
    for ch in s:
        if ch in "aeiouyh":
            continue
        m = SOUND_MAP.get(ch, ch)
        if not out or out[-1] != m:
            out += m
    return out


def edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def single_token_vocab() -> dict[str, Hit]:
    return {k[0]: v for k, v in form_index().items() if len(k) == 1 and k[0].isalpha()}


def induce_swaps(vocab: dict[str, Hit]) -> list[tuple[str, str]]:
    """Suffix swaps (a -> b) seen at least MIN_PAIRS times among forms of one canonical value."""
    groups: dict[Hit, list[str]] = defaultdict(list)
    for form, hit in vocab.items():
        groups[hit].append(form)
    counts: Counter[tuple[str, str]] = Counter()
    for forms in groups.values():
        for a in forms:
            for b in forms:
                if a == b:
                    continue
                p = 0
                while p < min(len(a), len(b)) and a[p] == b[p]:
                    p += 1
                if p >= 3 and len(a) - p <= 3 and len(b) - p <= 3:
                    counts[(a[p:], b[p:])] += 1
    return [s for s, c in counts.items() if c >= MIN_PAIRS]


@dataclass
class Lemmatiser:
    vocab: dict[str, Hit]
    swaps: list[tuple[str, str]]
    skeletons: dict[str, set[str]]
    routes: tuple[str, ...] = ("suffix", "sound")

    @classmethod
    def build(cls, vocab: dict[str, Hit] | None = None, routes: tuple[str, ...] = ("suffix", "sound")) -> "Lemmatiser":
        vocab = vocab if vocab is not None else single_token_vocab()
        skeletons: dict[str, set[str]] = defaultdict(set)
        for f in vocab:
            if len(f) >= MIN_LEN and len(sound_key(f)) >= 3:
                skeletons[sound_key(f)].add(f)
        return cls(vocab, sorted(set(induce_swaps(vocab)) | set(ENGLISH_SWAPS)), skeletons, routes)

    def candidates(self, word: str) -> dict[str, set[str]]:
        """Known forms reached from `word`, by route."""
        out: dict[str, set[str]] = {"suffix": set(), "sound": set()}
        for a, b in self.swaps:
            if a and not word.endswith(a):
                continue
            stem = word[: len(word) - len(a)]
            if len(stem) >= 4 and stem + b in self.vocab:
                out["suffix"].add(stem + b)
        for f in self.skeletons.get(sound_key(word), ()):
            if word[0] == f[0] and len(word) >= 6 and edit_distance(word, f) <= (1 if len(word) < 9 else 2):
                out["sound"].add(f)
        return out

    def lemma(self, word: str) -> tuple[Hit, str] | None:
        """((tag, value), route) for an unseen word, or None. Exact matches are the caller's job."""
        if len(word) < MIN_LEN or not word.isalpha() or word in self.vocab:
            return None
        cands = self.candidates(word)
        for route in self.routes:
            hits = {self.vocab[f] for f in cands[route]}
            if len(hits) == 1:
                return hits.pop(), route
        return None


def tag_with_fallback(tokens: list[str], lem: Lemmatiser) -> list[Span]:
    """Gazetteer spans, then the lemmatiser over every uncovered token."""
    spans = tag_rules(tokens)
    covered = {i for s in spans for i in range(s.start, s.end)}
    for i, tok in enumerate(tokens):
        if i in covered:
            continue
        hit = lem.lemma(tok)
        if hit:
            spans.append(Span(i, i + 1, hit[0][0], hit[0][1]))
    return sorted(spans, key=lambda s: s.start)


def bio_with_fallback(tokens: list[str], lem: Lemmatiser) -> list[str]:
    return spans_to_bio(len(tokens), tag_with_fallback(tokens, lem))
