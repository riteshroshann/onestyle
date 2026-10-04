"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { ONTO, Span, correctTranscript } from "../lib/engine/lexicon";
import { Measurements, SWATCH, advice, finished, links, nearestColour, phrase, sheetLines } from "../lib/engine/describe";
import { hindi } from "../lib/engine/lexicon";
import { Question, Spec, Update, answer, apply, bind, depthInches, emptySpec, questions, wearerOf, wearerUpdates } from "../lib/engine/spec";
import { isCommonWord, loadTagger, tag } from "../lib/models";
import { understand } from "../lib/understand";

const Board = dynamic(() => import("./Board"), { ssr: false });
import { Home } from "./Home";
import { Orb } from "./Orb";

type Msg =
  | { role: "me"; text: string; tokens: string[]; spans: Span[] }
  | { role: "bot"; text: string; questions: Question[]; note?: string };
type View = "home" | "talk" | "board" | "sheet" | "shop";

const PLACEHOLDER = "A pastel blue kurti for my farewell";
const SUGGESTIONS = [
  "An ivory sherwani for my brother's wedding, mandarin collar, no heavy work",
  "Lehenga chahiye shaadi ke liye, maroon, gota patti, ghera bahut zyada",
  "A navy sweatshirt and joggers set for the cold",
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

export function Silk({ size = 200, state = "idle", level = 0 }: { size?: number; state?: string; level?: number }) {
  return <div className="silk" data-state={state} style={{ ["--size" as any]: `${size}px`, ["--level" as any]: level }} aria-hidden><i /></div>;
}

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

const Mic = () => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);

function Line({ onSend, voice, autoFocus, label }: { onSend: (t: string) => void; voice: ReturnType<typeof useVoice>; autoFocus?: boolean; label?: string }) {
  const [text, setText] = useState("");
  const send = () => { const t = text.trim(); if (t) { onSend(t); setText(""); } };
  return (
    <div>
      {label && <label htmlFor="brief">{label}</label>}
      <div className="field">
        <input id={label ? "brief" : undefined} value={voice.live ? voice.interim : text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocus}
          onKeyDown={(e) => e.key === "Enter" && send()} readOnly={voice.live}
          placeholder={voice.live ? "" : PLACEHOLDER} aria-label="Describe the garment" />
        {voice.supported && (
          <button className="lang" onClick={() => voice.setLang(voice.lang === "en-IN" ? "hi-IN" : "en-IN")}
            aria-label={voice.lang === "en-IN" ? "Speaking English. Switch to Hindi" : "Speaking Hindi. Switch to English"}>
            {voice.lang === "en-IN" ? "EN" : "हिं"}
          </button>
        )}
        {voice.supported && (
          <button className={`mic ${voice.live ? "live" : ""}`} onClick={() => (voice.live ? voice.stop() : voice.start())} aria-label={voice.live ? "Stop listening" : "Speak instead"}><Mic /></button>
        )}
        <button className="send" onClick={send}>Send</button>
      </div>
      <div className="hint" role="status">{voice.status}</div>
    </div>
  );
}

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
    parts.push(<span key={k} className="stitch" title={v ? `Understood as ${v}` : "Noted"}>{m.text.slice(a, b)}</span>);
    i = b;
  });
  parts.push(m.text.slice(i));
  return <div className="said"><span className="who">You</span>{parts}</div>;
}

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
function Picker({ slot, label, current, onPick, onClose }: {
  slot: string; label: string; current: string[]; onPick: (value: string, note?: string) => void; onClose: () => void;
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
              <div className="choices">{shown.map((g) => <button key={g} className="choice" aria-pressed={current.includes(g)} onClick={() => onPick(g)}>{nice(g)}</button>)}</div>
            </div>
          );
        })}
      </>
    );
  } else {
    const values: string[] = slot === "neckline.depth" || slot === "back.depth" ? ONTO.depth_order
      : slot === "sleeve.length" ? ONTO.sleeve_length_order : slot === "garment.length" ? ONTO.length_order : Object.keys(ONTO.lexicon[tagName] ?? {});
    body = <div className="choices">{values.map((v) => <button key={v} className="choice" aria-pressed={current.includes(v)} onClick={() => onPick(v)}>{nice(v)}</button>)}</div>;
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
      <h2>{spec.slots.garment ? nice(spec.slots.garment.value)[0].toUpperCase() + nice(spec.slots.garment.value).slice(1) : "Your design"}</h2>
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
              <div className="item" key={slot}>
                <dt>{label}</dt>
                <dd>
                  {v && <button onClick={open}>{slot.endsWith(".depth") && depthInches(v) ? `${depthInches(v)} in` : `${v.intensity === "slight" ? "slightly " : v.intensity === "strong" ? "very " : ""}${nice(v.value)}`}{editable && <span className="chev">›</span>}</button>}
                  {list.length > 0 && <button onClick={open}>{slot === "colour" && list.map((x) => <span key={x.value} className="dot" style={{ background: SWATCH[x.value] ?? "#ccc" }} />)}{list.map((x) => nice(x.value)).join(", ")}{editable && <span className="chev">›</span>}</button>}
                  {ex.map((x) => <span key={x.value} className="no" title={x.evidence}>{nice(x.value)}</span>)}
                  {(v || list.length > 0) && <small>from {[...new Set([v, ...list].filter(Boolean).map((x) => SOURCE[x!.src] ?? x!.src))].join(" and ")}</small>}
                </dd>
              </div>
            );
          })}
          {(spec.notes?.length ?? 0) > 0 && <div className="item"><dt>Notes</dt><dd>{spec.notes!.join("; ")}<small>for your tailor</small></dd></div>}
          {spec.comparisons.length > 0 && <div className="item"><dt>Compared</dt><dd>{spec.comparisons.map((c) => `${c.slot.split(".")[0]} ${c.cmp === "more" ? "beyond" : c.cmp === "less" ? "within" : "like"} ${c.ref}`).join("; ")}<small>set it on the moodboard</small></dd></div>}
        </dl>
      )}
      {editing && (
        <Picker slot={editing[0]} label={editing[1]} onClose={() => setEditing(null)}
          current={[spec.slots[editing[0]]?.value, ...(spec.lists[editing[0]] ?? []).map((x) => x.value)].filter(Boolean) as string[]}
          onPick={(value, note) => { onEdit(editing[0], value, note); if (!note) setEditing(null); }} />
      )}
    </aside>
  );
}

function SheetView({ spec, m, setM }: { spec: Spec; m: Measurements; setM: (m: Measurements) => void }) {
  const lines = sheetLines(spec, m);
  const f = finished(spec, m);
  const [hi, setHi] = useState(false);
  const field = (k: keyof Measurements, label: string) => (
    <label>{label}<input inputMode="decimal" value={m[k] ?? ""} onChange={(e) => setM({ ...m, [k]: e.target.value ? parseFloat(e.target.value) : undefined })} /></label>
  );
  return (
    <main className="page">
      <h2 className="noprint">Tailor sheet</h2>
      <p className="lede noprint">What your tailor cuts from. Each instruction shows where it came from, so the tailor can tell your words from a suggestion. Ease is a starting allowance; your tailor will confirm it at the fitting.</p>
      <div className="actions noprint">
        <button className="btn quiet" onClick={() => setHi(!hi)}>{hi ? "Show in English" : "हिंदी में दिखाएँ"}</button>
        <button className="btn" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <div className="sheet">
        <h3 className={hi ? "hi" : ""}>{spec.slots.garment ? (hi ? hindi("GARMENT", spec.slots.garment.value) : nice(spec.slots.garment.value)[0].toUpperCase() + nice(spec.slots.garment.value).slice(1)) : (hi ? "पोशाक" : "Garment")}</h3>
        <div className={`meta ${hi ? "hi" : ""}`}>{hi ? `ड्राफ़्ट ${spec.version}, ${new Date().toLocaleDateString("hi-IN", { day: "numeric", month: "long", year: "numeric" })}` : `Draft ${spec.version}, ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. ${phrase(spec)}.`}</div>
        {lines.length ? (
          <table><tbody>{lines.map((l) => <tr key={l.part}><td className={hi ? "hi" : ""}>{hi ? l.hiPart : l.part}</td><td className={hi ? "hi" : ""}>{hi ? l.hi : l.en}</td><td className="from">{l.from}</td></tr>)}</tbody></table>
        ) : <p style={{ color: "var(--ink-3)" }}>Describe the garment first; its instructions appear here.</p>}
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

function Finale({ spec, onSheet, onShop }: { spec: Spec; onSheet: () => void; onShop: () => void }) {
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
  const [view, setView] = useState<View>(() => (msgs.length ? "talk" : "home"));
  const [m, setM] = useState<Measurements>(() => load("bespoke.meas", {}));
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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
  }, [spec, reply]);

  const voice = useVoice(useCallback((t: string) => { void send(t); }, [send]));

  const pick = (q: Question, v: string) => {
    const ups = answer(q.slot, v);
    const next = apply(spec, ups);
    setSpec(next);
    setMsgs((x) => [...x, { role: "me", text: q.labels?.[v] ?? v, tokens: [q.labels?.[v] ?? v], spans: [] }]);
    reply(next, ups);
  };
  const edit = (slot: string, value: string, note?: string) => {
    const ups: Update[] = [{ op: LIST_SLOTS.includes(slot) ? "replace" : "set", slot, value: { value, p: 1, src: "edit", evidence: "edited" } }];
    if (note) ups.push({ op: "note", slot: "notes", value: { value: note, p: 1, src: "edit", evidence: "edited" } });
    setSpec(apply(spec, ups));
  };
  const setWearer = (w: string) => setSpec(apply(spec, [{ op: "set", slot: "wearer", value: { value: w, p: 1, src: "edit", evidence: "edited" } }]));
  const fromBoard = (ups: Update[], note: string) => { const next = apply(spec, ups); setSpec(next); reply(next, ups, note); setView("talk"); };
  const reset = () => { setSpec(emptySpec()); setMsgs([]); setView("talk"); };

  const started = msgs.length > 0;
  const state = voice.live ? "listening" : thinking ? "thinking" : "idle";
  const NAV: [View, string][] = [["home", "Home"], ["talk", "Talk"], ["board", "Board"], ["sheet", "Sheet"], ["shop", "Shop"]];
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [view]);
  const header = useMemo(() => (
    <header className={`top ${scrolled ? "scrolled" : ""}`}><div className="inner">
      <button className="mark" onClick={() => setView("home")} aria-label="Bespoke home">Bespoke</button>
      <nav className="seg" aria-label="Sections">{NAV.map(([v, l]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>)}</nav>
      <div className="right">{started && <button className="ghost" onClick={reset}>New design</button>}</div>
    </div></header>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [view, started, scrolled]);

  if (view === "home") return (<>{header}<Home onStart={() => setView("talk")} /></>);
  if (view === "board") return (<>{header}<Board onEvidence={fromBoard} comparisons={spec.comparisons} /></>);
  if (view === "sheet") return (<>{header}<SheetView spec={spec} m={m} setM={setM} /></>);
  if (view === "shop") return (<>{header}<ShopView spec={spec} onWearer={setWearer} /></>);

  if (!started) return (
    <>
      {header}
      <main className="hero">
        <div className="row fade">
          <h1>Describe it.<em>Wear it.</em></h1>
          <div className="side">
            <Orb size={170} state={state} level={voice.level} />
            <p className="lede">Tell us the garment you have in mind, by typing or speaking, in English or Hinglish. Add pictures you love. You get a design your tailor can cut from, and where to buy something close.</p>
          </div>
        </div>
        <div className="brief">
          <Line onSend={send} voice={voice} autoFocus label="Your brief" />
          <div className="tries">
            {SUGGESTIONS.map((x) => <button key={x} onClick={() => send(x)}>{x}</button>)}
            <button className="alt" onClick={() => setView("board")}>Start from pictures instead</button>
          </div>
        </div>
      </main>
    </>
  );

  return (
    <>
      {header}
      <div className="fitting">
        <section className="dialogue" aria-live="polite">
          {msgs.map((x, i) => x.role === "me" ? <Said key={i} m={x} /> : (
            <div className="reply" key={i}>
              <Silk size={44} state={i === msgs.length - 1 ? state : "idle"} />
              <div>
                <p>{x.text}</p>
                {x.note && <div className="aside">{x.note}</div>}
                {x.questions.slice(0, 2).map((q) => (
                  <div className="ask" key={q.slot}>
                    <div className="q">{q.text}</div>
                    <div className="opts">{q.options.map((o) => <button key={o} className="opt" onClick={() => pick(q, o)}>{q.labels?.[o] ?? nice(o)}</button>)}</div>
                  </div>
                ))}
                {i === msgs.length - 1 && spec.slots.garment && (questions(spec).length === 0
                  ? <Finale spec={spec} onSheet={() => setView("sheet")} onShop={() => setView("shop")} />
                  : (
                    <div className="next">
                      <button onClick={() => setView("board")}>Add pictures</button>
                      <button onClick={() => setView("shop")}>Ideas and shopping</button>
                    </div>
                  ))}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </section>
        <Order spec={spec} onEdit={edit} />
      </div>
      <div className="dock"><div className="wrap">{voice.live && <Orb size={52} state="listening" level={voice.level} />}<div className="grow"><Line onSend={send} voice={voice} /></div></div></div>
    </>
  );
}
