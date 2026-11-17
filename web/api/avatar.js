// POST /api/avatar  { prompt }  ->  { image: "data:image/...;base64,..." }
// Draws the design on a generic fashion model, with FLUX schnell from two free daily quotas in turn: our
// Cloudflare Worker (workers/avatar), then Hugging Face. Gemini's image models come last; free keys cannot use
// them but a billed key can. The prompt is written on the device from the design alone: no photo, face or
// measurements of the customer. Any failure answers 502 and the look offers to try again.
// Environment: AVATAR_WORKER_URL + AVATAR_WORKER_KEY (the Worker), HF_TOKEN (Hugging Face), LLM_API_KEY
// (Gemini), AVATAR_MODEL (optional, comma-separated Gemini models). At least one provider must be set.
// Author: Ritesh Roshan
import { callerIp, limiter, parseBody } from "../lib/studio/server.js";

export const config = { maxDuration: 30 };
const MODELS = (process.env.AVATAR_MODEL || "gemini-2.5-flash-image,gemini-2.0-flash-preview-image-generation").split(",").map((m) => m.trim()).filter(Boolean);
const MAX_PROMPT = 1400;
const limits = limiter(30, 10 * 60 * 1000);

const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";

async function drawCloudflare(prompt, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(process.env.AVATAR_WORKER_URL, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AVATAR_WORKER_KEY}` },
      body: JSON.stringify({ prompt }),
    });
    if (!r.ok) { console.warn(`avatar: cloudflare answered ${r.status}`); return null; }
    const image = (await r.json())?.image;
    return image ? `data:image/jpeg;base64,${image}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const HF_MODEL = "black-forest-labs/FLUX.1-schnell";

async function drawHuggingFace(prompt, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`https://router.huggingface.co/hf-inference/models/${HF_MODEL}`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.HF_TOKEN}`, Accept: "image/jpeg" },
      body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4, width: 768, height: 1024 } }),
    });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !type.startsWith("image/")) { console.warn(`avatar: hugging face answered ${r.status}`); return null; }
    return `data:${type.split(";")[0]};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function draw(model, prompt, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.LLM_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
    });
    if (!r.ok) { console.warn(`avatar: ${model} answered ${r.status}`); return null; }
    const body = await r.json();
    const part = body?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    return part ? `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}` : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (limits.limited(callerIp(req))) { res.status(429).json({ error: "too many requests" }); return; }
  const prompt = typeof parseBody(req.body).prompt === "string" ? parseBody(req.body).prompt.trim() : "";
  if (prompt.length < 20 || prompt.length > MAX_PROMPT) { res.status(400).json({ error: "expected a prompt" }); return; }
  const cloudflare = Boolean(process.env.AVATAR_WORKER_URL && process.env.AVATAR_WORKER_KEY);
  if (!cloudflare && !process.env.HF_TOKEN && !process.env.LLM_API_KEY) { res.status(501).json({ error: "not configured" }); return; }
  const started = Date.now();
  if (cloudflare) {
    const image = await drawCloudflare(prompt, 12000);
    if (image) { res.status(200).json({ image, model: CF_MODEL }); return; }
  }
  if (process.env.HF_TOKEN) {
    const image = await drawHuggingFace(prompt, Math.max(4000, 26000 - (Date.now() - started)));
    if (image) { res.status(200).json({ image, model: HF_MODEL }); return; }
  }
  for (const model of process.env.LLM_API_KEY ? MODELS : []) {
    const left = 26000 - (Date.now() - started);
    if (left < 4000) break;
    const image = await draw(model, prompt, Math.min(22000, left));
    if (image) { res.status(200).json({ image, model }); return; }
  }
  res.status(502).json({ error: "no image" });
}
