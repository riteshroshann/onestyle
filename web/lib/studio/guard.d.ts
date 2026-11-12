// Types for the guardrails in lib/assistant/guard.js, which the studio also runs in the browser.
declare module "*/assistant/guard.js" {
  export function screen(message: string, history: unknown[]): { ok: true } | { ok: false; reason: string; reply: string };
}
