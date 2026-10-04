// Binding (spans -> updates), state tracking (fold of updates) and the question policy.
import { ONTO, groundFuzzy, tokenize } from "./lexicon.ts";
import type { Span } from "./lexicon.ts";

export type Source = "words" | "note" | "image" | "profile" | "answer" | "edit" | "model";
export interface Value { value: string; p: number; src: Source; evidence: string; inches?: number; intensity?: string }
export interface Update { op: "set" | "exclude" | "add" | "replace" | "compare" | "note"; slot: string; value: Value; ref?: string; cmp?: string }
export interface Spec {
  version: number;
  slots: Record<string, Value>;
  lists: Record<string, Value[]>;           // colour, embellishment, style, pattern, occasion, shade, components
  excluded: { slot: string; value: string; evidence: string }[];
  comparisons: { slot: string; cmp: string; ref: string; evidence: string }[];
  notes?: string[];                          // details outside the ontology, kept verbatim for the tailor
  history: Update[];
}
export interface Question { slot: string; text: string; options: string[]; labels?: Record<string, string>; cost: number }

export const emptySpec = (): Spec => ({ version: 0, slots: {}, lists: {}, excluded: [], comparisons: [], notes: [], history: [] });

export const LIST_SLOTS = new Set(["colour", "embellishment", "style", "pattern", "occasion", "shade", "components"]);
const CLAUSE_BREAK = new Set([",", ".", ";", "!", "?", "and", "but", "aur", "par", "lekin", "with", "magar", "&", "|"]);
const SLEEVE_LENGTHS = new Set(ONTO.sleeve_length_order as string[]);
const PRIORITY: Record<string, number> = { edit: 6, answer: 5, words: 4, model: 4, note: 3, image: 2, profile: 1 };
const SET_GARMENTS = new Set(ONTO.garment_family.set as string[]);

export function familyOf(garment?: string): string | null {
  if (!garment) return null;
  for (const [f, list] of Object.entries<string[]>(ONTO.garment_family)) if (list.includes(garment)) return f;
  return null;
}

type Ctx = "neckline" | "sleeve" | "bodice" | "lower" | "back" | "length" | "slit" | "hem" | null;

function partCtx(s: Span): Ctx {
  if (s.tag === "NECKLINE") return "neckline";
  if (s.tag === "SLEEVE") return "sleeve";
  if (s.tag === "LOC") return s.value === "lower" ? "lower" : s.value === "back" ? "back" : s.value === "upper" ? "bodice" : "neckline";
  if (s.tag === "GARMENT") return familyOf(s.value) === "bottom" ? "lower" : null;
  if (s.tag !== "PART") return null;
  const m: Record<string, Ctx> = { neckline: "neckline", back: "back", sleeve: "sleeve", bodice: "bodice", waist: "bodice", shoulder: "sleeve",
    hip: "lower", lower: "lower", hem: "hem", yoke: "bodice", slit: "slit", length: "length" };
  return m[s.value] ?? null;
}

function num(tokens: string[], s: Span): number | undefined {
  const v = parseFloat(tokens[s.start]);
  if (isNaN(v)) return undefined;
  return tokens[s.start + 1]?.startsWith("c") ? Math.round((v / 2.54) * 4) / 4 : v;
}

/** Several garments in one request: a set word names the set, otherwise a top and a bottom make one. */
function garmentUpdates(garments: Span[], tokens: string[], src: Source, p: number): Update[] {
  const ev = (s: Span) => tokens.slice(s.start, s.end).join(" ");
  const mk = (op: Update["op"], slot: string, value: string, s: Span): Update => ({ op, slot, value: { value, p, src, evidence: ev(s) } });
  if (garments.length === 1) return [mk("set", "garment", garments[0].value, garments[0])];
  const set = garments.find((g) => SET_GARMENTS.has(g.value) || g.value === "kurta set" || g.value === "salwar suit");
  const parts = garments.filter((g) => g !== set);
  const fams = new Set(parts.map((g) => familyOf(g.value)));
  const hasTop = [...fams].some((f) => f && f !== "bottom" && f !== "outer" && f !== "drape");
  const hasBottom = fams.has("bottom");
  const out: Update[] = [];
  if (set) out.push(mk("set", "garment", set.value, set));
  else if (hasTop && hasBottom) {
    const indian = parts.some((g) => ["kurti", "anarkali", "kurta set"].includes(g.value)) && parts.some((g) => ["palazzo", "churidar", "sharara", "dhoti pants", "trousers"].includes(g.value));
    out.push({ op: "set", slot: "garment", value: { value: indian ? "kurta set" : "co-ord set", p: p * 0.9, src, evidence: parts.map(ev).join(" + ") } });
  } else out.push(mk("set", "garment", parts[0].value, parts[0]));
  const main = out[0].value.value;
  for (const g of parts) if (g.value !== main) out.push(mk("add", "components", g.value, g));
  return out;
}

/** Turn tagged spans into updates. Clauses are cut at punctuation and conjunctions; inside a clause,
 *  values bind to the nearest part cue; intensity and negation bind to the nearest value. */
export function bind(tokens: string[], spans: Span[], src: Source, p = 0.9): Update[] {
  // ground spans the tagger found but the gazetteer cannot name (typos, new spellings)
  for (const s of spans) {
    if (!s.value && s.tag !== "NUM") {
      const g = groundFuzzy(tokens.slice(s.start, s.end).join(" "), s.tag);
      if (g) s.value = g.value;
    }
  }
  const clauses: Span[][] = [[]];
  let cut = 0;
  const breaks = tokens.map((t) => CLAUSE_BREAK.has(t));
  for (const s of spans) {
    while (cut < s.start) { if (breaks[cut]) clauses.push([]); cut++; }
    clauses[clauses.length - 1].push(s);
  }
  const out: Update[] = [];
  const negatedGarments = new Set<Span>();
  let lastCtx: Ctx = null;
  for (const cl of clauses) {
    const ctxSpan = cl.find((s) => s.tag === "PART" || s.tag === "LOC") ?? cl.find((s) => partCtx(s) !== null);
    let ctx: Ctx = ctxSpan ? partCtx(ctxSpan) : null;
    const values = cl.filter((s) => !["PART", "LOC", "INT", "NEG", "CMP", "REF"].includes(s.tag) && (s.value || s.tag === "NUM"));
    const intensity = new Map<Span, string>();
    const negated = new Set<Span>();
    for (const s of cl) {
      if (s.tag === "INT" || s.tag === "NEG") {
        const after = values.find((v) => v.start >= s.end && v.start - s.end <= 2);
        const before = [...values].reverse().find((v) => v.end <= s.start && s.start - v.end <= 3);
        const target = after ?? before;
        // "not too flashy" rules flashy out; "not too deep" only softens the depth
        const softNot = s.tag === "INT" && tokens[s.start] === "not" && target?.tag === "STYLE";
        if (target) (s.tag === "INT" && !softNot) ? intensity.set(target, s.value) : negated.add(target);
      }
    }
    const ev = (s: Span) => tokens.slice(s.start, s.end).join(" ");
    const mk = (slot: string, s: Span, extra: Partial<Value> = {}): Update => ({
      op: negated.has(s) ? "exclude" : LIST_SLOTS.has(slot) ? "add" : "set",
      slot, value: { value: s.value, p, src, evidence: ev(s), intensity: intensity.get(s), ...extra },
    });
    for (const s of values) {
      switch (s.tag) {
        case "GARMENT": if (negated.has(s)) negatedGarments.add(s); break;
        case "NECKLINE":
          if (s.value === "deep v") { out.push(mk("neckline.shape", { ...s, value: "v" })); out.push(mk("neckline.depth", { ...s, value: "deep" })); }
          else out.push(mk("neckline.shape", s));
          ctx = "neckline"; break;
        case "SLEEVE": out.push(mk("sleeve.style", s)); ctx = "sleeve"; break;
        case "FIT": {
          const slot = ctx === "sleeve" ? "sleeve.fit" : ctx === "lower" || ctx === "hem" ? "lower.fit" : "bodice.fit";
          out.push(mk(slot, s)); break;
        }
        case "SILHOUETTE": out.push(mk("lower.silhouette", s)); break;
        case "LENGTH": {
          const sleeve = ctx === "sleeve" || (SLEEVE_LENGTHS.has(s.value) && s.value !== "short");
          if (sleeve) out.push(mk("sleeve.length", { ...s, value: s.value === "ankle" ? "full" : s.value }));
          else out.push(mk("garment.length", s));
          break;
        }
        case "DIM": {
          const part = ctx === "back" || (ctx === null && lastCtx === "back") ? "back" : "neckline";
          const attr = s.value === "wide" || s.value === "narrow" ? "width" : "depth";
          out.push(mk(`${part}.${attr}`, s)); break;
        }
        case "NUM": {
          const inches = num(tokens, s);
          const slot = ctx === "neckline" ? "neckline.depth" : ctx === "back" ? "back.depth" : ctx === "sleeve" ? "sleeve.length"
            : ctx === "slit" ? "slit.length" : "garment.length";
          out.push({ op: "set", slot, value: { value: `${inches} in`, inches, p, src, evidence: ev(s) } });
          break;
        }
        case "COLOUR": out.push(mk("colour", s)); break;
        case "SHADE": out.push(mk("shade", s)); break;
        case "FABRIC": out.push(mk("fabric", s)); break;
        case "PATTERN": out.push(mk("pattern", s)); break;
        case "EMBELL": out.push(mk("embellishment", s)); break;
        case "OCCASION": out.push(mk("occasion", s)); break;
        case "STYLE": out.push(mk("style", s)); break;
      }
    }
    cl.forEach((s, k) => {
      if (s.tag !== "CMP") return;
      const ref = cl.slice(k + 1).find((r) => r.tag === "REF") ?? [...cl.slice(0, k)].reverse().find((r) => r.tag === "REF");
      if (!ref) return;
      const slot = ctx === "sleeve" ? "sleeve.length" : ctx === "length" ? "garment.length" : ctx === "back" ? "back.depth" : "neckline.depth";
      out.push({ op: "compare", slot, cmp: s.value, ref: ev(ref), value: { value: s.value, p, src, evidence: `${ev(s)} ${ev(ref)}` } });
    });
    if (ctx) lastCtx = ctx;
  }
  // garments are resolved over the whole message, so "a sweatshirt and pants ... cord set" is one set
  const garments = spans.filter((s) => s.tag === "GARMENT" && s.value);
  for (const g of negatedGarments) out.push({ op: "exclude", slot: "garment", value: { value: g.value, p, src, evidence: tokens.slice(g.start, g.end).join(" ") } });
  const wanted = garments.filter((g) => !negatedGarments.has(g));
  if (wanted.length) out.unshift(...garmentUpdates(wanted, tokens, src, p));
  return out;
}

/** Depth in inches from an ordinal value and its intensity ("thoda deep" sits halfway between moderate and deep). */
export function depthInches(v: Value): number | undefined {
  if (v.inches !== undefined) return v.inches;
  const order: string[] = ONTO.depth_order;
  const table: Record<string, number> = ONTO.depth_in;
  const base = table[v.value];
  if (base === undefined) return undefined;
  const i = order.indexOf(v.value);
  if (v.intensity === "slight" && i > 0) return (base + table[order[i - 1]]) / 2;
  if (v.intensity === "strong" && i < order.length - 1) return (base + table[order[i + 1]]) / 2;
  return base;
}

export function easeInches(fit: string | undefined, intensity?: string): number | undefined {
  if (!fit) return undefined;
  const order: string[] = ONTO.fit_order;
  const table: Record<string, number> = ONTO.ease_in;
  const i = order.indexOf(fit);
  if (i < 0) return undefined;
  if (intensity === "slight" && i > 0) return (table[fit] + table[order[i - 1]]) / 2;
  if (intensity === "strong") return i === 0 ? Math.max(0.5, table[fit] - 0.5) : table[fit] + 1;
  return table[fit];
}

/** One step of state tracking: a pure function, so a conversation is a fold over its updates. */
export function apply(spec: Spec, ups: Update[]): Spec {
  const next: Spec = { ...spec, slots: { ...spec.slots }, lists: { ...spec.lists }, excluded: [...spec.excluded],
    comparisons: [...spec.comparisons], notes: [...(spec.notes ?? [])], history: [...spec.history, ...ups], version: spec.version + (ups.length ? 1 : 0) };
  for (const u of ups) {
    const cur = next.slots[u.slot];
    if (u.op === "set") {
      if (u.slot === "garment" && cur && cur.value !== u.value.value && PRIORITY[u.value.src] >= PRIORITY[cur.src]) {
        // a new garment starts a new design; parts that do not belong to its family are dropped
        const fam = familyOf(u.value.value);
        for (const k of Object.keys(next.slots)) {
          if (k === "garment") continue;
          if (fam === "bottom" && (k.startsWith("neckline") || k.startsWith("sleeve") || k.startsWith("bodice") || k.startsWith("back"))) delete next.slots[k];
        }
        if (!SET_GARMENTS.has(u.value.value) && u.value.value !== "kurta set") delete next.lists.components;
      }
      if (!cur || PRIORITY[u.value.src] >= PRIORITY[cur.src] || u.value.p > cur.p + 0.25) next.slots[u.slot] = u.value;
      next.excluded = next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value));
    } else if (u.op === "add") {
      const list = (next.lists[u.slot] ?? []).filter((v) => v.value !== u.value.value);
      const stated = list.filter((v) => PRIORITY[v.src] >= PRIORITY.words);
      // pictures never override values the customer stated
      if ((u.value.src === "image" || u.value.src === "note") && stated.length && ["colour", "pattern", "embellishment"].includes(u.slot)) continue;
      next.lists[u.slot] = [...list, u.value];
      next.excluded = next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value));
    } else if (u.op === "exclude") {
      next.excluded = [...next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value)),
        { slot: u.slot, value: u.value.value, evidence: u.value.evidence }];
      if (cur?.value === u.value.value) delete next.slots[u.slot];
      if (next.lists[u.slot]) next.lists[u.slot] = next.lists[u.slot].filter((v) => v.value !== u.value.value);
    } else if (u.op === "replace") {
      // an edit that chooses one value for a list slot, such as picking a colour from the palette
      next.lists[u.slot] = [u.value];
      next.excluded = next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value));
    } else if (u.op === "compare") {
      next.comparisons = [...next.comparisons, { slot: u.slot, cmp: u.cmp!, ref: u.ref!, evidence: u.value.evidence }];
    } else if (u.op === "note") {
      const n = u.value.value.trim();
      if (n && !next.notes!.some((x) => x.toLowerCase() === n.toLowerCase())) next.notes!.push(n);
    }
  }
  return next;
}

/** The families present in the design: the garment's own, plus each component's. */
export function families(spec: Spec): Set<string> {
  const out = new Set<string>();
  const f = familyOf(spec.slots.garment?.value);
  if (f) out.add(f);
  for (const c of spec.lists.components ?? []) { const cf = familyOf(c.value); if (cf) out.add(cf); }
  return out;
}
export function family(spec: Spec): string | null { return familyOf(spec.slots.garment?.value); }

export function seasonOf(spec: Spec): string | null {
  const occ = (spec.lists.occasion ?? []).map((o) => o.value);
  return ["winter", "summer", "monsoon", "gym", "lounge"].find((s) => occ.includes(s)) ?? null;
}

const isKnit = (fams: Set<string>) => fams.has("knit_top") || (fams.has("set") && !fams.has("top_long") && !fams.has("top_short"));
const isBottomish = (fams: Set<string>) => fams.has("bottom") || fams.has("set");
const bottomLength = (fams: Set<string>) => fams.has("bottom") && !fams.has("top_long");

/** Which drawing fits this garment: "straight" means one shape on a kurta and another on trousers. */
export function contextOf(slot: string, spec: Spec): string | null {
  const fams = families(spec);
  if (slot === "bodice.fit") return isKnit(fams) ? "knit" : null;
  if (slot === "lower.silhouette") return isBottomish(fams) ? "bottom" : null;
  if (slot === "garment.length") return bottomLength(fams) ? "bottom" : null;
  return null;
}

function questionFor(slot: string, spec: Spec): Omit<Question, "cost"> | null {
  const fams = families(spec);
  const knit = isKnit(fams);
  const bottomish = isBottomish(fams);
  const season = seasonOf(spec);
  const seasonal: Record<string, string[]> = ONTO.fabric_by_season;
  switch (slot) {
    case "garment": return { slot, text: "What should we make?", options: ["kurti", "anarkali", "lehenga", "saree blouse", "dress", "co-ord set", "shirt", "trousers"] };
    case "neckline.shape":
      return knit ? { slot, text: "Which neckline?", options: ["crew", "hooded", "turtle", "v"], labels: { crew: "crew neck", hooded: "hood", turtle: "turtle neck", v: "V neck" } }
        : { slot, text: "Which neckline?", options: ["round", "v", "boat", "square", "sweetheart", "mandarin"], labels: { v: "V" } };
    case "neckline.depth": return { slot, text: "How deep should the neckline be? It can be deepened at the trial, never raised.", options: ["shallow", "moderate", "deep"] };
    case "sleeve.length": return { slot, text: "How long should the sleeves be?", options: ["sleeveless", "elbow", "three-quarter", "full"] };
    case "bodice.fit":
      return knit ? { slot, text: fams.has("set") ? "How should the top fit?" : "How should it fit?", options: ["semi-fitted", "relaxed", "loose"], labels: { "semi-fitted": "regular", loose: "oversized" } }
        : { slot, text: "How should it fit at the bust and waist?", options: ["fitted", "semi-fitted", "relaxed"] };
    case "lower.silhouette":
      return bottomish ? { slot, text: fams.has("set") ? "How should the bottoms fit?" : "How should they fit?", options: ["straight", "wide-leg", "jogger", "tapered"] }
        : { slot, text: "What shape below the waist?", options: ["a-line", "straight", "flared", "anarkali"], labels: { "a-line": "A-line", anarkali: "kalidar (anarkali)" } };
    case "garment.length":
      return bottomLength(fams) ? { slot, text: "What length?", options: ["ankle", "floor", "knee"], labels: { ankle: "ankle length", floor: "full length", knee: "knee (shorts)" } }
        : { slot, text: "How long should it be?", options: ["hip", "knee", "midi", "ankle"], labels: { midi: "below the knee" } };
    case "fabric": {
      const opts = season && seasonal[season] ? seasonal[season]
        : knit ? ["terry", "fleece", "cotton", "wool"] : bottomish && !fams.has("top_long") ? ["cotton", "denim", "linen", "polyester"] : ["cotton", "georgette", "silk", "chanderi", "rayon", "linen"];
      return { slot, text: season === "winter" ? "Which fabric? For the cold, these keep you warm." : "Any fabric in mind?", options: opts };
    }
    case "colour": return { slot, text: "Which colour?", options: ["black", "navy", "ivory", "grey", "maroon", "olive", "powder blue", "pink"], labels: { "powder blue": "powder blue" } };
  }
  return null;
}

/** Ask about the slots a tailor needs first for this kind of garment, at most three per turn. */
export function questions(spec: Spec, budget = 3): Question[] {
  if (!spec.slots.garment) return [{ ...questionFor("garment", spec)!, cost: 10 }];
  const asks: string[] = [];
  for (const f of families(spec)) for (const s of (ONTO.family_questions[f] ?? []) as string[]) if (!asks.includes(s)) asks.push(s);
  const out: Question[] = [];
  for (const slot of asks) {
    const meta = ONTO.slots[slot] ?? { cost: 3 };
    const have = LIST_SLOTS.has(slot) ? (spec.lists[slot]?.length ?? 0) > 0 : !!spec.slots[slot];
    const conf = LIST_SLOTS.has(slot) ? Math.max(0, ...(spec.lists[slot] ?? []).map((v) => v.p)) : spec.slots[slot]?.p ?? 0;
    if (have && conf >= 0.7) continue;
    if (slot === "neckline.depth" && (spec.comparisons.some((c) => c.slot === slot) || ["crew", "hooded", "turtle", "mandarin", "collar", "high"].includes(spec.slots["neckline.shape"]?.value ?? ""))) continue;
    const q = questionFor(slot, spec);
    if (!q) continue;
    const excluded = new Set(spec.excluded.filter((e) => e.slot === slot).map((e) => e.value));
    out.push({ ...q, options: q.options.filter((o) => !excluded.has(o)), cost: meta.cost * (1 - conf) });
  }
  return out.slice(0, budget);
}

export function answer(slot: string, value: string): Update[] {
  return [{ op: LIST_SLOTS.has(slot) ? "add" : "set", slot, value: { value, p: 0.99, src: "answer", evidence: value } }];
}

export const words = (s: string) => tokenize(s);

// ------------------------------------------------------------------ who it is for
// Read from the words ("for my brother", "ladies", "men's") or, failing that, from the garment itself.
// A possessive ("my brother's wedding") names whose event it is, not who wears the garment, so it does not count.
const MEN = /\b(men'?s|mens|male|gents?|husband|brother|father|dad|papa|son|boyfriend|groom|dulha|ladka|ladke|bhai|bhaiya|boys?|him)\b(?!['’]s)/i;
const WOMEN = /\b(women'?s|womens|ladies|female|wife|sister|mother|mom|mummy|daughter|girlfriend|bride|dulhan|ladki|didi|behen|girls?|her)\b(?!['’]s)/i;
const MEN_GARMENTS = new Set(["sherwani", "nehru jacket"]);
const WOMEN_GARMENTS = new Set(["kurti", "anarkali", "salwar suit", "lehenga", "saree blouse", "saree", "dress", "gown", "skirt", "crop top", "corset", "bodysuit", "sharara", "palazzo", "churidar", "dupatta", "leggings"]);

export function wearerUpdates(text: string): Update[] {
  const m = MEN.test(text), w = WOMEN.test(text);
  if (m === w) return [];
  return [{ op: "set", slot: "wearer", value: { value: m ? "men" : "women", p: 0.95, src: "words", evidence: (text.match(m ? MEN : WOMEN) ?? [""])[0] } }];
}
export function wearerOf(spec: Spec): "men" | "women" | "anyone" {
  const w = spec.slots.wearer?.value;
  if (w === "men" || w === "women" || w === "anyone") return w;
  const g = spec.slots.garment?.value ?? "";
  if (MEN_GARMENTS.has(g)) return "men";
  if (WOMEN_GARMENTS.has(g)) return "women";
  return "anyone";
}
export const isGendered = (g?: string) => !!g && (MEN_GARMENTS.has(g) || WOMEN_GARMENTS.has(g));
