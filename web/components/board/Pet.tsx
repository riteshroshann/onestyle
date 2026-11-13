"use client";
// The board's companion: a small ink creature in the corner that breathes, blinks, watches the cursor and speaks in
// short bubbles. It has no text box; it says what is happening and what to try next. Tap it to hide or show its words.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SPRING } from "../site/Motion";

export type Mood = "idle" | "thinking" | "happy";
export interface Said { id: string; text: string }

const SHOWN = 3; // older bubbles drift away

function Eyes({ mood, look }: { mood: Mood; look: { x: number; y: number } }) {
  const still = useReducedMotion();
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (still) return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); next(); }, 2600 + Math.random() * 2600); };
    next();
    return () => clearTimeout(t);
  }, [still]);
  const gaze = mood === "thinking" ? { x: 3, y: -4 } : look;
  if (mood === "happy") return (
    <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M19 30 q4 -5 8 0" /><path d="M33 30 q4 -5 8 0" />
    </g>
  );
  return (
    <motion.g animate={{ x: gaze.x, y: gaze.y }} transition={SPRING}>
      {[23, 37].map((cx) => (
        <motion.ellipse key={cx} cx={cx} cy={29} rx={3.4} fill="#fff" animate={{ ry: blink ? 0.4 : 4.6 }} transition={{ duration: 0.08 }} />
      ))}
    </motion.g>
  );
}

export function Pet({ said, mood }: { said: Said[]; mood: Mood }) {
  const still = !!useReducedMotion();
  const [quiet, setQuiet] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const body = useRef<HTMLButtonElement>(null);
  // new words bring the bubbles back
  useEffect(() => { if (said.length) setQuiet(false); }, [said.length]);
  // the eyes follow the cursor, a little
  useEffect(() => {
    if (still) return;
    const move = (e: PointerEvent) => {
      const r = body.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      setLook({ x: (dx / d) * 3, y: (dy / d) * 2.5 });
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [still]);

  const shown = quiet ? [] : said.slice(-SHOWN);
  return (
    <div className="pointer-events-none absolute bottom-[150px] left-3 z-[6] flex max-w-[min(340px,calc(100%-24px))] flex-col items-start gap-3 md:bottom-[76px] md:left-4">
      <ol className="flex flex-col items-start gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {shown.map((s, i) => (
            <motion.li key={s.id} layout={!still}
              initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: i === shown.length - 1 ? 1 : 0.62, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.94, transition: { duration: 0.2 } }}
              transition={SPRING} style={{ transformOrigin: "bottom left" }}
              className={cn("pointer-events-auto rounded-[20px] rounded-bl-[6px] px-4 py-2.5 text-[15px] leading-[1.45] shadow-[0_14px_40px_-18px_rgba(13,17,23,.35)] ring-1 ring-black/[.05]",
                i === shown.length - 1 ? "bg-brand-ink text-white" : "bg-white/95 text-brand-ink backdrop-blur-xl")}>
              {s.text}
            </motion.li>
          ))}
          {mood === "thinking" && !quiet && (
            <motion.li key="dots" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING}
              className="flex gap-1 rounded-[20px] rounded-bl-[6px] bg-white px-4 py-3.5 shadow-[0_14px_40px_-18px_rgba(13,17,23,.35)] ring-1 ring-black/[.05]" aria-label="Thinking">
              {[0, 1, 2].map((k) => (
                <motion.span key={k} className="size-1.5 rounded-full bg-brand-ink/60" animate={still ? {} : { y: [0, -4, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: k * 0.15 }} />
              ))}
            </motion.li>
          )}
        </AnimatePresence>
      </ol>
      <motion.button ref={body} type="button" onClick={() => setQuiet((q) => !q)} aria-label={quiet ? "Show what your board buddy says" : "Hide what your board buddy says"}
        className="pointer-events-auto relative size-[60px] outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-[22px]"
        animate={still ? {} : mood === "thinking" ? { y: [0, -5, 0], rotate: [0, -4, 0] } : mood === "happy" ? { y: [0, -10, 0], scale: [1, 1.08, 1] } : { scale: [1, 1.035, 1] }}
        transition={mood === "idle" ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" } : { duration: mood === "happy" ? 0.6 : 1.1, repeat: mood === "happy" ? 1 : Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }}>
        <svg viewBox="0 0 60 60" className="size-full drop-shadow-[0_12px_22px_rgba(13,17,23,.35)]" aria-hidden="true">
          {/* a soft squircle body with a little tuft, all ink */}
          <path d="M30 6 C46 6 54 14 54 30 C54 46 46 54 30 54 C14 54 6 46 6 30 C6 14 14 6 30 6 Z" fill="#0d1117" />
          <path d="M27 7 q3 -6 7 -3" stroke="#0d1117" strokeWidth="3" strokeLinecap="round" fill="none" />
          <Eyes mood={mood} look={look} />
          <ellipse cx="18" cy="38" rx="3.2" ry="2" fill="#fff" opacity=".12" /><ellipse cx="42" cy="38" rx="3.2" ry="2" fill="#fff" opacity=".12" />
        </svg>
      </motion.button>
    </div>
  );
}
