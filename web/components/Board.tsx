"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { analyseBoard, checkInspiration, ideaUpdates, isOurs, mergeUpdates, readBoard, readNotes, resolveComparisons } from "../lib/engine/board";
import type { Board as BoardGraph, BoardEvent, BoardResult, Idea, Inspiration, PictureIdeas, Scores } from "../lib/engine/board";
import { apply, emptySpec, Update } from "../lib/engine/spec";
import { links } from "../lib/engine/describe";
import { loadVision, tag, zeroShot } from "../lib/models";
import { Buddy } from "./board/Buddy";
import type { ReadingState, Step } from "./board/Buddy";
import { ideaLine, layoutNotes, skeletons } from "./board/notes";
import type { Chart } from "./board/notes";
import { paletteOf } from "./board/palette";
import { HaloDropzone } from "./ui/halo-dropzone";
import { BoardsMenu } from "./board/BoardsMenu";
import { SOFT, SPRING } from "./site/Motion";
import { boardHome, loadScene, saveScene, thumbnail } from "../lib/boards";

const SAVE_FAIL = "This board could not be saved. Check your connection; it saves again with your next change.";

const STEPS: [string, string][] = [
  ["Drop or paste pictures", "Anything you love: clothes, art, anime, places, a colour."],
  ["Mark what matters", "Circle a detail, or add a note such as \"this neckline\" or \"not this colour\"."],
  ["Read the board", "We chart what each picture shows and write the direction right on the board."],
];
const isLabel = (e: any) => e.customData?.bespokeLabel || (e.type === "text" && /^#\d+$/.test((e.text ?? "").trim()));
const isNote = (e: any) => !!e.customData?.bespokeNote;
const TILE = 340; // height of a dropped picture on the canvas
const MAX_SIDE = 1280; // pictures are shrunk before they are kept, so the board fits in this device's storage
const SEND_SIDE = 768; // and shrunk again before they are sent to be read
const VISION_MS = 24000;

async function toJpeg(source: Blob, side: number, quality: number): Promise<{ dataURL: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(source);
  const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * k);
  c.height = Math.round(bitmap.height * k);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return { dataURL: c.toDataURL("image/jpeg", quality), w: c.width, h: c.height };
}
/** Decode a dropped file and shrink it to a JPEG no larger than MAX_SIDE. */
const shrink = (file: File) => toJpeg(file, MAX_SIDE, 0.86);
const forSending = async (dataURL: string) => (await toJpeg(await (await fetch(dataURL)).blob(), SEND_SIDE, 0.8)).dataURL;

type Cloud = { kind: "ok"; ins: Inspiration } | { kind: "refused"; message: string } | { kind: "off" | "busy" | "limit" | "offline" | "none" };

/** Ask the picture reader (api/vision.js). Anything but a reading means: read on this device instead. */
async function askVision(board: BoardGraph, design: string): Promise<Cloud> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), VISION_MS);
  try {
    const pictures = await Promise.all(board.images.slice(0, 6).map(async (im) => ({
      n: im.n, dataURL: await forSending(im.dataURL), circles: board.regions.filter((r) => r.image.n === im.n).map((r) => r.box),
    })));
    const notes = board.notes.map((n) => ({ text: n.text, negative: n.negative, target: n.target ? ("n" in n.target ? n.target.n : n.target.image.n) : null }));
    const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pictures, notes, design }), signal: ctl.signal });
    if (r.status === 429) return { kind: "limit" };
    if (r.status === 404 || r.status === 405 || r.status === 501) return { kind: "off" };
    if (!r.ok) return { kind: "busy" };
    const body = await r.json();
    if (body?.refused) return { kind: "refused", message: typeof body.message === "string" ? body.message.slice(0, 200) : "These pictures can't be read here." };
    const ins = checkInspiration(body, pictures.map((p) => p.n));
    return ins.pictures.length || ins.direction.ideas.length ? { kind: "ok", ins } : { kind: "busy" };
  } catch {
    return { kind: navigator.onLine ? "busy" : "offline" };
  } finally {
    clearTimeout(timer);
  }
}

const NOTICE: Record<string, string> = {
  off: "Read on this device. Ideas from any picture arrive once the reader is switched on for this site.",
  busy: "The idea reader is busy, so your device read this alone. Read again in a minute for ideas from any picture.",
  limit: "You have read a lot of boards in a short time, so your device read this one alone.",
  offline: "You are offline, so your device read this alone. Connect for ideas from any picture.",
};

interface Plan { ups: Update[]; note: string }
interface Written { pictures: PictureIdeas[]; summary: string; ideas: Idea[] }
const SURE = 0.55; // a device reading below this is a guess, and guesses are not shown
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}.` : s);

/** What the device alone can say about each picture: its palette from the pixels and any confident reading. */
function devicePictures(board: BoardGraph, dev: BoardResult | null, palettes: Record<number, { name: string; hex: string; base: string }[]>): PictureIdeas[] {
  return board.images.slice(0, 6).map((im) => {
    const s = dev?.perImage[im.n] ?? {};
    const sure = (slot: string) => (s[slot] && s[slot][1] >= SURE ? s[slot][0] : "");
    const pattern = sure("pattern");
    const what = [pattern && pattern !== "solid" ? pattern : "", sure("garment")].filter(Boolean).join(" ");
    return {
      n: im.n, shows: what ? `Looks like a ${what}` : "", borrow: "", palette: palettes[im.n] ?? [], mood: [], motifs: [],
      pattern: pattern && pattern !== "solid" ? [pattern] : [], "lower.silhouette": [], fabric: [], embellishment: [], style: [],
    };
  });
}

/** The on-device reading as one idea, when it found anything to suggest. */
function deviceIdea(ups: Update[]): Idea | null {
  const seen = ups.filter((u) => u.value.src === "image" && (u.op === "set" || u.op === "add"));
  if (!seen.length) return null;
  const idea: Idea = { title: "From your pictures", why: "Read on this device from colour, print and what you circled." };
  for (const u of seen) {
    if (u.slot === "colour") idea.colour = [...(idea.colour ?? []), u.value.value];
    else idea[u.slot] = u.value.value;
  }
  return idea;
}

const CHART_TITLE: Record<string, string> = { garment: "Garment", colour: "Colour", pattern: "Print" };
/** What the image model saw in each picture, as charts for the notes. */
const chartsOf = (scores: Scores): Record<number, Chart[]> => Object.fromEntries(Object.entries(scores).map(([n, slots]) =>
  [Number(n), Object.entries(slots).filter(([slot]) => CHART_TITLE[slot]).map(([slot, rows]) => ({ title: CHART_TITLE[slot], rows }))]));

/** Where to look further for a direction: idea searches and shops, built from the direction as a design. */
function looksFor(idea: Idea | undefined) {
  if (!idea) return { ideas: [], shops: [] };
  const L = links(apply(emptySpec(), ideaUpdates(idea)));
  return {
    ideas: L.pinterest.slice(0, 2).map((p) => ({ label: `Pinterest: ${p.label}`, url: p.url })),
    shops: L.shops.slice(0, 3).map((x) => ({ label: x.label, url: x.url })),
  };
}

const idle = (pictures: { n: number; dataURL: string }[], steps: ReadingState["steps"]): ReadingState =>
  ({ phase: "reading", pictures, active: pictures[0]?.n ?? null, steps, loaded: 0, status: "Reading your board", result: null, message: "" });

export default function Board({ boardId, onOpen, onNew, onEvidence, comparisons, design = "" }: {
  boardId: string; onOpen: (id: string) => void; onNew: () => void;
  onEvidence: (u: Update[], note: string) => void;
  comparisons: { slot: string; cmp: string; ref: string }[];
  /** The current design in a sentence, such as "a pink anarkali for a wedding", so ideas fit it. */
  design?: string;
}) {
  const api = useRef<any>(null);
  const [hint, setHint] = useState("");
  const [coach, setCoach] = useState(false);
  const [reading, setReading] = useState<ReadingState | null>(null);
  const [picked, setPicked] = useState(0);
  const [applied, setApplied] = useState<number | null>(null);
  const outcome = useRef<{ plans: Plan[]; written: Written } | null>(null);
  const charts = useRef<Record<number, Chart[]>>({});
  const panelOpen = useRef(false);
  const generation = useRef(0); // late charts belong to the latest reading, even after the panel closes
  const run = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [hasNotes, setHasNotes] = useState(false);
  const [home, setHome] = useState<"cloud" | "device" | null>(null);
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => loadScene(boardId).catch(() => null).then((s) => {
    setEmpty(!s?.elements?.some((e: any) => !isOurs(e)));
    setLoaded(true);
    return { elements: s?.elements ?? [], files: (s?.files ?? {}) as any, appState: { viewBackgroundColor: "#ffffff" } };
  }));
  const cover = useRef<{ fileId?: string; src?: string }>({});
  const saveTimer = useRef<any>(null);
  const pending = useRef<{ elements: readonly any[]; files: any } | null>(null);

  const save = async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const kept = p.elements.filter((e) => !e.isDeleted);
    const first = kept.find((e) => e.type === "image" && p.files?.[e.fileId]);
    if (first && first.fileId !== cover.current.fileId) cover.current = { fileId: first.fileId, src: await thumbnail(p.files[first.fileId].dataURL) };
    setSaving(true);
    const where = await saveScene(boardId, kept, p.files, cover.current.src);
    setSaving(false);
    if (where === false) setHint(SAVE_FAIL);
    else { setHome(where); setHint((h) => (h === SAVE_FAIL ? "" : h)); }
  };
  const persist = (elements: readonly any[], files: any) => {
    pending.current = { elements, files };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  };
  // save now rather than after the pause, such as when the board is left for Talk
  const flush = () => {
    clearTimeout(saveTimer.current);
    const a = api.current;
    if (a) pending.current = { elements: a.getSceneElements(), files: a.getFiles() };
    void save();
  };

  // label every image #1, #2 ... in reading order, so notes can refer to them
  const relabel = () => {
    const a = api.current;
    if (!a) return;
    const all = a.getSceneElements();
    const board = readBoard(all, a.getFiles());
    const labels = convertToExcalidrawElements(board.images.map((im) => ({
      type: "text", x: im.x, y: im.y - 30, text: `#${im.n}`, fontSize: 20, strokeColor: "#8a8378", customData: { bespokeLabel: true },
    })) as any);
    a.updateScene({ elements: [...all.filter((e: any) => !isLabel(e)), ...labels] });
  };

  // pictures from the dropzone go onto the canvas in a row, to the right of whatever is there
  const addPictures = async (files: File[]) => {
    const a = api.current;
    const pictures = files.filter((f) => f.type.startsWith("image/"));
    if (!a || !pictures.length) { setHint("Pictures only: JPG, PNG or WebP."); return; }
    try {
      const shrunk = await Promise.all(pictures.map(shrink));
      const existing = a.getSceneElements();
      let x = existing.length ? Math.max(...existing.map((e: any) => e.x + e.width)) + 48 : 0;
      const now = Date.now();
      const added = shrunk.map((p, i) => ({ id: `drop-${now}-${i}`, ...p }));
      a.addFiles(added.map((p) => ({ id: p.id, dataURL: p.dataURL, mimeType: "image/jpeg", created: now })));
      const elements = convertToExcalidrawElements(added.map((p) => {
        const width = (TILE * p.w) / p.h;
        const el = { type: "image", fileId: p.id, x, y: 0, width, height: TILE };
        x += width + 48;
        return el;
      }) as any);
      a.updateScene({ elements: [...existing, ...elements] });
      relabel();
      // after the scene has taken the new pictures, bring the whole board into view below the toolbar
      requestAnimationFrame(() => a.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.6, animate: true }));
      setHint("");
    } catch {
      setHint("That picture would not open. Try another.");
    }
  };

  /** Write the reading onto the board as notes, replacing earlier ones, and fade them in card by card. */
  const writeNotes = (w: Written, animate: boolean, seen: Record<number, Chart[]> = charts.current) => {
    const a = api.current;
    if (!a || (!w.pictures.length && !w.summary && !w.ideas.length)) return;
    const keep = a.getSceneElements().filter((e: any) => !isNote(e));
    const board = readBoard(keep, a.getFiles());
    const taken = keep.filter((e: any) => !e.isDeleted).map((e: any) => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
    const cards = layoutNotes(board.images.map((im) => ({ n: im.n, x: im.x, y: im.y, w: im.w, h: im.h })), taken, w.pictures, w.summary, w.ideas, seen);
    const seed = Date.now().toString(36);
    const still = !animate || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = convertToExcalidrawElements(skeletons(cards, seed) as any, { regenerateIds: false }).map((e: any) => (still ? e : { ...e, opacity: 0 }));
    a.updateScene({ elements: [...keep, ...els] });
    // with the buddy open beside it on a wide screen, the board fits into the space left of the panel
    const beside = panelOpen.current && innerWidth >= 768;
    const fit = () => {
      a.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: beside ? 0.62 : 0.85, animate: !still && !beside });
      if (beside) { const st = a.getAppState(); a.updateScene({ appState: { scrollX: st.scrollX - 150 / st.zoom.value } }); }
    };
    requestAnimationFrame(fit);
    if (still) return;
    const order = new Map(cards.map((c, i) => [`bespoke-${seed}-${c.key}`, i]));
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      let done = true;
      const next = a.getSceneElements().map((e: any) => {
        const k = order.get(e.groupIds?.[0]);
        if (k === undefined || !isNote(e)) return e;
        const p = Math.min(1, Math.max(0, (t - k * 140) / 420));
        if (p < 1) done = false;
        return { ...e, opacity: Math.round(100 * (1 - (1 - p) ** 3)) };
      });
      a.updateScene({ elements: next });
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const clearNotes = () => {
    const a = api.current;
    if (a) a.updateScene({ elements: a.getSceneElements().filter((e: any) => !isNote(e)) });
  };

  const onEvent = (e: BoardEvent) => {
    if (e.type === "picture") setReading((r) => (r && r.phase === "reading" ? { ...r, active: e.n } : r));
  };

  const analyse = async () => {
    const a = api.current;
    if (!a) return;
    const board = readBoard(a.getSceneElements(), a.getFiles());
    if (!board.images.length && !board.notes.length) { setHint("Add a picture first."); return; }
    relabel();
    setCoach(false);
    const id = ++run.current;
    const gen = ++generation.current;
    charts.current = {};
    setApplied(null);
    const live = () => run.current === id;
    const set = (f: (r: ReadingState) => ReadingState) => { if (live()) setReading((r) => (r ? f(r) : r)); };
    const step = (k: keyof ReadingState["steps"], s: Step) => set((r) => ({ ...r, steps: { ...r.steps, [k]: s } }));
    const online = navigator.onLine;
    outcome.current = null;
    setPicked(0);
    setReading(idle(board.images.map((im) => ({ n: im.n, dataURL: im.dataURL })),
      { notes: board.notes.length ? "work" : "skip", cloud: !board.images.length ? "skip" : online ? "work" : "skip", device: "wait" }));

    const noteRead = readNotes(board, tag).catch(() => ({ updates: [] as Update[] })).then((r) => { if (board.notes.length) step("notes", "done"); return r; });
    const cloud: Promise<Cloud> = board.images.length && online ? askVision(board, design) : Promise.resolve({ kind: online ? "none" : "offline" });
    // the device reads as well when only it can: circles, comparisons, or a cloud that cannot help
    const fine = board.regions.length > 0 || comparisons.length > 0 || board.notes.some((n) => /\bthan\b|#\d/i.test(n.text));
    const readOnDevice = async () => {
      step("device", "work");
      await loadVision((loaded) => set((r) => ({ ...r, loaded })));
      set((r) => ({ ...r, loaded: 1 }));
      return analyseBoard(board, zeroShot, tag, (status) => set((r) => ({ ...r, status })), onEvent);
    };
    // the image model always reads the pictures: its scores are charted under each one
    const device: Promise<BoardResult> | null = board.images.length ? readOnDevice() : null;
    device?.catch(() => null); // handled where it is awaited

    const c = await cloud;
    if (!live()) return;
    if (c.kind === "refused") { run.current++; setReading((r) => r && { ...r, phase: "refused", message: c.message }); return; }
    step("cloud", c.kind === "ok" ? "done" : board.images.length && online ? "fail" : "skip");
    let dev: BoardResult | null = null;
    // with a good cloud reading and nothing fine to look at, the charts can arrive after the direction
    if (device && (fine || c.kind !== "ok")) {
      try { dev = await device; charts.current = chartsOf(dev.scores); step("device", "done"); } catch { step("device", "fail"); }
    } else if (device) {
      device.then((d) => {
        if (generation.current !== gen) return;
        charts.current = chartsOf(d.scores);
        step("device", "done");
        const o = outcome.current;
        if (o) writeNotes(o.written, false);
      }).catch(() => { if (generation.current === gen) step("device", "fail"); });
    } else step("device", "skip");
    const notes = await noteRead;
    if (!live()) return;
    if (c.kind !== "ok" && !dev && board.images.length) {
      setReading((r) => r && { ...r, phase: "error", message: navigator.onLine
        ? "The pictures could not be read just now. Check your connection, then try again."
        : "You are offline, and this device has not read pictures before. Connect once and try again; after that it reads offline too." });
      return;
    }

    // words first: the device's reading carries the notes; without it, the notes alone
    const base = dev ? dev.updates : notes.updates;
    const comps = [...comparisons, ...base.filter((u) => u.op === "compare").map((u) => ({ slot: u.slot, cmp: u.cmp!, ref: u.ref! }))];
    const extra: Update[] = [];
    const told: string[] = [];
    for (const iv of resolveComparisons(comps, dev?.depth ?? {})) {
      if (iv.proposal !== null) {
        extra.push({ op: "set", slot: iv.slot, value: { value: `${iv.proposal} in`, inches: iv.proposal, p: 0.75, src: "note", evidence: `${iv.note}, from the references` } });
        told.push(`${iv.slot.replace(".", " ")}: ${iv.note}; I proposed ${iv.proposal} in, toward the shallow end, since a neckline can be deepened at the trial but not raised.`);
      } else told.push(`${iv.slot.replace(".", " ")}: ${iv.note}. Which reference should win?`);
    }
    const kept = base.filter((u) => u.op !== "compare");

    let written: Written;
    let ideas: Idea[];
    let plansUps: Update[][];
    if (c.kind === "ok") {
      ideas = c.ins.direction.ideas;
      plansUps = (ideas.length ? ideas : [null]).map((idea) => [...mergeUpdates(kept, idea ? ideaUpdates(idea) : [], board.regions.length > 0), ...extra]);
      written = { pictures: c.ins.pictures, summary: c.ins.direction.summary, ideas };
    } else {
      const palettes: Record<number, { name: string; hex: string; base: string }[]> = {};
      await Promise.all(board.images.slice(0, 6).map(async (im) => { palettes[im.n] = await paletteOf(im.dataURL).catch(() => []); }));
      const idea = deviceIdea(kept);
      ideas = idea ? [idea] : [];
      plansUps = [[...kept, ...extra]];
      const summary = idea ? "Colour and print, read from your pictures on this device." : "Your pictures give the palette. Circle a sleeve or a neckline for a closer look.";
      written = { pictures: devicePictures(board, dev, palettes), summary, ideas };
    }
    if (!live()) return;

    const motifs = [...new Set(written.pictures.flatMap((p) => p.motifs))].slice(0, 4);
    const palette = [...new Set(written.pictures.flatMap((p) => p.palette.map((x) => x.name)))].slice(0, 5);
    const counts = `${board.images.length} picture${board.images.length === 1 ? "" : "s"}, ${board.regions.length} circled, ${board.notes.length} note${board.notes.length === 1 ? "" : "s"}`;
    const plans: Plan[] = plansUps.map((ups, i) => {
      const idea = ideas[i];
      const tailor = cap([idea ? `Moodboard direction: ${idea.title}.` : "From the moodboard.", motifs.length ? `Motifs: ${motifs.join(", ")}.` : "", palette.length ? `Palette: ${palette.join(", ")}.` : ""].filter(Boolean).join(" "), 240);
      const withNote: Update[] = [...ups, { op: "note", slot: "notes", value: { value: tailor, p: 0.5, src: "image", evidence: "moodboard" } }];
      const said = `From your board (${counts}): ${written.summary ? `${written.summary} ` : ""}${idea ? `I took the direction "${idea.title}"${idea.why ? `: ${idea.why}` : "."} ` : ""}Your words always come first; pictures only suggest.${told.length ? ` ${told.join(" ")}` : ""}`;
      return { ups: withNote, note: said };
    });
    outcome.current = { plans, written };
    writeNotes(written, true);
    setReading((r) => r && {
      ...r, phase: "done", active: null, status: "Finished reading your board",
      result: {
        summary: written.summary, ideas, pictureCount: written.pictures.length,
        usable: plans.some((p) => p.ups.some((u) => u.op !== "note")),
        leftOut: c.kind === "ok" ? c.ins.leftOut : [], notice: c.kind === "ok" ? "" : NOTICE[c.kind] ?? "",
      },
    });
  };

  // closing stops a reading in progress; a finished one is already written on the board
  const close = useCallback(() => { run.current++; setReading(null); }, []);
  useEffect(() => { panelOpen.current = !!reading; }, [reading]);
  const circle = () => {
    close();
    api.current?.setActiveTool({ type: "ellipse" });
    setCoach(true);
  };
  // the direction goes into the design right here; the board never sends you elsewhere
  const use = () => {
    const o = outcome.current;
    if (!o) return;
    const plan = o.plans[picked] ?? o.plans[0];
    flush();
    onEvidence(plan.ups, plan.note);
    setApplied(picked);
  };

  // pasted pictures land on the board the same way as dropped ones
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      // typing into a field pastes there; anywhere else on the board, pictures land on the canvas
      const t = e.target;
      if (!files.length || (t instanceof Element && t.closest("textarea, input, [contenteditable=true]"))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void addPictures(files);
    };
    window.addEventListener("paste", paste, true);
    return () => window.removeEventListener("paste", paste, true);
  });

  useEffect(() => () => {
    // leaving the board: keep whatever was waiting to be saved
    if (pending.current) { clearTimeout(saveTimer.current); void save(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { boardHome().then(setHome).catch(() => setHome("device")); }, []);

  return (
    <div className="boardwrap">
      <Excalidraw
        excalidrawAPI={(a: any) => { api.current = a; }}
        initialData={initial}
        theme="light"
        onChange={(els: readonly any[], _s: any, files: any) => {
          persist(els, files);
          setEmpty(!els.some((e) => !e.isDeleted && !isOurs(e)));
          setHasNotes(els.some((e) => !e.isDeleted && isNote(e)));
        }}
        UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false, toggleTheme: false, changeViewBackgroundColor: true, export: { saveFileToDisk: true } } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
      <div className="absolute left-3 top-[76px] z-[4] flex items-center gap-3 md:left-[64px] md:top-4">
        <BoardsMenu current={boardId} onOpen={onOpen} onNew={onNew} />
        <AnimatePresence mode="wait">
          {!empty && home && (
            <motion.span key={saving ? "saving" : home} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="hidden items-center gap-2 text-[13px] text-brand-ink/50 sm:flex">
              <span className={saving ? "size-1.5 animate-pulse rounded-full bg-brand-ink/40" : "size-1.5 rounded-full bg-[#22c55e]"} aria-hidden="true" />
              {saving ? "Saving" : home === "cloud" ? "Saved to your account" : <>Saved on this device. <a href="/login/?next=/studio/?view=board" className="font-medium text-brand-ink underline decoration-brand-ink/25 underline-offset-4 hover:decoration-brand-ink">Log in</a><span className="hidden 2xl:inline"> to keep it everywhere.</span></>}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {coach && !reading && (
          <motion.div key="coach" role="status" initial={{ opacity: 0, y: -10, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={SPRING}
            className="absolute inset-x-0 top-[72px] z-[5] mx-auto flex w-fit max-w-[calc(100%-32px)] items-center gap-2 rounded-[28px] bg-white/90 py-2 pl-5 pr-2 shadow-[0_18px_50px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl">
            <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-[14px] leading-[1.35]">Draw a circle round the detail you love, then read the board again.</span>
            <button type="button" onClick={() => setCoach(false)} className="press h-9 shrink-0 rounded-full px-4 text-[14px] font-medium hover:bg-black/[.05]">Got it</button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {loaded && empty && !reading && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0 z-[3] grid place-items-start justify-items-center overflow-y-auto px-5 pb-60 pt-[150px] md:place-items-center md:pb-28 md:pt-20">
            <div className="pointer-events-auto w-full max-w-[640px]">
              <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.05 }}
                className="display text-[clamp(44px,6vw,80px)]">Pin what you love.</motion.h2>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.12 }}
                className="mt-4 max-w-[46ch] text-[17px] leading-[1.5] text-brand-ink/60">
                A board shows what words cannot. Add pictures of anything, point at the details, and we turn them into your design.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.2 }} className="mt-8">
                <HaloDropzone accept="image/*" multiple onFiles={addPictures} successResetMs={1200} showSuccessThumbnails={false}
                  emptyLabel="Drop or paste pictures, or click to choose" successLabel="Added" formatHint="JPG, PNG or WebP" />
              </motion.div>
              <ol className="mt-8 grid gap-5 sm:grid-cols-3">
                {STEPS.map(([title, text], i) => (
                  <motion.li key={title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.3 + i * 0.07 }}>
                    <span className="text-[13px] font-medium text-brand-ink/40">{i + 1}</span>
                    <p className="mt-1 text-[15px] font-medium">{title}</p>
                    <p className="mt-1 text-[14px] leading-[1.45] text-brand-ink/55">{text}</p>
                  </motion.li>
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-x-0 bottom-6 z-[5] flex justify-center px-4 max-md:bottom-[84px]">
        <motion.div layout transition={SPRING}
          className="flex max-w-full items-center gap-2 rounded-full bg-white/85 py-2 pl-5 pr-2 shadow-[0_18px_50px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={hint || (empty ? "empty" : "full")} role={hint ? "alert" : "status"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
              className={`min-w-0 text-[14px] leading-[1.3] ${hint ? "text-[#b5121b]" : "text-brand-ink/60"} ${hasNotes && !hint ? "max-sm:hidden" : ""}`}>
              {hint || (empty ? "Start with a picture" : "Circle a detail or add a note, then read")}
            </motion.span>
          </AnimatePresence>
          {hasNotes && (
            <motion.button type="button" onClick={clearNotes} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} whileTap={{ scale: 0.95 }} transition={SPRING}
              className="h-11 shrink-0 rounded-full px-4 text-[15px] font-medium text-brand-ink transition-colors hover:bg-black/[.05]">
              Clear notes
            </motion.button>
          )}
          <motion.button type="button" onClick={analyse} disabled={empty} whileTap={{ scale: 0.95 }} transition={SPRING}
            className="h-11 shrink-0 rounded-full bg-brand-ink px-5 text-[15px] font-medium text-white transition-[background-color,opacity] hover:bg-[#232c3b] disabled:opacity-35">
            Read the board
          </motion.button>
        </motion.div>
      </div>
      <AnimatePresence>
        {reading && (() => {
          const idea = reading.result?.ideas[picked];
          const context = [design && `Design: ${design}.`, reading.result?.summary && `Board: ${reading.result.summary}`, idea && `Direction: ${idea.title} (${ideaLine(idea)}).`].filter(Boolean).join(" ");
          return <Buddy key="buddy" state={reading} picked={picked} applied={applied} looks={looksFor(idea)} context={context}
            onPick={setPicked} onUse={use} onCircle={circle} onRetry={analyse} onClose={close} />;
        })()}
      </AnimatePresence>
    </div>
  );
}
