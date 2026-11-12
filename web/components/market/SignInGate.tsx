"use client";
// The one way the site asks someone to sign in: a pane that says why, with Log in and Create account,
// and a return ticket to exactly where they were.
//
//   const { requireSignIn, gate } = useRequireSignIn();
//   const me = await requireSignIn("Save this design to your account so it follows you to any device.");
//   if (!me) return;          // the pane is open; nothing else to do
//   ...                       // signed in: carry on
//   return <>{...}{gate}</>;
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStore, safeNext } from "@/lib/market";
import type { Profile, Role } from "@/lib/market";
import { SPRING } from "../site/Motion";

const here = () => `${window.location.pathname}${window.location.search}`;

/** Log in and Create account, both returning to `next` (this page when omitted). */
export function SignInActions({ next, role = "customer" }: { next?: string; role?: Role }) {
  const [back, setBack] = useState(next ?? "/");
  useEffect(() => setBack(safeNext(next ?? here(), "/")), [next]);
  const base = role === "maker" ? "/makers" : "";
  const q = `?next=${encodeURIComponent(back)}`;
  return (
    <div className="flex flex-wrap gap-3">
      <a href={`${base}/login/${q}`} className="press inline-flex h-12 items-center rounded-full bg-brand-ink px-7 text-[15px] font-medium text-white no-underline transition-colors hover:bg-[#232c3b]">Log in</a>
      <a href={`${base}/signup/${q}`} className="press inline-flex h-12 items-center rounded-full px-7 text-[15px] font-medium text-brand-ink no-underline ring-1 ring-brand-ink/15 transition-colors hover:bg-brand-ink/[.04]">Create an account</a>
    </div>
  );
}

export interface GateAsk {
  /** One sentence on what the account is for, in the person's terms. */
  reason: string;
  title?: string;
  /** Where to come back to after signing in; defaults to this page. Only paths on this site are used. */
  next?: string;
  /** Set when only one kind of account can do this, such as sending a design (customers). */
  role?: Role;
}

/** The pane itself. Controlled: render it with an ask to show it. */
export function SignInGate({ ask, wrongRole, onClose }: { ask: GateAsk | null; wrongRole?: Role; onClose: () => void }) {
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ask) return;
    const before = document.activeElement as HTMLElement | null;
    pane.current?.querySelector<HTMLElement>("a")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); before?.focus?.(); };
  }, [ask, onClose]);

  const title = wrongRole ? `This needs a ${ask?.role ?? "customer"} account.` : ask?.title ?? "Sign in to keep going.";
  const lede = wrongRole
    ? `You are signed in as a ${wrongRole}. ${ask?.reason ?? ""}`.trim()
    : `${ask?.reason ?? ""} Whatever you were doing waits right here, and you come straight back to it.`.trim();

  return (
    <AnimatePresence>
      {ask && (
        <motion.div key="gate" className="fixed inset-0 z-[60] grid place-items-end bg-brand-ink/40 backdrop-blur-[2px] md:place-items-center md:p-6" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <motion.div ref={pane} role="dialog" aria-modal="true" aria-labelledby="gate-title" onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 24, opacity: 0, scale: 0.98 }} transition={SPRING}
            className="w-full rounded-t-[32px] bg-white px-7 pb-9 pt-8 shadow-[0_0_0_1px_rgba(13,17,23,.05),0_40px_90px_-40px_rgba(13,17,23,.35)] md:max-w-[480px] md:rounded-[32px] md:px-10 md:pt-10">
            <div className="flex items-start justify-between gap-6">
              <h2 id="gate-title" className="display text-[clamp(32px,4vw,42px)] leading-none">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Close"
                className="press -mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-brand-ink/50 transition-colors hover:bg-brand-ink/[.06] hover:text-brand-ink">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <p className="mt-4 text-[16px] leading-[1.5] text-brand-ink/60">{lede}</p>
            <div className="mt-8"><SignInActions next={ask.next} role={ask.role ?? "customer"} /></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Ask for an account only at the moment one is needed. Render `gate` once anywhere in the component. */
export function useRequireSignIn() {
  const [ask, setAsk] = useState<GateAsk | null>(null);
  const [wrongRole, setWrongRole] = useState<Role | undefined>();
  const close = useCallback(() => setAsk(null), []);

  /** Resolves with the person when they may go ahead; otherwise opens the pane and resolves with null. */
  const requireSignIn = useCallback(async (reason: string, options: Omit<GateAsk, "reason"> = {}): Promise<Profile | null> => {
    const me = await getStore().session().catch(() => null);
    if (me && (!options.role || me.role === options.role)) return me;
    setWrongRole(me ? me.role : undefined);
    setAsk({ reason, ...options });
    return null;
  }, []);

  return { requireSignIn, gate: <SignInGate ask={ask} wrongRole={wrongRole} onClose={close} /> };
}
