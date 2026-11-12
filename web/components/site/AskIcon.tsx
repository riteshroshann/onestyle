const BUBBLE = "M5 8H54.5Q59 8 59 12.5V42.5Q59 57 44.5 57H31.5Q17 57 17 42.5V19.6Q17 15.6 13.3 14L6.2 10.9Q4.1 10 5 8Z";

/** The Ask launcher: an ink speech bubble, tail at the top left, with a white smile that ends in an arrow. */
export function AskIcon({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path d={BUBBLE} fill="currentColor" />
      {open ? (
        <path d="M31 25.5l12 12M43 25.5l-12 12" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <path d="M23.6 29.2Q35.2 46.4 47.4 32.3L45.9 31Q35.4 41.4 25.2 28.3Z" fill="#fff" />
          <path d="M42.2 29.4L50.4 27.7L49.2 35.9Q48.2 33.2 46.4 31.6Q44.6 30.1 42.2 29.4Z" fill="#fff" />
        </>
      )}
    </svg>
  );
}
