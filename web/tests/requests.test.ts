// node --experimental-strip-types tests/requests.test.ts
// Realistic requests and what a tailor would take from them. The on-device engine (gazetteer, no model) must pass
// every case; the tagger and the language-model layer only add on top of this floor.
import assert from "node:assert/strict";
import { tagRules, tokenize } from "../lib/engine/lexicon.ts";
import { apply, bind, emptySpec, questions, wearerOf, wearerUpdates } from "../lib/engine/spec.ts";
import type { Spec } from "../lib/engine/spec.ts";
import { links, nearestColour, phrase } from "../lib/engine/describe.ts";

function run(...msgs: string[]): Spec {
  let s = emptySpec();
  for (const m of msgs) { const t = tokenize(m); s = apply(s, [...bind(t, tagRules(t), "words"), ...wearerUpdates(m)]); }
  return s;
}
const slot = (s: Spec, k: string) => s.slots[k]?.value;
const list = (s: Spec, k: string) => (s.lists[k] ?? []).map((v) => v.value);
const asked = (s: Spec) => questions(s).map((q) => q.slot);
const excluded = (s: Spec) => s.excluded.map((e) => e.value);
let n = 0;
function check(name: string, f: () => void) {
  try { f(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; }
}

check("sweatshirt and pants cord set for the cold", () => {
  const s = run("i want a sweatshirt and pants dark blue cord set that i can wear in the cold");
  assert.equal(slot(s, "garment"), "co-ord set");
  assert.deepEqual(list(s, "components").sort(), ["sweatshirt", "trousers"]);
  assert.deepEqual(list(s, "colour"), ["navy"]);
  assert.ok(list(s, "occasion").includes("winter"));
  const q = questions(s);
  assert.ok(!q.some((x) => x.slot === "neckline.depth" || x.slot === "garment.length"), q.map((x) => x.slot).join());
  assert.ok(q.some((x) => x.slot === "fabric" && x.options.includes("fleece")));
  assert.match(phrase(s), /^a navy co-ord set: a sweatshirt with pants, for the cold$/);
});
check("pastel kurti for a farewell", () => {
  const s = run("A pastel blue kurti for my farewell, fitted at the waist, flowy below, not too flashy");
  assert.equal(slot(s, "garment"), "kurti");
  assert.deepEqual(list(s, "colour"), ["powder blue"]);
  assert.equal(slot(s, "bodice.fit"), "fitted");
  assert.equal(slot(s, "lower.fit"), "loose");
  assert.ok(list(s, "occasion").includes("farewell"));
  assert.ok(excluded(s).includes("flashy"), excluded(s).join());
});
check("Hinglish lehenga", () => {
  const s = run("lehenga chahiye shaadi ke liye, maroon, gota patti, ghera bahut zyada");
  assert.equal(slot(s, "garment"), "lehenga");
  assert.deepEqual(list(s, "colour"), ["maroon"]);
  assert.ok(list(s, "occasion").includes("wedding"));
  assert.ok(list(s, "embellishment").includes("gota patti"));
});
check("saree blouse with a deep back", () => {
  const s = run("a saree blouse with a deep back, puff sleeves and no sequins");
  assert.equal(slot(s, "garment"), "saree blouse");
  assert.equal(slot(s, "back.depth"), "deep");
  assert.equal(slot(s, "sleeve.style"), "puff");
  assert.ok(excluded(s).includes("sequins"));
});
check("oversized hoodie", () => {
  const s = run("black oversized hoodie with a graphic print for college");
  assert.equal(slot(s, "garment"), "hoodie");
  assert.deepEqual(list(s, "colour"), ["black"]);
  assert.equal(slot(s, "bodice.fit"), "loose");
  assert.ok(list(s, "pattern").includes("printed"));
  assert.ok(!asked(s).includes("neckline.depth"));
});
check("wide-leg jeans", () => {
  const s = run("wide leg jeans in light blue denim");
  assert.equal(slot(s, "garment"), "jeans");
  assert.equal(slot(s, "lower.silhouette"), "wide-leg");
  assert.equal(slot(s, "fabric"), "denim");
  assert.ok(!asked(s).some((q) => q.startsWith("neckline") || q.startsWith("sleeve")));
});
check("winter coat", () => {
  const s = run("a long wool coat in camel for winter");
  assert.equal(slot(s, "garment"), "coat");
  assert.equal(slot(s, "fabric"), "wool");
  assert.deepEqual(list(s, "colour"), ["brown"]);
  assert.ok(list(s, "occasion").includes("winter"));
});
check("kurta with palazzo", () => {
  const s = run("kurta with palazzo, white cotton, chikankari");
  assert.equal(slot(s, "garment"), "kurta set");
  assert.deepEqual(list(s, "components").sort(), ["kurti", "palazzo"]);
  assert.equal(slot(s, "fabric"), "cotton");
  assert.ok(list(s, "embellishment").includes("chikankari"));
});
check("anarkali for a wedding", () => {
  const s = run("red anarkali for my sister's wedding, full sleeves, floor length, zari work");
  assert.equal(slot(s, "garment"), "anarkali");
  assert.equal(slot(s, "sleeve.length"), "full");
  assert.equal(slot(s, "garment.length"), "floor");
  assert.ok(list(s, "embellishment").includes("zari"));
});
check("linen office shirt", () => {
  const s = run("linen shirt for summer office, light blue, half sleeves");
  assert.equal(slot(s, "garment"), "shirt");
  assert.equal(slot(s, "fabric"), "linen");
  assert.equal(slot(s, "sleeve.length"), "elbow");
  assert.ok(list(s, "occasion").includes("summer") && list(s, "occasion").includes("office"));
});
check("gym set", () => {
  const s = run("track pants and t-shirt set for the gym in grey");
  assert.equal(slot(s, "garment"), "co-ord set");
  assert.deepEqual(list(s, "components").sort(), ["joggers", "t-shirt"]);
  assert.ok(list(s, "occasion").includes("gym"));
  assert.deepEqual(list(s, "colour"), ["grey"]);
});
check("puffer for the hills", () => {
  const s = run("a puffer jacket for my manali trip, black");
  assert.equal(slot(s, "garment"), "puffer jacket");
  assert.ok(list(s, "occasion").includes("winter") && list(s, "occasion").includes("travel"));
});
check("beach maxi", () => {
  const s = run("maxi dress with flutter sleeves in floral georgette for a beach vacation");
  assert.equal(slot(s, "garment"), "dress");
  assert.equal(slot(s, "sleeve.style"), "flutter");
  assert.equal(slot(s, "fabric"), "georgette");
  assert.ok(list(s, "pattern").includes("floral"));
  assert.ok(list(s, "occasion").includes("summer"));
});
check("turtleneck sweater", () => {
  const s = run("turtleneck sweater in cream wool");
  assert.equal(slot(s, "garment"), "sweater");
  assert.equal(slot(s, "neckline.shape"), "turtle");
  assert.deepEqual(list(s, "colour"), ["ivory"]);
  assert.ok(!asked(s).includes("neckline.depth"));
});
check("negated garment then the real one", () => {
  const s = run("lehenga mat banana, sharara chahiye");
  assert.equal(slot(s, "garment"), "sharara");
  assert.ok(s.excluded.some((e) => e.slot === "garment" && e.value === "lehenga"));
});
check("Hinglish haldi kurta", () => {
  const s = run("mujhe ek peela kurta chahiye haldi ke liye, gota work ke saath");
  assert.equal(slot(s, "garment"), "kurti");
  assert.deepEqual(list(s, "colour"), ["yellow"]);
  assert.ok(list(s, "embellishment").includes("gota patti"));
});
check("no garment yet: ask what to make", () => {
  const s = run("something for my office party, navy");
  assert.equal(slot(s, "garment"), undefined);
  assert.deepEqual(asked(s), ["garment"]);
  assert.deepEqual(list(s, "colour"), ["navy"]);
});
check("revision across turns", () => {
  const s = run("a kurti in yellow cotton", "actually make it a dress, full sleeves", "no yellow, colour mint");
  assert.equal(slot(s, "garment"), "dress");
  assert.equal(slot(s, "sleeve.length"), "full");
  assert.deepEqual(list(s, "colour"), ["mint"]);
  assert.ok(excluded(s).includes("yellow"));
});
check("sherwani for a brother's wedding", () => {
  const s = run("An ivory sherwani for my brother's wedding, mandarin collar, no heavy work");
  assert.equal(slot(s, "garment"), "sherwani");
  assert.deepEqual(list(s, "colour"), ["ivory"]);
  assert.equal(slot(s, "neckline.shape"), "mandarin");
  assert.ok(list(s, "occasion").includes("wedding"));
  assert.ok(excluded(s).includes("embroidery"));
  assert.equal(wearerOf(s), "men");
});
check("who it is for shapes the searches", () => {
  const s = run("a navy hoodie for my husband");
  assert.equal(wearerOf(s), "men");
  assert.match(links(s).query, /^men's navy hoodie/);
  assert.equal(wearerOf(run("a black kurti")), "women");
  assert.equal(wearerOf(run("a grey sweatshirt")), "anyone");
  assert.doesNotMatch(links(run("a black kurti")).query, /women's/);
});
check("custom colours map to the nearest named colour", () => {
  assert.equal(nearestColour("#1b2747"), "navy");
  assert.equal(nearestColour("#7b1f2f"), "maroon");
  assert.equal(nearestColour("#f6f1e6"), "ivory");
});
console.log(`ok: ${n} realistic requests`);
