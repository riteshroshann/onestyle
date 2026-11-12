// Prints the product's top-1 help section id for each query on stdin (a JSON array), using the real BM25 retriever.
import { retrieve } from "../../../web/lib/assistant/retrieve.js";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
console.log(JSON.stringify(JSON.parse(raw).map((q) => retrieve(q, 1)[0]?.id ?? null)));
