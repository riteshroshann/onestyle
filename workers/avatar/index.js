// The site's free backup on Workers AI, called by the Vercel functions with a shared key.
//   POST /       { prompt }    ->  { image: base64 jpeg }       outfit looks for api/avatar.js (FLUX schnell)
//   POST /chat   OpenAI body   ->  OpenAI chat completion       text and pictures when Gemini is busy (Llama 4 Scout)
// Secret: AVATAR_KEY, shared with Vercel as AVATAR_WORKER_KEY.
// Author: Ritesh Roshan
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const CHAT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const fail = (error, status) => Response.json({ error }, { status });

async function draw(body, env) {
  const { prompt } = body;
  if (typeof prompt !== "string" || prompt.length < 20 || prompt.length > 2000) return fail("expected a prompt", 400);
  const { image } = await env.AI.run(IMAGE_MODEL, { prompt, steps: 6 });
  return Response.json({ image });
}

async function chat(body, env) {
  const { messages, max_tokens = 800, temperature = 0.3 } = body;
  if (!Array.isArray(messages) || !messages.length) return fail("expected messages", 400);
  const out = await env.AI.run(CHAT_MODEL, { messages, max_tokens: Math.min(Number(max_tokens) || 800, 2048), temperature });
  const content = typeof out?.response === "string" ? out.response : JSON.stringify(out?.response ?? "");
  return Response.json({ model: CHAT_MODEL, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] });
}

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return fail("POST only", 405);
    if (!env.AVATAR_KEY || req.headers.get("Authorization") !== `Bearer ${env.AVATAR_KEY}`) return fail("unauthorized", 401);
    const body = await req.json().catch(() => ({}));
    try {
      return new URL(req.url).pathname === "/chat" ? await chat(body, env) : await draw(body, env);
    } catch (e) {
      return fail(String(e?.message ?? e).slice(0, 200), 502);
    }
  },
};
