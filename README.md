# bespoke

Describe what you wish to wear, by typing or speaking, in English or Hinglish. Pin inspiration on a moodboard. Bespoke turns the words and the board into a part-by-part garment specification a tailor can cut from, with a tailor sheet in English and Hindi, Pinterest ideas and shopping links.

```
"kurti chahiye, waist pe fitted, neeche se thoda loose, V neck thoda deep, no embroidery"

  garment     kurti
  bodice fit  fitted            ease 1.5 in at bust and waist
  lower fit   loose, slightly   ease 4.25 in at hip
  neckline    V, 6.75 in deep   "thoda deep" sits between moderate and deep
  avoid       embroidery
  asks next   sleeve length, fabric, colour   (ranked by the cost of a wrong guess)
```

Everything runs in the browser: the tokenizer and gazetteer, a fine-tuned 33M-parameter BERT-family tagger (int8 ONNX, 33.8 MB), the binder that attaches values to garment parts, the state tracker, the question policy, and CLIP for the moodboard images. Nothing the customer types or uploads leaves the page.

The research plan behind it (literature review, gap analysis, objectives, methodology, phases) is [docs/BESPOKE-research-plan.pdf](docs/BESPOKE-research-plan.pdf).

## The tagging ladder

Every model in the syllabus ladder is trained on the same data and scored on the same held-out requests. Span F1 (seqeval, strict), 95% bootstrap intervals over requests:

| rung | system | F1 | 95% CI |
|---|---|---|---|
| L0 | gazetteer, longest match | 0.945 | 0.907 to 0.974 |
| L2a | HMM, Viterbi | 0.770 | 0.711 to 0.826 |
| L2b | CRF | 0.869 | 0.810 to 0.916 |
| L2b | CRF + gazetteer feature | 0.931 | 0.889 to 0.967 |
| L3 | MiniLM-L12 (33M) + BIO-constrained Viterbi | 0.884 | 0.837 to 0.926 |
| L3 | **MiniLM + gazetteer (deployed)** | **0.955** | 0.919 to 0.981 |
| | same model, int8 ONNX in the browser | 0.878 | |

What we learned, honestly:

* The first BERT run scored 0.715, below the gazetteer. The errors showed positional bias: the templates had taught it that the second word of "{pattern} {fabric}" is a fabric. Fixing the *data* (attribute bags in random order, distractor words that must stay outside, three gold-label mistakes) took it to 0.884. The model was never the problem.
* On its own the transformer does not beat a good gazetteer on in-vocabulary text. Its value is recall on what the gazetteer has never seen: typos ("georget", "organzaa", "anarkalli"), new spellings, unlisted words in context. Gazetteer first, transformer filling the gaps, is the best system (recall 0.967).
* The test set is 52 requests written by the developers, separately from the templates. It is a seed set and is small; the intervals above say how small. The plan's BESPOKE-Spec benchmark (1,200 requests, 40% Hinglish, two annotators) replaces it.

Reproduce from `engine/`:

```bash
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe torch --index-url https://download.pytorch.org/whl/cu126
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
python scripts/ladder.py data        # synthetic + Myntra weak labels + gold split
python scripts/ladder.py classic     # rules, HMM, CRF
python scripts/ladder.py bert        # MiniLM fine-tune, about 3 minutes on an RTX 4050
python scripts/ladder.py export      # int8 ONNX into web/public/models
python scripts/check_onnx.py         # ONNX must match PyTorch
```

Results land in `results/tagging.json`. For the weak-label catalogue source, put Kaggle's Fashion Product Images `styles.csv` at `data/raw/styles.csv` (or point `BESPOKE_MYNTRA_CSV` at it); without it the data step uses synthetic requests only.

## How a request becomes a specification

1. **Tokenize and tag.** One regex tokenizer and one ontology-driven gazetteer, identical in Python and TypeScript (352 parity fixtures). The transformer tags words the gazetteer misses; decoding is Viterbi with BIO constraints, so `I-FIT` can never follow `O`.
2. **Bind.** Clauses are cut at punctuation and conjunctions (including "aur", "par", "lekin"). Inside a clause, values attach to the nearest part cue ("waist", "neeche se", "back"), intensity ("thoda", "bahut") and negation ("no", "nahi", "mat", in either word order) attach to the nearest value. Typos are grounded by character-trigram similarity.
3. **Track state.** Each message produces updates (`set`, `add`, `exclude`, `compare`); the spec is a fold over them, so it is versioned and replayable. Words beat board evidence; answers and edits beat both.
4. **Ask.** Critical slots that are missing or uncertain are ranked by cost × (1 − confidence) and at most three are asked, with options. Neckline depth carries the highest cost because a neckline can be deepened at the trial but never raised.
5. **Board.** The Excalidraw scene becomes a graph: images numbered in reading order, circles inside images, notes bound by arrows or position, negative notes ("not this colour"). CLIP scores each image and each circled crop; evidence is pooled per slot with salience weights and signed polarity. "Deeper than #1 but less than #2" becomes an interval in inches, with the proposal toward the shallow end, or a question if the references contradict each other.
6. **Out.** The tailor sheet (English or Hindi, printable, finished measurements = body + ease), Pinterest idea searches and shopping searches (Myntra, Ajio, Amazon, Flipkart, Nykaa Fashion), fabric and tailors nearby. These are plain search links: Pinterest's developer terms forbid storing pins or training on them without written consent, so the app does neither.

## Layout

```
ontology/bespoke.json   single source of truth: 21 tags, 920 forms (English, Hinglish, Devanagari), Hindi terms, ease and depth tables, slot costs
engine/bespoke/         lexicon (tokenizer, gazetteer), data (templates, weak labels, gold markup), decode (constrained Viterbi)
engine/scripts/         ladder.py (data, classic, bert, export), check_onnx.py
data/gold/              hand-written requests in bracket markup
results/                tagging.json
web/                    Next.js static site; lib/engine mirrors the Python engine; tests/engine.test.ts
docs/                   research plan PDF and its LaTeX source
```

## Run the site

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm test             # parity with Python + engine behaviour
```

## Deploy

Import this repository on Vercel and set **Root Directory** to `web`. `vercel.json` builds a static export into `out/`; no environment variables are needed. Voice input uses the browser's speech recognition (Chrome, Edge, Safari); Firefox users type.

## Not done yet

The Spark platform of the plan (MapReduce, DataFrame jobs, MLlib over H&M and Amazon), the Hinglish encoders (MuRIL, HingRoBERTa) as server-side taggers, FashionSigLIP attribute heads in place of zero-shot CLIP, the Qwen3.5-4B schema-decoding comparison, BESPOKE-Spec and the tailor study. The plan gives each a phase and an exit test.
