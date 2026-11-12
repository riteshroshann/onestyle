// The marketplace on Supabase: Auth for sign-in, Postgres for data, Realtime for live updates.
// Row-level security in supabase/schema.sql is what enforces who may see and change what; the checks here only give clearer messages.
import { supabase } from "../supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MarketError } from "./types.ts";
import type { Craft, DesignRequest, DesignSnapshot, Message, MessageKind, Profile, RequestStatus, Role, SignUp, Store } from "./types.ts";
import { BAD_LOGIN, CHECK_EMAIL, EMAIL_TAKEN, NOT_AVAILABLE, NOT_SIGNED_IN, NOT_YOUR_REQUEST, NO_MAKER, TRY_AGAIN, checkSignUp, checkStatus, cleanBody, cleanNote, cleanSlots,
  missingNote, statusNote, wrongDoor } from "./rules.ts";

interface ProfileRow { id: string; role: Role; name: string; email: string; city: string; craft: Craft | null; specialties: string[] | null; bio: string | null }
interface RequestRow {
  id: string; customer_id: string; customer_name: string; maker_id: string; maker_name: string; design: DesignSnapshot;
  status: RequestStatus; missing: string[]; last_message: string | null; created_at: string; updated_at: string;
}
interface MessageRow { id: string; request_id: string; sender_id: string; sender_name: string; kind: MessageKind; body: string; created_at: string }

function toProfile(r: ProfileRow): Profile {
  const p: Profile = { id: r.id, role: r.role, name: r.name, email: r.email, city: r.city };
  if (r.role === "maker") { p.craft = r.craft ?? undefined; p.specialties = r.specialties ?? []; p.bio = r.bio ?? ""; }
  return p;
}

const toRequest = (r: RequestRow, unread: number): DesignRequest => ({
  id: r.id, customerId: r.customer_id, customerName: r.customer_name, makerId: r.maker_id, makerName: r.maker_name, design: r.design,
  status: r.status, missing: r.missing ?? [], createdAt: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at),
  lastMessage: r.last_message ?? undefined, unread,
});

const toMessage = (r: MessageRow): Message => ({
  id: r.id, requestId: r.request_id, senderId: r.sender_id, senderName: r.sender_name, kind: r.kind, body: r.body, createdAt: Date.parse(r.created_at),
});

/** Turns a Supabase Auth error into a sentence the person can act on. */
function authError(e: { message: string; code?: string; status?: number }): MarketError {
  const text = e.message.toLowerCase();
  if (e.code === "user_already_exists" || text.includes("already registered")) return new MarketError(EMAIL_TAKEN);
  if (e.code === "invalid_credentials" || text.includes("invalid login")) return new MarketError(BAD_LOGIN);
  if (e.code === "weak_password") return new MarketError("That password is too easy to guess. Choose a longer or less common one.");
  if (e.code === "email_address_invalid" || e.code === "validation_failed") return new MarketError("Enter a valid email address.");
  if (e.code === "email_not_confirmed") return new MarketError("Confirm your email first. We sent you a link.");
  if (e.status === 429 || e.code === "over_request_rate_limit" || e.code === "over_email_send_rate_limit") return new MarketError("Too many attempts. Wait a minute and try again.");
  return new MarketError(TRY_AGAIN);
}

/** Database errors are never shown raw; the person gets a plain retry message. */
function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new MarketError(TRY_AGAIN);
  return result.data;
}

/** For inserts that return the new row: no row back means the write did not land. */
function created<T>(result: { data: T | null; error: unknown }): T {
  const row = check(result);
  if (!row) throw new MarketError(TRY_AGAIN);
  return row;
}

export function createCloudStore(url: string, anonKey: string): Store {
  const db: SupabaseClient = supabase(url, anonKey)!;

  async function profileOf(id: string): Promise<Profile | null> {
    const row = check(await db.from("profiles").select("*").eq("id", id).maybeSingle<ProfileRow>());
    return row ? toProfile(row) : null;
  }

  async function requireMe(): Promise<Profile> {
    const { data } = await db.auth.getSession();
    const me = data.session ? await profileOf(data.session.user.id) : null;
    if (!me) throw new MarketError(NOT_SIGNED_IN);
    return me;
  }

  async function unreadCounts(): Promise<Map<string, number>> {
    const rows = check(await db.rpc("unread_counts")) as { request_id: string; unread: number }[] | null;
    return new Map((rows ?? []).map((r) => [r.request_id, Number(r.unread)]));
  }

  /** The request row, or a refusal when it does not exist or belongs to someone else (row-level security hides it). */
  async function fetchRequest(id: string): Promise<RequestRow> {
    const row = check(await db.from("requests").select("*").eq("id", id).maybeSingle<RequestRow>());
    if (!row) throw new MarketError(NOT_AVAILABLE);
    return row;
  }

  async function view(row: RequestRow): Promise<DesignRequest> {
    return toRequest(row, (await unreadCounts()).get(row.id) ?? 0);
  }

  async function postMessage(requestId: string, sender: Profile, kind: MessageKind, body: string): Promise<Message> {
    const row = created(await db.from("messages").insert({ request_id: requestId, sender_id: sender.id, sender_name: sender.name, kind, body }).select().single<MessageRow>());
    return toMessage(row);
  }

  async function makerOwned(id: string, me: Profile): Promise<RequestRow> {
    const row = await fetchRequest(id);
    if (row.maker_id !== me.id) throw new MarketError(NOT_YOUR_REQUEST);
    return row;
  }

  // Supabase asks that its own methods are not called inside the auth callback, so the lookup is deferred.
  function deliverSession(cb: (p: Profile | null) => void, userId: string | null) {
    setTimeout(() => { void (userId ? profileOf(userId).catch(() => null) : Promise.resolve(null)).then(cb); }, 0);
  }

  return {
    mode: "cloud",

    async session() {
      const { data } = await db.auth.getSession();
      return data.session ? profileOf(data.session.user.id) : null;
    },

    onSession(cb) {
      const { data } = db.auth.onAuthStateChange((_event, session) => deliverSession(cb, session?.user.id ?? null));
      return () => data.subscription.unsubscribe();
    },

    async signUp(input: SignUp) {
      const c = checkSignUp(input);
      const { data, error } = await db.auth.signUp({
        email: c.email, password: c.password,
        options: { data: { role: c.role, name: c.name, city: c.city, craft: c.craft ?? null, specialties: c.specialties ?? [], bio: c.bio ?? null } },
      });
      if (error) throw authError(error);
      // With email confirmation switched on, Supabase creates the account but returns no session.
      if (!data.session || !data.user) throw new MarketError(CHECK_EMAIL);
      const profile = await profileOf(data.user.id);
      if (!profile) throw new MarketError(TRY_AGAIN);
      return profile;
    },

    async signIn(email: string, password: string, role: Role) {
      const { data, error } = await db.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw authError(error);
      const profile = await profileOf(data.user.id);
      if (!profile) throw new MarketError(TRY_AGAIN);
      if (profile.role !== role) {
        await db.auth.signOut();
        throw wrongDoor(profile.role);
      }
      return profile;
    },

    async signOut() {
      const { error } = await db.auth.signOut();
      if (error) throw new MarketError(TRY_AGAIN);
    },

    async makers() {
      const rows = check(await db.from("profiles").select("*").eq("role", "maker").order("name"));
      return (rows as ProfileRow[]).map(toProfile);
    },

    async createRequest(makerId: string, design: DesignSnapshot, note: string) {
      const me = await requireMe();
      if (me.role !== "customer") throw new MarketError("Only customers can send a design to a maker.");
      const maker = await profileOf(makerId);
      if (!maker || maker.role !== "maker") throw new MarketError(NO_MAKER);
      const text = cleanNote(note);
      const row = created(await db.from("requests").insert({
        customer_id: me.id, customer_name: me.name, maker_id: maker.id, maker_name: maker.name, design,
      }).select().single<RequestRow>());
      if (text) await postMessage(row.id, me, "text", text);
      return view(await fetchRequest(row.id));
    },

    async requests() {
      const { data } = await db.auth.getSession();
      if (!data.session) return [];
      const [rows, unread] = await Promise.all([
        db.from("requests").select("*").order("updated_at", { ascending: false }).then((r) => check(r) as RequestRow[]),
        unreadCounts(),
      ]);
      return rows.map((r) => toRequest(r, unread.get(r.id) ?? 0));
    },

    async request(id: string) {
      const row = check(await db.from("requests").select("*").eq("id", id).maybeSingle<RequestRow>());
      return row ? view(row) : null;
    },

    async setMissing(id: string, missing: string[], note: string) {
      const me = await requireMe();
      const current = await makerOwned(id, me);
      const slots = cleanSlots(missing);
      const reopened = !slots.length && (current.status === "needs-info" || current.status === "new");
      const status: RequestStatus = slots.length ? "needs-info" : reopened ? "accepted" : current.status;
      const body = slots.length ? missingNote(slots, note) : reopened ? statusNote("accepted") : "";
      check(await db.from("requests").update({ missing: slots, status }).eq("id", id));
      if (body) await postMessage(id, me, slots.length ? "missing" : "status", body);
      return view(await fetchRequest(id));
    },

    async setStatus(id: string, status: RequestStatus) {
      const me = await requireMe();
      await makerOwned(id, me);
      const next = checkStatus(status);
      check(await db.from("requests").update({ status: next }).eq("id", id));
      await postMessage(id, me, "status", statusNote(next));
      return view(await fetchRequest(id));
    },

    async messages(requestId: string) {
      await requireMe();
      await fetchRequest(requestId);
      const rows = check(await db.from("messages").select("*").eq("request_id", requestId).order("created_at"));
      return (rows as MessageRow[]).map(toMessage);
    },

    async send(requestId: string, body: string) {
      const me = await requireMe();
      const text = cleanBody(body);
      await fetchRequest(requestId);
      return postMessage(requestId, me, "text", text);
    },

    async markRead(requestId: string) {
      await requireMe();
      check(await db.rpc("mark_read", { rid: requestId }));
    },

    subscribe(cb) {
      const channel = db.channel(`bespoke-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => cb())
        .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => cb())
        .subscribe();
      return () => void db.removeChannel(channel);
    },
  };
}
