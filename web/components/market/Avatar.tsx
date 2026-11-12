import { initials } from "@/lib/market";
import { cn } from "@/lib/utils";

/** Initials on a soft disc; a person waiting on you gets the accent ring. */
export function Avatar({ name, size = 44, ring = false, className }: { name: string; size?: number; ring?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn("grid shrink-0 select-none place-items-center rounded-full bg-[#eceef1] font-medium tracking-[-0.02em] text-brand-ink/80 transition-shadow duration-300",
        ring && "shadow-[0_0_0_2px_#fff,0_0_0_4px_#38bdf8]", className)}>
      {initials(name)}
    </span>
  );
}

/** The unread count in the accent, or nothing at zero. */
export function Count({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span aria-label={`${n} unread`} className={cn("grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#38bdf8] px-1.5 text-[12px] font-medium leading-none text-white tabular-nums", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
