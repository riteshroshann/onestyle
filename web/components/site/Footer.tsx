import { Mark } from "./Mark";

const COLUMNS = [
  { title: "Make", links: [{ href: "/studio/", label: "Studio" }, { href: "/studio/", label: "Start a design" }, { href: "/orders/", label: "My requests" }] },
  { title: "Bespoke", links: [{ href: "/makers/", label: "For makers" }, { href: "/login/", label: "Sign in" }, { href: "/licenses.txt", label: "Credits" }] },
];

export function Footer() {
  return (
    <footer className="bg-white text-brand-ink">
      <div className="mx-auto max-w-[1440px] px-5 pt-20 md:px-10 md:pt-28">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-12">
          <p className="text-[28px] leading-[1.15] tracking-[-0.025em] col-span-2 md:col-span-6 md:text-[34px]">Say it. We will cut it.</p>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="col-span-1 md:col-span-3">
              <h2 className="mb-5 text-[15px] text-brand-ink/55">{col.title}</h2>
              <ul className="space-y-3 text-[16px]">
                {col.links.map((l) => (
                  <li key={l.label}><a href={l.href} className="text-brand-ink no-underline transition-colors hover:text-brand-ink/60">{l.label}</a></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        {/* the wordmark rides a gentle downward curve; a round-joined outline in the same ink puffs the letters up */}
        <svg aria-hidden="true" viewBox="0 0 1000 250" className="mt-16 block w-full select-none overflow-visible md:mt-24">
          <path id="footer-arc" d="M10 150Q500 250 990 150" fill="none" />
          <text className="fill-brand-ink stroke-brand-ink" style={{ fontFamily: "var(--font-ui)", fontWeight: 500, fontSize: 228, letterSpacing: "-0.01em", strokeWidth: 12, strokeLinejoin: "round", paintOrder: "stroke" }}>
            <textPath href="#footer-arc" startOffset="50%" textAnchor="middle" textLength="975" lengthAdjust="spacing">Bespoke</textPath>
          </text>
        </svg>
      </div>
      <div className="mt-6 border-t border-brand-ink/10 md:mt-10">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-7 pr-24 text-[14px] text-brand-ink/65 md:px-10 md:pr-28">
          <span className="inline-flex items-center gap-2 text-[16px] font-medium text-brand-ink"><Mark className="size-4" />Bespoke</span>
          <span>Engineered by Ritesh Roshan</span>
        </div>
      </div>
    </footer>
  );
}
