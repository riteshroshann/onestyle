// Speech for the studio: a recorded clip becomes 16 kHz mono WAV and is transcribed by /api/transcribe (Gemini).
// When that function is missing or fails, the caller falls back to the browser's recogniser, then on-device Whisper.

export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 30;

/** 16-bit PCM WAV from mono float samples. */
export function encodeWav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const n = Math.min(samples.length, rate * MAX_SECONDS);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** True when the clip holds more than a breath of sound. */
export function hasSpeech(samples: Float32Array, rate = SAMPLE_RATE): boolean {
  if (samples.length < rate * 0.3) return false;
  let loud = 0;
  for (let i = 0; i < samples.length; i += 160) if (Math.abs(samples[i]) > 0.02) loud++;
  return loud > 8;
}

let remote: boolean | null = null;

export type Remote = { text: string } | { error: "unavailable" | "failed" };

/** Transcribe a clip on the server. "unavailable" means the function is not set up, so later clips skip it. */
export async function transcribeRemote(samples: Float32Array, lang: "en" | "hi", ms = 20000, fetcher: typeof fetch = fetch): Promise<Remote> {
  if (remote === false) return { error: "unavailable" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetcher("/api/transcribe", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ audio: toBase64(encodeWav(samples)), format: "wav", lang }),
    });
    if (r.status === 404 || r.status === 405 || r.status === 501) { remote = false; return { error: "unavailable" }; }
    if (!r.ok) return { error: "failed" };
    remote = true;
    const j = await r.json();
    return typeof j.text === "string" ? { text: j.text.trim() } : { error: "failed" };
  } catch {
    return { error: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

export const resetRemote = () => { remote = null; };
