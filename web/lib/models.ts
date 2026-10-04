// In-browser models. transformers.js is loaded from a CDN at runtime so the static bundle stays small
// and the bundler never sees onnxruntime. Nothing the customer types or uploads leaves the browser.
import { viterbi } from "./engine/decode.ts";
import { bioToSpans, labels, tagRules, tokenize } from "./engine/lexicon.ts";
import type { Span } from "./engine/lexicon.ts";

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
let T: any = null;
async function hf() {
  if (T) return T;
  const dynImport = new Function("u", "return import(u)") as (u: string) => Promise<any>;
  T = await dynImport(CDN);
  T.env.allowLocalModels = true;
  T.env.localModelPath = "/models/";
  return T;
}

// ------------------------------------------------------------------ tagger
type Tagger = { tok: any; model: any; cls: number; sep: number };
let tagger: Promise<Tagger | null> | null = null;
export type TaggerState = "rules" | "loading" | "bert";

export function loadTagger(onState: (s: TaggerState) => void) {
  if (tagger) return tagger;
  onState("loading");
  tagger = (async () => {
    try {
      const t = await hf();
      const tok = await t.AutoTokenizer.from_pretrained("bespoke-tagger", { local_files_only: true });
      const model = await t.AutoModelForTokenClassification.from_pretrained("bespoke-tagger", { dtype: "q8", local_files_only: true });
      const ids: number[] = tok.encode("a");
      onState("bert");
      return { tok, model, cls: ids[0], sep: ids[ids.length - 1] };
    } catch (e) {
      console.warn("tagger unavailable, using the gazetteer", e);
      onState("rules");
      return null;
    }
  })();
  return tagger;
}

/** Tag a request: transformer + constrained Viterbi, with gazetteer spans filling any gap the model left. */
export async function tag(text: string): Promise<{ tokens: string[]; spans: Span[]; by: TaggerState }> {
  const tokens = tokenize(text);
  const rules = tagRules(tokens);
  const m = tagger ? await tagger : null;
  if (!m || !tokens.length) return { tokens, spans: rules, by: "rules" };
  const t = await hf();
  const ids: number[] = [m.cls];
  const first: number[] = [];
  for (const w of tokens) {
    const sub: number[] = m.tok.encode(w, { add_special_tokens: false });
    if (ids.length + sub.length >= 127) break;
    first.push(ids.length);
    ids.push(...(sub.length ? sub : [100]));
  }
  ids.push(m.sep);
  const big = (a: number[]) => BigInt64Array.from(a.map((x) => BigInt(x)));
  const shape = [1, ids.length];
  const out = await m.model({
    input_ids: new t.Tensor("int64", big(ids), shape),
    attention_mask: new t.Tensor("int64", big(ids.map(() => 1)), shape),
    token_type_ids: new t.Tensor("int64", big(ids.map(() => 0)), shape),
  });
  const L = labels();
  const data = out.logits.data as Float32Array;
  const k = L.length;
  const logp = first.map((pos) => {
    const row = Array.from(data.slice(pos * k, pos * k + k));
    const mx = Math.max(...row);
    const lse = mx + Math.log(row.reduce((s, x) => s + Math.exp(x - mx), 0));
    return row.map((x) => x - lse);
  });
  const tags = viterbi(logp, L);
  while (tags.length < tokens.length) tags.push("O");
  const spans = bioToSpans(tokens, tags);
  for (const r of rules) if (!spans.some((s) => s.start < r.end && r.start < s.end)) spans.push(r);
  spans.sort((a, b) => a.start - b.start);
  return { tokens, spans, by: "bert" };
}

// ------------------------------------------------------------------ vision
let clip: Promise<any> | null = null;
export function loadVision() {
  if (!clip) clip = hf().then((t) => t.pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", { dtype: "q8" }));
  return clip;
}

export async function zeroShot(image: string, prompts: string[]): Promise<number[]> {
  const pipe = await loadVision();
  const res: { label: string; score: number }[] = await pipe(image, prompts, { hypothesis_template: "{}" });
  return prompts.map((p) => res.find((r) => r.label === p)?.score ?? 0);
}
