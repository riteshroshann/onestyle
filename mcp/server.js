#!/usr/bin/env node
// Bespoke over the Model Context Protocol (stdio): the guarded adviser, guide search, and links into the studio.
// Author: Ritesh Roshan
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { retrieve } from "../web/lib/assistant/retrieve.js";

const SITE = (process.env.BESPOKE_URL || "https://onestyle-tawny.vercel.app").replace(/\/$/, "");
const VIEWS = { new: "/studio/talk/?new", talk: "/studio/talk/", board: "/studio/board/", sheet: "/studio/sheet/", shop: "/studio/shop/", makers: "/makers/" };

const server = new McpServer({ name: "bespoke", version: "1.0.0" });
const text = (t) => ({ content: [{ type: "text", text: t }] });

server.registerTool("ask_bespoke", {
  title: "Ask Bespoke",
  description: "Ask Bespoke's adviser. It answers how Bespoke works (from its guides) and helps choose clothes: colour palettes, fabrics, necklines, sleeves, what suits an occasion. Off-topic questions are refused.",
  inputSchema: {
    question: z.string().min(1).max(600).describe("The question, in English or Hinglish"),
    design: z.string().max(300).optional().describe("The design so far, in a few words, e.g. 'for men, maroon, silk, kurta, for wedding'"),
  },
}, async ({ question, design }) => {
  try {
    const res = await fetch(`${SITE}/api/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: question, design, history: [] }), signal: AbortSignal.timeout(30000) });
    const body = await res.json();
    if (!body.answer) return { ...text(body.error ?? `Bespoke answered ${res.status}.`), isError: true };
    const sources = (body.sources ?? []).map((s) => s.title).slice(0, 2);
    const links = (body.links ?? []).map((l) => `${l.label}: ${SITE}${l.href}`);
    return text([body.answer, sources.length ? `From: ${sources.join("; ")}` : "", ...links].filter(Boolean).join("\n\n"));
  } catch (e) {
    return { ...text(`Could not reach Bespoke at ${SITE}: ${e.message}`), isError: true };
  }
});

server.registerTool("search_guides", {
  title: "Search Bespoke's guides",
  description: "Search Bespoke's help guides (measuring, the tailor sheet, the moodboard, makers, the glossary) and return the best passages. Runs locally, no network.",
  inputSchema: { query: z.string().min(1).max(300), limit: z.number().int().min(1).max(8).optional() },
}, async ({ query, limit }) => {
  const hits = retrieve(query, limit ?? 3);
  if (!hits.length) return text("No guide covers that.");
  return text(hits.map((h) => `## ${h.title}\n${h.text}`).join("\n\n"));
});

server.registerTool("studio_link", {
  title: "Link into the Bespoke studio",
  description: "A link that opens the Bespoke studio on a fresh design, the moodboard, the tailor sheet, shopping, or the makers page.",
  inputSchema: { view: z.enum(["new", "talk", "board", "sheet", "shop", "makers"]).optional() },
}, async ({ view }) => text(`${SITE}${VIEWS[view ?? "new"]}`));

await server.connect(new StdioServerTransport());
