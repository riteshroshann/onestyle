// Shared by the evaluation scripts: gold readers, the triple form of an update, and set-level scoring.
// Author: Ritesh Roshan
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SEED = 13;

export const readJsonl = (rel) => readFileSync(join(ROOT, rel), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
export const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

export function writeResult(name, result) {
  mkdirSync(join(ROOT, "results"), { recursive: true });
  writeFileSync(join(ROOT, "results", `${name}.json`), JSON.stringify(result, null, 1) + "\n");
}

/** What an update asserts, without confidence or provenance: the unit the binder is scored on. */
export function triple(u) {
  if (u.op === "compare") return { op: "compare", slot: u.slot, value: u.cmp, ref: u.ref };
  const t = { op: u.op, slot: u.slot, value: u.value.value };
  if (u.value.intensity) t.intensity = u.value.intensity;
  return t;
}
export const key = (t) => [t.op, t.slot, t.value, t.ref ?? ""].join("|");

/** Micro precision, recall and F1 over per-item [gold keys, predicted keys]. */
export function prf(pairs) {
  let tp = 0, np = 0, ng = 0;
  for (const [gold, pred] of pairs) {
    const g = new Set(gold), p = new Set(pred);
    for (const k of p) if (g.has(k)) tp++;
    np += p.size; ng += g.size;
  }
  const precision = np ? tp / np : 0, recall = ng ? tp / ng : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision: r4(precision), recall: r4(recall), f1: r4(f1), tp, predicted: np, gold: ng };
}

export const r4 = (x) => Math.round(x * 1e4) / 1e4;

// mulberry32: a seeded generator, so every interval in results/ can be reproduced
export function rng(seed = SEED) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% percentile bootstrap over items of any statistic of a resampled list. */
export function bootstrap(items, stat, n = 1000, seed = SEED) {
  const rand = rng(seed), vals = [];
  for (let b = 0; b < n; b++) vals.push(stat(items.map(() => items[Math.floor(rand() * items.length)])));
  vals.sort((x, y) => x - y);
  return [r4(vals[Math.floor(0.025 * n)]), r4(vals[Math.ceil(0.975 * n) - 1])];
}
