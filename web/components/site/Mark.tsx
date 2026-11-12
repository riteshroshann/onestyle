import { cn } from "@/lib/utils";

/** The Bespoke mark: two chevrons closing in, in the brand cyan. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-5 text-brand", className)}>
      <path d="M5 6.5l5 5.5-5 5.5M19 6.5l-5 5.5 5 5.5" />
    </svg>
  );
}
