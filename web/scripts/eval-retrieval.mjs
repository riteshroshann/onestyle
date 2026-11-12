// Scores the help chatbot's BM25 retrieval on held-out questions: Recall@k and MRR for answerable ones, and how well the
// top score separates answerable from unanswerable ones (the GROUNDED_MIN rule). With --scores it also prints the full
// BM25 score vector per question, which the Python dense/hybrid comparison reads.
// usage: node --experimental-strip-types scripts/eval-retrieval.mjs [--scores]
// Author: Ritesh Roshan
import { createRequire } from "node:module";
import { GROUNDED_MIN, retrieve } from "../lib/assistant/retrieve.js";
import { bootstrap, prf, r4, readJsonl, writeResult } from "./eval-common.mjs";

const require = createRequire(import.meta.url);
const chunks = require("../lib/assistant/index.json").chunks;
const rows = readJsonl("data/gold/retrieval.jsonl");
for (const r of rows) if (r.chunk && !chunks.some((c) => c.id === r.chunk)) throw new Error(`gold points at a missing chunk: ${r.chunk}`);

// every chunk's score for each question: retrieve() with k = all returns only the non-zero ones
const scored = rows.map((r) => {
  const hits = retrieve(r.q, chunks.length);
  return { ...r, hits, top: hits[0]?.score ?? 0 };
});

if (process.argv.includes("--scores")) {
  process.stdout.write(JSON.stringify({ chunks: chunks.map((c) => c.id), rows: scored.map((s) => ({ id: s.id, scores: Object.fromEntries(s.hits.map((h) => [h.id, h.score])) })) }));
  process.exit(0);
}

const answerable = scored.filter((s) => s.chunk);
const rankOf = (s) => { const i = s.hits.findIndex((h) => h.id === s.chunk); return i < 0 ? Infinity : i + 1; };
const recall = (items, k) => items.filter((s) => rankOf(s) <= k).length / items.length;
const mrr = (items) => items.reduce((a, s) => a + (rankOf(s) === Infinity ? 0 : 1 / rankOf(s)), 0) / items.length;

const byLang = {};
for (const lang of ["english", "hinglish"]) {
  const items = answerable.filter((s) => s.lang === lang);
  byLang[lang] = { n: items.length, recall_at_1: r4(recall(items, 1)), recall_at_3: r4(recall(items, 3)), recall_at_5: r4(recall(items, 5)), mrr: r4(mrr(items)) };
}

// answerability: predict "answer" when the top score reaches the threshold
const unanswerable = scored.filter((s) => !s.chunk);
function answerability(thr) {
  const answered = scored.filter((s) => s.top >= thr);
  const correct = answered.filter((s) => s.chunk && rankOf(s) === 1).length;
  const wrongly = answered.filter((s) => !s.chunk).length;
  return { threshold: thr, answered_answerable: answered.filter((s) => s.chunk).length, answered_unanswerable: wrongly,
    abstained_on_unanswerable: r4(1 - wrongly / unanswerable.length), correct_top1_answers: correct,
    coverage: r4(answered.filter((s) => s.chunk).length / answerable.length) };
}
const thresholds = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8];
// AUROC of the top score for answerable vs unanswerable, ties counted half
const auroc = (items) => {
  const pos = items.filter((s) => s.chunk), neg = items.filter((s) => !s.chunk);
  let w = 0;
  for (const p of pos) for (const n of neg) w += p.top > n.top ? 1 : p.top === n.top ? 0.5 : 0;
  return w / (pos.length * neg.length);
};

const result = {
  task: "help-chatbot retrieval (BM25, web/lib/assistant/retrieve.js)",
  gold: "data/gold/retrieval.jsonl", n_questions: rows.length, n_answerable: answerable.length, n_unanswerable: unanswerable.length,
  questions_written_after_the_guide: "paraphrased away from the guide's wording; one annotator, one correct passage per question",
  seed: 13, interval: "bootstrap over questions, 1000 resamples",
  retrieval: {
    recall_at_1: r4(recall(answerable, 1)), recall_at_3: r4(recall(answerable, 3)), recall_at_5: r4(recall(answerable, 5)), mrr: r4(mrr(answerable)),
    recall_at_1_ci95: bootstrap(answerable, (x) => recall(x, 1)), mrr_ci95: bootstrap(answerable, mrr), by_language: byLang,
  },
  answerability: {
    deployed_threshold: GROUNDED_MIN, deployed: answerability(GROUNDED_MIN), sweep: thresholds.map(answerability),
    auroc_top_score: r4(auroc(scored)), auroc_ci95: bootstrap(scored, auroc),
    off_topic_top_scores: scored.filter((s) => s.kind === "off_topic").map((s) => r4(s.top)),
    near_topic_top_scores: scored.filter((s) => s.kind === "near_topic").map((s) => r4(s.top)),
  },
  failures: answerable.filter((s) => rankOf(s) > 1).map((s) => ({ q: s.q, gold: s.chunk, got: s.hits[0]?.id ?? null, rank: rankOf(s) === Infinity ? null : rankOf(s) })),
  false_answers: unanswerable.filter((s) => s.top >= GROUNDED_MIN).map((s) => ({ q: s.q, kind: s.kind, top: r4(s.top), got: s.hits[0].id })),
};
result.answerability.deployed_prf_of_answering_correctly = prf(scored.map((s) => [s.chunk && rankOf(s) === 1 ? ["ok"] : [], s.top >= GROUNDED_MIN && s.chunk && rankOf(s) === 1 ? ["ok"] : []]));
writeResult("retrieval", result);
console.log(JSON.stringify({ retrieval: result.retrieval, deployed: result.answerability.deployed, auroc: result.answerability.auroc_top_score, failures: result.failures.length, false: result.false_answers.length }, null, 1));
