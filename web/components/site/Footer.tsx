const LINKS = [
  { href: "/studio/", label: "Studio" },
  { href: "/orders/", label: "My requests" },
  { href: "/makers/", label: "For makers" },
  { href: "/licenses.txt", label: "Credits" },
];

export function Footer() {
  return (
    <footer className="border-t border-brand-ink/10 bg-white text-brand-ink">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <span className="display text-[56px]">Bespoke</span>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-3 text-[15px] font-semibold md:flex md:gap-x-7">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="text-brand-ink no-underline decoration-brand underline-offset-4 hover:underline">{l.label}</a>)}
        </nav>
      </div>
      <p className="mx-auto max-w-[1440px] px-5 pb-28 text-[14px] font-medium text-brand-ink/55 md:px-10">Engineered by Ritesh Roshan</p>
    </footer>
  );
}
