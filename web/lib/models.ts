// In-browser models. transformers.js is loaded from a CDN at runtime so the static bundle stays small
// and the bundler never sees onnxruntime. Nothing the customer types or uploads leaves the browser.
import { viterbi } from "./engine/decode.ts";
import { bioToSpans, labels, tagRules, tokenize } from "./engine/lexicon.ts";
import type { Span } from "./engine/lexicon.ts";

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

// Timings for the latency tests; read from window.__bespokeTimings, never sent anywhere.
export const timings = { taggerLoadMs: -1, tagMs: [] as number[], tagBy: [] as string[] };
if (typeof window !== "undefined") (window as any).__bespokeTimings = timings;
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
let loadedTagger: Tagger | null = null;
export type TaggerState = "rules" | "loading" | "bert";

export function loadTagger(onState: (s: TaggerState) => void) {
  if (tagger) return tagger;
  onState("loading");
  const t0 = performance.now();
  tagger = (async () => {
    try {
      const t = await hf();
      const tok = await t.AutoTokenizer.from_pretrained("bespoke-tagger", { local_files_only: true });
      const model = await t.AutoModelForTokenClassification.from_pretrained("bespoke-tagger", { dtype: "q8", local_files_only: true });
      const ids: number[] = tok.encode("a");
      timings.taggerLoadMs = Math.round(performance.now() - t0);
      t.env.allowLocalModels = false;   // later models (Whisper, CLIP) come from the Hub; skip local lookups
      onState("bert");
      loadedTagger = { tok, model, cls: ids[0], sep: ids[ids.length - 1] };
      return loadedTagger;
    } catch (e) {
      console.warn("tagger unavailable, using the gazetteer", e);
      if (T) T.env.allowLocalModels = false;
      onState("rules");
      return null;
    }
  })();
  return tagger;
}

/** Tag a request: gazetteer first, then the transformer (constrained Viterbi) for the words the gazetteer does not know. */
export async function tag(text: string): Promise<{ tokens: string[]; spans: Span[]; by: TaggerState }> {
  const t0 = performance.now();
  const done = <T extends { by: TaggerState }>(r: T): T => { timings.tagMs.push(Math.round((performance.now() - t0) * 10) / 10); timings.tagBy.push(r.by); return r; };
  const tokens = tokenize(text);
  const rules = tagRules(tokens);
  const m = tagger ? await tagger : null;
  if (!m || !tokens.length) return done({ tokens, spans: rules, by: "rules" as TaggerState });
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
  // the evaluated configuration: gazetteer spans first (precise), the model's spans only where the gazetteer found nothing
  const spans = [...rules];
  for (const m of bioToSpans(tokens, tags)) if (!rules.some((r) => r.start < m.end && m.start < r.end)) spans.push(m);
  spans.sort((a, b) => a.start - b.start);
  return done({ tokens, spans, by: "bert" as TaggerState });
}

/** A word that is one whole token of the tagger's vocabulary is ordinary language. */
export function isCommonWord(w: string): boolean {
  const m = loadedTagger;
  if (!m) return false;
  return m.tok.encode(w, { add_special_tokens: false }).length === 1;
}

// ------------------------------------------------------------------ speech
// On-device Whisper, used when the browser has no working speech service (Brave, Firefox, offline).
let asr: Promise<any> | null = null;
export function loadSpeech() {
  if (!asr) asr = hf().then((t) => t.pipeline("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "q8" }));
  return asr;
}

export async function transcribe(audio: Float32Array, lang: "en-IN" | "hi-IN"): Promise<string> {
  const pipe = await loadSpeech();
  const out = await pipe(audio, { language: lang === "hi-IN" ? "hindi" : "english", task: "transcribe" });
  return String((Array.isArray(out) ? out[0]?.text : out?.text) ?? "").trim();
}

/** Decode a recorded blob to 16 kHz mono, the input Whisper expects. */
export async function toMono16k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (buf.numberOfChannels === 1) return buf.getChannelData(0);
    const a = buf.getChannelData(0), b = buf.getChannelData(1), out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
    return out;
  } finally {
    void ctx.close();
  }
}

// ------------------------------------------------------------------ vision
let clip: Promise<any> | null = null;
let clipReady = false;
const loadListeners = new Set<(fraction: number) => void>();

/** Load CLIP once. Every caller's onProgress hears the download, 0 to 1, weighted by file size. */
export function loadVision(onProgress?: (fraction: number) => void) {
  if (onProgress && !clipReady) loadListeners.add(onProgress);
  if (!clip) {
    const files = new Map<string, [number, number]>();
    const progress_callback = (e: any) => {
      if (e.status !== "progress" || !e.total) return;
      files.set(e.file, [e.loaded, e.total]);
      let loaded = 0, total = 0;
      for (const [l, t] of files.values()) { loaded += l; total += t; }
      loadListeners.forEach((cb) => cb(loaded / total));
    };
    clip = hf()
      .then((t) => t.pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", { dtype: "q8", progress_callback }))
      .then((pipe) => { clipReady = true; return pipe; })
      .catch((e) => { clip = null; throw e; }) // a failed download must not poison the next attempt
      .finally(() => loadListeners.clear());
  }
  return clip;
}

export async function zeroShot(image: string, prompts: string[]): Promise<number[]> {
  const pipe = await loadVision();
  const res: { label: string; score: number }[] = await pipe(image, prompts, { hypothesis_template: "{}" });
  return prompts.map((p) => res.find((r) => r.label === p)?.score ?? 0);
}
