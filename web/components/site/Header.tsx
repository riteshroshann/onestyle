"use client";
import { Mark } from "./Mark";
import { useEffect, useState } from "react";
import { getStore } from "@/lib/market";
import type { Profile } from "@/lib/market";
import { cn } from "@/lib/utils";
import { Cta } from "./Cta";

const LINKS = [
  { href: "/studio/", label: "Studio" },
  { href: "/makers/", label: "For makers" },
  { href: "/about/", label: "About" },
];

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

export function Header({ current, cta = true, tone = "light" }: { current?: string; cta?: boolean; tone?: "light" | "dark" }) {
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
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined} className={cn(link, "hidden aria-[current=page]:bg-secondary sm:block", dark && "aria-[current=page]:bg-white/10")}>{l.label}</a>
          ))}
          {me === null && <a href="/login/" className={link}>Sign in</a>}
        </nav>
        {cta && <div className="hidden sm:block"><Cta href="/studio/?new" tone={dark ? "light" : "dark"}>Start a design</Cta></div>}
      </div>
    </header>
  );
}
