"use client";
import { Mark } from "./Mark";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { getStore } from "@/lib/market";
import type { Profile } from "@/lib/market";
import { cn } from "@/lib/utils";
import { SPRING } from "./Motion";

const LINKS = [
  { href: "/studio/", label: "Studio" },
  { href: "/makers/", label: "For makers" },
  { href: "/about/", label: "About" },
  { href: "https://riteshroshann.github.io/onestyle/", label: "Docs" },
];

/** "Log in" on customer pages asks which door: a customer or a maker. */
function SignInMenu({ className, dark }: { className: string; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  const doors = [["/login/", "I am a customer", "Design and order clothes"], ["/makers/login/", "I am a maker", "Receive and make requests"]];
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className={cn(className, open && (dark ? "bg-white/10" : "bg-secondary"))}>Log in</button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" aria-label="Log in as" initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={SPRING}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-[48px] w-[260px] rounded-[22px] bg-white/90 p-1.5 shadow-[0_24px_60px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl">
            {doors.map(([href, title, note]) => (
              <a key={href} href={href} role="menuitem" className="block rounded-[16px] px-4 py-3 text-brand-ink no-underline transition-colors hover:bg-black/[.04]">
                <span className="block text-[15px] font-medium">{title}</span>
                <span className="block text-[13px] text-brand-ink/55">{note}</span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const homeFor = (p: Profile) => (p.role === "maker" ? "/makers/" : "/orders/");

export function useSession() {
  const [me, setMe] = useState<Profile | null | undefined>(undefined); // undefined until the store has answered
  useEffect(() => {
    const store = getStore();
    store.session().then(setMe).catch(() => setMe(null));
    return store.onSession(setMe);
  }, []);
  return me;
}

export function Header({ current, tone = "light", audience = "customer" }: { current?: string; tone?: "light" | "dark"; audience?: "customer" | "maker" }) {
  // makers never need the customer studio in their nav, and log in at their own door
  const links = audience === "maker" ? LINKS.filter((l) => l.href !== "/studio/") : LINKS;
  const signIn = audience === "maker" ? "/makers/login/" : "/login/";
  const me = useSession();
  const dark = tone === "dark";
  const link = cn("press rounded-full px-4 py-2 text-[15px] font-medium no-underline transition-colors", dark ? "text-white hover:bg-white/10" : "text-foreground hover:bg-secondary");
  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3 md:top-4 md:px-6">
      <div className={cn(
        "pointer-events-auto mx-auto flex h-[60px] max-w-[1180px] items-center gap-3 rounded-full pl-5 pr-2 backdrop-blur-2xl backdrop-saturate-[1.8]",
        "shadow-[0_8px_32px_-12px_rgba(13,17,23,.18),inset_0_1px_0_rgba(255,255,255,.6)] ring-1",
        dark ? "bg-brand-ink/70 ring-white/10" : "bg-white/65 ring-black/[.06]",
      )}>
        <a href="/" aria-label="Bespoke home" className={cn("inline-flex items-center gap-2 text-[21px] font-medium tracking-[-0.03em] no-underline", dark ? "text-white" : "text-foreground")}><Mark className="size-5" />Bespoke</a>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          {links.map((l) => (
            <a key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined} className={cn(link, "hidden aria-[current=page]:bg-secondary sm:block", dark && "aria-[current=page]:bg-white/10")}>{l.label}</a>
          ))}
          {me === null && (audience === "maker" ? <a href={signIn} className={link}>Log in</a> : <SignInMenu className={link} dark={dark} />)}
        </nav>
      </div>
    </header>
  );
}
