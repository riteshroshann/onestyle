"use client";
// The help assistant in the corner. It answers only from Bespoke's own knowledge base; the rules live in api/assistant.js.
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Turn { role: "user" | "assistant"; content: string }
const STARTERS = ["How do I measure my bust?", "What is ease?", "How does the moodboard work?"];
const UNAVAILABLE = "I am not available right now. Try again in a moment.";
const OFF = "I am not switched on yet.";
// pages with their own bar along the bottom edge: the launcher sits above it
const DOCKED = ["/studio", "/orders", "/makers"];

async function ask(message: string, history: Turn[]): Promise<string> {
  try {
    const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, history }) });
    if (res.status === 501) return OFF;
    const body = await res.json();
    return body.answer ?? body.error ?? UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

export function Assistant() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLLIElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [turns.length, thinking]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || thinking) return;
    const history = turns;
    setTurns([...history, { role: "user", content: message }]);
    setDraft("");
    setThinking(true);
    const answer = await ask(message, history);
    setTurns((t) => [...t, { role: "assistant", content: answer }]);
    setThinking(false);
  };

  const raised = DOCKED.some((p) => path.startsWith(p));
  return (
    <div className={cn("fixed right-4 z-50 flex flex-col items-end gap-3 md:right-6", raised ? "bottom-24" : "bottom-4 md:bottom-6")}>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog" aria-label="Ask Bespoke"
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }} style={{ transformOrigin: "bottom right" }}
            className="flex h-[min(560px,70svh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_-20px_rgba(0,0,0,.45)] ring-1 ring-black/10"
          >
            <h2 className="display border-b border-foreground/10 px-5 py-4 text-[28px]">Ask</h2>
            <ol aria-live="polite" className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {turns.length === 0 && STARTERS.map((s) => (
                <li key={s}><button onClick={() => send(s)} className="press w-full rounded-xl bg-secondary px-4 py-3 text-left text-[15px] font-semibold hover:bg-[#ececec]">{s}</button></li>
              ))}
              {turns.map((t, i) => (
                <motion.li key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                  <span className={cn("max-w-[86%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] font-medium leading-snug", t.role === "user" ? "rounded-br-sm bg-foreground text-background" : "rounded-bl-sm bg-secondary")}>{t.content}</span>
                </motion.li>
              ))}
              {thinking && <li className="shimmer-text px-1 text-[15px] font-semibold">Thinking</li>}
              <li ref={end} aria-hidden />
            </ol>
            <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex gap-2 border-t border-foreground/10 p-3">
              <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Your question" placeholder="Ask about Bespoke" maxLength={600}
                className="h-11 min-w-0 flex-1 rounded-full bg-secondary px-4 text-[15px] font-medium outline-none placeholder:text-foreground/40 focus:shadow-[0_0_0_2px_var(--foreground)]" />
              <button type="submit" disabled={!draft.trim() || thinking} className="press h-11 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">Send</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="press h-14 rounded-full bg-foreground px-7 text-[16px] font-semibold text-background shadow-[0_12px_40px_-12px_rgba(0,0,0,.6)] hover:bg-black">
        {open ? "Close" : "Ask"}
      </button>
    </div>
  );
}
