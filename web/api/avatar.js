// POST /api/avatar  { prompt }  ->  { image: "data:image/...;base64,..." }
// Draws the design on a generic fashion model. Cloudflare Workers AI (FLUX schnell, free daily quota) goes first,
// then Gemini's image models, which free keys cannot use but a billed key can.
// The prompt is written on the device from the design alone: no photo, face or measurements of the customer.
// Any failure answers with a status the client reads as "use the open image model instead".
// Environment: CF_ACCOUNT_ID + CF_API_TOKEN (Workers AI), LLM_API_KEY (Gemini), AVATAR_MODEL (optional,
// comma-separated Gemini models, tried in order). At least one provider must be set.
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
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`, {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CF_API_TOKEN}` },
      body: JSON.stringify({ prompt, steps: 6 }),
    });
    if (!r.ok) { console.warn(`avatar: cloudflare answered ${r.status}`); return null; }
    const image = (await r.json())?.result?.image;
    return image ? `data:image/jpeg;base64,${image}` : null;
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
  const cloudflare = Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
  if (!cloudflare && !process.env.LLM_API_KEY) { res.status(501).json({ error: "not configured" }); return; }
  const started = Date.now();
  if (cloudflare) {
    const image = await drawCloudflare(prompt, 20000);
    if (image) { res.status(200).json({ image, model: CF_MODEL }); return; }
  }
  for (const model of process.env.LLM_API_KEY ? MODELS : []) {
    const left = 26000 - (Date.now() - started);
    if (left < 4000) break;
    const image = await draw(model, prompt, Math.min(22000, left));
    if (image) { res.status(200).json({ image, model }); return; }
  }
  res.status(502).json({ error: "no image" });
}
