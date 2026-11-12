// Plump body, big radii, a soft rounded tail at the top left.
const BUBBLE = "M10.5 7.5H42Q60 7.5 60 25.5V37.5Q60 58 39.5 58H36.5Q16 58 16 37.5V24.5Q16 18 11.6 15.2L8.2 13Q5.2 11 6.6 9.1Q7.7 7.5 10.5 7.5Z";
const LINE = { stroke: "#fff", strokeWidth: 3.8, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

/** The Ask launcher: an ink speech bubble with a white smile that ends in an arrow. */
export function AskIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d={BUBBLE} fill="currentColor" />
      {open ? (
        <path d="M31.5 26.5l11 11M42.5 26.5l-11 11" {...LINE} />
      ) : (
        <>
          <path d="M25.5 29Q36.5 46 48 31.2" {...LINE} />
          <path d="M43.6 30.4L48.3 30.9L47.8 35.6" {...LINE} />
        </>
      )}
    </svg>
  );
}
