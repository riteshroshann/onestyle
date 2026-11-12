// Builds the BM25 index for the help assistant from lib/assistant/corpus/*.md.
// Each "## " section is one chunk. Run: node scripts/build-assistant-index.mjs
// Author: Ritesh Roshan
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../lib/assistant/retrieve-tokens.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "assistant");
const MIN_WORDS = 60;
const MAX_WORDS = 180;

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sectionsOf(file, markdown) {
  const source = file.replace(/\.md$/, "");
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [title, ...rest] = block.split("\n");
      return { id: `${source}/${slug(title)}`, title: title.trim(), source, text: rest.join("\n").trim() };
    });
}

function checkSize(chunk) {
  const words = chunk.text.split(/\s+/).length;
  if (words < MIN_WORDS || words > MAX_WORDS) throw new Error(`${chunk.id}: ${words} words, want ${MIN_WORDS}-${MAX_WORDS}`);
}

function buildIdf(docs) {
  const df = new Map();
  for (const tokens of docs) for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = {};
  for (const [t, d] of df) idf[t] = Math.log(1 + (n - d + 0.5) / (d + 0.5));
  return idf;
}

const files = readdirSync(join(root, "corpus")).filter((f) => f.endsWith(".md")).sort();
const chunks = files.flatMap((f) => sectionsOf(f, readFileSync(join(root, "corpus", f), "utf8")));
chunks.forEach(checkSize);

const ids = new Set(chunks.map((c) => c.id));
if (ids.size !== chunks.length) throw new Error("duplicate section titles inside one file");

// The title is indexed too, so a question that names a section finds it.
const docs = chunks.map((c) => tokenize(`${c.title} ${c.title} ${c.text}`));
const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / docs.length;

writeFileSync(join(root, "index.json"), JSON.stringify({ chunks, idf: buildIdf(docs), avgLen }));
console.log(`indexed ${chunks.length} sections from ${files.length} files, avg ${avgLen.toFixed(0)} tokens`);
