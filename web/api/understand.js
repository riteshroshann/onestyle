// Vercel function: open-vocabulary understanding through any OpenAI-compatible chat API.
// The on-device engine always runs first in the browser; this only adds what it could not name.
// Every value the model returns is checked against the ontology; anything else becomes a note for the tailor.
//
// Environment: LLM_API_KEY (required), LLM_BASE_URL, LLM_MODEL.
// Default provider: Gemini's OpenAI-compatible endpoint (free tier available).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ONTO = require("../lib/ontology.json");

const BASE = (process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/").replace(/\/?$/, "/");
const MODEL = process.env.LLM_MODEL || "gemini-3.8-flash";
const TIMEOUT_MS = 9000;

const SLOT_TAG = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", "sleeve.length": "LENGTH", "garment.length": "LENGTH",
  "bodice.fit": "FIT", "lower.fit": "FIT", "sleeve.fit": "FIT", "lower.silhouette": "SILHOUETTE", fabric: "FABRIC",
};
const LIST_TAG = { components: "GARMENT", colour: "COLOUR", shade: "SHADE", pattern: "PATTERN", embellishment: "EMBELL", occasion: "OCCASION", style: "STYLE" };
const DEPTH = ONTO.depth_order; // shallow, moderate, deep, plunging

function allowed() {
  const out = {};
  for (const [slot, tag] of Object.entries(SLOT_TAG)) out[slot] = Object.keys(ONTO.lexicon[tag]);
  out["sleeve.length"] = ONTO.sleeve_length_order;
  out["garment.length"] = ONTO.length_order;
  out["neckline.depth"] = DEPTH;
  out["back.depth"] = DEPTH;
  for (const [slot, tag] of Object.entries(LIST_TAG)) out[slot] = Object.keys(ONTO.lexicon[tag]);
  return out;
}
const ALLOWED = allowed();

const SYSTEM = `You read a customer's request for a garment to be tailored and update a structured design.
Customers write in English, Hindi or Hinglish (romanised Hindi), often informally.

Return one JSON object with exactly these keys:
{"set": {slot: value}, "add": {slot: [values]}, "exclude": [{"slot": slot, "value": value}], "intensity": {slot: "slight" | "strong"}, "notes": [string]}

Rules:
- Use only the slots and values listed below, spelled exactly. Map synonyms and spelling variants to the closest listed value.
- Single-value slots go in "set"; list slots go in "add". "garment" is the main garment; when the request has a top and a bottom, the garment is "co-ord set" (or "kurta set" for Indian wear) and the pieces go in "add.components".
- Include only what the new message states or clearly implies. Never guess unstated details. Seasons and weather ("in the cold", "for summer") go in "add.occasion".
- Things the customer rules out ("no embroidery", "not too flashy", "lehenga nahi") go in "exclude".
- "intensity" records softeners ("thoda", "slightly") and intensifiers ("very", "bahut") on a set slot.
- Any concrete detail with no listed value (pockets, drawstring, lining, a particular print) goes in "notes" as a short phrase in plain English.
- If the message changes something already in the design, output the new value; do not repeat unchanged details.

Single-value slots and their values:
${Object.entries(ALLOWED).filter(([s]) => !(s in LIST_TAG)).map(([s, v]) => `${s}: ${v.join(", ")}`).join("\n")}

List slots and their values:
${Object.entries(ALLOWED).filter(([s]) => s in LIST_TAG).map(([s, v]) => `${s}: ${v.join(", ")}`).join("\n")}`;

function clean(raw, message) {
  const ups = [];
  const ev = message.slice(0, 120);
  const val = (slot, v) => (typeof v === "string" ? v.toLowerCase().trim() : "");
  const ok = (slot, v) => ALLOWED[slot]?.includes(v);
  const notes = [];
  for (const [slot, v0] of Object.entries(raw.set ?? {})) {
    const v = val(slot, v0);
    if (ok(slot, v)) ups.push({ op: "set", slot, value: { value: v, p: 0.85, src: "model", evidence: ev, intensity: raw.intensity?.[slot] === "slight" || raw.intensity?.[slot] === "strong" ? raw.intensity[slot] : undefined } });
    else if (v && slot === "garment") notes.push(`garment: ${v}`);
  }
  for (const [slot, vs] of Object.entries(raw.add ?? {})) {
    for (const v0 of Array.isArray(vs) ? vs : [vs]) {
      const v = val(slot, v0);
      if (ok(slot, v)) ups.push({ op: "add", slot, value: { value: v, p: 0.85, src: "model", evidence: ev } });
    }
  }
  for (const e of Array.isArray(raw.exclude) ? raw.exclude : []) {
    const v = val(e?.slot, e?.value);
    if (ok(e?.slot, v)) ups.push({ op: "exclude", slot: e.slot, value: { value: v, p: 0.85, src: "model", evidence: ev } });
  }
  for (const n of [...notes, ...(Array.isArray(raw.notes) ? raw.notes : [])]) {
    if (typeof n === "string" && n.trim() && n.length < 140) ups.push({ op: "note", slot: "notes", value: { value: n.trim(), p: 0.8, src: "model", evidence: ev } });
  }
  return ups;
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!process.env.LLM_API_KEY) { res.status(501).json({ error: "not configured" }); return; }
  const body = typeof req.body === "string" ? parseJSON(req.body) : req.body;
  const message = String(body?.message ?? "").slice(0, 2000);
  const design = String(body?.design ?? "").slice(0, 2000);
  if (!message.trim()) { res.status(400).json({ error: "empty message" }); return; }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Current design: ${design || "nothing yet"}\n\nNew message: ${message}` },
        ],
      }),
    });
    if (!r.ok) { res.status(502).json({ error: `provider ${r.status}`, detail: (await r.text()).slice(0, 300) }); return; }
    const data = await r.json();
    const raw = parseJSON(data?.choices?.[0]?.message?.content ?? "");
    if (!raw) { res.status(502).json({ error: "unreadable reply" }); return; }
    res.status(200).json({ updates: clean(raw, message), model: MODEL });
  } catch (e) {
    res.status(504).json({ error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) });
  } finally {
    clearTimeout(timer);
  }
}

export { clean, SYSTEM, ALLOWED };
