// Every moodboard a person has made, kept in this browser: a small index for the history list,
// and each board's scene under its own key so the list never loads pictures it does not show.

export interface BoardMeta { id: string; title: string; created: number; updated: number; pictures: number; notes: number; cover?: string }

const INDEX = "bespoke.boards";
const LEGACY = "bespoke.board";
const sceneKey = (id: string) => `bespoke.board.${id}`;
export const CHANGED = "bespoke:boards";

function read<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function write(k: string, v: unknown): boolean {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}

export const newBoardId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function boardTitle(t: number): string {
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " +
    new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** Newest first. The single board kept before history existed becomes the first entry. */
export function listBoards(): BoardMeta[] {
  const list = read<BoardMeta[]>(INDEX, []);
  const old = read<{ elements?: any[]; files?: any } | null>(LEGACY, null);
  if (old?.elements?.length) {
    const id = newBoardId();
    const now = Date.now();
    if (write(sceneKey(id), old)) {
      list.push({ id, title: "Your first board", created: now, updated: now, pictures: old.elements.filter((e) => e.type === "image").length, notes: old.elements.filter((e) => e.type === "text").length });
      write(INDEX, list);
      try { localStorage.removeItem(LEGACY); } catch { /* keep it; it is migrated again next time */ }
    }
  }
  return [...list].sort((a, b) => b.updated - a.updated);
}

export function loadScene(id: string): { elements: any[]; files: any } | null {
  return read(sceneKey(id), null);
}

/** Saves a board's scene and refreshes its entry. Empty boards are never listed. False when storage is full. */
export function saveScene(id: string, elements: any[], files: any, cover?: string): boolean {
  const list = read<BoardMeta[]>(INDEX, []);
  const at = list.findIndex((b) => b.id === id);
  if (!elements.length) {
    if (at >= 0) { list.splice(at, 1); write(INDEX, list); }
    try { localStorage.removeItem(sceneKey(id)); } catch { /* nothing to remove */ }
    return true;
  }
  const now = Date.now();
  const meta: BoardMeta = {
    ...(at >= 0 ? list[at] : { id, title: boardTitle(now), created: now }),
    updated: now,
    pictures: elements.filter((e) => e.type === "image").length,
    notes: elements.filter((e) => e.type === "text" && !e.customData?.bespokeLabel).length,
    ...(cover ? { cover } : {}),
  };
  if (at >= 0) list[at] = meta; else list.push(meta);
  const ok = write(sceneKey(id), { elements, files }) && write(INDEX, list);
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return ok;
}

export function removeBoard(id: string) {
  write(INDEX, read<BoardMeta[]>(INDEX, []).filter((b) => b.id !== id));
  try { localStorage.removeItem(sceneKey(id)); } catch { /* already gone */ }
}

/** A tiny square thumbnail of a picture, for the history list. */
export async function thumbnail(dataURL: string, side = 96): Promise<string | undefined> {
  try {
    const img = new Image();
    img.src = dataURL;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = side;
    const s = Math.min(img.width, img.height);
    c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, side, side);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}
