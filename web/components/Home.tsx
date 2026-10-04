"use client";
import { Orb } from "./Orb";

const STEPS = [
  { n: "1", title: "Describe it", body: "Type or speak the way you would to a tailor, in English or Hinglish. Add pictures you love to a moodboard." },
  { n: "2", title: "Refine it", body: "Bespoke asks only what matters to the cut: fit, length, neckline, fabric. Change any detail with a tap, pick colours from a palette." },
  { n: "3", title: "Have it made", body: "Take a tailor sheet in English or Hindi, with measurements and ease, to your tailor. Or find something close in the shops you already use." },
];
const POINTS = [
  { title: "Understands how you talk", body: "“Neeche se thoda loose”, “not too flashy”, “deeper than this one”. Hinglish, spelling slips and rules-outs are all understood." },
  { title: "Reads your whole moodboard", body: "Pictures, circled details and notes with arrows are read together, so a sleeve from one picture and a colour from another become one design." },
  { title: "Made for the cutting table", body: "Every detail is written part by part, with where it came from, so your tailor knows what you said and what is a suggestion." },
  { title: "Private by design", body: "Understanding your words happens in your browser. Your messages, pictures and measurements stay on your device." },
];

export function Home({ onStart }: { onStart: () => void }) {
  return (
    <main className="home">
      <section className="home-hero">
        <div className="home-copy fade">
          <h1>Clothes, made<em>from your words.</em></h1>
          <p className="lede">Bespoke turns the way you describe a garment, and the pictures you love, into a design your tailor can cut from. Every part, every measurement, nothing lost in a chat.</p>
          <div className="home-cta">
            <button className="btn big" onClick={onStart}>Start a design</button>
            <a className="btn quiet big" href="#how">How it works</a>
          </div>
        </div>
        <div className="home-orb fade"><Orb size={420} /></div>
      </section>

      <section className="home-band" id="how">
        <h2>How it works</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <article className="step" key={s.n}>
              <span className="num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-band">
        <div className="example">
          <div>
            <span className="eyebrowless">You say</span>
            <p className="said-big">kurti chahiye, <span className="stitch">waist pe fitted</span>, <span className="stitch">neeche se thoda loose</span>, <span className="stitch">V neck thoda deep</span>, <span className="stitch">no embroidery</span></p>
          </div>
          <div>
            <span className="eyebrowless">Your tailor reads</span>
            <dl className="example-spec">
              <div><dt>Bodice</dt><dd>fitted, 1.5 in ease</dd></div>
              <div><dt>Below the waist</dt><dd>slightly loose, 4.25 in ease</dd></div>
              <div><dt>Neckline</dt><dd>V, 6.75 in deep</dd></div>
              <div><dt>Avoid</dt><dd>embroidery</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="home-band">
        <h2>Why it works</h2>
        <div className="points">
          {POINTS.map((p) => (
            <article className="point" key={p.title}><h3>{p.title}</h3><p>{p.body}</p></article>
          ))}
        </div>
      </section>

      <section className="home-end">
        <h2>Ready when you are.</h2>
        <button className="btn big" onClick={onStart}>Start a design</button>
      </section>
      <footer className="home-foot"><span>Bespoke</span><a href="/licenses.txt">Open-source notices</a></footer>
    </main>
  );
}
