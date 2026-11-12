"use client";
// The help assistant in the corner. It answers only from Bespoke's own knowledge base; the rules live in api/assistant.js.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AskIcon } from "./AskIcon";
import { Arrow, Dots, Reveal, SPRING } from "./Motion";

interface Turn { role: "user" | "assistant"; content: string; sources?: string[]; links?: { label: string; href: string }[]; failed?: boolean }
const STARTERS = ["How do I measure my bust?", "What is ease?", "How does the moodboard work?"];
// with a design open, the starters turn to choosing
const STYLE_STARTERS = ["Which colour palette suits my design?", "Give me three neckline options", "What fabric works best for it?"];

/** The studio's open design in a few words, sent along so advice fits it. Empty when there is none. */
function designSummary(): string {
  try {
    const spec = JSON.parse(sessionStorage.getItem("bespoke.spec") ?? "null");
    if (!spec?.slots?.garment) return "";
    const one = (k: string): string | undefined => spec.slots?.[k]?.value;
    const many = (k: string): string => (spec.lists?.[k] ?? []).map((v: { value: string }) => v.value).join(" and ");
    const no = (spec.excluded ?? []).map((e: { value: string }) => e.value).join(", ");
    const garment = one("garment") === "kurti" && one("wearer") === "men" ? "kurta" : one("garment");
    return [
      one("wearer") && "for " + one("wearer"), many("colour"), many("shade"), one("fabric"), garment,
      one("neckline.shape") && one("neckline.shape") + " neckline", one("sleeve.length") && one("sleeve.length") + " sleeves",
      one("garment.length") && one("garment.length") + " length", many("pattern"), many("embellishment"),
      many("occasion") && "for " + many("occasion"), no && "not " + no,
    ].filter(Boolean).join(", ");
  } catch { return ""; }
}
const UNAVAILABLE = "I could not reach the assistant. Check your connection and try again.";
const OFF = "I am not switched on yet.";
// pages with their own bar along the bottom edge: the launcher sits above it
const DOCKED = ["/studio", "/orders", "/makers"];

async function ask(message: string, history: Turn[]): Promise<Turn> {
  try {
    const res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, design: designSummary(), history: history.filter((t) => !t.failed).map(({ role, content }) => ({ role, content })) }),
    });
    if (res.status === 501) return { role: "assistant", content: OFF, failed: true };
    const body = await res.json();
    if (body.answer) return { role: "assistant", content: body.answer, sources: (body.sources ?? []).map((s: { title: string }) => s.title), links: body.links ?? [] };
    return { role: "assistant", content: body.error ?? UNAVAILABLE, failed: true };
  } catch {
    return { role: "assistant", content: UNAVAILABLE, failed: true };
  }
}

export function Assistant() {
  const path = usePathname();
  const still = !!useReducedMotion();
  const [open, setOpen] = useState(false);
  const [hasDesign, setHasDesign] = useState(false);
  useEffect(() => { if (open) setHasDesign(!!designSummary()); }, [open]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: still ? "auto" : "smooth" });
  }, [turns.length, thinking, still]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && open) { setOpen(false); launcher.current?.focus(); } };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  // the field grows with the question, up to four lines
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [draft]);

  const send = async (text: string, base = turns) => {
    const message = text.trim();
    if (!message || thinking) return;
    setTurns([...base, { role: "user", content: message }]);
    setDraft("");
    setThinking(true);
    const answer = await ask(message, base);
    setTurns((t) => [...t, answer]);
    setThinking(false);
    input.current?.focus();
  };
  // a failed answer can be asked again in place
  const retry = (i: number) => {
    const question = turns[i - 1];
    if (question?.role === "user") void send(question.content, turns.slice(0, i - 1));
  };

  const raised = DOCKED.some((p) => path.startsWith(p));
  const ready = draft.trim().length > 0 && !thinking;
  return (
    <div className={cn("fixed right-4 z-50 flex flex-col items-end gap-3 md:right-6", raised ? "bottom-24" : "bottom-4 md:bottom-6")}>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog" aria-label="Ask Bespoke"
            initial={{ opacity: 0, y: 24, scale: 0.92, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 16, scale: 0.94, filter: "blur(4px)" }} transition={SPRING} style={{ transformOrigin: "bottom right" }}
            className="flex h-[min(600px,calc(100svh-8rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] bg-white/90 shadow-[0_30px_90px_-24px_rgba(13,17,23,.45)] ring-1 ring-black/[.06] backdrop-blur-2xl"
          >
            <header className="flex items-center gap-3 px-5 pb-3 pt-4">
              <AskIcon className="size-9 shrink-0 text-brand-ink" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-medium leading-tight tracking-[-0.01em]">Ask</h2>
                <p className="text-[13px] text-brand-ink/55">Answers from Bespoke's guides</p>
              </div>
              <AnimatePresence>
                {turns.length > 0 && (
                  <motion.button type="button" onClick={() => { setTurns([]); input.current?.focus(); }} disabled={thinking}
                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING}
                    className="press h-8 rounded-full px-3 text-[13px] font-medium text-brand-ink/70 transition-colors hover:bg-black/[.05] hover:text-brand-ink disabled:opacity-40">
                    New chat
                  </motion.button>
                )}
              </AnimatePresence>
            </header>

            <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {turns.length === 0 ? (
                <div className="flex h-full flex-col justify-end gap-5 px-1 pb-1">
                  <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }}
                    className="text-[26px] leading-[1.1] tracking-[-0.03em]">Hi. What are you<br />making today?</motion.p>
                  <ul className="flex flex-col items-start gap-2">
                    {(hasDesign ? STYLE_STARTERS : STARTERS).map((s, i) => (
                      <motion.li key={s} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.05 }}>
                        <button type="button" onClick={() => send(s)}
                          className="press rounded-full px-4 py-2 text-left text-[14px] text-brand-ink ring-1 ring-black/10 transition-[background-color,box-shadow,transform] duration-200 hover:bg-black/[.04] hover:ring-black/20 active:scale-[0.97]">
                          {s}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ol aria-live="polite" className="flex flex-col gap-3 pt-1">
                  {turns.map((t, i) => {
                    const mine = t.role === "user";
                    return (
                      <motion.li key={i} layout="position" initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}
                        style={{ transformOrigin: mine ? "bottom right" : "bottom left" }} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                        <div className={cn(
                          "max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-[1.45]",
                          mine ? "rounded-[20px] rounded-br-[6px] bg-brand-ink text-white" : "rounded-[20px] rounded-bl-[6px] bg-[#f2f3f5] text-brand-ink",
                          t.failed && "bg-[#fdf1f1] text-[#8a1c1c]",
                        )}>
                          {mine || t.failed ? t.content : <Reveal text={t.content} still={still} />}
                        </div>
                        {t.links && t.links.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {t.links.map((l, k) => (
                              <motion.a key={l.href} href={l.href} initial={{ opacity: 0, y: 6, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ ...SPRING, delay: still ? 0 : 0.35 + k * 0.06 }} whileTap={{ scale: 0.95 }}
                                className={cn("inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium no-underline transition-colors",
                                  k === 0 ? "bg-brand-ink text-white hover:bg-[#232c3b]" : "text-brand-ink ring-1 ring-black/10 hover:bg-black/[.04]")}>
                                {l.label}
                              </motion.a>
                            ))}
                          </div>
                        )}
                        {t.sources && t.sources.length > 0 && (
                          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-1.5 px-1 text-[12px] text-brand-ink/50">
                            From {t.sources.slice(0, 2).join(" and ")}
                          </motion.p>
                        )}
                        {t.failed && t.content !== OFF && (
                          <button type="button" onClick={() => retry(i)} disabled={thinking}
                            className="press mt-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium text-brand-ink/70 transition-colors hover:bg-black/[.05] hover:text-brand-ink">
                            Try again
                          </button>
                        )}
                      </motion.li>
                    );
                  })}
                  <AnimatePresence>
                    {thinking && (
                      <motion.li key="dots" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING}
                        style={{ transformOrigin: "bottom left" }} className="flex">
                        <div className="rounded-[20px] rounded-bl-[6px] bg-[#f2f3f5] px-4 py-2.5"><Dots /></div>
                      </motion.li>
                    )}
                  </AnimatePresence>
                </ol>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="px-3 pb-3">
              <div className="flex items-end gap-2 rounded-[24px] bg-[#f2f3f5] p-1.5 pl-4 ring-1 ring-transparent transition-[box-shadow,background-color] duration-200 focus-within:bg-white focus-within:shadow-[0_6px_20px_-10px_rgba(13,17,23,.25)] focus-within:ring-black/15">
                <textarea ref={input} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={600}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
                  aria-label="Your question" placeholder="Ask about Bespoke"
                  className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] leading-[1.35] outline-none placeholder:text-brand-ink/40" />
                <motion.button type="submit" disabled={!ready} aria-label="Send"
                  animate={{ scale: ready ? 1 : 0.88, opacity: ready ? 1 : 0.35 }} whileTap={{ scale: 0.9 }} transition={SPRING}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-ink text-white">
                  <Arrow />
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      <button ref={launcher} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close Ask" : "Ask Bespoke"}
        className="press grid size-[68px] place-items-center text-brand-ink drop-shadow-[0_12px_20px_rgba(13,17,23,.32)] transition-[color,transform] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-1 hover:scale-[1.07] hover:text-[#232c3b] active:scale-95">
        <AskIcon open={open} className="size-[68px]" />
      </button>
    </div>
  );
}
