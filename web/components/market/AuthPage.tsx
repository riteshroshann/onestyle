"use client";
import { motion, useAnimationControls } from "motion/react";
import { useEffect, useState } from "react";
import { getStore, MarketError } from "@/lib/market";
import type { Craft, Role } from "@/lib/market";
import { PHOTOS } from "@/lib/photos";
import { homeFor } from "../site/Header";

type Mode = "login" | "signup";
const CRAFTS: Craft[] = ["Fashion designer", "Tailor", "Boutique"];
const DOOR: Record<Role, { photo: string; alt: string; words: Record<Mode, string>; base: string }> = {
  customer: { photo: PHOTOS.steps.src, alt: PHOTOS.steps.alt, words: { login: "Welcome back.", signup: "Join." }, base: "" },
  maker: { photo: PHOTOS.seamstress.src, alt: PHOTOS.seamstress.alt, words: { login: "Your studio.", signup: "Make with us." }, base: "/makers" },
};

export function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="group block">
      <span className="text-[14px] font-semibold text-foreground/60 transition-colors group-focus-within:text-foreground">{label}</span>
      <input {...input} className="mt-1 block h-12 w-full rounded-none border-0 border-b-2 border-foreground/15 bg-transparent text-[18px] font-medium outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground" />
    </label>
  );
}

export function AuthPage({ role, mode }: { role: Role; mode: Mode }) {
  const door = DOOR[role];
  const [form, setForm] = useState({ name: "", email: "", password: "", city: "", makes: "" });
  const [craft, setCraft] = useState<Craft>("Tailor");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  // "next" may only point inside this site
  const leave = (to: string) => {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && /^\/(?!\/)/.test(next) ? next : to;
  };

  // someone already signed in on this side has no business here; a customer opening the maker door may switch
  useEffect(() => { getStore().session().then((me) => { if (me?.role === role) leave(homeFor(me)); }).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const store = getStore();
      const me = mode === "login"
        ? await store.signIn(form.email, form.password, role)
        : await store.signUp({ ...form, role, ...(role === "maker" ? { craft, specialties: form.makes.split(",").map((s) => s.trim()).filter(Boolean) } : {}) });
      leave(homeFor(me));
    } catch (err) {
      setError(err instanceof MarketError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
      void shake.start({ x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.4 } });
    }
  };

  return (
    <main className="grid min-h-[100svh] md:grid-cols-2">
      <div className="sticky top-0 hidden h-[100svh] overflow-hidden bg-foreground md:block">
        <img src={door.photo} alt={door.alt} className="absolute inset-0 size-full scale-110 object-cover opacity-70 grayscale" />
        <a href="/" aria-label="Bespoke home" className="display absolute left-10 top-8 text-[34px] text-white no-underline">Bespoke</a>
        <p className="display absolute inset-x-10 bottom-10 text-[clamp(56px,7vw,120px)] text-white">{door.words[mode]}</p>
      </div>

      <div className="flex flex-col justify-center px-6 py-16 md:px-16">
        <a href="/" aria-label="Bespoke home" className="display mb-12 text-[34px] text-foreground no-underline md:hidden">Bespoke</a>
        <motion.form animate={shake} onSubmit={submit} className="mx-auto w-full max-w-sm" noValidate>
          <h1 className="display text-[48px]">{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p className="mt-2 text-[15px] font-semibold text-foreground/60">{role === "maker" ? "For designers and tailors" : "For customers"}</p>

          <div className="mt-10 space-y-6">
            {mode === "signup" && <Field label="Name" autoComplete="name" value={form.name} onChange={set("name")} required />}
            <Field label="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
            <Field label="Password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={set("password")} required minLength={8} />
            {mode === "signup" && <Field label="City" autoComplete="address-level2" value={form.city} onChange={set("city")} />}
            {mode === "signup" && role === "maker" && (
              <>
                <fieldset>
                  <legend className="text-[14px] font-semibold text-foreground/60">You are a</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CRAFTS.map((c) => (
                      <button key={c} type="button" aria-pressed={craft === c} onClick={() => setCraft(c)}
                        className="press h-11 rounded-full border-2 border-foreground/15 px-5 text-[15px] font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">{c}</button>
                    ))}
                  </div>
                </fieldset>
                <Field label="What you make" placeholder="Blouses, lehengas" value={form.makes} onChange={set("makes")} />
              </>
            )}
          </div>

          {error && <p role="alert" className="mt-6 text-[15px] font-semibold text-destructive">{error}</p>}

          <button type="submit" disabled={busy} className="press mt-8 h-14 w-full rounded-full bg-foreground text-[17px] font-semibold text-background">
            {busy ? "One moment" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold">
            <a href={`${door.base}/${mode === "login" ? "signup" : "login"}/`} className="text-foreground underline underline-offset-4">{mode === "login" ? "Create account" : "Sign in instead"}</a>
            <a href={role === "maker" ? "/login/" : "/makers/login/"} className="text-foreground/60 underline underline-offset-4 hover:text-foreground">{role === "maker" ? "I am a customer" : "I am a maker"}</a>
          </p>
        </motion.form>
      </div>
    </main>
  );
}
