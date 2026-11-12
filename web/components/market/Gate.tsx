"use client";
import { useEffect } from "react";
import type { Role } from "@/lib/market";
import { PHOTOS } from "@/lib/photos";
import { Header, homeFor, useSession } from "../site/Header";
import { Workspace } from "./Workspace";

function MakerLanding() {
  return (
    <>
      <Header current="/makers/" cta={false} />
      <main className="relative grid min-h-[100svh] place-items-center overflow-hidden bg-foreground px-6 pt-[72px] text-center text-white">
        <img src={PHOTOS.seamstress.src} alt={PHOTOS.seamstress.alt} className="absolute inset-0 size-full object-cover opacity-45 grayscale" />
        <div className="relative">
          <h1 className="display text-[clamp(64px,12vw,200px)]">Your studio.</h1>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a href="/makers/login/" className="press inline-flex h-14 items-center rounded-full bg-white px-9 text-[17px] font-semibold text-black no-underline hover:bg-white/90">Sign in</a>
            <a href="/makers/signup/" className="press inline-flex h-14 items-center rounded-full border-2 border-white px-9 text-[17px] font-semibold text-white no-underline hover:bg-white hover:text-black">Join as a maker</a>
          </div>
        </div>
      </main>
    </>
  );
}

/** Each side has its own door: customers to their requests, makers to their inbox. */
export function Gate({ door }: { door: Role }) {
  const me = useSession();
  useEffect(() => {
    if (door !== "customer" || me === undefined) return;
    if (me === null) window.location.href = "/login/?next=/orders/";
    else if (me.role === "maker") window.location.href = homeFor(me);
  }, [door, me]);

  if (me?.role === door) return <Workspace me={me} />;
  if (door === "maker" && me !== undefined) return <MakerLanding />;
  return null;
}
