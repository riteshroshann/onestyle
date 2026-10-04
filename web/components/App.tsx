"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ONTO, Span } from "../lib/engine/lexicon";
import { Measurements, finished, links, phrase, sheetLines } from "../lib/engine/describe";
import { Question, Spec, Update, answer, apply, bind, emptySpec, questions } from "../lib/engine/spec";
import { TaggerState, loadTagger, tag } from "../lib/models";

const Board = dynamic(() => import("./Board"), { ssr: false });

type Msg =
  | { role: "me"; text: string; tokens: string[]; spans: Span[] }
  | { role: "bot"; text: string; questions: Question[]; note?: string };
type Tab = "talk" | "board" | "sheet" | "shop";

const EXAMPLES = [
  "A pastel blue kurti for my farewell, fitted at the waist, flowy below, not too flashy",
  "lehenga chahiye shaadi ke liye, maroon, gota patti, ghera bahut zyada",
  "saree blouse, deep back, puff sleeves, no sequins",
  "something elegant in black for a reception, floor length, off shoulder",
];
const TAG_COLOUR: Record<string, string> = {
  GARMENT: "var(--peach)", PART: "var(--line)", LOC: "var(--line)", FIT: "var(--mint)", SILHOUETTE: "var(--mint)", LENGTH: "var(--sky)",
  NECKLINE: "var(--lav)", SLEEVE: "var(--lav)", DIM: "var(--lav)", COLOUR: "var(--rose)", SHADE: "var(--rose)", FABRIC: "var(--sky)",
  PATTERN: "var(--sky)", EMBELL: "var(--peach)", OCCASION: "var(--mint)", STYLE: "var(--mint)", INT: "var(--line)", NEG: "#f3b0a8",
  CMP: "var(--line)", REF: "var(--line)", NUM: "var(--sky)",
};
const SLOT_TAG: Record<string, string> = {
  garment: "GARMENT", "neckline.shape": "NECKLINE", "neckline.depth": "DIM", "back.depth": "DIM", "sleeve.style": "SLEEVE",
  "sleeve.length": "LENGTH", "sleeve.fit": "FIT", "bodice.fit": "FIT", "lower.fit": "FIT", "lower.silhouette": "SILHOUETTE",
  "garment.length": "LENGTH", fabric: "FABRIC", colour: "COLOUR", shade: "SHADE", pattern: "PATTERN", embellishment: "EMBELL",
  occasion: "OCCASION", style: "STYLE",
};
const ROWS: [string, string][] = [
  ["garment", "garment"], ["neckline.shape", "neckline"], ["neckline.depth", "neck depth"], ["back.depth", "back"],
  ["sleeve.style", "sleeve"], ["sleeve.length", "sleeve length"], ["bodice.fit", "bodice fit"], ["lower.fit", "lower fit"],
  ["lower.silhouette", "silhouette"], ["garment.length", "length"], ["fabric", "fabric"], ["colour", "colour"], ["shade", "shade"],
  ["pattern", "pattern"], ["embellishment", "finish"], ["occasion", "occasion"], ["style", "style"],
];

function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }

export function Blob({ size = 220, state = "idle", level = 0 }: { size?: number; state?: string; level?: number }) {
  return (
    <div className="blob" data-state={state} style={{ ["--size" as any]: `${size}px`, ["--level" as any]: level }} aria-hidden>
      <i /><i /><i /><i />
    </div>
  );
}

// ------------------------------------------------------------------ voice
function useVoice(onFinal: (t: string) => void) {
  const [live, setLive] = useState(false);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const rec = useRef<any>(null);
  const stopMeter = useRef<() => void>(() => {});
  const SR = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  const stop = useCallback(() => { rec.current?.stop(); stopMeter.current(); setLive(false); setLevel(0); }, []);
  const start = useCallback(async () => {
    if (!SR) return;
    const r = new SR();
    r.lang = lang; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => {
      let fin = "", mid = "";
      for (const res of e.results) (res.isFinal ? (fin += res[0].transcript) : (mid += res[0].transcript));
      setInterim(mid);
      if (fin) { setInterim(""); onFinal(fin); }
    };
    r.onend = () => { stopMeter.current(); setLive(false); setLevel(0); };
    r.onerror = () => { stopMeter.current(); setLive(false); };
    rec.current = r;
    r.start();
    setLive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let raf = 0;
      const tick = () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2; setLevel(Math.min(1, Math.sqrt(s / buf.length) * 4)); raf = requestAnimationFrame(tick); };
      tick();
      stopMeter.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
    } catch { /* level meter is decoration */ }
  }, [SR, lang, onFinal]);
  return { supported: !!SR, live, interim, level, lang, setLang, start, stop };
}

const Mic = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>);
const Arrow = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>);

function Composer({ onSend, voice, big }: { onSend: (t: string) => void; voice: ReturnType<typeof useVoice>; big?: boolean }) {
  const [text, setText] = useState("");
  const send = () => { const t = text.trim(); if (t) { onSend(t); setText(""); } };
  return (
    <div className="composer" style={big ? { padding: "10px 10px 10px 26px" } : undefined}>
      <input value={voice.live ? voice.interim || "Listening…" : text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Describe what you wish to wear…" aria-label="Describe the garment" />
      {voice.supported && (
        <button className="lang" onClick={() => voice.setLang(voice.lang === "en-IN" ? "hi-IN" : "en-IN")} title="Speech language">
          {voice.lang === "en-IN" ? "EN" : "हिं"}
        </button>
      )}
      {voice.supported && (
        <button className={`iconbtn ${voice.live ? "live" : ""}`} onClick={() => (voice.live ? voice.stop() : voice.start())} aria-label="Speak"><Mic /></button>
      )}
      <button className="iconbtn primary" onClick={send} aria-label="Send"><Arrow /></button>
    </div>
  );
}

function Highlight({ m }: { m: Extract<Msg, { role: "me" }> }) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  for (const s of m.spans) {
    if (s.start > i) parts.push(m.tokens.slice(i, s.start).join(" ") + " ");
    parts.push(<span key={s.start} className="span" title={`${s.tag}${s.value ? ` → ${s.value}` : ""}`} style={{ background: TAG_COLOUR[s.tag] }}>{m.tokens.slice(s.start, s.end).join(" ")}</span>, " ");
    i = s.end;
  }
  if (i < m.tokens.length) parts.push(m.tokens.slice(i).join(" "));
  return <div className="me">{parts}</div>;
}

function SpecPanel({ spec, onEdit }: { spec: Spec; onEdit: (slot: string, value: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const filled = ROWS.filter(([slot]) => spec.slots[slot] || spec.lists[slot]?.length || spec.excluded.some((e) => e.slot === slot));
  return (
    <aside className="panel">
      <h2>Your design</h2>
      <div className="sub">version {spec.version} · tap a value to change it</div>
      {!filled.length && <div className="empty">As you talk, the garment takes shape here, part by part, with where each detail came from.</div>}
      {filled.map(([slot, label]) => {
        const v = spec.slots[slot];
        const list = spec.lists[slot] ?? [];
        const ex = spec.excluded.filter((e) => e.slot === slot);
        const options = Object.keys(ONTO.lexicon[SLOT_TAG[slot]] ?? {});
        return (
          <div className="row" key={slot}>
            <div className="k">{label}</div>
            <div className="v">
              {editing === slot ? (
                <select className="val" autoFocus defaultValue={v?.value ?? ""} onBlur={() => setEditing(null)}
                  onChange={(e) => { onEdit(slot, e.target.value); setEditing(null); }}>
                  <option value="" disabled>choose</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <>
                  {v && <button className="val" onClick={() => setEditing(slot)} title={`${v.src}: “${v.evidence}”`}>{v.value}{v.intensity && <small>{v.intensity}</small>}<small>{v.src}</small></button>}
                  {list.map((x) => <button key={x.value} className="val" onClick={() => setEditing(slot)} title={`${x.src}: “${x.evidence}”`}>{x.value}<small>{x.src}</small></button>)}
                  {ex.map((x) => <span key={x.value} className="val excl" title={x.evidence}>{x.value}</span>)}
                </>
              )}
            </div>
          </div>
        );
      })}
      {spec.comparisons.length > 0 && (
        <div className="row"><div className="k">compared</div><div className="v">{spec.comparisons.map((c, i) => <span key={i} className="val ask">{c.slot.split(".")[0]} {c.cmp} {c.ref}</span>)}</div></div>
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
    <div className="page">
      <h2 className="noprint">Tailor sheet</h2>
      <p className="lede noprint">What the tailor cuts from. Every instruction says where it came from, so the tailor knows what is the customer's word and what is a guess. Ease values are starting defaults to be confirmed with your tailor.</p>
      <div className="noprint" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <button className="btn light" onClick={() => setHi(!hi)}>{hi ? "Show English" : "हिंदी में दिखाएँ"}</button>
        <button className="btn" onClick={() => window.print()}>Print or save PDF</button>
      </div>
      <div className="sheet">
        <h3>{spec.slots.garment ? spec.slots.garment.value[0].toUpperCase() + spec.slots.garment.value.slice(1) : "Garment"}</h3>
        <div className="meta">spec v{spec.version} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {phrase(spec)}</div>
        <table><tbody>
          {lines.map((l) => (
            <tr key={l.part}><td>{l.part}</td><td className={hi ? "hi" : ""}>{hi ? l.hi : l.en}</td><td className="from">{l.from}</td></tr>
          ))}
        </tbody></table>
        <div className="section" style={{ color: "#8a8378" }}>Measurements, inches</div>
        <div className="meas">{field("bust", "bust")}{field("waist", "waist")}{field("hip", "hip")}{field("shoulder", "shoulder")}{field("length", "length")}{field("sleeve", "sleeve")}</div>
        {(f.bust || f.waist || f.hip) && <div style={{ fontSize: 13, color: "#8a8378" }}>Finished garment: {f.bust ? `bust ${f.bust} in` : ""} {f.waist ? `· waist ${f.waist} in` : ""} {f.hip ? `· hip ${f.hip} in` : ""}</div>}
      </div>
    </div>
  );
}

function ShopView({ spec }: { spec: Spec }) {
  const L = links(spec);
  return (
    <div className="page">
      <h2>Inspire and shop</h2>
      <p className="lede">Searches built from your design: ideas on Pinterest, similar pieces to buy ready-made, the fabric if you are having it made, and tailors near you. Links open the search; nothing is copied or stored.</p>
      <div className="section">Ideas on Pinterest</div>
      <div className="grid">{L.pinterest.map((p) => <a className="card" key={p.url} href={p.url} target="_blank" rel="noreferrer"><b>{p.label}</b><span>Pinterest search</span></a>)}</div>
      <div className="section">Buy something close</div>
      <div className="grid">{L.shops.map((p) => <a className="card" key={p.label} href={p.url} target="_blank" rel="noreferrer"><b>{p.label}</b><span>{spec.slots.garment ? `“${p.url.length ? decodeURIComponent(p.url.split(/[?=]/).pop() ?? "") : ""}”` : "search"}</span></a>)}</div>
      {L.fabric.length > 0 && (<><div className="section">Fabric</div><div className="grid">{L.fabric.map((p) => <a className="card" key={p.url} href={p.url} target="_blank" rel="noreferrer"><b>{p.label}</b><span>by the metre</span></a>)}</div></>)}
      <div className="section">Have it made</div>
      <div className="grid"><a className="card" href={L.tailors.url} target="_blank" rel="noreferrer"><b>{L.tailors.label}</b><span>Take the tailor sheet with you</span></a></div>
    </div>
  );
}

// ------------------------------------------------------------------ app
export default function App() {
  const [tab, setTab] = useState<Tab>("talk");
  const [spec, setSpec] = useState<Spec>(() => load("bespoke.spec", emptySpec()));
  const [msgs, setMsgs] = useState<Msg[]>(() => load("bespoke.msgs", []));
  const [m, setM] = useState<Measurements>(() => load("bespoke.meas", {}));
  const [thinking, setThinking] = useState(false);
  const [tagger, setTagger] = useState<TaggerState>("rules");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadTagger(setTagger); }, []);
  useEffect(() => { save("bespoke.spec", spec); save("bespoke.msgs", msgs); save("bespoke.meas", m); }, [spec, msgs, m]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const reply = useCallback((next: Spec, ups: Update[], note?: string) => {
    const qs = questions(next);
    const got = ups.filter((u) => u.op !== "compare").length;
    const text = !next.slots.garment && !got ? "Tell me a little more: what are we making, and for what occasion?"
      : got ? `So far: ${phrase(next)}.` : "Noted.";
    setMsgs((x) => [...x, { role: "bot", text, questions: qs, note }]);
  }, []);

  const send = useCallback(async (text: string) => {
    setThinking(true);
    const { tokens, spans } = await tag(text);
    const ups = bind(tokens, spans, "words");
    setMsgs((x) => [...x, { role: "me", text, tokens, spans }]);
    const next = apply(spec, ups);
    setSpec(next);
    setTimeout(() => { reply(next, ups); setThinking(false); }, 350);
  }, [spec, reply]);

  const voice = useVoice(useCallback((t: string) => { void send(t); }, [send]));

  const pick = (q: Question, v: string) => {
    const next = apply(spec, answer(q.slot, v));
    setSpec(next);
    setMsgs((x) => [...x, { role: "me", text: v, tokens: [v], spans: [] }]);
    reply(next, answer(q.slot, v));
  };
  const edit = (slot: string, value: string) => setSpec(apply(spec, [{ op: ["colour", "embellishment", "style", "pattern", "occasion", "shade"].includes(slot) ? "add" : "set", slot, value: { value, p: 1, src: "edit", evidence: "edited" } }]));
  const fromBoard = (ups: Update[], note: string) => { const next = apply(spec, ups); setSpec(next); reply(next, ups, note); setTab("talk"); };
  const reset = () => { setSpec(emptySpec()); setMsgs([]); setTab("talk"); };

  const started = msgs.length > 0;
  const state = voice.live ? "listening" : thinking ? "thinking" : "idle";
  const header = useMemo(() => (
    <header className="top">
      <button className="mark" onClick={reset} title="Start over"><Blob size={22} state={state} />bespoke</button>
      {(started || tab !== "talk") && (
        <nav className="tabs">
          {(["talk", "board", "sheet", "shop"] as Tab[]).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
      )}
      <div className="status" title="The request tagger runs in your browser">
        <span className={`dot ${tagger === "bert" ? "on" : ""}`} />{tagger === "bert" ? "on-device BERT tagger" : tagger === "loading" ? "loading tagger…" : "gazetteer tagger"}
      </div>
    </header>
  ), [tab, started, tagger, state]);

  if (tab === "board") return (<>{header}<Board onEvidence={fromBoard} comparisons={spec.comparisons} /></>);
  if (tab === "sheet") return (<>{header}<SheetView spec={spec} m={m} setM={setM} /></>);
  if (tab === "shop") return (<>{header}<ShopView spec={spec} /></>);

  if (!started) return (
    <>
      {header}
      <main className="hero">
        <Blob size={230} state={state} level={voice.level} />
        <h1>Describe what<br />you wish to wear.</h1>
        <p>Type or speak, in English or Hinglish. Pin inspiration on the board. Bespoke turns it into a design your tailor can make.</p>
        <Composer onSend={send} voice={voice} big />
        <div className="chips">
          {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}
          <button className="chip ghost" onClick={() => setTab("board")}>Start with a moodboard</button>
        </div>
      </main>
    </>
  );

  return (
    <>
      {header}
      <div className="room">
        <section className="thread">
          <div className="msgs">
            {msgs.map((x, i) => x.role === "me" ? <Highlight key={i} m={x} /> : (
              <div className="bot" key={i}>
                <div className="mini"><Blob size={30} state={i === msgs.length - 1 ? state : "idle"} /></div>
                <div className="text">
                  <p>{x.text}</p>
                  {x.note && <p style={{ color: "var(--muted)", fontSize: 13 }}>{x.note}</p>}
                  {x.questions.slice(0, 2).map((q) => (
                    <div className="q" key={q.slot}>
                      <div className="label">{q.text}</div>
                      <div className="chips" style={{ justifyContent: "flex-start" }}>{q.options.map((o) => <button key={o} className="chip" onClick={() => pick(q, o)}>{o}</button>)}</div>
                    </div>
                  ))}
                  {i === msgs.length - 1 && spec.slots.garment && (
                    <div className="chips" style={{ justifyContent: "flex-start", marginTop: 14 }}>
                      <button className="chip ghost" onClick={() => setTab("board")}>Add a moodboard</button>
                      <button className="chip ghost" onClick={() => setTab("sheet")}>Tailor sheet</button>
                      <button className="chip ghost" onClick={() => setTab("shop")}>Ideas and shopping</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="dock">
            {voice.live && <Blob size={46} state="listening" level={voice.level} />}
            <Composer onSend={send} voice={voice} />
          </div>
        </section>
        <SpecPanel spec={spec} onEdit={edit} />
      </div>
    </>
  );
}
