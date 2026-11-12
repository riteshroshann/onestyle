"use client";
import { useLenis } from "lenis/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Back to the top, bottom-left so it never collides with Ask on the right. Shows after one screen of scroll. */
export function ToTop() {
  const [shown, setShown] = useState(false);
  const still = useReducedMotion();
  // the home page scrolls through Lenis; plain window scroll would fight it
  const lenis = useLenis();

  useEffect(() => {
    const check = () => setShown(window.scrollY > window.innerHeight);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  const up = () => {
    if (lenis) lenis.scrollTo(0, { immediate: !!still });
    else window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  };

  return (
    <AnimatePresence>
      {shown && (
        <motion.button
          type="button" onClick={up} aria-label="Back to top"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          className="press fixed bottom-4 left-4 z-50 grid size-14 place-items-center rounded-full ring-1 ring-white/15 bg-foreground text-background shadow-[0_12px_40px_-12px_rgba(0,0,0,.6)] hover:bg-brand-ink md:bottom-6 md:left-6"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
