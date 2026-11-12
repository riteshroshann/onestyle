// The marketplace kept in this browser's storage. It is the default when no cloud is configured, and what tests run against.
// Every call reads storage fresh, so a second tab's writes are always seen; a BroadcastChannel tells other tabs to refresh.
// Each tab remembers who signed in there, so a customer and a maker can try both sides in two tabs of one browser.
import { MarketError } from "./types.ts";
import type { DesignRequest, DesignSnapshot, Message, MessageKind, Profile, RequestStatus, Role, SignUp, Store } from "./types.ts";
import { BAD_LOGIN, EMAIL_TAKEN, NOT_AVAILABLE, NOT_SIGNED_IN, NOT_YOUR_REQUEST, NO_MAKER, checkSignUp, checkStatus, cleanBody, cleanNote, cleanSlots,
  missingNote, normalizeEmail, OFFLINE_EMAIL, preview, statusNote, wrongDoor } from "./rules.ts";

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface Channel { postMessage(message: unknown): void; onmessage: ((event: MessageEvent) => void) | null }
export type LocalStore = Store & { seedDemo(): Promise<void> };

const PREFIX = "bespoke.market.";
const CHANNEL_NAME = "bespoke.market";

// Passwords are kept only as a salted hash; demo makers have none, so nobody can sign in as one.
type Account = Profile & { salt?: string; hash?: string; demo?: boolean };
type StoredRequest = Omit<DesignRequest, "unread">;
type Threads = Record<string, Message[]>;
/** Per person, per request: how many messages of the thread they had seen at the last markRead. */
type Reads = Record<string, Record<string, number>>;

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

function browserStorage(): StorageLike {
  try { return globalThis.localStorage ?? createMemoryStorage(); } catch { return createMemoryStorage(); }
}

function tabStorage(): StorageLike | null {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function browserChannel(): Channel | null {
  if (typeof BroadcastChannel !== "undefined") return new BroadcastChannel(CHANNEL_NAME);
  return typeof window === "undefined" ? null : storageChannel();
}

/** For browsers without BroadcastChannel: a write to localStorage fires "storage" in every other tab. */
function storageChannel(): Channel {
  const key = PREFIX + "ping";
  const channel: Channel = {
    onmessage: null,
    postMessage(message) {
      try { localStorage.setItem(key, JSON.stringify({ message, nonce: Math.random() })); } catch { /* storage blocked */ }
    },
  };
  window.addEventListener("storage", (e) => {
    if (e.key !== key || !e.newValue) return;
    try { channel.onmessage?.({ data: JSON.parse(e.newValue).message } as MessageEvent); } catch { /* not ours */ }
  });
  return channel;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hashPassword(salt: string, password: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + password)));
}

const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);

function publicProfile(a: Account): Profile {
  const p: Profile = { id: a.id, role: a.role, name: a.name, email: a.email, city: a.city };
  if (a.role === "maker") { p.craft = a.craft; p.specialties = a.specialties ?? []; p.bio = a.bio ?? ""; }
  return p;
}

/**
 * `channel` null turns cross-tab messaging off; omitted, it uses BroadcastChannel when the browser has one.
 * `tab` is this tab's own storage (sessionStorage); null shares one session across every tab.
 */
export function createLocalStore(storage: StorageLike = browserStorage(), channel: Channel | null = browserChannel(), tab: StorageLike | null = tabStorage()): LocalStore {
  const load = <T>(name: string, fallback: T): T => {
    try { const raw = storage.getItem(PREFIX + name); return raw === null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
  };
  const save = (name: string, value: unknown) => {
    try { storage.setItem(PREFIX + name, JSON.stringify(value)); } catch { throw new MarketError("This browser could not save your data. Free some space and try again."); }
  };
  const accounts = () => load<Account[]>("users", []);
  const allRequests = () => load<StoredRequest[]>("requests", []);
  const allThreads = () => load<Threads>("messages", {});
  const allReads = () => load<Reads>("reads", {});

  // Timestamps never repeat, so ordering by time is always unambiguous.
  let lastTick = 0;
  const tick = () => (lastTick = Math.max(Date.now(), lastTick + 1));

  const changeListeners = new Set<() => void>();
  const sessionListeners = new Set<(p: Profile | null) => void>();
  const typingListeners = new Map<string, Set<(userId: string) => void>>();

  const currentAccount = (): Account | null => {
    const id = tab?.getItem(PREFIX + "session") ?? load<string | null>("session", null);
    return id ? accounts().find((a) => a.id === id) ?? null : null;
  };
  const currentProfile = () => { const a = currentAccount(); return a ? publicProfile(a) : null; };
  const requireMe = (): Account => {
    const me = currentAccount();
    if (!me) throw new MarketError(NOT_SIGNED_IN);
    return me;
  };

  let shownSession = currentAccount()?.id ?? null;
  const announceSession = () => {
    const now = currentAccount();
    if ((now?.id ?? null) === shownSession) return;
    shownSession = now?.id ?? null;
    const profile = now ? publicProfile(now) : null;
    sessionListeners.forEach((cb) => cb(profile));
  };
  const announceChange = () => { changeListeners.forEach((cb) => cb()); channel?.postMessage({ type: "change" }); };

  if (channel) channel.onmessage = (e) => {
    const data = e.data as { type?: string; requestId?: string; from?: string } | null;
    if (data?.type === "typing") {
      if (data.from && data.from !== currentAccount()?.id) typingListeners.get(data.requestId ?? "")?.forEach((cb) => cb(data.from!));
      return;
    }
    announceSession();
    changeListeners.forEach((cb) => cb());
  };

  const isParty = (r: StoredRequest, me: Account) => r.customerId === me.id || r.makerId === me.id;

  /** The request, if this person is one of its two parties. */
  function visible(id: string, me: Account, requests = allRequests()): StoredRequest {
    const r = requests.find((x) => x.id === id);
    if (!r || !isParty(r, me)) throw new MarketError(NOT_AVAILABLE);
    return r;
  }

  function unreadFor(r: StoredRequest, me: Account, threads: Threads, reads: Reads): number {
    const seen = reads[me.id]?.[r.id] ?? 0;
    return (threads[r.id] ?? []).slice(seen).filter((m) => m.senderId !== me.id).length;
  }

  const view = (r: StoredRequest, me: Account, threads = allThreads(), reads = allReads()): DesignRequest => ({ ...r, unread: unreadFor(r, me, threads, reads) });

  /** Adds a message to a thread and moves the request's activity forward. Callers save both afterwards. */
  function post(r: StoredRequest, threads: Threads, sender: Account, kind: MessageKind, body: string): Message {
    const createdAt = tick();
    const message: Message = { id: crypto.randomUUID(), requestId: r.id, senderId: sender.id, senderName: sender.name, kind, body, createdAt };
    (threads[r.id] ??= []).push(message);
    r.updatedAt = createdAt;
    r.lastMessage = preview(body);
    return message;
  }

  function makerOnly(id: string, me: Account, requests: StoredRequest[]): StoredRequest {
    const r = visible(id, me, requests);
    if (r.makerId !== me.id) throw new MarketError(NOT_YOUR_REQUEST);
    return r;
  }

  function open(account: Account) {
    save("session", account.id);
    try { tab?.setItem(PREFIX + "session", account.id); } catch { /* tab storage blocked; the shared session still works */ }
    announceSession();
    announceChange();
    return publicProfile(account);
  }

  return {
    mode: "local",

    async session() { return currentProfile(); },

    onSession(cb) {
      sessionListeners.add(cb);
      return () => void sessionListeners.delete(cb);
    },

    async signUp(input: SignUp) {
      const clean = checkSignUp(input);
      const salt = newSalt();
      const hash = await hashPassword(salt, clean.password);
      const existing = accounts();
      if (existing.some((a) => a.email === clean.email)) throw new MarketError(EMAIL_TAKEN);
      const account: Account = { id: crypto.randomUUID(), role: clean.role, name: clean.name, email: clean.email, city: clean.city, salt, hash };
      if (clean.role === "maker") Object.assign(account, { craft: clean.craft, specialties: clean.specialties, bio: clean.bio });
      save("users", [...existing, account]);
      return open(account);
    },

    async signIn(email: string, password: string, role: Role) {
      const account = accounts().find((a) => a.email === normalizeEmail(email));
      // Same message for an unknown email and a wrong password, so the form does not reveal who has an account.
      if (!account?.salt || !account.hash || (await hashPassword(account.salt, password)) !== account.hash) throw new MarketError(BAD_LOGIN);
      if (account.role !== role) throw wrongDoor(account.role);
      return open(account);
    },

    async signOut() {
      storage.removeItem(PREFIX + "session");
      tab?.removeItem(PREFIX + "session");
      announceSession();
      announceChange();
    },

    // this browser-only store has no email; the online service does these
    async resetPassword() { throw new MarketError(OFFLINE_EMAIL); },
    async updatePassword() { throw new MarketError(OFFLINE_EMAIL); },
    async resendConfirmation() { throw new MarketError(OFFLINE_EMAIL); },

    async makers() {
      if (!currentAccount()) return [];
      return accounts().filter((a) => a.role === "maker").map(publicProfile);
    },

    async createRequest(makerId: string, design: DesignSnapshot, note: string) {
      const me = requireMe();
      if (me.role !== "customer") throw new MarketError("Only customers can send a design to a maker.");
      const maker = accounts().find((a) => a.id === makerId && a.role === "maker");
      if (!maker) throw new MarketError(NO_MAKER);
      const text = cleanNote(note);
      const createdAt = tick();
      const r: StoredRequest = { id: crypto.randomUUID(), customerId: me.id, customerName: me.name, makerId: maker.id, makerName: maker.name,
        design: JSON.parse(JSON.stringify(design)), status: "new", missing: [], createdAt, updatedAt: createdAt };
      const threads = allThreads();
      threads[r.id] = [];
      if (text) post(r, threads, me, "text", text);
      save("requests", [...allRequests(), r]);
      save("messages", threads);
      announceChange();
      return view(r, me, threads);
    },

    async requests() {
      const me = currentAccount();
      if (!me) return [];
      const threads = allThreads(), reads = allReads();
      return allRequests().filter((r) => isParty(r, me)).map((r) => view(r, me, threads, reads)).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async request(id: string) {
      const me = currentAccount();
      const r = me && allRequests().find((x) => x.id === id);
      return me && r && isParty(r, me) ? view(r, me) : null;
    },

    async setMissing(id: string, missing: string[], note: string) {
      const me = requireMe();
      const requests = allRequests();
      const r = makerOnly(id, me, requests);
      const slots = cleanSlots(missing);
      const threads = allThreads();
      r.missing = slots;
      if (slots.length) {
        r.status = "needs-info";
        post(r, threads, me, "missing", missingNote(slots, note));
      } else if (r.status === "needs-info" || r.status === "new") {
        r.status = "accepted";
        post(r, threads, me, "status", statusNote("accepted"));
      }
      save("requests", requests);
      save("messages", threads);
      announceChange();
      return view(r, me, threads);
    },

    async setStatus(id: string, status: RequestStatus) {
      const me = requireMe();
      const requests = allRequests();
      const r = makerOnly(id, me, requests);
      r.status = checkStatus(status);
      const threads = allThreads();
      post(r, threads, me, "status", statusNote(r.status));
      save("requests", requests);
      save("messages", threads);
      announceChange();
      return view(r, me, threads);
    },

    async messages(requestId: string) {
      const me = requireMe();
      visible(requestId, me);
      return [...(allThreads()[requestId] ?? [])];
    },

    async send(requestId: string, body: string) {
      const me = requireMe();
      const requests = allRequests();
      const r = visible(requestId, me, requests);
      const text = cleanBody(body);
      const threads = allThreads();
      const message = post(r, threads, me, "text", text);
      save("requests", requests);
      save("messages", threads);
      announceChange();
      return message;
    },

    async markRead(requestId: string) {
      const me = requireMe();
      visible(requestId, me);
      const reads = allReads();
      (reads[me.id] ??= {})[requestId] = (allThreads()[requestId] ?? []).length;
      save("reads", reads);
      announceChange();
    },

    subscribe(cb) {
      changeListeners.add(cb);
      return () => void changeListeners.delete(cb);
    },

    typing(requestId: string) {
      const me = currentAccount();
      const r = me && allRequests().find((x) => x.id === requestId);
      if (me && r && isParty(r, me)) channel?.postMessage({ type: "typing", requestId, from: me.id });
    },

    onTyping(requestId: string, cb: (userId: string) => void) {
      const set = typingListeners.get(requestId) ?? new Set();
      typingListeners.set(requestId, set.add(cb));
      return () => { set.delete(cb); if (!set.size) typingListeners.delete(requestId); };
    },

    async seedDemo() {
      if (accounts().some((a) => a.role === "maker")) return;
      save("users", [...accounts(), ...DEMO_MAKERS.map((m, i): Account => ({ ...m, id: crypto.randomUUID(), role: "maker", email: `sample-maker-${i + 1}@bespoke.invalid`, demo: true }))]);
      announceChange();
    },
  };
}

// Sample profiles so a new install has someone to send a design to. No reviews, no ratings, and they have no password.
const DEMO_MAKERS: Omit<Account, "id" | "role" | "email">[] = [
  { name: "Kavya Rao", city: "Bengaluru", craft: "Fashion designer", specialties: ["Bridal lehengas", "Lehenga cholis", "Custom embroidery"],
    bio: "Sample profile. Designs and cuts occasion wear from scratch, usually to a fitting or two." },
  { name: "Imran Sheikh", city: "Lucknow", craft: "Tailor", specialties: ["Kurtas and suits", "Sherwanis", "Chikankari finishing"],
    bio: "Sample profile. A tailor for kurtas, suits and festive menswear, working from measurements or an existing garment." },
  { name: "Sunita Devi Boutique", city: "Jaipur", craft: "Boutique", specialties: ["Blouses", "Saree finishing", "Block-print kurtis"],
    bio: "Sample profile. A small boutique stitching blouses and everyday ethnic wear in cotton and silk." },
  { name: "Arjun Nair", city: "Kochi", craft: "Tailor", specialties: ["Shirts and trousers", "Alterations", "Linen wear"],
    bio: "Sample profile. A tailor for shirts, trousers and alterations, with a preference for light cottons and linen." },
];

/** Adds the sample makers to a local store that has none. A cloud store ignores the call. */
export async function seedDemoMakers(store: Store): Promise<void> {
  if ("seedDemo" in store) await (store as LocalStore).seedDemo();
}
