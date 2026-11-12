// The moodboard engine: Excalidraw scene -> board graph -> evidence per slot, with polarity and comparisons.
import { ONTO, tokenize } from "./lexicon.ts";
import { bind } from "./spec.ts";
import type { Source, Update } from "./spec.ts";

export interface BoardImage { id: string; n: number; x: number; y: number; w: number; h: number; dataURL: string }
export interface BoardRegion { id: string; image: BoardImage; box: [number, number, number, number] }
export interface BoardNote { id: string; text: string; target: BoardImage | BoardRegion | null; negative: boolean }
export interface Board { images: BoardImage[]; regions: BoardRegion[]; notes: BoardNote[] }
export interface ImageEvidence { slot: string; dist: Record<string, number> }

/** Elements Bespoke writes on the board itself: picture numbers and inspiration notes. They are never read back as the customer's own marks. */
export const isOurs = (e: any) => !!(e?.customData?.bespokeLabel || e?.customData?.bespokeNote);

const NEG_RE = /\b(no|not|nahi|nahin|mat|avoid|without|don'?t|never)\b|❌|✗/i;

/** Build the board graph from Excalidraw elements and files. Images are numbered in reading order. */
export function readBoard(elements: readonly any[], files: Record<string, any>): Board {
  const live = elements.filter((e) => !e.isDeleted && !isOurs(e));
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
  for (const t of live.filter((e) => e.type === "text")) {
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
// A general image model reads garment type, colour and print reliably from a whole picture; finer details
// (sleeve, neckline, silhouette, embellishment) only come from a part the customer circles.
const WHOLE_SLOTS = ["garment", "colour", "pattern"];
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

/** What the reader is looking at right now, for the interface to show as it happens. */
export type BoardEvent =
  | { type: "picture"; n: number; box?: [number, number, number, number] }
  | { type: "slot"; n: number; slot: string; value: string; p: number; circled: boolean }
  | { type: "depth"; n: number; inches: number };

export interface BoardResult { updates: Update[]; perImage: Record<number, Record<string, [string, number]>>; depth: Record<number, number>; notes: { text: string; target: string }[] }

type TagText = (t: string) => Promise<{ tokens: string[]; spans: any[] }>;

/** The customer's notes alone: their words as updates, plus which pictures they point at and which they reject. */
export async function readNotes(board: Board, tagText: TagText) {
  const updates: Update[] = [];
  const weight = new Map<number, number>();
  const polarity = new Map<number, Map<string, number>>();
  for (const im of board.images) weight.set(im.n, 0.5);
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
  return { updates, weight, polarity };
}

/** Score every element, pool per slot with salience weights and polarity, and turn note comparisons into intervals. */
export async function analyseBoard(board: Board, score: (img: string, prompts: string[]) => Promise<number[]>,
  tagText: TagText, progress: (s: string) => void, emit: (e: BoardEvent) => void = () => {}): Promise<BoardResult> {
  // notes first: they decide salience and polarity
  const { updates, weight, polarity } = await readNotes(board, tagText);
  const label = (t: BoardImage | BoardRegion | null) => (!t ? "board" : "n" in t ? `#${t.n}` : `circle on #${t.image.n}`);

  // every image: one distribution per slot
  const perImage: BoardResult["perImage"] = {};
  const dists: Record<string, { n: number; d: number[] }[]> = {};
  for (const im of board.images) {
    perImage[im.n] = {};
    emit({ type: "picture", n: im.n });
    for (const slot of WHOLE_SLOTS) {
      const prompts = IMAGE_SLOTS[slot];
      progress(`Reading picture ${im.n}`);
      const d = await score(im.dataURL, Object.values(prompts));
      (dists[slot] ??= []).push({ n: im.n, d });
      const j = d.indexOf(Math.max(...d));
      perImage[im.n][slot] = [Object.keys(prompts)[j], d[j]];
      emit({ type: "slot", n: im.n, slot, value: Object.keys(prompts)[j], p: d[j], circled: false });
    }
  }
  // circled regions: part-level slots on the crop, full weight
  for (const r of board.regions) {
    const c = await crop(r.image.dataURL, r.box);
    emit({ type: "picture", n: r.image.n, box: r.box });
    for (const slot of REGION_SLOTS) {
      progress(`Reading the circle on #${r.image.n}`);
      const d = await score(c, Object.values(IMAGE_SLOTS[slot]));
      (dists[slot] ??= []).push({ n: r.image.n, d: d.map((x) => x) });
      const j = d.indexOf(Math.max(...d));
      emit({ type: "slot", n: r.image.n, slot, value: Object.keys(IMAGE_SLOTS[slot])[j], p: d[j], circled: true });
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
    const second = Math.max(...ex.filter((_, k) => k !== j)) / z;
    // only a clear winner counts, and it stays a suggestion (p below the bar that stops a question)
    if (p >= 0.55 && p - second >= 0.2 && values[j] !== "none") {
      const op = ["colour", "pattern", "embellishment"].includes(slot) ? "add" : "set";
      updates.push({ op, slot, value: { value: values[j], p: Math.min(0.6, p), src: "image", evidence: `board, ${list.length} reference${list.length > 1 ? "s" : ""}` } } as Update);
    }
  }
  // depth per image for comparisons: expected inches under the zero-shot distribution
  const depth: Record<number, number> = {};
  for (const im of board.images) {
    const d = await score(im.dataURL, DEPTH_PROMPTS.map(([p]) => p));
    const z = d.reduce((a, b) => a + b, 0) || 1;
    depth[im.n] = Math.round((DEPTH_PROMPTS.reduce((s, [, v], j) => s + v * d[j], 0) / z) * 4) / 4;
    emit({ type: "depth", n: im.n, inches: depth[im.n] });
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

// ------------------------------------------------------------------ inspiration from the picture reader (api/vision.js)

/** A picture as the reader saw it: what it shows and what a garment could borrow. */
export interface PictureIdeas {
  n: number; shows: string; borrow: string;
  palette: { name: string; hex: string; base?: string }[];
  mood: string[]; motifs: string[];
  pattern: string[]; "lower.silhouette": string[]; fabric: string[]; embellishment: string[]; style: string[];
}
/** One garment idea; every slot value is an ontology canonical. */
export interface Idea { title: string; why: string; colour?: string[]; [slot: string]: string | string[] | undefined }
export interface Inspiration { pictures: PictureIdeas[]; leftOut: number[]; direction: { summary: string; ideas: Idea[] } }

// pictures suggest, words decide: image evidence never rises above this
export const IMAGE_CAP = 0.6;
const SLOT_TAG: Record<string, string> = {
  garment: "GARMENT", colour: "COLOUR", pattern: "PATTERN", embellishment: "EMBELL", fabric: "FABRIC",
  "lower.silhouette": "SILHOUETTE", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", style: "STYLE", occasion: "OCCASION",
};
const LISTED = new Set(["colour", "pattern", "embellishment", "style", "occasion"]);
// a circle on a picture is finer evidence than a model's look at the whole picture
const FINE_SLOTS = new Set(REGION_SLOTS);
const HEX_RE = /^#[0-9a-f]{6}$/;
const TEXT_RE = /^[^<>{}[\]`\\]*$/;
const URL_RE = /https?:\/\/|www\.|\.(com|net|org|io|in|ai|co)\b/i;

/** True when a value is a canonical in the ontology for that slot. */
export const known = (slot: string, value: unknown) =>
  typeof value === "string" && !!SLOT_TAG[slot] && Object.prototype.hasOwnProperty.call(ONTO.lexicon[SLOT_TAG[slot]], value);
const short = (s: unknown, max: number) => (typeof s === "string" && TEXT_RE.test(s) && !URL_RE.test(s) ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (slot: string, v: unknown, n = 4) => (Array.isArray(v) ? [...new Set(v.filter((x) => known(slot, x)))].slice(0, n) as string[] : []);
const texts = (v: unknown, max: number, n = 4) => (Array.isArray(v) ? v.map((x) => short(x, max)).filter(Boolean).slice(0, n) : []);

/** The reader's reply checked again on this side: the server is trusted for nothing that reaches the design. */
export function checkInspiration(raw: any, sent: number[]): Inspiration {
  const ok = new Set(sent);
  const pictures: PictureIdeas[] = (Array.isArray(raw?.pictures) ? raw.pictures : [])
    .filter((p: any) => p && ok.has(p.n))
    .map((p: any) => ({
      n: p.n, shows: short(p.shows, 90), borrow: short(p.borrow, 160),
      palette: (Array.isArray(p.palette) ? p.palette : [])
        .filter((c: any) => typeof c?.hex === "string" && HEX_RE.test(c.hex) && short(c.name, 28))
        .slice(0, 5).map((c: any) => (known("colour", c.base) ? { name: short(c.name, 28), hex: c.hex, base: c.base } : { name: short(c.name, 28), hex: c.hex })),
      mood: texts(p.mood, 28), motifs: texts(p.motifs, 32),
      pattern: list("pattern", p.pattern), "lower.silhouette": list("lower.silhouette", p["lower.silhouette"]), fabric: list("fabric", p.fabric),
      embellishment: list("embellishment", p.embellishment), style: list("style", p.style),
    }));
  const ideas: Idea[] = (Array.isArray(raw?.direction?.ideas) ? raw.direction.ideas : []).slice(0, 4).flatMap((i: any) => {
    const title = short(i?.title, 48);
    if (!title) return [];
    const idea: Idea = { title, why: short(i.why, 150) };
    for (const slot of Object.keys(SLOT_TAG)) {
      if (slot === "colour") { const c = list("colour", i.colour, 3); if (c.length) idea.colour = c; }
      else if (known(slot, i[slot])) idea[slot] = i[slot];
    }
    return [idea];
  });
  const leftOut = (Array.isArray(raw?.leftOut) ? raw.leftOut : []).filter((n: unknown) => typeof n === "number" && ok.has(n));
  return { pictures, leftOut, direction: { summary: short(raw?.direction?.summary, 170), ideas } };
}

const ev = (value: string, p: number, evidence: string) => ({ value, p: Math.min(IMAGE_CAP, p), src: "image" as Source, evidence });

/** The design updates one idea stands for: suggestions only, at most IMAGE_CAP sure. */
export function ideaUpdates(idea: Idea): Update[] {
  const out: Update[] = [];
  const why = `board direction: ${idea.title}`;
  for (const slot of Object.keys(SLOT_TAG)) {
    const v = idea[slot];
    for (const value of Array.isArray(v) ? v : v ? [v] : []) {
      if (!known(slot, value)) continue;
      out.push({ op: LISTED.has(slot) ? "add" : "set", slot, value: ev(value, slot === "garment" ? 0.5 : 0.55, why) } as Update);
    }
  }
  return out;
}

/**
 * One list of updates from the customer's notes, the on-device reading and the picture reader's chosen idea.
 * Notes (words) beat pictures on any slot they touch; a circle read on the device beats the model on fine slots;
 * otherwise the model's idea wins its slots. Agreement nudges sureness up, never past IMAGE_CAP.
 */
export function mergeUpdates(device: Update[], model: Update[], circled: boolean): Update[] {
  const worded = new Set(device.filter((u) => u.value.src !== "image").map((u) => u.slot));
  const excluded = new Set(device.filter((u) => u.op === "exclude").map((u) => `${u.slot}=${u.value.value}`));
  const kept = device.filter((u) => u.value.src !== "image" || u.op === "exclude"); // words and "not this" always stand
  const fine = (slot: string) => circled && FINE_SLOTS.has(slot);
  const deviceImage = device.filter((u) => u.value.src === "image" && u.op !== "exclude" && !worded.has(u.slot));
  const modelSlots = new Set(model.map((u) => u.slot));
  const out = [...kept];
  for (const u of deviceImage) if (fine(u.slot) || !modelSlots.has(u.slot)) out.push({ ...u, value: { ...u.value, p: Math.min(IMAGE_CAP, u.value.p) } });
  for (const u of model) {
    if (worded.has(u.slot) || excluded.has(`${u.slot}=${u.value.value}`)) continue;
    if (fine(u.slot) && deviceImage.some((d) => d.slot === u.slot)) continue;
    const agree = deviceImage.some((d) => d.slot === u.slot && d.value.value === u.value.value);
    out.push({ ...u, value: { ...u.value, p: Math.min(IMAGE_CAP, u.value.p + (agree ? 0.05 : 0)) } });
  }
  return out;
}
