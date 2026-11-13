// node --experimental-strip-types tests/board.test.ts
// The board's inspiration: client-side checks, merging with the on-device reading, and where the notes go.
import assert from "node:assert/strict";
import { IMAGE_CAP, checkInspiration, ideaUpdates, isOurs, mergeUpdates, readBoard } from "../lib/engine/board.ts";
import { apply, emptySpec } from "../lib/engine/spec.ts";
import type { Update } from "../lib/engine/spec.ts";
import { cardWidth, elements, place, settle } from "../components/board/notes.ts";
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

// 4. our notes on the board are never read back as the customer's notes, circles or pictures
{
  const files = { f1: { dataURL: "data:image/jpeg;base64,AAAA" }, n1: { dataURL: "data:image/webp;base64,BBBB" } };
  const spots = place([{ n: 1, x: 0, y: 0, w: 255, h: 340 }], [], [{ key: "p1", n: 1, w: 356, h: 420 }, { key: "direction", w: 516, h: 600 }]);
  const elements_ = [
    { id: "i1", type: "image", fileId: "f1", x: 0, y: 0, width: 255, height: 340 },
    { id: "t1", type: "text", x: 20, y: 20, width: 80, height: 20, text: "this neckline" },
    ...elements(spots, { p1: "n1", direction: "n1" }, "s"),
    { id: "r1", type: "rectangle", x: 10, y: 10, width: 50, height: 50, customData: { bespokeNote: true } },
  ];
  const b = readBoard(elements_, files);
  assert.equal(b.images.length, 1, "our note cards are not pictures");
  assert.equal(b.notes.length, 1);
  assert.equal(b.notes[0].text, "this neckline");
  assert.equal(b.regions.length, 0);
  assert.ok(isOurs({ customData: { bespokeNote: true } }) && isOurs({ customData: { bespokeLabel: true } }) && !isOurs({}));
}

// 5. placement: a card under each picture, nothing overlapping, the Direction card to the right at the top
{
  const images = [{ n: 1, x: 0, y: 0, w: 255, h: 340 }, { n: 2, x: 303, y: 0, w: 180, h: 340 }, { n: 3, x: 531, y: 0, w: 453, h: 340 }];
  const userNote = { x: 10, y: 380, w: 200, h: 40 }; // something already under picture 1
  const taken = [...images, userNote];
  const cards = [...images.map((im) => ({ key: `p${im.n}`, n: im.n, w: cardWidth(im.w), h: 500 })), { key: "direction", w: 460, h: 700 }];
  const spots = place(images, taken, cards);
  assert.equal(spots.length, 4);
  const all = [...taken, ...spots];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `overlap between ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
  }
  assert.ok(spots[0].y > userNote.y + userNote.h, "a card moves below what is in its way");
  const dir = spots.find((c) => c.key === "direction")!;
  assert.ok(dir.x > 984 && dir.y === 0);
  // the shadow inset shifts each card so the visible card lines up with its picture
  assert.equal(place(images, images, cards, 28)[1].x, 303 - 28);
  const els = elements(spots, Object.fromEntries(cards.map((c) => [c.key, `f-${c.key}`])), "t");
  assert.ok(els.every((e) => e.type === "image" && e.customData?.bespokeNote && e.fileId.startsWith("f-")));
  assert.equal(cardWidth(100), 300);
  assert.equal(cardWidth(900), 360);
}

// 6. small pieces
assert.deepEqual(settle({ x: 0, y: 0, w: 10, h: 10 }, []), { x: 0, y: 0, w: 10, h: 10 });
{
  const px = new Uint8ClampedArray(4 * 100);
  for (let i = 0; i < 100; i++) px.set(i < 70 ? [250, 120, 160, 255] : i < 95 ? [30, 30, 90, 255] : [0, 0, 0, 0], i * 4);
  assert.deepEqual(dominant(px, 5).length, 2);
  assert.equal(dominant(px, 5)[0], "#fa78a0");
}

console.log("ok: inspiration checks, merge order, our notes ignored, note placement and palette");
