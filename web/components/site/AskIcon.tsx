// Plump body, big radii, a soft rounded tail at the top left.
const BUBBLE = "M9.5 7H46Q60 7 60 21V40Q60 58 42 58H33.5Q15.5 58 15.5 40V22.5Q15.5 16.8 11.2 14.2L7.4 11.9Q4.6 10.2 6 8.3Q7 7 9.5 7Z";
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
