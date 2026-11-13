"use client";
// The reading: progress while the board is read, then what each picture offers and a direction to take back to Talk.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Idea } from "../../lib/engine/board";
import { SWATCH } from "../../lib/engine/describe";
import { SOFT, SPRING } from "../site/Motion";
import { ideaLine } from "./notes";

export type Phase = "reading" | "done" | "refused" | "error";
export type Step = "wait" | "work" | "done" | "skip" | "fail";
export interface PictureView {
  n: number; shows: string; borrow: string;
  palette: { name: string; hex: string }[];
  details: string[]; // short plain lines, such as "Motifs: cherry blossoms"
}
export interface Result { summary: string; ideas: Idea[]; pictures: PictureView[]; leftOut: number[]; notice: string; usable: boolean }
export interface ReadingState {
  phase: Phase;
  pictures: { n: number; dataURL: string }[];
  active: number | null; // the picture being looked at now
  steps: { notes: Step; cloud: Step; device: Step };
  loaded: number; // on-device reader download, 0 to 1
  status: string; // spoken to screen readers
  result: Result | null;
  message: string; // the error or refusal, with its fix
}

const pill = "press inline-flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-6 text-[15px] font-medium";
const primary = `${pill} bg-brand-ink text-white hover:bg-[#232c3b]`;
const quiet = `${pill} text-brand-ink hover:bg-black/[.05]`;
const small = "max-md:h-10 max-md:px-2 max-md:text-[14px]"; // two quiet choices share one row on a phone

const STEP_TEXT: Record<"notes" | "cloud" | "device", { title: string; sub: Partial<Record<Step, string>> }> = {
  notes: { title: "Your notes", sub: { wait: "Reading what you wrote", work: "Reading what you wrote", done: "Your words lead" } },
  cloud: { title: "Ideas from every picture", sub: { wait: "Colour, motif, shape and mood", work: "Colour, motif, shape and mood", done: "Found what to borrow", skip: "Offline, so your device reads alone", fail: "Not reachable now, so your device reads alone" } },
  device: { title: "A close look on this device", sub: { wait: "Waiting its turn", work: "Colour, print and the details you circled", done: "Finished", skip: "Not needed this time", fail: "Could not start on this device" } },
};

function Mark({ step }: { step: Step }) {
  if (step === "work") return (
    <span className="relative grid size-5 place-items-center" aria-hidden="true">
      <motion.span className="absolute size-5 rounded-full bg-brand/30" animate={{ scale: [0.6, 1.25, 0.6], opacity: [0.8, 0, 0.8] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      <span className="size-2.5 rounded-full bg-brand" />
    </span>
  );
  const cls = step === "done" ? "bg-brand-ink" : step === "fail" ? "bg-[#b5121b]/70" : step === "skip" ? "bg-brand-ink/15" : "ring-[1.5px] ring-brand-ink/25";
  return <span className="grid size-5 place-items-center" aria-hidden="true"><span className={`size-2.5 rounded-full ${cls}`} /></span>;
}

function Progress({ state, onClose }: { state: ReadingState; onClose: () => void }) {
  const { pictures, active, steps } = state;
  const order = (["notes", "cloud", "device"] as const).filter((k) => !(k === "notes" && steps.notes === "skip"));
  const preparing = steps.device === "work" && state.loaded < 1;
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={SOFT}
      className="mx-auto w-full max-w-[880px] px-5 pb-40 pt-[clamp(32px,8vh,96px)] sm:px-8">
      <h2 className="display text-[clamp(40px,6vw,84px)]">Reading your board.</h2>
      {/* the picture being read, large, on a slow halo */}
      {pictures.length > 0 && (
        <div className="relative mt-12 flex justify-center sm:justify-start">
          <div className="relative size-[min(300px,70vw)]">
            <div className="aura" aria-hidden="true" />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={active ?? pictures[0].n} initial={{ opacity: 0, scale: 0.92, rotate: -2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 1.04 }} transition={SOFT}
                className="absolute inset-0 overflow-hidden rounded-[36px] bg-white shadow-[0_40px_90px_-30px_rgba(13,17,23,.55)] ring-1 ring-white/60">
                <img src={(pictures.find((p) => p.n === active) ?? pictures[0]).dataURL} alt={`Picture ${active ?? pictures[0].n}, being read`} className="size-full object-cover" />
                <div className="sweep" aria-hidden="true" />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
      {pictures.length > 1 && (
        <ol className="-mx-1 mt-10 flex gap-3 overflow-x-auto px-1 pb-3 pt-1" aria-label="Pictures on your board">
          {pictures.map((p, i) => {
            const on = p.n === active;
            return (
              <motion.li key={p.n} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.05 }} className="shrink-0 p-1">
                <motion.div animate={{ scale: on ? 1 : 0.94, opacity: on || active === null ? 1 : 0.5 }} transition={SPRING}
                  className={`relative size-[88px] overflow-hidden rounded-[22px] bg-secondary sm:size-[112px] ${on ? "ring-2 ring-brand ring-offset-2" : ""}`}>
                  <img src={p.dataURL} alt={`Picture ${p.n}`} className="size-full object-cover" />
                  {on && <div className="sweep" aria-hidden="true" />}
                </motion.div>
              </motion.li>
            );
          })}
        </ol>
      )}
      <ul className="mt-10 grid gap-6">
        {order.map((k) => (
          <li key={k} className="flex items-start gap-4">
            <span className="mt-[3px]"><Mark step={steps[k]} /></span>
            <div className="min-w-0 flex-1">
              <p className={`text-[18px] font-medium tracking-[-0.01em] ${steps[k] === "skip" ? "text-brand-ink/40" : ""}`}>{STEP_TEXT[k].title}</p>
              <p className="mt-0.5 text-[15px] leading-[1.45] text-brand-ink/55">
                {k === "device" && preparing ? "Getting the reader ready, once on this device" : STEP_TEXT[k].sub[steps[k]] ?? ""}
              </p>
              {k === "device" && preparing && (
                <div className="mt-3 h-[3px] max-w-[280px] overflow-hidden rounded-full bg-brand-ink/[.07]" role="progressbar" aria-label="Getting the reader ready"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.loaded * 100)}>
                  <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, state.loaded * 100)}%` }} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className={`${quiet} -ml-6 mt-10`} onClick={onClose}>Cancel</button>
    </motion.section>
  );
}

function Swatches({ colours }: { colours: { name: string; hex: string }[] }) {
  if (!colours.length) return null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {colours.map((c, i) => (
          <motion.span key={c.hex + i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING, delay: 0.1 + i * 0.04 }}
            className="size-8 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c.hex }} />
        ))}
      </div>
      <p className="mt-2 text-[14px] leading-[1.45] text-brand-ink/55">{colours.map((c) => c.name).join(", ")}</p>
    </div>
  );
}

function IdeaCard({ idea, on, onPick, i }: { idea: Idea; on: boolean; onPick: () => void; i: number }) {
  const line = ideaLine(idea);
  const dots = (idea.colour ?? []).map((c) => ({ name: c, hex: SWATCH[c] ?? "#d4d4d8" }));
  return (
    <motion.button type="button" aria-pressed={on} onClick={onPick}
      initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SOFT, delay: 0.08 + i * 0.07 }}
      whileTap={{ scale: 0.98 }}
      className={`min-w-0 rounded-[28px] p-6 text-left outline-none transition-[background-color,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-brand ${on ? "bg-white shadow-[0_18px_50px_-24px_rgba(13,17,23,.35)] ring-2 ring-brand" : "bg-[#f5f5f7] ring-1 ring-transparent hover:bg-[#efeff2]"}`}>
      <p className="text-[20px] font-medium leading-[1.2] tracking-[-0.015em] [overflow-wrap:anywhere]">{idea.title}</p>
      {idea.why && <p className="mt-2 text-[15px] leading-[1.5] text-brand-ink/60">{idea.why}</p>}
      {line && <p className="mt-3 text-[14px] leading-[1.5] text-brand-ink/50 [overflow-wrap:anywhere]">{line}</p>}
      {dots.length > 0 && (
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {dots.map((d) => <span key={d.name} className="size-5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: d.hex }} />)}
        </div>
      )}
    </motion.button>
  );
}

function Results({ state, picked, onPick, onUse, onCircle, onKeep }: {
  state: ReadingState; picked: number; onPick: (i: number) => void; onUse: () => void; onCircle: () => void; onKeep: () => void;
}) {
  const r = state.result!;
  const thumbs = new Map(state.pictures.map((p) => [p.n, p.dataURL]));
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SOFT}
      className="mx-auto w-full max-w-[1040px] px-5 pb-[150px] pt-[clamp(32px,7vh,88px)] sm:px-8 md:pb-40">
      <h2 className="display max-w-[14ch] text-[clamp(40px,6vw,84px)]">{r.ideas.length ? "Here is a direction." : "Here is what we see."}</h2>
      {r.summary && <p className="mt-5 max-w-[52ch] text-[19px] leading-[1.5] text-brand-ink/65">{r.summary}</p>}
      {r.notice && (
        <p className="mt-5 flex max-w-[60ch] items-start gap-3 text-[15px] leading-[1.5] text-brand-ink/60">
          <span className="mt-[7px] size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />{r.notice}
        </p>
      )}

      {r.ideas.length > 0 && (
        <div className="mt-12">
          <h3 className="text-[15px] font-medium text-brand-ink/50">Pick a direction</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2" role="group" aria-label="Directions">
            {r.ideas.map((idea, i) => <IdeaCard key={idea.title + i} idea={idea} i={i} on={i === picked} onPick={() => onPick(i)} />)}
          </div>
        </div>
      )}

      {r.pictures.length > 0 && (
        <div className="mt-14">
          <h3 className="text-[15px] font-medium text-brand-ink/50">From each picture</h3>
          <ul className="mt-5 grid gap-10 lg:grid-cols-2 lg:gap-x-12">
            {r.pictures.map((p, i) => (
              <motion.li key={p.n} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.15 + i * 0.06 }}
                className="grid grid-cols-[84px_minmax(0,1fr)] gap-5 sm:grid-cols-[120px_minmax(0,1fr)]">
                <div className="aspect-[3/4] overflow-hidden rounded-[20px] bg-secondary">
                  {thumbs.get(p.n) && <img src={thumbs.get(p.n)} alt={`Picture ${p.n}`} className="size-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[17px] font-medium tracking-[-0.01em]">Picture {p.n}</p>
                  {p.shows && <p className="mt-1 text-[15px] leading-[1.5] text-brand-ink/55">{p.shows}</p>}
                  <Swatches colours={p.palette} />
                  {p.borrow && <p className="mt-4 text-[16px] leading-[1.5]">{p.borrow}</p>}
                  {p.details.map((d) => <p key={d} className="mt-1.5 text-[14px] leading-[1.5] text-brand-ink/55 [overflow-wrap:anywhere]">{d}</p>)}
                </div>
              </motion.li>
            ))}
          </ul>
          {r.leftOut.length > 0 && (
            <p className="mt-8 text-[15px] text-brand-ink/55">
              {r.leftOut.length === 1 ? `Picture ${r.leftOut[0]} was left out, as it could not be read here.` : `Pictures ${r.leftOut.join(", ")} were left out, as they could not be read here.`}
            </p>
          )}
        </div>
      )}

      {/* a sheet on phones, a floating pill on wider screens */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center md:bottom-6 md:px-4">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.2 }}
          className="pointer-events-auto grid w-full grid-cols-2 gap-1 rounded-t-[28px] bg-white/90 p-2 pb-[max(8px,env(safe-area-inset-bottom))] md:flex md:w-auto md:items-center md:rounded-[30px] md:pb-2 shadow-[0_18px_50px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl">
          {r.usable && <button ref={first} type="button" className={`${primary} col-span-2`} onClick={onUse}>Use this direction</button>}
          <button ref={r.usable ? undefined : first} type="button" className={r.usable ? `${quiet} ${small}` : `${primary} col-span-2`} onClick={onCircle}>Circle a detail</button>
          <button type="button" className={`${quiet} ${small} ${r.usable ? "" : "col-span-2"}`} onClick={onKeep}>Keep the notes on the board</button>
        </motion.div>
      </div>
    </motion.section>
  );
}

function Stopped({ state, onRetry, onClose }: { state: ReadingState; onRetry: () => void; onClose: () => void }) {
  const refused = state.phase === "refused";
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SOFT}
      className="mx-auto w-full max-w-[760px] px-5 pb-40 pt-[clamp(40px,12vh,140px)] sm:px-8">
      <h2 className="display text-[clamp(40px,6vw,84px)]">{refused ? "Let's try other pictures." : "Could not read it."}</h2>
      <p className="mt-6 max-w-[46ch] text-[19px] leading-[1.5] text-brand-ink/65">{state.message}</p>
      <div className="mt-10 flex flex-wrap gap-2">
        {!refused && <button ref={first} type="button" className={primary} onClick={onRetry}>Try again</button>}
        <button ref={refused ? first : undefined} type="button" className={refused ? primary : quiet} onClick={onClose}>Back to the board</button>
      </div>
    </motion.section>
  );
}

export function Reading({ state, picked, onPick, onUse, onCircle, onKeep, onRetry, onClose }: {
  state: ReadingState; picked: number; onPick: (i: number) => void;
  onUse: () => void; onCircle: () => void; onKeep: () => void; onRetry: () => void; onClose: () => void;
}) {
  const still = useReducedMotion();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") (state.phase === "done" ? onKeep : onClose)(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, onKeep, state.phase]);

  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Reading your moodboard"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: still ? 0 : 0.25 }}
      className="absolute inset-0 z-20 overflow-y-auto overflow-x-hidden bg-white">
      <p className="sr-only" aria-live="polite">{state.status}</p>
      <AnimatePresence mode="wait" initial={false}>
        {state.phase === "reading" && <Progress key="progress" state={state} onClose={onClose} />}
        {state.phase === "done" && state.result && <Results key="results" state={state} picked={picked} onPick={onPick} onUse={onUse} onCircle={onCircle} onKeep={onKeep} />}
        {(state.phase === "error" || state.phase === "refused") && <Stopped key="stopped" state={state} onRetry={onRetry} onClose={onClose} />}
      </AnimatePresence>
    </motion.div>
  );
}
