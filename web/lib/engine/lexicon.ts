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

// ------------------------------------------------------------------ speech transcript correction
// Speech recognisers mangle domain words ("curty" for kurti, "pass del" for pastel, "av-nic" for V neck).
// A word or adjacent pair that is not in the lexicon is replaced by a lexicon form with the same sound key,
// so correction can only ever move a transcript towards known garment vocabulary.
const SKIP = new Set(["the", "and", "with", "want", "need", "make", "like", "for", "but", "not", "this", "that", "have", "want", "wanna",
  "please", "some", "very", "just", "also", "mujhe", "chahiye", "hai", "kar", "karo", "aur", "par", "mein", "ke", "ki", "ka", "liye",
  "my", "me", "can", "you", "should", "would", "could", "will", "what", "maybe", "something", "looking", "wear", "dress up"]);
export function soundKey(word: string): string {
  const s = word.toLowerCase().replace(/[^a-z]/g, "").replace(/ph/g, "f").replace(/ck/g, "k").replace(/sh/g, "s").replace(/ch/g, "c");
  const map: Record<string, string> = { c: "k", q: "k", g: "k", d: "t", b: "p", w: "v", z: "s", x: "s" };
  let out = "";
  for (const ch of s) {
    if ("aeiouyh".includes(ch)) continue;
    const m = map[ch] ?? ch;
    if (out[out.length - 1] !== m) out += m;
  }
  return out;
}
let KEYS: Map<string, string> | null = null;
function keyIndex(): Map<string, string> {
  if (KEYS) return KEYS;
  KEYS = new Map();
  for (const values of Object.values<any>(ONTO.lexicon)) {
    for (const entry of Object.values<any>(values)) {
      for (const form of entry.forms as string[]) {
        const f = form.toLowerCase();
        if (f.replace(/[^a-z]/g, "").length < 4) continue;
        const k = soundKey(f);
        if (k.length >= 3 && !KEYS.has(k)) KEYS.set(k, f);
      }
    }
  }
  return KEYS;
}
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** isCommon(word) says the word is ordinary language (a whole token in the tagger's vocabulary): never rewrite it alone. */
export function correctTranscript(text: string, isCommon: (w: string) => boolean = () => false): string {
  const index = formIndex(), keys = keyIndex();
  const words = text.split(/\s+/).filter(Boolean);
  const bare = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");
  const known = (w: string) => index.has(tokenize(w).join(" ")) || SKIP.has(bare(w));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i], next = words[i + 1];
    if (next && !known(w) && !known(next)) {
      const joined = bare(w + next), hit = keys.get(soundKey(joined));
      if (hit && soundKey(joined).length >= 4 && editDistance(joined, hit.replace(/[^a-z]/g, "")) <= 2) { out.push(hit); i++; continue; }
    }
    if (!known(w) && bare(w).length >= 3 && !isCommon(bare(w))) {
      const hit = keys.get(soundKey(w));
      if (hit && Math.abs(hit.replace(/[^a-z]/g, "").length - bare(w).length) <= 3) { out.push(hit); continue; }
    }
    out.push(w);
  }
  return out.join(" ");
}

export function hindi(tag: Tag, value: string): string {
  return ONTO.lexicon[tag]?.[value]?.hi ?? value;
}
