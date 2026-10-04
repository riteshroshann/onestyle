"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ONTO, Span, correctTranscript } from "../lib/engine/lexicon";
import { Measurements, advice, finished, links, phrase, sheetLines } from "../lib/engine/describe";
import { Question, Spec, Update, answer, apply, bind, depthInches, emptySpec, questions } from "../lib/engine/spec";
import { isCommonWord, loadTagger, tag } from "../lib/models";
import { understand } from "../lib/understand";

const Board = dynamic(() => import("./Board"), { ssr: false });

type Msg =
  | { role: "me"; text: string; tokens: string[]; spans: Span[] }
  | { role: "bot"; text: string; questions: Question[]; note?: string };
type View = "fitting" | "board" | "sheet" | "shop";

const SUGGESTIONS = [
  "A pastel blue kurti for my farewell, fitted at the waist, flowy below",
  "Lehenga chahiye shaadi ke liye, maroon, gota patti, ghera bahut zyada",
  "A saree blouse with a deep back, puff sleeves and no sequins",
];
const SLOT_TAG: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "neckline.depth": "DIM", "back.depth": "DIM", "sleeve.style": "SLEEVE",
  "sleeve.length": "LENGTH", "sleeve.fit": "FIT", "bodice.fit": "FIT", "lower.fit": "FIT", "lower.silhouette": "SILHOUETTE",
  "garment.length": "LENGTH", fabric: "FABRIC", colour: "COLOUR", shade: "SHADE", pattern: "PATTERN", embellishment: "EMBELL",
  occasion: "OCCASION", style: "STYLE", components: "GARMENT",
};
const ROWS: [string, string][] = [
  ["garment", "Garment"], ["components", "Pieces"], ["neckline.shape", "Neckline"], ["neckline.depth", "Neck depth"], ["back.depth", "Back"],
  ["sleeve.style", "Sleeve"], ["sleeve.length", "Sleeve length"], ["bodice.fit", "Bodice"], ["lower.fit", "Below the waist"],
  ["lower.silhouette", "Silhouette"], ["garment.length", "Length"], ["fabric", "Fabric"], ["colour", "Colour"], ["shade", "Shade"],
  ["pattern", "Print"], ["embellishment", "Finish"], ["occasion", "Occasion"], ["style", "Mood"],
];
const SOURCE: Record<string, string> = { model: "your words", words: "your words", note: "a note on your board", image: "your pictures", answer: "your answer", edit: "your edit", profile: "your profile" };
const LIST_SLOTS = ["colour", "embellishment", "style", "pattern", "occasion", "shade", "components"];
const NICE: Record<string, string> = { v: "V", "deep v": "deep V", u: "U", "a-line": "A-line", trousers: "pants", crew: "crew neck", hooded: "hooded", turtle: "turtle neck" };
const nice = (v: string) => NICE[v] ?? v;

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

const Mic = () => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
const Send = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>);

function Line({ onSend, voice, autoFocus, label }: { onSend: (t: string) => void; voice: ReturnType<typeof useVoice>; autoFocus?: boolean; label?: string }) {
  const [text, setText] = useState("");
  const send = () => { const t = text.trim(); if (t) { onSend(t); setText(""); } };
  return (
    <div>
      {label && <label htmlFor="brief">{label}</label>}
      <div className="field">
        <input id={label ? "brief" : undefined} value={voice.live ? voice.interim : text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocus}
          onKeyDown={(e) => e.key === "Enter" && send()} readOnly={voice.live}
          placeholder={voice.live ? "" : "A pastel blue kurti for my farewell"} aria-label="Describe the garment" />
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
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (const s of m.spans) {
    if (s.start > i) parts.push(m.tokens.slice(i, s.start).join(" ") + " ");
    parts.push(<span key={s.start} className="stitch" title={s.value ? `Understood as ${s.value}` : "Noted"}>{m.tokens.slice(s.start, s.end).join(" ")}</span>, " ");
    i = s.end;
  }
  if (i < m.tokens.length) parts.push(m.tokens.slice(i).join(" "));
  return <div className="said"><span className="who">You</span>{m.spans.length ? parts : m.text}</div>;
}

function Order({ spec, onEdit }: { spec: Spec; onEdit: (slot: string, value: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const rows = ROWS.filter(([slot]) => spec.slots[slot] || spec.lists[slot]?.length || spec.excluded.some((e) => e.slot === slot));
  return (
    <aside className="order" aria-label="Your order">
      <h2>{spec.slots.garment ? spec.slots.garment.value[0].toUpperCase() + spec.slots.garment.value.slice(1) : "Your order"}</h2>
      <div className="meta">{rows.length ? `Draft ${spec.version}. Select any detail to change it.` : ""}</div>
      {!rows.length && <div className="empty">Each detail you mention settles here, part by part, with where it came from.</div>}
      <dl>
        {rows.map(([slot, label]) => {
          const v = spec.slots[slot];
          const list = spec.lists[slot] ?? [];
          const ex = spec.excluded.filter((e) => e.slot === slot);
          const options = Object.keys(ONTO.lexicon[SLOT_TAG[slot]] ?? {});
          return (
            <div key={slot} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>
                {editing === slot ? (
                  <select autoFocus defaultValue={v?.value ?? ""} onBlur={() => setEditing(null)} onChange={(e) => { onEdit(slot, e.target.value); setEditing(null); }}>
                    <option value="" disabled>Choose</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <>
                    {v && <button onClick={() => setEditing(slot)}>{slot.endsWith(".depth") && depthInches(v) ? `${depthInches(v)} in` : `${v.intensity === "slight" ? "slightly " : v.intensity === "strong" ? "very " : ""}${nice(v.value)}`}<small>from {SOURCE[v.src] ?? v.src}</small></button>}
                    {list.length > 0 && <button onClick={() => setEditing(slot)}>{list.map((x) => nice(x.value)).join(", ")}<small>from {[...new Set(list.map((x) => SOURCE[x.src] ?? x.src))].join(" and ")}</small></button>}
                    {ex.map((x) => <span key={x.value} className="no" title={x.evidence}>{x.value}</span>)}
                  </>
                )}
              </dd>
            </div>
          );
        })}
        {(spec.notes?.length ?? 0) > 0 && (<><dt>Notes</dt><dd>{spec.notes!.join("; ")}<small>for your tailor</small></dd></>)}
        {spec.comparisons.length > 0 && (<><dt>Compared</dt><dd>{spec.comparisons.map((c) => `${c.slot.split(".")[0]} ${c.cmp === "more" ? "beyond" : c.cmp === "less" ? "within" : "like"} ${c.ref}`).join("; ")}<small>set it on the moodboard</small></dd></>)}
      </dl>
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
        <h3>{spec.slots.garment ? spec.slots.garment.value[0].toUpperCase() + spec.slots.garment.value.slice(1) : "Garment"}</h3>
        <div className="meta">Draft {spec.version}, {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. {phrase(spec)}.</div>
        {lines.length ? (
          <table><tbody>{lines.map((l) => <tr key={l.part}><td>{l.part}</td><td className={hi ? "hi" : ""}>{hi ? l.hi : l.en}</td><td className="from">{l.from}</td></tr>)}</tbody></table>
        ) : <p style={{ color: "#76736e" }}>Describe the garment first; its instructions appear here.</p>}
        <h4>Measurements in inches</h4>
        <div className="meas">{field("bust", "Bust")}{field("waist", "Waist")}{field("hip", "Hip")}{field("shoulder", "Shoulder")}{field("length", "Length")}{field("sleeve", "Sleeve")}</div>
        {(f.bust || f.waist || f.hip) && <div className="finished">Finished garment: {[f.bust && `bust ${f.bust} in`, f.waist && `waist ${f.waist} in`, f.hip && `hip ${f.hip} in`].filter(Boolean).join(", ")}.</div>}
      </div>
    </main>
  );
}

function ShopView({ spec }: { spec: Spec }) {
  const L = links(spec);
  const q = (url: string) => decodeURIComponent(url.split(/[?&](?:q|k|text|rawQuery)=/)[1]?.split("&")[0] ?? "");
  return (
    <main className="page">
      <h2>Ideas and shopping</h2>
      <p className="lede">Searches written from your design. Look for ideas, buy something close ready-made, or find the fabric and a tailor to have it made. Each opens on the shop's own site.</p>
      <section className="index"><h3>Ideas on Pinterest</h3><ul>{L.pinterest.map((p) => <li key={p.url}><a href={p.url} target="_blank" rel="noreferrer">{p.label}<span>Pinterest</span></a></li>)}</ul></section>
      <section className="index"><h3>Buy ready-made</h3><ul>{L.shops.map((p) => <li key={p.label}><a href={p.url} target="_blank" rel="noreferrer">{q(p.url) || "Search"}<span>{p.label}</span></a></li>)}</ul></section>
      {L.fabric.length > 0 && <section className="index"><h3>The fabric</h3><ul>{L.fabric.map((p) => <li key={p.url}><a href={p.url} target="_blank" rel="noreferrer">{p.label}<span>by the metre</span></a></li>)}</ul></section>}
      <section className="index"><h3>Have it made</h3><ul><li><a href={L.tailors.url} target="_blank" rel="noreferrer">Tailors and boutiques near you<span>Maps</span></a></li></ul></section>
    </main>
  );
}

// ------------------------------------------------------------------ app
export default function App() {
  const [view, setView] = useState<View>("fitting");
  const [spec, setSpec] = useState<Spec>(() => load("bespoke.spec", emptySpec()));
  const [msgs, setMsgs] = useState<Msg[]>(() => load("bespoke.msgs", []));
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
      : got ? `${phrase(next)[0].toUpperCase()}${phrase(next).slice(1)}.` : "Noted.";
    setMsgs((x) => [...x, { role: "bot", text, questions: questions(next), note: note ?? (advice(next) || undefined) }]);
  }, []);

  const send = useCallback(async (text: string) => {
    setThinking(true);
    // the language model (when configured) and the on-device engine run together; the device answers alone if the model cannot
    const second = understand(text, spec);
    const { tokens, spans } = await tag(text);
    const ups = bind(tokens, spans, "words");
    setMsgs((x) => [...x, { role: "me", text, tokens, spans }]);
    const model = await second;
    const all = model?.length ? [...ups, ...model] : ups;
    const next = apply(spec, all);
    setSpec(next);
    reply(next, all);
    setThinking(false);
  }, [spec, reply]);

  const voice = useVoice(useCallback((t: string) => { void send(correctTranscript(t, isCommonWord)); }, [send]));

  const pick = (q: Question, v: string) => {
    const ups = answer(q.slot, v);
    const next = apply(spec, ups);
    setSpec(next);
    setMsgs((x) => [...x, { role: "me", text: v, tokens: [v], spans: [] }]);
    reply(next, ups);
  };
  const edit = (slot: string, value: string) =>
    setSpec(apply(spec, [{ op: LIST_SLOTS.includes(slot) ? "add" : "set", slot, value: { value, p: 1, src: "edit", evidence: "edited" } }]));
  const fromBoard = (ups: Update[], note: string) => { const next = apply(spec, ups); setSpec(next); reply(next, ups, note); setView("fitting"); };
  const reset = () => { setSpec(emptySpec()); setMsgs([]); setView("fitting"); };

  const started = msgs.length > 0;
  const state = voice.live ? "listening" : thinking ? "thinking" : "idle";
  const NAV: [View, string][] = [["fitting", "Conversation"], ["board", "Moodboard"], ["sheet", "Tailor sheet"], ["shop", "Shop"]];
  const header = (
    <header className="top"><div className="inner">
      <button className="mark" onClick={reset} aria-label="Bespoke, start again">Bespoke</button>
      {(started || view !== "fitting") && (
        <nav className="nav">{NAV.map(([v, l]) => <button key={v} aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{l}</button>)}</nav>
      )}
    </div></header>
  );

  if (view === "board") return (<>{header}<Board onEvidence={fromBoard} comparisons={spec.comparisons} /></>);
  if (view === "sheet") return (<>{header}<SheetView spec={spec} m={m} setM={setM} /></>);
  if (view === "shop") return (<>{header}<ShopView spec={spec} /></>);

  if (!started) return (
    <>
      {header}
      <main className="hero">
        <div className="row fade">
          <h1>Describe it.<em>Wear it.</em></h1>
          <div className="side">
            <Silk size={150} state={state} level={voice.level} />
            <p className="lede">Tell us the garment you have in mind, by typing or speaking, in English or Hinglish. Add pictures you love. You get a design your tailor can cut from, and where to buy something close.</p>
          </div>
        </div>
        <div className="brief">
          <Line onSend={send} voice={voice} autoFocus label="Your brief" />
          <div className="tries">
            {SUGGESTIONS.slice(1).map((x) => <button key={x} onClick={() => send(x)}>{x}</button>)}
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
                    <div className="opts">{q.options.map((o) => <button key={o} className="opt" onClick={() => pick(q, o)}>{q.labels?.[o] ?? o}</button>)}</div>
                  </div>
                ))}
                {i === msgs.length - 1 && spec.slots.garment && (
                  <div className="next">
                    <button onClick={() => setView("board")}>Add pictures</button>
                    <button onClick={() => setView("sheet")}>See the tailor sheet</button>
                    <button onClick={() => setView("shop")}>Ideas and shopping</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </section>
        <Order spec={spec} onEdit={edit} />
      </div>
      <div className="dock"><div className="wrap">{voice.live && <Silk size={40} state="listening" level={voice.level} />}<div><Line onSend={send} voice={voice} /></div></div></div>
    </>
  );
}
