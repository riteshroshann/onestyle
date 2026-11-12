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

export function Header({ current, cta = true }: { current?: string; cta?: boolean }) {
  const me = useSession();
  const link = "press rounded-full px-4 py-2 text-[15px] font-semibold text-foreground no-underline hover:bg-secondary";
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-foreground/10 bg-white">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-4 px-5 md:px-10">
        <a href="/" aria-label="Bespoke home" className="display inline-flex items-center gap-2 text-[34px] text-foreground no-underline"><Mark className="size-6" />Bespoke</a>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined} className={cn(link, "hidden aria-[current=page]:bg-secondary sm:block")}>{l.label}</a>
          ))}
          {me === null && <a href="/login/" className={link}>Sign in</a>}
          {me && <a href={homeFor(me)} className={link}>{me.name.split(" ")[0]}</a>}
        </nav>
        {cta && <div className="hidden sm:block"><Cta href="/studio/" className="h-11 px-6 font-semibold">Start a design</Cta></div>}
      </div>
    </header>
  );
}
