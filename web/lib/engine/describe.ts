// Human-facing text: the assistant's reply, the tailor sheet lines, and search links.
import { ONTO, hindi } from "./lexicon.ts";
import { depthInches, easeInches } from "./spec.ts";
import type { Spec, Value } from "./spec.ts";

const TAG_OF: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", "sleeve.length": "LENGTH", "garment.length": "LENGTH",
  "bodice.fit": "FIT", "lower.fit": "FIT", "sleeve.fit": "FIT", "lower.silhouette": "SILHOUETTE", "neckline.depth": "DIM", "back.depth": "DIM",
  "neckline.width": "DIM", colour: "COLOUR", shade: "SHADE", fabric: "FABRIC", pattern: "PATTERN", embellishment: "EMBELL", occasion: "OCCASION", style: "STYLE",
};
const NICE: Record<string, string> = { v: "V", "a-line": "A-line", "three-quarter": "three-quarter", "co-ord set": "co-ord set" };
const nice = (v: string) => NICE[v] ?? v;
const soft = (v?: Value) => (v?.intensity === "slight" ? "slightly " : v?.intensity === "strong" ? "very " : "");

export function phrase(spec: Spec): string {
  const s = spec.slots, l = spec.lists;
  const bits: string[] = [];
  const colour = [l.shade?.[0]?.value, ...(l.colour ?? []).map((c) => c.value)].filter(Boolean).join(" ");
  const g = s.garment ? nice(s.garment.value) : "garment";
  bits.push([colour, s["lower.silhouette"] ? nice(s["lower.silhouette"].value) : "", s.fabric ? s.fabric.value : "", g].filter(Boolean).join(" "));
  if (s["bodice.fit"]) bits.push(`${soft(s["bodice.fit"])}${s["bodice.fit"].value} at the bust and waist`);
  if (s["lower.fit"]) bits.push(`${soft(s["lower.fit"])}${s["lower.fit"].value} below the waist`);
  if (s["neckline.shape"] || s["neckline.depth"]) {
    const d = s["neckline.depth"] ? depthInches(s["neckline.depth"]) : undefined;
    bits.push(`${s["neckline.shape"] ? nice(s["neckline.shape"].value) + " neckline" : "neckline"}${d ? `, about ${d} in deep` : ""}`);
  }
  if (s["sleeve.style"] || s["sleeve.length"]) bits.push([s["sleeve.length"]?.value, s["sleeve.style"]?.value, "sleeves"].filter(Boolean).join(" "));
  if (s["garment.length"]) bits.push(`${s["garment.length"].inches ? s["garment.length"].value : s["garment.length"].value + " length"}`);
  if (l.embellishment?.length) bits.push(l.embellishment.map((e) => e.value).join(" and "));
  if (l.occasion?.length) bits.push(`for ${l.occasion.map((o) => o.value).join(", ")}`);
  const not = spec.excluded.map((e) => e.value);
  return bits.filter(Boolean).join(", ") + (not.length ? `; no ${not.join(", no ")}` : "");
}

export interface SheetLine { part: string; en: string; hi: string; from: string }
export interface Measurements { bust?: number; waist?: number; hip?: number; shoulder?: number; length?: number; sleeve?: number }

export function sheetLines(spec: Spec, m: Measurements = {}): SheetLine[] {
  const s = spec.slots, l = spec.lists, out: SheetLine[] = [];
  const SAID: Record<string, string> = { words: "said", note: "board note", image: "pictures", answer: "answered", edit: "edited", profile: "profile" };
  const from = (...vs: (Value | undefined)[]) => [...new Set(vs.filter(Boolean).map((v) => (v!.src === "words" || v!.src === "note" ? `${SAID[v!.src]} “${v!.evidence}”` : SAID[v!.src] ?? v!.src)))].join("; ");
  const hv = (slot: string, v?: Value) => (v ? hindi(TAG_OF[slot], v.value) : "");
  if (s["neckline.shape"] || s["neckline.depth"]) {
    const d = s["neckline.depth"] ? depthInches(s["neckline.depth"]) : undefined;
    out.push({ part: "Neckline", en: [s["neckline.shape"] ? nice(s["neckline.shape"].value) : "", d ? `front depth ${d} in from the high shoulder point` : ""].filter(Boolean).join(", "),
      hi: [hv("neckline.shape", s["neckline.shape"]), d ? `आगे से ${d} इंच गहरा` : ""].filter(Boolean).join(", "), from: from(s["neckline.shape"], s["neckline.depth"]) });
  }
  if (s["back.depth"]) out.push({ part: "Back neck", en: `${soft(s["back.depth"])}${s["back.depth"].value}`, hi: `पीछे का गला ${hv("back.depth", s["back.depth"])}`, from: from(s["back.depth"]) });
  if (s["sleeve.style"] || s["sleeve.length"] || s["sleeve.fit"])
    out.push({ part: "Sleeve", en: [s["sleeve.length"]?.value, s["sleeve.style"]?.value, s["sleeve.fit"]?.value].filter(Boolean).join(", "),
      hi: [hv("sleeve.length", s["sleeve.length"]), hv("sleeve.style", s["sleeve.style"]), hv("sleeve.fit", s["sleeve.fit"])].filter(Boolean).join(", "), from: from(s["sleeve.length"], s["sleeve.style"]) });
  if (s["bodice.fit"]) {
    const e = easeInches(s["bodice.fit"].value, s["bodice.fit"].intensity);
    out.push({ part: "Bodice", en: `${soft(s["bodice.fit"])}${s["bodice.fit"].value}${e ? `, ${e} in ease at bust and waist` : ""}`,
      hi: `${hv("bodice.fit", s["bodice.fit"])}${e ? `, छाती और कमर पर ${e} इंच ढील` : ""}`, from: from(s["bodice.fit"]) });
  }
  if (s["lower.fit"] || s["lower.silhouette"]) {
    const e = s["lower.fit"] ? easeInches(s["lower.fit"].value, s["lower.fit"].intensity) : undefined;
    out.push({ part: "Lower body", en: [s["lower.silhouette"] ? nice(s["lower.silhouette"].value) : "", s["lower.fit"] ? `${soft(s["lower.fit"])}${s["lower.fit"].value}` : "", e ? `${e} in ease at hip` : ""].filter(Boolean).join(", "),
      hi: [hv("lower.silhouette", s["lower.silhouette"]), hv("lower.fit", s["lower.fit"]), e ? `कूल्हे पर ${e} इंच ढील` : ""].filter(Boolean).join(", "), from: from(s["lower.silhouette"], s["lower.fit"]) });
  }
  if (s["garment.length"] || m.length)
    out.push({ part: "Length", en: m.length ? `${m.length} in` : s["garment.length"]!.value, hi: m.length ? `${m.length} इंच` : hv("garment.length", s["garment.length"]), from: from(s["garment.length"]) || "measurements" });
  if (s.fabric) out.push({ part: "Fabric", en: s.fabric.value, hi: hv("fabric", s.fabric), from: from(s.fabric) });
  const colour = [...(l.shade ?? []), ...(l.colour ?? [])];
  if (colour.length) out.push({ part: "Colour", en: colour.map((c) => c.value).join(" "), hi: colour.map((c) => hindi(c === l.shade?.[0] ? "SHADE" : "COLOUR", c.value)).join(" "), from: from(...colour) });
  if (l.embellishment?.length || l.pattern?.length)
    out.push({ part: "Finish", en: [...(l.pattern ?? []), ...(l.embellishment ?? [])].map((v) => v.value).join(", "),
      hi: [...(l.pattern ?? []).map((v) => hindi("PATTERN", v.value)), ...(l.embellishment ?? []).map((v) => hindi("EMBELL", v.value))].join(", "), from: from(...(l.embellishment ?? [])) });
  if (spec.excluded.length)
    out.push({ part: "Avoid", en: spec.excluded.map((e) => e.value).join(", "), hi: spec.excluded.map((e) => `${hindi(TAG_OF[e.slot] ?? "", e.value)} नहीं`).join(", "), from: spec.excluded.map((e) => `“${e.evidence}”`).join("; ") });
  return out;
}

export function finished(spec: Spec, m: Measurements) {
  const be = easeInches(spec.slots["bodice.fit"]?.value, spec.slots["bodice.fit"]?.intensity) ?? 2.5;
  const he = easeInches(spec.slots["lower.fit"]?.value, spec.slots["lower.fit"]?.intensity) ?? be;
  return { bust: m.bust ? m.bust + be : undefined, waist: m.waist ? m.waist + be : undefined, hip: m.hip ? m.hip + he : undefined };
}

// ----------------------------------------------------------------- search links (deep links only: no scraping, nothing stored)
export function query(spec: Spec, opts: { withParts?: boolean } = {}): string {
  const s = spec.slots, l = spec.lists;
  const words = [
    ...(l.shade ?? []).slice(0, 1).map((v) => v.value), ...(l.colour ?? []).slice(0, 1).map((v) => v.value),
    s["lower.silhouette"] && s["lower.silhouette"].value !== "anarkali" ? nice(s["lower.silhouette"].value) : "",
    s.fabric?.value, ...(l.embellishment ?? []).slice(0, 1).map((v) => v.value), s.garment ? nice(s.garment.value) : "outfit",
  ];
  if (opts.withParts) {
    if (s["neckline.shape"]) words.push(`${nice(s["neckline.shape"].value)} neck`);
    if (s["sleeve.style"]) words.push(`${s["sleeve.style"].value} sleeves`);
  }
  return words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function links(spec: Spec) {
  const q = query(spec), qp = query(spec, { withParts: true });
  const e = encodeURIComponent;
  const ideas = [qp, `${q} design`, ...(spec.lists.occasion ?? []).map((o) => `${q} for ${o.value}`),
    spec.slots["neckline.shape"] ? `${nice(spec.slots["neckline.shape"].value)} neck ${spec.slots.garment?.value ?? ""} designs` : "",
    spec.slots["sleeve.style"] ? `${spec.slots["sleeve.style"].value} sleeves ${spec.slots.garment?.value ?? ""}` : "",
    spec.lists.embellishment?.[0] ? `${spec.lists.embellishment[0].value} work ideas` : ""].filter(Boolean);
  return {
    pinterest: [...new Set(ideas)].slice(0, 6).map((t) => ({ label: t, url: `https://www.pinterest.com/search/pins/?q=${e(t)}` })),
    shops: [
      { label: "Myntra", url: `https://www.myntra.com/${e(q.replace(/\s+/g, "-"))}?rawQuery=${e(q)}` },
      { label: "Ajio", url: `https://www.ajio.com/search/?text=${e(q)}` },
      { label: "Amazon", url: `https://www.amazon.in/s?k=${e(q)}` },
      { label: "Flipkart", url: `https://www.flipkart.com/search?q=${e(q)}` },
      { label: "Nykaa Fashion", url: `https://www.nykaafashion.com/catalogsearch/result/?q=${e(q)}` },
    ],
    fabric: spec.slots.fabric ? [
      { label: `${spec.lists.colour?.[0]?.value ?? ""} ${spec.slots.fabric.value} fabric`.trim(), url: `https://www.amazon.in/s?k=${e(`${spec.lists.colour?.[0]?.value ?? ""} ${spec.slots.fabric.value} fabric by the metre`)}` },
    ] : [],
    tailors: { label: "Tailors near you", url: `https://www.google.com/maps/search/${e("boutique tailor near me")}` },
  };
}

export const slotsMeta = ONTO.slots;
