import { cn } from "@/lib/utils";

/** The one primary action on a page: a solid black pill. */
export function Cta({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={cn("press inline-flex h-12 items-center rounded-full bg-foreground px-7 text-[15px] font-medium text-background no-underline transition-colors hover:bg-black", className)}>
      {children}
    </a>
  );
}
