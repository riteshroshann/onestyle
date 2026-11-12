// node --experimental-strip-types tests/market.test.ts
// The marketplace store against in-memory storage: accounts, permissions, threads, unread counts, status flow.
import assert from "node:assert/strict";
import { createLocalStore, createMemoryStorage, seedDemoMakers } from "../lib/market/local.ts";
import type { Channel, StorageLike } from "../lib/market/local.ts";
import { MarketError, STATUS_LABEL } from "../lib/market/types.ts";
import type { DesignSnapshot, Store } from "../lib/market/types.ts";
import { MISSING_OPTIONS, missingLabel } from "../lib/market/missing.ts";
import { emptySpec } from "../lib/engine/spec.ts";

const design = { title: "Navy kurti", spec: emptySpec(), lines: [], measurements: {} } as unknown as DesignSnapshot;
const fresh = (storage: StorageLike = createMemoryStorage()) => createLocalStore(storage, null);
const refuses = (p: Promise<unknown>, message: string | RegExp) =>
  assert.rejects(p, (e: unknown) => e instanceof MarketError && (typeof message === "string" ? e.message === message : message.test(e.message)));

const customer = { email: "Asha@Example.com", password: "correct horse", name: "Asha", city: "Pune", role: "customer" as const };
const maker = { email: "dev@example.com", password: "needle-thread", name: "Dev Tailors", city: "Surat", role: "maker" as const, craft: "Tailor" as const, specialties: ["Kurtas"], bio: "Kurtas since 1998." };

// A signed-in pair, with a request from the customer to the maker.
async function scenario(note = "Please make it knee length.") {
  const storage = createMemoryStorage();
  const s = fresh(storage);
  const m = await s.signUp(maker);
  await s.signOut();
  const c = await s.signUp(customer);
  const r = await s.createRequest(m.id, design, note);
  return { storage, s, m, c, r };
}
const as = async (s: Store, who: { email: string; password: string; role: "customer" | "maker" }) => { await s.signOut(); return s.signIn(who.email, who.password, who.role); };

// 1. sign up both roles; passwords are never stored plain
{
  const storage = createMemoryStorage();
  const s = fresh(storage);
  const m = await s.signUp(maker);
  assert.equal(m.role, "maker");
  assert.equal(m.craft, "Tailor");
  assert.deepEqual(m.specialties, ["Kurtas"]);
  assert.equal(m.id.length > 10, true);
  assert.equal(JSON.stringify(m).includes("needle-thread"), false);
  await s.signOut();
  const c = await s.signUp(customer);
  assert.equal(c.role, "customer");
  assert.equal(c.email, "asha@example.com", "emails are stored lowercase");
  assert.equal(c.craft, undefined);
  assert.deepEqual(await s.session(), c);
  const raw = storage.getItem("bespoke.market.users") ?? "";
  assert.equal(raw.includes("correct horse"), false);
  assert.equal(raw.includes("needle-thread"), false);
  assert.match(raw, /"hash":"[0-9a-f]{64}"/);
}

// 2. validation
{
  const s = fresh();
  await refuses(s.signUp({ ...customer, name: "   " }), "Enter your name.");
  await refuses(s.signUp({ ...customer, email: "not-an-email" }), "Enter a valid email address.");
  await refuses(s.signUp({ ...customer, password: "short" }), "Use a password of at least 8 characters.");
  assert.equal(await s.session(), null, "failed sign-ups leave no session");
  await s.signUp(customer);
  await s.signOut();
  await refuses(s.signUp({ ...customer, email: " ASHA@example.com " }), "That email is already registered. Log in instead.");
}

// 3. sign in: same message for unknown email and wrong password; the wrong door is named
{
  const s = fresh();
  await s.signUp(maker);
  await s.signOut();
  await s.signUp(customer);
  await s.signOut();
  await refuses(s.signIn("nobody@example.com", "whatever123", "customer"), "That email or password is not right.");
  await refuses(s.signIn("asha@example.com", "wrong password", "customer"), "That email or password is not right.");
  await refuses(s.signIn("asha@example.com", "correct horse", "maker"), "This account is a customer account. Use the customer sign-in.");
  await refuses(s.signIn("dev@example.com", "needle-thread", "customer"), "This account is a maker account. Use the maker sign-in.");
  assert.equal(await s.session(), null, "a refused sign-in leaves no session");
  const ok = await s.signIn("ASHA@example.com", "correct horse", "customer");
  assert.equal(ok.name, "Asha");
  await s.signOut();
  assert.equal(await s.session(), null);
}

// 4. session persists across a re-created store on the same storage
{
  const { storage, c } = await scenario();
  const again = fresh(storage);
  assert.deepEqual(await again.session(), c);
  assert.equal((await again.requests()).length, 1);
  await again.signOut();
  assert.equal(await fresh(storage).session(), null);
}

// 5. creating requests
{
  const { s, m, c, r } = await scenario("  Please make it knee length.  ");
  assert.equal(r.status, "new");
  assert.equal(r.customerId, c.id);
  assert.equal(r.makerId, m.id);
  assert.equal(r.makerName, "Dev Tailors");
  assert.deepEqual(r.missing, []);
  assert.equal(r.design.title, "Navy kurti");
  assert.equal(r.unread, 0, "the sender has nothing unread");
  assert.equal(r.lastMessage, "Please make it knee length.");
  const thread = await s.messages(r.id);
  assert.equal(thread.length, 1);
  assert.equal(thread[0].kind, "text");
  assert.equal(thread[0].body, "Please make it knee length.");
  assert.equal(thread[0].senderId, c.id);
  assert.deepEqual(await s.request(r.id), r);

  const quiet = await s.createRequest(m.id, design, "   ");
  assert.equal((await s.messages(quiet.id)).length, 0, "a blank note posts nothing");
  assert.equal(quiet.lastMessage, undefined);

  await refuses(s.createRequest("no-such-maker", design, ""), "That maker could not be found.");
  await refuses(s.createRequest(c.id, design, ""), "That maker could not be found.");
  await refuses(s.createRequest(m.id, design, "x".repeat(2001)), /2000 characters/);
  assert.equal((await s.requests()).length, 2, "a refused request creates nothing");
}

// 6. only customers create requests; signed-out callers are told to sign in
{
  const { s, m } = await scenario();
  await as(s, { ...maker, role: "maker" });
  await refuses(s.createRequest(m.id, design, ""), "Only customers can send a design to a maker.");
  await s.signOut();
  await refuses(s.createRequest(m.id, design, ""), "Sign in to continue.");
  await refuses(s.send("x", "hi"), "Sign in to continue.");
  assert.deepEqual(await s.requests(), []);
  assert.deepEqual(await s.makers(), []);
}

// 7. makers() lists makers only, without private fields
{
  const { s, m } = await scenario();
  const list = await s.makers();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, m.id);
  assert.equal("hash" in list[0], false);
  assert.equal("salt" in list[0], false);
}

// 8. permissions: a third person cannot see, read, write or change the thread
{
  const { s, r } = await scenario();
  await s.signOut();
  const stranger = await s.signUp({ ...customer, email: "eve@example.com", name: "Eve" });
  assert.equal(await s.request(r.id), null);
  assert.deepEqual(await s.requests(), []);
  await refuses(s.messages(r.id), "That conversation is not available to you.");
  await refuses(s.send(r.id, "hello"), "That conversation is not available to you.");
  await refuses(s.markRead(r.id), "That conversation is not available to you.");
  await refuses(s.setStatus(r.id, "accepted"), "That conversation is not available to you.");
  await refuses(s.setMissing(r.id, ["fabric"], ""), "That conversation is not available to you.");
  assert.equal(stranger.role, "customer");
  const owner = await as(s, { ...customer, role: "customer" });
  assert.equal((await s.messages(r.id)).length, 1, "the thread is untouched by the refused writes");
  assert.equal(owner.name, "Asha");
}

// 9. only the request's maker may change status or missing details
{
  const { s, r } = await scenario();
  await refuses(s.setStatus(r.id, "accepted"), "Only the maker on this request can change it.");
  await refuses(s.setMissing(r.id, ["fabric"], ""), "Only the maker on this request can change it.");
  await s.signOut();
  await s.signUp({ ...maker, email: "other@example.com", name: "Other Tailor" });
  await refuses(s.setStatus(r.id, "accepted"), "That conversation is not available to you.");
}

// 10. messaging both ways, with trimming and length rules
{
  const { s, r } = await scenario();
  const first = await s.send(r.id, "  Is silk fine?  ");
  assert.equal(first.body, "Is silk fine?");
  assert.equal(first.kind, "text");
  await refuses(s.send(r.id, "   "), "Write a message first.");
  await refuses(s.send(r.id, ""), "Write a message first.");
  await refuses(s.send(r.id, "y".repeat(2001)), /up to 2000 characters/);
  const edge = await s.send(r.id, "z".repeat(2000));
  assert.equal(edge.body.length, 2000);

  await as(s, { ...maker, role: "maker" });
  const reply = await s.send(r.id, "Silk works well.");
  assert.equal(reply.senderName, "Dev Tailors");
  const thread = await s.messages(r.id);
  assert.deepEqual(thread.map((x) => x.body.slice(0, 12)), ["Please make ", "Is silk fine", "zzzzzzzzzzzz", "Silk works w"]);
  assert.equal(new Set(thread.map((x) => x.id)).size, 4, "ids are unique");
  assert.deepEqual(thread.map((x) => x.createdAt), [...thread.map((x) => x.createdAt)].sort((a, b) => a - b));
  assert.equal((await s.request(r.id))?.lastMessage, "Silk works well.");
}

// 11. unread is per person; markRead clears it; sending increments the other party
{
  const { s, r } = await scenario();
  assert.equal((await s.requests())[0].unread, 0, "own message is not unread");
  await s.send(r.id, "One");
  await s.send(r.id, "Two");
  await as(s, { ...maker, role: "maker" });
  assert.equal((await s.requests())[0].unread, 3, "maker sees the note and two messages");
  assert.equal((await s.request(r.id))?.unread, 3);
  await s.markRead(r.id);
  assert.equal((await s.requests())[0].unread, 0);
  await s.send(r.id, "Got it.");
  assert.equal((await s.requests())[0].unread, 0, "your own message never counts for you");
  await as(s, { ...customer, role: "customer" });
  assert.equal((await s.requests())[0].unread, 1, "the customer has only the maker's reply unread");
  await s.markRead(r.id);
  assert.equal((await s.requests())[0].unread, 0);
  await as(s, { ...maker, role: "maker" });
  assert.equal((await s.requests())[0].unread, 0, "reading is per person");
}

// 12. requests are sorted by latest activity
{
  const { s, m, r } = await scenario();
  const second = await s.createRequest(m.id, { ...design, title: "Second" }, "");
  assert.deepEqual((await s.requests()).map((x) => x.id), [second.id, r.id]);
  await s.send(r.id, "Bump");
  assert.deepEqual((await s.requests()).map((x) => x.id), [r.id, second.id]);
}

// 13. setMissing turns needs-info on and off
{
  const { s, r } = await scenario();
  await as(s, { ...maker, role: "maker" });
  const asked = await s.setMissing(r.id, ["sleeve.length", "fabric", "sleeve.length"], "Which sleeve length, and in what fabric?");
  assert.equal(asked.status, "needs-info");
  assert.deepEqual(asked.missing, ["sleeve.length", "fabric"]);
  assert.equal(asked.lastMessage, "Which sleeve length, and in what fabric?");
  let thread = await s.messages(r.id);
  assert.equal(thread.at(-1)?.kind, "missing");
  assert.equal(thread.at(-1)?.body, "Which sleeve length, and in what fabric?");

  const defaulted = await s.setMissing(r.id, ["bust", "waist", "date"], "  ");
  assert.equal(defaulted.status, "needs-info");
  thread = await s.messages(r.id);
  assert.equal(thread.at(-1)?.body, "Could you share the bust measurement, waist measurement and date needed?");
  const single = await s.setMissing(r.id, ["fabric"], "");
  assert.equal((await s.messages(r.id)).at(-1)?.body, "Could you share the fabric?");
  assert.equal(single.missing.length, 1);

  const cleared = await s.setMissing(r.id, [], "");
  assert.equal(cleared.status, "accepted");
  assert.deepEqual(cleared.missing, []);
  thread = await s.messages(r.id);
  assert.equal(thread.at(-1)?.kind, "status");
  assert.equal(thread.at(-1)?.body, "Marked as accepted.");

  // clearing does not drag a started job back to accepted
  await s.setStatus(r.id, "in-progress");
  const still = await s.setMissing(r.id, [], "");
  assert.equal(still.status, "in-progress");

  await refuses(s.setMissing(r.id, ["fabric"], "n".repeat(2001)), /2000 characters/);
  assert.equal((await s.request(r.id))?.status, "in-progress", "a refused note changes nothing");
}

// 14. setStatus posts a status message in the label's words
{
  const { s, r } = await scenario();
  await as(s, { ...maker, role: "maker" });
  const made = await s.setStatus(r.id, "in-progress");
  assert.equal(made.status, "in-progress");
  const last = (await s.messages(r.id)).at(-1)!;
  assert.equal(last.kind, "status");
  assert.equal(last.body, "Marked as being made.");
  assert.equal(last.senderName, "Dev Tailors");
  for (const status of Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]) {
    assert.equal((await s.setStatus(r.id, status)).status, status);
    assert.equal((await s.messages(r.id)).at(-1)?.body, `Marked as ${STATUS_LABEL[status].toLowerCase()}.`);
  }
  await refuses(s.setStatus(r.id, "shipped" as never), "That status is not one this request can have.");
  await as(s, { ...customer, role: "customer" });
  assert.equal((await s.requests())[0].unread > 0, true, "status changes notify the customer");
}

// 15. subscribe fires on changes, in this store and through another store on the same storage via a channel
{
  const { s, m, r } = await scenario();
  let hits = 0;
  const off = s.subscribe(() => hits++);
  await s.send(r.id, "ping");
  assert.equal(hits, 1);
  await s.markRead(r.id);
  assert.equal(hits, 2);
  await s.createRequest(m.id, design, "");
  assert.equal(hits, 3);
  off();
  await s.send(r.id, "silent");
  assert.equal(hits, 3, "unsubscribed callbacks stay quiet");
  await refuses(s.send(r.id, ""), "Write a message first.");
  assert.equal(hits, 3, "refused writes do not notify");
}
{
  const storage = createMemoryStorage();
  const ends: Channel[] = [];
  const pair = (): Channel => {
    const end: Channel = { onmessage: null, postMessage: (data) => ends.filter((e) => e !== end).forEach((e) => e.onmessage?.({ data } as MessageEvent)) };
    ends.push(end);
    return end;
  };
  const tabA = createLocalStore(storage, pair());
  const tabB = createLocalStore(storage, pair());
  let changes = 0;
  const sessions: (string | null)[] = [];
  tabB.subscribe(() => changes++);
  tabB.onSession((p) => sessions.push(p?.name ?? null));
  await tabA.signUp(maker);
  assert.equal(changes, 1, "another tab hears about a change");
  assert.deepEqual(sessions, ["Dev Tailors"], "another tab hears about the new session");
  assert.equal((await tabB.session())?.name, "Dev Tailors");
  await tabA.signOut();
  assert.deepEqual(sessions, ["Dev Tailors", null]);
}

// 16. onSession fires within the tab on sign-in and sign-out
{
  const s = fresh();
  const seen: (string | null)[] = [];
  const off = s.onSession((p) => seen.push(p?.name ?? null));
  await s.signUp(customer);
  await s.signOut();
  await s.signIn("asha@example.com", "correct horse", "customer");
  off();
  await s.signOut();
  assert.deepEqual(seen, ["Asha", null, "Asha"]);
}

// 17. demo makers: seeded once, only when there are none, with no sign-in and no ratings
{
  const storage = createMemoryStorage();
  const s = fresh(storage);
  await seedDemoMakers(s);
  await seedDemoMakers(s);
  await s.signUp(customer);
  const list = await s.makers();
  assert.equal(list.length, 4);
  assert.deepEqual(new Set(list.map((x) => x.craft)), new Set(["Fashion designer", "Tailor", "Boutique"]));
  assert.equal(list.every((x) => x.specialties!.length > 0 && x.bio && x.city), true);
  assert.equal(list.some((x) => x.specialties!.includes("Bridal lehengas")), true);
  assert.equal(list.some((x) => /rating|review|stars?/i.test(JSON.stringify(x))), false);
  await s.signOut();
  await refuses(s.signIn(list[0].email, "", "maker"), "That email or password is not right.");
  await refuses(s.signIn(list[0].email, "undefined", "maker"), "That email or password is not right.");

  // a customer can send a design to a sample maker
  await s.signIn("asha@example.com", "correct horse", "customer");
  assert.equal((await s.createRequest(list[0].id, design, "Hello")).makerName, list[0].name);

  const real = fresh();
  await real.signUp(maker);
  await seedDemoMakers(real);
  assert.equal((await real.makers()).length, 1, "no samples are added once a real maker exists");
}

// 18. missing-detail labels
{
  assert.equal(MISSING_OPTIONS.length >= 10, true);
  assert.equal(new Set(MISSING_OPTIONS.map((o) => o.slot)).size, MISSING_OPTIONS.length);
  assert.equal(missingLabel("sleeve.length"), "Sleeve length");
  assert.equal(missingLabel("neckline.depth"), "Neckline depth");
  assert.equal(missingLabel("embellishment.type"), "Embellishment type");
}

console.log("market tests passed");
