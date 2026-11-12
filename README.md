# bespoke

**Try it:** https://onestyle-tawny.vercel.app/ · **Docs:** https://riteshroshann.github.io/onestyle/

Describe the garment you want made, by typing or speaking, in English or Hinglish. Pin inspiration on a moodboard. Bespoke turns the words and the board into a part-by-part garment specification a tailor can cut from, with a tailor sheet in English and Hindi, Pinterest ideas and shopping links.

```
"kurti chahiye, waist pe fitted, neeche se thoda loose, V neck thoda deep, no embroidery"

  garment     kurti
  bodice fit  fitted            ease 1.5 in at bust and waist
  lower fit   loose, slightly   ease 4.25 in at hip
  neckline    V, 6.75 in deep   "thoda deep" sits between moderate and deep
  avoid       embroidery
  asks next   sleeve length, fabric, colour   (ranked by the cost of a wrong guess)
```

Understanding works in two layers, so it never depends on one point of failure:

1. **On the device, always.** The tokenizer and gazetteer (1,212 forms across 47 garment types, seasons, fabrics and styles, in English, Hinglish and Devanagari), a fine-tuned 33M-parameter BERT-family tagger (int8 ONNX, 33.8 MB), the binder that attaches values to garment parts and resolves sets ("a sweatshirt and pants") and seasons ("for the cold"), the state tracker and a garment-aware question policy. It answers instantly with no network and no key. `tests/requests.test.ts` holds it to 21 realistic requests.
2. **A language model, when configured.** `web/api/understand.js` is a Vercel function that sends the message and the current design to any OpenAI-compatible chat API and returns structured updates. Every value is checked against the ontology before use; details the ontology has no word for become notes for the tailor. If the function is not configured, times out or fails, the on-device answer stands and the customer never sees an error.

Pictures on the moodboard are read with CLIP in the browser; from a whole picture only garment type, colour and print are used, and only when one reading clearly wins. Sleeve and neckline come only from a part the customer circles. Pictures suggest; they never override words.

The research plan behind it (literature review, gap analysis, objectives, methodology, phases) is [docs/BESPOKE-research-plan.pdf](docs/BESPOKE-research-plan.pdf).

## The tagging ladder

Every model in the syllabus ladder is trained on the same data and scored on the same held-out requests. Span F1 (seqeval, strict), 95% bootstrap intervals over requests:

| rung | system | F1 | 95% CI |
|---|---|---|---|
| L0 | gazetteer, longest match | 0.936 | 0.898 to 0.967 |
| L2a | HMM, Viterbi | 0.751 | 0.693 to 0.809 |
| L2b | CRF | 0.832 | 0.789 to 0.876 |
| L2b | CRF + gazetteer feature | 0.900 | 0.853 to 0.942 |
| L3 | MiniLM-L12 (33M) + BIO-constrained Viterbi | 0.812 | 0.754 to 0.866 |
| L3 | **MiniLM + gazetteer (deployed)** | **0.953** | 0.918 to 0.982 |
| | same model, int8 ONNX in the browser | 0.792 | |

What we learned, honestly:

* The first BERT run scored 0.715, below the gazetteer. The errors showed positional bias: the templates had taught it that the second word of "{pattern} {fabric}" is a fabric. Fixing the *data* (attribute bags in random order, distractor words that must stay outside, three gold-label mistakes) took it to 0.884. The model was never the problem.
* On its own the transformer does not beat a good gazetteer on in-vocabulary text, and with ontology 1.1 it has a third more forms to learn from the same 12,000 training sentences (0.884 before, 0.812 now). Its value is recall on what the gazetteer has never seen: typos ("georget", "organzaa", "anarkalli"), new spellings, unlisted words in context. Gazetteer first, transformer filling the gaps, is the best system (recall 0.967).
* The test set is 52 requests written by the developers, separately from the templates. It is a seed set and is small; the intervals above say how small. The plan's BESPOKE-Spec benchmark (1,200 requests, 40% Hinglish, two annotators) replaces it.
* Ontology 1.1 widened the vocabulary to everyday Western, winter and casual wear. Seven gold labels that had marked dupatta, kaftan, dhoti pants, corset, choli and summer as outside the vocabulary were relabelled to match the new scope; nothing else in the gold set changed.

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
engine/tests/           unit, regression and latency tests for the engine and the exported model
web/                    Next.js static site; lib/engine mirrors the Python engine; tests/ holds the Node and browser suites
docs/                   research plan PDF and its LaTeX source
```

## Run the site

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm test             # parity with Python + engine behaviour
```

## Tests

```bash
cd web && npm test                                              # unit, regression (352 parity fixtures), negative and edge cases
cd web && npx next build                                        # the browser tests run against the production build
engine/.venv/Scripts/python -m pytest engine/tests -q           # engine unit, F1 regression floor, ONNX latency
engine/.venv/Scripts/python -m pytest web/tests/e2e -q          # smoke, functional, integration, usability, edge, latency (Playwright)
```

| kind | where | what it holds the system to |
|---|---|---|
| unit | `web/tests/unit.test.ts`, `engine/tests/test_engine.py` | tokenizer, gazetteer, BIO decoding, binding, the spec fold, questions, links |
| regression | `web/tests/engine.test.ts`, `engine/tests/test_regression.py` | the browser engine matches Python on 352 fixtures; deployed F1 stays at or above 0.93 |
| functional | `web/tests/requests.test.ts`, `web/tests/e2e/test_functional.py` | 21 realistic requests end to end; editing, contradictions, Hindi sheet, shop |
| integration | `web/tests/api.test.ts`, `web/tests/e2e/test_integration.py` | the model-API fallback, its validation and failure paths; tagger, engine and UI together |
| smoke | `web/tests/e2e/test_smoke.py` | the build serves, every page opens, the model files are shipped, no console errors |
| usability | `web/tests/e2e/test_usability.py` | axe-core WCAG 2 AA audit, keyboard-only use, 32px touch targets, no sideways scroll on a phone, reduced motion |
| negative and edge | `web/tests/edge.test.ts`, `web/tests/e2e/test_edge.py` | empty, 20,000-character, emoji, Devanagari, gibberish and contradictory input; markup in input; double send; blocked storage; model CDN unreachable |
| latency | `results/latency-*.json` | measured below |

Latency on a laptop CPU (Chromium, no GPU for the model):

| step | p50 | p95 |
|---|---|---|
| engine, one request, after tagging | 0.04 ms | 0.09 ms |
| int8 tagger, ONNX Runtime, one thread | 3.6 ms | 7.0 ms |
| tagger in the browser (transformers.js, WASM) | 20 ms | 53 ms |
| send to answer on screen | 75 ms | 130 ms |
| first contentful paint | 340 ms | |
| tagger first load, cold cache | 3.4 s | |

## Deploy

Import this repository on Vercel and set **Root Directory** to `web`. `vercel.json` builds a static export into `out/` and deploys `api/understand.js` as a function. The site works with no environment variables.

To switch on the language-model layer, add these in Vercel under Settings, Environment Variables, then redeploy:

| variable | value |
|---|---|
| `LLM_API_KEY` | an API key for the provider |
| `LLM_BASE_URL` | optional; default `https://generativelanguage.googleapis.com/v1beta/openai/` (Gemini, which has a free tier) |
| `LLM_MODEL` | optional; default `gemini-3.8-flash` |

Any OpenAI-compatible provider works: for OpenAI use `https://api.openai.com/v1/`, for Groq `https://api.groq.com/openai/v1/`, each with a model ID from the provider's current list. Voice input uses the browser's speech recognition where it works (Chrome, Edge, Safari). In Brave and Firefox, or if that service fails, the site records locally and transcribes on the device with Whisper, then corrects garment words the recogniser mangles ("curty" to kurti, "pass del" to pastel) using the ontology and the tagger's vocabulary.

## Not done yet

The Spark platform of the plan (MapReduce, DataFrame jobs, MLlib over H&M and Amazon), the Hinglish encoders (MuRIL, HingRoBERTa) as server-side taggers, FashionSigLIP attribute heads in place of zero-shot CLIP, the Qwen3.5-4B schema-decoding comparison, BESPOKE-Spec and the tailor study. The plan gives each a phase and an exit test.
