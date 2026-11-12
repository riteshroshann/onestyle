"use client";
// The message field: grows with what you write, sends on Enter (Shift+Enter for a new line), and says when it is too long.
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { MAX_BODY } from "@/lib/market";
import { cn } from "@/lib/utils";
import { Arrow, SPRING } from "../site/Motion";

export interface ComposerHandle { focus(): void }

export const Composer = forwardRef<ComposerHandle, { value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string }>(
  function Composer({ value, onChange, onSend, placeholder }, ref) {
    const field = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => { const el = field.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); } }), []);
    useEffect(() => {
      const el = field.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    }, [value]);

    const over = value.length > MAX_BODY;
    const ready = value.trim().length > 0 && !over;
    const near = value.length > MAX_BODY - 200;
    return (
      <form onSubmit={(e) => { e.preventDefault(); if (ready) onSend(); }} className="px-3 pb-3 pt-1 md:px-5 md:pb-5">
        <AnimatePresence>
          {near && (
            <motion.p key="count" role={over ? "alert" : undefined} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn("px-4 pb-2 text-[13px]", over ? "text-[#b5121b]" : "text-brand-ink/45")}>
              {over ? `Shorten it to ${MAX_BODY} characters to send. It is ${value.length} now.` : `${MAX_BODY - value.length} characters left`}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="flex items-end gap-2 rounded-[26px] bg-[#f2f3f5] p-1.5 pl-5 ring-1 ring-transparent transition-[box-shadow,background-color] duration-200 focus-within:bg-white focus-within:shadow-[0_6px_20px_-10px_rgba(13,17,23,.25)] focus-within:ring-black/15">
          <textarea ref={field} rows={1} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Message" placeholder={placeholder}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (ready) onSend(); } }}
            className="max-h-[168px] min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-[1.35] outline-none placeholder:text-brand-ink/40" />
          <motion.button type="submit" disabled={!ready} aria-label="Send"
            animate={{ scale: ready ? 1 : 0.88, opacity: ready ? 1 : 0.35 }} whileTap={{ scale: 0.9 }} transition={SPRING}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-ink text-white">
            <Arrow />
          </motion.button>
        </div>
      </form>
    );
  },
);
