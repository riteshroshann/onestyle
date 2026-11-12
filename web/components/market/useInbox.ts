"use client";
// React's view of the page's one live inbox (lib/market/inbox.ts), plus the thread that is open right now,
// so a toast never announces a message the person is already looking at.
import { useEffect, useSyncExternalStore } from "react";
import { EMPTY, getInbox } from "@/lib/market";
import type { Arrival, InboxState, Profile } from "@/lib/market";

const subscribe = (cb: () => void) => getInbox().subscribe(cb);
const snapshot = () => getInbox().get();
const serverSnapshot = () => EMPTY;

export function useInbox(): InboxState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useArrivals(cb: (a: Arrival) => void) {
  useEffect(() => getInbox().onArrival(cb), [cb]);
}

let openThread: string | null = null;
export const setOpenThread = (id: string | null) => { openThread = id; };
export const isOpenThread = (id: string) => openThread === id && document.visibilityState === "visible";

export const inboxHref = (me: Pick<Profile, "role">, requestId?: string) =>
  `${me.role === "maker" ? "/makers/" : "/orders/"}${requestId ? `?r=${encodeURIComponent(requestId)}` : ""}`;

/** Fired on the inbox page so a toast opens its thread without a reload. */
export const OPEN_THREAD = "bespoke:open-thread";
