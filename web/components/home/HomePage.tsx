"use client";
import { ReactLenis } from "lenis/react";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";
import { HoverExpand_001 } from "@/components/ui/skiper-ui/skiper52";
import { ClipDiv } from "@/components/ui/skiper-ui/skiper66";
import { type Photo, PHOTOS } from "@/lib/photos";
import { Cta } from "../site/Cta";
import { Footer } from "../site/Footer";
import { Header } from "../site/Header";
import { Mark } from "../site/Mark";

// What a customer says, and the one thing the maker reads from it.
const BRIEF = [
  { said: "waist pe fitted", read: "Fitted bodice" },
  { said: "neeche se thoda loose", read: "Easy skirt" },
  { said: "V neck thoda deep", read: "Deep V" },
  { said: "no embroidery", read: "Plain" },
];
const STEPS: { title: string; photo: Photo }[] = [
  { title: "Say it.", photo: PHOTOS.flare },
  { title: "See it.", photo: PHOTOS.sari },
  { title: "Wear it.", photo: PHOTOS.llamas },
];
const GALLERY = [13, 32, 20, 21, 19, 1, 2, 3, 4].map((n) => ({ src: `/images/skiper/${n}.jpeg`, alt: "Illustration by AarzooAly", code: "# 23" }));

const EASE = [0.32, 0.72, 0, 1] as const;
const settle = "transition-transform duration-700 ease-[cubic-bezier(.32,.72,0,1)]";
const GUTTER = "px-3 md:px-5";
const DISPLAY = "display font-black leading-[0.86] tracking-[-0.045em]";

/** A rounded print: photograph edge to edge, darkened at the foot where the type sits. */
function Print({ photo, className = "", children }: { photo: Photo; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`group relative overflow-hidden rounded-[22px] bg-black ${className}`}>
      <img src={photo.src} alt={photo.alt} className={`absolute inset-0 h-full w-full scale-[1.06] object-cover ${settle} group-hover:scale-[1.1]`} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
      {children}
    </div>
  );
}

function Hero() {
  const still = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, still ? 0 : -60]);
  const rise = (d: number) => (still ? {} : { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.2, ease: EASE, delay: d } });
  return (
    <section className={`${GUTTER} pt-[84px]`}>
      <div className="grid gap-3 md:h-[calc(100svh-96px)] md:min-h-[600px] md:grid-cols-12 md:gap-5">
        <div className="order-2 flex flex-col justify-end gap-8 px-3 pb-8 pt-6 md:order-1 md:col-span-7 md:px-5 md:pb-10">
          <motion.h1 {...rise(0.15)} className={`${DISPLAY} text-[clamp(64px,10vw,200px)]`}>Made<br />from your<br />words.</motion.h1>
          <motion.div {...rise(0.3)}><Cta href="/studio/" tone="light" className="h-14 px-8 text-[17px] font-semibold">Start a design</Cta></motion.div>
        </div>
        <motion.div {...rise(0)} className="order-1 aspect-[4/5] md:order-2 md:col-span-5 md:aspect-auto">
          <div className="relative h-full overflow-hidden rounded-[22px] bg-black">
            <motion.img style={{ y }} src={PHOTOS.profile.src} alt={PHOTOS.profile.alt}
              className="absolute inset-0 h-[112%] w-full scale-[1.12] object-cover object-[45%_20%]" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Scroll turns each spoken phrase into the one word a maker cuts from. */
function Brief() {
  const still = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [at, setAt] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setAt(Math.min(BRIEF.length - 1, Math.floor(v * BRIEF.length))));
  const b = BRIEF[at];
  const swap = { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -40 }, transition: { duration: 0.6, ease: EASE } };
  return (
    <section ref={ref} aria-labelledby="brief-title" className={still ? "" : "h-[300vh]"}>
      <div className="sticky top-0 flex h-[100svh] flex-col items-center justify-center px-5 text-center">
        <h2 id="brief-title" className="sr-only">You say it, your maker reads it</h2>
        <div className="relative h-[1.1em] w-full text-[clamp(40px,7.5vw,140px)]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={b.said} {...swap} className="display absolute inset-x-0 font-medium italic leading-none tracking-[-0.03em] text-white/55">{b.said}</motion.p>
          </AnimatePresence>
        </div>
        <Mark className="my-8 size-8 rotate-90 md:my-10 md:size-10" />
        <div className="relative h-[1em] w-full text-[clamp(52px,10vw,190px)]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p key={b.read} {...swap} transition={{ ...swap.transition, delay: 0.08 }} className={`${DISPLAY} absolute inset-x-0 leading-none text-white`}>{b.read}</motion.p>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function How() {
  return (
    <section id="how" aria-labelledby="how-title" className={`scroll-mt-24 ${GUTTER}`}>
      <h2 id="how-title" className="sr-only">How it works</h2>
      <ol className="grid gap-3 md:h-[calc(100svh-24px)] md:min-h-[600px] md:grid-cols-3 md:gap-5">
        {STEPS.map((s) => (
          <li key={s.title} className="contents">
            <Print photo={s.photo} className="aspect-[4/5] md:aspect-auto">
              <h3 className={`${DISPLAY} absolute bottom-6 left-6 text-[clamp(60px,6.6vw,128px)] text-white md:bottom-9 md:left-9 ${settle} group-hover:-translate-y-2`}>{s.title}</h3>
            </Print>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Gallery() {
  return (
    <section aria-labelledby="picture-title" className={`${GUTTER} pt-3 md:pt-5`}>
      <div className="overflow-hidden rounded-[22px] bg-[#f5f4f3] pb-10 pt-16 text-brand-ink md:pb-16 md:pt-24">
        <h2 id="picture-title" className={`${DISPLAY} mb-10 px-6 text-[clamp(56px,8.5vw,164px)] md:mb-14 md:px-10`}>Start from<br />a picture.</h2>
        <div className="flex w-full items-center justify-center overflow-hidden">
          <HoverExpand_001 images={GALLERY} />
        </div>
      </div>
    </section>
  );
}

function Makers() {
  return (
    <section className={`${GUTTER} pt-3 md:pt-5`}>
      <ClipDiv imgSrc={PHOTOS.seamstress.src} className="aspect-[4/5] w-full sm:aspect-video lg:w-full">
        <div className="px-6 text-center text-white">
          <h2 className={`${DISPLAY} text-[clamp(64px,11vw,200px)]`}>For makers.</h2>
          <div className="mt-10 flex justify-center"><Cta href="/makers/" tone="light" className="h-14 px-8 text-[17px] font-semibold">Open the studio</Cta></div>
        </div>
      </ClipDiv>
    </section>
  );
}

function End() {
  return (
    <section className="px-5 pb-16 pt-28 md:px-10 md:pb-24 md:pt-44">
      <a href="/studio/" className="group relative inline-block pb-5 text-white no-underline outline-none">
        <span className={`${DISPLAY} flex items-center gap-[0.16em] text-[clamp(52px,11.5vw,236px)]`}>
          Start a design
          <Mark className={`size-[0.4em] shrink-0 ${settle} group-hover:rotate-90 group-focus-visible:rotate-90`} />
        </span>
        <span aria-hidden className={`absolute inset-x-0 bottom-0 block h-2 origin-left scale-x-0 bg-brand md:h-3 ${settle} group-hover:scale-x-100 group-focus-visible:scale-x-100`} />
      </a>
    </section>
  );
}

export function HomePage() {
  return (
    <ReactLenis root options={{ lerp: 0.12 }}>
      <div className="bg-brand-ink text-white">
        <Header tone="dark" />
        <main>
          <Hero />
          <Brief />
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
