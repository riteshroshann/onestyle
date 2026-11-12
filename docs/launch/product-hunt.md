# Product Hunt launch kit

**Name:** Bespoke

**Tagline (60 max):** Clothes made from your words, in English or Hinglish

**Link:** https://onestyle-tawny.vercel.app/

**Topics:** Fashion, Artificial Intelligence, Design Tools, Productivity

**Thumbnail:** web/public/og.png (crop to 240 x 240 around the mark)

**Gallery (1270 x 760):**
1. The black Talk page: "Describe it. Wear it."
2. A conversation: a maroon silk kurta, with the design panel filling in
3. The moodboard with circled details and "Read the board"
4. The tailor sheet in Hindi, with measurements
5. Ask suggesting a colour palette for the open design

**Description (260 max):**
Say what you want made, the way you'd tell a friend, in English or Hinglish, typed or spoken. Bespoke asks only what's missing, reads your moodboard, and writes a tailor sheet in English or Hindi. Send it to a designer or tailor, or take it anywhere.

**First comment (maker):**
Hi, I'm Ritesh, and I built Bespoke.

Getting clothes made should be the easiest thing in the world in India. Every city has brilliant tailors. But the words never carry: the neckline comes back too deep, the sleeve too short, the colour a shade off.

Bespoke listens the way a good tailor does. Type "kurti chahiye, waist pe fitted, neeche se thoda loose, V neck thoda deep, no embroidery" and it understands each part: fitted at the waist, slightly loose below, a V about 6.75 inches deep, no embroidery. Then it asks only what's still open, most costly first.

Under the hood: a gazetteer and a fine-tuned 33M-parameter tagger run in your browser (0.953 span F1 on held-out requests), a language model helps when it's available, and CLIP reads the pictures you circle. Your words always win over pictures.

It's free to use. I'd love to hear what you'd make first, and what it got wrong.

Docs and how it's built: https://riteshroshann.github.io/onestyle/
