import { cn } from "@/lib/utils";
import { Mark } from "./Mark";

/** The one primary action on a page: a pill led by the mark, which turns a quarter on hover. */
export function Cta({ href, children, className, tone = "dark" }: { href: string; children: React.ReactNode; className?: string; tone?: "dark" | "light" }) {
  return (
    <a href={href} className={cn(
      "press group inline-flex h-12 items-center gap-2.5 rounded-full px-7 text-[15px] font-medium no-underline transition-colors duration-300",
      tone === "dark" ? "bg-brand-ink text-white hover:bg-[#1b2433]" : "bg-white text-brand-ink hover:bg-brand",
      className,
    )}>
      <Mark className={cn("size-[1.1em] transition-transform duration-500 ease-[cubic-bezier(.32,.72,0,1)] group-hover:rotate-90", tone === "light" && "group-hover:text-brand-ink")} />
      {children}
    </a>
  );
}
