"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { analyseBoard, readBoard, resolveComparisons } from "../lib/engine/board";
import type { BoardEvent } from "../lib/engine/board";
import { Update } from "../lib/engine/spec";
import { loadVision, tag, zeroShot } from "../lib/models";
import { Reading } from "./board/Reading";
import type { ReadingState } from "./board/Reading";
import { HaloDropzone } from "./ui/halo-dropzone";
import { BoardsMenu } from "./board/BoardsMenu";
import { SOFT, SPRING } from "./site/Motion";
import { boardHome, loadScene, saveScene, thumbnail } from "../lib/boards";

const SAVE_FAIL = "This board could not be saved. Check your connection; it saves again with your next change.";

const STEPS: [string, string][] = [
  ["Drop pictures", "Garments you love, one look per picture works best."],
  ["Mark what matters", "Circle a detail, or add a note such as \"this neckline\" or \"not this colour\"."],
  ["Read the board", "We pick out colour, print, neckline and more, and add them to your design."],
];
const isLabel = (e: any) => e.customData?.bespokeLabel || (e.type === "text" && /^#\d+$/.test((e.text ?? "").trim()));
const TILE = 340; // height of a dropped picture on the canvas
const MAX_SIDE = 1280; // pictures are shrunk before they are kept, so the board fits in this device's storage

/** Decode a dropped file and shrink it to a JPEG no larger than MAX_SIDE. */
async function shrink(file: File): Promise<{ dataURL: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * k);
  c.height = Math.round(bitmap.height * k);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return { dataURL: c.toDataURL("image/jpeg", 0.86), w: c.width, h: c.height };
}

const idle: ReadingState = { phase: "loading", loaded: 0, pictures: [], active: null, findings: {}, status: "", usable: false, error: "" };

export default function Board({ boardId, onOpen, onNew, onEvidence, comparisons }: {
  boardId: string; onOpen: (id: string) => void; onNew: () => void;
  onEvidence: (u: Update[], note: string) => void;
  comparisons: { slot: string; cmp: string; ref: string }[];
}) {
  const api = useRef<any>(null);
  const [hint, setHint] = useState("");
  const [reading, setReading] = useState<ReadingState | null>(null);
  const outcome = useRef<{ ups: Update[]; note: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [home, setHome] = useState<"cloud" | "device" | null>(null);
  const [saving, setSaving] = useState(false);
  const [initial] = useState(() => loadScene(boardId).catch(() => null).then((s) => {
    setEmpty(!s?.elements?.length);
    setLoaded(true);
    return { elements: s?.elements ?? [], files: (s?.files ?? {}) as any, appState: { viewBackgroundColor: "#ffffff" } };
  }));
  const cover = useRef<{ fileId?: string; src?: string }>({});
  const saveTimer = useRef<any>(null);

  const persist = (elements: readonly any[], files: any) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const kept = elements.filter((e) => !e.isDeleted);
      const first = kept.find((e) => e.type === "image" && files?.[e.fileId]);
      if (first && first.fileId !== cover.current.fileId) cover.current = { fileId: first.fileId, src: await thumbnail(files[first.fileId].dataURL) };
      setSaving(true);
      const where = await saveScene(boardId, kept, files, cover.current.src);
      setSaving(false);
      if (where === false) setHint(SAVE_FAIL);
      else { setHome(where); setHint((h) => (h === SAVE_FAIL ? "" : h)); }
    }, 800);
  };

  // label every image #1, #2 ... in reading order, so notes can refer to them
  const relabel = () => {
    const a = api.current;
    if (!a) return;
    const all = a.getSceneElements();
    const board = readBoard(all.filter((e: any) => !isLabel(e)), a.getFiles());
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

  const onEvent = (e: BoardEvent) => setReading((r) => {
    if (!r) return r;
    if (e.type === "picture") return { ...r, phase: "reading", active: { n: e.n, box: e.box } };
    const finding = e.type === "slot"
      ? { slot: e.slot, value: e.value, p: e.p, circled: e.circled }
      : { slot: "neckline.depth", value: `${e.inches} in`, p: 1, circled: false };
    const active = e.type === "depth" ? { n: e.n } : r.active;
    return { ...r, active, findings: { ...r.findings, [e.n]: [...(r.findings[e.n] ?? []).filter((f) => !(f.slot === finding.slot && f.circled === finding.circled)), finding] } };
  });

  const analyse = async () => {
    const a = api.current;
    if (!a) return;
    const elements = a.getSceneElements().filter((e: any) => !isLabel(e));
    const board = readBoard(elements, a.getFiles());
    if (!board.images.length && !board.notes.length) { setHint("Add a picture first."); return; }
    relabel();
    const pictures = board.images.map((im) => ({ n: im.n, dataURL: im.dataURL }));
    setReading({ ...idle, pictures, status: "Preparing to read your pictures" });
    try {
      if (board.images.length) await loadVision((loaded) => setReading((r) => r && { ...r, loaded }));
      setReading((r) => r && { ...r, phase: "reading", loaded: 1 });
      const res = await analyseBoard(board, zeroShot, tag, (status) => setReading((r) => r && { ...r, status }), onEvent);
      const comps = [...comparisons, ...res.updates.filter((u) => u.op === "compare").map((u) => ({ slot: u.slot, cmp: u.cmp!, ref: u.ref! }))];
      const intervals = resolveComparisons(comps, res.depth);
      const ups = res.updates.filter((u) => u.op !== "compare");
      const notes: string[] = [];
      for (const iv of intervals) {
        if (iv.proposal !== null) {
          ups.push({ op: "set", slot: iv.slot, value: { value: `${iv.proposal} in`, inches: iv.proposal, p: 0.75, src: "note", evidence: `${iv.note}, from the references` } });
          notes.push(`${iv.slot.replace(".", " ")}: ${iv.note}; I proposed ${iv.proposal} in, toward the shallow end, since a neckline can be deepened at the trial but not raised.`);
        } else notes.push(`${iv.slot.replace(".", " ")}: ${iv.note}. Which reference should win?`);
      }
      const seen = Object.entries(res.perImage).map(([n, s]) => `picture ${n} looks like ${[s["colour"]?.[0], s["pattern"]?.[0] === "solid" ? "" : s["pattern"]?.[0], s["garment"]?.[0]].filter(Boolean).join(" ")}`).join("; ");
      outcome.current = { ups, note: `From your board (${board.images.length} pictures, ${board.regions.length} circled, ${board.notes.length} notes): ${seen}. Your words always come first; pictures only suggest. ${notes.join(" ")}` };
      const usable = ups.some((u) => u.op !== "note");
      setReading((r) => r && { ...r, phase: "done", active: null, usable, status: "Finished reading your board" });
    } catch (e: any) {
      const offline = !navigator.onLine;
      setReading((r) => r && { ...r, phase: "error", status: "", error: offline ? "You are offline. Connect once, then read again." : "Check your connection, then read again." });
    }
  };

  const close = useCallback(() => { outcome.current = null; setReading(null); }, []);
  const use = () => {
    const o = outcome.current;
    close();
    if (o) onEvidence(o.ups, o.note);
  };

  useEffect(() => () => clearTimeout(saveTimer.current), []);
  useEffect(() => { boardHome().then(setHome).catch(() => setHome("device")); }, []);

  return (
    <div className="boardwrap">
      <Excalidraw
        excalidrawAPI={(a: any) => { api.current = a; }}
        initialData={initial}
        theme="light"
        onChange={(els: readonly any[], _s: any, files: any) => { persist(els, files); setEmpty(!els.some((e) => !e.isDeleted)); }}
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
      <div className="absolute left-[64px] top-4 z-[4] flex items-center gap-3">
        <BoardsMenu current={boardId} onOpen={onOpen} onNew={onNew} />
        <AnimatePresence mode="wait">
          {!empty && home && (
            <motion.span key={saving ? "saving" : home} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="hidden items-center gap-2 text-[13px] text-brand-ink/50 sm:flex">
              <span className={saving ? "size-1.5 animate-pulse rounded-full bg-brand-ink/40" : "size-1.5 rounded-full bg-[#22c55e]"} aria-hidden="true" />
              {saving ? "Saving" : home === "cloud" ? "Saved to your account" : <>Saved on this device. <a href="/login/?next=/studio/?view=board" className="font-medium text-brand-ink underline decoration-brand-ink/25 underline-offset-4 hover:decoration-brand-ink">Log in</a> to keep it everywhere.</>}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {loaded && empty && !reading && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0 z-[3] grid place-items-center overflow-y-auto px-5 pb-28 pt-20">
            <div className="pointer-events-auto w-full max-w-[640px]">
              <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.05 }}
                className="display text-[clamp(44px,6vw,80px)]">Pin what you love.</motion.h2>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.12 }}
                className="mt-4 max-w-[46ch] text-[17px] leading-[1.5] text-brand-ink/60">
                A board shows what words cannot. Add pictures, point at the details, and we turn them into your design.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.2 }} className="mt-8">
                <HaloDropzone accept="image/*" multiple onFiles={addPictures} successResetMs={1200} showSuccessThumbnails={false}
                  emptyLabel="Drop pictures here, or click to choose" successLabel="Added" formatHint="JPG, PNG or WebP" />
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
          className="flex max-w-full items-center gap-3 rounded-full bg-white/85 py-2 pl-5 pr-2 shadow-[0_18px_50px_-20px_rgba(13,17,23,.35)] ring-1 ring-black/[.06] backdrop-blur-2xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={hint || (empty ? "empty" : "full")} role={hint ? "alert" : "status"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
              className={hint ? "text-[14px] text-[#b5121b]" : "text-[14px] text-brand-ink/60"}>
              {hint || (empty ? "Start with a picture" : "Circle a detail or add a note, then read")}
            </motion.span>
          </AnimatePresence>
          <motion.button type="button" onClick={analyse} disabled={empty} whileTap={{ scale: 0.95 }} transition={SPRING}
            className="h-11 shrink-0 rounded-full bg-brand-ink px-5 text-[15px] font-medium text-white transition-[background-color,opacity] hover:bg-[#232c3b] disabled:opacity-35">
            Read the board
          </motion.button>
        </motion.div>
      </div>
      <AnimatePresence>{reading && <Reading state={reading} onUse={use} onClose={close} />}</AnimatePresence>
    </div>
  );
}
