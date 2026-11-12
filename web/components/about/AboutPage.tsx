"use client";
import { motion } from "motion/react";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";
import { SOFT } from "../site/Motion";

const PARTS: { title: string; text: string; href: string; go: string }[] = [
  { title: "Talk", text: "Say what you want in your own words, English or Hinglish, typed or spoken. The studio asks only for what is missing.", href: "/studio/?new", go: "Start a design" },
  { title: "Board", text: "Pin pictures of what you love, circle the details, and the studio reads them into your design.", href: "/studio/?view=board", go: "Open a board" },
  { title: "Sheet", text: "Every choice becomes a tailor sheet in English or Hindi, with drawings and your measurements.", href: "/studio/?view=sheet", go: "See the sheet" },
  { title: "Makers", text: "Send the sheet to a designer or tailor on Bespoke, and talk it through in one thread.", href: "/makers/", go: "For makers" },
];

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: SOFT };

export function AboutPage() {
  return (
    <div className="bg-white text-brand-ink">
      <Header current="/about/" />
      <main>
        <section className="mx-auto max-w-[1440px] px-5 pb-24 pt-40 md:px-10 md:pb-32 md:pt-52">
          <h1 className="display text-[clamp(52px,8.4vw,152px)] leading-[0.92]">
            {["Clothes made for you,", "from your words."].map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <motion.span className="block" initial={{ y: "105%" }} animate={{ y: 0 }} transition={{ ...SOFT, delay: 0.08 + i * 0.1 }}>{line}</motion.span>
              </span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SOFT, delay: 0.3 }}
            className="mt-10 max-w-[56ch] text-[clamp(18px,1.6vw,22px)] leading-[1.5] text-brand-ink/60">
            Most people know exactly what they want to wear. Few can say it in a tailor's language. Bespoke closes that gap.
          </motion.p>
        </section>

        <section className="border-t border-brand-ink/10">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-24 md:grid-cols-12 md:px-10 md:py-32">
            <motion.h2 {...rise} className="text-[clamp(30px,3vw,44px)] font-medium leading-[1.1] tracking-[-0.03em] md:col-span-4">The problem</motion.h2>
            <motion.div {...rise} className="space-y-6 text-[clamp(18px,1.5vw,21px)] leading-[1.6] text-brand-ink/75 md:col-span-7 md:col-start-6">
              <p>You describe a kurta to a tailor, show a picture on your phone, and hope. The neckline comes back too deep, the sleeve too short, the colour a shade off. Nobody was wrong. The words simply did not carry.</p>
              <p>Bespoke listens the way a good tailor does. It understands how people really talk, in English and Hinglish, reads the pictures you love, asks about what is still open, and writes it all down as a sheet any tailor can follow.</p>
            </motion.div>
          </div>
        </section>

        <section className="border-t border-brand-ink/10">
          <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-32">
            <motion.h2 {...rise} className="text-[clamp(30px,3vw,44px)] font-medium leading-[1.1] tracking-[-0.03em]">How it works</motion.h2>
            <div className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
              {PARTS.map((p, i) => (
                <motion.article key={p.title} {...rise} transition={{ ...SOFT, delay: i * 0.08 }} className="flex flex-col border-t border-brand-ink/10 pt-6">
                  <h3 className="text-[24px] font-medium tracking-[-0.02em]">{p.title}</h3>
                  <p className="mt-3 flex-1 text-[16px] leading-[1.55] text-brand-ink/60">{p.text}</p>
                  <a href={p.href} className="group mt-6 inline-flex w-fit items-center gap-1.5 text-[15px] font-medium text-brand-ink no-underline">
                    <span className="underline decoration-brand-ink/25 underline-offset-[6px] transition-[text-decoration-color] group-hover:decoration-brand-ink">{p.go}</span>
                  </a>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-brand-ink text-white">
          <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-28 md:grid-cols-12 md:px-10 md:py-40">
            <motion.h2 {...rise} className="text-[clamp(30px,3vw,44px)] font-medium leading-[1.1] tracking-[-0.03em] md:col-span-4">The vision</motion.h2>
            <motion.div {...rise} className="md:col-span-7 md:col-start-6">
              <blockquote className="m-0 space-y-6 text-[clamp(20px,1.8vw,26px)] leading-[1.5] tracking-[-0.01em]">
                <p>Made-to-measure clothing should not belong only to people who already speak the trade. Every city in India has brilliant tailors, and every person has a picture in their head of what they want to wear.</p>
                <p>Bespoke is the bridge between the two. Say it however it comes to you, and get back something a maker can cut from, without a single word lost on the way.</p>
              </blockquote>
              <p className="mt-10 text-[15px] text-white/60">Ritesh Roshan, founder</p>
              <div className="mt-14"><Cta href="/studio/?new" size="lg" tone="light">Start a design</Cta></div>
            </motion.div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
