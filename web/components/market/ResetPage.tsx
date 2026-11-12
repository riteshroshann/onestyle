"use client";
// Opened from the reset email: the link signs the person in for this one purpose, and they choose a new password.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { getStore, MarketError } from "@/lib/market";
import type { Profile } from "@/lib/market";
import { homeFor } from "../site/Header";
import { SOFT } from "../site/Motion";
import { Password } from "./AuthPage";

export function ResetPage() {
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const store = getStore();
    // the session from the link arrives a moment after the page loads
    const stop = store.onSession((p) => { if (p) setMe(p); });
    store.session().then((p) => setMe((m) => m ?? p)).catch(() => setMe(null));
    const t = setTimeout(() => setMe((m) => (m === undefined ? null : m)), 4000);
    return () => { stop(); clearTimeout(t); };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await getStore().updatePassword(password); setDone(true); setTimeout(() => { if (me) window.location.href = homeFor(me); }, 1600); }
    catch (err) { setError(err instanceof MarketError ? err.message : "Something went wrong. Try again."); setBusy(false); }
  };

  return (
    <main className="grid min-h-[100svh] place-items-center bg-[#f4f5f7] px-4 py-10">
      <motion.section initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SOFT}
        className="w-full max-w-[460px] rounded-[32px] bg-white p-7 shadow-[0_0_0_1px_rgba(13,17,23,.05),0_40px_90px_-40px_rgba(13,17,23,.35)] sm:p-10">
        <a href="/" className="display text-[22px] text-brand-ink no-underline">Bespoke</a>
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="status">
              <h1 className="display mt-8 text-[40px] leading-none">Password changed.</h1>
              <p className="mt-4 text-[15px] text-brand-ink/60">Taking you to your account.</p>
            </motion.div>
          ) : me === null ? (
            <motion.div key="none" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="display mt-8 text-[40px] leading-none">That link has expired.</h1>
              <p className="mt-4 text-[15px] leading-[1.55] text-brand-ink/60">Reset links work once and only for an hour. Ask for a new one from the log in page.</p>
              <a href="/login/" className="press mt-8 inline-flex h-12 items-center rounded-full bg-brand-ink px-6 text-[15px] font-medium text-white no-underline">Go to log in</a>
            </motion.div>
          ) : (
            <motion.form key="form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onSubmit={save} noValidate>
              <h1 className="display mt-8 text-[40px] leading-none">Set a new password.</h1>
              <p className="mt-4 text-[15px] text-brand-ink/60">{me ? `For ${me.email}.` : "One moment."}</p>
              <div className="mt-8"><Password value={password} onChange={setPassword} mode="signup" /></div>
              {error && <p role="alert" className="mt-5 text-[14px] text-[#b5121b]">{error}</p>}
              <button type="submit" disabled={busy || !me || password.length < 8}
                className="press mt-8 h-14 w-full rounded-full bg-brand-ink text-[16px] font-medium text-white transition-[background-color,opacity] hover:bg-[#232c3b] disabled:opacity-40">{busy ? "Saving" : "Save new password"}</button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.section>
    </main>
  );
}
