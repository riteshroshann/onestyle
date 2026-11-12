/** The Ask mark: a speech bubble, tail at the top left, smiling. */
export function AskIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M2.5 4.6H19.6Q20.5 4.6 20.5 5.5V15.4Q20.5 20.4 15.5 20.4H11.5Q6.6 20.4 6.6 15.4V8.4Q6.6 6.8 5 6.1Z" />
      <path d="M10.2 11.6Q13.3 15.6 16.6 11.4" />
      <path d="M15.9 10.9Q16.9 10.8 17.1 12" />
    </svg>
  );
}
