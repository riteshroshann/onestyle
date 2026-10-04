"use client";
import { useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { analyseBoard, readBoard, resolveComparisons } from "../lib/engine/board";
import { Update } from "../lib/engine/spec";
import { tag, zeroShot } from "../lib/models";

const KEY = "bespoke.board";
const isLabel = (e: any) => e.customData?.bespokeLabel || (e.type === "text" && /^#\d+$/.test((e.text ?? "").trim()));

export default function Board({ onEvidence, comparisons }: {
  onEvidence: (u: Update[], note: string) => void;
  comparisons: { slot: string; cmp: string; ref: string }[];
}) {
  const api = useRef<any>(null);
  const [busy, setBusy] = useState("");
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

  const analyse = async () => {
    const a = api.current;
    if (!a) return;
    const elements = a.getSceneElements().filter((e: any) => !isLabel(e));
    const board = readBoard(elements, a.getFiles());
    if (!board.images.length && !board.notes.length) { setBusy("Add a few pictures first. Drag them in or paste them."); return; }
    relabel();
    setBusy("Preparing to read your pictures. The first time takes a moment.");
    try {
      const res = await analyseBoard(board, zeroShot, tag, setBusy);
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
      const seen = Object.entries(res.perImage).map(([n, s]) => `#${n} ${s["garment"]?.[0] ?? ""}, ${s["neckline.shape"]?.[0] ?? ""} neck, ${s["colour"]?.[0] ?? ""}`).join("; ");
      onEvidence(ups, `From the board (${board.images.length} images, ${board.regions.length} circled, ${board.notes.length} notes): ${seen}. ${notes.join(" ")}`);
      setBusy("");
    } catch (e: any) {
      setBusy(`The board could not be read: ${e?.message ?? e}`);
    }
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
      {empty && (
        <div className="boardwelcome">
          <div>
            <h3>Your moodboard</h3>
            <p>Drag pictures here or paste them. Write a note, draw an arrow from the note to the picture it means, and circle the part you love.</p>
          </div>
        </div>
      )}
      <div className="boardbar">
        <span>{busy || (empty ? "Your pictures stay on this device." : "Arrow a note to what it means. Circle the part you love.")}</span>
        <button className="btn quiet" onClick={relabel}>Number pictures</button>
        <button className="btn" onClick={analyse}>Read the board</button>
      </div>
    </div>
  );
}
