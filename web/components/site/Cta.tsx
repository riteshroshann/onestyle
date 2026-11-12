import { cn } from "@/lib/utils";

const SIZE = {
  md: "h-11 px-6 text-[15px]",
  lg: "h-14 px-9 text-[17px]",
};

/** The one primary action on a page: a solid pill with a centred label. */
export function Cta({ href, children, className, tone = "dark", size = "md" }: { href: string; children: React.ReactNode; className?: string; tone?: "dark" | "light"; size?: keyof typeof SIZE }) {
  return (
    <a href={href} className={cn(
      "press inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium leading-none tracking-[-0.01em] no-underline transition-[background-color,transform] duration-300 active:scale-[0.97]",
      tone === "dark" ? "bg-brand-ink text-white hover:bg-[#232c3b]" : "bg-white text-brand-ink hover:bg-white/85",
      SIZE[size],
      className,
    )}>
      {children}
    </a>
  );
}
