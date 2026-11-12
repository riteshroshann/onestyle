"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { ONTO, Span, correctTranscript } from "../lib/engine/lexicon";
import { Measurements, PART_HI, SWATCH, advice, finished, links, nearestColour, phrase, sheetLines } from "../lib/engine/describe";
import { hindi } from "../lib/engine/lexicon";
import { Question, Spec, Update, answer, apply, bind, contextOf, depthInches, emptySpec, questions, wearerOf, wearerUpdates } from "../lib/engine/spec";
import { allHaveLooks, groupOf, isPhoto, isTall, lookOf } from "../lib/looks";
import { isCommonWord, loadTagger, tag } from "../lib/models";
import { understand } from "../lib/understand";

const Board = dynamic(() => import("./Board"), { ssr: false });
import { SendToMaker } from "./market/SendToMaker";
import { Mark } from "./site/Mark";
import { Arrow, Dots, Reveal, SOFT, SPRING } from "./site/Motion";
import { cn } from "@/lib/utils";
import { newBoardId } from "../lib/boards";

type Msg =
  | { role: "me"; text: string; tokens: string[]; spans: Span[] }
  | { role: "bot"; text: string; questions: Question[]; note?: string };
type View = "talk" | "board" | "sheet" | "shop";

const PLACEHOLDER = "A pastel blue kurti for my farewell";
const TALK_STEPS: [string, string][] = [
  ["Describe it", "Type or speak: the garment, the occasion, colours, anything you already know."],
  ["Answer a few questions", "Tap an answer for what is missing. Change any detail on the right whenever you like."],
  ["Take it to a maker", "Get a tailor sheet in English or Hindi, or send it to a maker on Bespoke."],
];
const SLOT_TAG: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "sleeve.style": "SLEEVE", "sleeve.length": "LENGTH", "sleeve.fit": "FIT",
  "bodice.fit": "FIT", "lower.fit": "FIT", "lower.silhouette": "SILHOUETTE", "garment.length": "LENGTH", fabric: "FABRIC",
  colour: "COLOUR", shade: "SHADE", pattern: "PATTERN", embellishment: "EMBELL", occasion: "OCCASION", style: "STYLE", components: "GARMENT",
};
const ROWS: [string, string][] = [
  ["garment", "Garment"], ["components", "Pieces"], ["neckline.shape", "Neckline"], ["neckline.depth", "Neck depth"], ["back.depth", "Back"],
  ["sleeve.style", "Sleeve"], ["sleeve.length", "Sleeve length"], ["bodice.fit", "Fit"], ["lower.fit", "Below the waist"],
  ["lower.silhouette", "Silhouette"], ["garment.length", "Length"], ["fabric", "Fabric"], ["colour", "Colour"], ["shade", "Shade"],
  ["pattern", "Print"], ["embellishment", "Finish"], ["occasion", "Occasion"], ["style", "Mood"],
];
const DRAWN: [string, string][] = [
  ["garment", "Garment"], ["neckline.shape", "Neckline"], ["neckline.depth", "Neck depth"], ["sleeve.style", "Sleeve"], ["sleeve.length", "Sleeve length"],
  ["bodice.fit", "Fit"], ["lower.silhouette", "Silhouette"], ["garment.length", "Length"], ["fabric", "Fabric"], ["pattern", "Print"], ["embellishment", "Finish"],
];
const SOURCE: Record<string, string> = { model: "your words", words: "your words", note: "a note on your board", image: "your pictures", answer: "your answer", edit: "your edit", profile: "your profile" };
const LIST_SLOTS = ["colour", "embellishment", "style", "pattern", "occasion", "shade", "components"];
const NICE: Record<string, string> = { v: "V", "deep v": "deep V", u: "U", "a-line": "A-line", trousers: "pants", crew: "crew neck", hooded: "hooded", turtle: "turtle neck", "t-shirt": "t-shirt" };
const nice = (v: string) => NICE[v] ?? v;
const FAMILY_TITLE: Record<string, string> = {
  top_long: "Kurtas, dresses and gowns", top_short: "Tops, shirts and blouses", knit_top: "Sweatshirts and knits", outer: "Jackets and coats",
  bottom: "Pants, skirts and bottoms", set: "Sets", drape: "Sarees and dupattas",
};

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

// ------------------------------------------------------------------ voice
// Two engines. The browser's speech service is instant where it works (Chrome, Edge, Safari). Brave ships the
// API but blocks the service ("network" error) and Firefox has no API, so there we record locally and
// transcribe on-device with Whisper. Any failure of the first engine falls through to the second.
const micMessage = (e: any) =>
  e?.name === "NotAllowedError" || e === "not-allowed" ? "The microphone is blocked. Allow it from the icon in the address bar, then try again."
    : e?.name === "NotFoundError" || e === "audio-capture" ? "No microphone was found on this device."
      : "The microphone could not start.";

function useVoice(onFinal: (t: string) => void) {
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState("");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const rec = useRef<any>(null);
  const media = useRef<MediaRecorder | null>(null);
  const stopMeter = useRef<() => void>(() => {});
  const SR = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
  const isBrave = typeof navigator !== "undefined" && !!(navigator as any).brave;
  const engine = useRef<"browser" | "whisper">(SR && !isBrave ? "browser" : "whisper");
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const meter = (stream: MediaStream, onSilence?: () => void) => {
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const t0 = performance.now();
    let raf = 0, spoke = false, lastVoice = t0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2;
      const lv = Math.min(1, Math.sqrt(s / buf.length) * 4);
      setLevel(lv);
      const now = performance.now();
      if (lv > 0.08) { spoke = true; lastVoice = now; }
      // stop after 1.6 s of silence once speech has started, or after 25 s in any case
      if (onSilence && ((spoke && now - lastVoice > 1600) || now - t0 > 25000)) { onSilence(); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); void ctx.close(); };
  };

  const startWhisper = useCallback(async () => {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { setStatus(micMessage(e)); setLive(false); return; }
    void import("../lib/models").then((m) => m.loadSpeech());   // warm the model while the customer speaks
    const chunks: globalThis.Blob[] = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stopMeter.current(); stream.getTracks().forEach((t) => t.stop());
      setLive(false); setLevel(0);
      if (!chunks.length) { setStatus(""); return; }
      setStatus("Writing down what you said. The first time takes a moment while the speech model loads.");
      try {
        const { toMono16k, transcribe } = await import("../lib/models");
        const text = await transcribe(await toMono16k(new globalThis.Blob(chunks, { type: mr.mimeType })), lang);
        setStatus("");
        if (text && !/^\[.*\]$/.test(text)) onFinal(text); else setStatus("Nothing was heard. Speak a little closer to the microphone.");
      } catch (e: any) { setStatus(`The speech model did not load: ${e?.message ?? e}`); }
    };
    media.current = mr;
    mr.start(250);
    setLive(true); setStatus("Listening. Pause when you have finished.");
    stopMeter.current = meter(stream, () => { if (mr.state === "recording") mr.stop(); });
  }, [lang, onFinal]);

  const startBrowser = useCallback(() => {
    const r = new SR();
    let heard = false;
    r.lang = lang; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => {
      heard = true;
      let fin = "", mid = "";
      for (const res of e.results) (res.isFinal ? (fin += res[0].transcript) : (mid += res[0].transcript));
      setInterim(mid);
      if (fin) { setInterim(""); onFinal(fin); }
    };
    r.onerror = (e: any) => {
      stopMeter.current(); setLive(false); setLevel(0);
      if (e.error === "not-allowed" || e.error === "audio-capture") { setStatus(micMessage(e.error)); return; }
      if (e.error === "no-speech" || e.error === "aborted") { setStatus(""); return; }
      // network, service-not-allowed, language-not-supported: the browser's service is unavailable here
      engine.current = "whisper";
      if (!heard) void startWhisper();
    };
    r.onend = () => { stopMeter.current(); setLive(false); setLevel(0); setStatus((s) => (s.startsWith("Listening") ? "" : s)); };
    rec.current = r;
    try { r.start(); } catch { engine.current = "whisper"; void startWhisper(); return; }
    setLive(true); setStatus("Listening.");
    navigator.mediaDevices?.getUserMedia({ audio: true }).then((stream) => {
      const stopM = meter(stream);
      stopMeter.current = () => { stopM(); stream.getTracks().forEach((t) => t.stop()); };
    }).catch(() => { /* the level meter is decoration */ });
  }, [SR, lang, onFinal, startWhisper]);

  const start = useCallback(() => {
    setStatus("");
    if (engine.current === "browser" && SR) startBrowser(); else void startWhisper();
  }, [SR, startBrowser, startWhisper]);
  const stop = useCallback(() => {
    if (media.current?.state === "recording") media.current.stop();
    else { rec.current?.stop(); stopMeter.current(); setLive(false); setLevel(0); }
  }, []);
  return { supported, live, status, interim, level, lang, setLang, start, stop };
}

const Mic = () => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
const EXAMPLES = [PLACEHOLDER, "Ek maroon lehenga, gota patti ke saath", "A linen shirt with a mandarin collar", "A black blouse with a deep back"];

/** Speech language, as a two-way switch whose ink slides between the sides. */
function LangSwitch({ voice }: { voice: ReturnType<typeof useVoice> }) {
  const id = useId();
  return (
    <div role="group" aria-label="Speech language" className="relative flex h-9 items-center rounded-full bg-brand-ink/[.05] p-1 text-[13px] font-medium">
      {([["en-IN", "EN", "English"], ["hi-IN", "हिं", "Hindi"]] as const).map(([code, short, name]) => (
        <button key={code} type="button" aria-pressed={voice.lang === code} aria-label={`Speak in ${name}`} onClick={() => voice.setLang(code)}
          className={cn("relative h-7 rounded-full px-3 transition-colors", voice.lang === code ? "text-white" : "text-brand-ink/60 hover:text-brand-ink")}>
          {voice.lang === code && <motion.span layoutId={id} transition={SPRING} className="absolute inset-0 rounded-full bg-brand-ink" />}
          <span className="relative">{short}</span>
        </button>
      ))}
    </div>
  );
}

/** The brief: grows with the words and can be spoken instead of typed. */
function Composer({ onSend, voice, big, busy }: {
  onSend: (t: string) => void; voice: ReturnType<typeof useVoice>; big?: boolean; busy?: boolean;
}) {
  const still = !!useReducedMotion();
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const [tip, setTip] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const shown = voice.live ? voice.interim : text;
  const ready = text.trim().length > 0 && !busy && !voice.live;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, big ? 180 : 120)}px`;
  }, [shown, big]);
  // the placeholder walks through a few briefs while the field is empty
  useEffect(() => {
    if (shown || still) return;
    const t = setInterval(() => setTip((i) => (i + 1) % EXAMPLES.length), 3400);
    return () => clearInterval(t);
  }, [shown, still]);

  const send = () => { const t = text.trim(); if (t && ready) { onSend(t); setText(""); } };
  const controls = (
    <div className="ml-auto flex shrink-0 items-center gap-1.5">
      {voice.supported && big && <LangSwitch voice={voice} />}
      {voice.supported && (
        <motion.button type="button" whileTap={{ scale: 0.9 }} transition={SPRING} onClick={() => (voice.live ? voice.stop() : voice.start())}
          aria-label={voice.live ? "Stop listening" : "Speak instead"} aria-pressed={voice.live}
          className={cn("relative grid size-11 place-items-center rounded-full transition-colors", voice.live ? "bg-[#b5121b] text-white" : "text-brand-ink/70 hover:bg-brand-ink/[.06] hover:text-brand-ink")}>
          {voice.live && <motion.span aria-hidden className="absolute inset-0 rounded-full bg-[#b5121b]/25" animate={{ scale: 1 + voice.level * 0.9 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} />}
          <span className="relative"><Mic /></span>
        </motion.button>
      )}
      <motion.button type="submit" disabled={!ready} aria-label="Send"
        animate={{ scale: ready ? 1 : 0.86, opacity: ready ? 1 : 0.3 }} whileTap={{ scale: 0.9 }} transition={SPRING}
        className={cn("grid shrink-0 place-items-center rounded-full bg-brand-ink text-white", big ? "size-12" : "size-11")}>
        <Arrow />
      </motion.button>
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }}>
      <motion.div animate={{ boxShadow: focus ? "0 18px 50px -20px rgba(13,17,23,.30)" : "0 8px 30px -22px rgba(13,17,23,.25)" }} transition={{ duration: 0.3 }}
        className={cn("bg-white ring-1 transition-[--tw-ring-color] duration-200", focus ? "ring-brand-ink/25" : "ring-brand-ink/10 hover:ring-brand-ink/20",
          big ? "rounded-[32px] p-3 pl-7" : "flex items-end gap-2 rounded-[28px] p-1.5 pl-6")}>
        <div className="relative flex-1">
          <textarea ref={area} id={big ? "brief" : undefined} rows={1} value={shown} readOnly={voice.live} maxLength={600}
            onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} autoFocus={big}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            aria-label="Describe the garment"
            className={cn("block w-full resize-none bg-transparent leading-[1.35] tracking-[-0.01em] text-brand-ink outline-none",
              big ? "min-h-[64px] py-3 text-[clamp(19px,1.7vw,24px)]" : "min-h-11 py-[11px] text-[17px]")} />
          {!shown && !voice.live && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={tip} aria-hidden initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.35 }}
                className={cn("pointer-events-none absolute inset-x-0 truncate text-brand-ink/35", big ? "top-3 text-[clamp(19px,1.7vw,24px)]" : "top-[11px] text-[17px]")}>
                {EXAMPLES[tip]}
              </motion.span>
            </AnimatePresence>
          )}
        </div>
        {big ? (
          <div className="mt-1 flex items-center justify-between gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={voice.status || (text ? "keys" : "none")} role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="hidden min-w-0 truncate text-[14px] text-brand-ink/50 sm:block">
                {voice.status || (text ? "Enter to send, Shift and Enter for a new line" : "")}
              </motion.p>
            </AnimatePresence>
            {controls}
          </div>
        ) : controls}
      </motion.div>
      {!big && voice.status && <p role="status" className="mt-2 pl-6 text-[14px] text-brand-ink/55">{voice.status}</p>}
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
      className="ml-auto max-w-[min(560px,88%)] rounded-[26px] rounded-br-[8px] bg-brand-ink px-6 py-4 text-[18px] leading-[1.5] text-white">
      {parts}
    </motion.div>
  );
}

const pill = "press inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium ring-1 ring-brand-ink/12 transition-[background-color,box-shadow,transform] duration-200 hover:bg-brand-ink/[.04] hover:ring-brand-ink/25 active:scale-[0.97]";

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
  if (slot === "colour") {
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
  return (
    <aside className="order" aria-label="Your design">
      <AnimatePresence mode="wait" initial={false}><motion.h2 key={spec.slots.garment?.value ?? "none"} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>{spec.slots.garment ? nice(spec.slots.garment.value)[0].toUpperCase() + nice(spec.slots.garment.value).slice(1) : "Your design"}</motion.h2></AnimatePresence>
      <div className="meta">{rows.length ? `Draft ${spec.version}. Select any detail to change it.` : ""}</div>
      {!rows.length && <div className="empty">Each detail you mention settles here, part by part, with where it came from.</div>}
      {rows.length > 0 && (
        <dl>
          {rows.map(([slot, label]) => {
            const v = spec.slots[slot];
            const list = spec.lists[slot] ?? [];
            const ex = spec.excluded.filter((e) => e.slot === slot);
            const editable = !!SLOT_TAG[slot] || slot.endsWith(".depth");
            const open = () => editable && setEditing([slot, label]);
            return (
              <motion.div layout="position" className="item" key={`${slot}:${v?.value ?? ""}:${list.map((x) => x.value).join()}`}
                initial={{ backgroundColor: "rgba(56,189,248,.18)" }} animate={{ backgroundColor: "rgba(56,189,248,0)" }} transition={{ duration: 1.4, ease: "easeOut" }}>
                <dt>{label}</dt>
                <dd>
                  {v && <button onClick={open}>{lookOf(slot, v.value, contextOf(slot, spec)) && <img className={`thumb${isPhoto(slot) ? " photo" : ""}`} src={lookOf(slot, v.value, contextOf(slot, spec))} alt="" />}{slot.endsWith(".depth") && depthInches(v) ? `${depthInches(v)} in` : `${v.intensity === "slight" ? "slightly " : v.intensity === "strong" ? "very " : ""}${nice(v.value)}`}{editable && <span className="chev">›</span>}</button>}
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

function SheetView({ spec, m, setM }: { spec: Spec; m: Measurements; setM: (m: Measurements) => void }) {
  const lines = sheetLines(spec, m);
  const f = finished(spec, m);
  const drawings = DRAWN.flatMap(([slot, part]) => {
    const v = spec.slots[slot]?.value ?? spec.lists[slot]?.[0]?.value;
    const src = v ? lookOf(slot, v, contextOf(slot, spec)) : undefined;
    return v && src ? [{ slot, part, value: v, src }] : [];
  });
  const [hi, setHi] = useState(false);
  const [sending, setSending] = useState(false);
  const field = (k: keyof Measurements, label: string) => (
    <label>{label}<input inputMode="decimal" value={m[k] ?? ""} onChange={(e) => setM({ ...m, [k]: e.target.value ? parseFloat(e.target.value) : undefined })} /></label>
  );
  return (
    <main className="page">
      <h2 className="noprint">Tailor sheet</h2>
      <div className="actions noprint">
        <button className="btn quiet" onClick={() => setHi(!hi)}>{hi ? "Show in English" : "हिंदी में दिखाएँ"}</button>
        <button className="btn quiet" onClick={() => window.print()}>Print or save as PDF</button>
        {lines.length > 0 && <button className="btn" onClick={() => setSending(true)}>Send to a maker</button>}
      </div>
      {sending && <SendToMaker spec={spec} m={m} onClose={() => setSending(false)} />}
      <div className="sheet">
        <h3 className={hi ? "hi" : ""}>{spec.slots.garment ? (hi ? hindi("GARMENT", spec.slots.garment.value) : nice(spec.slots.garment.value)[0].toUpperCase() + nice(spec.slots.garment.value).slice(1)) : (hi ? "पोशाक" : "Garment")}</h3>
        <div className={`meta ${hi ? "hi" : ""}`}>{hi ? `ड्राफ़्ट ${spec.version}, ${new Date().toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" })}` : `Draft ${spec.version}, ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. ${phrase(spec)}.`}</div>
        {lines.length ? (
          <table><tbody>{lines.map((l) => <tr key={l.part}><td className={hi ? "hi" : ""}>{hi ? l.hiPart : l.part}</td><td className={hi ? "hi" : ""}>{hi ? l.hi : l.en}</td><td className="from">{l.from}</td></tr>)}</tbody></table>
        ) : <p style={{ color: "var(--ink-3)" }}>Describe the garment first; its instructions appear here.</p>}
        {drawings.length > 0 && (<>
          <h4 className={hi ? "hi" : ""}>{hi ? "चित्र" : "Drawings"}</h4>
          <div className="drawings">{drawings.map((d) => (
            <figure key={d.slot} className={`${isPhoto(d.slot) ? "photo" : ""}${isTall(d.slot) ? " tall" : ""}`}>
              <img src={d.src} alt={`${d.part}: ${nice(d.value)}`} />
              <figcaption className={hi ? "hi" : ""}><b>{hi ? (PART_HI[d.part] ?? d.part) : d.part}</b>{hi ? hindi(SLOT_TAG[d.slot] as never, d.value) : nice(d.value)}</figcaption>
            </figure>
          ))}</div>
        </>)}
        <h4 className={hi ? "hi" : ""}>{hi ? "माप (इंच में)" : "Measurements in inches"}</h4>
        <div className={`meas ${hi ? "hi" : ""}`}>{field("bust", hi ? "छाती" : "Bust")}{field("waist", hi ? "कमर" : "Waist")}{field("hip", hi ? "कूल्हा" : "Hip")}{field("shoulder", hi ? "कंधा" : "Shoulder")}{field("length", hi ? "लंबाई" : "Length")}{field("sleeve", hi ? "आस्तीन" : "Sleeve")}</div>
        {(f.bust || f.waist || f.hip) && <div className={`finished ${hi ? "hi" : ""}`}>{hi
          ? `तैयार कपड़े का माप: ${[f.bust && `छाती ${f.bust} इंच`, f.waist && `कमर ${f.waist} इंच`, f.hip && `कूल्हा ${f.hip} इंच`].filter(Boolean).join(", ")}।`
          : `Finished garment: ${[f.bust && `bust ${f.bust} in`, f.waist && `waist ${f.waist} in`, f.hip && `hip ${f.hip} in`].filter(Boolean).join(", ")}.`}</div>}
      </div>
    </main>
  );
}

const icon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

function ShopView({ spec, onWearer }: { spec: Spec; onWearer: (w: string) => void }) {
  const L = links(spec);
  const who = wearerOf(spec);
  return (
    <main className="page">
      <h2>Ideas and shopping</h2>
      <p className="lede">Searches written from your design. Look for ideas, buy something close ready-made, or find the fabric and a tailor to have it made.</p>
      <div className="searchline">
        <div className="q"><small>Searching for</small>{L.query || "Describe a garment first"}</div>
        <div className="seg" role="group" aria-label="Shopping for">
          {(["women", "men", "anyone"] as const).map((w) => <button key={w} aria-pressed={who === w} onClick={() => onWearer(w)}>{w[0].toUpperCase() + w.slice(1)}</button>)}
        </div>
      </div>
      <h3>Buy ready-made</h3>
      <div className="cards">
        {L.shops.map((p) => (
          <a className="card" key={p.label} href={p.url} target="_blank" rel="noreferrer">
            <img src={icon(p.domain)} alt="" loading="lazy" /><div><b>{p.label}</b><span>Open search</span></div>
          </a>
        ))}
      </div>
      <h3>Ideas on Pinterest</h3>
      <div className="cards ideas">
        {L.pinterest.map((p) => (
          <a className="card" key={p.url} href={p.url} target="_blank" rel="noreferrer">
            <img src={icon("pinterest.com")} alt="" loading="lazy" /><div><b>{p.label}</b><span>Pinterest</span></div>
          </a>
        ))}
      </div>
      {L.fabric.length > 0 && (<><h3>The fabric</h3><div className="cards">{L.fabric.map((p) => (
        <a className="card" key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={icon("amazon.in")} alt="" loading="lazy" /><div><b>{p.label}</b><span>By the metre</span></div></a>
      ))}</div></>)}
      <h3>Have it made</h3>
      <div className="cards">
        <a className="card" href={L.tailors.url} target="_blank" rel="noreferrer"><img src={icon("maps.google.com")} alt="" loading="lazy" /><div><b>Tailors near you</b><span>Take your tailor sheet along</span></div></a>
      </div>
    </main>
  );
}

function Finale({ spec, onSheet, onShop, backBtn }: { spec: Spec; onSheet: () => void; onShop: () => void; backBtn: React.ReactNode }) {
  const L = links(spec);
  return (
    <div className="finale">
      <div className="q">Your design is ready. Find something close, or take it to a tailor.</div>
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

// ------------------------------------------------------------------ app
export default function App() {
  const [spec, setSpec] = useState<Spec>(() => load("bespoke.spec", emptySpec()));
  const [msgs, setMsgs] = useState<Msg[]>(() => load("bespoke.msgs", []));
  const [view, setView] = useState<View>("talk");
  const [boardId, setBoardId] = useState(newBoardId);
  // the board opens blank from anywhere in the studio; earlier boards are one click away in its history
  const openBoard = () => { setBoardId(newBoardId()); setView("board"); };
  const [m, setM] = useState<Measurements>(() => load("bespoke.meas", {}));
  const [thinking, setThinking] = useState(false);
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
    if (!prev.msgs.length) setView("talk");
  };
  useEffect(() => { save("bespoke.past", past); }, [past]);

  useEffect(() => { loadTagger(() => {}); }, []);
  useEffect(() => { save("bespoke.spec", spec); save("bespoke.msgs", msgs); save("bespoke.meas", m); }, [spec, msgs, m]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  const reply = useCallback((next: Spec, ups: Update[], note?: string) => {
    const got = ups.filter((u) => u.op !== "compare").length;
    const text = !next.slots.garment && !got ? "Tell me a little more. What should we make, and for which occasion?"
      : next.slots.garment ? `${phrase(next)[0].toUpperCase()}${phrase(next).slice(1)}.` : "Noted. What should we make?";
    setMsgs((x) => [...x, { role: "bot", text, questions: questions(next), note: note ?? (advice(next) || undefined) }]);
  }, []);

  const send = useCallback(async (text: string) => {
    remember();
    setThinking(true);
    // the language model (when configured) and the on-device engine run together; the device answers alone if the model cannot
    const second = understand(text, spec);
    const { tokens, spans } = await tag(correctTranscript(text, isCommonWord));
    const ups = [...bind(tokens, spans, "words"), ...wearerUpdates(text)];
    setMsgs((x) => [...x, { role: "me", text, tokens, spans }]);
    const model = await second;
    const all = model?.length ? [...ups, ...model] : ups;
    const next = apply(spec, all);
    setSpec(next);
    reply(next, all);
    setThinking(false);
  }, [spec, reply, remember]);

  const voice = useVoice(useCallback((t: string) => { void send(t); }, [send]));

  const pick = (q: Question, v: string) => {
    remember();
    const ups = answer(q.slot, v);
    const next = apply(spec, ups);
    setSpec(next);
    setMsgs((x) => [...x, { role: "me", text: q.labels?.[v] ?? v, tokens: [q.labels?.[v] ?? v], spans: [] }]);
    reply(next, ups);
  };
  const edit = (slot: string, value: string, note?: string) => {
    const ups: Update[] = [{ op: LIST_SLOTS.includes(slot) ? "replace" : "set", slot, value: { value, p: 1, src: "edit", evidence: "edited" } }];
    if (note) ups.push({ op: "note", slot: "notes", value: { value: note, p: 1, src: "edit", evidence: "edited" } });
    remember();
    setSpec(apply(spec, ups));
  };
  const setWearer = (w: string) => setSpec(apply(spec, [{ op: "set", slot: "wearer", value: { value: w, p: 1, src: "edit", evidence: "edited" } }]));
  const fromBoard = (ups: Update[], note: string) => { remember(); const next = apply(spec, ups); setSpec(next); reply(next, ups, note); setView("talk"); };
  const reset = () => { if (msgs.length) remember(); setSpec(emptySpec()); setMsgs([]); setView("talk"); };
  // links in: ?new opens a blank design (the last one still a Back away), ?view=board|sheet|shop opens that page
  useLayoutEffect(() => {
    const q = new URLSearchParams(location.search);
    const v = q.get("view");
    if (q.has("new")) reset();
    if (v === "board" || v === "sheet" || v === "shop") setView(v);
    if (q.has("new") || v) history.replaceState(null, "", location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const still = !!useReducedMotion();
  const started = msgs.length > 0;
  const backBtn = past.length > 0 && !thinking
    ? <button className={pill} onClick={back} aria-label="Go back one step"><span aria-hidden className="mr-1 text-[18px] leading-none">‹</span>Back</button> : null;
  const NAV: [View, string][] = [["talk", "Talk"], ["board", "Board"], ["sheet", "Sheet"], ["shop", "Shop"]];
  const header = useMemo(() => (
    <header className="top"><div className="inner">
      <a className="mark" href="/" aria-label="Bespoke home"><Mark className="size-5" /><span>Bespoke</span></a>
      <nav className="seg" aria-label="Sections">
        {NAV.map(([v, l]) => (
          <button key={v} aria-pressed={view === v} onClick={() => (v === "board" ? openBoard() : setView(v))}>
            {view === v && <motion.span layoutId="studio-tab" transition={SPRING} className="absolute inset-0 rounded-full bg-brand-ink" />}
            <span className="relative">{l}</span>
          </button>
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
  ), [view, started]);

  if (view === "board") return (<>{header}<Board key={boardId} boardId={boardId} onOpen={setBoardId} onNew={() => setBoardId(newBoardId())} onEvidence={fromBoard} comparisons={spec.comparisons} /></>);
  if (view === "sheet") return (<>{header}<SheetView spec={spec} m={m} setM={setM} /></>);
  if (view === "shop") return (<>{header}<ShopView spec={spec} onWearer={setWearer} /></>);

  if (!started) return (
    <>
      {header}
      <main className="hero">
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
          Tell us the garment you want, the way you would tell a friend, in English or Hinglish. We ask what is missing and turn it into a sheet any tailor can follow.
        </motion.p>
        <motion.div className="brief" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.28 }}>
          <label htmlFor="brief" className="sr-only">Your brief</label>
          <Composer big onSend={send} voice={voice} busy={thinking} />
          <ol className="mt-12 grid max-w-[1040px] gap-6 sm:grid-cols-3">
            {TALK_STEPS.map(([title, text], i) => (
              <motion.li key={title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.45 + i * 0.07 }}
                className="border-t border-brand-ink/10 pt-4">
                <span className="text-[13px] font-medium text-brand-ink/40">{i + 1}</span>
                <p className="mt-1 text-[16px] font-medium">{title}</p>
                <p className="mt-1 max-w-[34ch] text-[14px] leading-[1.5] text-brand-ink/55">{text}</p>
              </motion.li>
            ))}
          </ol>
          <motion.div className="mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
            <button type="button" onClick={openBoard}
              className="h-11 px-1 text-[15px] font-medium underline decoration-brand-ink/25 underline-offset-[6px] transition-[text-decoration-color] hover:decoration-brand-ink">
              Have pictures instead? Start with a moodboard
            </button>
          </motion.div>
        </motion.div>
      </main>
    </>
  );

  return (
    <>
      {header}
      <div className="fitting">
        <section className="flex flex-col gap-10 pb-[220px]" aria-live="polite">
          {msgs.map((x, i) => {
            if (x.role === "me") return <Said key={i} m={x} />;
            const last = i === msgs.length - 1;
            return (
              <motion.div key={i} className="flex gap-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-ink/[.05]"><Mark className="size-4" /></span>
                <div className={cn("min-w-0 flex-1", !last && "opacity-55 transition-opacity duration-300 hover:opacity-100")}>
                  <p className="text-[22px] font-medium leading-[1.35] tracking-[-0.02em]"><Reveal text={x.text} still={still || !last} /></p>
                  {x.note && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: last ? 0.35 : 0 }} className="mt-3 max-w-[60ch] text-[16px] leading-[1.55] text-brand-ink/60">{x.note}</motion.p>
                  )}
                  {x.questions.slice(0, 2).map((q, qi) => (
                    <div className="mt-7" key={q.slot}>
                      <p className="mb-3 text-[15px] font-medium text-brand-ink/70">{q.text}</p>
                      {allHaveLooks(q.slot, q.options, contextOf(q.slot, spec))
                        ? <div className="looks inline">{q.options.map((o) => <Look key={o} slot={q.slot} value={o} ctx={contextOf(q.slot, spec)} label={q.labels?.[o] ?? nice(o)} onClick={() => pick(q, o)} />)}</div>
                        : (
                          <div className="flex flex-wrap gap-2">
                            {q.options.map((o, k) => (
                              <motion.button key={o} type="button" onClick={() => pick(q, o)} whileTap={{ scale: 0.94 }}
                                initial={last && !still ? { opacity: 0, y: 8, scale: 0.96 } : false} animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ ...SPRING, delay: 0.3 + qi * 0.12 + k * 0.035 }}
                                className="h-11 rounded-full bg-brand-ink/[.05] px-5 text-[15px] font-medium transition-colors duration-200 hover:bg-brand-ink hover:text-white">
                                {q.labels?.[o] ?? nice(o)}
                              </motion.button>
                            ))}
                          </div>
                        )}
                    </div>
                  ))}
                  {last && !thinking && (spec.slots.garment && questions(spec).length === 0
                    ? <Finale spec={spec} onSheet={() => setView("sheet")} onShop={() => setView("shop")} backBtn={backBtn} />
                    : (
                      <motion.div className="mt-8 flex flex-wrap gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                        {backBtn}
                        {spec.slots.garment && <button className={pill} onClick={openBoard}>Add pictures</button>}
                        {spec.slots.garment && <button className={pill} onClick={() => setView("shop")}>Ideas and shopping</button>}
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
        <div className="grow"><Composer onSend={send} voice={voice} busy={thinking} /></div>
      </div></div>
    </>
  );
}
