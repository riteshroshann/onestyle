"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ONTO, Span, correctTranscript, hindi, tagRules, tokenize } from "../lib/engine/lexicon";
import { Measurements, PART_HI, SWATCH, advice, finished, links, nearestColour, phrase, sheetLines, shopLinks, wearerText } from "../lib/engine/describe";
import {
  AGES, BUDGETS, Question, Spec, Update, answer, answerFromText, apply, ask, asked, bind, contextOf, depthInches, emptySpec, garmentName,
  profileUpdates, wearerOf,
} from "../lib/engine/spec";
import { EXAMPLE_BRIEFS, EXAMPLE_CHANGES, meaning, verdict } from "../lib/engine/sense";
import { screen } from "../lib/assistant/guard.js";
import { allHaveLooks, groupOf, isPhoto, isTall, lookOf } from "../lib/looks";
import { isCommonWord, loadTagger, tag, toMono16k, transcribe } from "../lib/models";
import { Turn, askNext, chooseQuestion, understand } from "../lib/understand";
import { MAX_SECONDS, hasSpeech, transcribeRemote } from "../lib/voice";

const Board = dynamic(() => import("./Board"), { ssr: false });
import { SendToMaker } from "./market/SendToMaker";
import { useRequireSignIn } from "./market/SignInGate";
import { Mark } from "./site/Mark";
import { Arrow, Dots, Reveal, SOFT, SPRING } from "./site/Motion";
import { cn } from "@/lib/utils";
import { newBoardId } from "../lib/boards";
import { accountId, claimDraft, clearSession, currentDesignId, draftOwner, flushDesign, forgetDeviceCopy, latestDesign, newDesignId, parkDraft, readSession, saveDesign, setCurrentDesignId, storeDesign, takeParked, writeSession } from "../lib/designs";
import type { SavedDesign } from "../lib/designs";
import { supabase } from "../lib/supabase";

type Msg =
  | { role: "me"; text: string; tokens: string[]; spans: Span[]; skipped?: boolean }
  // `questions` is how earlier sessions stored the follow-ups; new turns carry one `question`
  | { role: "bot"; text: string; question?: Question | null; questions?: Question[]; note?: string; examples?: string[] };
type View = "talk" | "board" | "sheet" | "shop";
const VIEWS: View[] = ["talk", "board", "sheet", "shop"];
export const studioHref = (v: View, q = "") => `/studio/${v}/${q}`;

const PLACEHOLDER = "A pastel blue kurti for my farewell";
const TALK_STEPS: [string, string][] = [
  ["Describe it", "Type or speak: the garment, who it is for, the occasion, anything you already know."],
  ["Answer a few questions", "One at a time, only what is missing. Skip any you like."],
  ["Take it to a maker", "Get a tailor sheet in English or Hindi, or send it to a maker on Bespoke."],
];
const SLOT_TAG: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", "sleeve.length": "LENGTH", "sleeve.fit": "FIT",
  "bodice.fit": "FIT", "lower.fit": "FIT", "lower.silhouette": "SILHOUETTE", "garment.length": "LENGTH", fabric: "FABRIC",
  colour: "COLOUR", shade: "SHADE", pattern: "PATTERN", embellishment: "EMBELL", occasion: "OCCASION", style: "STYLE", components: "GARMENT",
};
const PROFILE_CHOICES: Record<string, [string, string][]> = {
  wearer: [["women", "a woman"], ["men", "a man"], ["anyone", "anyone"]],
  age: AGES.map((a) => [a, ({ kid: "under 13", teen: "13 to 19", "50+": "50 and over" } as Record<string, string>)[a] ?? a]),
  budget: BUDGETS.map((b) => [b, ({ "under 1000": "under ₹1,000", "1000-3000": "₹1,000 to 3,000", "3000-8000": "₹3,000 to 8,000", "8000+": "over ₹8,000" } as Record<string, string>)[b]]),
};
const ROWS: [string, string][] = [
  ["garment", "Garment"], ["wearer", "For"], ["age", "Age"], ["components", "Pieces"], ["neckline.shape", "Neckline"], ["neckline.depth", "Neck depth"], ["back.depth", "Back"],
  ["sleeve.style", "Sleeve"], ["sleeve.length", "Sleeve length"], ["bodice.fit", "Fit"], ["lower.fit", "Below the waist"],
  ["lower.silhouette", "Silhouette"], ["garment.length", "Length"], ["fabric", "Fabric"], ["colour", "Colour"], ["shade", "Shade"],
  ["pattern", "Print"], ["embellishment", "Finish"], ["occasion", "Occasion"], ["style", "Style"], ["budget", "Budget"],
];
const DRAWN: [string, string][] = [
  ["garment", "Garment"], ["neckline.shape", "Neckline"], ["neckline.depth", "Neck depth"], ["sleeve.style", "Sleeve"], ["sleeve.length", "Sleeve length"],
  ["bodice.fit", "Fit"], ["lower.silhouette", "Silhouette"], ["garment.length", "Length"], ["fabric", "Fabric"], ["pattern", "Print"], ["embellishment", "Finish"],
];
const SOURCE: Record<string, string> = { model: "your words", words: "your words", note: "a note on your board", image: "your pictures", answer: "your answer", edit: "your edit", profile: "your profile" };
const LIST_SLOTS = ["colour", "embellishment", "style", "pattern", "occasion", "shade", "components"];
const NICE: Record<string, string> = { v: "V", "deep v": "deep V", u: "U", "a-line": "A-line", trousers: "pants", crew: "crew neck", hooded: "hooded", turtle: "turtle neck", "t-shirt": "t-shirt", traditional: "classic", western: "modern" };
const nice = (v: string) => NICE[v] ?? v;
const profileLabel = (slot: string, v: string) => PROFILE_CHOICES[slot]?.find(([k]) => k === v)?.[1] ?? nice(v);
const FAMILY_TITLE: Record<string, string> = {
  top_long: "Kurtas, dresses and gowns", top_short: "Tops, shirts and blouses", knit_top: "Sweatshirts and knits", outer: "Jackets and coats",
  bottom: "Pants, skirts and bottoms", set: "Sets", drape: "Sarees and dupattas",
};
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// the open design lives for this tab only; the account keeps it across devices (lib/designs.ts)
const load = readSession;
const save = writeSession;

// ------------------------------------------------------------------ voice
// The clip is recorded with MediaRecorder and transcribed by Gemini on the server (/api/transcribe), which writes
// English, Hindi and Hinglish in Latin script. While recording, the browser's own recogniser (Chrome, Edge, Safari)
// shows live words. If the server cannot answer, the browser's words are used, then on-device Whisper.
// Nothing is sent by itself: the transcript lands in the composer to be checked first.
const micMessage = (e: any) =>
  e?.name === "NotAllowedError" ? "The microphone is blocked. Allow it from the icon in the address bar, then try again."
    : e?.name === "NotFoundError" ? "No microphone was found. Plug one in or type instead."
      : "The microphone could not start. Close other apps using it, then try again.";

type Phase = "idle" | "listening" | "transcribing" | "error";

function useVoice(onText: (t: string) => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const media = useRef<MediaRecorder | null>(null);
  const rec = useRef<any>(null);
  const heard = useRef("");
  const cancelled = useRef(false);
  const stopMeter = useRef<() => void>(() => {});
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const fail = (msg: string) => { setError(msg); setPhase("error"); setNote(""); };
  const done = (t: string) => { setPhase("idle"); setNote(""); setInterim(""); onText(t.trim()); };

  const meter = (stream: MediaStream, onEnd: () => void) => {
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const t0 = performance.now();
    let raf = 0, spoke = false, lastVoice = t0, shown = -1;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2;
      const lv = Math.min(1, Math.sqrt(s / buf.length) * 4);
      setLevel(lv);
      const now = performance.now();
      const sec = Math.floor((now - t0) / 1000);
      if (sec !== shown) { shown = sec; setSeconds(sec); }
      if (lv > 0.08) { spoke = true; lastVoice = now; }
      // stop after 2 s of quiet once speech has started, and always at the clip limit
      if ((spoke && now - lastVoice > 2000) || now - t0 > MAX_SECONDS * 1000) { onEnd(); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); void ctx.close(); };
  };

  const finish = async (blob: Blob | null) => {
    if (cancelled.current) { setPhase("idle"); setInterim(""); return; }
    setPhase("transcribing");
    const browser = heard.current.trim();
    let samples: Float32Array | null = null;
    if (blob?.size) { try { samples = await toMono16k(blob); } catch { samples = null; } }
    if (samples && !hasSpeech(samples) && !browser) { fail("Nothing was heard. Check the microphone is not muted, then try again."); return; }
    if (samples) {
      const r = await transcribeRemote(samples, lang === "hi-IN" ? "hi" : "en");
      if ("text" in r && r.text) { done(r.text); return; }
      if ("text" in r && !browser) { fail("We could not make out any words. Speak a little closer and try again."); return; }
    }
    if (browser) { done(browser); return; }
    if (samples) {
      setNote("Writing it down on this device. The first time takes a moment.");
      try {
        const t = await transcribe(samples, lang);
        if (t && !/^\[.*\]$/.test(t)) { done(t); return; }
      } catch { /* the model did not load; the message below says what to do */ }
    }
    fail("We could not make out the words. Try again, or type it instead.");
  };

  const start = async () => {
    if (phase === "listening" || phase === "transcribing") return;
    setError(""); setNote(""); setInterim(""); setSeconds(0); setLevel(0);
    heard.current = ""; cancelled.current = false;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { fail(micMessage(e)); return; }
    const chunks: Blob[] = [];
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(stream); } catch { stream.getTracks().forEach((t) => t.stop()); fail("This browser cannot record audio. Type your brief instead."); return; }
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stopMeter.current(); stream.getTracks().forEach((t) => t.stop());
      try { rec.current?.stop(); } catch { /* already stopped */ }
      rec.current = null; setLevel(0);
      void finish(chunks.length ? new Blob(chunks, { type: mr.mimeType }) : null);
    };
    media.current = mr;
    mr.start(250);
    // live words while speaking, where the browser has a recogniser; Brave ships the API but blocks the service
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR && !(navigator as any).brave) {
      try {
        const r = new SR();
        r.lang = lang; r.interimResults = true; r.continuous = true;
        r.onresult = (e: any) => {
          let text = "";
          for (const res of e.results) text += res[0].transcript;
          heard.current = text;
          setInterim(text.trim());
        };
        r.onerror = () => { /* the recorded clip is the source of truth; live words are a preview */ };
        r.start();
        rec.current = r;
      } catch { rec.current = null; }
    }
    setPhase("listening");
    stopMeter.current = meter(stream, () => { if (mr.state === "recording") mr.stop(); });
  };

  const stop = () => { if (media.current?.state === "recording") media.current.stop(); };
  const cancel = () => { cancelled.current = true; stop(); };
  const dismiss = () => { setPhase("idle"); setError(""); };
  return { supported, phase, error, note, interim, level, seconds, lang, setLang, start, stop, cancel, dismiss };
}
type Voice = ReturnType<typeof useVoice>;

const Mic = () => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
const StopIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" /></svg>);
const EXAMPLES = [PLACEHOLDER, "Ek maroon lehenga, gota patti ke saath", "A linen shirt with a mandarin collar", "A black blouse with a deep back"];

/** Speech language, as a two-way switch whose ink slides between the sides. */
function LangSwitch({ voice }: { voice: Voice }) {
  const id = useId();
  return (
    <div role="group" aria-label="Speech language" className="relative flex h-9 items-center rounded-full bg-brand-ink/[.05] p-1 text-[13px] font-medium">
      {([["en-IN", "EN", "English"], ["hi-IN", "हिं", "Hindi or Hinglish"]] as const).map(([code, short, name]) => (
        <button key={code} type="button" aria-pressed={voice.lang === code} aria-label={`Speak in ${name}`} onClick={() => voice.setLang(code)}
          disabled={voice.phase === "listening" || voice.phase === "transcribing"}
          className={cn("relative h-7 rounded-full px-3 transition-colors disabled:opacity-50", voice.lang === code ? "text-white" : "text-brand-ink/60 hover:text-brand-ink")}>
          {voice.lang === code && <motion.span layoutId={id} transition={SPRING} className="absolute inset-0 rounded-full bg-brand-ink" />}
          <span className="relative">{short}</span>
        </button>
      ))}
    </div>
  );
}

/** Five bars that follow the voice, so it is plain the microphone hears you. */
function Level({ level }: { level: number }) {
  return (
    <span aria-hidden className="flex h-5 items-center gap-[3px]">
      {[0.55, 0.85, 1, 0.8, 0.5].map((k, i) => (
        <motion.span key={i} className="w-[3px] rounded-full bg-[#b5121b]" animate={{ height: 4 + Math.min(1, level * k * 1.6) * 16 }} transition={{ type: "spring", stiffness: 500, damping: 28 }} />
      ))}
    </span>
  );
}

const clock = (s: number) => `0:${String(Math.min(s, 59)).padStart(2, "0")}`;

/** What the microphone is doing, in one line, with the fix when something went wrong. */
function VoiceLine({ voice, hint }: { voice: Voice; hint: string }) {
  if (voice.phase === "listening") return (
    <span className="flex min-w-0 items-center gap-3 text-[14px] text-brand-ink/60">
      <Level level={voice.level} />
      <span className="tabular-nums">{clock(voice.seconds)}</span>
      <span className="hidden truncate sm:inline">Listening. Pause when you are done.</span>
      <button type="button" onClick={voice.cancel} className="press rounded-full px-2 py-1 font-medium text-brand-ink/70 transition-colors hover:bg-brand-ink/[.06] hover:text-brand-ink">Cancel</button>
    </span>
  );
  if (voice.phase === "transcribing") return (
    <span className="flex min-w-0 items-center gap-3 text-[14px] text-brand-ink/60"><Dots /><span className="truncate">{voice.note || "Writing down what you said"}</span></span>
  );
  if (voice.phase === "error") return (
    <span className="flex min-w-0 items-center gap-2 text-[14px] text-[#b5121b]">
      <span className="min-w-0">{voice.error}</span>
      <button type="button" onClick={() => void voice.start()} className="press shrink-0 rounded-full px-2 py-1 font-medium underline decoration-[#b5121b]/30 underline-offset-4 hover:decoration-[#b5121b]">Try again</button>
    </span>
  );
  return <span className="truncate text-[14px] text-brand-ink/50">{hint}</span>;
}

/** The brief: grows with the words and can be spoken instead of typed. The text lives in the App so voice can fill it. */
function Composer({ value, setValue, onSend, voice, big, busy, heard, placeholder }: {
  value: string; setValue: (t: string) => void; onSend: (t: string) => void; voice: Voice; big?: boolean; busy?: boolean; heard?: boolean; placeholder?: string;
}) {
  const still = !!useReducedMotion();
  const [focus, setFocus] = useState(false);
  const [tip, setTip] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const live = voice.phase === "listening" || voice.phase === "transcribing";
  const shown = live ? voice.interim : value;
  const ready = value.trim().length > 0 && !busy && !live;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, big ? 180 : 120)}px`;
  }, [shown, big]);
  // a fresh transcript is put in front of the customer to check
  useEffect(() => { if (heard) area.current?.focus(); }, [heard]);
  // the placeholder walks through a few briefs while the field is empty
  useEffect(() => {
    if (shown || still || placeholder) return;
    const t = setInterval(() => setTip((i) => (i + 1) % EXAMPLES.length), 3400);
    return () => clearInterval(t);
  }, [shown, still, placeholder]);

  const send = () => { const t = value.trim(); if (t && ready) { onSend(t); setValue(""); } };
  const hint = heard ? "Check the words, then send." : value ? "Enter to send, Shift and Enter for a new line" : "";
  const mic = voice.supported && (
    <motion.button type="button" whileTap={{ scale: 0.9 }} transition={SPRING} disabled={voice.phase === "transcribing" || busy}
      onClick={() => (voice.phase === "listening" ? voice.stop() : void voice.start())}
      aria-label={voice.phase === "listening" ? "Stop and write it down" : "Speak instead"} aria-pressed={voice.phase === "listening"}
      className={cn("relative grid size-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40",
        voice.phase === "listening" ? "bg-[#b5121b] text-white" : "text-brand-ink/70 hover:bg-brand-ink/[.06] hover:text-brand-ink")}>
      {voice.phase === "listening" && <motion.span aria-hidden className="absolute inset-0 rounded-full bg-[#b5121b]/25" animate={{ scale: 1 + voice.level * 0.9 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />}
      <span className="relative">{voice.phase === "listening" ? <StopIcon /> : <Mic />}</span>
    </motion.button>
  );
  const submit = (
    <motion.button type="submit" disabled={!ready} aria-label="Send"
      animate={{ scale: ready ? 1 : 0.86, opacity: ready ? 1 : 0.3 }} whileTap={{ scale: 0.9 }} transition={SPRING}
      className={cn("grid shrink-0 place-items-center rounded-full bg-brand-ink text-white transition-colors hover:bg-[#232c3b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#38bdf8]/50", big ? "size-12" : "size-11")}>
      <Arrow />
    </motion.button>
  );
  const ph = live ? (voice.phase === "listening" ? "Listening" : "") : placeholder;

  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }}>
      <motion.div animate={{ boxShadow: focus ? "0 18px 50px -20px rgba(13,17,23,.30)" : "0 8px 30px -22px rgba(13,17,23,.25)" }} transition={{ duration: 0.3 }}
        className={cn("bg-white ring-1 transition-[--tw-ring-color] duration-200",
          voice.phase === "listening" ? "ring-[#b5121b]/40" : focus ? "ring-brand-ink/25" : "ring-brand-ink/10 hover:ring-brand-ink/20",
          big ? "rounded-[32px] p-3 pl-7" : "rounded-[28px] p-1.5 pl-6")}>
        <div className={cn(!big && "flex items-end gap-2")}>
          <div className="relative min-w-0 flex-1">
            <textarea ref={area} id={big ? "brief" : undefined} rows={1} value={shown} readOnly={live} maxLength={600}
              onChange={(e) => setValue(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} autoFocus={big}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              aria-label="Describe the garment"
              className={cn("block w-full resize-none bg-transparent leading-[1.35] tracking-[-0.01em] text-brand-ink outline-none",
                live && "text-brand-ink/60", big ? "min-h-[64px] py-3 text-[clamp(19px,1.7vw,24px)]" : "min-h-11 py-[11px] text-[17px]")} />
            {!shown && (
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={ph ?? tip} aria-hidden initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.35 }}
                  className={cn("pointer-events-none absolute inset-x-0 truncate text-brand-ink/35", big ? "top-3 text-[clamp(19px,1.7vw,24px)]" : "top-[11px] text-[17px]")}>
                  {ph ?? EXAMPLES[tip]}
                </motion.span>
              </AnimatePresence>
            )}
          </div>
          {!big && <div className="flex shrink-0 items-center gap-1.5">{mic}{submit}</div>}
        </div>
        {big && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div role="status" aria-live="polite" className="order-last flex min-h-6 min-w-0 basis-full items-center sm:order-none sm:basis-0 sm:flex-1"><VoiceLine voice={voice} hint={hint} /></div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">{voice.supported && <LangSwitch voice={voice} />}{mic}{submit}</div>
          </div>
        )}
      </motion.div>
      {!big && (voice.phase !== "idle" || heard) && (
        <div role="status" aria-live="polite" className="mt-2 flex items-center pl-6"><VoiceLine voice={voice} hint={hint} /></div>
      )}
    </form>
  );
}

/** Your message, with every word the studio understood stitched underneath. */
function Said({ m }: { m: Extract<Msg, { role: "me" }> }) {
  // map each understood span back onto the original text, so the message reads exactly as it was written
  const low = m.text.toLowerCase();
  const marks: [number, number, string][] = [];
  let cursor = 0;
  for (const s of m.spans) {
    const first = m.tokens[s.start], last = m.tokens[s.end - 1];
    const a = low.indexOf(first, cursor);
    if (a < 0) continue;
    const b = low.indexOf(last, a);
    if (b < 0) continue;
    marks.push([a, b + last.length, s.value]);
    cursor = b + last.length;
  }
  const parts: React.ReactNode[] = [];
  let i = 0;
  marks.forEach(([a, b, v], k) => {
    if (a > i) parts.push(m.text.slice(i, a));
    parts.push(
      <motion.span key={k} title={v ? `Understood as ${v}` : "Noted"} className="cursor-help underline decoration-dashed decoration-2 underline-offset-[6px]"
        initial={{ textDecorationColor: "rgba(56,189,248,0)" }} animate={{ textDecorationColor: "rgba(56,189,248,1)" }} transition={{ duration: 0.5, delay: 0.25 + k * 0.08 }}>
        {m.text.slice(a, b)}
      </motion.span>,
    );
    i = b;
  });
  parts.push(m.text.slice(i));
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} style={{ transformOrigin: "bottom right" }}
      className={cn("ml-auto max-w-[min(560px,88%)] rounded-[26px] rounded-br-[8px] px-6 py-4 text-[18px] leading-[1.5]",
        m.skipped ? "bg-brand-ink/[.05] text-brand-ink/55" : "bg-brand-ink text-white")}>
      {parts}
    </motion.div>
  );
}

const pill = "press inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium ring-1 ring-brand-ink/12 transition-[background-color,box-shadow,transform] duration-200 hover:bg-brand-ink/[.04] hover:ring-brand-ink/25 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]";

// ------------------------------------------------------------------ picker sheet
function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** An exact shade, chosen with three sliders instead of the system colour dialog. */
function ShadeMaker({ onUse }: { onUse: (hex: string) => void }) {
  const [h, setH] = useState(225), [sat, setSat] = useState(40), [l, setL] = useState(22);
  const hex = hslHex(h, sat, l);
  return (
    <div className="custom">
      <div className="shade-head">
        <span className="shade-preview" style={{ background: hex }} />
        <div><b>An exact shade</b><small>Closest named colour: {nearestColour(hex)}. The exact shade goes to your tailor.</small></div>
      </div>
      <label>Colour<input type="range" className="slider" min={0} max={360} value={h} onChange={(e) => setH(+e.target.value)}
        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }} /></label>
      <label>Intensity<input type="range" className="slider" min={0} max={100} value={sat} onChange={(e) => setSat(+e.target.value)}
        style={{ background: `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))` }} /></label>
      <label>Lightness<input type="range" className="slider" min={4} max={96} value={l} onChange={(e) => setL(+e.target.value)}
        style={{ background: `linear-gradient(to right, #000, hsl(${h} ${sat}% 50%), #fff)` }} /></label>
      <button className="btn" onClick={() => onUse(hex)}>Use this shade</button>
    </div>
  );
}
/** A choice shown as a picture with its name underneath. */
function Look({ slot, value, ctx, label, pressed, onClick }: {
  slot: string; value: string; ctx?: string | null; label: string; pressed?: boolean; onClick: () => void;
}) {
  const src = lookOf(slot, value, ctx);
  return (
    <button className={`look${isPhoto(slot) ? " photo" : ""}${isTall(slot) ? " tall" : ""}`} aria-pressed={pressed} onClick={onClick}>
      <span className="pic">{src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}</span>
      <span className="name">{label}</span>
    </button>
  );
}

function Picker({ slot, label, current, ctx, onPick, onClose }: {
  slot: string; label: string; current: string[]; ctx?: string | null; onPick: (value: string, note?: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const tagName = SLOT_TAG[slot];
  let body: React.ReactNode;
  if (PROFILE_CHOICES[slot]) {
    body = <div className="choices">{PROFILE_CHOICES[slot].map(([v, l]) => <button key={v} className="choice" aria-pressed={current.includes(v)} onClick={() => onPick(v)}>{l}</button>)}</div>;
  } else if (slot === "colour") {
    body = (
      <>
        <div className="palette">
          {Object.entries(SWATCH).map(([name, hex]) => (
            <button key={name} className="swatch" aria-pressed={current.includes(name)} onClick={() => onPick(name)} title={name}>
              <span style={{ background: hex }} />{name}
            </button>
          ))}
        </div>
        <ShadeMaker onUse={(hex) => onPick(nearestColour(hex), `exact colour ${hex}`)} />
      </>
    );
  } else if (tagName === "GARMENT") {
    const term = q.trim().toLowerCase();
    body = (
      <>
        <input className="search" placeholder="Search garments" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {Object.entries<string[]>(ONTO.garment_family).map(([fam, list]) => {
          const shown = list.filter((g) => !term || nice(g).includes(term) || (ONTO.lexicon.GARMENT[g]?.forms ?? []).some((f: string) => f.includes(term)));
          if (!shown.length) return null;
          return (
            <div key={fam}>
              <h4>{FAMILY_TITLE[fam] ?? fam}</h4>
              {allHaveLooks("garment", shown)
                ? <div className="looks">{shown.map((g) => <Look key={g} slot="garment" value={g} label={nice(g)} pressed={current.includes(g)} onClick={() => onPick(g)} />)}</div>
                : <div className="choices">{shown.map((g) => <button key={g} className="choice" aria-pressed={current.includes(g)} onClick={() => onPick(g)}>{nice(g)}</button>)}</div>}
            </div>
          );
        })}
      </>
    );
  } else {
    const values: string[] = slot === "neckline.depth" || slot === "back.depth" ? ONTO.depth_order
      : slot === "sleeve.length" ? ONTO.sleeve_length_order : slot === "garment.length" ? ONTO.length_order : Object.keys(ONTO.lexicon[tagName] ?? {});
    const own = ctx ? Object.keys(groupOf(slot, ctx)) : [];
    const first = own.length ? values.filter((v) => own.includes(v)) : values;
    const more = own.length ? values.filter((v) => !own.includes(v)) : [];
    const tiles = (vs: string[]) => <div className="looks">{vs.map((v) => <Look key={v} slot={slot} value={v} ctx={ctx} label={nice(v)} pressed={current.includes(v)} onClick={() => onPick(v)} />)}</div>;
    body = allHaveLooks(slot, values, ctx)
      ? <>{tiles(first)}{more.length > 0 && <><h4>More</h4>{tiles(more)}</>}</>
      : <div className="choices">{values.map((v) => <button key={v} className="choice" aria-pressed={current.includes(v)} onClick={() => onPick(v)}>{nice(v)}</button>)}</div>;
  }
  return createPortal(
    <div className="scrim" onClick={onClose}>
      <div className="sheetpop" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <header><h3>{label}</h3><button className="done" onClick={onClose}>Done</button></header>
        {body}
      </div>
    </div>,
    document.body,
  );
}

function Order({ spec, onEdit }: { spec: Spec; onEdit: (slot: string, value: string, note?: string) => void }) {
  const [editing, setEditing] = useState<[string, string] | null>(null);
  const rows = ROWS.filter(([slot]) => spec.slots[slot] || spec.lists[slot]?.length || spec.excluded.some((e) => e.slot === slot));
  const title = spec.slots.garment ? cap(nice(garmentName(spec))) : "Your design";
  return (
    <aside className="order" aria-label="Your design">
      <AnimatePresence mode="wait" initial={false}><motion.h2 key={title} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>{title}</motion.h2></AnimatePresence>
      <div className="meta">{rows.length ? `Draft ${spec.version}. Select any detail to change it.` : ""}</div>
      {!rows.length && <div className="empty">Each detail you mention settles here, part by part, with where it came from.</div>}
      {rows.length > 0 && (
        <dl>
          {rows.map(([slot, label]) => {
            const v = spec.slots[slot];
            const list = spec.lists[slot] ?? [];
            const ex = spec.excluded.filter((e) => e.slot === slot);
            const editable = !!SLOT_TAG[slot] || slot.endsWith(".depth") || !!PROFILE_CHOICES[slot];
            const open = () => editable && setEditing([slot, label]);
            const text = !v ? "" : slot === "garment" ? nice(garmentName(spec))
              : slot === "wearer" ? (wearerText({ ...spec, slots: { wearer: v } })?.en ?? v.value)
                : PROFILE_CHOICES[slot] ? profileLabel(slot, v.value)
                  : slot.endsWith(".depth") && depthInches(v) ? `${depthInches(v)} in`
                    : `${v.intensity === "slight" ? "slightly " : v.intensity === "strong" ? "very " : ""}${nice(v.value)}`;
            return (
              <motion.div layout="position" className="item" key={`${slot}:${v?.value ?? ""}:${list.map((x) => x.value).join()}`}
                initial={{ backgroundColor: "rgba(56,189,248,.18)" }} animate={{ backgroundColor: "rgba(56,189,248,0)" }} transition={{ duration: 1.4, ease: "easeOut" }}>
                <dt>{label}</dt>
                <dd>
                  {v && <button onClick={open}>{lookOf(slot, v.value, contextOf(slot, spec)) && <img className={`thumb${isPhoto(slot) ? " photo" : ""}`} src={lookOf(slot, v.value, contextOf(slot, spec))} alt="" />}{text}{editable && <span className="chev">›</span>}</button>}
                  {list.length > 0 && <button onClick={open}>{slot === "colour" && list.map((x) => <span key={x.value} className="dot" style={{ background: SWATCH[x.value] ?? "#ccc" }} />)}{list.map((x) => nice(x.value)).join(", ")}{editable && <span className="chev">›</span>}</button>}
                  {ex.map((x) => <span key={x.value} className="no" title={x.evidence}>{nice(x.value)}</span>)}
                  {(v || list.length > 0) && <small>from {[...new Set([v, ...list].filter(Boolean).map((x) => SOURCE[x!.src] ?? x!.src))].join(" and ")}</small>}
                </dd>
              </motion.div>
            );
          })}
          {(spec.notes?.length ?? 0) > 0 && <div className="item"><dt>Notes</dt><dd>{spec.notes!.join("; ")}<small>for your tailor</small></dd></div>}
          {spec.comparisons.length > 0 && <div className="item"><dt>Compared</dt><dd>{spec.comparisons.map((c) => `${c.slot.split(".")[0]} ${c.cmp === "more" ? "beyond" : c.cmp === "less" ? "within" : "like"} ${c.ref}`).join("; ")}<small>set it on the moodboard</small></dd></div>}
        </dl>
      )}
      {editing && (
        <Picker slot={editing[0]} label={editing[1]} ctx={contextOf(editing[0], spec)} onClose={() => setEditing(null)}
          current={[spec.slots[editing[0]]?.value, ...(spec.lists[editing[0]] ?? []).map((x) => x.value)].filter(Boolean) as string[]}
          onPick={(value, note) => { onEdit(editing[0], value, note); if (!note) setEditing(null); }} />
      )}
    </aside>
  );
}

/** A two- or three-way switch whose ink slides to the chosen side. */
function Switch<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className="relative flex h-11 items-center rounded-full bg-brand-ink/[.05] p-1 text-[14px] font-medium">
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={cn("relative h-9 rounded-full px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]", value === v ? "text-white" : "text-brand-ink/60 hover:text-brand-ink")}>
          {value === v && <motion.span layoutId={id} transition={SPRING} className="absolute inset-0 rounded-full bg-brand-ink" />}
          <span className="relative">{text}</span>
        </button>
      ))}
    </div>
  );
}

/** The opening of a studio page, in the home page's voice: one big line, one sentence on what the page is for. */
function PageHead({ title, lede }: { title: string; lede: string }) {
  return (
    <>
      <h1 className="display overflow-hidden pb-[0.08em] text-[clamp(56px,9vw,160px)] leading-[0.92]">
        <motion.span className="block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ ...SOFT, delay: 0.05 }}>{title}</motion.span>
      </h1>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.15 }}
        className="mt-8 max-w-[52ch] text-[clamp(17px,1.4vw,20px)] leading-[1.5] text-brand-ink/60">{lede}</motion.p>
    </>
  );
}

/** Shown on a page that needs a design before it has anything to say. */
function NeedsDesign({ text, onTalk }: { text: string; onTalk: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.25 }} className="mt-14 max-w-[640px]">
      <p className="text-[clamp(22px,2vw,28px)] font-medium leading-[1.3] tracking-[-0.02em]">{text}</p>
      <button type="button" onClick={onTalk} className="press mt-8 h-14 rounded-full bg-brand-ink px-9 text-[17px] font-medium text-white transition-colors hover:bg-[#232c3b] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#38bdf8]/50">
        Describe a garment
      </button>
    </motion.div>
  );
}

const MEAS: [keyof Measurements, string, string][] = [
  ["bust", "Bust", "छाती"], ["waist", "Waist", "कमर"], ["hip", "Hip", "कूल्हा"],
  ["shoulder", "Shoulder", "कंधा"], ["length", "Length", "लंबाई"], ["sleeve", "Sleeve", "आस्तीन"],
];

function SheetView({ spec, m, setM, onTalk }: { spec: Spec; m: Measurements; setM: (m: Measurements) => void; onTalk: () => void }) {
  const lines = sheetLines(spec, m);
  const f = finished(spec, m);
  const drawings = DRAWN.flatMap(([slot, part]) => {
    const v = spec.slots[slot]?.value ?? spec.lists[slot]?.[0]?.value;
    const src = v ? lookOf(slot, v, contextOf(slot, spec)) : undefined;
    return v && src ? [{ slot, part, value: v, src }] : [];
  });
  const [lang, setLang] = useState<"en" | "hi">("en");
  // what was typed, so "34." can become "34.5" before it is a number
  const [typed, setTyped] = useState<Partial<Record<keyof Measurements, string>>>({});
  const hi = lang === "hi";
  const [sending, setSending] = useState(false);
  // sending needs a customer account; the gate explains why and brings them back to this sheet
  const { requireSignIn, gate } = useRequireSignIn();
  const send = async () => {
    if (await requireSignIn("Your maker gets the design, the sheet and your measurements, and you talk it through in one thread.", { role: "customer", next: "/studio/sheet/" })) setSending(true);
  };
  const garment = spec.slots.garment
    ? (hi ? hindi("GARMENT", spec.slots.garment.value) : cap(nice(garmentName(spec))))
    : (hi ? "पोशाक" : "Garment");
  const date = new Date().toLocaleDateString(hi ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });
  const hiFont = hi ? "hi" : "";

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-32 pt-[clamp(56px,7vw,104px)] md:px-10 print:p-0">
      <div className="noprint">
        <PageHead title="Tailor sheet." lede="Everything your tailor needs, written from your design. Add your measurements, then print it or send it to a maker on Bespoke." />
      </div>
      {!lines.length ? <NeedsDesign text="Your sheet fills in as you describe the garment. Start in Talk, then come back here." onTalk={onTalk} /> : (
        <>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.25 }}
            className="noprint mt-12 flex flex-wrap items-center gap-3">
            <Switch label="Sheet language" value={lang} onChange={setLang} options={[["en", "English"], ["hi", "हिंदी"]]} />
            <span className="flex-1" />
            <button type="button" onClick={() => window.print()}
              className="press h-11 rounded-full px-5 text-[15px] font-medium ring-1 ring-brand-ink/15 transition-colors hover:bg-brand-ink/[.04] active:scale-[0.97]">Print or save as PDF</button>
            <button type="button" onClick={send}
              className="press h-11 rounded-full bg-brand-ink px-5 text-[15px] font-medium text-white transition-colors hover:bg-[#232c3b] active:scale-[0.97]">Send to a maker</button>
          </motion.div>
          {sending && <SendToMaker spec={spec} m={m} onClose={() => setSending(false)} />}
          {gate}

          <motion.article initial={{ opacity: 0, y: 24, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SOFT, delay: 0.3 }}
            className="sheet mt-6 rounded-[32px] bg-white p-7 shadow-[0_0_0_1px_rgba(13,17,23,.06),0_40px_90px_-50px_rgba(13,17,23,.35)] md:p-14 print:p-0 print:shadow-none">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={lang} initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(4px)" }} transition={{ duration: 0.25 }}>
                <h2 className={cn("display text-[clamp(40px,4.5vw,64px)] leading-none", hiFont)}>{garment}</h2>
                <p className={cn("mt-4 max-w-[70ch] text-[16px] leading-[1.55] text-brand-ink/55", hiFont)}>
                  {hi ? `ड्राफ़्ट ${spec.version}, ${date}` : `Draft ${spec.version}, ${date}. ${phrase(spec)}.`}
                </p>

                <dl className="mt-10">
                  {lines.map((l, i) => (
                    <motion.div key={l.part} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.35 + i * 0.03 }}
                      className="grid gap-1 border-t border-brand-ink/[.08] py-4 md:grid-cols-[180px_1fr_220px] md:gap-6">
                      <dt className={cn("text-[15px] font-medium text-brand-ink/50", hiFont)}>{hi ? l.hiPart : l.part}</dt>
                      <dd className={cn("text-[18px] leading-[1.45]", hiFont)}>{hi ? l.hi : l.en}</dd>
                      <dd className="text-[13px] leading-[1.5] text-brand-ink/40 md:text-right">{l.from}</dd>
                    </motion.div>
                  ))}
                </dl>

                {drawings.length > 0 && (
                  <section className="mt-12">
                    <h3 className={cn("text-[15px] font-medium text-brand-ink/50", hiFont)}>{hi ? "चित्र" : "Drawings"}</h3>
                    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-4">
                      {drawings.map((d) => (
                        <figure key={d.slot} className="group m-0">
                          <div className={cn("overflow-hidden rounded-[20px] bg-brand-ink/[.035] print:border print:border-black/10", isTall(d.slot) ? "aspect-[3/4]" : "aspect-square")}>
                            <img src={d.src} alt={`${d.part}: ${nice(d.value)}`}
                              className={cn("size-full transition-transform duration-500 group-hover:scale-[1.04]", isPhoto(d.slot) ? "object-cover" : "object-contain p-3")} />
                          </div>
                          <figcaption className={cn("mt-2 text-[14px] leading-tight", hiFont)}>
                            <span className="block text-[12px] text-brand-ink/45">{hi ? (PART_HI[d.part] ?? d.part) : d.part}</span>
                            {hi ? hindi(SLOT_TAG[d.slot] as never, d.value) : nice(d.value)}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-12">
                  <h3 className={cn("text-[15px] font-medium text-brand-ink/50", hiFont)}>{hi ? "माप, इंच में" : "Measurements, in inches"}</h3>
                  <p className="noprint mt-1 text-[14px] text-brand-ink/45">Measure over light clothing, tape snug but not tight. Ask in the corner explains each one.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {MEAS.map(([k, en, hiLabel]) => (
                      <label key={k} className="group block rounded-[18px] bg-brand-ink/[.04] px-4 pb-3 pt-2.5 ring-1 ring-transparent transition-[background-color,box-shadow] focus-within:bg-white focus-within:ring-brand-ink/20 hover:bg-brand-ink/[.06] print:bg-transparent print:ring-black/15">
                        <span className={cn("text-[12px] font-medium text-brand-ink/50", hiFont)}>{hi ? hiLabel : en}</span>
                        <span className="mt-0.5 flex items-baseline gap-1">
                          <input inputMode="decimal" value={typed[k] ?? m[k] ?? ""} placeholder="–"
                            onChange={(e) => {
                              const t = e.target.value.replace(/[^\d.]/g, "");
                              setTyped({ ...typed, [k]: t });
                              const n = parseFloat(t);
                              setM({ ...m, [k]: isNaN(n) ? undefined : n });
                            }}
                            className="w-full min-w-0 bg-transparent text-[22px] font-medium tracking-[-0.02em] outline-none placeholder:text-brand-ink/20" />
                          <span className="text-[13px] text-brand-ink/40">in</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <AnimatePresence>
                    {(f.bust || f.waist || f.hip) && (
                      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}
                        className={cn("mt-5 inline-block rounded-full bg-[#38bdf8]/12 px-4 py-2 text-[15px] font-medium text-[#0369a1]", hiFont)}>
                        {hi
                          ? `तैयार कपड़े का माप: ${[f.bust && `छाती ${f.bust} इंच`, f.waist && `कमर ${f.waist} इंच`, f.hip && `कूल्हा ${f.hip} इंच`].filter(Boolean).join(", ")}।`
                          : `Finished garment: ${[f.bust && `bust ${f.bust} in`, f.waist && `waist ${f.waist} in`, f.hip && `hip ${f.hip} in`].filter(Boolean).join(", ")}.`}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </section>
              </motion.div>
            </AnimatePresence>
          </motion.article>
        </>
      )}
    </main>
  );
}

const icon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

/** One outbound search, as a card that lifts toward the cursor. */
function Out({ href, domain, title, note, delay }: { href: string; domain: string; title: string; note: string; delay: number }) {
  return (
    <motion.a href={href} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay }}
      whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}
      className="group flex items-center gap-4 rounded-[24px] bg-white p-4 pr-5 no-underline shadow-[0_0_0_1px_rgba(13,17,23,.07)] transition-shadow duration-300 hover:shadow-[0_0_0_1px_rgba(13,17,23,.1),0_24px_50px_-28px_rgba(13,17,23,.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]">
      <img src={icon(domain)} alt="" loading="lazy" className="size-11 shrink-0 rounded-[14px] bg-brand-ink/[.04] object-contain p-2" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium text-brand-ink">{title}</span>
        <span className="block text-[13px] text-brand-ink/50">{note}</span>
      </span>
      <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-brand-ink/30 transition-[transform,color] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-ink" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
    </motion.a>
  );
}

function ShopView({ spec, onWearer, onTalk }: { spec: Spec; onWearer: (w: string) => void; onTalk: () => void }) {
  const L = links(spec);
  const who = wearerOf(spec);
  // the search is the person's to change: start from the short query and follow whatever they type
  const [q, setQ] = useState(L.shopQuery);
  useEffect(() => { setQ(L.shopQuery); }, [L.shopQuery]);
  const shops = shopLinks(spec, q.trim() || L.shopQuery);
  const section = who === "men" ? "men's" : "women's";
  const note = (filtered: boolean) => who === "anyone" ? "Opens a search on their site" : filtered ? `Opens the ${section} section` : `Searches ${section} styles`;
  const groups: { title: string; items: { href: string; domain: string; title: string; note: string }[] }[] = [
    { title: "Buy something close, ready-made", items: shops.map((p) => ({ href: p.url, domain: p.domain, title: p.label, note: note(p.filtered) })) },
    { title: "Ideas", items: L.pinterest.map((p) => ({ href: p.url, domain: "pinterest.com", title: p.label, note: "Pinterest" })) },
    { title: "The fabric", items: L.fabric.map((p) => ({ href: p.url, domain: "amazon.in", title: p.label, note: "By the metre" })) },
    { title: "Have it made", items: [{ href: L.tailors.url, domain: "maps.google.com", title: "Tailors near you", note: "Take your tailor sheet along" }] },
  ].filter((g) => g.items.length);

  return (
    <main className="mx-auto max-w-[1440px] px-5 pb-32 pt-[clamp(56px,7vw,104px)] md:px-10">
      <PageHead title="Find it." lede="Searches written from your design and who it is for. Change the words if a shop finds too little. Every link opens on the shop's own site." />
      {!spec.slots.garment ? <NeedsDesign text="Describe the garment first, and the searches here write themselves." onTalk={onTalk} /> : (
        <>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.22 }}
            className="mt-12 flex flex-wrap items-end gap-x-6 gap-y-5">
            <label className="min-w-[260px] flex-1">
              <span className="text-[14px] font-medium text-brand-ink/45">Search shops for</span>
              <span className="mt-2 flex items-center rounded-full bg-white pl-6 pr-2 ring-1 ring-brand-ink/12 transition-[box-shadow] focus-within:shadow-[0_12px_32px_-18px_rgba(13,17,23,.35)] focus-within:ring-brand-ink/30 hover:ring-brand-ink/25">
                <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} aria-label="Search shops for"
                  className="h-14 min-w-0 flex-1 bg-transparent text-[clamp(18px,1.6vw,22px)] font-medium tracking-[-0.01em] text-brand-ink outline-none" />
                {q !== L.shopQuery && (
                  <button type="button" onClick={() => setQ(L.shopQuery)} className="press h-10 shrink-0 rounded-full px-4 text-[14px] font-medium text-brand-ink/60 transition-colors hover:bg-brand-ink/[.05] hover:text-brand-ink">Reset</button>
                )}
              </span>
            </label>
            <Switch label="Shopping for" value={who} onChange={onWearer} options={[["women", "Women"], ["men", "Men"], ["anyone", "Anyone"]]} />
          </motion.div>
          {groups.map((g, gi) => (
            <section key={g.title} className="mt-14">
              <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + gi * 0.08 }}
                className="text-[clamp(22px,2vw,28px)] font-medium tracking-[-0.02em]">{g.title}</motion.h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((it, i) => <Out key={it.href} {...it} delay={0.34 + gi * 0.08 + i * 0.04} />)}
              </div>
            </section>
          ))}
        </>
      )}
    </main>
  );
}

/** Idea searches and shops for a design, for the board's brief. */
function boardLooks(spec: Spec) {
  if (!spec.slots.garment) return undefined;
  const L = links(spec);
  return { ideas: L.pinterest.slice(0, 2).map((p) => ({ label: `Pinterest: ${p.label}`, url: p.url })), shops: L.shops.slice(0, 3).map((x) => ({ label: x.label, url: x.url })) };
}

function Finale({ spec, onSheet, onShop, backBtn }: { spec: Spec; onSheet: () => void; onShop: () => void; backBtn: React.ReactNode }) {
  const L = links(spec);
  return (
    <div className="finale">
      <div className="q">Your design is ready. Opening your moodboard, where we build the direction together.</div>
      <div className="cards">
        {L.shops.slice(0, 4).map((p) => (
          <a className="card" key={p.label} href={p.url} target="_blank" rel="noreferrer">
            <img src={icon(p.domain)} alt="" loading="lazy" /><div><b>{p.label}</b><span>Shop similar</span></div>
          </a>
        ))}
        {L.pinterest.slice(0, 2).map((p) => (
          <a className="card" key={p.url} href={p.url} target="_blank" rel="noreferrer">
            <img src={icon("pinterest.com")} alt="" loading="lazy" /><div><b>{p.label}</b><span>Ideas on Pinterest</span></div>
          </a>
        ))}
      </div>
      <div className="next">
        {backBtn}
        <button className="primary" onClick={onSheet}>Open the tailor sheet</button>
        <button onClick={onShop}>All ideas and shopping</button>
      </div>
    </div>
  );
}

/** One follow-up: the question, its options as pictures or pills, and a way to skip or answer in your own words. */
function Ask({ q, spec, live, still, onPick, onSkip }: { q: Question; spec: Spec; live: boolean; still: boolean; onPick: (v: string) => void; onSkip: () => void }) {
  const ctx = contextOf(q.slot, spec);
  const label = (o: string) => q.labels?.[o] ?? (PROFILE_CHOICES[q.slot] ? profileLabel(q.slot, o) : nice(o));
  return (
    <div className="mt-7">
      <p className="mb-4 text-[17px] font-medium tracking-[-0.01em] text-brand-ink/80">{q.text}</p>
      {live && allHaveLooks(q.slot, q.options, ctx)
        ? <div className="looks inline">{q.options.map((o) => <Look key={o} slot={q.slot} value={o} ctx={ctx} label={label(o)} onClick={() => onPick(o)} />)}</div>
        : (
          <div className="flex flex-wrap gap-2">
            {q.options.map((o, k) => (
              <motion.button key={o} type="button" onClick={() => onPick(o)} whileTap={{ scale: 0.94 }} disabled={!live}
                initial={live && !still ? { opacity: 0, y: 8, scale: 0.96 } : false} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...SPRING, delay: 0.3 + k * 0.035 }}
                className="h-11 rounded-full bg-brand-ink/[.05] px-5 text-[15px] font-medium transition-colors duration-200 hover:bg-brand-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] disabled:pointer-events-none">
                {label(o)}
              </motion.button>
            ))}
          </div>
        )}
      {live && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-brand-ink/50">
          <button type="button" onClick={onSkip}
            className="press h-9 rounded-full px-4 font-medium text-brand-ink/70 ring-1 ring-brand-ink/12 transition-colors hover:bg-brand-ink/[.04] hover:text-brand-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]">Skip</button>
          <span>or type your own answer below</span>
        </motion.p>
      )}
    </div>
  );
}

/** The conversation so far, as turns a model can read. */
function turnsOf(msgs: Msg[]): Turn[] {
  return msgs.map((m): Turn => m.role === "me"
    ? { role: "user", content: m.skipped ? "(skipped the question)" : m.text }
    : { role: "assistant", content: [m.text, (m.question ?? m.questions?.[0])?.text].filter(Boolean).join(" ") });
}
const pendingOf = (msgs: Msg[]): Question | null => {
  const last = msgs[msgs.length - 1];
  return last?.role === "bot" ? (last.question ?? last.questions?.[0] ?? null) : null;
};
const viewOf = (path: string): View | null => {
  const v = path.split("/").filter(Boolean)[1];
  return VIEWS.includes(v as View) ? (v as View) : null;
};

// ------------------------------------------------------------------ app
export default function App() {
  const router = useRouter();
  const path = usePathname() ?? "/studio/";
  const view: View = viewOf(path) ?? "talk";
  const [spec, setSpec] = useState<Spec>(() => load("bespoke.spec", emptySpec()));
  const [msgs, setMsgs] = useState<Msg[]>(() => load("bespoke.msgs", []));
  const [designId, setDesignId] = useState(currentDesignId);
  const fresh = useRef(new URLSearchParams(location.search).has("new")).current;
  // the page waits until we know who is here: a signed-in person opening a blank tab gets their latest design back,
  // and a draft saved under an account is not shown before that account is confirmed
  const [resuming, setResuming] = useState(() => !!supabase() && (!!draftOwner() || (!readSession<Msg[]>("bespoke.msgs", []).length && !fresh)));
  const [boardId, setBoardId] = useState(newBoardId);
  const go = useCallback((v: View) => { if (v !== view) router.push(studioHref(v)); }, [router, view]);
  // the board opens blank from anywhere in the studio; earlier boards are one click away in its history
  const openBoard = () => { setBoardId(newBoardId()); go("board"); };
  const [m, setM] = useState<Measurements>(() => load("bespoke.meas", {}));
  const [thinking, setThinking] = useState(false);
  // when the last question is answered, the design moves on to the board, its main space; once per design
  const finished = view === "talk" && !thinking && msgs.length > 0 && !!spec.slots.garment && ask(spec).length === 0;
  const handedOver = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || handedOver.current === designId) return;
    handedOver.current = designId;
    const t = setTimeout(openBoard, 1800);
    return () => clearTimeout(t);
  }, [finished, designId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // every step can be taken back: the design and the conversation as they were before it
  const [past, setPast] = useState<{ spec: Spec; msgs: Msg[] }[]>(() => load("bespoke.past", []));
  const now = useRef({ spec, msgs });
  now.current = { spec, msgs };
  const remember = useCallback(() => setPast((p) => [...p.slice(-29), now.current]), []);
  const back = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setSpec(prev.spec); setMsgs(prev.msgs); setPast(past.slice(0, -1));
    if (!prev.msgs.length) go("talk");
  };
  useEffect(() => { save("bespoke.past", past); }, [past]);

  useEffect(() => { loadTagger(() => {}); }, []);
  useEffect(() => {
    save("bespoke.spec", spec); save("bespoke.msgs", msgs); save("bespoke.meas", m);
    if (resuming) return;
    saveDesign(designId, { spec, msgs, meas: m }, phrase(spec));
    parkDraft(designId, { spec, msgs, meas: m });
  }, [spec, msgs, m, designId, resuming]);
  useEffect(() => {
    forgetDeviceCopy();
    if (!viewOf(location.pathname)) return;   // on the way to /studio/talk/, where this runs again
    let live = true;
    const show = (d: SavedDesign) => {
      setSpec(d.spec as Spec); setMsgs(d.msgs as Msg[]); setM(d.meas as Measurements); setPast([]);
      setDesignId(d.id); setCurrentDesignId(d.id);
    };
    (async () => {
      const uid = await accountId();
      if (!live) return;
      // a draft left by an account that has since signed out is not this person's to see
      const theirs = !draftOwner() || draftOwner() === uid;
      if (!theirs) { clearSession(); show({ id: newDesignId(), spec: emptySpec(), msgs: [], meas: {} }); }
      claimDraft(uid);
      const blank = !theirs || !now.current.msgs.length;
      // a design begun before signing in joins the account; it opens here unless this tab already holds another
      const parked = takeParked(uid);
      if (parked && blank && !fresh) show(parked);
      else {
        if (parked && parked.id !== currentDesignId()) await storeDesign(parked.id, parked, phrase(parked.spec as Spec)).catch(() => {});
        const last = uid && blank && !fresh ? await latestDesign().catch(() => null) : null;
        if (last && live) show(last);
      }
      if (live) setResuming(false);
    })();
    const hidden = () => { if (document.visibilityState === "hidden") flushDesign(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { live = false; document.removeEventListener("visibilitychange", hidden); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, thinking]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  /** The studio's turn: read the design back, then one question, chosen by the model when it can, else the engine. */
  const reply = useCallback(async (next: Spec, ups: Update[], history: Turn[], note?: string) => {
    const open = ask(next);
    const proposal = open.length ? await askNext(history, next, open, 4500) : null;
    const question = chooseQuestion(open, proposal, next);
    const who = wearerText(next);
    const got = ups.filter((u) => u.op !== "compare" && u.op !== "asked").length;
    // who it is for is read back on the turn it was learned; after that it sits in the design panel
    const learned = ups.some((u) => u.slot === "wearer" || u.slot === "age");
    const text = next.slots.garment ? `${cap(phrase(next))}${who && learned ? `, for ${who.en}` : ""}.`
      : who ? `Got it, for ${who.en}. What should we make?`
        : got ? "Noted. What should we make?" : "Tell me a little more. What should we make, and for which occasion?";
    setMsgs((x) => [...x, { role: "bot", text, question, note: note ?? (advice(next) || undefined) }]);
  }, []);

  const send = useCallback(async (text: string) => {
    remember();
    setThinking(true);
    setHeard(false);
    const pending = pendingOf(msgs);
    const meMsg = (tokens: string[], spans: Span[]): Msg => ({ role: "me", text, tokens, spans });
    // guardrails first: injection, unsafe or off-limits text is answered here and never reaches a model
    const guard = screen(text, []);
    if (!guard.ok) {
      const reply = guard.reason === "self_harm" ? guard.reply : "I can only help design clothes here. Tell me what you would like made, for example:";
      setMsgs((x) => [...x, meMsg([text], []), { role: "bot", text: reply, examples: guard.reason === "self_harm" ? undefined : EXAMPLE_BRIEFS, question: pending }]);
      setThinking(false);
      return;
    }
    // the language model (when configured) and the on-device engine run together; the device answers alone if the model cannot
    const second = understand(text, spec);
    const corrected = correctTranscript(text, isCommonWord);
    let tokens: string[], spans: Span[];
    try { ({ tokens, spans } = await tag(corrected)); }
    catch { tokens = tokenize(corrected); spans = tagRules(tokens); }
    const rules = tagRules(tokens);
    // a typed answer to the open question: an option's own label, or a profile detail the tagger cannot read
    const label = pending?.options.find((o) => [o, pending.labels?.[o] ?? "", nice(o)].some((l) => l && l.toLowerCase() === text.trim().toLowerCase()));
    const direct = pending ? (label ? answer(pending.slot, label) : answerFromText(pending.slot, text)) : [];
    const profile = [...profileUpdates(text), ...direct];
    const local = meaning(tokens, rules, spans, profile);
    const ups = [...bind(tokens, spans, "words"), ...profile];
    setMsgs((x) => [...x, meMsg(tokens, spans)]);
    const model = await second;
    if (verdict(local, model) === "rubbish") {
      const started = !!spec.slots.garment;
      setMsgs((x) => [...x, {
        role: "bot", question: pending,
        text: started ? "I did not catch a change to your design. You could say something like:" : "I did not catch a garment in that. Try describing what you would like made, for example:",
        examples: started ? EXAMPLE_CHANGES : EXAMPLE_BRIEFS,
      }]);
      setThinking(false);
      return;
    }
    // an age is never a length, whichever reader thought so
    const fromModel = (model?.updates ?? []).filter((u) => !(u.slot.endsWith("length") && /year|old|saal|age|umr/i.test(u.value?.evidence ?? "")));
    const all = [...ups, ...fromModel, ...(pending ? [asked(pending.slot)] : [])];
    const next = apply(spec, all);
    setSpec(next);
    await reply(next, all, turnsOf([...msgs, meMsg(tokens, spans)]));
    setThinking(false);
  }, [spec, msgs, reply, remember]);

  const voice = useVoice(useCallback((t: string) => { setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t)); setHeard(true); }, []));
  const typeDraft = (t: string) => { setDraft(t); if (heard) setHeard(false); };

  const step = async (ups: Update[], me: Msg) => {
    remember();
    setThinking(true);
    const next = apply(spec, ups);
    setSpec(next);
    setMsgs((x) => [...x, me]);
    await reply(next, ups, turnsOf([...msgs, me]));
    setThinking(false);
  };
  const pick = (q: Question, v: string) => {
    const label = q.labels?.[v] ?? (PROFILE_CHOICES[q.slot] ? profileLabel(q.slot, v) : nice(v));
    void step([...answer(q.slot, v), asked(q.slot)], { role: "me", text: label, tokens: [label], spans: [] });
  };
  const skip = (q: Question) => void step([asked(q.slot)], { role: "me", text: "Skip", tokens: ["skip"], spans: [], skipped: true });
  const edit = (slot: string, value: string, note?: string) => {
    const ups: Update[] = [{ op: LIST_SLOTS.includes(slot) ? "replace" : "set", slot, value: { value, p: 1, src: "edit", evidence: "edited" } }];
    if (note) ups.push({ op: "note", slot: "notes", value: { value: note, p: 1, src: "edit", evidence: "edited" } });
    remember();
    setSpec(apply(spec, ups));
  };
  const setWearer = (w: string) => setSpec(apply(spec, [{ op: "set", slot: "wearer", value: { value: w, p: 1, src: "edit", evidence: "edited" } }]));
  const fromBoard = (ups: Update[], note: string) => {
    // the board adds to the design in place; Talk shows the reading whenever it is opened next
    remember(); const next = apply(spec, ups); setSpec(next);
    void reply(next, ups, turnsOf(msgs), note);
  };
  const reset = () => {
    if (msgs.length) remember();
    const id = newDesignId();
    setDesignId(id); setCurrentDesignId(id);
    setSpec(emptySpec()); setMsgs([]); setDraft(""); setHeard(false);
    go("talk");
  };
  // links in: /studio/ and the old ?view=board|sheet|shop open the page's own URL; ?new opens a blank design
  useLayoutEffect(() => {
    const q = new URLSearchParams(location.search);
    const fresh = q.has("new");
    if (!viewOf(location.pathname)) {
      const v = q.get("view");
      location.replace(studioHref(VIEWS.includes(v as View) ? (v as View) : "talk", fresh ? "?new" : ""));
      return;
    }
    if (fresh) { reset(); history.replaceState(null, "", location.pathname); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const still = !!useReducedMotion();
  const started = msgs.length > 0;
  const backBtn = past.length > 0 && !thinking
    ? <button className={pill} onClick={back} aria-label="Go back one step"><span aria-hidden className="mr-1 text-[18px] leading-none">‹</span>Back</button> : null;
  const NAV: [View, string][] = [["talk", "Talk"], ["board", "Board"], ["sheet", "Sheet"], ["shop", "Shop"]];
  const header = useMemo(() => (
    <header className="top"><div className="inner">
      <a className="mark" href="/" aria-label="Bespoke home"><Mark className="size-5" /><span>Bespoke</span></a>
      <nav className="seg" aria-label="Studio">
        {NAV.map(([v, l]) => (
          <a key={v} href={studioHref(v)} aria-current={view === v ? "page" : undefined}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); if (v === "board") openBoard(); else go(v); }}>
            {view === v && <motion.span layoutId="studio-tab" transition={SPRING} className="absolute inset-0 rounded-full bg-brand-ink" />}
            <span className="relative">{l}</span>
          </a>
        ))}
      </nav>
      <div className="right">
        <AnimatePresence>
          {started && (
            <motion.button className="ghost" onClick={reset} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={SPRING}>
              New design
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div></header>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [view, started, go]);

  if (!viewOf(path)) return null;   // on the way to /studio/talk/
  if (resuming) return (
    <>{header}<main className="hero"><motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-[17px] text-brand-ink/50">Opening your last design</motion.p></main></>
  );
  if (view === "board") return (<>{header}<Board key={boardId} boardId={boardId} design={spec.slots.garment ? phrase(spec) : ""} onOpen={setBoardId} onNew={() => setBoardId(newBoardId())} onEvidence={fromBoard} comparisons={spec.comparisons} designLooks={boardLooks(spec)} /></>);
  if (view === "sheet") return (<>{header}<SheetView spec={spec} m={m} setM={setM} onTalk={() => go("talk")} /></>);
  if (view === "shop") return (<>{header}<ShopView spec={spec} onWearer={setWearer} onTalk={() => go("talk")} /></>);

  const composer = (big?: boolean, placeholder?: string) => (
    <Composer big={big} value={draft} setValue={typeDraft} onSend={send} voice={voice} busy={thinking} heard={heard} placeholder={placeholder} />
  );

  if (!started) return (
    <>
      {header}
      <main className="hero flex min-h-[calc(100svh-96px)] flex-col justify-center !pb-16">
        <div className="row">
          <h1 className="display">
            {["Describe it.", "Wear it."].map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <motion.span className="block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ ...SOFT, delay: 0.08 + i * 0.1 }}>{line}</motion.span>
              </span>
            ))}
          </h1>
        </div>
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.22 }}
          className="mt-8 max-w-[52ch] text-[clamp(17px,1.4vw,20px)] leading-[1.5] text-brand-ink/60">
          Tell us the garment you want, the way you would tell a friend, in English or Hinglish. We ask what is missing, one question at a time, and turn it into a sheet any tailor can follow.
        </motion.p>
        <motion.div className="brief" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.28 }}>
          <label htmlFor="brief" className="sr-only">Your brief</label>
          {composer(true)}
        </motion.div>
      </main>
      {/* how it works, in a black band at the foot of the page */}
      <section className="bg-brand-ink text-white" aria-labelledby="how">
        <div className="mx-auto max-w-[1440px] px-5 py-[clamp(64px,9vw,128px)] md:px-10">
          <h2 id="how" className="display max-w-[12ch] text-[clamp(36px,4.6vw,64px)] text-white">How it works.</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-3">
            {TALK_STEPS.map(([title, text], i) => (
              <motion.li key={title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ ...SOFT, delay: i * 0.08 }}
                className="border-t border-white/15 pt-5">
                <span className="text-[13px] font-medium text-white/40">{i + 1}</span>
                <p className="mt-2 text-[20px] font-medium tracking-[-0.015em]">{title}</p>
                <p className="mt-2 max-w-[34ch] text-[15px] leading-[1.55] text-white/60">{text}</p>
              </motion.li>
            ))}
          </ol>
          <button type="button" onClick={openBoard}
            className="press mt-14 inline-flex h-12 items-center rounded-full bg-white px-6 text-[15px] font-medium text-brand-ink transition-colors hover:bg-white/85">
            Have pictures instead? Start with a moodboard
          </button>
        </div>
      </section>
    </>
  );

  const pending = pendingOf(msgs);
  const done = !!spec.slots.garment && ask(spec).length === 0;
  return (
    <>
      {header}
      <div className="fitting">
        <section className="flex min-h-[calc(100svh-140px)] flex-col justify-end gap-10 pb-[220px]" aria-live="polite">
          {msgs.map((x, i) => {
            if (x.role === "me") return <Said key={i} m={x} />;
            const last = i === msgs.length - 1;
            const q = x.question ?? x.questions?.[0] ?? null;
            return (
              <motion.div key={i} className="flex gap-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-ink/[.05]"><Mark className="size-4" /></span>
                <div className={cn("min-w-0 flex-1", !last && "opacity-55 transition-opacity duration-300 hover:opacity-100")}>
                  <p className="text-[clamp(21px,1.8vw,26px)] font-medium leading-[1.3] tracking-[-0.025em]"><Reveal text={x.text} still={still || !last} /></p>
                  {x.note && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: last ? 0.35 : 0 }} className="mt-3 max-w-[60ch] text-[16px] leading-[1.55] text-brand-ink/60">{x.note}</motion.p>
                  )}
                  {x.examples && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {x.examples.map((e) => (
                        <button key={e} type="button" disabled={!last} onClick={() => { setDraft(e); setHeard(false); }}
                          className="h-11 rounded-full bg-brand-ink/[.05] px-5 text-left text-[15px] font-medium transition-colors hover:bg-brand-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] disabled:pointer-events-none">
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  {q && (last || !x.examples) && <Ask q={q} spec={spec} live={last && !thinking} still={still} onPick={(v) => pick(q, v)} onSkip={() => skip(q)} />}
                  {last && !thinking && (done && !x.examples
                    ? <Finale spec={spec} onSheet={() => go("sheet")} onShop={() => go("shop")} backBtn={backBtn} />
                    : (
                      <motion.div className="mt-8 flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                        {backBtn}
                        {spec.slots.garment && <button className={pill} onClick={openBoard}>Add pictures</button>}
                        {spec.slots.garment && <button className={pill} onClick={() => go("sheet")}>Tailor sheet</button>}
                        {spec.slots.garment && <button className={pill} onClick={() => go("shop")}>Ideas and shopping</button>}
                      </motion.div>
                    ))}
                </div>
              </motion.div>
            );
          })}
          <AnimatePresence>
            {thinking && (
              <motion.div key="dots" className="flex items-center gap-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-ink/[.05]"><Mark className="size-4" /></span>
                <span className="rounded-[20px] rounded-bl-[6px] bg-[#f2f3f5] px-4 py-3"><Dots /></span>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </section>
        <Order spec={spec} onEdit={edit} />
      </div>
      <div className="dock"><div className="wrap">
        <div className="grow">{composer(false, pending ? "Type your own answer, or anything to change" : "Add a detail or change anything")}</div>
      </div></div>
    </>
  );
}
