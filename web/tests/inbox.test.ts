// node --experimental-strip-types tests/inbox.test.ts
// The live inbox over the local store: unread totals, arrivals, ordering, per-tab sessions, typing, and the safety rules
// the cloud enforces with row-level security, mirrored here.
import assert from "node:assert/strict";
import { createLocalStore, createMemoryStorage } from "../lib/market/local.ts";
import type { Channel, StorageLike } from "../lib/market/local.ts";
import { arrivals, createInbox } from "../lib/market/inbox.ts";
import type { Arrival } from "../lib/market/inbox.ts";
import { MarketError } from "../lib/market/types.ts";
import type { DesignRequest, DesignSnapshot, Profile } from "../lib/market/types.ts";
import { MAX_BODY, QUICK_REPLIES, initials, safeNext } from "../lib/market/rules.ts";
import { emptySpec } from "../lib/engine/spec.ts";

const design = { title: "Navy kurti", spec: emptySpec(), lines: [], measurements: { bust: 36 } } as unknown as DesignSnapshot;
const customer = { email: "asha@example.com", password: "correct horse", name: "Asha Patil", city: "Pune", role: "customer" as const };
const maker = { email: "dev@example.com", password: "needle-thread", name: "Dev Tailors", city: "Surat", role: "maker" as const, craft: "Tailor" as const };
const refuses = (p: Promise<unknown>, message: string | RegExp) =>
  assert.rejects(p, (e: unknown) => e instanceof MarketError && (typeof message === "string" ? e.message === message : message.test(e.message)));
const settle = () => new Promise((r) => setTimeout(r, 5));

/** Two tabs of one browser: shared storage, a channel between them, and each tab's own session storage. */
function twoTabs() {
  const storage = createMemoryStorage();
  const ends: Channel[] = [];
  const end = (): Channel => {
    const e: Channel = { onmessage: null, postMessage: (data) => ends.filter((x) => x !== e).forEach((x) => x.onmessage?.({ data } as MessageEvent)) };
    ends.push(e);
    return e;
  };
  const tab = (): StorageLike => createMemoryStorage();
  return { storage, a: createLocalStore(storage, end(), tab()), b: createLocalStore(storage, end(), tab()) };
}

// 1. each tab keeps its own signed-in person; a new tab picks up the last sign-in
{
  const { storage, a, b } = twoTabs();
  const m = await a.signUp(maker);
  const c = await b.signUp(customer);
  assert.equal((await a.session())?.id, m.id, "tab A is still the maker");
  assert.equal((await b.session())?.id, c.id, "tab B is the customer");
  const fresh = createLocalStore(storage, null, createMemoryStorage());
  assert.equal((await fresh.session())?.id, c.id, "a new tab opens as whoever signed in last");
  await b.signOut();
  assert.equal(await b.session(), null);
  assert.equal((await a.session())?.id, m.id, "signing out one tab leaves the other as it was");
}

// 2. the inbox: baseline first, then message and request arrivals, totals, newest first
{
  const { a: makerTab, b: customerTab } = twoTabs();
  const m = await makerTab.signUp(maker);
  await customerTab.signUp(customer);
  const inbox = createInbox(makerTab, 0);
  const got: Arrival[] = [];
  let changes = 0;
  const offState = inbox.subscribe(() => changes++);
  const offArrival = inbox.onArrival((x) => got.push(x));
  await settle();
  assert.equal(inbox.get().me?.id, m.id);
  assert.deepEqual(inbox.get().requests, []);
  assert.equal(got.length, 0, "the first load is a baseline");

  const first = await customerTab.createRequest(m.id, design, "Hello, can you make this?");
  await settle();
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "request", "a maker hears about a new request");
  assert.equal(inbox.get().unread, 1);

  const second = await customerTab.createRequest(m.id, { ...design, title: "Silk blouse" }, "");
  await customerTab.send(first.id, "Also, I need it by June.");
  await settle();
  assert.deepEqual(got.slice(1).map((x) => `${x.kind} ${x.request.design.title}`).sort(), ["message Navy kurti", "request Silk blouse"]);
  assert.equal(inbox.get().unread, 2, "the note and the follow-up; the empty request adds nothing");
  assert.deepEqual(inbox.get().requests?.map((r) => r.id), [first.id, second.id], "the thread with the latest message comes first");

  await makerTab.markRead(first.id);
  await settle();
  assert.equal(inbox.get().unread, 0, "reading clears the total");
  assert.equal(got.length, 3, "reading is not an arrival");
  await makerTab.send(first.id, "Yes, June works.");
  await settle();
  assert.equal(got.length, 3, "your own message is not an arrival");
  assert.ok(changes > 0);

  offState();
  offArrival();
  await customerTab.send(first.id, "Thanks!");
  await settle();
  assert.equal(inbox.get().unread, 0, "after the last listener leaves, the inbox stops loading");
}

// 3. arrivals(): customers are not told about requests they sent themselves; counts that drop are not news
{
  const me = { id: "c1", role: "customer" } as Profile;
  const r = (id: string, unread: number) => ({ id, unread, makerId: "m1", customerId: "c1" }) as DesignRequest;
  assert.deepEqual(arrivals(me, null, [r("x", 3)]), []);
  assert.deepEqual(arrivals(me, [], [r("x", 0)]), []);
  assert.deepEqual(arrivals(me, [r("x", 2)], [r("x", 1)]), []);
  assert.deepEqual(arrivals(me, [r("x", 1)], [r("x", 2)]).map((a) => a.kind), ["message"]);
}

// 4. typing reaches the other party's tab only, and only for a thread both are on
{
  const { a: makerTab, b: customerTab } = twoTabs();
  const m = await makerTab.signUp(maker);
  const c = await customerTab.signUp(customer);
  const r = await customerTab.createRequest(m.id, design, "");
  const heard: string[] = [];
  const off = makerTab.onTyping(r.id, (who) => heard.push(who));
  const own: string[] = [];
  customerTab.onTyping(r.id, (who) => own.push(who));
  customerTab.typing(r.id);
  assert.deepEqual(heard, [c.id]);
  assert.deepEqual(own, [], "you never see yourself typing");
  customerTab.typing("not-a-thread");
  assert.equal(heard.length, 1, "typing on a thread you are not on goes nowhere");
  off();
  customerTab.typing(r.id);
  assert.equal(heard.length, 1, "unsubscribed listeners stay quiet");
}

// 5. mirrored row-level security: a customer cannot open another customer's thread; only the maker moves status
{
  const { storage, a: makerTab, b: customerTab } = twoTabs();
  const m = await makerTab.signUp(maker);
  await customerTab.signUp(customer);
  const r = await customerTab.createRequest(m.id, design, "Private note");
  const eveTab = createLocalStore(storage, null, createMemoryStorage());
  await eveTab.signUp({ ...customer, email: "eve@example.com", name: "Eve" });
  assert.equal(await eveTab.request(r.id), null);
  assert.deepEqual(await eveTab.requests(), []);
  await refuses(eveTab.messages(r.id), "That conversation is not available to you.");
  await refuses(eveTab.markRead(r.id), "That conversation is not available to you.");
  const eveInbox = createInbox(eveTab, 0);
  const off = eveInbox.subscribe(() => {});
  await settle();
  assert.equal(eveInbox.get().unread, 0, "another person's unread never leaks into your total");
  off();
  await refuses(customerTab.setStatus(r.id, "accepted"), "Only the maker on this request can change it.");
  await refuses(customerTab.setMissing(r.id, ["bust"], ""), "Only the maker on this request can change it.");
  const moved = await makerTab.setStatus(r.id, "in-progress");
  assert.equal(moved.status, "in-progress");
}

// 6. message bodies are stored exactly as written (the page renders them as text) and long ones are refused
{
  const { a: makerTab, b: customerTab } = twoTabs();
  const m = await makerTab.signUp(maker);
  await customerTab.signUp(customer);
  const r = await customerTab.createRequest(m.id, design, "");
  const html = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
  assert.equal((await customerTab.send(r.id, html)).body, html);
  await refuses(customerTab.send(r.id, "a".repeat(MAX_BODY + 1)), /up to 2000 characters/);
  assert.equal((await makerTab.messages(r.id)).length, 1, "the refused message was never stored");
}

// 7. safeNext: only paths on this site
{
  const home = "/orders/";
  for (const ok of ["/studio/?view=sheet", "/orders/?r=abc", "/"]) assert.equal(safeNext(ok, home), ok);
  for (const bad of [null, "", "//evil.example/x", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "evil.example",
    "/\tevil", "/%0d", "/ok\n//evil"]) {
    const expected = bad === "/%0d" ? "/%0d" : home; // an encoded character is still a path here
    assert.equal(safeNext(bad, home), expected, `next=${JSON.stringify(bad)}`);
  }
}

// 8. small pieces the inbox shows
{
  assert.equal(initials("Kavya Rao"), "KR");
  assert.equal(initials("  asha  "), "A");
  assert.equal(initials("Sunita Devi Boutique"), "SB");
  assert.equal(initials(""), "?");
  assert.ok(QUICK_REPLIES.includes("Can you share a reference photo?"));
  assert.ok(QUICK_REPLIES.every((q) => q.length <= MAX_BODY && q === q.trim()));
}

console.log("inbox: all passed");
