// Vercel function: speech to text for the studio's microphone, through Gemini's OpenAI-compatible endpoint.
// The browser records, encodes 16 kHz mono WAV (at most about 30 seconds) and sends it here; the transcript goes
// back into the composer for the customer to check before sending. Audio and text are never logged or stored.
//
// Environment: LLM_API_KEY (required), LLM_BASE_URL, LLM_MODEL (comma-separated, tried in order).
import { callerIp, chat, limiter, parseBody } from "../lib/studio/server.js";

// 16 kHz x 16 bit mono is 32 KB a second; 1.4 MB of base64 is about 32 seconds, well under the 4.5 MB body limit
export const MAX_AUDIO_B64 = 1_400_000;
const MIN_AUDIO_B64 = 2_000;
const WAV_B64 = /^UklGR/;   // "RIFF"
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const PROMPT = `Transcribe this audio clip exactly as spoken. The speaker is describing clothes they want made, in English, Hindi or a mix of the two (Hinglish).
- Write everything in Latin script. Write Hindi words the way Indians type them in chats, for example: mujhe ek kurti chahiye, shaadi ke liye, gale ka design, thoda loose.
- Keep English words in English. Do not translate, correct, summarise, answer or add anything.
- Clothing words you may hear: kurti, kurta, lehenga, saree, blouse, dupatta, anarkali, sharara, palazzo, sherwani, chikankari, gota patti, zari, georgette, chanderi, mulmul, neckline, sleeves, maroon, mehendi, sangeet.
- Return only the transcript, with normal punctuation. If there is no clear speech, return exactly [no speech].`;

/** The model's reply cut down to the transcript itself. */
export function cleanTranscript(text) {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  t = t.replace(/^(transcript(ion)?|text)\s*:\s*/i, "").replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (/^[([]?(no (clear )?speech|silence|inaudible|empty|no audio)[\])]?\.?$/i.test(t)) return "";
  return t.slice(0, 600);
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
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT + hint }, { type: "input_audio", input_audio: { data: audio, format: "wav" } }] }],
  }, { budgetMs: 20000, perModelMs: 12000 });
  if (!("text" in r)) { res.status(r.status === 504 ? 504 : 502).json({ error: r.status === 504 ? "timeout" : `provider ${r.status}` }); return; }
  res.status(200).json({ text: cleanTranscript(r.text), model: r.model });
}
