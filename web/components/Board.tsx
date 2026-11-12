"use client";
import { AnimatePresence } from "motion/react";
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

const KEY = "bespoke.board";
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

export default function Board({ onEvidence, comparisons }: {
  onEvidence: (u: Update[], note: string) => void;
  comparisons: { slot: string; cmp: string; ref: string }[];
}) {
  const api = useRef<any>(null);
  const [hint, setHint] = useState("");
  const [reading, setReading] = useState<ReadingState | null>(null);
  const outcome = useRef<{ ups: Update[]; note: string } | null>(null);
  const [initial] = useState(() => { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } });
  const saveTimer = useRef<any>(null);
  const [empty, setEmpty] = useState(() => !initial?.elements?.length);

  const persist = (elements: readonly any[], files: any) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ elements: elements.filter((e) => !e.isDeleted), files })); } catch { /* quota: the board still works, it just is not remembered */ }
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

  return (
    <div className="boardwrap">
      <Excalidraw
        excalidrawAPI={(a: any) => { api.current = a; }}
        initialData={initial ? { elements: initial.elements, files: initial.files, appState: { viewBackgroundColor: "#ffffff" } } : { appState: { viewBackgroundColor: "#ffffff" } }}
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
      {empty && !reading && (
        <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center px-6">
          <div className="pointer-events-auto w-full max-w-xl text-center">
            <h2 className="display mb-8 text-[clamp(48px,6vw,88px)]">Moodboard</h2>
            <HaloDropzone
              accept="image/*" multiple onFiles={addPictures} successResetMs={1200} showSuccessThumbnails={false}
              emptyLabel="Drop pictures" successLabel="Added" formatHint={null}
            />
          </div>
        </div>
      )}
      <div className="boardbar">
        {hint && <span role="alert">{hint}</span>}
        <button className="btn" onClick={analyse}>Read the board</button>
      </div>
      <AnimatePresence>{reading && <Reading state={reading} onUse={use} onClose={close} />}</AnimatePresence>
    </div>
  );
}
