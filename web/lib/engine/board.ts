// The moodboard engine: Excalidraw scene -> board graph -> evidence per slot, with polarity and comparisons.
import { ONTO, tokenize } from "./lexicon.ts";
import { bind } from "./spec.ts";
import type { Source, Update } from "./spec.ts";

export interface BoardImage { id: string; n: number; x: number; y: number; w: number; h: number; dataURL: string }
export interface BoardRegion { id: string; image: BoardImage; box: [number, number, number, number] }
export interface BoardNote { id: string; text: string; target: BoardImage | BoardRegion | null; negative: boolean }
export interface Board { images: BoardImage[]; regions: BoardRegion[]; notes: BoardNote[] }
export interface ImageEvidence { slot: string; dist: Record<string, number> }

const NEG_RE = /\b(no|not|nahi|nahin|mat|avoid|without|don'?t|never)\b|❌|✗/i;

/** Build the board graph from Excalidraw elements and files. Images are numbered in reading order. */
export function readBoard(elements: readonly any[], files: Record<string, any>): Board {
  const live = elements.filter((e) => !e.isDeleted);
  const images: BoardImage[] = live
    .filter((e) => e.type === "image" && e.fileId && files[e.fileId])
    .map((e) => ({ id: e.id, n: 0, x: e.x, y: e.y, w: e.width, h: e.height, dataURL: files[e.fileId].dataURL }))
    .sort((a, b) => (Math.abs(a.y - b.y) > 80 ? a.y - b.y : a.x - b.x));
  images.forEach((im, i) => (im.n = i + 1));
  const inside = (cx: number, cy: number) => images.find((im) => cx >= im.x && cx <= im.x + im.w && cy >= im.y && cy <= im.y + im.h);
  const regions: BoardRegion[] = [];
  for (const e of live) {
    if (e.type !== "ellipse" && e.type !== "rectangle" && e.type !== "freedraw") continue;
    const im = inside(e.x + e.width / 2, e.y + e.height / 2);
    if (im && e.width < im.w * 0.95) regions.push({ id: e.id, image: im, box: [(e.x - im.x) / im.w, (e.y - im.y) / im.h, e.width / im.w, e.height / im.h] });
  }
  const byId = new Map<string, BoardImage | BoardRegion>();
  images.forEach((i) => byId.set(i.id, i));
  regions.forEach((r) => byId.set(r.id, r));
  const notes: BoardNote[] = [];
  for (const t of live.filter((e) => e.type === "text" && !e.customData?.bespokeLabel)) {
    const text: string = t.originalText ?? t.text ?? "";
    const container = t.containerId ? live.find((e) => e.id === t.containerId) : null;
    const owners = [t.id, container?.id].filter(Boolean);
    const arrow = live.find((a) => a.type === "arrow" && owners.includes(a.startBinding?.elementId) && a.endBinding?.elementId);
    let target = arrow ? byId.get(arrow.endBinding.elementId) ?? null : null;
    if (!target) {
      // a note written on top of an image belongs to it; otherwise the nearest image within reach
      target = inside(t.x + t.width / 2, t.y + t.height / 2) ?? null;
    }
    notes.push({ id: t.id, text, target, negative: NEG_RE.test(text) });
  }
  return { images, regions, notes };
}

// prompts per slot for zero-shot scoring; values are ontology canonicals
export const IMAGE_SLOTS: Record<string, Record<string, string>> = {
  garment: { kurti: "a photo of a kurta", anarkali: "a photo of an anarkali suit", lehenga: "a photo of a lehenga", "saree blouse": "a photo of a saree blouse",
    dress: "a photo of a dress", gown: "a photo of a gown", top: "a photo of a top", shirt: "a photo of a shirt", "co-ord set": "a photo of a co-ord set", sharara: "a photo of a sharara suit" },
  "neckline.shape": { v: "a garment with a v neckline", round: "a garment with a round neckline", boat: "a garment with a boat neckline", square: "a garment with a square neckline",
    sweetheart: "a garment with a sweetheart neckline", mandarin: "a garment with a mandarin collar", "off-shoulder": "an off-shoulder garment", halter: "a halter neck garment" },
  "sleeve.style": { puff: "a garment with puff sleeves", bell: "a garment with bell sleeves", straight: "a garment with plain straight sleeves", flutter: "a garment with ruffled flutter sleeves", bishop: "a garment with bishop sleeves" },
  "sleeve.length": { sleeveless: "a sleeveless garment", cap: "a garment with cap sleeves", elbow: "a garment with elbow length sleeves", "three-quarter": "a garment with three quarter sleeves", full: "a garment with full length sleeves" },
  "lower.silhouette": { "a-line": "an a-line garment", straight: "a straight cut garment", flared: "a flared garment with a wide hem", anarkali: "a panelled anarkali flare", bodycon: "a bodycon fitted garment" },
  colour: Object.fromEntries(["red", "maroon", "pink", "peach", "yellow", "mustard", "green", "mint", "teal", "blue", "powder blue", "navy", "purple", "lavender", "black", "white", "ivory", "beige", "gold"].map((c) => [c, `a ${c} garment`])),
  pattern: { solid: "a plain solid colour garment", floral: "a floral print garment", striped: "a striped garment", checked: "a checked garment", "block print": "a block printed garment" },
  embellishment: { embroidery: "a garment with embroidery", "mirror work": "a garment with mirror work", sequins: "a garment with sequins", "gota patti": "a garment with gold gota patti borders", none: "a plain garment without embellishment" },
};
const REGION_SLOTS = ["sleeve.style", "sleeve.length", "neckline.shape"];
const DEPTH_PROMPTS: [string, number][] = [["a garment with a high closed neckline", 4.5], ["a garment with a modest neckline", 6.0], ["a garment with a deep neckline", 7.5], ["a garment with a plunging neckline", 9.0]];

const SLOT_WORDS: [RegExp, string[]][] = [
  [/colou?r|rang|shade/i, ["colour"]], [/sleeve|baazu|bazu|aasteen/i, ["sleeve.style", "sleeve.length"]],
  [/neck|gala/i, ["neckline.shape"]], [/print|pattern/i, ["pattern"]], [/work|embroid|kadhai|mirror|sequin/i, ["embellishment"]],
  [/cut|shape|flare|silhouette|fit/i, ["lower.silhouette"]],
];
const slotsMentioned = (text: string) => SLOT_WORDS.filter(([re]) => re.test(text)).flatMap(([, s]) => s);

async function crop(dataURL: string, box: [number, number, number, number]): Promise<string> {
  const img = new Image();
  img.src = dataURL;
  await img.decode();
  const [x, y, w, h] = box;
  const c = document.createElement("canvas");
  c.width = Math.max(32, Math.round(img.naturalWidth * w));
  c.height = Math.max(32, Math.round(img.naturalHeight * h));
  c.getContext("2d")!.drawImage(img, img.naturalWidth * x, img.naturalHeight * y, img.naturalWidth * w, img.naturalHeight * h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.9);
}

export interface BoardResult { updates: Update[]; perImage: Record<number, Record<string, [string, number]>>; depth: Record<number, number>; notes: { text: string; target: string }[] }

/** Score every element, pool per slot with salience weights and polarity, and turn note comparisons into intervals. */
export async function analyseBoard(board: Board, score: (img: string, prompts: string[]) => Promise<number[]>,
  tagText: (t: string) => Promise<{ tokens: string[]; spans: any[] }>, progress: (s: string) => void): Promise<BoardResult> {
  const updates: Update[] = [];
  const weight = new Map<number, number>();
  const polarity = new Map<number, Map<string, number>>();
  const label = (t: BoardImage | BoardRegion | null) => (!t ? "board" : "n" in t ? `#${t.n}` : `circle on #${t.image.n}`);
  for (const im of board.images) weight.set(im.n, 0.5);

  // notes first: they decide salience and polarity
  for (const note of board.notes) {
    const img = note.target ? ("n" in note.target ? note.target : note.target.image) : null;
    const mentioned = slotsMentioned(note.text);
    if (img) {
      weight.set(img.n, 1);
      if (note.negative) {
        const p = polarity.get(img.n) ?? new Map();
        for (const s of mentioned.length ? mentioned : Object.keys(IMAGE_SLOTS)) p.set(s, -1);
        polarity.set(img.n, p);
      }
    }
    if (!note.negative || !img) {
      const { tokens, spans } = await tagText(note.text.replace(/\bthis\b/gi, img ? `#${img.n}` : "this"));
      updates.push(...bind(tokens, spans, "note" as Source, 0.85));
    }
  }

  // every image: one distribution per slot
  const perImage: BoardResult["perImage"] = {};
  const dists: Record<string, { n: number; d: number[] }[]> = {};
  for (const im of board.images) {
    perImage[im.n] = {};
    for (const [slot, prompts] of Object.entries(IMAGE_SLOTS)) {
      progress(`Reading #${im.n}: ${slot.replace(".", " ")}`);
      const d = await score(im.dataURL, Object.values(prompts));
      (dists[slot] ??= []).push({ n: im.n, d });
      const j = d.indexOf(Math.max(...d));
      perImage[im.n][slot] = [Object.keys(prompts)[j], d[j]];
    }
  }
  // circled regions: part-level slots on the crop, full weight
  for (const r of board.regions) {
    const c = await crop(r.image.dataURL, r.box);
    for (const slot of REGION_SLOTS) {
      progress(`Reading the circle on #${r.image.n}`);
      const d = await score(c, Object.values(IMAGE_SLOTS[slot]));
      (dists[slot] ??= []).push({ n: r.image.n, d: d.map((x) => x) });
      weight.set(r.image.n, 1);
    }
  }
  // signed, weighted log-linear pooling
  for (const [slot, list] of Object.entries(dists)) {
    const values = Object.keys(IMAGE_SLOTS[slot]);
    const logit = values.map(() => 0);
    let mass = 0;
    for (const { n, d } of list) {
      const sign = polarity.get(n)?.get(slot) ?? 1;
      const w = weight.get(n) ?? 0.5;
      mass += sign > 0 ? w : 0;
      d.forEach((p, j) => (logit[j] += sign * w * Math.log(Math.max(p, 1e-4))));
      if (sign < 0) {
        const j = d.indexOf(Math.max(...d));
        if (d[j] > 0.5 && values[j] !== "none") updates.push({ op: "exclude", slot, value: { value: values[j], p: d[j], src: "image", evidence: `not as in #${n}` } });
      }
    }
    if (mass === 0) continue;
    const mx = Math.max(...logit.map((l) => l / mass));
    const ex = logit.map((l) => Math.exp(l / mass - mx));
    const z = ex.reduce((a, b) => a + b, 0);
    const j = ex.indexOf(Math.max(...ex));
    const p = ex[j] / z;
    if (p >= 0.45 && values[j] !== "none") {
      const op = ["colour", "pattern", "embellishment"].includes(slot) ? "add" : "set";
      updates.push({ op, slot, value: { value: values[j], p: Math.min(0.8, p), src: "image", evidence: `board, ${list.length} reference${list.length > 1 ? "s" : ""}` } } as Update);
    }
  }
  // depth per image for comparisons: expected inches under the zero-shot distribution
  const depth: Record<number, number> = {};
  for (const im of board.images) {
    const d = await score(im.dataURL, DEPTH_PROMPTS.map(([p]) => p));
    const z = d.reduce((a, b) => a + b, 0) || 1;
    depth[im.n] = Math.round((DEPTH_PROMPTS.reduce((s, [, v], j) => s + v * d[j], 0) / z) * 4) / 4;
  }
  return { updates, perImage, depth, notes: board.notes.map((n) => ({ text: n.text, target: label(n.target) })) };
}

/** "deeper than #1 but less than #2" -> interval in inches; propose toward the shallow end (a neckline can be deepened, not raised). */
export function resolveComparisons(comps: { slot: string; cmp: string; ref: string }[], depth: Record<number, number>, band = 0.5) {
  const out: { slot: string; lo: number; hi: number; proposal: number | null; note: string }[] = [];
  const bySlot = new Map<string, typeof comps>();
  for (const c of comps) bySlot.set(c.slot, [...(bySlot.get(c.slot) ?? []), c]);
  for (const [slot, list] of bySlot) {
    let lo = 0, hi = 99;
    for (const c of list) {
      const n = parseInt(c.ref.replace(/[^0-9]/g, ""), 10);
      const d = depth[n];
      if (!d) continue;
      if (c.cmp === "more") lo = Math.max(lo, d + band);
      else if (c.cmp === "less") hi = Math.min(hi, d - band);
      else { lo = Math.max(lo, d - band); hi = Math.min(hi, d + band); }
    }
    if (lo === 0 && hi === 99) continue;
    const ok = lo <= hi;
    const proposal = ok ? Math.round((lo + (Math.min(hi, lo + 3) - lo) / 3) * 4) / 4 : null;
    out.push({ slot, lo, hi, proposal, note: ok ? `between ${lo.toFixed(2)} and ${hi === 99 ? "open" : hi.toFixed(2)} in` : "the references contradict each other" });
  }
  return out;
}

export const words = tokenize;
export const ontologySlots = ONTO.slots;
