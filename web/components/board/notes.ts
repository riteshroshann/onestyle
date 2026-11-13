// Where the notes go on the board: a card under each picture (lower, if something is in the way) and the Direction
// card to the right of everything. Pure, so it is tested without a canvas; cards.ts draws them, Board.tsx places them.
import type { Idea } from "../../lib/engine/board.ts";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed { n: number; x: number; y: number; w: number; h: number }
/** One slot the image model scored, such as "Print": its best readings as [label, probability]. */
export interface Chart { title: string; rows: [string, number][] }
/** A drawn card waiting for a spot: under picture n, or the Direction card when n is absent. */
export interface Sized { key: string; n?: number; w: number; h: number }
export interface Spot extends Rect { key: string }

const GAP = 36;
const join = (xs: (string | undefined)[]) => xs.filter(Boolean).join(", ");
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

/** Width of the card under a picture: about the picture's width, within a readable measure. */
export const cardWidth = (pictureWidth: number) => Math.round(Math.min(360, Math.max(300, pictureWidth)));

/**
 * Spots for drawn cards. `taken` is every element on the board that is not one of our notes. `inset` is the shadow
 * margin drawn into each card image, so the visible card lines up with its picture.
 */
export function place(images: Placed[], taken: Rect[], cards: Sized[], inset = 0): Spot[] {
  const out: Spot[] = [];
  const busy = [...taken];
  // cards are often wider than their pictures, so in a row they slide right rather than stack
  const row: Rect[] = [];
  for (const c of [...cards.filter((c) => c.n !== undefined)].sort((p, q) => (images.find((i) => i.n === p.n)?.x ?? 0) - (images.find((i) => i.n === q.n)?.x ?? 0))) {
    const im = images.find((i) => i.n === c.n);
    if (!im) continue;
    const y = im.y + im.h + GAP - inset;
    const beside = row.filter((r) => r.y < y + c.h && y < r.y + r.h);
    const x = Math.max(im.x - inset, ...beside.map((r) => r.x + r.w - inset));
    const spot = { key: c.key, ...settle({ x, y, w: c.w, h: c.h }, busy) };
    row.push(spot);
    out.push(spot);
    busy.push(spot);
  }
  for (const c of cards.filter((c) => c.n === undefined)) {
    const all = [...taken, ...out];
    const right = all.length ? Math.max(...all.map((r) => r.x + r.w)) : 0;
    const top = all.length ? Math.min(...all.map((r) => r.y)) : 0;
    out.push({ key: c.key, x: right + GAP * 2, y: top - inset, w: c.w, h: c.h });
  }
  return out;
}

/** Excalidraw image skeletons for placed cards, each tagged as ours so it is never read back as the customer's. */
export function elements(spots: Spot[], fileIds: Record<string, string>, seed: string): any[] {
  return spots.map((s) => ({
    type: "image", id: `bespoke-${seed}-${s.key}`, fileId: fileIds[s.key], x: s.x, y: s.y, width: s.w, height: s.h,
    status: "saved", locked: false, roughness: 0, strokeColor: "transparent", customData: { bespokeNote: true },
  }));
}
