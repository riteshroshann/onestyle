"use client";
import { useEffect, useState } from "react";
import { DotmTriangle7 } from "@/components/ui/dotm-triangle-7";

const SHOWN_MS = 700; // long enough to register as a loader, short enough not to feel like a wait

/** Covers the page on every fresh load until fonts are in, so nothing is seen half-dressed. */
export function Splash() {
  const [phase, setPhase] = useState<"on" | "leaving" | "off">("on");
  useEffect(() => {
    const started = performance.now();
    let timer = 0;
    document.fonts.ready.then(() => {
      timer = window.setTimeout(() => setPhase("leaving"), Math.max(0, SHOWN_MS - (performance.now() - started)));
    });
    return () => clearTimeout(timer);
  }, []);
  if (phase === "off") return null;
  return (
    <div
      role="status" aria-label="Loading Bespoke"
      onTransitionEnd={() => setPhase("off")}
      className={`fixed inset-0 z-[100] grid place-items-center bg-background transition-opacity duration-500 ${phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <DotmTriangle7 size={44} dotSize={7} ariaLabel="Loading" />
    </div>
  );
}
