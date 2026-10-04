// Binding (spans -> updates), state tracking (fold of updates) and the question policy.
import { ONTO, groundFuzzy, tokenize } from "./lexicon.ts";
import type { Span } from "./lexicon.ts";

export type Source = "words" | "note" | "image" | "profile" | "answer" | "edit";
export interface Value { value: string; p: number; src: Source; evidence: string; inches?: number; intensity?: string }
export interface Update { op: "set" | "exclude" | "add" | "compare"; slot: string; value: Value; ref?: string; cmp?: string }
export interface Spec {
  version: number;
  slots: Record<string, Value>;
  lists: Record<string, Value[]>;           // colour, embellishment, style, pattern can hold several values
  excluded: { slot: string; value: string; evidence: string }[];
  comparisons: { slot: string; cmp: string; ref: string; evidence: string }[];
  history: Update[];
}
export interface Question { slot: string; text: string; options: string[]; cost: number }

export const emptySpec = (): Spec => ({ version: 0, slots: {}, lists: {}, excluded: [], comparisons: [], history: [] });

const LIST_SLOTS = new Set(["colour", "embellishment", "style", "pattern", "occasion", "shade"]);
const CLAUSE_BREAK = new Set([",", ".", ";", "!", "?", "and", "but", "aur", "par", "lekin", "with", "magar", "&", "|"]);
const SLEEVE_LENGTHS = new Set(ONTO.sleeve_length_order as string[]);
const PRIORITY: Record<string, number> = { words: 4, answer: 5, edit: 6, note: 3, image: 2, profile: 1 };

type Ctx = "neckline" | "sleeve" | "bodice" | "lower" | "back" | "length" | "slit" | "hem" | null;

function partCtx(s: Span): Ctx {
  if (s.tag === "NECKLINE") return "neckline";
  if (s.tag === "SLEEVE") return "sleeve";
  if (s.tag === "LOC") return s.value === "lower" ? "lower" : s.value === "back" ? "back" : s.value === "upper" ? "bodice" : "neckline";
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
  let lastCtx: Ctx = null;
  for (const cl of clauses) {
    const ctxSpan = cl.find((s) => partCtx(s) !== null && s.tag !== "SLEEVE" && s.tag !== "NECKLINE") ?? cl.find((s) => partCtx(s) !== null);
    let ctx: Ctx = ctxSpan ? partCtx(ctxSpan) : null;
    const values = cl.filter((s) => !["PART", "LOC", "INT", "NEG", "CMP", "REF"].includes(s.tag) && (s.value || s.tag === "NUM"));
    const intensity = new Map<Span, string>();
    const negated = new Set<Span>();
    for (const s of cl) {
      if (s.tag === "INT" || s.tag === "NEG") {
        const after = values.find((v) => v.start >= s.end && v.start - s.end <= 2);
        const before = [...values].reverse().find((v) => v.end <= s.start && s.start - v.end <= 3);
        const target = s.tag === "NEG" ? (after ?? before) : (after ?? before);
        if (target) s.tag === "INT" ? intensity.set(target, s.value) : negated.add(target);
      }
    }
    const ev = (s: Span) => tokens.slice(s.start, s.end).join(" ");
    const mk = (slot: string, s: Span, extra: Partial<Value> = {}): Update => ({
      op: negated.has(s) ? "exclude" : LIST_SLOTS.has(slot) ? "add" : "set",
      slot, value: { value: s.value, p, src, evidence: ev(s), intensity: intensity.get(s), ...extra },
    });
    for (const s of values) {
      switch (s.tag) {
        case "GARMENT": out.push(mk("garment", s)); break;
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
          const sleeve = ctx === "sleeve" || SLEEVE_LENGTHS.has(s.value) && s.value !== "short";
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
    // comparisons: CMP followed by REF in the same clause
    cl.forEach((s, k) => {
      if (s.tag !== "CMP") return;
      const ref = cl.slice(k + 1).find((r) => r.tag === "REF") ?? [...cl.slice(0, k)].reverse().find((r) => r.tag === "REF");
      if (!ref) return;
      const slot = ctx === "sleeve" ? "sleeve.length" : ctx === "length" ? "garment.length" : ctx === "back" ? "back.depth" : "neckline.depth";
      out.push({ op: "compare", slot, cmp: s.value, ref: ev(ref), value: { value: s.value, p, src, evidence: `${ev(s)} ${ev(ref)}` } });
    });
    if (ctx) lastCtx = ctx;
  }
  return out;
}

/** Depth in inches from an ordinal value and its intensity ("thoda deep" sits halfway between moderate and deep). */
export function depthInches(v: Value): number | undefined {
  if (v.inches !== undefined) return v.inches;
  const order: string[] = ONTO.depth_order;
  const table: Record<string, number> = ONTO.depth_in;
  const base = table[v.value === "deep" ? "deep" : v.value === "shallow" ? "shallow" : v.value] ?? undefined;
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
    comparisons: [...spec.comparisons], history: [...spec.history, ...ups], version: spec.version + (ups.length ? 1 : 0) };
  for (const u of ups) {
    const cur = next.slots[u.slot];
    if (u.op === "set") {
      if (!cur || PRIORITY[u.value.src] >= PRIORITY[cur.src] || u.value.p > cur.p + 0.25) next.slots[u.slot] = u.value;
      next.excluded = next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value));
    } else if (u.op === "add") {
      const list = (next.lists[u.slot] ?? []).filter((v) => v.value !== u.value.value);
      const fromWords = list.filter((v) => v.src === "words" || v.src === "answer" || v.src === "edit");
      // board evidence never overrides several values the customer stated in words
      if (u.value.src === "image" && fromWords.length && u.slot === "colour") continue;
      next.lists[u.slot] = [...list, u.value];
      next.excluded = next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value));
    } else if (u.op === "exclude") {
      next.excluded = [...next.excluded.filter((e) => !(e.slot === u.slot && e.value === u.value.value)),
        { slot: u.slot, value: u.value.value, evidence: u.value.evidence }];
      if (cur?.value === u.value.value) delete next.slots[u.slot];
      if (next.lists[u.slot]) next.lists[u.slot] = next.lists[u.slot].filter((v) => v.value !== u.value.value);
    } else if (u.op === "compare") {
      next.comparisons = [...next.comparisons, { slot: u.slot, cmp: u.cmp!, ref: u.ref!, evidence: u.value.evidence }];
    }
  }
  return next;
}

export function family(spec: Spec): string | null {
  const g = spec.slots.garment?.value;
  if (!g) return null;
  for (const [f, list] of Object.entries<string[]>(ONTO.garment_family)) if (list.includes(g)) return f;
  return null;
}

const OPTIONS: Record<string, string[]> = {
  garment: ["kurti", "anarkali", "salwar suit", "lehenga", "saree blouse", "dress", "co-ord set"],
  "neckline.shape": ["round", "v", "boat", "square", "sweetheart", "mandarin"],
  "neckline.depth": ["shallow", "moderate", "deep"],
  "sleeve.length": ["sleeveless", "elbow", "three-quarter", "full"],
  "bodice.fit": ["fitted", "semi-fitted", "relaxed"],
  "garment.length": ["hip", "knee", "midi", "ankle"],
  fabric: ["cotton", "georgette", "silk", "chanderi", "rayon", "linen"],
  colour: ["powder blue", "pink", "ivory", "maroon", "mint", "black"],
};
const ASK: Record<string, string> = {
  garment: "What are we making?",
  "neckline.shape": "Which neckline?",
  "neckline.depth": "How deep should the neckline be? It can be deepened at the trial, never raised.",
  "sleeve.length": "How long should the sleeves be?",
  "bodice.fit": "How should it fit at the bust and waist?",
  "garment.length": "How long should it be?",
  fabric: "Any fabric in mind?",
  colour: "Which colour?",
};

/** Ask about the critical slots with the highest cost of a wrong guess, at most three per turn. */
export function questions(spec: Spec, budget = 3): Question[] {
  const fam = family(spec);
  const out: Question[] = [];
  for (const [slot, meta] of Object.entries<any>(ONTO.slots)) {
    if (!meta.critical || !OPTIONS[slot]) continue;
    if (meta.applies && fam && !meta.applies.includes(fam)) continue;
    if (fam === "bottom" && (slot.startsWith("neckline") || slot.startsWith("sleeve") || slot === "bodice.fit")) continue;
    const have = LIST_SLOTS.has(slot) ? (spec.lists[slot]?.length ?? 0) > 0 : !!spec.slots[slot];
    const conf = LIST_SLOTS.has(slot) ? Math.max(0, ...(spec.lists[slot] ?? []).map((v) => v.p)) : spec.slots[slot]?.p ?? 0;
    if (slot !== "garment" && !spec.slots.garment) continue;
    if (have && conf >= 0.7) continue;
    if (slot === "neckline.depth" && spec.comparisons.some((c) => c.slot === slot)) continue;
    const cost = meta.cost * (1 - conf);
    const excluded = new Set(spec.excluded.filter((e) => e.slot === slot).map((e) => e.value));
    out.push({ slot, text: ASK[slot], options: OPTIONS[slot].filter((o) => !excluded.has(o)), cost });
  }
  return out.sort((a, b) => b.cost - a.cost).slice(0, budget);
}

export function answer(slot: string, value: string): Update[] {
  return [{ op: LIST_SLOTS.has(slot) ? "add" : "set", slot, value: { value, p: 0.99, src: "answer", evidence: value } }];
}

export const words = (s: string) => tokenize(s);
