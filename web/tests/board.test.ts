// node --experimental-strip-types tests/board.test.ts
// The board's inspiration: client-side checks, merging with the on-device reading, and where the notes go.
import assert from "node:assert/strict";
import { IMAGE_CAP, checkInspiration, ideaUpdates, isOurs, mergeUpdates, readBoard } from "../lib/engine/board.ts";
import type { PictureIdeas } from "../lib/engine/board.ts";
import { apply, emptySpec } from "../lib/engine/spec.ts";
import type { Update } from "../lib/engine/spec.ts";
import { layoutNotes, settle, skeletons, wrap } from "../components/board/notes.ts";
import { dominant } from "../components/board/palette.ts";

const img = (value: string, slot: string, op: Update["op"] = "set", p = 0.6): Update => ({ op, slot, value: { value, p, src: "image", evidence: "board" } });
const said = (value: string, slot: string, op: Update["op"] = "set"): Update => ({ op, slot, value: { value, p: 0.85, src: "note", evidence: "note" } });

// 1. the client trusts the server for nothing that reaches the design
{
  const ins = checkInspiration({
    pictures: [
      { n: 1, shows: "Neon city at night", borrow: "See https://x.test", palette: [{ name: "neon pink", hex: "#ff3ea5", base: "pink" }, { name: "x", hex: "red" }, { name: "<b>", hex: "#000000" }],
        mood: ["electric"], motifs: ["signs"], pattern: ["geometric", "glitter"], "lower.silhouette": ["a-line"], fabric: ["satin"], embellishment: ["sequins"], style: ["edgy"] },
      { n: 9, shows: "not sent" },
    ],
    leftOut: [2, 7],
    direction: { summary: "Night lights.", ideas: [{ title: "Neon co-ord", garment: "co-ord set", fabric: "plastic", colour: ["pink", "chartreuse"], why: "Bright." }, { title: "" }] },
  }, [1, 2]);
  assert.equal(ins.pictures.length, 1);
  assert.equal(ins.pictures[0].borrow, "");
  assert.deepEqual(ins.pictures[0].palette, [{ name: "neon pink", hex: "#ff3ea5", base: "pink" }]);
  assert.deepEqual(ins.pictures[0].pattern, ["geometric"]);
  assert.deepEqual(ins.leftOut, [2]);
  assert.equal(ins.direction.ideas.length, 1);
  assert.equal(ins.direction.ideas[0].fabric, undefined);
  assert.deepEqual(ins.direction.ideas[0].colour, ["pink"]);
}

// 2. an idea becomes suggestions, never above the image cap; lists add, single slots set
{
  const ups = ideaUpdates({ title: "Blossom anarkali", why: "", garment: "anarkali", fabric: "georgette", colour: ["pink", "purple"], pattern: "floral", "neckline.shape": "nonsense" });
  assert.ok(ups.every((u) => u.value.src === "image" && u.value.p <= IMAGE_CAP));
  assert.deepEqual(ups.map((u) => `${u.op}:${u.slot}=${u.value.value}`).sort(),
    ["add:colour=pink", "add:colour=purple", "add:pattern=floral", "set:fabric=georgette", "set:garment=anarkali"]);
}

// 3. merging: words beat pictures, circles beat the model on fine slots, the model wins whole-picture slots
{
  const device = [said("v", "neckline.shape"), img("green", "colour", "add"), img("puff", "sleeve.style"), img("kurti", "garment"),
    { op: "exclude", slot: "colour", value: { value: "pink", p: 0.7, src: "image", evidence: "not as in #2" } } as Update];
  const model = [img("anarkali", "garment", "set", 0.5), img("pink", "colour", "add", 0.55), img("teal", "colour", "add", 0.55),
    img("round", "neckline.shape", "set", 0.55), img("bell", "sleeve.style", "set", 0.55), img("silk", "fabric", "set", 0.55)];
  const out = mergeUpdates(device, model, true);
  const has = (slot: string, value: string) => out.some((u) => u.slot === slot && u.value.value === value && u.op !== "exclude");
  assert.ok(has("neckline.shape", "v") && !has("neckline.shape", "round"), "a note beats the model");
  assert.ok(has("sleeve.style", "puff") && !has("sleeve.style", "bell"), "a circle beats the model on a fine slot");
  assert.ok(has("garment", "anarkali") && !has("garment", "kurti"), "the model wins a whole-picture slot");
  assert.ok(!has("colour", "pink"), "a rejected colour stays out");
  assert.ok(has("colour", "teal") && !has("colour", "green"));
  assert.ok(out.some((u) => u.op === "exclude" && u.value.value === "pink"));
  assert.ok(out.every((u) => u.op === "exclude" || u.value.src !== "image" || u.value.p <= IMAGE_CAP), "suggestions stay under the cap");
  // without a circle, the model takes the sleeve too; agreement nudges sureness up but not past the cap
  const loose = mergeUpdates([img("silk", "fabric", "set", 0.58)], [img("silk", "fabric", "set", 0.58), img("bell", "sleeve.style")], false);
  assert.equal(loose.filter((u) => u.slot === "fabric").length, 1);
  assert.equal(loose.find((u) => u.slot === "fabric")!.value.p, IMAGE_CAP);
  // and in the design, the customer's own words still win
  const spec = apply(apply(emptySpec(), [{ op: "set", slot: "garment", value: { value: "lehenga", p: 0.95, src: "words", evidence: "lehenga" } }]), out);
  assert.equal(spec.slots.garment.value, "lehenga");
}

// 4. our notes on the board are never read back as the customer's notes or circles
{
  const files = { f1: { dataURL: "data:image/jpeg;base64,AAAA" } };
  const elements = [
    { id: "i1", type: "image", fileId: "f1", x: 0, y: 0, width: 255, height: 340 },
    { id: "t1", type: "text", x: 20, y: 20, width: 80, height: 20, text: "this neckline" },
    ...skeletons(layoutNotes([{ n: 1, x: 0, y: 0, w: 255, h: 340 }], [], [{ n: 1, shows: "A sunset", borrow: "Warm orange", palette: [{ name: "ember", hex: "#ff6a00" }], mood: [], motifs: [], pattern: [], "lower.silhouette": [], fabric: [], embellishment: [], style: [] }], "Warm.", []), "s")
      .map((e: any) => ({ ...e, width: e.width ?? 100, height: e.height ?? 20 })),
    { id: "r1", type: "rectangle", x: 10, y: 10, width: 50, height: 50, customData: { bespokeNote: true } },
  ];
  const b = readBoard(elements, files);
  assert.equal(b.notes.length, 1);
  assert.equal(b.notes[0].text, "this neckline");
  assert.equal(b.regions.length, 0);
  assert.ok(isOurs({ customData: { bespokeNote: true } }) && isOurs({ customData: { bespokeLabel: true } }) && !isOurs({}));
}

// 5. layout: a card under each picture, nothing overlapping, a Direction card to the right, text within its card
{
  const pictures: PictureIdeas[] = [1, 2, 3].map((n) => ({
    n, shows: "An anime girl under cherry blossoms at dusk, petals everywhere", borrow: "Scatter blossom motifs over a soft pink base with violet contrast.",
    palette: [{ name: "sakura pink", hex: "#f4b6c2" }, { name: "dusk violet", hex: "#5b4b8a" }, { name: "cream", hex: "#fff4e0" }],
    mood: ["dreamy", "soft"], motifs: ["cherry blossoms"], pattern: ["floral"], "lower.silhouette": ["a-line"], fabric: ["chiffon"], embellishment: [], style: [],
  }));
  const images = [{ n: 1, x: 0, y: 0, w: 255, h: 340 }, { n: 2, x: 303, y: 0, w: 180, h: 340 }, { n: 3, x: 531, y: 0, w: 453, h: 340 }];
  const userNote = { x: 10, y: 380, w: 200, h: 40 }; // something already under picture 1
  const taken = [...images, userNote];
  const cards = layoutNotes(images, taken, pictures, "Soft and romantic.", [{ title: "Blossom anarkali", why: "The flare carries the petals.", garment: "anarkali", colour: ["pink"] }]);
  assert.equal(cards.length, 4);
  const all = [...taken, ...cards];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `overlap between ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
  }
  assert.ok(cards[0].y > userNote.y + userNote.h, "a card moves below what is in its way");
  const dir = cards.find((c) => c.key === "direction")!;
  assert.ok(dir.x > 984 && dir.y === 0);
  const els = skeletons(cards, "t");
  assert.ok(els.every((e) => e.customData?.bespokeNote && e.groupIds?.length === 1));
  for (const c of cards) {
    const mine = els.filter((e) => e.groupIds[0].endsWith(`-${c.key}`) && e.type === "text");
    for (const t of mine) {
      const lines = t.text.split("\n");
      const bottom = t.y + lines.length * t.fontSize * 1.25;
      assert.ok(bottom <= c.y + c.h + 0.5, `text runs past card ${c.key}`);
      assert.ok(lines.every((l: string) => l.length * t.fontSize * 0.5 <= c.w - 44 + 0.5), `text too wide in ${c.key}`);
    }
  }
  assert.equal(els.filter((e) => e.type === "ellipse").length, 9, "three swatches per picture");
}

// 6. small pieces
assert.deepEqual(wrap("one two three four five", 60, 10), ["one two", "three four", "five"]);
assert.ok(wrap("a ".repeat(200), 200, 16).every((l) => l.length <= Math.floor(200 / (16 * 0.5))));
assert.equal(wrap("", 200, 16).length, 0);
assert.deepEqual(settle({ x: 0, y: 0, w: 10, h: 10 }, []), { x: 0, y: 0, w: 10, h: 10 });
{
  const px = new Uint8ClampedArray(4 * 100);
  for (let i = 0; i < 100; i++) px.set(i < 70 ? [250, 120, 160, 255] : i < 95 ? [30, 30, 90, 255] : [0, 0, 0, 0], i * 4);
  assert.deepEqual(dominant(px, 5).length, 2);
  assert.equal(dominant(px, 5)[0], "#fa78a0");
}

console.log("ok: inspiration checks, merge order, our notes ignored, note layout and palette");
