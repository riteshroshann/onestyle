// Prints the product guard's verdict ("ok" or the refusal reason) for each message on stdin (a JSON array).
import { screen } from "../../../web/lib/assistant/guard.js";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
console.log(JSON.stringify(JSON.parse(raw).map((m) => { const r = screen(m, []); return r.ok ? "ok" : r.reason; })));
