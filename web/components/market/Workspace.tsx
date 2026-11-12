"use client";
// One screen for both sides of a request: the list, the sheet the maker cuts from, and the conversation.
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStore, MarketError, MISSING_OPTIONS, missingLabel, STATUS_LABEL } from "@/lib/market";
import type { DesignRequest, Message, Profile, RequestStatus } from "@/lib/market";
import { cn } from "@/lib/utils";
import { Cta } from "../site/Cta";
import { Header } from "../site/Header";

const spring = { type: "spring", duration: 0.45, bounce: 0 } as const;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** What a maker can do next, by where the request stands. */
const NEXT: Record<RequestStatus, { status: RequestStatus; label: string }[]> = {
  new: [{ status: "accepted", label: "Accept" }, { status: "declined", label: "Decline" }],
  "needs-info": [{ status: "accepted", label: "Accept" }, { status: "declined", label: "Decline" }],
  accepted: [{ status: "in-progress", label: "Start making" }],
  "in-progress": [{ status: "ready", label: "Mark ready" }],
  ready: [],
  declined: [],
};

function Row({ r, me, active, onPick }: { r: DesignRequest; me: Profile; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button onClick={onPick} aria-current={active} className="press group flex w-full items-center gap-4 border-b border-foreground/10 px-5 py-5 text-left aria-[current=true]:bg-foreground aria-[current=true]:text-background md:px-8">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[19px] font-semibold tracking-tight">{cap(r.design.title)}</span>
          <span className="mt-1 block truncate text-[14px] font-medium opacity-60">{me.role === "maker" ? r.customerName : r.makerName} · {STATUS_LABEL[r.status]}</span>
        </span>
        {r.unread > 0 && <span aria-label={`${r.unread} unread`} className="size-3 rounded-full bg-destructive" />}
      </button>
    </li>
  );
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind !== "text") {
    return (
      <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-3 text-center text-[14px] font-semibold">
        {m.kind === "missing" ? <span className="inline-block rounded-md bg-secondary px-4 py-2">{m.body}</span> : <span className="text-foreground/50">{m.body}</span>}
      </motion.li>
    );
  }
  return (
    <motion.li layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <span className={cn("max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[16px] font-medium leading-snug", mine ? "rounded-br-sm bg-foreground text-background" : "rounded-bl-sm bg-secondary")}>{m.body}</span>
      <span className="mt-1 px-1 text-[12px] font-medium text-foreground/40">{time(m.createdAt)}</span>
    </motion.li>
  );
}

function Thread({ request, me }: { request: DesignRequest; me: Profile }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const end = useRef<HTMLLIElement>(null);

  const load = useCallback(() => getStore().messages(request.id).then(setMessages).catch(() => {}), [request.id]);

  useEffect(() => { void load(); return getStore().subscribe(() => void load()); }, [load]);
  // marking read is itself a change the store announces, so it must only happen when something is unread
  useEffect(() => { if (request.unread > 0) void getStore().markRead(request.id).catch(() => {}); }, [request.id, request.unread]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await getStore().send(request.id, draft);
      setDraft("");
      setError("");
    } catch (err) {
      setError(err instanceof MarketError ? err.message : "That did not send. Try again.");
    }
  };

  return (
    <div className="flex min-h-[420px] flex-col lg:min-h-0">
      <ol aria-label="Conversation" className="flex-1 space-y-2 overflow-y-auto px-5 py-6 md:px-8">
        {messages.length === 0 && <li className="display pt-10 text-center text-[32px] text-foreground/20">Say hello.</li>}
        {messages.map((m) => <Bubble key={m.id} m={m} mine={m.senderId === me.id} />)}
        <li ref={end} aria-hidden />
      </ol>
      {error && <p role="alert" className="px-5 pb-2 text-[14px] font-semibold text-destructive md:px-8">{error}</p>}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-foreground/10 px-5 py-4 md:px-8">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Message" placeholder="Message" maxLength={2000}
          className="h-12 min-w-0 flex-1 rounded-full bg-secondary px-5 text-[16px] font-medium outline-none transition-shadow placeholder:text-foreground/40 focus:shadow-[0_0_0_2px_var(--foreground)]" />
        <button type="submit" disabled={!draft.trim()} className="press h-12 rounded-full bg-foreground px-6 text-[16px] font-semibold text-background">Send</button>
      </form>
    </div>
  );
}

function AskDetails({ request, onDone }: { request: DesignRequest; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>(request.missing);
  const [error, setError] = useState("");
  const toggle = (slot: string) => setPicked((p) => (p.includes(slot) ? p.filter((s) => s !== slot) : [...p, slot]));
  const save = async () => {
    try { await getStore().setMissing(request.id, picked, ""); onDone(); }
    catch (err) { setError(err instanceof MarketError ? err.message : "That did not save. Try again."); }
  };
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
      <div className="border-b border-foreground/10 px-5 py-6 md:px-8">
        <p className="text-[15px] font-semibold">What is missing?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MISSING_OPTIONS.map((o) => (
            <button key={o.slot} aria-pressed={picked.includes(o.slot)} onClick={() => toggle(o.slot)}
              className="press h-10 rounded-full border-2 border-foreground/15 px-4 text-[14px] font-semibold aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">{o.label}</button>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 text-[14px] font-semibold text-destructive">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={save} className="press h-11 rounded-full bg-foreground px-6 text-[15px] font-semibold text-background">{picked.length ? "Ask customer" : "Nothing missing"}</button>
          <button onClick={onDone} className="press h-11 rounded-full bg-secondary px-6 text-[15px] font-semibold">Cancel</button>
        </div>
      </div>
    </motion.div>
  );
}

function Detail({ request, me, onBack }: { request: DesignRequest; me: Profile; onBack: () => void }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const maker = me.role === "maker";
  const open = request.status !== "ready" && request.status !== "declined";
  const move = async (status: RequestStatus) => {
    try { await getStore().setStatus(request.id, status); setError(""); }
    catch (err) { setError(err instanceof MarketError ? err.message : "That did not save. Try again."); }
  };

  return (
    <section aria-label="Request" className="flex min-h-0 flex-col">
      <header className="border-b border-foreground/10 px-5 py-6 md:px-8 md:py-8">
        <button onClick={onBack} className="press mb-4 text-[15px] font-semibold underline underline-offset-4 md:hidden">All requests</button>
        <h1 className="display text-[clamp(36px,4.4vw,64px)]">{cap(request.design.title)}</h1>
        <p className="mt-3 text-[16px] font-semibold text-foreground/60">{maker ? request.customerName : request.makerName} · {STATUS_LABEL[request.status]}</p>
        {maker && open && (
          <div className="mt-5 flex flex-wrap gap-2">
            {NEXT[request.status].map((a, i) => (
              <button key={a.status} onClick={() => move(a.status)} className={cn("press h-11 rounded-full px-6 text-[15px] font-semibold", i === 0 ? "bg-foreground text-background" : "bg-secondary")}>{a.label}</button>
            ))}
            <button onClick={() => setAsking(!asking)} aria-expanded={asking} className="press h-11 rounded-full bg-secondary px-6 text-[15px] font-semibold">Ask for details</button>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[14px] font-semibold text-destructive">{error}</p>}
      </header>

      <AnimatePresence initial={false}>{asking && <AskDetails key="ask" request={request} onDone={() => setAsking(false)} />}</AnimatePresence>

      {request.missing.length > 0 && (
        <p className="bg-foreground px-5 py-4 text-[15px] font-semibold text-background md:px-8">
          {maker ? "Waiting on" : "Your maker needs"}: {request.missing.map(missingLabel).join(", ")}
        </p>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-2">
        <div className="overflow-y-auto border-foreground/10 px-5 py-6 md:px-8 lg:border-r">
          <dl>
            {request.design.lines.map((l) => (
              <div key={l.part} className="grid grid-cols-[8.5rem_1fr] items-baseline gap-4 border-b border-foreground/10 py-4">
                <dt className="text-[14px] font-semibold text-foreground/55">{l.part}</dt>
                <dd className="text-[18px] font-semibold tracking-tight">{cap(l.en)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Thread key={request.id} request={request} me={me} />
      </div>
    </section>
  );
}

export function Workspace({ me }: { me: Profile }) {
  const [requests, setRequests] = useState<DesignRequest[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const store = getStore();
    const load = () => store.requests().then(setRequests).catch(() => setRequests([]));
    setSelected(new URLSearchParams(window.location.search).get("r"));
    void load();
    return store.subscribe(() => void load());
  }, []);

  const signOut = async () => { await getStore().signOut(); window.location.href = "/"; };
  const current = requests?.find((r) => r.id === selected) ?? null;
  const maker = me.role === "maker";

  return (
    <>
      <Header current={maker ? "/makers/" : undefined} cta={false} />
      <main className="grid h-[100svh] pt-[72px] md:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className={cn("flex min-h-0 flex-col border-foreground/10 md:border-r", current && "hidden md:flex")}>
          <h2 className="display px-5 pb-5 pt-8 text-[44px] md:px-8">{maker ? "Inbox" : "Requests"}</h2>
          <ul className="flex-1 overflow-y-auto border-t border-foreground/10">
            {requests?.map((r) => <Row key={r.id} r={r} me={me} active={r.id === selected} onPick={() => setSelected(r.id)} />)}
          </ul>
          <div className="flex items-center justify-between border-t border-foreground/10 px-5 py-4 md:px-8">
            <span className="truncate text-[15px] font-semibold">{me.name}</span>
            <button onClick={signOut} className="press text-[15px] font-semibold text-foreground/60 underline underline-offset-4 hover:text-foreground">Sign out</button>
          </div>
        </aside>

        {current ? <Detail key={current.id} request={current} me={me} onBack={() => setSelected(null)} /> : (
          <div className={cn("place-items-center px-6 text-center md:grid", requests?.length ? "hidden" : "grid")}>
            {requests && (
              <div>
                <p className="display text-[clamp(44px,6vw,88px)]">{requests.length ? "Pick a request." : "Nothing yet."}</p>
                {!requests.length && !maker && <div className="mt-8 flex justify-center"><Cta href="/studio/" className="h-14 px-9 text-[17px] font-semibold">Start a design</Cta></div>}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
