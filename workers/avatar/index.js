// Draws an outfit look for api/avatar.js with FLUX schnell on Workers AI (free daily quota).
// POST { prompt } with "Authorization: Bearer <AVATAR_KEY>"  ->  { image: base64 jpeg }
// Secret: AVATAR_KEY, shared with Vercel as AVATAR_WORKER_KEY.
// Author: Ritesh Roshan
const MODEL = "@cf/black-forest-labs/flux-1-schnell";

export default {
  async fetch(req, env) {
    if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
    if (!env.AVATAR_KEY || req.headers.get("Authorization") !== `Bearer ${env.AVATAR_KEY}`) return Response.json({ error: "unauthorized" }, { status: 401 });
    const { prompt } = await req.json().catch(() => ({}));
    if (typeof prompt !== "string" || prompt.length < 20 || prompt.length > 2000) return Response.json({ error: "expected a prompt" }, { status: 400 });
    try {
      const { image } = await env.AI.run(MODEL, { prompt, steps: 6 });
      return Response.json({ image });
    } catch (e) {
      return Response.json({ error: String(e?.message ?? e).slice(0, 200) }, { status: 502 });
    }
  },
};
