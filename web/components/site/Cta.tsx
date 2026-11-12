"use client";
import { MetalFx } from "metal-fx";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** The one primary action on a page: a black pill inside a liquid-metal ring. */
export function Cta({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  // MetalFx paints the fill itself (dark theme: a black core for the white label). The ring needs WebGL, which the server cannot know about, so it is added once the page is live
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const pill = (
    <a href={href} className={cn("press inline-flex h-12 items-center rounded-full bg-foreground px-7 text-[15px] font-medium text-background no-underline hover:bg-black", className)}>
      {children}
    </a>
  );
  return live ? <MetalFx variant="button" preset="chromatic" theme="dark" strength={1}>{pill}</MetalFx> : pill;
}
