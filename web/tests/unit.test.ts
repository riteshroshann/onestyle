// node --experimental-strip-types tests/unit.test.ts
// Unit tests: one function at a time, no browser, no network.
import assert from "node:assert/strict";
import { correctTranscript, groundFuzzy, hindi, soundKey, tagRules, tokenize } from "../lib/engine/lexicon.ts";
import { answer, apply, depthInches, easeInches, emptySpec, familyOf, questions, wearerOf } from "../lib/engine/spec.ts";
import type { Update } from "../lib/engine/spec.ts";
import { PART_HI, SWATCH, advice, links, nearestColour, phrase, sheetLines } from "../lib/engine/describe.ts";
import { viterbi } from "../lib/engine/decode.ts";

let n = 0;
const t = (name: string, f: () => void) => { try { f(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; } };
const set = (slot: string, value: string, extra = {}): Update => ({ op: "set", slot, value: { value, p: 0.9, src: "words", evidence: value, ...extra } });
const add = (slot: string, value: string): Update => ({ op: "add", slot, value: { value, p: 0.9, src: "words", evidence: value } });

// tokenizer
t("tokenize lowercases and keeps references", () => assert.deepEqual(tokenize("Deeper than #2, 42 Inch"), ["deeper", "than", "#2", ",", "42", "inch"]));
t("tokenize collapses elongation", () => assert.deepEqual(tokenize("loooose"), ["loose"]));
t("tokenize keeps Devanagari words", () => assert.deepEqual(tokenize("लाल कुर्ती"), ["लाल", "कुर्ती"]));
t("tokenize fractions", () => assert.deepEqual(tokenize("3/4 sleeves"), ["3/4", "sleeves"]));

// gazetteer
t("longest match wins", () => assert.deepEqual(tagRules(tokenize("deep v neck")).map((s) => s.value), ["deep v"]));
t("numbers need a unit", () => {
  assert.equal(tagRules(tokenize("42 inch")).length, 1);
  assert.equal(tagRules(tokenize("42 people")).length, 0);
});
t("unknown words produce no spans", () => assert.equal(tagRules(tokenize("hello there friend")).length, 0));

// grounding and transcript correction
t("fuzzy grounding finds typos", () => assert.equal(groundFuzzy("georget", "FABRIC")?.value, "georgette"));
t("fuzzy grounding refuses far words", () => assert.equal(groundFuzzy("xyzzy", "FABRIC"), null));
t("sound keys match spelling variants", () => assert.equal(soundKey("curty"), soundKey("kurti")));
t("transcript correction leaves known text alone", () => assert.equal(correctTranscript("a red kurti"), "a red kurti"));

// decoding
t("viterbi forbids I after O", () => assert.deepEqual(viterbi([[0, -9, -9], [-5, -9, -0.1]], ["O", "B-FIT", "I-FIT"]), ["O", "O"]));
t("viterbi keeps a valid span", () => assert.deepEqual(viterbi([[-9, 0, -9], [-9, -9, 0]], ["O", "B-FIT", "I-FIT"]), ["B-FIT", "I-FIT"]));
t("viterbi on empty input", () => assert.deepEqual(viterbi([], ["O"]), []));

// numbers a tailor uses
t("depth: thoda deep is between moderate and deep", () => assert.equal(depthInches({ value: "deep", p: 1, src: "words", evidence: "", intensity: "slight" }), 6.75));
t("depth: explicit inches win", () => assert.equal(depthInches({ value: "7 in", inches: 7, p: 1, src: "words", evidence: "" }), 7));
t("ease: fitted and loose", () => { assert.equal(easeInches("fitted"), 1.5); assert.equal(easeInches("loose"), 5); assert.equal(easeInches(undefined), undefined); });

// state tracking
t("apply is pure", () => { const a = emptySpec(); const b = apply(a, [set("garment", "kurti")]); assert.equal(a.slots.garment, undefined); assert.equal(b.slots.garment.value, "kurti"); });
t("answers outrank words", () => { const s = apply(apply(emptySpec(), [set("fabric", "silk")]), answer("fabric", "cotton")); assert.equal(s.slots.fabric.value, "cotton"); });
t("pictures never override stated colours", () => {
  const s = apply(apply(emptySpec(), [add("colour", "navy")]), [{ op: "add", slot: "colour", value: { value: "red", p: 0.6, src: "image", evidence: "board" } }]);
  assert.deepEqual(s.lists.colour.map((c) => c.value), ["navy"]);
});
t("replace swaps a list", () => { const s = apply(apply(emptySpec(), [add("colour", "navy"), add("colour", "red")]), [{ op: "replace", slot: "colour", value: { value: "mint", p: 1, src: "edit", evidence: "" } }]); assert.deepEqual(s.lists.colour.map((c) => c.value), ["mint"]); });
t("notes are kept once", () => { const note: Update = { op: "note", slot: "notes", value: { value: "kangaroo pocket", p: 1, src: "model", evidence: "" } }; assert.deepEqual(apply(apply(emptySpec(), [note]), [note]).notes, ["kangaroo pocket"]); });
t("exclusion removes a matching value", () => { const s = apply(apply(emptySpec(), [add("colour", "red")]), [{ op: "exclude", slot: "colour", value: { value: "red", p: 1, src: "words", evidence: "no red" } }]); assert.deepEqual(s.lists.colour, []); });
t("switching to a bottom drops top-only parts", () => {
  const s = apply(apply(emptySpec(), [set("garment", "kurti"), set("neckline.shape", "v")]), [set("garment", "jeans")]);
  assert.equal(s.slots["neckline.shape"], undefined);
});

// families, questions, wearer
t("families", () => { assert.equal(familyOf("hoodie"), "knit_top"); assert.equal(familyOf("jeans"), "bottom"); assert.equal(familyOf("nothing"), null); });
t("no garment: ask what to make", () => assert.deepEqual(questions(emptySpec()).map((q) => q.slot), ["garment"]));
t("questions respect the budget", () => assert.ok(questions(apply(emptySpec(), [set("garment", "kurti")])).length <= 3));
t("knit questions use friendly labels", () => assert.equal(questions(apply(emptySpec(), [set("garment", "hoodie")]))[0].labels?.loose, "oversized"));
t("wearer from garment", () => { assert.equal(wearerOf(apply(emptySpec(), [set("garment", "sherwani")])), "men"); assert.equal(wearerOf(apply(emptySpec(), [set("garment", "lehenga")])), "women"); });

// text out
t("phrase reads naturally", () => assert.equal(phrase(apply(emptySpec(), [set("garment", "dress"), add("colour", "black")])), "a black dress"));
t("advice for the cold", () => assert.match(advice(apply(emptySpec(), [set("garment", "hoodie"), add("occasion", "winter")])), /fleece/));
t("sheet lines carry Hindi part names", () => {
  const lines = sheetLines(apply(emptySpec(), [set("garment", "kurti"), set("neckline.shape", "v"), set("fabric", "cotton")]));
  assert.ok(lines.every((l) => l.hiPart && PART_HI[l.part] === l.hiPart));
  assert.equal(lines.find((l) => l.part === "Fabric")?.hi, hindi("FABRIC", "cotton"));
});
t("links: five shops with domains, Pinterest ideas", () => {
  const L = links(apply(emptySpec(), [set("garment", "kurti"), add("colour", "red")]));
  assert.equal(L.shops.length, 5);
  assert.ok(L.shops.every((s) => s.domain && s.url.startsWith("https://")));
  assert.ok(L.pinterest.length >= 1 && L.pinterest.every((p) => p.url.startsWith("https://www.pinterest.com/search/pins/?q=")));
});
t("palette covers every swatch and maps shades", () => { assert.ok(Object.keys(SWATCH).length >= 20); assert.equal(nearestColour("#000000"), "black"); assert.equal(nearestColour("#ffffff"), "white"); });

console.log(`ok: ${n} unit tests`);
