"use client";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";

export function HomePage() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-white text-brand-ink">
      <Header />
      <main className="flex flex-1 items-center pb-24 pt-40 md:pb-32 md:pt-48">
        <div className="mx-auto w-full max-w-[1440px] px-5 md:px-10">
          <h1 className="display text-[clamp(56px,9vw,160px)] leading-[0.92]">Made from<br />your words.</h1>
          <div className="mt-16 md:mt-24"><Cta href="/studio/?new" size="lg">Start a design</Cta></div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
