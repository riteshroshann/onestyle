"use client";
// The design a thread is about, pinned above the conversation, and the whole sheet one tap away.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { DesignSnapshot } from "@/lib/market";
import { SPRING } from "../site/Motion";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const MEASURES: [keyof DesignSnapshot["measurements"], string][] = [
  ["bust", "Bust"], ["waist", "Waist"], ["hip", "Hip"], ["shoulder", "Shoulder"], ["length", "Length"], ["sleeve", "Sleeve"],
];
// the parts a maker reads first; the rest is on the full sheet
const KEY_PARTS = ["Fabric", "Colour", "Neckline", "Sleeve", "Length", "Silhouette", "Fit"];

const measuresOf = (d: DesignSnapshot) => MEASURES.flatMap(([k, label]) => (d.measurements?.[k] ? [{ label, value: `${d.measurements[k]} in` }] : []));

export function DesignSummary({ design }: { design: DesignSnapshot }) {
  const [sheet, setSheet] = useState(false);
  const lines = design.lines ?? [];
  const key = [...lines].sort((a, b) => rank(a.part) - rank(b.part)).slice(0, 3);
  const measures = measuresOf(design);
  return (
    <>
      <div className="mx-3 flex items-center gap-4 rounded-[22px] bg-[#f5f6f8] px-5 py-4 md:mx-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{cap(design.title)}</p>
          {key.length > 0 && (
            <p className="mt-0.5 truncate text-[14px] text-brand-ink/60">{key.map((l) => `${l.part} ${l.en.toLowerCase()}`).join(" · ")}</p>
          )}
          <p className="mt-0.5 truncate text-[13px] text-brand-ink/45">
            {measures.length ? measures.map((m) => `${m.label} ${m.value}`).join(" · ") : "No measurements yet"}
          </p>
        </div>
        <button type="button" onClick={() => setSheet(true)}
          className="press h-10 shrink-0 rounded-full bg-white px-4 text-[14px] font-medium ring-1 ring-brand-ink/10 transition-colors hover:bg-brand-ink/[.03]">
          Full sheet
        </button>
      </div>
      <Sheet design={design} open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

const rank = (part: string) => { const i = KEY_PARTS.indexOf(part); return i < 0 ? KEY_PARTS.length : i; };

/** The frozen sheet, as the customer sent it. */
function Sheet({ design, open, onClose }: { design: DesignSnapshot; open: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  const measures = measuresOf(design);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="fixed inset-0 z-[60] flex justify-end bg-brand-ink/30 backdrop-blur-[2px]" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <motion.section role="dialog" aria-modal="true" aria-label="Tailor sheet" onClick={(e) => e.stopPropagation()}
            initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={SPRING}
            className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-[0_0_80px_-20px_rgba(13,17,23,.4)] md:m-3 md:h-[calc(100%-1.5rem)] md:rounded-[32px]">
            <header className="flex items-start justify-between gap-6 px-7 pb-4 pt-8 md:px-9">
              <div>
                <p className="text-[13px] font-medium text-brand-ink/50">Tailor sheet</p>
                <h2 className="display mt-2 text-[clamp(34px,4vw,48px)] leading-none">{cap(design.title)}</h2>
              </div>
              <button ref={close} type="button" onClick={onClose} aria-label="Close sheet"
                className="press -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-brand-ink/50 transition-colors hover:bg-brand-ink/[.06] hover:text-brand-ink">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-7 pb-10 md:px-9">
              <dl>
                {(design.lines ?? []).map((l) => (
                  <div key={l.part} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-4 border-b border-brand-ink/[.07] py-4">
                    <dt className="text-[14px] text-brand-ink/50">{l.part}</dt>
                    <dd className="text-[17px] font-medium leading-snug tracking-[-0.01em]">{cap(l.en)}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-10 text-[13px] font-medium text-brand-ink/50">Measurements</h3>
              {measures.length ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                  {measures.map((m) => (
                    <div key={m.label} className="border-b border-brand-ink/[.07] py-3">
                      <dt className="text-[13px] text-brand-ink/50">{m.label}</dt>
                      <dd className="text-[20px] font-medium tracking-[-0.02em]">{m.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="mt-2 text-[15px] text-brand-ink/55">None were added. Ask for the ones you need in the thread.</p>}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
