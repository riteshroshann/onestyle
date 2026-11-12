// One live view of the signed-in person's inbox per page. The header badge, the toasts, the tab title and the inbox
// itself all read it, so a change costs one round trip to the store instead of one per component.
import type { DesignRequest, Profile, Store } from "./types.ts";

export interface InboxState {
  /** undefined until the store has answered. */
  me: Profile | null | undefined;
  /** Newest activity first; null until loaded. */
  requests: DesignRequest[] | null;
  /** Unread messages across every thread. */
  unread: number;
}

/** Something new from the other side: a message, or for a maker, a request that just arrived. */
export interface Arrival { kind: "message" | "request"; request: DesignRequest }

export interface Inbox {
  get(): InboxState;
  /** Starts watching the store on the first subscriber and stops after the last one leaves. */
  subscribe(cb: () => void): () => void;
  onArrival(cb: (a: Arrival) => void): () => void;
  /** Reloads now, for changes the store has no event for. */
  refresh(): Promise<void>;
}

export const EMPTY: InboxState = { me: undefined, requests: null, unread: 0 };

/** What is new between two loads for the same person. The first load is a baseline and reports nothing. */
export function arrivals(me: Profile, before: DesignRequest[] | null, after: DesignRequest[]): Arrival[] {
  if (!before) return [];
  const seen = new Map(before.map((r) => [r.id, r.unread]));
  const out: Arrival[] = [];
  for (const r of after) {
    const prev = seen.get(r.id);
    if (prev === undefined) { if (r.makerId === me.id) out.push({ kind: "request", request: r }); }
    else if (r.unread > prev) out.push({ kind: "message", request: r });
  }
  return out;
}

export function createInbox(store: Store, wait = 120): Inbox {
  let state = EMPTY;
  const listeners = new Set<() => void>();
  const arrivalListeners = new Set<(a: Arrival) => void>();
  let stop: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let run = 0;

  const set = (next: InboxState) => { state = next; listeners.forEach((cb) => cb()); };

  async function refresh() {
    const ticket = ++run;
    try {
      const me = await store.session();
      const requests = me ? await store.requests() : [];
      if (ticket !== run) return; // a newer load has started; its answer wins
      const sameMe = !!me && state.me?.id === me.id;
      const news = me && sameMe ? arrivals(me, state.requests, requests) : [];
      set({ me, requests, unread: requests.reduce((n, r) => n + r.unread, 0) });
      news.forEach((a) => arrivalListeners.forEach((cb) => cb(a)));
    } catch {
      if (ticket === run && state.requests === null) set({ ...state, me: state.me ?? null, requests: [] });
    }
  }

  // bursts of changes (a message and the request it moved) become one load
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), wait); };

  function watch() {
    if (stop) return;
    const offChange = store.subscribe(soon);
    const offSession = store.onSession(() => { state = EMPTY; void refresh(); });
    stop = () => { offChange(); offSession(); clearTimeout(timer); stop = null; };
    void refresh();
  }
  const unwatch = () => { if (!listeners.size && !arrivalListeners.size) stop?.(); };

  return {
    get: () => state,
    subscribe(cb) { listeners.add(cb); watch(); return () => { listeners.delete(cb); unwatch(); }; },
    onArrival(cb) { arrivalListeners.add(cb); watch(); return () => { arrivalListeners.delete(cb); unwatch(); }; },
    refresh,
  };
}
