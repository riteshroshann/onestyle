"use client";
// Motion pieces shared by the Ask chat and the studio, so both feel like one product.
import { motion } from "motion/react";

export const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;
export const SOFT = { type: "spring", stiffness: 160, damping: 24 } as const;

/** Text arrives word by word, the way it would if it streamed. */
export function Reveal({ text, still }: { text: string; still: boolean }) {
  if (still) return <>{text}</>;
  const words = text.split(/(\s+)/);
  return (
    <>
      {words.map((w, i) => (
        <motion.span key={i} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.35, delay: Math.min(i * 0.012, 1.2) }}>{w}</motion.span>
      ))}
    </>
  );
}

export function Dots() {
  return (
    <span className="flex h-5 items-center gap-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-1.5 rounded-full bg-brand-ink/45"
          animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }} />
      ))}
    </span>
  );
}

export const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[18px]">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
