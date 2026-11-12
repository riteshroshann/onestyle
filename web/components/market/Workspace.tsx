"use client";
// The inbox, for both sides of a request: conversations on the left, the open thread on the right, the design pinned on top.
// On a phone the list and the thread are two screens.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStore, MarketError, MISSING_OPTIONS, missingLabel, QUICK_REPLIES, STATUSES, STATUS_LABEL } from "@/lib/market";
import type { DesignRequest, Message, Profile, RequestStatus } from "@/lib/market";
import { cn } from "@/lib/utils";
import { Cta } from "../site/Cta";
import { Header } from "../site/Header";
import { Dots, SPRING } from "../site/Motion";
import { Avatar, Count } from "./Avatar";
import { Composer } from "./Composer";
import type { ComposerHandle } from "./Composer";
import { DesignSummary } from "./DesignSummary";
import { useAlerts } from "./Notifier";
import { OPEN_THREAD, setOpenThread, useInbox } from "./useInbox";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const DAY = 86_400_000;
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "9:41", "Tue" or "12 Nov": how long ago, as briefly as a list allows. */
function when(t: number): string {
  const days = (startOfDay(Date.now()) - startOfDay(t)) / DAY;
  if (days < 1) return clock(t);
  if (days < 7) return new Date(t).toLocaleDateString([], { weekday: "short" });
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}
function dayLabel(t: number): string {
  const days = (startOfDay(Date.now()) - startOfDay(t)) / DAY;
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return new Date(t).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}
const failed = (err: unknown, fallback: string) => (err instanceof MarketError ? err.message : fallback);
const otherName = (r: DesignRequest, me: Profile) => (me.id === r.makerId ? r.customerName : r.makerName);
const closed = (s: RequestStatus) => s === "ready" || s === "declined";

type Filter = "all" | "unread" | "open";
const FILTERS: [Filter, string][] = [["all", "All"], ["unread", "Unread"], ["open", "Open"]];

// ------------------------------------------------------------------ list
function Row({ r, me, active, onPick }: { r: DesignRequest; me: Profile; active: boolean; onPick: () => void }) {
  const who = otherName(r, me);
  const fresh = r.unread > 0;
  return (
    <motion.li layout="position" transition={SPRING}>
      <button type="button" onClick={onPick} aria-current={active} data-testid="thread-row"
        className="press flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-colors hover:bg-black/[.03] aria-[current=true]:bg-[#f2f3f5]">
        <Avatar name={who} ring={fresh} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[16px] font-medium tracking-[-0.01em]">{who}</span>
            <span className={cn("ml-auto shrink-0 text-[12px] tabular-nums", fresh ? "font-medium text-[#0284c7]" : "text-brand-ink/40")}>{when(r.updatedAt)}</span>
          </span>
          <span className="block truncate text-[13px] text-brand-ink/50">{cap(r.design.title)} · {STATUS_LABEL[r.status]}</span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[14px]", fresh ? "font-medium text-brand-ink" : "text-brand-ink/55")}>
              {r.lastMessage ?? (me.id === r.makerId ? "Sent you a design" : "Design sent")}
            </span>
            <Count n={r.unread} />
          </span>
        </span>
      </button>
    </motion.li>
  );
}

function EmptyList({ maker }: { maker: boolean }) {
  return (
    <div className="px-3 pb-10 pt-6">
      <p className="display text-[34px] leading-none">{maker ? "No requests yet." : "Nothing sent yet."}</p>
      <p className="mt-4 max-w-[32ch] text-[15px] leading-[1.55] text-brand-ink/55">
        {maker
          ? "When a customer sends you a design, it lands here with the full sheet and their measurements."
          : "Describe a garment in the studio, then send its sheet to a maker. Your conversation starts here."}
      </p>
      {!maker && <div className="mt-7"><Cta href="/studio/?new">Start a design</Cta></div>}
    </div>
  );
}

// ------------------------------------------------------------------ messages
function SystemNote({ m, maker }: { m: Message; maker: boolean }) {
  return (
    <motion.li layout="position" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} className="flex justify-center py-2">
      {m.kind === "missing" ? (
        <span className="max-w-[86%] rounded-[18px] bg-[#38bdf8]/10 px-4 py-2.5 text-center text-[14px] leading-snug text-[#075985]">
          <span className="block text-[12px] font-medium text-[#0369a1]/80">{maker ? "You asked for details" : `${m.senderName} needs a few details`}</span>
          {m.body}
        </span>
      ) : (
        <span className="text-[13px] text-brand-ink/45">{m.senderName} · {m.body}</span>
      )}
    </motion.li>
  );
}

function Bubble({ m, mine, first, last, pending }: { m: Message; mine: boolean; first: boolean; last: boolean; pending?: boolean }) {
  const still = !!useReducedMotion();
  return (
    <motion.li layout="position" initial={still ? false : { opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING}
      style={{ transformOrigin: mine ? "bottom right" : "bottom left" }} className={cn("flex flex-col", mine ? "items-end" : "items-start", first ? "mt-3" : "mt-0.5")}>
      <span data-testid="bubble" className={cn(
        "max-w-[min(82%,560px)] whitespace-pre-wrap break-words px-4 py-2.5 text-[15.5px] leading-[1.45]",
        mine ? "rounded-[22px] bg-brand-ink text-white" : "rounded-[22px] bg-[#f2f3f5] text-brand-ink",
        mine && !first && "rounded-tr-[8px]", mine && !last && "rounded-br-[8px]", mine && last && "rounded-br-[6px]",
        !mine && !first && "rounded-tl-[8px]", !mine && !last && "rounded-bl-[8px]", !mine && last && "rounded-bl-[6px]",
        pending && "opacity-60",
      )}>{m.body}</span>
      {last && <span className="mt-1 px-2 text-[11.5px] text-brand-ink/40">{pending ? "Sending" : clock(m.createdAt)}</span>}
    </motion.li>
  );
}

function Messages({ messages, me, maker, typing, otherName: who }: { messages: (Message & { pending?: boolean })[]; me: Profile; maker: boolean; typing: boolean; otherName: string }) {
  const end = useRef<HTMLDivElement>(null);
  const still = !!useReducedMotion();
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: still ? "auto" : "smooth" }); }, [messages.length, typing, still]);

  if (!messages.length && !typing) {
    return (
      <div className="grid flex-1 place-items-center px-8 text-center">
        <div>
          <p className="display text-[40px] text-brand-ink/25">Say hello.</p>
          <p className="mx-auto mt-3 max-w-[34ch] text-[15px] leading-[1.5] text-brand-ink/50">
            {maker ? `Introduce yourself to ${who}, or ask for anything the sheet does not say.` : `${who} has your sheet. Add anything it does not say.`}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-3 md:px-5">
      <ol aria-label="Conversation" aria-live="polite" className="flex flex-col pb-3 pt-2">
        {messages.map((m, i) => {
          const prev = messages[i - 1], next = messages[i + 1];
          const newDay = !prev || startOfDay(prev.createdAt) !== startOfDay(m.createdAt);
          const day = newDay && <li key={`d-${m.id}`} className="pb-1 pt-5 text-center text-[12px] font-medium text-brand-ink/40">{dayLabel(m.createdAt)}</li>;
          if (m.kind !== "text") return [day, <SystemNote key={m.id} m={m} maker={maker} />];
          const sameAs = (o?: Message) => !!o && o.kind === "text" && o.senderId === m.senderId && Math.abs(o.createdAt - m.createdAt) < 5 * 60_000;
          return [day, <Bubble key={m.id} m={m} mine={m.senderId === me.id} first={newDay || !sameAs(prev)} last={!sameAs(next)} pending={m.pending} />];
        })}
        <AnimatePresence>
          {typing && (
            <motion.li key="typing" initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING}
              style={{ transformOrigin: "bottom left" }} className="mt-3 flex" aria-label={`${who} is typing`}>
              <span className="rounded-[22px] rounded-bl-[6px] bg-[#f2f3f5] px-4 py-3"><Dots /></span>
            </motion.li>
          )}
        </AnimatePresence>
      </ol>
      <div ref={end} />
    </div>
  );
}

// ------------------------------------------------------------------ maker controls
function StatusMenu({ request, onPick, onFlag }: { request: DesignRequest; onPick: (s: RequestStatus) => void; onFlag: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Status: ${STATUS_LABEL[request.status]}`}
        className="press inline-flex h-10 items-center gap-2 rounded-full bg-brand-ink px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#232c3b]">
        {STATUS_LABEL[request.status]}
        <svg viewBox="0 0 24 24" className={cn("size-4 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" aria-label="Set status" initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={SPRING} style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-12 z-30 w-[220px] rounded-[22px] bg-white/90 p-1.5 shadow-[0_24px_60px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl">
            {STATUSES.map((s) => (
              <button key={s} type="button" role="menuitemradio" aria-checked={s === request.status} onClick={() => { setOpen(false); if (s !== request.status) onPick(s); }}
                className="flex w-full items-center gap-3 rounded-[16px] px-4 py-2.5 text-left text-[15px] text-brand-ink transition-colors hover:bg-black/[.04]">
                <span className={cn("size-2 rounded-full", s === request.status ? "bg-[#38bdf8]" : "bg-transparent")} />
                {STATUS_LABEL[s]}
              </button>
            ))}
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onFlag(); }}
              className="mt-1 flex w-full items-center gap-3 rounded-[16px] border-t border-brand-ink/[.06] px-4 py-2.5 text-left text-[15px] text-brand-ink transition-colors hover:bg-black/[.04] sm:hidden">
              <span className="size-2" />
              Flag missing details
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AskDetails({ request, onDone }: { request: DesignRequest; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>(request.missing);
  const [error, setError] = useState("");
  const toggle = (slot: string) => setPicked((p) => (p.includes(slot) ? p.filter((s) => s !== slot) : [...p, slot]));
  const save = async () => {
    try { await getStore().setMissing(request.id, picked, ""); onDone(); }
    catch (err) { setError(failed(err, "That did not save. Try again.")); }
  };
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
      <div className="px-5 pb-5 pt-1 md:px-7">
        <p className="text-[15px] font-medium">What is missing from the sheet?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MISSING_OPTIONS.map((o) => (
            <motion.button key={o.slot} type="button" aria-pressed={picked.includes(o.slot)} onClick={() => toggle(o.slot)} whileTap={{ scale: 0.95 }}
              className="h-9 rounded-full px-4 text-[14px] ring-1 ring-brand-ink/12 transition-colors hover:bg-brand-ink/[.04] aria-pressed:bg-brand-ink aria-pressed:text-white aria-pressed:ring-brand-ink">
              {o.label}
            </motion.button>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 text-[14px] text-[#b5121b]">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={save} className="press h-10 rounded-full bg-brand-ink px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#232c3b]">
            {picked.length ? `Ask for ${picked.length === 1 ? "it" : `these ${picked.length}`}` : "Nothing is missing"}
          </button>
          <button type="button" onClick={onDone} className="press h-10 rounded-full px-5 text-[14px] font-medium ring-1 ring-brand-ink/12 transition-colors hover:bg-brand-ink/[.04]">Cancel</button>
        </div>
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ thread
type Shown = Message & { pending?: boolean };
const TYPING_FOR = 4000;
const TYPING_EVERY = 2500;

function Thread({ request, me, onBack }: { request: DesignRequest; me: Profile; onBack: () => void }) {
  const maker = me.id === request.makerId;
  const who = otherName(request, me);
  const otherId = maker ? request.customerId : request.makerId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Shown[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [typing, setTyping] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTyped = useRef(0);

  // the request's activity time moves with every message, so it is the cue to reload
  useEffect(() => {
    let live = true;
    getStore().messages(request.id).then((m) => { if (live) setMessages(m); }).catch(() => {});
    return () => { live = false; };
  }, [request.id, request.updatedAt]);

  // a message from them ends their typing
  useEffect(() => { if (messages.at(-1)?.senderId === otherId) setTyping(false); }, [messages, otherId]);

  useEffect(() => {
    setOpenThread(request.id);
    return () => setOpenThread(null);
  }, [request.id]);

  // read only what is on screen: a thread open in a background tab stays unread until the tab is looked at
  useEffect(() => {
    const read = () => { if (request.unread > 0 && document.visibilityState === "visible") void getStore().markRead(request.id).catch(() => {}); };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [request.id, request.unread]);

  useEffect(() => getStore().onTyping(request.id, (from) => {
    if (from !== otherId) return;
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), TYPING_FOR);
  }), [request.id, otherId]);
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  const write = (v: string) => {
    setDraft(v);
    if (v.trim() && Date.now() - lastTyped.current > TYPING_EVERY) { lastTyped.current = Date.now(); getStore().typing(request.id); }
  };

  const send = async () => {
    const body = draft;
    const temp: Shown = { id: `pending-${Date.now()}`, requestId: request.id, senderId: me.id, senderName: me.name, kind: "text", body: body.trim(), createdAt: Date.now(), pending: true };
    setPending((p) => [...p, temp]);
    setDraft("");
    setError("");
    lastTyped.current = 0;
    try {
      const sent = await getStore().send(request.id, body);
      setMessages((m) => (m.some((x) => x.id === sent.id) ? m : [...m, sent]));
    } catch (err) {
      setDraft(body);
      setError(failed(err, "That did not send. Check your connection and try again."));
    } finally {
      setPending((p) => p.filter((x) => x.id !== temp.id));
    }
  };

  const move = async (status: RequestStatus) => {
    try { await getStore().setStatus(request.id, status); setError(""); }
    catch (err) { setError(failed(err, "That did not save. Try again.")); }
  };

  const reply = (text: string) => { setDraft(text); setTimeout(() => composer.current?.focus(), 0); };
  const answerMissing = () => reply(request.missing.map((s) => `${missingLabel(s)}: `).join("\n"));
  const shown: Shown[] = useMemo(() => [...messages, ...pending], [messages, pending]);
  const flag = "press h-10 items-center rounded-full px-4 text-[14px] font-medium ring-1 ring-brand-ink/12 transition-colors hover:bg-brand-ink/[.04] aria-expanded:bg-brand-ink/[.06]";

  return (
    <section aria-label={`Conversation with ${who}`} className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex items-center gap-3 px-3 pb-3 pt-3 md:px-5 md:pt-5">
        <button type="button" onClick={onBack} aria-label="All conversations"
          className="press grid size-10 shrink-0 place-items-center rounded-full text-brand-ink transition-colors hover:bg-black/[.05] md:hidden">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <Avatar name={who} size={42} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-medium leading-tight tracking-[-0.02em]">{who}</h2>
          <p className="truncate text-[13px] text-brand-ink/50">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={typing ? "t" : "s"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="inline-block">
                {typing ? <span className="text-[#0284c7]">typing</span> : maker ? cap(request.design.title) : STATUS_LABEL[request.status]}
              </motion.span>
            </AnimatePresence>
          </p>
        </div>
        {maker && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setAsking(!asking)} aria-expanded={asking} className={cn(flag, "hidden sm:inline-flex")}>Flag missing details</button>
            <StatusMenu request={request} onPick={move} onFlag={() => setAsking(true)} />
          </div>
        )}
      </header>

      <AnimatePresence initial={false}>{asking && <AskDetails key="ask" request={request} onDone={() => setAsking(false)} />}</AnimatePresence>

      <DesignSummary design={request.design} />

      <AnimatePresence initial={false}>
        {request.missing.length > 0 && (
          <motion.div key="missing" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="mx-3 mt-2 flex items-center gap-3 rounded-[18px] bg-[#38bdf8]/10 px-5 py-3 md:mx-5">
              <p className="min-w-0 flex-1 text-[14px] leading-snug text-[#075985]">
                <span className="font-medium">{maker ? "Waiting on " : `${who} needs `}</span>
                {request.missing.map((s) => missingLabel(s).toLowerCase()).join(", ")}
              </p>
              {!maker && (
                <button type="button" onClick={answerMissing} className="press h-9 shrink-0 rounded-full bg-white px-4 text-[13px] font-medium text-[#075985] transition-colors hover:bg-white/80">Answer</button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Messages messages={shown} me={me} maker={maker} typing={typing} otherName={who} />

      {error && <p role="alert" className="px-6 pb-1 text-[14px] text-[#b5121b] md:px-8">{error}</p>}
      {maker && !closed(request.status) && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none] md:px-5">
          {QUICK_REPLIES.map((q) => (
            <motion.button key={q} type="button" onClick={() => reply(q)} whileTap={{ scale: 0.95 }}
              className="h-9 shrink-0 rounded-full px-4 text-[13.5px] text-brand-ink ring-1 ring-black/10 transition-colors hover:bg-black/[.04] hover:ring-black/20">
              {q}
            </motion.button>
          ))}
        </div>
      )}
      <Composer ref={composer} value={draft} onChange={write} onSend={send} placeholder={`Message ${who.split(" ")[0]}`} />
    </section>
  );
}

// ------------------------------------------------------------------ page
export function Workspace({ me }: { me: Profile }) {
  const { requests } = useInbox();
  const maker = me.role === "maker";
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const alerts = useAlerts();

  const pick = useCallback((id: string) => {
    setSelected(id);
    if (new URLSearchParams(window.location.search).get("r") !== id) window.history.pushState({ thread: id }, "", `?r=${encodeURIComponent(id)}`);
  }, []);
  const back = () => {
    if (window.history.state?.thread) window.history.back();
    else { setSelected(null); window.history.replaceState(null, "", window.location.pathname); }
  };

  // the open thread lives in the address, so Back, reload and toasts all land on it
  useEffect(() => {
    const read = () => setSelected(new URLSearchParams(window.location.search).get("r"));
    const open = (e: Event) => pick((e as CustomEvent<string>).detail);
    read();
    window.addEventListener("popstate", read);
    window.addEventListener(OPEN_THREAD, open);
    return () => { window.removeEventListener("popstate", read); window.removeEventListener(OPEN_THREAD, open); };
  }, [pick]);

  const signOut = async () => { await getStore().signOut(); window.location.href = "/"; };
  const current = requests?.find((r) => r.id === selected) ?? null;
  const shown = (requests ?? []).filter((r) => filter === "all" || (filter === "unread" ? r.unread > 0 : !closed(r.status)));
  const link = "press text-[13px] font-medium text-brand-ink/55 underline decoration-brand-ink/20 underline-offset-4 transition-colors hover:text-brand-ink";

  return (
    <>
      <Header current={maker ? "/makers/" : undefined} audience={maker ? "maker" : "customer"} />
      <main className="h-[100svh] bg-white pt-[76px] md:bg-[#f4f5f7] md:px-6 md:pb-6 md:pt-[96px]">
        <div className="mx-auto grid h-full max-w-[1280px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] md:rounded-[32px] md:shadow-[0_0_0_1px_rgba(13,17,23,.05),0_40px_90px_-50px_rgba(13,17,23,.3)]">
          <aside className={cn("flex min-h-0 flex-col md:border-r md:border-brand-ink/[.06]", current && "hidden md:flex")}>
            <div className="px-5 pb-3 pt-5 md:pt-7">
              <h1 className="display text-[44px] leading-none">{maker ? "Inbox" : "Requests"}</h1>
              {maker && !!requests?.length && (
                <div role="tablist" aria-label="Show" className="mt-5 flex gap-1">
                  {FILTERS.map(([f, label]) => (
                    <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                      className="relative h-9 rounded-full px-4 text-[14px] font-medium text-brand-ink/60 transition-colors hover:text-brand-ink aria-selected:text-white">
                      {filter === f && <motion.span layoutId="filter" transition={SPRING} className="absolute inset-0 rounded-full bg-brand-ink" />}
                      <span className="relative">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2">
              {requests && !requests.length && <EmptyList maker={maker} />}
              {requests && requests.length > 0 && !shown.length && (
                <p className="px-3 pt-6 text-[15px] text-brand-ink/50">{filter === "unread" ? "You are all caught up." : "Nothing open right now."}</p>
              )}
              <ul aria-label="Conversations" className="flex flex-col gap-0.5 pb-3">
                {shown.map((r) => <Row key={r.id} r={r} me={me} active={r.id === selected} onPick={() => pick(r.id)} />)}
              </ul>
            </div>
            <div className="flex items-center gap-3 border-t border-brand-ink/[.06] px-5 py-4">
              <Avatar name={me.name} size={32} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{me.name}</span>
              {alerts.state === "default" && <button type="button" onClick={alerts.ask} className={link}>Turn on alerts</button>}
              <button type="button" onClick={signOut} className={link}>Sign out</button>
            </div>
          </aside>

          {current ? <Thread key={current.id} request={current} me={me} onBack={back} /> : (
            <div className="hidden place-items-center px-6 text-center md:grid">
              {requests && (
                <p className="display text-[clamp(40px,4.4vw,64px)] text-brand-ink/20">{requests.length ? "Pick a conversation." : maker ? "Quiet for now." : "Your threads appear here."}</p>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
