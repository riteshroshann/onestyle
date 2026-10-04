// The picture library: every file exists and is small, every ID is an ontology value, and every question the
// assistant can ask, for every kind of garment, can be answered by picture.
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ONTO } from "../lib/engine/lexicon.ts";
import { apply, contextOf, emptySpec, questions } from "../lib/engine/spec.ts";
import type { Spec, Update } from "../lib/engine/spec.ts";
import { allHaveLooks, lookOf } from "../lib/looks.ts";
import M from "../lib/looks.json" with { type: "json" };

const PUBLIC = join(import.meta.dirname, "..", "public");
const TAG: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", "sleeve.length": "LENGTH", "bodice.fit": "FIT",
  "lower.silhouette": "SILHOUETTE", "garment.length": "LENGTH", fabric: "FABRIC", pattern: "PATTERN", embellishment: "EMBELL",
};
const legal = (slot: string): string[] => slot === "neckline.depth" ? ONTO.depth_order : Object.keys(ONTO.lexicon[TAG[slot]] ?? {});

let files = 0, bytes = 0;
for (const [group, looks] of Object.entries((M as any).looks as Record<string, Record<string, string>>)) {
  const slot = group.split("@")[0];
  for (const [value, src] of Object.entries(looks)) {
    assert.ok(legal(slot).includes(value), `${group}/${value} is not an ontology value`);
    const f = join(PUBLIC, src);
    assert.ok(existsSync(f), `missing file ${src}`);
    const n = statSync(f).size;
    assert.ok(n < 80_000, `${src} is ${n} bytes`);
    files++; bytes += n;
  }
}
assert.ok(files >= 160, `only ${files} pictures`);
assert.ok(bytes < 8e6, `library is ${(bytes / 1e6).toFixed(1)} MB`);

const wearing = (...garments: string[]): Spec => apply(emptySpec(), garments.map((g, i): Update => i === 0
  ? { op: "set", slot: "garment", value: { value: g, p: 1, src: "edit", evidence: g } }
  : { op: "add", slot: "components", value: { value: g, p: 1, src: "edit", evidence: g } }));

// every garment the ontology knows, each season, and the sets the binder builds
const specs: Spec[] = Object.keys(ONTO.lexicon.GARMENT).map((g) => wearing(g));
specs.push(wearing("co-ord set", "sweatshirt", "joggers"), wearing("kurta set", "kurti", "palazzo"));
for (const season of ["winter", "summer", "monsoon", "gym", "lounge"]) {
  const s = wearing("hoodie");
  specs.push(apply(s, [{ op: "add", slot: "occasion", value: { value: season, p: 1, src: "edit", evidence: season } }]));
}
specs.push(emptySpec());
let asked = 0;
for (const s of specs) {
  for (const q of questions(s, 99)) {
    if (q.slot === "colour") continue;                 // colours are answered from the palette
    assert.ok(allHaveLooks(q.slot, q.options, contextOf(q.slot, s)), `no pictures for ${q.slot} on ${s.slots.garment?.value}: ${q.options.filter((o) => !lookOf(q.slot, o, contextOf(q.slot, s)))}`);
    asked++;
  }
}

// a word that means two shapes gets the drawing for this garment
assert.equal(contextOf("lower.silhouette", wearing("joggers")), "bottom");
assert.equal(contextOf("bodice.fit", wearing("sweatshirt")), "knit");
assert.equal(contextOf("bodice.fit", wearing("kurti")), null);
assert.notEqual(lookOf("lower.silhouette", "straight", "bottom"), lookOf("lower.silhouette", "straight", null));
assert.equal(lookOf("lower.silhouette", "a-line", "bottom"), lookOf("lower.silhouette", "a-line", null));   // falls back
assert.equal(lookOf("colour", "red"), undefined);

console.log(`ok: ${files} pictures, ${(bytes / 1e6).toFixed(1)} MB; ${asked} questions across ${specs.length} designs all answerable by picture`);
