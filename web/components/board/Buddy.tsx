"use client";
// The board's buddy: a floating panel of chat bubbles that reads the board with you, without ever leaving it.
// Progress while the pictures are read, then the direction, links to look further, and questions about the board.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Idea } from "../../lib/engine/board";
import { SWATCH } from "../../lib/engine/describe";
import { cn } from "@/lib/utils";
import { Mark } from "../site/Mark";
import { Arrow, Dots, Reveal, SOFT, SPRING } from "../site/Motion";
import { ideaLine } from "./notes";

export type Phase = "reading" | "done" | "refused" | "error";
export type Step = "wait" | "work" | "done" | "skip" | "fail";
export interface Result { summary: string; ideas: Idea[]; pictureCount: number; leftOut: number[]; notice: string; usable: boolean }
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
export interface Look { label: string; url: string }

interface Turn { role: "user" | "assistant"; content: string; failed?: boolean }

const STEP_TEXT: Record<"notes" | "cloud" | "device", { title: string; sub: Partial<Record<Step, string>> }> = {
  notes: { title: "Your notes", sub: { wait: "Reading what you wrote", work: "Reading what you wrote", done: "Your words lead" } },
  cloud: { title: "Ideas from every picture", sub: { wait: "Colour, motif, shape and mood", work: "Colour, motif, shape and mood", done: "Found what to borrow", skip: "Offline, so your device reads alone", fail: "Not reachable now, so your device reads alone" } },
  device: { title: "The image model on this device", sub: { wait: "Waiting its turn", work: "Garment, colour and print", done: "Charted under each picture", skip: "Not needed this time", fail: "Could not start on this device" } },
};
const UNAVAILABLE = "I could not answer just now. Check your connection and try again.";

const pill = "press inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors";
const primary = `${pill} bg-brand-ink text-white hover:bg-[#232c3b] disabled:opacity-40`;
const quiet = `${pill} text-brand-ink ring-1 ring-black/10 hover:bg-black/[.04]`;
const label = "text-[11px] font-medium uppercase tracking-[0.14em] text-brand-ink/45";

function Dot({ step }: { step: Step }) {
  if (step === "work") return (
    <span className="relative grid size-4 place-items-center" aria-hidden="true">
      <motion.span className="absolute size-4 rounded-full bg-brand-ink/20" animate={{ scale: [0.6, 1.3, 0.6], opacity: [0.8, 0, 0.8] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      <span className="size-2 rounded-full bg-brand-ink" />
    </span>
  );
  const cls = step === "done" ? "bg-brand-ink" : step === "fail" ? "bg-[#b5121b]/70" : step === "skip" ? "bg-brand-ink/15" : "ring-[1.5px] ring-brand-ink/25";
  return <span className="grid size-4 place-items-center" aria-hidden="true"><span className={`size-2 rounded-full ${cls}`} /></span>;
}

/** A bubble from Bespoke, or from the customer. */
function Bubble({ mine, tone, children, delay = 0 }: { mine?: boolean; tone?: "error"; children: React.ReactNode; delay?: number }) {
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING, delay }}
      style={{ transformOrigin: mine ? "bottom right" : "bottom left" }} className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] px-4 py-3 text-[15px] leading-[1.5]",
        mine ? "rounded-[20px] rounded-br-[6px] bg-brand-ink text-white" : "rounded-[20px] rounded-bl-[6px] bg-[#f2f3f5] text-brand-ink",
        tone === "error" && "bg-[#fdf1f1] text-[#8a1c1c]")}>
        {children}
      </div>
    </motion.li>
  );
}

function Progress({ state }: { state: ReadingState }) {
  const { pictures, active, steps } = state;
  const order = (["notes", "cloud", "device"] as const).filter((k) => !(k === "notes" && steps.notes === "skip"));
  const preparing = steps.device === "work" && state.loaded < 1;
  return (
    <Bubble>
      <p className="font-medium">Reading your board.</p>
      {pictures.length > 0 && (
        <ol className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 py-1" aria-label="Pictures on your board">
          {pictures.map((p) => {
            const on = p.n === active;
            return (
              <motion.li key={p.n} animate={{ scale: on ? 1 : 0.92, opacity: on || active === null ? 1 : 0.5 }} transition={SPRING}
                className={cn("relative size-12 shrink-0 overflow-hidden rounded-[14px] bg-white", on && "ring-2 ring-brand-ink ring-offset-2 ring-offset-[#f2f3f5]")}>
                <img src={p.dataURL} alt={`Picture ${p.n}`} className="size-full object-cover" />
                {on && <div className="sweep" aria-hidden="true" />}
              </motion.li>
            );
          })}
        </ol>
      )}
      <ul className="mt-3 grid gap-2.5">
        {order.map((k) => (
          <li key={k} className="flex items-start gap-2.5">
            <span className="mt-[3px]"><Dot step={steps[k]} /></span>
            <div className="min-w-0">
              <p className={cn("text-[14px] font-medium", steps[k] === "skip" && "text-brand-ink/40")}>{STEP_TEXT[k].title}</p>
              <p className="text-[13px] leading-[1.4] text-brand-ink/55">{k === "device" && preparing ? "Getting the model ready, once on this device" : STEP_TEXT[k].sub[steps[k]] ?? ""}</p>
              {k === "device" && preparing && (
                <div className="mt-2 h-[3px] w-40 overflow-hidden rounded-full bg-brand-ink/[.08]" role="progressbar" aria-label="Getting the model ready"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.loaded * 100)}>
                  <div className="h-full rounded-full bg-brand-ink transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, state.loaded * 100)}%` }} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Bubble>
  );
}

function IdeaCard({ idea, on, onPick, i }: { idea: Idea; on: boolean; onPick: () => void; i: number }) {
  const line = ideaLine(idea);
  const dots = (idea.colour ?? []).map((c) => ({ name: c, hex: SWATCH[c] ?? "#d4d4d8" }));
  return (
    <motion.button type="button" aria-pressed={on} onClick={onPick}
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.1 + i * 0.06 }} whileTap={{ scale: 0.98 }}
      className={cn("w-full rounded-[22px] p-4 text-left outline-none transition-[background-color,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-brand",
        on ? "bg-brand-ink text-white shadow-[0_14px_40px_-20px_rgba(13,17,23,.6)]" : "bg-white ring-1 ring-black/[.07] hover:ring-black/20")}>
      <span className="flex items-baseline gap-3">
        <span className={cn("text-[12px] font-medium tabular-nums", on ? "text-white/50" : "text-brand-ink/35")}>{i + 1}</span>
        <span className="min-w-0 text-[17px] font-medium leading-[1.25] tracking-[-0.01em] [overflow-wrap:anywhere]">{idea.title}</span>
      </span>
      {idea.why && <span className={cn("mt-1.5 block pl-6 text-[14px] leading-[1.45]", on ? "text-white/70" : "text-brand-ink/60")}>{idea.why}</span>}
      {line && <span className={cn("mt-1.5 block pl-6 text-[13px] leading-[1.45] [overflow-wrap:anywhere]", on ? "text-white/50" : "text-brand-ink/45")}>{line}</span>}
      {dots.length > 0 && (
        <span className="mt-3 flex gap-1.5 pl-6" aria-hidden="true">
          {dots.map((d) => <span key={d.name} className={cn("size-4 rounded-full ring-1 ring-inset", on ? "ring-white/25" : "ring-black/10")} style={{ background: d.hex }} />)}
        </span>
      )}
    </motion.button>
  );
}

async function askAbout(message: string, context: string, history: Turn[]): Promise<Turn> {
  try {
    const res = await fetch("/api/assistant", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, design: context.slice(0, 300), history: history.filter((t) => !t.failed).map(({ role, content }) => ({ role, content })) }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.answer) return { role: "assistant", content: body.answer };
    return { role: "assistant", content: body.error ?? UNAVAILABLE, failed: true };
  } catch {
    return { role: "assistant", content: UNAVAILABLE, failed: true };
  }
}

export function Buddy({ state, picked, applied, looks, context, onPick, onUse, onCircle, onRetry, onClose }: {
  state: ReadingState; picked: number; applied: number | null;
  /** Where to look further for the picked direction: idea searches and shops, opened in a new tab. */
  looks: { ideas: Look[]; shops: Look[] };
  /** The board and the picked direction in a sentence, sent with questions so answers fit it. */
  context: string;
  onPick: (i: number) => void; onUse: () => void; onCircle: () => void; onRetry: () => void; onClose: () => void;
}) {
  const still = !!useReducedMotion();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const r = state.result;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  // a new reading starts a new conversation
  useEffect(() => { if (state.phase === "reading") setTurns([]); }, [state.phase]);
  // a fresh reading opens on its summary; after that, the latest bubble stays in view
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fresh = state.phase === "done" && !turns.length && !thinking && applied === null;
    el.scrollTo({ top: fresh ? 0 : el.scrollHeight, behavior: still ? "auto" : "smooth" });
  }, [state.phase, turns.length, thinking, applied, still]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    const history = [...turns, { role: "user" as const, content: q }];
    setTurns(history);
    setDraft("");
    setThinking(true);
    const a = await askAbout(q, context, turns);
    setTurns([...history, a]);
    setThinking(false);
  };
  const ready = draft.trim().length > 0 && !thinking;

  return (
    <motion.aside role="complementary" aria-label="Your board, read"
      initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={SOFT}
      className="absolute inset-x-2 bottom-[150px] top-[132px] z-20 flex flex-col overflow-hidden rounded-[28px] bg-white/92 shadow-[0_30px_90px_-24px_rgba(13,17,23,.45)] ring-1 ring-black/[.06] backdrop-blur-2xl md:inset-x-auto md:bottom-[96px] md:right-4 md:top-4 md:w-[420px]">
      <p className="sr-only" aria-live="polite">{state.status}</p>
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-brand-ink/[.05]"><Mark className="size-3.5" /></span>
          <span className="text-[15px] font-medium">Your board, read</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close"
          className="press grid size-9 place-items-center rounded-full text-brand-ink/60 transition-colors hover:bg-black/[.05] hover:text-brand-ink">
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <ol className="flex flex-col gap-3">
          {state.phase === "reading" && <Progress state={state} />}

          {(state.phase === "error" || state.phase === "refused") && (
            <Bubble tone="error">
              <p className="font-medium">{state.phase === "refused" ? "Let's try other pictures." : "Could not read it."}</p>
              <p className="mt-1">{state.message}</p>
            </Bubble>
          )}

          {state.phase === "done" && r && (
            <>
              <Bubble>
                <p className="text-[17px] font-medium leading-[1.35] tracking-[-0.01em]"><Reveal text={r.summary || "Here is what I see."} still={still} /></p>
                {r.pictureCount > 0 && <p className="mt-2 text-[14px] text-brand-ink/60">I wrote a note under every picture, with what the image model saw, and the direction beside the board.</p>}
              </Bubble>
              {r.notice && <Bubble delay={0.1}><p className="text-[14px] text-brand-ink/65">{r.notice}</p></Bubble>}
              {r.leftOut.length > 0 && (
                <Bubble delay={0.1}><p className="text-[14px] text-brand-ink/65">
                  {r.leftOut.length === 1 ? `Picture ${r.leftOut[0]} was left out, as it could not be read here.` : `Pictures ${r.leftOut.join(", ")} were left out, as they could not be read here.`}
                </p></Bubble>
              )}

              {r.ideas.length > 0 && (
                <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-2">
                  <p className={cn(label, "px-1")}>Directions</p>
                  <div className="mt-2.5 grid gap-2" role="group" aria-label="Directions">
                    {r.ideas.map((idea, i) => <IdeaCard key={idea.title + i} idea={idea} i={i} on={i === picked} onPick={() => onPick(i)} />)}
                  </div>
                </motion.li>
              )}

              <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.25 }} className="flex flex-wrap gap-2 px-0.5">
                {r.usable && (
                  <button type="button" className={primary} onClick={onUse} disabled={applied === picked}>
                    {applied === picked ? "In your design" : "Add to my design"}
                  </button>
                )}
                <button type="button" className={quiet} onClick={onCircle}>Circle a detail</button>
              </motion.li>

              {applied !== null && (
                <Bubble><p>Added to your design. Talk, the sheet and the shop links all follow it now, and you can keep working here.</p></Bubble>
              )}

              {(looks.ideas.length > 0 || looks.shops.length > 0) && (
                <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-2">
                  <p className={cn(label, "px-1")}>Look further</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {[...looks.ideas, ...looks.shops].map((l, k) => (
                      <motion.a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 6, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING, delay: still ? 0 : 0.35 + k * 0.04 }} whileTap={{ scale: 0.95 }}
                        className="inline-flex h-9 max-w-full items-center truncate rounded-full px-4 text-[13px] font-medium text-brand-ink no-underline ring-1 ring-black/10 transition-colors hover:bg-black/[.04]">
                        {l.label}
                      </motion.a>
                    ))}
                  </div>
                </motion.li>
              )}

              {turns.map((t, i) => (
                <Bubble key={i} mine={t.role === "user"} tone={t.failed ? "error" : undefined}>
                  {t.role === "user" || t.failed ? t.content : <Reveal text={t.content} still={still} />}
                </Bubble>
              ))}
              <AnimatePresence>
                {thinking && (
                  <motion.li key="dots" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING}
                    style={{ transformOrigin: "bottom left" }} className="flex">
                    <div className="rounded-[20px] rounded-bl-[6px] bg-[#f2f3f5] px-4 py-2.5"><Dots /></div>
                  </motion.li>
                )}
              </AnimatePresence>
            </>
          )}
        </ol>
      </div>

      <footer className="px-3 pb-3">
        {state.phase === "done" ? (
          <form onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
            <div className="flex items-end gap-2 rounded-[24px] bg-[#f2f3f5] p-1.5 pl-4 ring-1 ring-transparent transition-[box-shadow,background-color] duration-200 focus-within:bg-white focus-within:shadow-[0_6px_20px_-10px_rgba(13,17,23,.25)] focus-within:ring-black/15">
              <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={600}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
                aria-label="Ask about this board" placeholder="Ask about colours, fabric, fit"
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] leading-[1.35] outline-none placeholder:text-brand-ink/40" />
              <motion.button type="submit" disabled={!ready} aria-label="Send"
                animate={{ scale: ready ? 1 : 0.88, opacity: ready ? 1 : 0.35 }} whileTap={{ scale: 0.9 }} transition={SPRING}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-ink text-white">
                <Arrow />
              </motion.button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2 px-1">
            {state.phase === "error" && <button type="button" className={primary} onClick={onRetry}>Try again</button>}
            <button type="button" className={quiet} onClick={onClose}>{state.phase === "reading" ? "Cancel" : "Back to the board"}</button>
          </div>
        )}
      </footer>
    </motion.aside>
  );
}
