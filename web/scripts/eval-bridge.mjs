// Runs the deployed TypeScript engine for the Python studies: JSON on stdin, JSON on stdout.
// Each item is {messages: [...]} (gazetteer spans) or {tokens, spans} (spans supplied by a tagger).
// Author: Ritesh Roshan
import { tagRules, tokenize } from "../lib/engine/lexicon.ts";
import { apply, bind, emptySpec, wearerUpdates } from "../lib/engine/spec.ts";
import { phrase, sheetLines } from "../lib/engine/describe.ts";
import { triple } from "./eval-common.mjs";

function run(item) {
  if (item.tokens) return { triples: bind(item.tokens, item.spans.map((s) => ({ ...s })), "words").map(triple) };
  let spec = emptySpec();
  const triples = [];
  for (const m of item.messages) {
    const tokens = tokenize(m);
    const ups = [...bind(tokens, tagRules(tokens), "words"), ...wearerUpdates(m)];
    triples.push(ups.map(triple));
    spec = apply(spec, ups);
  }
  return { triples, phrase: phrase(spec), sheet: sheetLines(spec).map(({ part, en, hi }) => ({ part, en, hi })) };
}

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
process.stdout.write(JSON.stringify(JSON.parse(input).items.map(run)));
