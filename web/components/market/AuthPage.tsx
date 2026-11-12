"use client";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useId, useState } from "react";
import { CHECK_EMAIL, LINK_EXPIRED, getStore, MarketError } from "@/lib/market";
import type { Craft, Role } from "@/lib/market";
import { PHOTOS } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { homeFor } from "../site/Header";
import { SOFT, SPRING } from "../site/Motion";

type Mode = "login" | "signup";
type Pane = "form" | "sent" | "forgot" | "reset-sent" | "expired";
const CRAFTS: { value: Craft; note: string }[] = [
  { value: "Fashion designer", note: "You design collections or one-offs" },
  { value: "Tailor", note: "You cut and stitch to measure" },
  { value: "Boutique", note: "You run a shop with a team" },
];
const DOOR: Record<Role, { photo: string; alt: string; words: Record<Mode, string>; base: string; who: string }> = {
  customer: { photo: PHOTOS.steps.src, alt: PHOTOS.steps.alt, words: { login: "Welcome back.", signup: "Join." }, base: "", who: "For customers" },
  maker: { photo: PHOTOS.seamstress.src, alt: PHOTOS.seamstress.alt, words: { login: "Your studio.", signup: "Make with us." }, base: "/makers", who: "For designers, tailors and boutiques" },
};
const MIN = 8;

/** A labelled field on a soft fill that lifts to white on focus. */
export function Field({ label, hint, trailing, ...input }: { label: string; hint?: React.ReactNode; trailing?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-[13px] font-medium text-brand-ink/55">{label}</label>
      <div className="mt-1.5 flex items-center rounded-[16px] bg-brand-ink/[.04] ring-1 ring-transparent transition-[background-color,box-shadow] duration-200 focus-within:bg-white focus-within:shadow-[0_8px_24px_-14px_rgba(13,17,23,.3)] focus-within:ring-brand-ink/20 hover:bg-brand-ink/[.06] focus-within:hover:bg-white">
        <input id={id} {...input} className="h-[52px] min-w-0 flex-1 bg-transparent px-4 text-[16px] text-brand-ink outline-none placeholder:text-brand-ink/30" />
        {trailing}
      </div>
      {hint}
    </div>
  );
}

const Eye = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
    <motion.path d="M4 4l16 16" initial={false} animate={{ pathLength: open ? 0 : 1, opacity: open ? 0 : 1 }} transition={{ duration: 0.25 }} />
  </svg>
);

export function Password({ value, onChange, mode }: { value: string; onChange: (v: string) => void; mode: Mode }) {
  const [show, setShow] = useState(false);
  const short = mode === "signup" && value.length > 0 && value.length < MIN;
  return (
    <Field label="Password" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} required minLength={MIN}
      autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? `At least ${MIN} characters` : undefined}
      trailing={(
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
          className="press mr-1.5 grid size-10 shrink-0 place-items-center rounded-full text-brand-ink/45 transition-colors hover:bg-brand-ink/[.06] hover:text-brand-ink">
          <Eye open={show} />
        </button>
      )}
      hint={mode === "signup" ? (
        <div className="mt-2 flex items-center gap-2 text-[13px]">
          <span className="h-1 w-24 overflow-hidden rounded-full bg-brand-ink/[.08]">
            <motion.span className={cn("block h-full rounded-full", short ? "bg-[#f59e0b]" : "bg-[#22c55e]")} animate={{ width: `${Math.min(100, (value.length / MIN) * 100)}%` }} transition={SPRING} />
          </span>
          <span className={value.length >= MIN ? "text-[#15803d]" : "text-brand-ink/45"}>{value.length >= MIN ? "Good length" : `${Math.max(0, MIN - value.length)} more characters`}</span>
        </div>
      ) : undefined}
    />
  );
}

export function AuthPage({ role, mode }: { role: Role; mode: Mode }) {
  const door = DOOR[role];
  const [form, setForm] = useState({ name: "", email: "", password: "", city: "", makes: "" });
  const [craft, setCraft] = useState<Craft>("Tailor");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<Pane>("form");
  // the return address rides along when switching between log in and create account
  const [qs, setQs] = useState("");
  const shake = useAnimationControls();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  // "next" may only point inside this site
  const leave = (to: string) => {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && /^\/(?!\/)/.test(next) ? next : to;
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.delete("confirmed");
    setQs(q.toString() ? `?${q}` : "");
    // a confirmation link that failed comes back with the reason in the address
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error_code") === "otp_expired" || hash.get("error") === "access_denied") { setPane("expired"); setError(LINK_EXPIRED); }
    else if (new URLSearchParams(window.location.search).has("confirmed")) setNotice("Your email is confirmed. Log in to continue.");
    // someone already logged in on this side has no business here; a customer opening the maker door may switch
    getStore().session().then((me) => { if (me?.role === role) leave(homeFor(me)); }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (err: unknown) => {
    setError(err instanceof MarketError ? err.message : "Something went wrong. Try again.");
    setBusy(false);
    void shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const store = getStore();
      const me = mode === "login"
        ? await store.signIn(form.email, form.password, role)
        : await store.signUp({ ...form, role, ...(role === "maker" ? { craft, specialties: form.makes.split(",").map((s) => s.trim()).filter(Boolean) } : {}) });
      leave(homeFor(me));
    } catch (err) {
      if (err instanceof MarketError && err.message === CHECK_EMAIL) { setPane("sent"); setBusy(false); return; }
      fail(err);
    }
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await getStore().resetPassword(form.email); setPane("reset-sent"); setBusy(false); } catch (err) { fail(err); }
  };
  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await getStore().resendConfirmation(form.email, role); setPane("sent"); setBusy(false); } catch (err) { fail(err); }
  };

  const other = `${door.base}/${mode === "login" ? "signup" : "login"}/${qs}`;
  const primary = "press mt-8 h-14 w-full rounded-full bg-brand-ink text-[16px] font-medium text-white transition-[background-color,opacity,transform] hover:bg-[#232c3b] active:scale-[0.98] disabled:opacity-50";
  const link = "font-medium text-brand-ink underline decoration-brand-ink/25 underline-offset-[5px] transition-[text-decoration-color] hover:decoration-brand-ink";
  const swap = { initial: { opacity: 0, y: 14, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -10, filter: "blur(4px)" }, transition: { duration: 0.3 } };
  const emailField = <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />;
  const errorLine = (
    <AnimatePresence>
      {error && <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-5 text-[14px] text-[#b5121b]">{error}</motion.p>}
    </AnimatePresence>
  );

  return (
    <main className="grid min-h-[100svh] md:grid-cols-2">
      <div className="sticky top-0 hidden h-[100svh] overflow-hidden bg-foreground md:block">
        <img src={door.photo} alt={door.alt} className="absolute inset-0 size-full scale-110 object-cover opacity-70 grayscale" />
        <a href="/" aria-label="Bespoke home" className="display absolute left-10 top-8 text-[34px] text-white no-underline">Bespoke</a>
        <p className="display absolute inset-x-10 bottom-10 text-[clamp(56px,7vw,120px)] text-white">{door.words[mode]}</p>
      </div>

      <div className="flex flex-col items-center justify-center bg-[#f4f5f7] px-4 py-10 md:px-10">
        <a href="/" aria-label="Bespoke home" className="display mb-8 self-start text-[30px] text-brand-ink no-underline md:hidden">Bespoke</a>
        <motion.section animate={shake} initial={{ opacity: 0, y: 24, scale: 0.98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={SOFT}
          className="w-full max-w-[460px] rounded-[32px] bg-white p-7 shadow-[0_0_0_1px_rgba(13,17,23,.05),0_40px_90px_-40px_rgba(13,17,23,.35)] sm:p-10">
          <AnimatePresence mode="wait" initial={false}>
            {pane === "form" && (
              <motion.form key={`form-${mode}`} {...swap} onSubmit={submit} noValidate>
                <h1 className="display text-[clamp(36px,4vw,46px)] leading-none">{mode === "login" ? "Log in" : "Create account"}</h1>
                <p className="mt-3 text-[15px] text-brand-ink/55">{door.who}</p>
                <AnimatePresence>
                  {notice && <motion.p role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6 rounded-[14px] bg-[#38bdf8]/10 px-4 py-3 text-[14px] text-[#0369a1]">{notice}</motion.p>}
                </AnimatePresence>
                <div className="mt-8 space-y-5">
                  {mode === "signup" && <Field label="Name" autoComplete="name" value={form.name} onChange={set("name")} required />}
                  {emailField}
                  <Password value={form.password} onChange={(password) => setForm({ ...form, password })} mode={mode} />
                  {mode === "login" && (
                    <div className="-mt-2 text-right">
                      <button type="button" onClick={() => { setError(""); setPane("forgot"); }} className={cn(link, "text-[14px]")}>Forgot password?</button>
                    </div>
                  )}
                  {mode === "signup" && <Field label="City" autoComplete="address-level2" value={form.city} onChange={set("city")} placeholder="Where you live or work" />}
                  {mode === "signup" && role === "maker" && (
                    <>
                      <fieldset>
                        <legend className="text-[13px] font-medium text-brand-ink/55">You are a</legend>
                        <div className="mt-2 grid gap-2">
                          {CRAFTS.map(({ value, note }) => (
                            <motion.button key={value} type="button" aria-pressed={craft === value} onClick={() => setCraft(value)} whileTap={{ scale: 0.98 }}
                              className={cn("flex items-center gap-3 rounded-[16px] px-4 py-3 text-left ring-1 transition-[background-color,box-shadow]",
                                craft === value ? "bg-brand-ink text-white ring-brand-ink" : "bg-white ring-brand-ink/10 hover:bg-brand-ink/[.03] hover:ring-brand-ink/20")}>
                              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-1", craft === value ? "ring-white/60" : "ring-brand-ink/25")}>
                                <AnimatePresence>{craft === value && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING} className="size-2.5 rounded-full bg-white" />}</AnimatePresence>
                              </span>
                              <span>
                                <span className="block text-[15px] font-medium">{value}</span>
                                <span className={cn("block text-[13px]", craft === value ? "text-white/65" : "text-brand-ink/50")}>{note}</span>
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      </fieldset>
                      <Field label="What you make" placeholder="Blouses, lehengas, sherwanis" value={form.makes} onChange={set("makes")} />
                    </>
                  )}
                </div>
                {errorLine}
                <button type="submit" disabled={busy} className={primary}>{busy ? "One moment" : mode === "login" ? "Log in" : "Create account"}</button>
                <p className="mt-7 text-center text-[14px] text-brand-ink/55">
                  {mode === "login" ? "New to Bespoke? " : "Already have an account? "}
                  <a href={other} className={link}>{mode === "login" ? "Create an account" : "Log in"}</a>
                </p>
                <p className="mt-3 text-center text-[14px] text-brand-ink/55">
                  <a href={role === "maker" ? "/login/" : "/makers/login/"} className="text-brand-ink/55 underline decoration-brand-ink/20 underline-offset-[5px] transition-colors hover:text-brand-ink">{role === "maker" ? "I am a customer" : "I am a maker"}</a>
                </p>
              </motion.form>
            )}

            {pane === "forgot" && (
              <motion.form key="forgot" {...swap} onSubmit={sendReset} noValidate>
                <h1 className="display text-[clamp(32px,3.6vw,42px)] leading-none">Reset your password.</h1>
                <p className="mt-4 text-[15px] leading-[1.55] text-brand-ink/60">Enter the email you use for Bespoke and we send you a link to choose a new password.</p>
                <div className="mt-8">{emailField}</div>
                {errorLine}
                <button type="submit" disabled={busy || !form.email} className={primary}>{busy ? "Sending" : "Send reset link"}</button>
                <p className="mt-7 text-center text-[14px]"><button type="button" onClick={() => { setError(""); setPane("form"); }} className={link}>Back to log in</button></p>
              </motion.form>
            )}

            {pane === "expired" && (
              <motion.form key="expired" {...swap} onSubmit={resend} noValidate>
                <h1 className="display text-[clamp(32px,3.6vw,42px)] leading-none">That link has expired.</h1>
                <p className="mt-4 text-[15px] leading-[1.55] text-brand-ink/60">Links in our emails work once and only for a while. Enter your email and we send a fresh one.</p>
                <div className="mt-8">{emailField}</div>
                <button type="submit" disabled={busy || !form.email} className={primary}>{busy ? "Sending" : "Send a new link"}</button>
                <p className="mt-7 text-center text-[14px]"><button type="button" onClick={() => { setError(""); setPane("form"); }} className={link}>Back to log in</button></p>
              </motion.form>
            )}

            {(pane === "sent" || pane === "reset-sent") && (
              <motion.div key={pane} {...swap} role="status">
                <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...SPRING, delay: 0.1 }}
                  className="grid size-14 place-items-center rounded-full bg-brand-ink text-white">
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7l8 6 8-6" /></svg>
                </motion.div>
                <h1 className="display mt-7 text-[clamp(32px,3.6vw,42px)] leading-none">Check your email.</h1>
                <p className="mt-4 text-[15px] leading-[1.55] text-brand-ink/60">
                  We sent a link to <span className="font-medium text-brand-ink">{form.email}</span>.{" "}
                  {pane === "sent" ? "Open it to confirm your account; it brings you straight back here, logged in." : "Open it to choose a new password."}
                </p>
                <p className="mt-3 text-[14px] leading-[1.5] text-brand-ink/45">Nothing after a few minutes? Look in spam, or send it again.</p>
                {errorLine}
                <div className="mt-8 flex flex-wrap gap-3">
                  <button type="button" disabled={busy} onClick={(e) => (pane === "sent" ? resend(e as unknown as React.FormEvent) : sendReset(e as unknown as React.FormEvent))}
                    className="press h-12 rounded-full px-6 text-[15px] font-medium ring-1 ring-brand-ink/15 transition-colors hover:bg-brand-ink/[.04] disabled:opacity-50">{busy ? "Sending" : "Send again"}</button>
                  <a href={`${door.base}/login/${qs}`} className="press inline-flex h-12 items-center rounded-full bg-brand-ink px-6 text-[15px] font-medium text-white no-underline transition-colors hover:bg-[#232c3b]">Go to log in</a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>
    </main>
  );
}
