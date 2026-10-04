// node --experimental-strip-types tests/edge.test.ts
// Negative and edge cases for the engine, and its latency budget. Nothing here may throw or stall.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { correctTranscript, tagRules, tokenize } from "../lib/engine/lexicon.ts";
import { apply, bind, emptySpec, questions, wearerUpdates } from "../lib/engine/spec.ts";
import { links, phrase, sheetLines } from "../lib/engine/describe.ts";

const run = (text: string) => { const t = tokenize(text); return apply(emptySpec(), [...bind(t, tagRules(t), "words"), ...wearerUpdates(text)]); };
let n = 0;
const t = (name: string, f: () => void) => { try { f(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; } };
const safe = (text: string) => { const s = run(text); phrase(s); sheetLines(s); links(s); questions(s); return s; };

t("empty input", () => { const s = safe(""); assert.equal(s.version, 0); assert.deepEqual(questions(s).map((q) => q.slot), ["garment"]); });
t("whitespace only", () => assert.equal(safe("   \n\t  ").version, 0));
t("punctuation only", () => assert.equal(safe("?!.,;:'\"").version, 0));
t("gibberish", () => assert.equal(safe("asdkjh qwpoe zxmcn").slots.garment, undefined));
t("numbers without units", () => assert.equal(safe("12345 678").slots["garment.length"], undefined));
t("emoji", () => assert.equal(safe("a red dress 💃🔥✨").slots.garment.value, "dress"));
t("HTML and script text is data, not markup", () => {
  const s = safe('<img src=x onerror=alert(1)> a black kurti <script>alert(1)</script>');
  assert.equal(s.slots.garment.value, "kurti");
});
t("SQL-like text", () => assert.equal(safe("kurti'; DROP TABLE orders;--").slots.garment.value, "kurti"));
t("very long input (20,000 characters)", () => {
  const long = "a navy silk kurti with puff sleeves ".repeat(570);
  const t0 = performance.now(); const s = safe(long);
  assert.equal(s.slots.garment.value, "kurti");
  assert.ok(performance.now() - t0 < 1500, "long input took too long");
});
t("Devanagari request", () => { const s = safe("मुझे लाल कुर्ती चाहिए"); assert.equal(s.slots.garment.value, "kurti"); assert.deepEqual(s.lists.colour.map((c) => c.value), ["red"]); });
t("mixed scripts", () => assert.equal(safe("ek गहरा v neck wala blouse").slots.garment.value, "saree blouse"));
t("UPPERCASE and stray spacing", () => assert.equal(safe("   A  BLACK    KURTI   ").slots.garment.value, "kurti"));
t("contradiction: wanted then refused", () => { const s = safe("red kurti, no red"); assert.ok(s.excluded.some((e) => e.value === "red")); assert.ok(!(s.lists.colour ?? []).some((c) => c.value === "red")); });
t("only refusals", () => { const s = safe("no sequins, no net, no embroidery"); assert.equal(s.slots.garment, undefined); assert.equal(s.excluded.length, 3); });
t("same word many times", () => assert.deepEqual(safe("red red red red kurti").lists.colour.map((c) => c.value), ["red"]));
t("negated garment only", () => { const s = safe("not a lehenga"); assert.equal(s.slots.garment, undefined); assert.ok(s.excluded.some((e) => e.slot === "garment")); });
t("comparison without a board", () => { const s = safe("neck deeper than #1"); assert.equal(s.comparisons.length, 1); });
t("both men and women words: no guess", () => assert.deepEqual(wearerUpdates("for my brother and sister"), []));
t("transcript correction on empty and odd input", () => { assert.equal(correctTranscript(""), ""); assert.equal(correctTranscript("   "), ""); assert.equal(correctTranscript("123"), "123"); });
t("unknown words never become garments", () => assert.equal(safe("i want a blorptastic thing").slots.garment, undefined));
t("tokens are bounded by the input", () => assert.ok(tokenize("a".repeat(5000)).length <= 1));

// ---------------------------------------------------------------- latency budget for the on-device engine
const corpus = JSON.parse(readFileSync(new URL("./parity_fixtures.json", import.meta.url), "utf8")).map((f: any) => f.text) as string[];
for (let i = 0; i < 50; i++) safe(corpus[i % corpus.length]); // warm up the JIT
const ms: number[] = [];
for (let r = 0; r < 3; r++) for (const text of corpus) { const t0 = performance.now(); safe(text); ms.push(performance.now() - t0); }
ms.sort((a, b) => a - b);
const q = (p: number) => Math.round(ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] * 1000) / 1000;
const report = { requests: ms.length, p50_ms: q(0.5), p95_ms: q(0.95), p99_ms: q(0.99), max_ms: Math.round(ms[ms.length - 1] * 1000) / 1000 };
t("engine p95 under 5 ms per request", () => assert.ok(report.p95_ms < 5, JSON.stringify(report)));
mkdirSync(new URL("../../results/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../results/latency-engine.json", import.meta.url), JSON.stringify(report, null, 1));
console.log(`ok: ${n} edge and negative cases; engine latency p50 ${report.p50_ms} ms, p95 ${report.p95_ms} ms over ${report.requests} requests`);
