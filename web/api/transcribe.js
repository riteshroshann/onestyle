// Vercel function: speech to text for the studio's microphone, through Gemini's OpenAI-compatible endpoint.
// The browser records, encodes 16 kHz mono WAV (at most about 30 seconds) and sends it here; the transcript goes
// back into the composer for the customer to check before sending. Audio and text are never logged or stored.
//
// Environment: LLM_API_KEY (required), LLM_BASE_URL, LLM_MODEL (comma-separated, tried in order).
import { callerIp, chat, limiter, parseBody, parseJSON } from "../lib/studio/server.js";

// 16 kHz x 16 bit mono is 32 KB a second; 1.4 MB of base64 is about 32 seconds, well under the 4.5 MB body limit
export const MAX_AUDIO_B64 = 1_400_000;
const MIN_AUDIO_B64 = 2_000;
const WAV_B64 = /^UklGR/;   // "RIFF"
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

// The model first says whether it heard a voice at all. Asked only for a transcript, it will invent a plausible
// clothing request from a beep or room noise, so the verdict is required and a "no" always wins.
export const PROMPT = `Listen to this audio clip. It may hold a person describing clothes in English, Hindi or a mix of the two (Hinglish), or it may hold only silence, noise, music or a tone.
Answer only with JSON: {"speech": true or false, "text": "..."}.
- speech is true only if you clearly hear a human voice saying words. Otherwise speech is false and text is "".
- When there is speech, text is exactly what was said. Write it in Latin script, spelling Hindi words the way Indians type them in chats, and keep English words in English.
- Do not translate, correct, summarise, complete, answer or add anything, and never guess words you did not clearly hear.`;

/** The model's reply cut down to the transcript itself. */
export function cleanTranscript(text) {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(transcript(ion)?|text)\s*:\s*/i, "").replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (/^[([]?(no (clear )?speech|silence|inaudible|empty|no audio)[\])]?\.?$/i.test(t)) return "";
  return t.slice(0, 600);
}

/** The transcript from the model's reply: empty unless it says it heard speech. Plain text is tolerated. */
export function transcriptOf(reply) {
  const j = parseJSON(reply);
  if (j && typeof j === "object") return j.speech === true ? cleanTranscript(j.text) : "";
  return cleanTranscript(reply);
}

const limits = limiter(20, 5 * 60 * 1000);
export const resetLimits = limits.reset;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (limits.limited(callerIp(req))) { res.status(429).json({ error: "too many requests" }); return; }
  const body = parseBody(req.body);
  const audio = typeof body.audio === "string" ? body.audio : "";
  if (audio.length > MAX_AUDIO_B64) { res.status(413).json({ error: "clip too long" }); return; }
  if (audio.length < MIN_AUDIO_B64 || !WAV_B64.test(audio) || !B64.test(audio)) { res.status(400).json({ error: "expected a WAV clip" }); return; }
  if (!process.env.LLM_API_KEY) { res.status(501).json({ error: "not configured" }); return; }

  const hint = body.lang === "hi" ? " The speaker chose Hindi, so expect mostly Hindi or Hinglish." : "";
  const r = await chat({
    temperature: 0,
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT + hint }, { type: "input_audio", input_audio: { data: audio, format: "wav" } }] }],
  }, { budgetMs: 20000, perModelMs: 12000 });
  if (!("text" in r)) { res.status(r.status === 504 ? 504 : 502).json({ error: r.status === 504 ? "timeout" : `provider ${r.status}` }); return; }
  res.status(200).json({ text: transcriptOf(r.text), model: r.model });
}
