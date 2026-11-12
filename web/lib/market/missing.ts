// The details a maker most often needs before they can start cutting.
export const MISSING_OPTIONS: { slot: string; label: string }[] = [
  { slot: "garment.length", label: "Garment length" },
  { slot: "sleeve.length", label: "Sleeve length" },
  { slot: "neckline.depth", label: "Neckline depth" },
  { slot: "fabric", label: "Fabric" },
  { slot: "colour", label: "Colour" },
  { slot: "lining", label: "Lining" },
  { slot: "bust", label: "Bust measurement" },
  { slot: "waist", label: "Waist measurement" },
  { slot: "hip", label: "Hip measurement" },
  { slot: "shoulder", label: "Shoulder measurement" },
  { slot: "occasion", label: "Occasion" },
  { slot: "date", label: "Date needed" },
  { slot: "budget", label: "Budget" },
];

/** A plain-words label for a slot; unknown slots fall back to the slot name spoken aloud. */
export function missingLabel(slot: string): string {
  const known = MISSING_OPTIONS.find((o) => o.slot === slot);
  if (known) return known.label;
  const words = slot.replace(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
