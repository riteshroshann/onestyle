# Applications syllabus coverage

Author: Ritesh Roshan. Rows for Unit 1 (syntax, semantics), Unit 3 (neural: seq2seq, BERT, GPT) and Unit 4 (POS, NER, parsing, sentiment, MT, QA, summarisation). Every number below was written by a script into the named `results/` file. Evaluation sets are small; the size is given next to each number.

| Topic | Code | What it does for the product | Result | Status |
|---|---|---|---|---|
| Syntax (attachment of values to garment parts) | `web/scripts/eval-binding.mjs`, gold `data/gold/binding.jsonl` | Scores `bind()` in `web/lib/engine/spec.ts`: which value attaches to which part ("sleeve par loose" is a sleeve fit) | `results/binding.json` | Used in the product (the binder is deployed); study of it |
| Named entity recognition | `engine/bespoke/apps/ner.py` | Per-type report of the tagger that feeds the binder, for the gazetteer, the int8 ONNX model alone and the browser path | `results/ner.json` | Used in the product (the browser path is what ships) |
| Semantics (grounding unseen phrases to ontology values) | `engine/bespoke/apps/grounding.py`, gold `data/gold/grounding.jsonl` | Measures `groundFuzzy` (spelling variants the tagger finds) against edit distance and an embedding, with an abstention threshold | `results/grounding.json` | Study of a deployed function; a better rule is proposed, not shipped |

## Syntax: attachment of values to parts

Gold: `data/gold/binding.jsonl`, 132 requests (30 dev and 52 test from `requests.txt`, the 24 of `web/tests/requests.test.ts`, and 26 short postposition probes written to stress "par", "pe", "se" and "mein"). Each request carries its gold spans and the updates a tailor would take from it (`op slot=value`, with `~slight` or `~strong` and `@ref` where present). Canonical values follow the ontology; what is judged is the attachment: slot, operation, negation scope and comparison reference. Written independently of the binder's output (27 requests disagree with it, which would not happen if the gold were copied from it). One annotator.

Score is micro precision, recall and F1 of the set of triples per request, bootstrap interval over requests (1000 resamples, seed 13). "Gold spans" feeds the binder the annotated spans, so it isolates binding; "gazetteer spans" is the deployed no-model path.

The postposition set was written to find faults, so its score is a stress test, not a typical rate.

### Bug: "par" is a clause break and a postposition

`CLAUSE_BREAK` in `web/lib/engine/spec.ts` contains "par". After a part word it is the postposition "on": "sleeve par loose" binds loose to the bodice. Measured: the fix below recovers 6 gold attachments in 6 requests and breaks none (`results/binding.json`, key `par_fix`). It lifts the postposition set but leaves the other sets unchanged, because their requests rarely use "par".

Fix for the owner of `spec.ts`, replacing the `breaks` line in `bind()`:

```ts
const partEnd = new Set(spans.filter((s) => ["PART", "LOC", "NECKLINE", "SLEEVE"].includes(s.tag)).map((s) => s.end));
const breaks = tokens.map((t, i) => CLAUSE_BREAK.has(t) && !(t === "par" && partEnd.has(i)));
```

Not fixed by it, and visible in the `misses` list of the result: a clause keeps the context of its first part cue ("kamar pe fitted hip pe loose" puts both fits on the bodice, with "pe" not a break), context does not carry across a break ("sleeves full par loose nahi"), and "gale par 7 inch gehra" binds the number to garment length.

## Named entity recognition

`python scripts/apps.py ner`, about 12 s. Held-out gold: 52 test requests with 245 entities (the 30 dev requests, 133 entities, are in the file too). Exact-match span F1 over 21 entity types, bootstrap interval over requests. The ONNX file is the one the browser loads (int8 MiniLM, constrained Viterbi, then the merge rule of `web/lib/models.ts`: gazetteer spans win, model spans fill gaps), run here with onnxruntime on CPU, so the browser path is reproduced, not re-timed in a browser.

Test split micro F1: gazetteer 0.936 (0.898 to 0.967), model alone 0.792 (0.735 to 0.845), browser path 0.951 (0.916 to 0.980). The merge helps by 1.5 points, within the noise of 52 requests. Per-type F1, support and the confusion table are in `results/ner.json`. The weak types on test are SILHOUETTE (0.78, 10 entities), LOC (0.80, 2), NEG (0.86, 7) and PART (0.88, 23); the main confusions are part words missed (O for PART, 4 tokens) and silhouette words read as garments (2). The gazetteer was tuned while the gold was written (ontology 1.1 relabelled gold lines), so its score is optimistic; the model never saw gold.

## Semantics: grounding unseen phrases

`python scripts/apps.py grounding`, about 45 s (downloads nothing; the embedding model is read from the local Hugging Face cache). Gold: 199 phrases the gazetteer does not contain, written by one annotator: 143 misspellings and respellings with their ontology value, and 56 real garment words the ontology lacks (null: the right answer is to abstain). Even-numbered phrases pick each system's threshold, odd-numbered ones (99) report it. The Python trigram Dice reproduces the shipped TypeScript `groundFuzzy` on all 199 phrases (checked every run).

Each system takes the best-scoring ontology form of the tag and answers only above its threshold. Precision is correct answers over answers given; recall is correct answers over the 143 groundable phrases.

| System | Threshold | Precision | Recall | F1 on held-out half | False grounds on out-of-ontology words (all 56) |
|---|---|---|---|---|---|
| Trigram Dice (shipped, at 0.5, all 199) | 0.50 | 0.932 | 0.965 | 0.949 | 9 |
| Trigram Dice, tuned | 0.40 | 0.896 | 0.972 | 0.932 (0.882 to 0.973) | 10 |
| Edit-distance similarity | 0.66 | 0.971 | 0.944 | 0.957 (0.917 to 0.986) | 3 |
| Embedding cosine (bge-small-en-v1.5) | 0.72 | 0.828 | 0.747 | 0.785 (0.695 to 0.861) | 17 |
| Question answering (help-chatbot retrieval) | `web/scripts/eval-retrieval.mjs`, `engine/bespoke/apps/qa.py`, gold `data/gold/retrieval.jsonl` | Scores the deployed BM25 and its "answer or abstain" rule; compares dense and hybrid retrieval | `results/retrieval.json`, `results/retrieval_dense.json` | Study of the deployed retriever; the hybrid is not shipped |

Edit distance matches the shipped trigram rule on F1 (the intervals overlap widely at n = 99) and abstains on out-of-ontology words about three times as often (3 false grounds against 9). The embedding does worst: it is English-only and cannot see that "kurthi" is a spelling of "kurti". Proposal for the owner of `lexicon.ts`: keep trigram Dice, add an edit-similarity check of at least 0.66 before answering. The shipped errors (`deployed_errors` in the result) are mostly near words a tailor would also flag, such as "maximalist" read as minimal and "skintight" read as fitted. A few "false grounds" are arguable ("graduation ball" to farewell). The typos are synthetic, so real typing noise could behave differently.

## Question answering: help-chatbot retrieval

`node --experimental-strip-types scripts/eval-retrieval.mjs` (under 1 s) then `python scripts/apps.py qa` (about 30 s). Gold: 100 questions written against the 70-passage guide after it was fixed: 75 answerable (63 English, 12 Hinglish, each with one correct passage, phrased away from the guide's own wording), 10 off-topic and 15 near-topic ones the guide does not cover (refund, shipping, washing). One annotator, one correct passage per question, so a second reasonable passage counts as a miss. These questions are deliberately harder than the paraphrases in `web/tests/assistant.test.ts`, which sit close to the guide's wording.

| Arm | Recall@1 | Recall@3 | Recall@5 | MRR |
|---|---|---|---|---|
| BM25, deployed (`retrieve.js`) | 0.547 (0.44 to 0.67) | 0.720 | 0.827 | 0.671 (0.59 to 0.76) |
| Dense, bge-small-en-v1.5 | 0.533 (0.43 to 0.64) | 0.747 | 0.853 | 0.671 |
| Hybrid, reciprocal rank fusion | 0.600 (0.48 to 0.71) | 0.827 | 0.907 | 0.728 (0.64 to 0.81) |
| Sentiment (stance of a preference line) | `engine/bespoke/apps/sentiment.py`, gold `data/gold/sentiment.jsonl` | Reads "love this neckline", "no embroidery" or "not too deep" as wanted or rejected, for chat lines and for the exclusion list | `results/sentiment.json` | Study only; the shipped binder handles negation by rule |

n = 75 answerable questions, intervals are bootstrap over questions; the arms are within each other's intervals on Recall@1, so the only supported claim is that fusing the two does not hurt and probably helps at Recall@3 and @5. Python's BM25 MRR differs from the Node one in the third decimal because it also ranks the passages scoring zero.

Answerability: the deployed rule answers when the top BM25 score is at least 2.5. On this set it answers 74 of 75 answerable questions (coverage 0.99) and also answers 16 of the 25 unanswerable ones (abstains on 36%): the false answers are three off-topic questions (laptop wifi, which phone, translate) and 13 near-topic ones whose top passage shares a word with the question, for example the silk-fabric passage for a question about washing a silk kurti (`false_answers` in the result). AUROC of the top score for answerable against unanswerable is 0.844 for BM25 and 0.859 for the dense cosine (25 negatives, so intervals are wide: 0.72 to 0.94 and 0.77 to 0.93). Raising the 2.5 threshold to about 4.7 would abstain on 80% of unanswerable questions but would also drop 17% of answerable ones (threshold chosen on the same questions, so optimistic). Whether to move it is a product choice.

## Sentiment: stance towards the design

`python scripts/apps.py sentiment`, about 40 s on the laptop GPU. Gold: 210 lines written by one annotator in English and Hinglish, labelled neg (rejects or dislikes, including "no embroidery" and "not too deep"), neu (states or asks) or pos (likes or wants). 90 lines train, 120 test (40 per class). Mixed lines ("love the neck, sleeves too tight") are left out. The lexicon was written from the training lines and ordinary sense, but the same person wrote the test lines, so it is the system most exposed to leakage. The learned systems also train on 300 lines generated from ontology forms with approval, rejection and request templates.

| System (test, n = 120) | Accuracy | Macro F1 (95% interval) | Accuracy on lines with a negator (n = 25) |
|---|---|---|---|
| Majority class | 0.333 | 0.167 | 0.00 |
| Lexicon with negation scope (3 tokens) | 0.917 | 0.916 (0.859 to 0.958) | 0.80 |
| TF-IDF logistic regression, hand-written lines only | 0.867 | 0.865 (0.805 to 0.918) | 0.72 |
| TF-IDF logistic regression plus synthetic lines | 0.875 | 0.874 (0.809 to 0.926) | 0.84 |
| MiniLM fine-tuned plus synthetic lines (seed 13) | 0.908 | 0.909 (0.852 to 0.951) | 0.96 |
| Text summarisation (thread to one line) | `engine/bespoke/apps/summarise.py`, gold `data/gold/summaries.jsonl` | Compares the engine's `phrase()` (the line on the order card) with lead and TextRank extraction | `results/summarisation.json` | `phrase()` is used in the product; TextRank is study only |

MiniLM macro F1 over three seeds is 0.909, 0.909 and 0.843, so the learned model is the least stable. The intervals overlap throughout: the data cannot rank the lexicon, the logistic regression and MiniLM. What it does show is where each fails. The lexicon is perfect on neutral lines. Its 10 errors (listed in the result) are two kinds: negation scope, where Hindi puts the negator after the word ("pasand nahi aaya", "accha nahi lag raha") and a left-only window misses it, and "not too deep" or "not too flashy", where the lexicon flips an excess word to approval although the customer is asking for less; and approvals with no lexicon word ("this fit is just right"). The learned models do better on negator lines (0.84 and 0.96 against 0.80), but on 25 lines that gap is not significant. Not used in the product: `bind()` already turns "no" and "nahi" into `exclude` updates, and a stance model would only add value on free chat lines, which the maker chat could use to flag an unhappy customer.

## Summarisation: thread to one line

`python scripts/apps.py summarise`, about 2 s. Gold: 24 customer-maker threads of 5 to 6 turns (English and Hinglish, including one change of mind and two exclusions), each with a one-line reference summary written by one annotator, mean 16 words. The `phrase()` row runs the shipped TypeScript on the customer's turns. ROUGE is implemented in the module (lower-cased words, no stemming), so values are not comparable with other toolkits. Intervals are bootstrap over threads.

| System | Words | ROUGE-1 | ROUGE-2 | ROUGE-L (95% interval) |
|---|---|---|---|---|
| Lead: first turn | 5.2 | 0.315 | 0.128 | 0.290 (0.241 to 0.340) |
| Last customer turn | 4.6 | 0.392 | 0.210 | 0.362 (0.307 to 0.414) |
| TextRank, top 2 turns | 7.5 | 0.372 | 0.171 | 0.317 (0.269 to 0.366) |
| TextRank, top 2 customer turns | 9.2 | 0.556 | 0.258 | 0.364 (0.320 to 0.408) |
| All customer turns joined | 14.0 | 0.750 | 0.368 | 0.519 (0.478 to 0.561) |
| Engine `phrase()` | 14.3 | 0.694 | 0.342 | 0.525 (0.471 to 0.578) |
| Oracle: best 2 turns | 9.2 | 0.651 | 0.371 | 0.591 (0.550 to 0.634) |
| Machine translation (English tailor sheet to Hindi) | `engine/bespoke/apps/translate.py`, gold `data/gold/translation.jsonl` | Scores the Hindi tailor sheet the product prints against hand-written Hindi, next to a free local MT model | `results/translation.json` | The template system is used in the product; the neural model is study only |

TextRank beats the lead baseline on ROUGE-1 and ROUGE-L only within noise, and every extractive method that picks two turns stays below the oracle, because a design is spread over several turns. `phrase()` reads the whole thread into a state and writes a line from it; it matches the join of all customer turns on ROUGE-L (the intervals overlap) while being a normalised sentence rather than a transcript, and it handles a change of mind (thread 13) where extraction cannot. The references were written after reading the same turns, so every system that copies words from the customer scores high; ROUGE rewards that, and a structure-aware check of the slots would be the fairer measure. Not tested: an abstractive neural summariser.

## Machine translation: English tailor sheet to Hindi

`python scripts/apps.py translate`, about 25 s. Gold: 69 sheet rows as printed ("Neckline: V, front depth 6.75 in from the high shoulder point"), selected to cover every part of the sheet, each with a Hindi reference written by one annotator from the English alone. This is a small set of short rows, not a corpus: BLEU is corpus-level with effective order and is harsh on rows of two to ten words, so chrF++ is the better guide. The reference is one person's Hindi, not a panel's; "फिटेड" against the template's "फिट" counts as an error although both are in use.

| System | BLEU | chrF++ (corpus) | chrF++ per row (95% interval) | Exact match |
|---|---|---|---|---|
| Template system (deployed) | 64.1 | 76.7 | 79.3 (74.1 to 84.4) | 0.42 |
| opus-mt-en-hi (Helsinki-NLP, 75M parameters, beam 4) | 4.1 | 22.2 | 24.0 (20.0 to 28.6) | 0.00 |
| BERT (inside the deployed MiniLM tagger) | `engine/bespoke/apps/bert_probe.py` | Shows what the shipped int8 model knows at each layer and which heads look at part words | `results/bert_probe.json` | Study of the deployed model (read-only) |

A generic MT model has no tailoring vocabulary: it reads "Avoid" as "stay away", "Neckline" as a name, "sweetheart" as "जानेमन" and mangles the numbers. The template system's remaining misses are register choices (for example "ज़री" against "ज़री का काम") and one real defect: the Avoid row prints "नहीं चाहिए: कढ़ाई नहीं", saying "not wanted" twice, because `sheetLines` in `web/lib/engine/describe.ts` appends "नहीं" to each value under a label that already means "not wanted". The fix for the owner of that file is to drop the `${...} नहीं` suffix (or change the label to "बिना"). Exact match by part is in the result; Avoid and Back neck are 0 for that reason and for wording. Not tested: IndicTrans2 or a larger model, which do not fit this machine's budget of time; a human fluency judgement.

## BERT: a look inside the deployed MiniLM

`python scripts/apps.py bert-probe`, about 40 s. The probe runs on the int8 ONNX graph in `web/public/models/bespoke-tagger` with each layer's output and attention softmax added as extra outputs, so it describes the weights the browser runs.

Layer-wise probing: a linear classifier on each layer's first-subword vector predicts a word's entity type (21 types and O). It trains on 27,804 words from 1,500 synthetic requests and is scored on the 406 words of the 52 gold test requests. A control task (each word type gets a random label) measures how much the probe can memorise; selectivity is accuracy minus control accuracy (Hewitt and Liang, 2019). Majority class (O) is 0.305.

| Layer | 0 (embeddings) | 2 | 4 | 5 | 8 | 12 |
|---|---|---|---|---|---|---|
| Probe accuracy | 0.847 | 0.884 | 0.894 | 0.904 | 0.879 | 0.894 |
| Macro F1 over types | 0.791 | 0.829 | 0.857 | 0.869 | 0.801 | 0.828 |
| Control accuracy | 0.803 | 0.773 | 0.704 | 0.682 | 0.579 | 0.557 |
| Selectivity | 0.044 | 0.111 | 0.190 | 0.222 | 0.301 | 0.337 |

Even the embedding layer gets 0.85 because the gold words are mostly ontology words the model saw in training, but the probe there is mostly memorising words: selectivity is 0.04. Accuracy peaks in the middle (layer 5, 0.904) and flattens; selectivity keeps rising to the last layer (0.34), so later layers organise words by entity type rather than by identity. With 406 test words, differences of two or three points between layers are within noise; the trend in selectivity is not.

Attention: for the 58 value words (fit, length, dimension, sleeve style, silhouette, neckline) that share a request with a part or location cue word (82 gold dev and test requests), the share of attention that lands on the cue words, divided by the share uniform attention would give them. No head attaches values to parts: the layer averages are all below 1 (attention goes to neighbours and the special tokens), and the best heads (layer 7 head 5, layer 5 head 1) reach 1.5 times uniform, with 22% of their attention on cue words. Attachment is left to the rule-based binder, which is consistent with the syntax result above. Per-layer lifts and the top five heads are in the result.
