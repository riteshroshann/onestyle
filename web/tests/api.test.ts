// node --experimental-strip-types tests/api.test.ts
// The language-model function, tested against a mocked provider: what it accepts, what it refuses, how it fails.
import assert from "node:assert/strict";

function mockRes() {
  const r: any = { code: 0, body: null };
  r.status = (c: number) => { r.code = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
}
const req = (message: string) => ({ method: "POST", body: { message, design: "" } });

// 1. no key: the function says so and the app falls back to the device
delete process.env.LLM_API_KEY;
let mod = await import("../api/understand.js");
let res = mockRes();
await mod.default(req("a navy hoodie"), res);
assert.equal(res.code, 501);

// 2. validation: ontology values pass, invented values are dropped, unknown garments and details become notes
const ups = mod.clean({
  set: { garment: "co-ord set", "bodice.fit": "loose", fabric: "unobtainium", "neckline.depth": "deep" },
  add: { components: ["sweatshirt", "trousers"], colour: ["navy", "ultraviolet-ish"], occasion: ["winter"] },
  exclude: [{ slot: "embellishment", value: "sequins" }, { slot: "colour", value: "not-a-colour" }],
  intensity: { "neckline.depth": "slight" },
  notes: ["kangaroo pocket", "drawstring waist"],
}, "sweatshirt and pants cord set for the cold");
const pick = (op: string, slot: string) => ups.filter((u: any) => u.op === op && u.slot === slot).map((u: any) => u.value.value);
assert.deepEqual(pick("set", "garment"), ["co-ord set"]);
assert.deepEqual(pick("set", "fabric"), []);
assert.deepEqual(pick("add", "colour"), ["navy"]);
assert.deepEqual(pick("add", "components"), ["sweatshirt", "trousers"]);
assert.deepEqual(pick("exclude", "embellishment"), ["sequins"]);
assert.deepEqual(pick("exclude", "colour"), []);
assert.deepEqual(pick("note", "notes"), ["kangaroo pocket", "drawstring waist"]);
assert.equal(ups.find((u: any) => u.slot === "neckline.depth").value.intensity, "slight");
assert.ok(ups.every((u: any) => u.value.src === "model"));

// 3. the full handler against a mocked OpenAI-compatible provider
process.env.LLM_API_KEY = "test-key";
let sent: any = null;
globalThis.fetch = (async (url: string, init: any) => {
  sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
  return new Response(JSON.stringify({ choices: [{ message: { content: '{"set":{"garment":"hoodie","bodice.fit":"loose"},"add":{"colour":["black"]},"exclude":[],"notes":["thumb holes"]}' } }] }), { status: 200 });
}) as any;
mod = await import("../api/understand.js?with-key");
res = mockRes();
await mod.default(req("black oversized hoodie with thumb holes"), res);
assert.equal(res.code, 200);
assert.match(sent.url, /chat\/completions$/);
assert.equal(sent.auth, "Bearer test-key");
assert.equal(sent.body.response_format.type, "json_object");
assert.ok(sent.body.messages[0].content.includes("co-ord set"));
assert.deepEqual(res.body.updates.map((u: any) => `${u.op}:${u.slot}:${u.value.value}`),
  ["set:garment:hoodie", "set:bodice.fit:loose", "add:colour:black", "note:notes:thumb holes"]);

// 4. a provider error is reported, not thrown, so the browser keeps the on-device answer
globalThis.fetch = (async () => new Response("quota", { status: 429 })) as any;
res = mockRes();
await mod.default(req("a red dress"), res);
assert.equal(res.code, 502);

console.log("ok: api validation, handler, failure paths");
