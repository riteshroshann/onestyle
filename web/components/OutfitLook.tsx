"use client";
// The design, visualised: a generic model wearing it, redrawn after every change. The main image model answers
// through api/avatar.js; when it cannot, the open image model draws it instead. The last look stays on screen,
// softly blurred, while the next one is drawn.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { avatarPrompt, openImageUrl, outfitWords, seedOf } from "../lib/avatar";
import type { Spec } from "../lib/engine/spec";
import { cn } from "@/lib/utils";
import { SOFT, SPRING } from "./site/Motion";

type State = { kind: "idle" } | { kind: "drawing" } | { kind: "ready"; src: string; open: boolean } | { kind: "failed" };
const drawn = new Map<string, { src: string; open: boolean }>(); // one drawing per prompt, for this visit
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
const load = (src: string) => new Promise<string>((ok, no) => { const i = new Image(); i.onload = () => ok(src); i.onerror = no; i.src = src; });

export function OutfitLook({ spec, size = "hero", className }: { spec: Spec; size?: "hero" | "compact"; className?: string }) {
  const still = !!useReducedMotion();
  const prompt = spec.slots.garment ? avatarPrompt(spec) : "";
  // the same garment for the same wearer keeps the same model as details change
  const seed = seedOf(`${spec.slots.garment?.value ?? ""}|${spec.slots.wearer?.value ?? ""}`);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [shown, setShown] = useState<{ src: string; open: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef("");

  useEffect(() => {
    if (!prompt) { setState({ kind: "idle" }); return; }
    const done = drawn.get(prompt);
    if (done) { setShown(done); setState({ kind: "ready", ...done }); return; }
    latest.current = prompt;
    setState({ kind: "drawing" });
    const t = setTimeout(async () => {
      const main = await fromMain(prompt);
      const result = main ? { src: main, open: false } : await load(openImageUrl(prompt, seed)).then((src) => ({ src, open: true })).catch(() => null);
      if (latest.current !== prompt) return;
      if (!result) { setState({ kind: "failed" }); return; }
      drawn.set(prompt, result);
      setShown(result);
      setState({ kind: "ready", ...result });
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [prompt, seed, attempt]);

  if (!prompt) return null;
  const hero = size === "hero";
  const busy = state.kind === "drawing";
  return (
    <figure className={cn("m-0", className)}>
      <div className={cn("relative overflow-hidden bg-[#f5f5f7]", hero ? "aspect-[2/3] w-full max-w-[560px] rounded-[32px]" : "aspect-square w-full rounded-[24px]")}>
        {busy && !shown && <div className="aura opacity-40" aria-hidden="true" />}
        <AnimatePresence initial={false}>
          {shown && (
            <motion.img key={shown.src.slice(-48)} src={shown.src} alt={`A generic model wearing ${outfitWords(spec)}`}
              initial={{ opacity: 0, scale: still ? 1 : 1.03 }} animate={{ opacity: 1, scale: shown.open ? 1.07 : 1, filter: busy ? "blur(14px) saturate(.8)" : "blur(0px)" }} exit={{ opacity: 0 }}
              transition={{ ...SOFT, opacity: { duration: 0.5 } }}
              // the open model signs the bottom corner; a slight zoom from the top keeps it out of frame
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
        {state.kind === "failed" && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <p className="text-[17px] font-medium">We could not draw this look just now.</p>
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
