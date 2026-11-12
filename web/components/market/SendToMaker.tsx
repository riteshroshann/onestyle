"use client";
// From the tailor sheet: choose a maker and send them the design as it stands.
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { sheetLines } from "@/lib/engine/describe";
import type { Measurements } from "@/lib/engine/describe";
import type { Spec } from "@/lib/engine/spec";
import { getStore, MarketError } from "@/lib/market";
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/50 md:place-items-center" onClick={onClose}>
      <motion.div
        role="dialog" aria-modal="true" aria-label="Send to a maker" onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", duration: 0.45, bounce: 0 }}
        className="flex max-h-[88svh] w-full flex-col bg-white md:max-w-xl md:rounded-lg"
      >
        <header className="flex items-start justify-between gap-6 px-6 pb-4 pt-7 md:px-8">
          <h2 className="display text-[44px]">{me === null ? "Sign in first." : me?.role === "maker" ? "Customers only." : "Choose a maker."}</h2>
          <button onClick={onClose} className="press mt-2 text-[15px] font-semibold underline underline-offset-4">Close</button>
        </header>

        {me === null && (
          <div className="px-6 pb-8 md:px-8">
            <a href="/login/?next=/studio/" className="press inline-flex h-14 items-center rounded-full bg-foreground px-9 text-[17px] font-semibold text-background no-underline">Sign in</a>
          </div>
        )}

        {me?.role === "customer" && (
          <>
            <ul className="flex-1 overflow-y-auto border-y border-foreground/10">
              {makers.map((maker) => (
                <li key={maker.id}>
                  <button onClick={() => setPicked(maker.id)} aria-pressed={picked === maker.id}
                    className="press block w-full border-b border-foreground/10 px-6 py-5 text-left last:border-b-0 aria-pressed:bg-foreground aria-pressed:text-background md:px-8">
                    <span className="block text-[20px] font-semibold tracking-tight">{maker.name}</span>
                    <span className="mt-1 block text-[14px] font-medium opacity-60">{[maker.craft, maker.city, ...(maker.specialties ?? [])].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
              {makers.length === 0 && <li className="px-6 py-10 text-[17px] font-semibold text-foreground/50 md:px-8">No makers have joined yet.</li>}
            </ul>
            <div className="px-6 py-5 md:px-8">
              <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note to the maker" placeholder="Add a note" maxLength={2000}
                className="h-12 w-full rounded-full bg-secondary px-5 text-[16px] font-medium outline-none placeholder:text-foreground/40 focus:shadow-[0_0_0_2px_var(--foreground)]" />
              {error && <p role="alert" className="mt-3 text-[14px] font-semibold text-destructive">{error}</p>}
              <button onClick={send} disabled={!picked || busy} className="press mt-4 h-14 w-full rounded-full bg-foreground text-[17px] font-semibold text-background">{busy ? "Sending" : "Send design"}</button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
