// Speaks to the server over a real stdio pipe: lists the tools, searches the guides, builds a link.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "bespoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL("./server.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")] }));
const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), ["ask_bespoke", "search_guides", "studio_link"]);
const found = await client.callTool({ name: "search_guides", arguments: { query: "how do I measure my bust" } });
assert.match(found.content[0].text, /How to measure your bust/);
const link = await client.callTool({ name: "studio_link", arguments: { view: "board" } });
assert.match(link.content[0].text, /\/studio\/\?view=board$/);
await client.close();
console.log("ok: 3 tools, guide search, studio link");
