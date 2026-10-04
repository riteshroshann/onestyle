// node --experimental-strip-types tests/engine.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tagRules, tokenize } from "../lib/engine/lexicon.ts";
import { apply, bind, depthInches, emptySpec, questions } from "../lib/engine/spec.ts";
import { viterbi } from "../lib/engine/decode.ts";
import { resolveComparisons } from "../lib/engine/board.ts";

// 1. the TypeScript tokenizer and gazetteer agree with Python on every fixture
const fx = JSON.parse(readFileSync(new URL("./parity_fixtures.json", import.meta.url), "utf8"));
let ok = 0;
for (const f of fx) {
  const t = tokenize(f.text);
  assert.deepEqual(t, f.tokens, `tokens differ: ${f.text}`);
  assert.deepEqual(tagRules(t).map((s) => [s.start, s.end, s.tag, s.value]), f.spans, `spans differ: ${f.text}`);
  ok++;
}

// 2. binding the headline example
const text = "kurti chahiye, waist pe fitted, neeche se thoda loose, V neck thoda deep, no embroidery";
const toks = tokenize(text);
const spec = apply(emptySpec(), bind(toks, tagRules(toks), "words"));
assert.equal(spec.slots.garment.value, "kurti");
assert.equal(spec.slots["bodice.fit"].value, "fitted");
assert.equal(spec.slots["lower.fit"].value, "loose");
assert.equal(spec.slots["lower.fit"].intensity, "slight");
assert.equal(spec.slots["neckline.shape"].value, "v");
assert.equal(depthInches(spec.slots["neckline.depth"]), 6.75);
assert.deepEqual(spec.excluded.map((e) => e.value), ["embroidery"]);

// 3. Hindi-order negation and revision: a later turn overrides, an exclusion removes
const s2 = apply(spec, bind(tokenize("mustard nahi chahiye, colour powder blue"), tagRules(tokenize("mustard nahi chahiye, colour powder blue")), "words"));
assert.ok(s2.excluded.some((e) => e.value === "mustard"));
assert.ok(s2.lists.colour.some((c) => c.value === "powder blue"));

// 4. questions: neckline depth is never asked once given; sleeve length and fabric are
const qs = questions(spec).map((q) => q.slot);
assert.ok(!qs.includes("neckline.depth") && qs.includes("sleeve.length"), qs.join());

// 5. comparisons: deeper than #1 (5.5) but less than #2 (8.0) -> interval, proposal toward the shallow end
const iv = resolveComparisons([{ slot: "neckline.depth", cmp: "more", ref: "#1" }, { slot: "neckline.depth", cmp: "less", ref: "#2" }], { 1: 5.5, 2: 8 });
assert.equal(iv[0].lo, 6); assert.equal(iv[0].hi, 7.5); assert.ok(iv[0].proposal! >= 6 && iv[0].proposal! < 6.75);
const bad = resolveComparisons([{ slot: "neckline.depth", cmp: "more", ref: "#2" }, { slot: "neckline.depth", cmp: "less", ref: "#1" }], { 1: 5.5, 2: 8 });
assert.equal(bad[0].proposal, null);

// 6. constrained Viterbi never emits I-X after O
const L = ["O", "B-FIT", "I-FIT"];
assert.deepEqual(viterbi([[0, -9, -9], [-5, -9, -0.1]], L), ["O", "O"]);

console.log(`ok: ${ok} parity fixtures, binding, revision, questions, comparisons, decoding`);
