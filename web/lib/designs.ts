// The design in the studio. Signed out, it lives only for this browser tab's session, so a stranger on a shared
// device never opens someone else's design. Signed in, it is saved to the account (Supabase "designs" table) and
// the studio resumes the latest one on any device.
import { supabase } from "./supabase.ts";

export interface DesignState<S = unknown, M = unknown, Me = unknown> { spec: S; msgs: M[]; meas: Me }
export type SavedDesign = DesignState & { id: string };

const ID = "bespoke.designId";
const OWNER = "bespoke.owner"; // whose draft this tab holds: an account id, or "" for one made signed out
const KEYS = ["bespoke.spec", "bespoke.msgs", "bespoke.meas", "bespoke.past"];
const PARKED = "bespoke.parked";
const PARKED_FOR = 2 * 60 * 60 * 1000;

export const newDesignId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Designs used to persist in localStorage for every visitor; that copy is dropped once. */
export function forgetDeviceCopy() {
  try { for (const k of KEYS) localStorage.removeItem(k); } catch { /* storage blocked */ }
}

export function readSession<T>(k: string, d: T): T {
  try { const v = sessionStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
export function writeSession(k: string, v: unknown) {
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked or full */ }
}
export function clearSession() {
  try { for (const k of [...KEYS, ID, OWNER]) sessionStorage.removeItem(k); } catch { /* storage blocked */ }
}

/** The id of the design open in this tab; a new tab starts a new one. */
export function currentDesignId(): string {
  const id = readSession<string | null>(ID, null);
  if (id) return id;
  const fresh = newDesignId();
  writeSession(ID, fresh);
  return fresh;
}
export function setCurrentDesignId(id: string) { writeSession(ID, id); }

/** The signed-in account, or null when signed out or when this build has no Supabase keys. */
export async function accountId(): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  try { return (await db.auth.getSession()).data.session?.user.id ?? null; } catch { return null; }
}

// A draft saved under an account must not outlive its sign-out: the next person at this tab starts blank.
export const draftOwner = () => readSession<string>(OWNER, "");
export function claimDraft(uid: string | null) { writeSession(OWNER, uid ?? ""); }

/** A signed-out draft is also left on this device for two hours, so it survives the trip through sign-up: the
 *  confirmation link opens a new tab, where this tab's session does not exist. Only a sign-in picks it up. */
export function parkDraft(id: string, state: DesignState) {
  if (!supabase() || !state.msgs.length || draftOwner()) return;
  try { localStorage.setItem(PARKED, JSON.stringify({ id, ...state, at: Date.now() })); } catch { /* storage blocked or full */ }
}

/** The parked draft, handed to whoever has just signed in and removed; a stale one is thrown away. */
export function takeParked(uid: string | null): SavedDesign | null {
  try {
    const raw = localStorage.getItem(PARKED);
    if (!raw) return null;
    const { at, ...design } = JSON.parse(raw) as SavedDesign & { at: number };
    const stale = Date.now() - at > PARKED_FOR;
    if (stale || uid) localStorage.removeItem(PARKED);
    return !stale && uid && design.msgs?.length ? design : null;
  } catch {
    return null;
  }
}

/** The account's latest design, or null when signed out, when there is none, or when the table is missing. */
export async function latestDesign(): Promise<SavedDesign | null> {
  if (!(await accountId())) return null;
  const { data, error } = await supabase()!.from("designs").select("id,spec,msgs,measurements").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, spec: data.spec, msgs: data.msgs ?? [], meas: data.measurements ?? {} };
}

/** Writes a design to the account now. Does nothing when signed out. */
export async function storeDesign(id: string, state: DesignState, title: string) {
  if (!(await accountId())) return;
  await supabase()!.from("designs").upsert({
    id, title: title.slice(0, 120), spec: state.spec, msgs: state.msgs, measurements: state.meas, updated_at: new Date().toISOString(),
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let waiting: (() => void) | null = null;

/** Saves the design to the account a moment after the last change. Empty designs are never saved. */
export function saveDesign(id: string, state: DesignState, title: string) {
  clearTimeout(timer);
  waiting = state.msgs.length ? () => void storeDesign(id, state, title) : null;
  if (waiting) timer = setTimeout(flushDesign, 1200);
}

/** Sends a waiting save at once: the tab is being hidden, and the last change should not wait for it to come back. */
export function flushDesign() {
  clearTimeout(timer);
  waiting?.();
  waiting = null;
}
