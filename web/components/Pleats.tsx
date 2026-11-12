// The voice mark: a row of pleats that hang still, sway while listening and ripple while thinking.
export function Pleats({ size, state = "idle", level = 0 }: { size: number; state?: string; level?: number }) {
  const count = size > 100 ? 13 : 7;
  return (
    <div className="pleats" data-state={state} aria-hidden style={{ width: size, height: size, ["--level" as string]: Math.min(1, level) }}>
      {Array.from({ length: count }, (_, i) => <i key={i} style={{ ["--i" as string]: i, ["--bow" as string]: 1 - Math.abs(i - (count - 1) / 2) / count }} />)}
    </div>
  );
}
