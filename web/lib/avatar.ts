// The design as a picture: a prompt for a full-length editorial photo of a generic model wearing it. Written from the
// design alone, so every new instruction redraws the whole look with the rest kept. Nothing about the customer goes in.
import type { Spec } from "./engine/spec.ts";
import { garmentName, wearerOf } from "./engine/spec.ts";

const v = (spec: Spec, slot: string) => spec.slots[slot]?.value ?? "";
const many = (spec: Spec, slot: string) => (spec.lists[slot] ?? []).map((x) => x.value);
const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

const MODEL: Record<string, string> = { men: "a generic adult male fashion model", women: "a generic adult female fashion model", anyone: "a generic adult fashion model" };
const AGE: Record<string, string> = { kid: "a child model", teen: "a teenage model", "20s": "in their twenties", "30s": "in their thirties", "40s": "in their forties", "50+": "in their fifties" };

/** The garment itself in plain words: colour, fabric, print, cut and every detail the design has. */
export function outfitWords(spec: Spec): string {
  const colours = [...many(spec, "shade"), ...many(spec, "colour")];
  const themes = (spec.notes ?? []).filter((n) => / print$/i.test(n));
  const pattern = themes.length ? themes : many(spec, "pattern").filter((p) => p !== "solid" && p !== "printed");
  const head = [and(colours), v(spec, "fabric"), and(pattern.map((p) => p.toLowerCase())), garmentName(spec)].filter(Boolean).join(" ");
  const parts = [
    v(spec, "neckline.shape") && `${v(spec, "neckline.depth") ? `${v(spec, "neckline.depth")} ` : ""}${v(spec, "neckline.shape")} neckline`,
    (v(spec, "sleeve.length") || v(spec, "sleeve.style")) && `${[v(spec, "sleeve.length"), v(spec, "sleeve.style")].filter(Boolean).join(" ")} sleeves`.replace("sleeveless sleeves", "sleeveless"),
    v(spec, "sleeve.fit") && `${v(spec, "sleeve.fit")} sleeves`,
    v(spec, "bodice.fit") && `${v(spec, "bodice.fit")} fit`,
    v(spec, "garment.length") && `${v(spec, "garment.length")} length`,
    v(spec, "lower.silhouette") && `${v(spec, "lower.silhouette")} silhouette`,
    v(spec, "lower.fit") && `${v(spec, "lower.fit")} through the hips`,
    many(spec, "embellishment").length > 0 && `${and(many(spec, "embellishment"))} work`,
    many(spec, "components").length > 0 && `worn as a set with ${and(many(spec, "components"))}`,
    ...(spec.notes ?? []).filter((n) => !/ print$/i.test(n)),
  ].filter(Boolean);
  const without = spec.excluded.map((e) => e.value);
  return [`a ${head}`, parts.length ? `with ${and(parts as string[])}` : "", without.length ? `and no ${and(without)}` : ""].filter(Boolean).join(", ");
}

export function avatarPrompt(spec: Spec): string {
  const who = MODEL[wearerOf(spec)] ?? MODEL.anyone;
  const age = AGE[v(spec, "age")] ?? "";
  const occasion = and(many(spec, "occasion"));
  return [
    `Full-length fashion editorial photograph of ${age.startsWith("a ") ? age : who}${age && !age.startsWith("a ") ? ` ${age}` : ""}, standing, the whole outfit visible from head to toe.`,
    `The model wears ${outfitWords(spec)}.`,
    occasion ? `Styled for ${occasion}.` : "",
    "The garment is the subject: render its colour, fabric, cut and every listed detail exactly, with simple neutral accessories that do not compete.",
    "Seamless warm light-grey studio backdrop, soft diffused key light, gentle shadow, 85mm lens, sharp focus, high-end magazine quality.",
    "A generic model, not a real or famous person. No text, no logos other than the described print, no watermark.",
  ].filter(Boolean).join(" ");
}

/** The open image model, used when the main one is not available: a plain image URL, steady per design. */
export function openImageUrl(prompt: string, seed: number): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=832&height=1248&nologo=true&model=flux&seed=${seed}`;
}

/** A small steady number from text, so the same design keeps the same model between redraws. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 1_000_000;
}
