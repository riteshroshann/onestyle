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

/** The first frame: a magazine cover on paper, flanked by the next pages. */
function Cover() {
  const still = useReducedMotion();
  const { scrollY } = useScroll();
  const lift = useTransform(scrollY, [0, 900], [0, still ? 0 : -60]);
  const ghost = useTransform(scrollY, [0, 900], [0, still ? 0 : 90]);
  const enter = (d: number) => (still ? {} : { initial: { opacity: 0, y: 30 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1.2, ease: EASE, delay: d } });
  return (
    <section className="overflow-hidden px-3 pb-2.5 pt-[88px] md:px-0 md:pt-24">
      <div className="mx-auto grid h-[calc(100svh-7rem)] min-h-[640px] max-w-[1900px] grid-cols-1 gap-5 md:grid-cols-[14vw_1fr_14vw] md:gap-7">
        <motion.div {...enter(0.25)} className="relative hidden overflow-hidden rounded-[26px] md:-ml-[2vw] md:block">
          <img src={PHOTOS.underwater.src} alt="" className="h-full w-full object-cover" />
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
          <img src={PHOTOS.llamas.src} alt="" className="h-full w-full object-cover" />
          <span aria-hidden className="display absolute bottom-6 left-5 text-[5vw] font-black leading-[0.85] tracking-[-0.04em] text-white">Wear<br />it.</span>
        </motion.div>
      </div>
    </section>
  );
}

const WALL = "px-3 py-2.5 md:px-6";
const PANEL_H = "md:h-[calc(100svh-6.5rem)] md:min-h-[620px]";

/** A rounded print: photograph edge to edge, a scrim for the type set on it. */
function Panel({ photo, className = "", scrim = "bg-gradient-to-t from-black/75 via-black/20 to-black/5", children }: { photo: Photo; className?: string; scrim?: string; children?: React.ReactNode }) {
  return (
    <div className={`group relative overflow-hidden rounded-[26px] bg-black ${className}`}>
      <img src={photo.src} alt={photo.alt} loading="lazy" className={`absolute inset-0 h-full w-full scale-[1.07] object-cover ${settle} group-hover:scale-[1.11]`} />
      <div aria-hidden className={`absolute inset-0 ${scrim}`} />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** One spoken phrase at a time; the maker's order slip fills in beside it. */
function Brief() {
  const still = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const steps = BRIEF.length - 1;
  const [at, setAt] = useState(still ? steps : 1);
  useMotionValueEvent(scrollYProgress, "change", (v) => { if (!still) setAt(Math.min(steps, 1 + Math.floor(v * steps * 0.999))); });
  const said = BRIEF[at];
  return (
    <section ref={ref} aria-labelledby="brief-title" className={still ? "relative" : "relative h-[320vh]"}>
      <div className={`sticky top-[76px] ${WALL}`}>
        <div className={`relative overflow-hidden rounded-[26px] bg-brand text-brand-ink min-h-[640px] ${PANEL_H}`}>
          <div className="grid h-full content-between gap-10 p-6 md:grid-cols-12 md:content-center md:gap-6 md:p-14">
            <div className="md:col-span-7">
              <h2 id="brief-title" className="text-[15px] font-semibold text-brand-ink/65">You say</h2>
              <div className="relative mt-5 h-[2.2em] text-[clamp(52px,8vw,150px)]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.p key={said.said} className="display absolute inset-0 font-medium italic leading-[1.02] tracking-[-0.035em]"
                    initial={{ opacity: 0, y: "0.35em", filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: "-0.35em", filter: "blur(8px)" }} transition={{ duration: 0.7, ease: EASE }}>
                    {said.said.replace(/[,.]$/, "")}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
            <figure className="paper relative rounded-[18px] p-6 text-brand-ink shadow-[0_40px_90px_-30px_rgba(0,0,0,.9)] md:col-span-4 md:col-start-9 md:-rotate-[1.5deg] md:p-8">
              <figcaption className="flex items-baseline justify-between border-b border-brand-ink/15 pb-4">
                <span className="display text-[30px] font-black tracking-[-0.02em]">Kurti</span>
                <span className="text-[13px] font-semibold text-brand-ink/55">Your maker reads</span>
              </figcaption>
              <dl>
                {BRIEF.slice(1).map((b, i) => (
                  <div key={b.part} className="relative grid grid-cols-[8rem_1fr] items-baseline gap-3 border-b border-dashed border-brand-ink/20 py-3.5 last:border-0">
                    <dt className="text-[14px] font-medium text-brand-ink/55">{b.part}</dt>
                    <dd className={`text-[18px] font-semibold tracking-tight transition-[opacity,translate] duration-500 ${i + 1 <= at ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>{b.value}</dd>
                    <Mark className={`absolute -left-5 top-1/2 size-3.5 text-[#0284c7] -translate-y-1/2 transition-opacity duration-300 ${i + 1 === at ? "opacity-100" : "opacity-0"}`} />
                  </div>
                ))}
              </dl>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

function Archive() {
  return (
    <section aria-labelledby="show-title" className={WALL}>
      <div className={`grid gap-5 md:grid-cols-12 ${PANEL_H}`}>
        <Panel photo={PHOTOS.steps} className="aspect-[4/5] md:col-span-8 md:aspect-auto">
          <div className="flex h-full flex-col justify-end gap-6 p-6 text-white md:flex-row md:items-end md:justify-between md:p-12">
            <h2 id="show-title" className="display text-[clamp(64px,10vw,190px)] font-black leading-[0.84] tracking-[-0.045em]">Or show<br />us.</h2>
            <p className="max-w-[28ch] text-[16px] font-medium leading-[1.5] text-white/80 md:mb-3">Bring a photograph you love. Bespoke names every part of it, so a tailor can make it in your size.</p>
          </div>
        </Panel>
        <div className="grid gap-5 md:col-span-4 md:grid-rows-2">
          {[PHOTOS.underwater, PHOTOS.backs].map((photo) => (
            <Panel key={photo.src} photo={photo} className="aspect-[4/3] md:aspect-auto">
              <p className="absolute bottom-5 left-6 right-6 text-[14px] font-medium text-white/80">{photo.caption}</p>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}

function How() {
  const shots = [PHOTOS.flare, PHOTOS.sari, PHOTOS.llamas];
  return (
    <section id="how" aria-labelledby="how-title" className={`scroll-mt-20 ${WALL}`}>
      <h2 id="how-title" className="sr-only">How it works</h2>
      <ol className={`grid gap-5 md:grid-cols-3 ${PANEL_H}`}>
        {STEPS.map((s, i) => (
          <li key={s.n} className="contents">
            <Panel photo={shots[i]} className="aspect-[4/5] md:aspect-auto">
              <span className="absolute left-6 top-6 text-[15px] font-semibold tabular-nums text-brand md:left-8 md:top-8">{s.n}</span>
              <div className="absolute inset-x-6 bottom-6 text-white md:inset-x-8 md:bottom-8">
                <h3 className={`display text-[clamp(56px,6.4vw,124px)] font-black leading-[0.86] tracking-[-0.045em] ${settle} group-hover:-translate-y-2`}>{s.title}</h3>
                <p className="mt-4 max-w-[30ch] text-[16px] font-medium leading-[1.5] text-white/80">{s.body}</p>
              </div>
            </Panel>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Gallery() {
  return (
    <section aria-labelledby="picture-title" className={WALL}>
      <div className="overflow-hidden rounded-[26px] bg-[#f5f4f3] py-16 text-brand-ink md:py-24">
        <h2 id="picture-title" className="display mb-10 px-6 text-[clamp(52px,8vw,150px)] font-black leading-[0.86] tracking-[-0.045em] md:px-12">Start from a picture.</h2>
        <div className="flex w-full items-center justify-center overflow-hidden">
          <HoverExpand_001 images={GALLERY} />
        </div>
      </div>
    </section>
  );
}

function Makers() {
  return (
    <section className={WALL}>
      <ClipDiv imgSrc={PHOTOS.seamstress.src} className="aspect-[4/5] w-full overflow-hidden rounded-[26px] sm:aspect-video ">
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
    <section className={`${WALL} pb-6`}>
      <a href="/studio/" className="group relative block overflow-hidden rounded-[26px] bg-brand px-6 pb-10 pt-12 text-brand-ink no-underline outline-none focus-visible:ring-4 focus-visible:ring-white md:px-12 md:pb-14 md:pt-20">
        <p className="text-[15px] font-semibold text-brand-ink/65">Ready when you are.</p>
        <span className="display mt-6 flex items-center gap-[0.18em] text-[clamp(60px,12.5vw,250px)] font-black leading-[0.86] tracking-[-0.045em]">
          Start a design
          <Mark className={`size-[0.42em] text-brand-ink ${settle} group-hover:rotate-90 group-focus-visible:rotate-90`} />
        </span>
        <span aria-hidden className={`absolute inset-x-0 bottom-0 block h-3 origin-left scale-x-0 bg-brand-ink ${settle} group-hover:scale-x-100 group-focus-visible:scale-x-100`} />
      </a>
    </section>
  );
}

export function HomePage() {
  return (
    <ReactLenis root options={{ lerp: 0.12 }}>
      <div className="leather text-white">
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
