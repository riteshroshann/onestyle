"use client";
// The reading: what the board looks like while CLIP studies it. Colour appears here and nowhere else in the app.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export type Phase = "loading" | "reading" | "done" | "error";
export interface Finding { slot: string; value: string; p: number; circled: boolean }
export interface ReadingState {
  phase: Phase;
  loaded: number; // model download, 0 to 1
  pictures: { n: number; dataURL: string }[];
  active: { n: number; box?: [number, number, number, number] } | null;
  findings: Record<number, Finding[]>;
  status: string; // spoken to screen readers only
  usable: boolean; // whether anything was clear enough to go into the design
  error: string;
}

const SURE = 0.4; // a reading below this is a guess, and guesses are not shown
const NAMED = new Set(["garment", "colour", "pattern", "sleeve.style", "sleeve.length", "neckline.shape"]);
const spring = { type: "spring", duration: 0.6, bounce: 0 } as const;

/** The words worth showing for a picture: confident, named, and not the absence of something. */
const seen = (list: Finding[] = []) =>
  list.filter((f) => NAMED.has(f.slot) && f.p >= SURE && f.value !== "solid" && f.value !== "none").map((f) => f.value);

export function Reading({ state, onUse, onClose }: { state: ReadingState; onUse: () => void; onClose: () => void }) {
  const { phase, pictures, active, findings } = state;
  const still = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null); // once the read is over, any picture can be reviewed
  const shown: ReadingState["active"] = active ?? (pictures.length ? { n: picked ?? pictures[0].n } : null);
  const picture = pictures.find((p) => p.n === shown?.n);
  const words = shown ? seen(findings[shown.n]) : [];
  const working = phase === "loading" || phase === "reading";
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (phase === "done") primary.current?.focus(); }, [phase]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label="Reading your moodboard"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      className="absolute inset-0 z-20 overflow-y-auto bg-white"
    >
      <p className="sr-only" aria-live="polite">{state.status}</p>
      <div className="mx-auto grid min-h-full max-w-6xl content-center items-center gap-12 px-6 py-10 md:grid-cols-2 md:gap-20 md:px-10">
        {/* the picture being read, inside its aura */}
        <div className="relative mx-auto w-full max-w-[420px]">
          {working && <div className="aura" aria-hidden />}
          <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-secondary">
            <AnimatePresence mode="popLayout">
              {picture && (
                <motion.img
                  key={picture.n} src={picture.dataURL} alt={`Picture ${picture.n} from your board`}
                  initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}
                  className="absolute inset-0 size-full object-cover"
                />
              )}
            </AnimatePresence>
            {phase === "reading" && <div className="sweep" aria-hidden />}
            {phase === "reading" && shown?.box && (
              <motion.div
                layoutId="circle" aria-hidden className="absolute rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,.4)] ring-2 ring-white"
                style={{ left: `${shown.box[0] * 100}%`, top: `${shown.box[1] * 100}%`, width: `${shown.box[2] * 100}%`, height: `${shown.box[3] * 100}%` }}
                transition={spring}
              />
            )}
          </div>
          {pictures.length > 1 && (
            <ol className="relative mt-4 flex justify-center gap-2">
              {pictures.map((p) => (
                <li key={p.n} className="relative">
                  <button className="press block rounded-sm" aria-label={`Picture ${p.n}`} aria-pressed={p.n === shown?.n} onClick={() => { if (!working) setPicked(p.n); }}>
                    <img src={p.dataURL} alt="" className={`size-12 rounded-sm object-cover transition-opacity duration-500 ${p.n === shown?.n ? "opacity-100" : "opacity-40 hover:opacity-80"}`} />
                  </button>
                  {p.n === shown?.n && <motion.span layoutId="thumb" className="pointer-events-none absolute -bottom-2 left-0 h-[3px] w-full bg-foreground" transition={spring} />}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* what it sees, one word at a time */}
        <div className="relative min-w-0">
          {phase === "loading" && (
            <>
              <h2 className="display shimmer-text text-[clamp(56px,7vw,112px)]">Looking.</h2>
              <div className="mt-8 h-1 max-w-xs overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Getting ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.loaded * 100)}>
                <div className="hue-bar h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, state.loaded * 100)}%` }} />
              </div>
            </>
          )}

          {(phase === "reading" || phase === "done") && (
            <ul className="min-h-[3em] text-[clamp(56px,7vw,112px)]" aria-label="Seen in this picture">
              <AnimatePresence mode="popLayout">
                {words.map((w, i) => (
                  <motion.li
                    key={`${shown?.n}-${w}`} layout
                    initial={still ? false : { opacity: 0, y: 28, filter: "blur(12px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0 }}
                    transition={{ ...spring, delay: still ? 0 : i * 0.05 }}
                    className="display capitalize"
                  >
                    {w}
                  </motion.li>
                ))}
                {phase === "reading" && words.length === 0 && <li key="looking" className="display shimmer-text">Looking.</li>}
                {phase === "done" && words.length === 0 && <li key="unclear" className="display text-foreground/25">Unclear.</li>}
              </AnimatePresence>
            </ul>
          )}

          {phase === "done" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-10">
              {!state.usable && <p className="mb-6 text-[17px] font-medium">Circle the part you love, then read again.</p>}
              <div className="flex gap-3">
                {state.usable && <button ref={primary} className="press h-13 rounded-full bg-foreground px-8 text-[16px] font-semibold text-background" onClick={onUse}>Use this</button>}
                <button ref={state.usable ? undefined : primary} className={`press h-13 rounded-full px-8 text-[16px] font-semibold ${state.usable ? "bg-secondary" : "bg-foreground text-background"}`} onClick={onClose}>Back</button>
              </div>
            </motion.div>
          )}

          {phase === "error" && (
            <>
              <h2 className="display text-[clamp(44px,5vw,80px)]">Could not read it.</h2>
              <p className="mt-5 max-w-sm text-[17px] font-medium">{state.error}</p>
              <button className="press mt-8 h-13 rounded-full bg-foreground px-8 text-[16px] font-semibold text-background" onClick={onClose}>Back</button>
            </>
          )}

          {working && <button className="press mt-10 h-11 rounded-full bg-secondary px-6 text-[15px] font-semibold" onClick={onClose}>Cancel</button>}
        </div>
      </div>
    </motion.div>
  );
}
