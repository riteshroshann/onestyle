"use client";
import { ReactLenis } from "lenis/react";
import { motion, useReducedMotion, useScroll } from "motion/react";
import { useRef } from "react";
import { CharacterV1, CharacterV3 } from "@/components/ui/skiper-ui/skiper31";
import { CrowdCanvas } from "@/components/ui/skiper-ui/skiper39";
import { HoverExpand_001 } from "@/components/ui/skiper-ui/skiper52";
import { ClipDiv } from "@/components/ui/skiper-ui/skiper66";
import { PHOTOS } from "@/lib/photos";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";

const STEPS = [
  { n: "1", title: "Say it.", body: "Type or speak. English or Hinglish." },
  { n: "2", title: "See it.", body: "Every part, every measurement." },
  { n: "3", title: "Wear it.", body: "Sent to a maker. Cut for you." },
];
const SAID = ["waist pe fitted", "neeche se thoda loose", "V neck thoda deep", "no embroidery"];
const READS = [["Bodice", "Fitted"], ["Below the waist", "Slightly loose"], ["Neckline", "V, a little deep"], ["Avoid", "Embroidery"]];
const FAN = [PHOTOS.tennis, PHOTOS.horizon, PHOTOS.flare, PHOTOS.underwater, PHOTOS.llamas, PHOTOS.silhouette, PHOTOS.backs];
const GALLERY = [PHOTOS.profile, PHOTOS.steps, PHOTOS.horizon, PHOTOS.flare, PHOTOS.silhouette, PHOTOS.monument, PHOTOS.llamas, PHOTOS.dusk];
const WORD = "Made to measure.".split("");

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { type: "spring", duration: 0.9, bounce: 0 } } as const;

function Hero() {
  const still = useReducedMotion();
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-5 pt-32 md:px-10 md:pt-40">
        <h1 className="display text-[clamp(56px,10.4vw,180px)]">
          Clothes, made
          <span className="block italic">from your words.</span>
        </h1>
        <div className="mt-10 md:mt-12"><Cta href="/studio/" className="h-14 px-9 text-[17px] font-semibold">Start a design</Cta></div>
      </div>
      {/* the people it is for, walking through */}
      <div className="relative mt-auto h-[38svh] min-h-[240px] w-full md:h-[42svh]">
        {!still && <CrowdCanvas src="/images/peeps/all-peeps.png" rows={15} cols={7} />}
      </div>
    </section>
  );
}

function Measure() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const centre = Math.floor(WORD.length / 2);
  const fanCentre = Math.floor(FAN.length / 2);
  return (
    <section ref={ref} className="relative h-[190vh] bg-foreground text-background">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center gap-[7vh] overflow-hidden px-5">
        <h2 className="display text-center text-[clamp(44px,9.5vw,160px)]" style={{ perspective: "600px" }} aria-label="Made to measure.">
          {WORD.map((char, i) => <CharacterV1 key={i} char={char} index={i} centerIndex={centre} scrollYProgress={scrollYProgress} />)}
        </h2>
        <div className="flex items-center justify-center gap-[1vw]" aria-hidden>
          {FAN.map((photo, i) => (
            <CharacterV3 key={photo.src} char={photo.src} index={i} centerIndex={fanCentre} scrollYProgress={scrollYProgress}
              className="h-[17vw] w-[12vw] rounded-[3px] grayscale md:h-[14vw] md:w-[10vw]" />
          ))}
        </div>
      </div>
    </section>
  );
}

function Gallery() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-40">
      <motion.h2 {...rise} className="display mb-12 text-[clamp(44px,7vw,112px)]">Start from a picture.</motion.h2>
      <HoverExpand_001 images={GALLERY} />
    </section>
  );
}

function How() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-foreground">
      <div className="mx-auto max-w-[1440px] px-5 py-24 md:px-10 md:py-40">
        <ol className="grid gap-14 md:grid-cols-3 md:gap-10">
          {STEPS.map((s, i) => (
            <motion.li key={s.n} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }} className="group border-t-[3px] border-foreground pt-6">
              <span className="text-[15px] font-semibold tabular-nums">0{s.n}</span>
              <h3 className="display mt-6 text-[clamp(52px,6vw,96px)] transition-[letter-spacing] duration-500 ease-out group-hover:tracking-[-0.01em]">{s.title}</h3>
              <p className="mt-4 text-[18px] font-medium text-foreground/70">{s.body}</p>
            </motion.li>
          ))}
        </ol>

        <div className="mt-28 grid gap-14 md:mt-40 md:grid-cols-2 md:gap-24">
          <motion.div {...rise}>
            <p className="text-[15px] font-semibold">You say</p>
            <p className="display mt-5 text-[clamp(32px,4vw,60px)] leading-[1.12]">
              kurti chahiye,{" "}
              {SAID.map((phrase, i) => (
                <span key={phrase}><span className="stitched">{phrase}</span>{i < SAID.length - 1 ? ", " : ""}</span>
              ))}
            </p>
          </motion.div>
          <motion.div {...rise}>
            <p className="text-[15px] font-semibold">Your maker reads</p>
            <dl className="mt-5">
              {READS.map(([part, value]) => (
                <div key={part} className="grid grid-cols-[10rem_1fr] items-baseline gap-4 border-t border-foreground/15 py-5 last:border-b">
                  <dt className="text-[15px] font-medium text-foreground/60">{part}</dt>
                  <dd className="text-[24px] font-semibold tracking-tight">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Makers() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-24 md:px-10 md:pb-40">
      <ClipDiv imgSrc={PHOTOS.seamstress.src} className="aspect-[4/5] sm:aspect-video lg:w-full [&>img]:grayscale">
        <div className="px-6 text-center text-white">
          <h2 className="display text-[clamp(48px,8vw,128px)]">For makers.</h2>
          <a href="/makers/" className="press mt-8 inline-flex h-14 items-center rounded-full bg-white px-9 text-[17px] font-semibold text-black no-underline hover:bg-white/90">Open the studio</a>
        </div>
      </ClipDiv>
    </section>
  );
}

function End() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-28 text-center md:px-10 md:pb-44">
      <motion.h2 {...rise} className="display text-[clamp(52px,10vw,168px)]">Ready when <span className="italic">you are.</span></motion.h2>
      <div className="mt-12 flex justify-center"><Cta href="/studio/" className="h-14 px-9 text-[17px] font-semibold">Start a design</Cta></div>
    </section>
  );
}

export function HomePage() {
  return (
    <ReactLenis root options={{ lerp: 0.12 }}>
      <Header />
      <main>
        <Hero />
        <Measure />
        <Gallery />
        <How />
        <Makers />
        <End />
      </main>
      <Footer />
    </ReactLenis>
  );
}
