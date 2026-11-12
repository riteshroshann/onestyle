// Scores the deployed binder (spans -> slot updates) against hand-annotated attachments, from gold spans and from
// the gazetteer's spans, and measures what the "par" clause break costs. Read-only: the patched binder lives in a temp dir.
// usage: node --experimental-strip-types scripts/eval-binding.mjs
// Author: Ritesh Roshan
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bioToSpans, tagRules, tokenize } from "../lib/engine/lexicon.ts";
import { bind } from "../lib/engine/spec.ts";
import { bootstrap, key, prf, readJsonl, triple, writeResult } from "./eval-common.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = join(here, "..", "lib", "engine");

// "par" ends a clause only when it is a conjunction ("fitted chahiye par sleeves loose"); after a part word it is the
// postposition "on" ("sleeve par loose"). This is the proposed fix, applied to a copy of spec.ts.
async function patchedBind() {
  let src = readFileSync(join(engineDir, "spec.ts"), "utf8");
  const before = "const breaks = tokens.map((t) => CLAUSE_BREAK.has(t));";
  if (!src.includes(before)) throw new Error("spec.ts changed: update the patch");
  src = src.replace(before, `const partEnd = new Set(spans.filter((s) => ["PART", "LOC", "NECKLINE", "SLEEVE"].includes(s.tag)).map((s) => s.end));
  const breaks = tokens.map((t, i) => CLAUSE_BREAK.has(t) && !(t === "par" && partEnd.has(i)));`);
  src = src.replaceAll(/from "\.\/(\w+)\.ts"/g, (_, f) => `from "${pathToFileURL(join(engineDir, f + ".ts")).href}"`);
  const dir = mkdtempSync(join(tmpdir(), "bespoke-par-"));
  writeFileSync(join(dir, "spec.ts"), src);
  return (await import(pathToFileURL(join(dir, "spec.ts")).href)).bind;
}

function parseTriple(s) {
  const m = s.match(/^(\w+) ([\w.]+)=(.*?)(?: ~(\w+))?(?: @(.+))?$/);
  if (!m) throw new Error(`bad gold triple: ${s}`);
  const t = { op: m[1], slot: m[2], value: m[3] };
  if (m[5]) t.ref = m[5];
  return { t, intensity: m[4] };
}
const goldKeys = (row) => row.triples.map((s) => key(parseTriple(s).t));

function goldSpans(row, tokens) {
  const tags = tokens.map(() => "O");
  for (const [a, b, tag] of row.spans) { tags[a] = `B-${tag}`; for (let i = a + 1; i < b; i++) tags[i] = `I-${tag}`; }
  return bioToSpans(tokens, tags);
}

const rows = readJsonl("data/gold/binding.jsonl");
const bindPar = await patchedBind();
const sets = { dev: "dev", test: "test", requests: "requests", postposition: "postposition" };
const modes = {
  gold_spans: (row, tokens) => goldSpans(row, tokens),
  gazetteer_spans: (_row, tokens) => tagRules(tokens),
};
const report = { metric: "slot-level micro P/R/F1 of bind(), set of op|slot|value|ref triples per request", seed: 13, bootstrap: "1000 resamples of requests, 95% percentile", sets: {}, par_fix: {}, misses: [] };

function score(items, fn) {
  const pairs = items.map((r) => { const tk = tokenize(r.text); return [goldKeys(r), [...new Set(fn(r, tk).map((u) => key(triple(u))))]]; });
  return { ...prf(pairs), n_requests: items.length, f1_ci95: bootstrap(pairs, (p) => prf(p).f1) };
}

for (const [name, split] of Object.entries(sets)) {
  const items = rows.filter((r) => r.split === split);
  report.sets[name] = {};
  for (const [mode, spans] of Object.entries(modes)) {
    report.sets[name][mode] = {
      deployed: score(items, (r, tk) => bind(tk, spans(r, tk), "words")),
      par_fixed: score(items, (r, tk) => bindPar(tk, spans(r, tk), "words")),
    };
  }
}

// attachments the postposition reading costs: gold triples found with the fix and missed without it
let recovered = 0, broken = 0;
for (const r of rows) {
  const tk = tokenize(r.text), sp = goldSpans(r, tk);
  const gold = new Set(goldKeys(r));
  const a = new Set(bind(tk, sp.map((s) => ({ ...s })), "words").map((u) => key(triple(u))));
  const b = new Set(bindPar(tk, sp.map((s) => ({ ...s })), "words").map((u) => key(triple(u))));
  const gain = [...gold].filter((k) => b.has(k) && !a.has(k)), loss = [...gold].filter((k) => a.has(k) && !b.has(k));
  recovered += gain.length; broken += loss.length;
  if (gain.length || loss.length) report.par_fix[r.id] = { text: r.text, recovered: gain, broken: loss };
  const missed = [...gold].filter((k) => !a.has(k)), extra = [...a].filter((k) => !gold.has(k));
  if (missed.length || extra.length) report.misses.push({ id: r.id, split: r.split, text: r.text, missed, spurious: extra });
}
report.par_fix_summary = { gold_attachments_recovered: recovered, gold_attachments_broken: broken, requests_changed: Object.keys(report.par_fix).length };
writeResult("binding", report);
for (const [n, s] of Object.entries(report.sets)) console.log(n.padEnd(13), "gold", s.gold_spans.deployed.f1, "->", s.gold_spans.par_fixed.f1, "| gazetteer", s.gazetteer_spans.deployed.f1, "->", s.gazetteer_spans.par_fixed.f1);
console.log(report.par_fix_summary, "misses", report.misses.length);
