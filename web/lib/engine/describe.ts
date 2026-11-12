// Human-facing text: the assistant's reply, the tailor sheet lines, and search links.
import { ONTO, hindi } from "./lexicon.ts";
import { depthInches, easeInches, familyOf, garmentName, impliedWearer, seasonOf, wearerOf } from "./spec.ts";
import type { Spec, Value } from "./spec.ts";

const TAG_OF: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", "sleeve.length": "LENGTH", "garment.length": "LENGTH",
  "bodice.fit": "FIT", "lower.fit": "FIT", "sleeve.fit": "FIT", "lower.silhouette": "SILHOUETTE", "neckline.depth": "DIM", "back.depth": "DIM",
  "neckline.width": "DIM", colour: "COLOUR", shade: "SHADE", fabric: "FABRIC", pattern: "PATTERN", embellishment: "EMBELL", occasion: "OCCASION", style: "STYLE",
};
const NICE: Record<string, string> = { v: "V", "deep v": "deep V", u: "U", "a-line": "A-line", trousers: "pants", "wide-leg": "wide-leg", crew: "crew", turtle: "turtle" };
const nice = (v: string) => NICE[v] ?? v;
const soft = (v?: Value) => (v?.intensity === "slight" ? "slightly " : v?.intensity === "strong" ? "very " : "");

const FOR: Record<string, string> = { winter: "for the cold", summer: "for the heat", monsoon: "for the rains", gym: "for workouts", lounge: "for home",
  travel: "for travel", casual: "for everyday wear", office: "for work", festive: "for the festivities" };
const an = (w: string) => (/^[aeiou]/i.test(w) && !/^(one|uni)/i.test(w) ? "an" : "a");

/** The design in one sentence, as an atelier would read it back. */
export function phrase(spec: Spec): string {
  const s = spec.slots, l = spec.lists;
  if (!s.garment) return "";
  const colours = (l.colour ?? []).map((c) => c.value);
  const shade = l.shade?.[0]?.value;
  const colour = colours.length ? `${shade ? shade + " " : ""}${colours.join(" and ")}` : "";
  const fam = familyOf(s.garment.value);
  const sil = s["lower.silhouette"] && fam !== "bottom" && fam !== "set" ? nice(s["lower.silhouette"].value) : "";
  const head = [colour, s.fabric?.value, sil, nice(garmentName(spec))].filter(Boolean).join(" ");
  const parts: string[] = [];
  const comps = (l.components ?? []).map((c) => nice(c.value));
  if (comps.length) parts.push(`${an(comps[0])} ${comps.join(" with ")}`);
  if (s["bodice.fit"]) parts.push(`${soft(s["bodice.fit"])}${s["bodice.fit"].value === "loose" && fam !== "top_long" ? "oversized" : s["bodice.fit"].value}${fam === "top_long" || fam === "top_short" ? " at the bust and waist" : ""}`);
  if (s["lower.fit"]) parts.push(`${soft(s["lower.fit"])}${s["lower.fit"].value} below the waist`);
  if (s["lower.silhouette"] && !sil) parts.push(`${nice(s["lower.silhouette"].value)} ${comps.length || fam === "set" ? "bottoms" : "cut"}`);
  if (s["neckline.shape"] || s["neckline.depth"]) {
    const d = s["neckline.depth"] ? depthInches(s["neckline.depth"]) : undefined;
    const NOUN: Record<string, string> = { mandarin: "mandarin collar", collar: "collar", hooded: "hood", turtle: "turtle neck", crew: "crew neck", high: "high neck", cowl: "cowl neck" };
    const shape = s["neckline.shape"]?.value;
    const noun = shape ? NOUN[shape] ?? `${nice(shape)} neckline` : "a neckline";
    parts.push(`${shape ? `${an(noun)} ${noun}` : noun}${d ? ` about ${d} in deep` : ""}`);
  }
  if (s["sleeve.style"] || s["sleeve.length"]) parts.push([s["sleeve.length"]?.value, s["sleeve.style"]?.value, "sleeves"].filter(Boolean).join(" "));
  if (s["garment.length"]) parts.push(s["garment.length"].inches ? `${s["garment.length"].value} long` : `${s["garment.length"].value} length`);
  const finish = [...(l.pattern ?? []), ...(l.embellishment ?? [])].map((v) => v.value);
  if (finish.length) parts.push(finish.join(" and "));
  const occ = (l.occasion ?? []).map((o) => FOR[o.value] ?? `for ${an(o.value)} ${o.value}`);
  if (occ.length) parts.push(occ.join(" and "));
  const not = spec.excluded.filter((e) => e.slot !== "garment").map((e) => e.value);
  const text = `${an(head)} ${head}${parts.length ? (comps.length ? ": " : ", ") + parts.join(", ") : ""}`;
  return text + (not.length ? `; no ${not.join(", no ")}` : "");
}

/** One line of advice when the design implies something the customer may not have thought of. */
export function advice(spec: Spec): string {
  const season = seasonOf(spec);
  if (season === "winter" && !spec.slots.fabric) return "For the cold, brushed fleece or a heavy cotton terry keeps you warm without bulk; wool is warmest but needs care.";
  if (season === "summer" && !spec.slots.fabric) return "For the heat, cotton, linen or mulmul breathe best.";
  if (spec.slots["neckline.depth"] && !spec.slots["neckline.depth"].inches) return "The neckline depth is a starting point; your tailor will confirm it at the trial.";
  return "";
}

const AGE_EN: Record<string, string> = { "20s": " in their 20s", "30s": " in their 30s", "40s": " in their 40s", "50+": ", 50 or over" };
const AGE_HI: Record<string, string> = { kid: "बच्चा", teen: "किशोर", "20s": "20 से 29 साल", "30s": "30 से 39 साल", "40s": "40 से 49 साल", "50+": "50 साल से ऊपर" };
const PERSON: Record<string, Record<string, string>> = {
  men: { kid: "a boy", teen: "a teenage boy", adult: "a man" },
  women: { kid: "a girl", teen: "a teenage girl", adult: "a woman" },
  anyone: { kid: "a child", teen: "a teenager", adult: "someone" },
};

/** Who wears it, in a few words: "a man in their 20s", "a woman", "a child". Null when nothing was said. */
export function wearerText(spec: Spec): { en: string; hi: string } | null {
  const w = spec.slots.wearer?.value, age = spec.slots.age?.value;
  if (!w && !age) return null;
  const who = PERSON[w ?? "anyone"] ?? PERSON.anyone;
  const en = age === "kid" || age === "teen" ? who[age] : `${who.adult}${age ? AGE_EN[age] ?? "" : ""}`;
  const hiWho = w === "men" ? "पुरुष" : w === "women" ? "महिला" : "";
  const hi = [hiWho, age ? AGE_HI[age] : ""].filter(Boolean).join(", ") || "कोई भी";
  return { en, hi };
}

export interface SheetLine { part: string; hiPart?: string; en: string; hi: string; from: string }
export const PART_HI: Record<string, string> = { Garment: "पोशाक", "Neck depth": "गले की गहराई", "Sleeve length": "आस्तीन की लंबाई", Fit: "फ़िटिंग", Silhouette: "आकार", Print: "छपाई", Pieces: "हिस्से", Neckline: "गला", "Back neck": "पीछे का गला", Sleeve: "आस्तीन", Bodice: "ऊपरी भाग",
  "Lower body": "निचला भाग", Length: "लंबाई", Fabric: "कपड़ा", Colour: "रंग", Finish: "सजावट", Avoid: "नहीं चाहिए", Notes: "टिप्पणी", Wearer: "किसके लिए" };
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
  if (l.components?.length) out.unshift({ part: "Pieces", en: l.components.map((c) => nice(c.value)).join(" and "), hi: l.components.map((c) => hindi("GARMENT", c.value)).join(" और "), from: from(...l.components) });
  if (s.fabric) out.push({ part: "Fabric", en: s.fabric.value, hi: hv("fabric", s.fabric), from: from(s.fabric) });
  const colour = [...(l.shade ?? []), ...(l.colour ?? [])];
  if (colour.length) out.push({ part: "Colour", en: colour.map((c) => c.value).join(" "), hi: colour.map((c) => hindi(c === l.shade?.[0] ? "SHADE" : "COLOUR", c.value)).join(" "), from: from(...colour) });
  if (l.embellishment?.length || l.pattern?.length)
    out.push({ part: "Finish", en: [...(l.pattern ?? []), ...(l.embellishment ?? [])].map((v) => v.value).join(", "),
      hi: [...(l.pattern ?? []).map((v) => hindi("PATTERN", v.value)), ...(l.embellishment ?? []).map((v) => hindi("EMBELL", v.value))].join(", "), from: from(...(l.embellishment ?? [])) });
  if (spec.excluded.length)
    out.push({ part: "Avoid", en: spec.excluded.map((e) => e.value).join(", "), hi: spec.excluded.map((e) => `${hindi(TAG_OF[e.slot] ?? "", e.value)} नहीं`).join(", "), from: spec.excluded.map((e) => `“${e.evidence}”`).join("; ") });
  if (spec.notes?.length) out.push({ part: "Notes", en: spec.notes.join("; "), hi: spec.notes.join("; "), from: "details in the customer's words" });
  const who = wearerText(spec);
  if (who) out.unshift({ part: "Wearer", en: who.en, hi: who.hi, from: from(spec.slots.wearer, spec.slots.age) || "the garment" });
  return out.map((l) => ({ ...l, hiPart: PART_HI[l.part] ?? l.part }));
}

export function finished(spec: Spec, m: Measurements) {
  const be = easeInches(spec.slots["bodice.fit"]?.value, spec.slots["bodice.fit"]?.intensity) ?? 2.5;
  const he = easeInches(spec.slots["lower.fit"]?.value, spec.slots["lower.fit"]?.intensity) ?? be;
  return { bust: m.bust ? m.bust + be : undefined, waist: m.waist ? m.waist + be : undefined, hip: m.hip ? m.hip + he : undefined };
}

// ----------------------------------------------------------------- search links (deep links only: no scraping, nothing stored)
// Who the design is for decides every search: the word in the query and each shop's own gender filter, so a
// design for a 20-year-old man never opens women's or kids' results.
export interface Audience { who: "men" | "women" | "anyone"; kid: boolean; word: string }

export function audience(spec: Spec): Audience {
  const who = wearerOf(spec);
  const kid = spec.slots.age?.value === "kid";
  const word = kid ? (who === "men" ? "boys" : who === "women" ? "girls" : "kids") : who === "anyone" ? "" : who;
  return { who, kid, word };
}

// shop vocabulary for the occasion and style; seasons and moods with no shop word are left out
const OCCASION_WORD: Record<string, string> = { wedding: "wedding", sangeet: "party", mehendi: "festive", reception: "party", festive: "festive",
  party: "party", office: "office", casual: "casual", winter: "winter", summer: "summer", gym: "sports", lounge: "lounge" };
const STYLE_WORD: Record<string, string> = { traditional: "ethnic", "indo-western": "indo western", western: "western", minimal: "solid", boho: "boho",
  vintage: "vintage", streetwear: "oversized", sporty: "sports", korean: "korean", "old money": "classic" };

export function query(spec: Spec, opts: { withParts?: boolean } = {}): string {
  const s = spec.slots, l = spec.lists;
  const a = audience(spec);
  const occ = (l.occasion ?? []).map((o) => OCCASION_WORD[o.value]).find(Boolean) ?? "";
  // an older wearer with no stated mood gets classic cuts rather than trend pieces
  const mood = (l.style ?? []).map((v) => STYLE_WORD[v.value]).find(Boolean) ?? (s.age?.value === "50+" ? "classic" : "");
  const words = [
    // "kurti" already says women; a kurta for a man still needs "men"
    a.kid || impliedWearer(s.garment?.value) !== a.who ? a.word : "",
    ...(l.shade ?? []).slice(0, 1).map((v) => v.value), ...(l.colour ?? []).slice(0, 1).map((v) => v.value),
    s["lower.silhouette"] && s["lower.silhouette"].value !== "anarkali" ? nice(s["lower.silhouette"].value) : "",
    s.fabric?.value, occ === "winter" ? "" : occ, mood, ...(l.embellishment ?? []).slice(0, 1).map((v) => v.value),
    ...(l.components ?? []).map((c) => nice(c.value)), s.garment ? nice(garmentName(spec)) : "outfit", occ === "winter" ? "winter" : "",
  ];
  if (opts.withParts) {
    if (s["neckline.shape"]) words.push(`${nice(s["neckline.shape"].value)} neck`);
    if (s["sleeve.style"]) words.push(`${s["sleeve.style"].value} sleeves`);
  }
  return [...new Set(words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().split(" "))].join(" ");
}

const BUDGET_PAISE: Record<string, string> = { "under 1000": "0-100000", "1000-3000": "100000-300000", "3000-8000": "300000-800000", "8000+": "800000-" };

/** Each shop's search, narrowed with its own gender filter where it has one. */
export function shopLinks(spec: Spec, q = query(spec)) {
  const e = encodeURIComponent;
  const a = audience(spec);
  const g = a.kid ? (a.who === "men" ? "boys" : a.who === "women" ? "girls" : "") : a.who === "anyone" ? "" : a.who;
  const cap = g ? g[0].toUpperCase() + g.slice(1) : "";
  const myntra = g ? `&f=${e(`Gender:${g}`)}` : "";
  const ajio = g ? `query=${e(`:relevance:genderfilter:${cap}`)}&` : "";
  const flipkart = g ? `&p%5B%5D=${e(`facets.ideal_for%5B%5D=${cap}`)}` : "";
  const price = spec.slots.budget ? BUDGET_PAISE[spec.slots.budget.value] : "";
  const amazon = `&i=apparel${price ? `&rh=${e(`p_36:${price}`)}` : ""}`;
  return [
    { label: "Myntra", domain: "myntra.com", url: `https://www.myntra.com/${e(q.replace(/\s+/g, "-"))}?rawQuery=${e(q)}${myntra}`, filtered: !!g },
    { label: "Ajio", domain: "ajio.com", url: `https://www.ajio.com/search/?${ajio}text=${e(q)}`, filtered: !!g },
    { label: "Amazon", domain: "amazon.in", url: `https://www.amazon.in/s?k=${e(q)}${amazon}`, filtered: false },
    { label: "Flipkart", domain: "flipkart.com", url: `https://www.flipkart.com/search?q=${e(q)}${flipkart}`, filtered: !!g },
    { label: "Nykaa Fashion", domain: "nykaafashion.com", url: `https://www.nykaafashion.com/catalogsearch/result/?q=${e(q)}`, filtered: false },
  ];
}

export function links(spec: Spec) {
  const q = query(spec), qp = query(spec, { withParts: true });
  const e = encodeURIComponent;
  const ideas = [qp, `${q} design`, ...(spec.lists.occasion ?? []).map((o) => `${q} for ${o.value}`),
    spec.slots["neckline.shape"] ? `${nice(spec.slots["neckline.shape"].value)} neck ${spec.slots.garment?.value ?? ""} designs` : "",
    spec.slots["sleeve.style"] ? `${spec.slots["sleeve.style"].value} sleeves ${spec.slots.garment?.value ?? ""}` : "",
    spec.lists.embellishment?.[0] ? `${spec.lists.embellishment[0].value} work ideas` : ""].filter(Boolean);
  return {
    query: q,
    pinterest: [...new Set(ideas)].slice(0, 6).map((t) => ({ label: t, url: `https://www.pinterest.com/search/pins/?q=${e(t)}` })),
    shops: shopLinks(spec, q),
    fabric: spec.slots.fabric ? [
      { label: `${spec.lists.colour?.[0]?.value ?? ""} ${spec.slots.fabric.value} fabric`.trim(), url: `https://www.amazon.in/s?k=${e(`${spec.lists.colour?.[0]?.value ?? ""} ${spec.slots.fabric.value} fabric by the metre`)}` },
    ] : [],
    tailors: { label: "Tailors near you", url: `https://www.google.com/maps/search/${e("boutique tailor near me")}` },
  };
}

export const slotsMeta = ONTO.slots;

// ------------------------------------------------------------------ palette
export const SWATCH: Record<string, string> = {
  black: "#000000", white: "#ffffff", ivory: "#f3eee2", beige: "#d8c6a6", brown: "#7a5232", grey: "#9b9b9b", silver: "#c4c4c8", gold: "#c9a227",
  red: "#c8102e", maroon: "#6e1c2a", pink: "#e98aa8", peach: "#f5b69a", orange: "#e5762c", mustard: "#d1a013", yellow: "#f2cc45",
  mint: "#a9e3c8", green: "#2f7d4f", olive: "#6f7f35", teal: "#1a8a8e", "powder blue": "#b6d3ef", blue: "#2c6bd2", navy: "#1e2a46",
  lavender: "#c7b5e3", purple: "#6a3d9e",
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** The named colour nearest to a picked shade (weighted RGB distance). */
export function nearestColour(hex: string): string {
  const [r, g, b] = rgb(hex);
  let best = "black", d = Infinity;
  for (const [name, h] of Object.entries(SWATCH)) {
    const [R, G, B] = rgb(h);
    const dist = 2 * (r - R) ** 2 + 4 * (g - G) ** 2 + 3 * (b - B) ** 2;
    if (dist < d) { d = dist; best = name; }
  }
  return best;
}
