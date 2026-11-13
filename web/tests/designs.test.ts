// node --experimental-strip-types tests/designs.test.ts
// The studio's draft: whose it is, and the copy that waits on the device for a sign-in. No browser, no network.
import assert from "node:assert/strict";

function storage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}
const session = storage(), device = storage();
Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true });
Object.defineProperty(globalThis, "localStorage", { value: device, configurable: true });
// parking only happens where there are accounts to sign in to; no request is ever made to this address
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://bespoke-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
const { claimDraft, clearSession, currentDesignId, draftOwner, parkDraft, takeParked, writeSession } = await import("../lib/designs.ts");

let n = 0;
const t = (name: string, f: () => void) => { try { f(); n++; } catch (e) { console.error(`FAIL ${name}`); throw e; } };
const design = { spec: { version: 1 }, msgs: [{ role: "me", text: "a navy kurti" }], meas: { bust: 34.5 } };
const PARKED = "bespoke.parked";

t("a tab keeps one design id until it is cleared", () => {
  const id = currentDesignId();
  assert.equal(currentDesignId(), id);
  clearSession();
  assert.notEqual(currentDesignId(), id);
});

t("an empty design is never parked", () => {
  parkDraft("d1", { ...design, msgs: [] });
  assert.equal(device.getItem(PARKED), null);
});

t("a signed-out draft waits on the device, and only a sign-in takes it", () => {
  parkDraft("d1", design);
  assert.equal(takeParked(null), null);
  assert.ok(device.getItem(PARKED), "still waiting after a signed-out look");
  assert.deepEqual(takeParked("user-a"), { id: "d1", ...design });
  assert.equal(device.getItem(PARKED), null);
  assert.equal(takeParked("user-a"), null);
});

t("a parked draft goes stale after two hours", () => {
  parkDraft("d1", design);
  const kept = JSON.parse(device.getItem(PARKED)!);
  device.setItem(PARKED, JSON.stringify({ ...kept, at: Date.now() - 2 * 60 * 60 * 1000 - 1 }));
  assert.equal(takeParked("user-a"), null);
  assert.equal(device.getItem(PARKED), null);
});

t("a stale draft is thrown away even when nobody is signed in", () => {
  device.setItem(PARKED, JSON.stringify({ id: "d1", ...design, at: 0 }));
  assert.equal(takeParked(null), null);
  assert.equal(device.getItem(PARKED), null);
});

t("a draft that belongs to an account is not parked", () => {
  claimDraft("user-a");
  assert.equal(draftOwner(), "user-a");
  parkDraft("d2", design);
  assert.equal(device.getItem(PARKED), null);
});

t("clearing the tab forgets the design and whose it was", () => {
  writeSession("bespoke.msgs", design.msgs);
  clearSession();
  assert.equal(draftOwner(), "");
  assert.equal(session.getItem("bespoke.msgs"), null);
});

t("a broken parked copy is ignored", () => {
  device.setItem(PARKED, "{not json");
  assert.equal(takeParked("user-a"), null);
});

console.log(`ok: ${n} design tests`);
