// The picture library for the visual picker: one drawing or photograph per ontology value, made once with
// FLUX.2 [klein] 4B and reviewed by hand (engine/scripts/looks.py). Keys are the ontology's own IDs.
import M from "./looks.json" with { type: "json" };

type Manifest = { photo: string[]; tall: string[]; looks: Record<string, Record<string, string>> };
const L = M as Manifest;

/** The picture for a value, preferring the version drawn for this kind of garment. */
export function lookOf(slot: string, value: string, ctx?: string | null): string | undefined {
  return (ctx ? L.looks[`${slot}@${ctx}`]?.[value] : undefined) ?? L.looks[slot]?.[value];
}
export const groupOf = (slot: string, ctx: string) => L.looks[`${slot}@${ctx}`] ?? {};
export const isPhoto = (slot: string) => L.photo.includes(slot);
export const isTall = (slot: string) => L.tall.includes(slot);
/** Show pictures only when every option has one, so a row never mixes pictures and words. */
export const allHaveLooks = (slot: string, values: string[], ctx?: string | null) =>
  values.length > 0 && values.every((v) => !!lookOf(slot, v, ctx));
