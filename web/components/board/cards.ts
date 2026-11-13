// The notes on the board, typeset in the site's own face and drawn to an image, so they read like a magazine page
// rather than a whiteboard: an editorial card under each picture and an ink Direction card beside the board.
// Browser only (it draws on a canvas); the placement lives in notes.ts.
import type { Idea, PictureIdeas } from "../../lib/engine/board";
import { SWATCH } from "../../lib/engine/describe";
import { ideaLine } from "./notes";
import type { Chart } from "./notes";

export interface Drawn { dataURL: string; w: number; h: number }

const SCALE = 2; // drawn at twice the size, so the cards stay crisp when the board is zoomed in
export const SHADOW = 28; // room around each card for its shadow, part of the image
const PAD = 28;
const INK = "#0d1117";
const BODY = "#3b3f46";
const MUTED = "#8b8f97";
const HAIR = "#ececef";

let FACE = "";
/** The site's own typeface, as the page has loaded it. */
async function face(): Promise<string> {
  if (FACE) return FACE;
  await document.fonts.ready.catch(() => {});
  FACE = getComputedStyle(document.body).fontFamily || "Helvetica, Arial, sans-serif";
  return FACE;
}

type Op = (g: CanvasRenderingContext2D, x: number, y: number) => void;
interface Block { h: number; draw: Op }
interface Style { size: number; weight?: number; colour: string; lead?: number; track?: number; upper?: boolean }

const font = (g: CanvasRenderingContext2D, f: string, s: Style) => {
  g.font = `${s.weight ?? 400} ${s.size}px ${f}`;
  (g as any).letterSpacing = `${(s.track ?? 0) * s.size}px`;
};

/** Breaks text into lines that fit the width, measured in the real face. */
function lines(g: CanvasRenderingContext2D, f: string, s: Style, text: string, width: number): string[] {
  font(g, f, s);
  const out: string[] = [];
  let cur = "";
  for (const word of (s.upper ? text.toUpperCase() : text).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (g.measureText(next).width <= width || !cur) cur = next;
    else { out.push(cur); cur = word; }
  }
  if (cur) out.push(cur);
  return out;
}

function text(g: CanvasRenderingContext2D, f: string, s: Style, body: string, width: number): Block {
  const ls = lines(g, f, s, body, width);
  const lh = s.size * (s.lead ?? 1.4);
  return {
    h: ls.length * lh,
    draw: (c, x, y) => {
      font(c, f, s);
      c.fillStyle = s.colour;
      c.textBaseline = "alphabetic";
      ls.forEach((l, i) => c.fillText(l, x, y + i * lh + s.size * 0.92 + (lh - s.size) / 2));
    },
  };
}
const gap = (h: number): Block => ({ h, draw: () => {} });
const stack = (blocks: Block[]): Block => ({
  h: blocks.reduce((t, b) => t + b.h, 0),
  draw: (c, x, y) => { let at = y; for (const b of blocks) { b.draw(c, x, at); at += b.h; } },
});

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Paints a card and its content onto an image with room for a soft shadow. */
function paint(w: number, content: Block, fill: string, radius: number): Drawn {
  const h = Math.ceil(content.h + PAD * 2);
  const W = w + SHADOW * 2, H = h + SHADOW * 2;
  const cv = document.createElement("canvas");
  cv.width = W * SCALE; cv.height = H * SCALE;
  const g = cv.getContext("2d")!;
  g.scale(SCALE, SCALE);
  g.save();
  g.shadowColor = "rgba(13,17,23,0.10)"; g.shadowBlur = 36; g.shadowOffsetY = 14;
  roundRect(g, SHADOW, SHADOW, w, h, radius);
  g.fillStyle = fill; g.fill();
  g.restore();
  if (fill === "#ffffff") { roundRect(g, SHADOW + 0.5, SHADOW + 0.5, w - 1, h - 1, radius); g.strokeStyle = "rgba(13,17,23,0.06)"; g.lineWidth = 1; g.stroke(); }
  content.draw(g, SHADOW + PAD, SHADOW + PAD);
  const webp = cv.toDataURL("image/webp", 0.92);
  return { dataURL: webp.startsWith("data:image/webp") ? webp : cv.toDataURL("image/png"), w: W, h: H };
}

const eyebrow = (colour = MUTED): Style => ({ size: 11, weight: 500, colour, track: 0.16, upper: true, lead: 1.3 });

function swatchRow(g: CanvasRenderingContext2D, f: string, palette: { name: string; hex: string }[], width: number): Block {
  if (!palette.length) return gap(0);
  const D = 30, step = D + 8;
  const names = text(g, f, { size: 12, colour: MUTED, lead: 1.4 }, palette.map((p) => p.name).join(" · "), width);
  return {
    h: D + 10 + names.h,
    draw: (c, x, y) => {
      palette.slice(0, Math.floor(width / step)).forEach((p, i) => {
        c.beginPath(); c.arc(x + D / 2 + i * step, y + D / 2, D / 2, 0, Math.PI * 2);
        c.fillStyle = p.hex; c.fill();
        c.strokeStyle = "rgba(13,17,23,0.08)"; c.lineWidth = 1; c.stroke();
      });
      names.draw(c, x, y + D + 10);
    },
  };
}

/** A label, then a row per reading: its name and a hairline track with a bar as long as the model's confidence. */
function chart(g: CanvasRenderingContext2D, f: string, ch: Chart, width: number): Block {
  const LABEL = 108, ROW = 24;
  const head = text(g, f, eyebrow(), ch.title, width);
  return {
    h: head.h + 8 + ch.rows.length * ROW,
    draw: (c, x, y) => {
      head.draw(c, x, y);
      let at = y + head.h + 8;
      ch.rows.forEach(([label, p], i) => {
        font(c, f, { size: 13, weight: i ? 400 : 500, colour: "" });
        c.fillStyle = i ? MUTED : INK;
        c.fillText(label, x, at + 16);
        const tx = x + LABEL, tw = width - LABEL, ty = at + 11;
        c.lineCap = "round"; c.lineWidth = 3;
        c.strokeStyle = HAIR; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + tw, ty); c.stroke();
        c.strokeStyle = i ? "#b9bcc2" : INK; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + Math.max(4, tw * Math.min(1, Math.max(0, p))), ty); c.stroke();
        at += ROW;
      });
    },
  };
}

/** Two short columns: a small caps label and its value, such as "Motifs  cherry blossoms, petals". */
function fact(g: CanvasRenderingContext2D, f: string, label: string, value: string, width: number): Block {
  const L = 72;
  const v = text(g, f, { size: 14, colour: BODY, lead: 1.45 }, value, width - L);
  const k = text(g, f, eyebrow(), label, L);
  return { h: Math.max(v.h, k.h) + 6, draw: (c, x, y) => { k.draw(c, x, y + 3); v.draw(c, x + L, y); } };
}

export async function pictureCard(p: PictureIdeas, charts: Chart[], width: number): Promise<Drawn> {
  const f = await face();
  const g = document.createElement("canvas").getContext("2d")!;
  const inner = width - PAD * 2;
  const tried = [...p.pattern, ...p["lower.silhouette"], ...p.fabric, ...p.embellishment];
  const blocks: Block[] = [text(g, f, eyebrow(), `No. ${p.n}`, inner)];
  if (p.shows) blocks.push(gap(10), text(g, f, { size: 24, weight: 500, colour: INK, lead: 1.18, track: -0.02 }, p.shows, inner));
  if (p.palette.length) blocks.push(gap(18), swatchRow(g, f, p.palette, inner));
  if (p.borrow) blocks.push(gap(18), text(g, f, { size: 16, colour: INK, lead: 1.5 }, p.borrow, inner));
  const facts: Block[] = [];
  if (p.motifs.length) facts.push(fact(g, f, "Motifs", p.motifs.join(", "), inner));
  if (p.mood.length) facts.push(fact(g, f, "Mood", p.mood.join(", "), inner));
  if (tried.length) facts.push(fact(g, f, "Try", tried.join(", "), inner));
  if (facts.length) blocks.push(gap(16), rule(inner), gap(14), ...facts);
  if (charts.length) {
    blocks.push(gap(14), rule(inner), gap(16), text(g, f, { size: 13, weight: 500, colour: INK }, "What the image model sees", inner), gap(12));
    charts.forEach((ch, i) => blocks.push(...(i ? [gap(14)] : []), chart(g, f, ch, inner)));
  }
  return paint(width, stack(blocks), "#ffffff", 26);
}

const rule = (width: number, colour = HAIR): Block => ({ h: 1, draw: (c, x, y) => { c.fillStyle = colour; c.fillRect(x, y, width, 1); } });

export async function directionCard(summary: string, ideas: Idea[], width: number): Promise<Drawn> {
  const f = await face();
  const g = document.createElement("canvas").getContext("2d")!;
  const inner = width - PAD * 2;
  const blocks: Block[] = [text(g, f, eyebrow("#8b8f97"), "The direction", inner)];
  if (summary) blocks.push(gap(14), text(g, f, { size: 34, weight: 500, colour: "#ffffff", lead: 1.08, track: -0.03 }, summary, inner));
  ideas.forEach((idea, i) => {
    const NUM = 40;
    const body: Block[] = [text(g, f, { size: 20, weight: 500, colour: "#ffffff", lead: 1.2, track: -0.015 }, idea.title, inner - NUM)];
    if (idea.why) body.push(gap(6), text(g, f, { size: 15, colour: "rgba(255,255,255,0.66)", lead: 1.45 }, idea.why, inner - NUM));
    const line = ideaLine(idea);
    if (line) body.push(gap(6), text(g, f, { size: 13, colour: "rgba(255,255,255,0.42)", lead: 1.45 }, line, inner - NUM));
    const dots = (idea.colour ?? []).map((c) => SWATCH[c] ?? "#d4d4d8");
    if (dots.length) body.push(gap(10), {
      h: 14, draw: (c, x, y) => dots.forEach((hex, k) => { c.beginPath(); c.arc(x + 7 + k * 20, y + 7, 7, 0, Math.PI * 2); c.fillStyle = hex; c.fill(); c.strokeStyle = "rgba(255,255,255,0.25)"; c.stroke(); }),
    });
    const col = stack(body);
    const num = text(g, f, { size: 13, weight: 500, colour: "rgba(255,255,255,0.4)" }, String(i + 1).padStart(2, "0"), NUM);
    blocks.push(gap(22), rule(inner, "rgba(255,255,255,0.12)"), gap(18), { h: col.h, draw: (c, x, y) => { num.draw(c, x, y + 4); col.draw(c, x + NUM, y); } });
  });
  return paint(width, stack(blocks), INK, 30);
}
