import { cn } from "@/lib/utils";
import { Mark } from "./Mark";

/** The one primary action on a page: an ink pill led by the mark. */
export function Cta({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("press group inline-flex h-12 items-center gap-2.5 rounded-full bg-foreground px-7 text-[15px] font-medium text-background no-underline transition-colors hover:bg-brand-ink", className)}>
      <Mark className="size-[1.1em] transition-transform duration-300 group-hover:scale-90" />
      {children}
    </a>
  );
}
