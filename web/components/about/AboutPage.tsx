"use client";
import { motion } from "motion/react";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";
import dynamic from "next/dynamic";
import { SOFT, SPRING } from "../site/Motion";

// three.js runs only in the browser
const Lanyard = dynamic(() => import("./Lanyard"), { ssr: false, loading: () => null });

const SOCIAL = [
  { label: "GitHub", handle: "riteshroshann", href: "https://github.com/riteshroshann",
    icon: "M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" },
  { label: "X", handle: "@RiteshRoshann", href: "https://x.com/RiteshRoshann",
    icon: "M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" },
  { label: "LinkedIn", handle: "ritesh-roshan-sahoo", href: "https://www.linkedin.com/in/ritesh-roshan-sahoo/",
    icon: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" },
];

const PARTS: { title: string; text: string; href: string; go: string }[] = [
  { title: "Talk", text: "Say what you want in your own words, English or Hinglish, typed or spoken. The studio asks only for what is missing.", href: "/studio/talk/?new", go: "Start a design" },
  { title: "Board", text: "Pin pictures of what you love, circle the details, and the studio reads them into your design.", href: "/studio/board/", go: "Open a board" },
  { title: "Sheet", text: "Every choice becomes a tailor sheet in English or Hindi, with drawings and your measurements.", href: "/studio/sheet/", go: "See the sheet" },
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

        <section className="border-t border-brand-ink/10">
          <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 py-20 md:grid-cols-12 md:px-10 md:py-28">
            <motion.div {...rise} className="relative h-[560px] overflow-hidden rounded-[36px] bg-[#f4f5f7] md:col-span-6 md:h-[640px]">
              <Lanyard frontImage="/lanyard/card-front.jpg" backImage="/lanyard/card-back.jpg" strapImage="/lanyard/band.png"
                strapColor="#0d1117" finish="glossy" size={0.62} strapLength={0.55} breeze={0.4} />
              <p className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[13px] text-brand-ink/40">Drag the card. Flip it over.</p>
            </motion.div>
            <motion.div {...rise} transition={{ ...SOFT, delay: 0.08 }} className="md:col-span-5 md:col-start-8">
              <h2 className="text-[clamp(30px,3vw,44px)] font-medium leading-[1.1] tracking-[-0.03em]">The developer</h2>
              <p className="mt-6 text-[clamp(18px,1.5vw,21px)] leading-[1.6] text-brand-ink/70">
                Ritesh Roshan designed and built Bespoke end to end: the text analytics pipeline that reads English and Hinglish, the tagger it trained and ships in the browser, the studio, the marketplace and this site.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                {SOCIAL.map((s, i) => (
                  <motion.a key={s.label} href={s.href} target="_blank" rel="noreferrer" whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }}
                    initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.15 + i * 0.06 }}
                    className={`group inline-flex h-14 items-center gap-3 rounded-full pl-5 pr-6 text-[16px] font-medium no-underline transition-[background-color,box-shadow] ${i === 0 ? "bg-brand-ink text-white hover:bg-[#232c3b]" : "text-brand-ink ring-1 ring-brand-ink/15 hover:bg-brand-ink/[.04] hover:ring-brand-ink/30"}`}>
                    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true"><path d={s.icon} /></svg>
                    {s.label}
                    <span className="text-[13px] opacity-50 transition-transform group-hover:translate-x-0.5">{s.handle}</span>
                  </motion.a>
                ))}
              </div>
            </motion.div>
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
              <div className="mt-14"><Cta href="/studio/talk/?new" size="lg" tone="light">Start a design</Cta></div>
            </motion.div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
