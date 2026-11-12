"use client";
// Word from the other side, wherever you are on the site: a toast, the count in the tab title, the header badge,
// and a system notification when the tab is in the background and the person has allowed them.
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useState } from "react";
import type { Arrival } from "@/lib/market";
import { cn } from "@/lib/utils";
import { SPRING } from "../site/Motion";
import { Avatar, Count } from "./Avatar";
import { inboxHref, isOpenThread, OPEN_THREAD, useArrivals, useInbox } from "./useInbox";

interface Toast { key: string; arrival: Arrival; who: string }
const SHOW_FOR = 6000;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The header link to the inbox, with the unread count. Shown only to someone signed in. */
export function InboxLink({ dark = false }: { dark?: boolean }) {
  const { me, unread } = useInbox();
  const [here, setHere] = useState(false);
  useEffect(() => { if (me) setHere(window.location.pathname === inboxHref(me)); }, [me]);
  if (!me) return null;
  return (
    <a href={inboxHref(me)} aria-current={here ? "page" : undefined} aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
      className={cn("press relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-medium no-underline transition-colors",
        dark ? "text-white hover:bg-white/10 aria-[current=page]:bg-white/10" : "text-foreground hover:bg-secondary aria-[current=page]:bg-secondary")}>
      Inbox
      <AnimatePresence initial={false}>
        {unread > 0 && (
          <motion.span key="count" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING}>
            <Count n={unread} />
          </motion.span>
        )}
      </AnimatePresence>
    </a>
  );
}

// Several headers may mount a notifier; only the first one speaks.
let speaker: string | null = null;

export function Notifier() {
  const id = useId();
  const [active, setActive] = useState(false);
  const { me, unread } = useInbox();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (speaker && speaker !== id) return;
    speaker = id;
    setActive(true);
    return () => { speaker = null; };
  }, [id]);

  // "(2) Bespoke" while anything is unread
  useEffect(() => {
    if (!active) return;
    const base = document.title.replace(/^\(\d+\+?\)\s/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
  }, [active, unread]);

  const onArrival = useCallback((arrival: Arrival) => {
    if (!active || !me || isOpenThread(arrival.request.id)) return;
    const r = arrival.request;
    const who = me.id === r.makerId ? r.customerName : r.makerName;
    const key = `${r.id}-${r.updatedAt}`;
    setToasts((t) => [...t.filter((x) => x.arrival.request.id !== r.id), { key, arrival, who }].slice(-3));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), SHOW_FOR);
    if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification(who, { body: arrival.kind === "request" ? `Sent you a design: ${r.design.title}` : r.lastMessage ?? "", tag: r.id });
      n.onclick = () => { window.focus(); window.location.href = inboxHref(me, r.id); };
    }
  }, [active, me]);
  useArrivals(onArrival);

  if (!active || !me) return null;
  const open = (t: Toast) => (e: React.MouseEvent) => {
    setToasts((all) => all.filter((x) => x.key !== t.key));
    if (window.location.pathname !== inboxHref(me)) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN_THREAD, { detail: t.arrival.request.id }));
  };

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 top-[84px] z-50 flex flex-col items-end gap-2 md:left-auto md:right-6 md:top-[92px]">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const r = t.arrival.request;
          return (
            <motion.div key={t.key} layout initial={{ opacity: 0, y: -16, scale: 0.94, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 24, scale: 0.96, filter: "blur(4px)" }} transition={SPRING} style={{ transformOrigin: "top right" }}
              className="pointer-events-auto relative w-full md:w-[360px]">
              <a href={inboxHref(me, r.id)} onClick={open(t)} data-testid="toast"
                className="flex items-start gap-3 rounded-[22px] bg-white/85 p-3 pr-11 text-brand-ink no-underline shadow-[0_24px_60px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl backdrop-saturate-[1.8] transition-colors hover:bg-white/95">
                <Avatar name={t.who} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium leading-tight">{t.who}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-brand-ink/50">{cap(r.design.title)}</span>
                  <span className="mt-1 line-clamp-2 block text-[14px] leading-snug text-brand-ink/80">
                    {t.arrival.kind === "request" ? "Sent you a new design." : r.lastMessage}
                  </span>
                </span>
              </a>
              <button type="button" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.key !== t.key))}
                className="press absolute right-2 top-2 grid size-8 place-items-center rounded-full text-brand-ink/40 transition-colors hover:bg-black/[.05] hover:text-brand-ink">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** System notifications, asked for only when the person presses the button. */
export function useAlerts(): { state: NotificationPermission | "unsupported"; ask: () => void } {
  const [state, setState] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => { setState("Notification" in window ? Notification.permission : "unsupported"); }, []);
  const ask = () => { void Notification.requestPermission().then(setState); };
  return { state, ask };
}
