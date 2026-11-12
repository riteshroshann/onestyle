"use client";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";

export function HomePage() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-white text-brand-ink">
      <Header />
      <main className="flex flex-1 flex-col items-start justify-center gap-14 px-5 pb-16 pt-32 md:px-10">
        <h1 className="display text-[clamp(56px,9vw,168px)] font-black leading-[0.88] tracking-[-0.045em]">Made from<br />your words.</h1>
        <Cta href="/studio/" className="h-14 px-8 text-[17px] font-semibold">Start a design</Cta>
      </main>
      <Footer />
    </div>
  );
}
