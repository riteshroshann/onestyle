"use client";
// From the tailor sheet: choose a maker and send them the design as it stands.
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { sheetLines } from "@/lib/engine/describe";
import type { Measurements } from "@/lib/engine/describe";
import type { Spec } from "@/lib/engine/spec";
import { getStore, MarketError } from "@/lib/market";
import { SPRING } from "../site/Motion";

// after signing in, people come back to the sheet they were sending
const BACK = "/studio/?view=sheet";
import type { Profile } from "@/lib/market";

export function SendToMaker({ spec, m, onClose }: { spec: Spec; m: Measurements; onClose: () => void }) {
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [makers, setMakers] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const store = getStore();
    store.session().then(async (p) => { setMe(p); if (p) setMakers(await store.makers()); }).catch(() => setMe(null));
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      // a short name for lists: "navy kurti"
      const title = [spec.lists.colour?.[0]?.value, spec.slots.garment?.value ?? "design"].filter(Boolean).join(" ");
      const request = await getStore().createRequest(picked, { title, spec, lines: sheetLines(spec, m), measurements: m }, note);
      window.location.href = `/orders/?r=${request.id}`;
    } catch (err) {
      setError(err instanceof MarketError ? err.message : "That did not send. Try again.");
      setBusy(false);
    }
  };
  const title = me === null ? "Sign in to send it." : me?.role === "maker" ? "This is for customers." : "Choose a maker.";
  const lede = me === null
    ? "Your design stays right here while you sign in or create an account, and you come straight back to this sheet."
    : me?.role === "maker"
      ? "You are signed in as a maker. Sign in with a customer account to send designs, or print this sheet instead."
      : "They get your design, the sheet and your measurements, and you talk it through in one thread.";

  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-end bg-brand-ink/40 backdrop-blur-[2px] md:place-items-center md:p-6" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <motion.div
        role="dialog" aria-modal="true" aria-label="Send to a maker" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={SPRING}
        className="flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-[0_40px_100px_-30px_rgba(13,17,23,.5)] md:max-w-[560px] md:rounded-[32px]"
      >
        <header className="flex items-start justify-between gap-6 px-7 pb-2 pt-8 md:px-9">
          <h2 className="display text-[clamp(32px,4vw,44px)] leading-none">{me === undefined ? "One moment." : title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="press -mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-brand-ink/50 transition-colors hover:bg-brand-ink/[.06] hover:text-brand-ink">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        {me !== undefined && <p className="px-7 pb-6 text-[16px] leading-[1.5] text-brand-ink/60 md:px-9">{lede}</p>}

        {me === null && (
          <div className="flex flex-wrap gap-3 px-7 pb-9 md:px-9">
            <a href={`/login/?next=${encodeURIComponent(BACK)}`} className="press inline-flex h-12 items-center rounded-full bg-brand-ink px-7 text-[15px] font-medium text-white no-underline transition-colors hover:bg-[#232c3b]">Sign in</a>
            <a href={`/signup/?next=${encodeURIComponent(BACK)}`} className="press inline-flex h-12 items-center rounded-full px-7 text-[15px] font-medium text-brand-ink no-underline ring-1 ring-brand-ink/15 transition-colors hover:bg-brand-ink/[.04]">Create an account</a>
          </div>
        )}

        {me?.role === "customer" && (
          <>
            {makers.length === 0 ? (
              <p className="mx-7 mb-2 rounded-[22px] bg-brand-ink/[.04] px-5 py-5 text-[15px] leading-[1.5] text-brand-ink/70 md:mx-9">
                No makers have joined Bespoke yet. Print the sheet or save it as a PDF and take it to any tailor; it says everything they need.
              </p>
            ) : (
              <ul className="flex-1 space-y-2 overflow-y-auto px-4 md:px-6">
                {makers.map((maker, i) => (
                  <motion.li key={maker.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 + i * 0.04 }}>
                    <button type="button" onClick={() => setPicked(maker.id)} aria-pressed={picked === maker.id}
                      className="press block w-full rounded-[20px] px-4 py-4 text-left transition-colors hover:bg-brand-ink/[.04] aria-pressed:bg-brand-ink aria-pressed:text-white">
                      <span className="block text-[18px] font-medium tracking-[-0.01em]">{maker.name}</span>
                      <span className="mt-0.5 block text-[14px] opacity-60">{[maker.craft, maker.city, ...(maker.specialties ?? [])].filter(Boolean).join(" · ")}</span>
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
            {makers.length > 0 && (
              <div className="border-t border-brand-ink/[.06] px-7 pb-7 pt-5 md:px-9">
                <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the maker" placeholder="Add a note, for example when you need it by" maxLength={2000}
                  className="h-12 w-full rounded-full bg-brand-ink/[.04] px-5 text-[15px] outline-none ring-1 ring-transparent transition-[box-shadow,background-color] placeholder:text-brand-ink/40 focus:bg-white focus:ring-brand-ink/20" />
                {error && <p role="alert" className="mt-3 text-[14px] text-[#b5121b]">{error}</p>}
                <button type="button" onClick={send} disabled={!picked || busy}
                  className="press mt-4 h-[52px] w-full rounded-full bg-brand-ink text-[16px] font-medium text-white transition-[background-color,opacity] hover:bg-[#232c3b] disabled:opacity-35">
                  {busy ? "Sending" : picked ? `Send to ${makers.find((x) => x.id === picked)?.name}` : "Choose a maker above"}
                </button>
              </div>
            )}
            {makers.length === 0 && <div className="pb-7" />}
          </>
        )}
        {me?.role === "maker" && <div className="pb-7" />}
      </motion.div>
    </motion.div>
  );
}
