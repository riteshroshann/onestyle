// The design in the studio. Signed out, it lives only for this browser tab's session, so a stranger on a shared
// device never opens someone else's design. Signed in, it is saved to the account (Supabase "designs" table) and
// the studio resumes the latest one on any device.
import { supabase } from "./supabase";

export interface DesignState<S = unknown, M = unknown, Me = unknown> { spec: S; msgs: M[]; meas: Me }

const ID = "bespoke.designId";
const KEYS = ["bespoke.spec", "bespoke.msgs", "bespoke.meas", "bespoke.past"];

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
  try { for (const k of [...KEYS, ID]) sessionStorage.removeItem(k); } catch { /* storage blocked */ }
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

async function signedIn(): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  try { return (await db.auth.getSession()).data.session?.user.id ?? null; } catch { return null; }
}

/** The account's latest design, or null when signed out, when there is none, or when the table is missing. */
export async function latestDesign(): Promise<(DesignState & { id: string }) | null> {
  if (!(await signedIn())) return null;
  const { data, error } = await supabase()!.from("designs").select("id,spec,msgs,measurements").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return { id: data.id, spec: data.spec, msgs: data.msgs ?? [], meas: data.measurements ?? {} };
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves the design to the account a moment after the last change. Empty designs are never saved. */
export function saveDesign(id: string, state: DesignState, title: string) {
  clearTimeout(timer);
  if (!state.msgs.length) return;
  timer = setTimeout(async () => {
    if (!(await signedIn())) return;
    await supabase()!.from("designs").upsert({
      id, title: title.slice(0, 120), spec: state.spec, msgs: state.msgs, measurements: state.meas, updated_at: new Date().toISOString(),
    });
  }, 1200);
}
