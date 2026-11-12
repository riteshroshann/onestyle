"use client";
import { ReactLenis } from "lenis/react";
import { type MotionValue, motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { HoverExpand_001 } from "@/components/ui/skiper-ui/skiper52";
import { ClipDiv } from "@/components/ui/skiper-ui/skiper66";
import { type Photo, PHOTOS } from "@/lib/photos";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";
import { Mark } from "../site/Mark";

// What a customer says, and what the maker reads from it. The hero measures one into the other.
const BRIEF = [
  { said: "kurti chahiye," },
  { said: "waist pe fitted,", part: "Bodice", value: "Fitted" },
  { said: "neeche se thoda loose,", part: "Below the waist", value: "Slightly loose" },
  { said: "V neck thoda deep,", part: "Neckline", value: "V, a little deep" },
  { said: "no embroidery.", part: "Avoid", value: "Embroidery" },
];
const STEPS = [
  { n: "1", title: "Say it.", body: "Type or speak, in English or Hinglish. No sizes, no jargon." },
  { n: "2", title: "See it.", body: "Every part of the garment named, with the measurement a tailor needs." },
  { n: "3", title: "Wear it.", body: "A maker near you cuts it to your body and sends it home." },
];
const ARCHIVE: { photo: Photo; frame: string }[] = [
  { photo: PHOTOS.steps, frame: "md:col-span-5 aspect-[3/4]" },
  { photo: PHOTOS.underwater, frame: "md:col-span-4 md:col-start-8 md:mt-48 aspect-[4/5]" },
  { photo: PHOTOS.backs, frame: "md:col-span-4 md:col-start-2 aspect-square" },
  { photo: PHOTOS.flare, frame: "md:col-span-6 md:col-start-7 aspect-[16/11]" },
];
const GALLERY = [13, 32, 20, 21, 19, 1, 2, 3, 4].map((n) => ({ src: `/images/skiper/${n}.jpeg`, alt: "Illustration by AarzooAly", code: "# 23" }));

const EASE = [0.32, 0.72, 0, 1] as const;
const settle = "transition-transform duration-700 ease-[cubic-bezier(.32,.72,0,1)]";

/** A tailor's tape: a cyan rule with tick marks, drawn left to right. */
function Tape({ scaleX, className }: { scaleX?: MotionValue<number>; className?: string }) {
  return (
    <motion.span aria-hidden style={scaleX ? { scaleX } : undefined}
      className={`tape absolute inset-x-0 block h-[9px] origin-left ${className ?? ""}`} />
  );
}

function Phrase({ said, part, value, i, progress }: { said: string; part?: string; value?: string; i: number; progress: MotionValue<number> }) {
  const start = 0.06 + (i - 1) * 0.19;
  const span = part ? [start, start + 0.15] : [0, 0.001];
  const drawn = useTransform(progress, span, [0, 1], { clamp: true });
  const ink = useTransform(drawn, [0, 1], ["rgba(255,255,255,.42)", "rgba(255,255,255,1)"]);
  const y = useTransform(drawn, [0, 1], [10, 0]);
  return (
    <span className="relative mr-[.24em] inline-block">
      <motion.span style={{ color: part ? ink : "#fff" }}>{said}</motion.span>
      {part && (
        <>
          <Tape scaleX={drawn} className="-bottom-[.06em]" />
          <motion.span style={{ opacity: drawn, y }}
            className="absolute left-0 top-full mt-[.28em] whitespace-nowrap font-sans text-[12px] font-semibold not-italic tracking-normal md:text-[15px]">
            <span className="text-white/55">{part}</span> <span className="text-brand">{value}</span>
          </motion.span>
        </>
      )}
    </span>
  );
}

/** The first frame: a magazine cover on paper, flanked by the next pages. */
function Cover() {
  const still = useReducedMotion();
  const { scrollY } = useScroll();
  const lift = useTransform(scrollY, [0, 900], [0, still ? 0 : -60]);
  const ghost = useTransform(scrollY, [0, 900], [0, still ? 0 : 90]);
  const enter = (d: number) => (still ? {} : { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.2, ease: EASE, delay: d } });
  return (
    <section className="leather overflow-hidden px-3 pb-6 pt-[88px] md:px-0 md:pt-24">
      <div className="mx-auto grid h-[calc(100svh-7rem)] min-h-[640px] max-w-[1900px] grid-cols-1 gap-5 md:grid-cols-[14vw_1fr_14vw] md:gap-7">
        <motion.div {...enter(0.25)} className="relative hidden overflow-hidden rounded-[26px] md:-ml-[2vw] md:block">
          <img src={PHOTOS.underwater.src} alt="" className="h-full w-full object-cover grayscale" />
        </motion.div>

        <motion.div {...enter(0)} className="paper relative overflow-hidden rounded-[26px] text-brand-ink">
          <motion.span aria-hidden style={{ y: ghost }}
            className="display pointer-events-none absolute inset-x-0 top-[6%] select-none text-center text-[27vw] font-black leading-[0.8] tracking-[-0.06em] text-brand-ink/[.07] md:text-[19vw]">
            Bespoke
          </motion.span>

          <h1 className="relative z-10 pt-6 text-center font-sans text-[13px] font-extrabold uppercase tracking-[0.18em] md:pt-8 md:text-[15px]">
            Clothes made from your words
          </h1>
          <Mark className="absolute left-8 top-7 z-10 hidden size-7 md:block" />

          <motion.div style={{ y: lift }} className="absolute bottom-0 left-1/2 h-[78%] w-[min(86%,34rem)] -translate-x-1/2 overflow-hidden rounded-t-full shadow-[0_40px_80px_-30px_rgba(13,17,23,.55)] md:h-[80%]">
            <img src={PHOTOS.profile.src} alt={PHOTOS.profile.alt} className="h-full w-full object-cover scale-[1.1] object-[50%_30%] grayscale contrast-[1.1]" />
          </motion.div>

          <div className="absolute bottom-6 left-6 z-10 hidden w-[15rem] md:bottom-10 md:left-10 md:block">
            <img src={PHOTOS.tennis.src} alt={PHOTOS.tennis.alt}
              className="mb-4 aspect-[3/4] w-24 -rotate-3 object-cover shadow-[0_18px_40px_-14px_rgba(0,0,0,.55)] ring-[3px] ring-white" />
            <p className="text-[13px] font-medium leading-[1.5] text-brand-ink/75">
              Draped, fitted or flared. Say how you want it to fall, in English or Hinglish, and nothing is lost on the way to the tailor.
            </p>
          </div>

          <div className="absolute bottom-6 left-6 z-10 md:bottom-10 md:left-auto md:right-10 md:w-[15rem]">
            <Mark className="mb-3 hidden size-20 -rotate-12 md:block" />
            <p className="mb-5 hidden text-[13px] font-medium leading-[1.5] text-brand-ink/75 md:block">
              From one sentence to a pattern a tailor can cut, made to your body by a maker near you.
            </p>
            <Cta href="/studio/" className="h-12 px-6 text-[15px] font-semibold">Start a design</Cta>
          </div>
        </motion.div>

        <motion.div {...enter(0.35)} className="relative hidden overflow-hidden rounded-[26px] md:-mr-[2vw] md:block">
          <img src={PHOTOS.llamas.src} alt="" className="h-full w-full object-cover grayscale" />
          <span aria-hidden className="display absolute bottom-6 left-5 text-[5vw] font-black leading-[0.85] tracking-[-0.04em] text-white">Wear<br />it.</span>
        </motion.div>
      </div>
    </section>
  );
}

function Brief() {
  const still = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const done = useMotionValue(1);
  const progress = still ? done : scrollYProgress;
  const cue = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  return (
    <section ref={ref} className={still ? "relative" : "relative h-[260vh]"}>
      <div className="sticky top-0 flex min-h-[100svh] flex-col justify-between gap-12 px-5 pb-12 pt-28 md:px-10 md:pb-16 md:pt-32">
        <div className="flex items-start justify-between gap-6">
          <h2 className="max-w-[18ch] text-[15px] font-semibold leading-snug text-white md:text-[17px]">Say it how you would say it to a friend.</h2>
          <p className="hidden text-right text-[15px] font-semibold text-white/55 md:block">What you say<br /><span className="text-brand">What your maker reads</span></p>
        </div>

        <p className="display max-w-[16ch] text-[clamp(38px,6.2vw,118px)] font-medium italic leading-[1.3] tracking-[-0.03em] md:max-w-none">
          {BRIEF.map((b, i) => <Phrase key={b.said} {...b} i={i} progress={progress} />)}
        </p>

        {!still && <motion.p style={{ opacity: cue }} className="text-[15px] font-semibold text-white/55">Scroll to see it measured</motion.p>}
      </div>
    </section>
  );
}

function Archive() {
  return (
    <section className="px-5 py-28 md:px-10 md:py-44">
      <div className="mx-auto grid max-w-[1600px] gap-x-6 gap-y-16 md:grid-cols-12 md:gap-y-28">
        <h2 className="display text-[clamp(64px,11vw,200px)] font-black leading-[0.86] tracking-[-0.04em] md:col-span-7">Or show us.</h2>
        <p className="max-w-[34ch] self-end text-[18px] leading-[1.55] text-white/70 md:col-span-4 md:col-start-9">
          Bring a photograph you love. Bespoke names every part of it, so a tailor can make it in your size.
        </p>
        {ARCHIVE.map(({ photo, frame }) => (
          <motion.figure key={photo.src} className={`group ${frame.split(" ").filter((c) => c.startsWith("md:")).join(" ")}`}
            initial={{ clipPath: "inset(18% 0 0 0)", opacity: 0 }} whileInView={{ clipPath: "inset(0% 0 0 0)", opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }} transition={{ duration: 1.1, ease: EASE }}>
            <div className={`overflow-hidden ${frame.split(" ").filter((c) => !c.startsWith("md:")).join(" ")}`}>
              <img src={photo.src} alt={photo.alt} loading="lazy" className={`h-full w-full scale-[1.06] object-cover grayscale ${settle} group-hover:scale-[1.11]`} />
            </div>
            <figcaption className="relative mt-4 pb-3 text-[14px] font-medium text-white/60">
              {photo.caption}
              <span aria-hidden className={`tape absolute inset-x-0 bottom-0 block h-[9px] origin-left scale-x-0 ${settle} group-hover:scale-x-100`} />
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </section>
  );
}

function How() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 px-5 pb-28 md:px-10 md:pb-44">
      <h2 id="how-title" className="sr-only">How it works</h2>
      <ol className="mx-auto max-w-[1600px]">
        {STEPS.map((s) => (
          <li key={s.n} className="group relative grid items-baseline gap-4 border-t border-white/15 py-10 md:grid-cols-12 md:gap-6 md:py-14">
            <span className="text-[15px] font-semibold tabular-nums text-brand md:col-span-1">{s.n}</span>
            <h3 className={`display text-[clamp(60px,9vw,168px)] font-black leading-[0.86] tracking-[-0.04em] md:col-span-6 ${settle} group-hover:translate-x-3`}>{s.title}</h3>
            <p className="max-w-[34ch] text-[18px] leading-[1.55] text-white/70 md:col-span-4 md:col-start-9">{s.body}</p>
            <span aria-hidden className={`absolute inset-x-0 -top-px block h-px origin-left scale-x-0 bg-brand ${settle} group-hover:scale-x-100`} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Gallery() {
  return (
    <section className="bg-[#f5f4f3] py-24 text-brand-ink md:py-40">
      <h2 className="display mx-auto mb-12 max-w-[1600px] px-5 text-[clamp(52px,8vw,140px)] font-black leading-[0.9] tracking-[-0.035em] md:px-10">Start from a picture.</h2>
      <div className="flex w-full items-center justify-center overflow-hidden">
        <HoverExpand_001 images={GALLERY} />
      </div>
    </section>
  );
}

function Makers() {
  return (
    <section className="px-5 py-28 md:px-10 md:py-44">
      <ClipDiv imgSrc={PHOTOS.seamstress.src} className="mx-auto aspect-[4/5] max-w-[1600px] sm:aspect-video lg:w-full [&>img]:grayscale">
        <div className="px-6 text-center text-white">
          <h2 className="display text-[clamp(56px,10vw,180px)] font-black leading-[0.86] tracking-[-0.04em]">For makers.</h2>
          <div className="mt-10 flex justify-center"><Cta href="/makers/" tone="light" className="h-14 px-8 text-[17px] font-semibold">Open the studio</Cta></div>
        </div>
      </ClipDiv>
    </section>
  );
}

function End() {
  return (
    <section className="px-5 pb-28 md:px-10 md:pb-44">
      <div className="mx-auto max-w-[1600px] border-t border-white/15 pt-16 md:pt-24">
        <p className="text-[15px] font-semibold text-white/55">Ready when you are.</p>
        <a href="/studio/" className="group relative mt-6 inline-block pb-6 text-white no-underline outline-none">
          <span className="display inline-flex items-center gap-[0.18em] text-[clamp(64px,13.5vw,260px)] font-black leading-[0.86] tracking-[-0.045em]">
            Start a design
            <Mark className={`size-[0.42em] ${settle} group-hover:rotate-90 group-focus-visible:rotate-90`} />
          </span>
          <span aria-hidden className={`tape absolute inset-x-0 bottom-0 block h-[12px] origin-left scale-x-0 ${settle} group-hover:scale-x-100 group-focus-visible:scale-x-100`} />
        </a>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <ReactLenis root options={{ lerp: 0.12 }}>
      <div className="bg-brand-ink text-white">
        <Header tone="dark" />
        <main>
          <Cover />
          <Brief />
          <Archive />
          <How />
          <Gallery />
          <Makers />
          <End />
        </main>
        <Footer />
      </div>
    </ReactLenis>
  );
}
