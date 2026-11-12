// Shared plumbing for the studio's functions (understand, next, transcribe): rate limits, request parsing,
// fencing user text, and one call to an OpenAI-compatible chat API with a model fallback list.
// Nothing here logs a message, a transcript or audio; only provider status codes.
// Author: Ritesh Roshan

export const BASE = () => (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/?$/, "/");
/** Tried in order: the light model answers fastest; a busy or failing one hands over to the next. */
export const MODELS = () => (process.env.LLM_MODEL || "gemini-flash-lite-latest,gemini-flash-latest").split(",").map((m) => m.trim()).filter(Boolean);

/** A sliding-window limiter per caller. */
export function limiter(max, windowMs) {
  const hits = new Map();
  const limited = (ip, now = Date.now()) => {
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) { hits.set(ip, recent); return true; }
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] >= windowMs) hits.delete(k);
    return false;
  };
  return { limited, reset: () => hits.clear() };
}

export function callerIp(req) {
  const fwd = String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  return fwd || req.socket?.remoteAddress || "unknown";
}

export function parseBody(body) {
  if (typeof body !== "string") return body ?? {};
  try { return JSON.parse(body); } catch { return {}; }
}

/** Angle brackets are removed so user text cannot close the tags that fence it. */
export const plain = (s) => String(s ?? "").replace(/[<>]/g, " ");

export function parseJSON(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return null;
}

async function callOne(model, body, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${BASE()}chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ ...body, model }),
    });
    if (!r.ok) { console.warn(`studio: ${model} answered ${r.status}`); return { status: r.status }; }
    const data = await r.json();
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return text ? { text, model } : { status: 502 };
  } catch (e) {
    return { status: e?.name === "AbortError" ? 504 : 502 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The first reply from the model list within the budget; each model gets at most perModelMs.
 * @returns {Promise<{ text: string, model: string } | { status: number }>}
 */
export async function chat(body, { budgetMs = 12000, perModelMs = 9000, models = MODELS() } = {}) {
  const end = Date.now() + budgetMs;
  let last = { status: 502 };
  for (const model of models) {
    const left = end - Date.now();
    if (left < 1000) break;
    const r = await callOne(model, body, Math.min(left, perModelMs));
    if ("text" in r) return r;
    last = r;
  }
  return last;
}
