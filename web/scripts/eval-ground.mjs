// Runs the deployed fuzzy grounder (groundFuzzy, threshold 0.5) on a JSONL of {phrase, tag}; JSON on stdout.
// The Python study uses it to check that its re-implementation of the score agrees with the shipped one.
// usage: node --experimental-strip-types scripts/eval-ground.mjs ../data/gold/grounding.jsonl
// Author: Ritesh Roshan
import { readFileSync } from "node:fs";
import { groundFuzzy } from "../lib/engine/lexicon.ts";

const rows = readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
process.stdout.write(JSON.stringify(rows.map((r) => {
  const g = groundFuzzy(r.phrase, r.tag);
  return { id: r.id, value: g?.value ?? null, score: g ? Math.round(g.score * 1e6) / 1e6 : null };
})));
