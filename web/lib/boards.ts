// Every moodboard a person has made. Signed in, boards live in Supabase: the scene in the boards table and the
// pictures in the private "boards" bucket, so they follow the person to any device. Signed out, they stay in
// this browser's IndexedDB, which holds far more than localStorage, and move to the account at the next sign-in.
import { supabase } from "./supabase";

export interface BoardMeta { id: string; title: string; created: number; updated: number; pictures: number; notes: number; cover?: string }
export interface Scene { elements: any[]; files: Record<string, { id: string; dataURL: string; mimeType: string; created: number }> }
export type Saved = "cloud" | "device" | false;

export const CHANGED = "bespoke:boards";
const changed = () => globalThis.dispatchEvent?.(new Event(CHANGED));

export const newBoardId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function boardTitle(t: number): string {
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " +
    new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function metaOf(id: string, created: number, elements: any[], cover?: string): BoardMeta {
  return {
    id, title: boardTitle(created), created, updated: Date.now(),
    pictures: elements.filter((e) => e.type === "image").length,
    notes: elements.filter((e) => e.type === "text" && !e.customData?.bespokeLabel).length,
    ...(cover ? { cover } : {}),
  };
}

// ---------------------------------------------------------------- this device (IndexedDB)
interface Stored { meta: BoardMeta; scene: Scene }
let opened: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  opened ??= new Promise((ok, fail) => {
    const req = indexedDB.open("bespoke", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("boards", { keyPath: "meta.id" });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
  return opened;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((ok, fail) => {
    const req = run(db.transaction("boards", mode).objectStore("boards"));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/** Boards saved by the localStorage version of this page move into IndexedDB once. */
async function migrateLocalStorage() {
  try {
    const index: BoardMeta[] = JSON.parse(localStorage.getItem("bespoke.boards") ?? "[]");
    for (const meta of index) {
      const scene = JSON.parse(localStorage.getItem(`bespoke.board.${meta.id}`) ?? "null");
      if (scene?.elements?.length) await tx("readwrite", (s) => s.put({ meta, scene }));
      localStorage.removeItem(`bespoke.board.${meta.id}`);
    }
    localStorage.removeItem("bespoke.boards");
    const legacy = JSON.parse(localStorage.getItem("bespoke.board") ?? "null");
    if (legacy?.elements?.length) {
      const now = Date.now();
      await tx("readwrite", (s) => s.put({ meta: { ...metaOf(newBoardId(), now, legacy.elements), title: "Your first board" }, scene: legacy }));
    }
    localStorage.removeItem("bespoke.board");
  } catch { /* nothing to move */ }
}

const device = {
  async list(): Promise<BoardMeta[]> {
    await migrateLocalStorage();
    return ((await tx("readonly", (s) => s.getAll())) as Stored[]).map((b) => b.meta);
  },
  async load(id: string): Promise<Scene | null> {
    return ((await tx("readonly", (s) => s.get(id))) as Stored | undefined)?.scene ?? null;
  },
  async save(id: string, scene: Scene, cover?: string): Promise<boolean> {
    try {
      const old = (await tx("readonly", (s) => s.get(id))) as Stored | undefined;
      await tx("readwrite", (s) => s.put({ meta: metaOf(id, old?.meta.created ?? Date.now(), scene.elements, cover ?? old?.meta.cover), scene }));
      return true;
    } catch { return false; }
  },
  async remove(id: string) { await tx("readwrite", (s) => s.delete(id)); },
};

// ---------------------------------------------------------------- the account (Supabase)
interface FileRef { path: string; mimeType: string; created: number }
const uploaded = new Map<string, Map<string, FileRef>>(); // board -> file id -> where it is stored
const createdAt = new Map<string, number>();

async function userId(): Promise<string | null> {
  const db = supabase();
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session?.user.id ?? null;
}

const blobToDataURL = (b: Blob) => new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(b); });
const extOf = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

const cloud = {
  async list(): Promise<BoardMeta[]> {
    const { data, error } = await supabase()!.from("boards").select("id,title,created_at,updated_at,pictures,notes,cover").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, title: r.title, created: Date.parse(r.created_at), updated: Date.parse(r.updated_at), pictures: r.pictures, notes: r.notes, cover: r.cover ?? undefined }));
  },
  async load(id: string): Promise<Scene | null> {
    const db = supabase()!;
    const { data } = await db.from("boards").select("elements,files,created_at").eq("id", id).maybeSingle();
    if (!data) return null;
    createdAt.set(id, Date.parse(data.created_at));
    const refs = Object.entries((data.files ?? {}) as Record<string, FileRef>);
    uploaded.set(id, new Map(refs));
    const files: Scene["files"] = {};
    if (refs.length) {
      const { data: signed } = await db.storage.from("boards").createSignedUrls(refs.map(([, r]) => r.path), 3600);
      await Promise.all(refs.map(async ([fid, r], i) => {
        const url = signed?.[i]?.signedUrl;
        if (!url) return;
        try { files[fid] = { id: fid, mimeType: r.mimeType, created: r.created, dataURL: await blobToDataURL(await (await fetch(url)).blob()) }; } catch { /* a missing picture leaves an empty frame */ }
      }));
    }
    return { elements: data.elements ?? [], files };
  },
  async save(uid: string, id: string, scene: Scene, cover?: string): Promise<boolean> {
    const db = supabase()!;
    const have = uploaded.get(id) ?? new Map<string, FileRef>();
    uploaded.set(id, have);
    const used = new Set(scene.elements.filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId as string));
    for (const fid of used) {
      const f = scene.files?.[fid];
      if (have.has(fid) || !f?.dataURL) continue;
      const path = `${uid}/${id}/${fid}.${extOf(f.mimeType)}`;
      const blob = await (await fetch(f.dataURL)).blob();
      const { error } = await db.storage.from("boards").upload(path, blob, { contentType: f.mimeType, upsert: true });
      if (error) return false;
      have.set(fid, { path, mimeType: f.mimeType, created: f.created ?? Date.now() });
    }
    const files = Object.fromEntries([...have].filter(([fid]) => used.has(fid)));
    const created = createdAt.get(id) ?? Date.now();
    createdAt.set(id, created);
    const meta = metaOf(id, created, scene.elements, cover);
    const { error } = await db.from("boards").upsert({
      id, title: meta.title, elements: scene.elements, files, pictures: meta.pictures, notes: meta.notes,
      updated_at: new Date().toISOString(), created_at: new Date(created).toISOString(), ...(cover ? { cover } : {}),
    });
    return !error;
  },
  async remove(uid: string, id: string) {
    const db = supabase()!;
    const { data } = await db.storage.from("boards").list(`${uid}/${id}`);
    if (data?.length) await db.storage.from("boards").remove(data.map((f) => `${uid}/${id}/${f.name}`));
    await db.from("boards").delete().eq("id", id);
    uploaded.delete(id);
  },
};

/** Boards made while signed out join the account the first time it is open here. */
let moving: Promise<void> | null = null;
function moveDeviceBoards(uid: string): Promise<void> {
  moving ??= (async () => {
    for (const meta of await device.list().catch(() => [])) {
      const scene = await device.load(meta.id);
      createdAt.set(meta.id, meta.created);
      if (scene && await cloud.save(uid, meta.id, scene, meta.cover)) await device.remove(meta.id);
    }
  })();
  return moving;
}

// ---------------------------------------------------------------- the API the board uses
/** Where boards are kept right now. */
export async function boardHome(): Promise<"cloud" | "device"> {
  return (await userId()) ? "cloud" : "device";
}

/** Newest first. */
export async function listBoards(): Promise<BoardMeta[]> {
  const uid = await userId();
  if (uid) { await moveDeviceBoards(uid); return cloud.list(); }
  return (await device.list()).sort((a, b) => b.updated - a.updated);
}

export async function loadScene(id: string): Promise<Scene | null> {
  return (await userId()) ? cloud.load(id) : device.load(id);
}

// saves of one board run one after another, so a slow upload never lands after a newer save
const queue = new Map<string, Promise<Saved>>();

/** Saves a board; an empty board is removed instead. Says where it went, or false when it could not be kept. */
export function saveScene(id: string, elements: any[], files: Scene["files"], cover?: string): Promise<Saved> {
  const run = async (): Promise<Saved> => {
    const uid = await userId();
    if (!elements.length) { await removeBoard(id); return uid ? "cloud" : "device"; }
    const ok = uid ? await cloud.save(uid, id, { elements, files }, cover) : await device.save(id, { elements, files }, cover);
    changed();
    return ok ? (uid ? "cloud" : "device") : false;
  };
  const next = (queue.get(id) ?? Promise.resolve<Saved>("device")).catch(() => false as const).then(run);
  queue.set(id, next);
  return next;
}

export async function removeBoard(id: string) {
  const uid = await userId();
  if (uid) await cloud.remove(uid, id); else await device.remove(id).catch(() => {});
  changed();
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
