"use client";
// The design, visualised: a generic model wearing it, redrawn after every change, drawn by api/avatar.js.
// The last look stays on screen, softly blurred, while the next one is drawn. No public fallback: free image
// services answer a busy limit with a picture of the error, which would land on screen as the look.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { avatarPrompt, outfitWords } from "../lib/avatar";
import type { Spec } from "../lib/engine/spec";
import { cn } from "@/lib/utils";
import { SOFT, SPRING } from "./site/Motion";

type State = { kind: "idle" } | { kind: "drawing" } | { kind: "ready"; src: string } | { kind: "failed" };
const drawn = new Map<string, string>(); // one drawing per prompt, for this visit
const WAIT_MS = 900; // a pause after the last change, so a burst of edits draws once
const MAIN_MS = 28000;

async function fromMain(prompt: string): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), MAIN_MS);
  try {
    const r = await fetch("/api/avatar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal: ctl.signal });
    if (!r.ok) return null;
    const b = await r.json();
    return typeof b.image === "string" && b.image.startsWith("data:image/") ? b.image : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export function OutfitLook({ spec, size = "hero", className }: { spec: Spec; size?: "hero" | "compact"; className?: string }) {
  const still = !!useReducedMotion();
  const prompt = spec.slots.garment ? avatarPrompt(spec) : "";
  const [state, setState] = useState<State>({ kind: "idle" });
  const [shown, setShown] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef("");

  useEffect(() => {
    if (!prompt) { setState({ kind: "idle" }); return; }
    const done = drawn.get(prompt);
    if (done) { setShown(done); setState({ kind: "ready", src: done }); return; }
    latest.current = prompt;
    setState({ kind: "drawing" });
    const t = setTimeout(async () => {
      const src = await fromMain(prompt);
      if (latest.current !== prompt) return;
      if (!src) { setState({ kind: "failed" }); return; }
      drawn.set(prompt, src);
      setShown(src);
      setState({ kind: "ready", src });
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [prompt, attempt]);

  if (!prompt) return null;
  const hero = size === "hero";
  const busy = state.kind === "drawing";
  return (
    <figure className={cn("m-0", className)}>
      <div className={cn("relative overflow-hidden bg-[#f5f5f7]", hero ? "aspect-[2/3] w-full max-w-[560px] rounded-[32px]" : "aspect-square w-full rounded-[24px]")}>
        {busy && !shown && <div className="aura opacity-40" aria-hidden="true" />}
        <AnimatePresence initial={false}>
          {shown && (
            <motion.img key={shown.slice(-48)} src={shown} alt={`A generic model wearing ${outfitWords(spec)}`}
              initial={{ opacity: 0, scale: still ? 1 : 1.03 }} animate={{ opacity: 1, scale: 1, filter: busy ? "blur(14px) saturate(.8)" : "blur(0px)" }} exit={{ opacity: 0 }}
              transition={{ ...SOFT, opacity: { duration: 0.5 } }}
              className="absolute inset-0 size-full object-cover" style={{ transformOrigin: "50% 0%" }} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {busy && (
            <motion.div key="drawing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}
              className="absolute inset-x-0 bottom-5 flex justify-center" role="status">
              <span className="flex items-center gap-2.5 rounded-full bg-white/85 py-2 pl-4 pr-5 text-[14px] font-medium shadow-[0_14px_40px_-18px_rgba(13,17,23,.4)] ring-1 ring-black/[.06] backdrop-blur-xl">
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((k) => <motion.span key={k} className="size-1.5 rounded-full bg-brand-ink/70" animate={still ? {} : { y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: k * 0.15 }} />)}
                </span>
                {shown ? "Redrawing your look" : "Drawing your look"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {state.kind === "failed" && !busy && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <p className="text-[17px] font-medium">We could not draw this look just now.</p>
              <p className="mt-1 text-[14px] text-brand-ink/55">The image service is busy. Your design is saved; try again in a minute.</p>
              <button type="button" onClick={() => setAttempt((a) => a + 1)}
                className="press mt-4 h-11 rounded-full bg-brand-ink px-5 text-[15px] font-medium text-white hover:bg-[#232c3b]">Try again</button>
            </div>
          </div>
        )}
      </div>
      <figcaption className={cn("max-w-[560px]", hero ? "mt-5" : "mt-3")}>
        {hero && <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-ink/45">Your look</p>}
        <p className={cn("leading-[1.45] text-brand-ink/70 [overflow-wrap:anywhere]", hero ? "mt-1.5 text-[16px]" : "text-[13px]")}>{outfitWords(spec).replace(/^a /, "A ")}.</p>
        <p className={cn("text-brand-ink/40", hero ? "mt-1 text-[13px]" : "mt-0.5 text-[12px]")}>An AI preview on a generic model. It redraws as you change the design.</p>
      </figcaption>
    </figure>
  );
}
