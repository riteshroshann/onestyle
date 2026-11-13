// BM25 retrieval over the help corpus. Plain ESM so the Vercel function and node tests import it unbuilt.
// Author: Ritesh Roshan
import { createRequire } from "node:module";
import { tokenize } from "./retrieve-tokens.js";

const require = createRequire(import.meta.url);

/** @typedef {{ id: string, title: string, source: string, text: string }} Chunk */
/** @typedef {Chunk & { score: number }} Hit */
/** @typedef {{ chunks: Chunk[], idf: Record<string, number>, avgLen: number }} Index */

/** @type {Index} */
const INDEX = require("./index.json");

const K1 = 1.5;
const B = 0.75;

// Calibrated in tests/assistant.test.ts: every on-topic question scores above it, every off-topic one below.
// Swept on 100 held-out questions (data/gold/retrieval.jsonl): 3.5 keeps 72 of 75 answerable ones and wrongly answers
// 11 of 25 unanswerable ones, against 74 and 16 at 2.5. Higher cuts lose too many good answers (61 of 75 at 4.8).
export const GROUNDED_MIN = 3.5;

/** @type {{ tf: Map<string, number>, len: number }[]} */
const DOCS = INDEX.chunks.map((c) => {
  const tokens = tokenize(`${c.title} ${c.title} ${c.text}`);
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { tf, len: tokens.length };
});

function bm25(queryTokens, doc) {
  let score = 0;
  for (const t of new Set(queryTokens)) {
    const f = doc.tf.get(t);
    if (!f) continue;
    const idf = INDEX.idf[t] ?? 0;
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / INDEX.avgLen)));
  }
  return score;
}

/** @param {string} query @param {number} [k] @returns {Hit[]} */
export function retrieve(query, k = 5) {
  const q = tokenize(query);
  if (!q.length) return [];
  return INDEX.chunks
    .map((c, i) => ({ ...c, score: bm25(q, DOCS[i]) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** True only when the best passage is strong enough to answer from. @param {Hit[]} results */
export function grounded(results) {
  return results.length > 0 && results[0].score >= GROUNDED_MIN;
}

export { tokenize };
