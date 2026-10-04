// Mirror of engine/bespoke/lexicon.py. Keep the two in step; tests/parity.test.ts checks them.
import onto from "../ontology.json" with { type: "json" };

export type Tag = string;
export interface Span { start: number; end: number; tag: Tag; value: string }
export const ONTO: any = onto;

const TOKEN_RE = /#\d+|\d+(?:\.\d+)?(?:\/\d+)?(?:th)?|[A-Za-zÀ-ɏऀ-ॿ]+(?:[-'][A-Za-zऀ-ॿ]+)*|\S/g;
const MAX_SPAN = 6;

export function normalise(text: string): string {
  return text.toLowerCase().replace(/’/g, "'").replace(/[“”]/g, '"').replace(/([a-z])\1{2,}/g, "$1$1");
}

export function tokenize(text: string): string[] {
  return normalise(text).match(TOKEN_RE) ?? [];
}

let INDEX: Map<string, [Tag, string]> | null = null;
export function formIndex(): Map<string, [Tag, string]> {
  if (INDEX) return INDEX;
  INDEX = new Map();
  for (const [tag, values] of Object.entries<any>(ONTO.lexicon)) {
    for (const [canonical, entry] of Object.entries<any>(values)) {
      for (const form of entry.forms as string[]) {
        const key = tokenize(form).join(" ");
        if (key && !INDEX.has(key)) INDEX.set(key, [tag, canonical]);
      }
    }
  }
  return INDEX;
}

export function labels(): string[] {
  const out = ["O"];
  for (const t of ONTO.tags as string[]) out.push(`B-${t}`, `I-${t}`);
  return out;
}

const UNITS: string[] = Object.values<string[]>(ONTO.num_units).flat();

export function tagRules(tokens: string[]): Span[] {
  const index = formIndex();
  const spans: Span[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (/^\d+(?:\.\d+)?$/.test(tokens[i]) && i + 1 < tokens.length && UNITS.includes(tokens[i + 1])) {
      spans.push({ start: i, end: i + 2, tag: "NUM", value: "" });
      i += 2;
      continue;
    }
    let hit = false;
    for (let n = Math.min(MAX_SPAN, tokens.length - i); n > 0; n--) {
      const h = index.get(tokens.slice(i, i + n).join(" "));
      if (h) { spans.push({ start: i, end: i + n, tag: h[0], value: h[1] }); i += n; hit = true; break; }
    }
    if (!hit) i++;
  }
  return spans;
}

export function bioToSpans(tokens: string[], tags: string[]): Span[] {
  const index = formIndex();
  const spans: Span[] = [];
  let i = 0;
  while (i < tags.length) {
    if (tags[i] !== "O") {
      const t = tags[i].slice(2);
      let j = i + 1;
      while (j < tags.length && tags[j] === `I-${t}`) j++;
      const h = index.get(tokens.slice(i, j).join(" "));
      spans.push({ start: i, end: j, tag: t, value: h && h[0] === t ? h[1] : "" });
      i = j;
    } else i++;
  }
  return spans;
}

// Character-trigram similarity, used to ground a span the tagger found but the gazetteer does not know
// (typos such as "georget", "anarkalli", "chikenkari").
function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}
export function groundFuzzy(text: string, tag: Tag): { value: string; score: number } | null {
  const values = ONTO.lexicon[tag];
  if (!values) return null;
  const a = trigrams(text);
  let best: { value: string; score: number } | null = null;
  for (const [canonical, entry] of Object.entries<any>(values)) {
    for (const form of entry.forms as string[]) {
      const b = trigrams(form);
      let inter = 0;
      a.forEach((g) => { if (b.has(g)) inter++; });
      const score = (2 * inter) / (a.size + b.size);
      if (!best || score > best.score) best = { value: canonical, score };
    }
  }
  return best && best.score >= 0.5 ? best : null;
}

export function hindi(tag: Tag, value: string): string {
  return ONTO.lexicon[tag]?.[value]?.hi ?? value;
}
