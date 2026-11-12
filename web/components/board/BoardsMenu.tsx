"use client";
// The board switcher: which board is open, and every earlier board, newest first.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { type BoardMeta, CHANGED, listBoards, removeBoard } from "@/lib/boards";
import { SPRING } from "../site/Motion";

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function BoardsMenu({ current, onOpen, onNew }: { current: string; onOpen: (id: string) => void; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const here = boards.find((b) => b.id === current);

  useEffect(() => { if (open) { setBoards(listBoards()); setConfirm(null); } }, [open]);
  useEffect(() => {
    const refresh = () => setBoards(listBoards());
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [current]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog"
        className="press flex h-11 items-center gap-2 rounded-full bg-white/80 pl-4 pr-3 text-[14px] font-medium shadow-[0_8px_24px_-14px_rgba(13,17,23,.35)] ring-1 ring-black/[.08] backdrop-blur-xl transition-[background-color,transform] hover:bg-white active:scale-[0.97]">
        <span className="max-w-[40vw] truncate">{here ? here.title : "New board"}</span>
        <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={SPRING} viewBox="0 0 24 24" className="size-4 text-brand-ink/50" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Your boards"
            initial={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={SPRING} style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-[52px] z-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] bg-white/90 p-2 shadow-[0_30px_80px_-24px_rgba(13,17,23,.4)] ring-1 ring-black/[.06] backdrop-blur-2xl">
            <button type="button" onClick={() => { setOpen(false); onNew(); }}
              className="press flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left text-[15px] font-medium transition-colors hover:bg-black/[.04]">
              <span className="grid size-10 place-items-center rounded-[12px] bg-brand-ink text-[20px] leading-none text-white" aria-hidden="true">+</span>
              New board
            </button>
            <p className="px-3 pb-1 pt-3 text-[12px] text-brand-ink/45">Your boards</p>
            {boards.length === 0 ? (
              <p className="px-3 pb-3 text-[14px] leading-[1.5] text-brand-ink/55">Boards you fill are kept here, newest first, so you can come back to any of them.</p>
            ) : (
              <ul className="max-h-[50vh] overflow-y-auto">
                {boards.map((b, i) => (
                  <motion.li key={b.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.03 * i }}
                    className="group flex items-center gap-1 rounded-[16px] transition-colors hover:bg-black/[.04]">
                    <button type="button" onClick={() => { setOpen(false); if (b.id !== current) onOpen(b.id); }} aria-current={b.id === current || undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                      {b.cover
                        ? <img src={b.cover} alt="" className="size-10 shrink-0 rounded-[12px] object-cover ring-1 ring-black/[.06]" />
                        : <span className="size-10 shrink-0 rounded-[12px] bg-brand-ink/[.06]" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className={cn("block truncate text-[14px] font-medium", b.id === current && "text-[#0284c7]")}>{b.title}</span>
                        <span className="block truncate text-[12px] text-brand-ink/50">{count(b.pictures, "picture")}{b.notes ? `, ${count(b.notes, "note")}` : ""} · {ago(b.updated)}</span>
                      </span>
                    </button>
                    {confirm === b.id ? (
                      <button type="button" onClick={() => { removeBoard(b.id); setBoards(listBoards()); if (b.id === current) onNew(); }}
                        className="mr-2 h-8 shrink-0 rounded-full bg-[#b5121b] px-3 text-[12px] font-medium text-white">Remove</button>
                    ) : (
                      <button type="button" onClick={() => setConfirm(b.id)} aria-label={`Remove ${b.title}`}
                        className="mr-2 grid size-8 shrink-0 place-items-center rounded-full text-brand-ink/40 opacity-0 transition-[opacity,background-color] hover:bg-black/[.06] hover:text-brand-ink focus-visible:opacity-100 group-hover:opacity-100">
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    )}
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
