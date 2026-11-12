// Does a message mean anything for a garment? The studio must never invent a kurta out of "asdf" or a joke.
// On device: spans the gazetteer is sure of, and how many words are ordinary English or Hinglish.
// The language model's verdict, when it answers, settles the cases the device cannot.
import { formIndex } from "./lexicon.ts";
import type { Span } from "./lexicon.ts";
import type { Update } from "./spec.ts";

const COMMON = new Set(`a an the i me my mine we our you your he him his she her they them it its this that these those
is am are was were be been being have has had do does did will would can could should shall may might must
and or but if then so of to in on at for from with without by about as into over under up down out off not no yes
want need like love make made get give wear wearing wore look looks looking please something some any one two
what which who whom whose when where why how very really just also too more less much many few little bit
new old same other another like such only own ready good nice pretty best better beautiful simple
outfit outfits clothes clothing garment design dress dresses piece wedding party size colour color fabric
mujhe mujhko main mai mera meri mere hum humara aap aapka tum tumhara ye yeh wo woh is us ek do teen
chahiye chaiye chahte chahti chahta hai hain tha thi the ho hoga hogi kar karo karna karni banana banao bana
ke ki ka ko se me mein par pe aur ya bhi nahi na mat sirf bas bahut thoda accha achha acha sundar naya nayi
liye wala wali wale jaisa jaisi kuch koi kaun kya kaisa kaisi kab kahan pehen pehenna pehnna
hello hi hey thanks thank ok okay sure`.split(/\s+/).filter(Boolean));

/** Share of words that are ordinary language or garment vocabulary, 0 to 1. */
export function wordiness(tokens: string[]): number {
  const words = tokens.filter((t) => /[a-zऀ-ॿ]/i.test(t));
  if (!words.length) return 0;
  const index = formIndex();
  const known = words.filter((w) => COMMON.has(w) || index.has(w) || /^\d/.test(w) || /[ऀ-ॿ]/.test(w));
  return known.length / words.length;
}

export type Meaning = "design" | "unsure" | "none";

/**
 * "design" when the gazetteer found a garment, an attribute or a profile detail; "unsure" when only the
 * tagger's guesses carry the message (a typo, a new word) in mostly ordinary language; "none" otherwise.
 */
export function meaning(tokens: string[], ruleSpans: Span[], allSpans: Span[], profile: Update[]): Meaning {
  const valued = (s: Span) => !!s.value && !["INT", "NEG", "CMP", "LOC", "PART"].includes(s.tag);
  if (ruleSpans.some(valued) || profile.length) return "design";
  if (allSpans.some(valued) && wordiness(tokens) >= 0.5) return "unsure";
  return "none";
}

/** Settles a message: keep the updates, or reply that no garment was caught. */
export function verdict(local: Meaning, model: { about?: string; updates: Update[] } | null): "keep" | "rubbish" {
  if (local === "design") return "keep";
  if (model) {
    if (model.about === "other") return "rubbish";
    return model.updates.length || local === "unsure" ? "keep" : "rubbish";
  }
  return local === "unsure" ? "keep" : "rubbish";
}

export const EXAMPLE_BRIEFS = [
  "A pastel blue kurti for my farewell",
  "Ek maroon lehenga, gota patti ke saath",
  "A linen shirt with a mandarin collar for my brother",
];
export const EXAMPLE_CHANGES = ["Make the sleeves full length", "Change the colour to maroon", "No embroidery, keep it simple"];
