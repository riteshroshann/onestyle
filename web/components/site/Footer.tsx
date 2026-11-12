import { Mark } from "./Mark";

const COLUMNS = [
  { title: "Make", links: [{ href: "/studio/", label: "Studio" }, { href: "/studio/?new", label: "Start a design" }, { href: "/orders/", label: "My requests" }] },
  { title: "Bespoke", links: [{ href: "/about/", label: "About" }, { href: "https://riteshroshann.github.io/onestyle/", label: "Docs" }, { href: "/makers/", label: "For makers" }, { href: "/login/", label: "Log in" }, { href: "/licenses.txt", label: "Credits" }] },
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
        <p aria-hidden="true" className="display mt-20 select-none whitespace-nowrap -ml-[0.05em] pb-[0.06em] text-[clamp(88px,25.2vw,386px)] leading-[0.95] tracking-[-0.06em] md:mt-28">Bespoke</p>
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
