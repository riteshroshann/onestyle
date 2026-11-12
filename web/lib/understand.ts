// Optional second opinions from a language model behind /api/understand and /api/next. The on-device engine
// answers on its own; if a function is missing, unconfigured, slow or failing, these return null and nothing changes.
import type { Question, Spec, Update } from "./engine/spec.ts";
import { phrase } from "./engine/describe.ts";

const available: Record<string, boolean | null> = {};

/** POST to a studio function; null on any failure. A missing or unconfigured function is not asked again. */
async function call<T>(path: string, body: unknown, ms: number, fetcher: typeof fetch = fetch): Promise<T | null> {
  if (available[path] === false) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetcher(path, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify(body) });
    if (r.status === 404 || r.status === 405 || r.status === 501) { available[path] = false; return null; }
    if (!r.ok) return null;
    available[path] = true;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function describeForModel(spec: Spec): string {
  if (!spec.slots.garment && !Object.keys(spec.lists).length && !spec.slots.wearer && !spec.slots.age) return "";
  const slots = Object.fromEntries(Object.entries(spec.slots).map(([k, v]) => [k, v.value]));
  const lists = Object.fromEntries(Object.entries(spec.lists).map(([k, v]) => [k, v.map((x) => x.value)]));
  return `${phrase(spec)}. ${JSON.stringify({ slots, lists, excluded: spec.excluded.map((e) => `${e.slot}:${e.value}`), asked: spec.asked ?? [] })}`;
}

export interface Reading { about: "garment" | "profile" | "other"; updates: Update[]; refused?: string }

export async function understand(message: string, spec: Spec, ms = 7000, fetcher?: typeof fetch): Promise<Reading | null> {
  const j = await call<{ updates?: unknown; about?: string; refused?: string }>("/api/understand", { message, design: describeForModel(spec) }, ms, fetcher);
  if (!j || !Array.isArray(j.updates)) return null;
  const about = j.about === "profile" || j.about === "other" ? j.about : "garment";
  return { about, updates: j.updates as Update[], refused: j.refused };
}

export interface Turn { role: "user" | "assistant"; content: string }
export interface Proposal { slot: string; text: string; options: string[] }

/** The model's pick of the next question among the engine's ranked candidates, already checked on the server. */
export async function askNext(history: Turn[], spec: Spec, candidates: Question[], ms = 7000, fetcher?: typeof fetch): Promise<Proposal | null> {
  if (!candidates.length) return null;
  const j = await call<{ question?: Proposal | null }>("/api/next",
    { history: history.slice(-12), design: describeForModel(spec), candidates: candidates.slice(0, 6).map((q) => ({ slot: q.slot })) }, ms, fetcher);
  const q = j?.question;
  return q && typeof q.slot === "string" && typeof q.text === "string" && Array.isArray(q.options) ? q : null;
}

/**
 * The question to ask: the model's when it names a slot still open in the final design (its wording, its
 * options minus anything ruled out), otherwise the engine's own best question. Labels come from the engine.
 */
export function chooseQuestion(open: Question[], proposal: Proposal | null, spec: Spec): Question | null {
  const engine = open[0] ?? null;
  const q = proposal ? open.find((x) => x.slot === proposal.slot) : undefined;
  if (!proposal || !q) return engine;
  const ruled = new Set(spec.excluded.filter((e) => e.slot === q.slot).map((e) => e.value));
  const options = proposal.options.filter((o) => !ruled.has(o));
  return { ...q, text: proposal.text, options: options.length >= 2 ? options : q.options };
}

/** Test seam: forget which functions answered. */
export const resetAvailability = () => { for (const k of Object.keys(available)) delete available[k]; };
