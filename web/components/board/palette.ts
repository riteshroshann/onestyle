// A picture's palette, read on this device from its pixels. Works offline and for any picture.
import { nearestColour } from "../../lib/engine/describe.ts";

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const far = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 48;

/** The k most common distinct colours in RGBA pixels: 4-bit buckets, averaged, near-duplicates skipped. */
export function dominant(data: Uint8ClampedArray, k = 5): string[] {
  const buckets = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const b = buckets.get(key) ?? [0, 0, 0, 0];
    b[0] += data[i]; b[1] += data[i + 1]; b[2] += data[i + 2]; b[3]++;
    buckets.set(key, b);
  }
  const ranked = [...buckets.values()].sort((a, b) => b[3] - a[3]).map(([r, g, b, n]) => [r / n, g / n, b / n]);
  const picked: number[][] = [];
  for (const c of ranked) {
    if (picked.length >= k) break;
    if (picked.every((p) => far(p, c))) picked.push(c);
  }
  return picked.map(([r, g, b]) => hex(r, g, b));
}

/** Palette swatches for a picture, each named by the nearest colour the tailor knows. */
export async function paletteOf(dataURL: string, k = 5): Promise<{ name: string; hex: string; base: string }[]> {
  const img = new Image();
  img.src = dataURL;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = Math.max(1, Math.round((48 * img.naturalHeight) / img.naturalWidth));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  // one swatch per named colour, so the names never repeat
  const seen = new Set<string>();
  return dominant(ctx.getImageData(0, 0, c.width, c.height).data, k + 3)
    .map((h) => ({ name: nearestColour(h), hex: h, base: nearestColour(h) }))
    .filter((s) => !seen.has(s.base) && seen.add(s.base))
    .slice(0, k);
}
