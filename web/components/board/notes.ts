// Inspiration notes written onto the board: an editorial card under each picture, with what the image model saw
// drawn as bars, and a black Direction card beside the board.
// Pure layout, so it is tested without a canvas; Board.tsx hands the skeletons to Excalidraw.
import type { Idea, PictureIdeas } from "../../lib/engine/board.ts";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Swatch { hex: string; name: string }
export interface Line { text: string; size: number; colour: string; gap?: number }
/** One slot the image model scored, such as "Print": its best readings as [label, probability]. */
export interface Chart { title: string; rows: [string, number][] }
// swatchAfter: the index of the line the palette follows, or -1 for none
export interface Card extends Rect { key: string; fill: string; stroke: string; lines: Line[]; swatches: Swatch[]; swatchAfter: number; charts: Chart[] }
export interface Placed { n: number; x: number; y: number; w: number; h: number }

export const INK = "#0d1117";
export const MUTED = "#6b6b6b";
const HAIRLINE = "#e4e4e7";
const PAPER = "#ffffff";
const ON_INK = "#ffffff";
const ON_INK_MUTED = "#a1a1aa";
const FONT = 2; // Helvetica: the plainest face Excalidraw has, closest to a magazine's sans
const PAD = 24;
const GAP = 36;
const LINE = 1.25; // Excalidraw's line height for its sans faces
const DOT = 24; // one palette swatch
const NAMES = 12; // font size of the colour names under the swatches
const SWATCH_TOP = 14;
const SWATCH_BOTTOM = 4;
const CHAR = 0.5; // average glyph width in em, kept generous so text never runs past its card
// the charts: a small heading per slot, then one labelled bar per reading
const CHART_TOP = 20;
const CHART_TITLE = 11;
const ROW = 22;
const ROW_TEXT = 13;
const LABEL_W = 104;
const BAR_H = 4;

/** Breaks text into lines that fit a width, at word boundaries. */
export function wrap(text: string, width: number, size: number): string[] {
  const max = Math.max(8, Math.floor(width / (size * CHAR)));
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= max) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word.length > max ? `${word.slice(0, max - 1)}-` : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const join = (xs: (string | undefined)[]) => xs.filter(Boolean).join(", ");
const lineHeight = (l: Line, inner: number) => (l.gap ?? 0) + wrap(l.text, inner, l.size).length * l.size * LINE;
const paletteHeight = (sw: Swatch[], inner: number) =>
  sw.length ? SWATCH_TOP + DOT + 8 + wrap(join(sw.map((s) => s.name)), inner, NAMES).length * NAMES * LINE + SWATCH_BOTTOM : 0;
const chartHeight = (charts: Chart[]) => charts.reduce((h, c) => h + CHART_TOP + CHART_TITLE * LINE + 6 + c.rows.length * ROW, 0);
const cardHeight = (lines: Line[], sw: Swatch[], charts: Chart[], inner: number) =>
  Math.ceil(PAD * 2 + lines.reduce((h, l) => h + lineHeight(l, inner), 0) + paletteHeight(sw, inner) + chartHeight(charts));

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Moves a card down until it clears everything already on the board. */
export function settle(card: Rect, taken: Rect[]): Rect {
  const r = { ...card };
  for (let i = 0; i < 50; i++) {
    const hit = taken.find((t) => overlaps({ x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 }, t));
    if (!hit) break;
    r.y = hit.y + hit.h + GAP / 2;
  }
  return r;
}

/** An idea's values as one plain line, such as "anarkali, flared, v neck, georgette, pink". */
export const ideaLine = (i: Idea) => join([i.garment as string, i["lower.silhouette"] as string, i["neckline.shape"] ? `${i["neckline.shape"]} neck` : "",
  i["sleeve.style"] ? `${i["sleeve.style"]} sleeves` : "", i.fabric as string, i.pattern as string, i.embellishment as string, ...(i.colour ?? [])]);

export function pictureLines(p: PictureIdeas): Line[] {
  const borrowed = join([...p.pattern, ...p["lower.silhouette"], ...p.fabric, ...p.embellishment]);
  return [
    { text: `NO. ${p.n}`, size: 12, colour: MUTED },
    p.shows && { text: p.shows, size: 20, colour: INK, gap: 8 },
    p.borrow && { text: p.borrow, size: 15, colour: INK, gap: 16 },
    p.motifs.length && { text: `Motifs: ${join(p.motifs)}`, size: 14, colour: MUTED, gap: 10 },
    p.mood.length && { text: `Mood: ${join(p.mood)}`, size: 14, colour: MUTED, gap: 4 },
    borrowed && { text: `Try: ${borrowed}`, size: 14, colour: MUTED, gap: 4 },
  ].filter(Boolean) as Line[];
}

export function directionLines(summary: string, ideas: Idea[]): Line[] {
  const out: Line[] = [{ text: "THE DIRECTION", size: 12, colour: ON_INK_MUTED }];
  if (summary) out.push({ text: summary, size: 24, colour: ON_INK, gap: 12 });
  ideas.forEach((i, k) => {
    out.push({ text: `${k + 1}   ${i.title}`, size: 18, colour: ON_INK, gap: 24 });
    if (i.why) out.push({ text: i.why, size: 14, colour: ON_INK_MUTED, gap: 6 });
    const v = ideaLine(i);
    if (v) out.push({ text: v, size: 13, colour: ON_INK_MUTED, gap: 4 });
  });
  return out;
}

/**
 * Where the notes go: under each picture (lower, if something is in the way) and a Direction card to the right of
 * everything. `taken` is every element on the board that is not one of our notes; `charts` is what the image model
 * saw in each picture, by picture number.
 */
export function layoutNotes(images: Placed[], taken: Rect[], pictures: PictureIdeas[], summary: string, ideas: Idea[], charts: Record<number, Chart[]> = {}): Card[] {
  const cards: Card[] = [];
  const busy = [...taken];
  for (const p of pictures) {
    const im = images.find((i) => i.n === p.n);
    if (!im) continue;
    const w = Math.round(Math.min(340, Math.max(260, im.w)));
    const lines = pictureLines(p);
    const swatches = p.palette.map((c) => ({ hex: c.hex, name: c.name }));
    const seen = charts[p.n] ?? [];
    const h = cardHeight(lines, swatches, seen, w - PAD * 2);
    const spot = settle({ x: im.x, y: im.y + im.h + GAP, w, h }, busy);
    const card: Card = { key: `p${p.n}`, ...spot, fill: PAPER, stroke: HAIRLINE, lines, swatches, swatchAfter: swatches.length ? (p.shows ? 1 : 0) : -1, charts: seen };
    cards.push(card);
    busy.push(card);
  }
  if (summary || ideas.length) {
    const all = [...taken, ...cards];
    const right = all.length ? Math.max(...all.map((r) => r.x + r.w)) : 0;
    const top = all.length ? Math.min(...all.map((r) => r.y)) : 0;
    const w = 400;
    const lines = directionLines(summary, ideas);
    cards.push({ key: "direction", x: right + GAP * 2, y: top, w, h: cardHeight(lines, [], [], w - PAD * 2), fill: INK, stroke: "transparent", lines, swatches: [], swatchAfter: -1, charts: [] });
  }
  return cards;
}

/** Excalidraw skeletons for the cards: a rounded card, its text, its palette and its bars. Every piece is tagged as ours. */
export function skeletons(cards: Card[], seed: string): any[] {
  const out: any[] = [];
  for (const c of cards) {
    const id = `bespoke-${seed}-${c.key}`;
    const base = { groupIds: [id], customData: { bespokeNote: true }, roughness: 0, strokeWidth: 1, opacity: 100 };
    out.push({ ...base, type: "rectangle", id: `${id}-card`, x: c.x, y: c.y, width: c.w, height: c.h,
      backgroundColor: c.fill, fillStyle: "solid", strokeColor: c.stroke, roundness: { type: 3 } });
    const inner = c.w - PAD * 2;
    let y = c.y + PAD;
    c.lines.forEach((l, i) => {
      y += l.gap ?? 0;
      const text = wrap(l.text, inner, l.size).join("\n");
      out.push({ ...base, type: "text", id: `${id}-t${i}`, x: c.x + PAD, y, text, fontSize: l.size, fontFamily: FONT, lineHeight: LINE, strokeColor: l.colour, textAlign: "left", verticalAlign: "top" });
      y += text.split("\n").length * l.size * LINE;
      // the palette sits right under what the picture shows
      if (i === c.swatchAfter) y = swatches(out, base, c, id, inner, y + SWATCH_TOP);
    });
    bars(out, base, c, id, inner, y);
  }
  return out;
}

function swatches(out: any[], base: object, c: Card, id: string, inner: number, y: number): number {
  c.swatches.forEach((s, k) => {
    out.push({ ...base, type: "ellipse", id: `${id}-s${k}`, x: c.x + PAD + k * (DOT + 10), y, width: DOT, height: DOT,
      backgroundColor: s.hex, fillStyle: "solid", strokeColor: HAIRLINE });
  });
  const names = wrap(join(c.swatches.map((s) => s.name)), inner, NAMES);
  out.push({ ...base, type: "text", id: `${id}-names`, x: c.x + PAD, y: y + DOT + 8, text: names.join("\n"), fontSize: NAMES, fontFamily: FONT, lineHeight: LINE, strokeColor: MUTED, textAlign: "left", verticalAlign: "top" });
  return y + DOT + 8 + names.length * NAMES * LINE + SWATCH_BOTTOM;
}

/** What the image model saw, one small chart per slot: a label, a hairline track and an ink bar as long as its confidence. */
function bars(out: any[], base: object, c: Card, id: string, inner: number, y: number) {
  const track = inner - LABEL_W;
  c.charts.forEach((chart, g) => {
    y += CHART_TOP;
    out.push({ ...base, type: "text", id: `${id}-c${g}`, x: c.x + PAD, y, text: chart.title.toUpperCase(), fontSize: CHART_TITLE, fontFamily: FONT, lineHeight: LINE, strokeColor: MUTED, textAlign: "left", verticalAlign: "top" });
    y += CHART_TITLE * LINE + 6;
    chart.rows.forEach(([label, p], r) => {
      const name = wrap(label, LABEL_W - 8, ROW_TEXT)[0] ?? "";
      out.push({ ...base, type: "text", id: `${id}-c${g}r${r}`, x: c.x + PAD, y: y + 2, text: name, fontSize: ROW_TEXT, fontFamily: FONT, lineHeight: LINE, strokeColor: r ? MUTED : INK, textAlign: "left", verticalAlign: "top" });
      const mid = y + ROW / 2 - BAR_H / 2;
      out.push({ ...base, type: "rectangle", id: `${id}-c${g}t${r}`, x: c.x + PAD + LABEL_W, y: mid, width: track, height: BAR_H, backgroundColor: "#ededee", fillStyle: "solid", strokeColor: "transparent" });
      out.push({ ...base, type: "rectangle", id: `${id}-c${g}b${r}`, x: c.x + PAD + LABEL_W, y: mid, width: Math.max(3, Math.round(track * Math.min(1, Math.max(0, p)))), height: BAR_H,
        backgroundColor: r ? "#a1a1aa" : INK, fillStyle: "solid", strokeColor: "transparent" });
      y += ROW;
    });
  });
}
