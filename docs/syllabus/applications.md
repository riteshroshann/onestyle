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

Edit distance matches the shipped trigram rule on F1 (the intervals overlap widely at n = 99) and abstains on out-of-ontology words about three times as often (3 false grounds against 9). The embedding does worst: it is English-only and cannot see that "kurthi" is a spelling of "kurti". Proposal for the owner of `lexicon.ts`: keep trigram Dice, add an edit-similarity check of at least 0.66 before answering. The shipped errors (`deployed_errors` in the result) are mostly near words a tailor would also flag, such as "maximalist" read as minimal and "skintight" read as fitted. A few "false grounds" are arguable ("graduation ball" to farewell). The typos are synthetic, so real typing noise could behave differently.
