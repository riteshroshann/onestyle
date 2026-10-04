// Optional second opinion from a language model behind /api/understand. The on-device engine has already
// answered by the time this returns; if the function is missing, unconfigured, slow or failing, nothing changes.
import type { Spec, Update } from "./engine/spec.ts";
import { phrase } from "./engine/describe.ts";

let available: boolean | null = null;

function describeForModel(spec: Spec): string {
  if (!spec.slots.garment && !Object.keys(spec.lists).length) return "";
  const slots = Object.fromEntries(Object.entries(spec.slots).map(([k, v]) => [k, v.value]));
  const lists = Object.fromEntries(Object.entries(spec.lists).map(([k, v]) => [k, v.map((x) => x.value)]));
  return `${phrase(spec)}. ${JSON.stringify({ slots, lists, excluded: spec.excluded.map((e) => `${e.slot}:${e.value}`) })}`;
}

export async function understand(message: string, spec: Spec, ms = 7000): Promise<Update[] | null> {
  if (available === false) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch("/api/understand", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ message, design: describeForModel(spec) }),
    });
    if (r.status === 404 || r.status === 405 || r.status === 501) { available = false; return null; }
    if (!r.ok) return null;
    available = true;
    const j = await r.json();
    return Array.isArray(j.updates) ? (j.updates as Update[]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
