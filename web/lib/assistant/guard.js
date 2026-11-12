// Guardrails for the help assistant: pure functions, no network.
// screen() runs before anything is sent to a model, redact() masks personal details, checkAnswer() vets the reply.
// Author: Ritesh Roshan

export const MAX_MESSAGE = 600;
export const MAX_HISTORY_TURNS = 12;
export const MAX_ANSWER = 1200;

// Planted in the system prompt; an answer that repeats it has leaked the prompt.
export const SYSTEM_MARKER = "BESPOKE-ASSISTANT-RULES-7f3a";

export const FALLBACK = "I can only help with Bespoke: describing a garment, the moodboard, measurements, the tailor sheet and working with a maker.";

const REPLIES = {
  empty: "Ask me anything about Bespoke, such as how to describe a garment or take a measurement.",
  too_long: "That is a little long for me. Could you shorten it to a few sentences?",
  injection: "I can't change how I work, but I am happy to help with Bespoke: describing a garment, the moodboard, measurements or the tailor sheet.",
  secrets: "I don't have access to keys, passwords or any private settings, and I can't share them. I can help with Bespoke itself.",
  self_harm: "I'm sorry you are going through this. You deserve support from a real person, so please reach out to someone you trust or to your local emergency services right now.",
  advice: "That is outside what I can help with, and a qualified professional would serve you better. I can help with Bespoke: describing a garment, measurements and the tailor sheet.",
  unsafe: "I can't help with that. I am glad to help with Bespoke: describing a garment, the moodboard, measurements or the tailor sheet.",
};

/** Each rule: [reason, pattern]. Order matters: the first match decides the reply. */
const RULES = [
  ["self_harm", /\b(kill(ing)? myself|suicide|suicidal|end my life|want to die|hurt myself|self[- ]?harm|khudkushi|jeena nahi chahta|jeena nahi chahti)\b/i],
  ["injection", /\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|earlier|all|any|your|the|these)\b.{0,30}\b(instructions?|rules?|prompts?|guidelines?|guardrails?|restrictions?)\b/i],
  ["injection", /\b(reveal|show|print|repeat|display|leak|tell me|what (is|are)|share)\b.{0,30}\b(system|hidden|initial|original|your)\b.{0,15}\b(prompt|instructions?|rules)\b/i],
  ["injection", /\bsystem prompt\b|\bdeveloper mode\b|\bjailbreak\b|\bdan mode\b|\bnew instructions?\b|<\/?(system|assistant|instructions?)>/i],
  ["injection", /\byou are now\b|\bfrom now on you\b|\bact (as|like) (a|an|the|if|my)\b|\bpretend (to be|you are|you're)\b|\broleplay as\b/i],
  ["injection", /\b(base64|decode this|decode the following)\b|[A-Za-z0-9+/]{40,}={0,2}/i],
  ["secrets", /\b(api[- ]?keys?|secret keys?|access tokens?|auth tokens?|llm_api_key|environment variables?|\.env)\b/i],
  ["secrets", /\b(reveal|show|give|tell|share|print|what('s| is)|send)\b.{0,30}\b(password|credentials?|secrets?)\b/i],
  ["advice", /\b(diagnos\w*|symptoms?|medicine|medication|prescription|dosage|disease|treatment for)\b/i],
  ["advice", /\b(lawyer|lawsuit|sue (him|her|them|my)|legal advice|court case|custody|divorce)\b/i],
  ["advice", /\b(invest(ing|ment)?|stock market|shares? to buy|crypto\w*|bitcoin|mutual funds?|loan|tax(es)? (advice|return|filing)|insurance)\b/i],
  ["unsafe", /\b(porn\w*|nudes?|nsfw|erotic|xxx|sex(ual)? (story|chat|roleplay)|sexting)\b/i],
  ["unsafe", /\b(genocide|racist|nazi|kill all|hate (all )?(muslims|hindus|christians|jews|women|blacks|gays)|n[i1]gg\w+|f[a@]gg?ot)\b/i],
  ["unsafe", /\b(make|build|buy)\b.{0,20}\b(bomb|explosive|weapon|gun|poison)\b/i],
];

function cap(text, n) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

/** Last 12 turns with a known role, each capped, so a long chat cannot swell the prompt. */
export function trimHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: cap(t.content, MAX_MESSAGE) }))
    .filter((t) => t.content);
}

function flag(text) {
  for (const [reason, re] of RULES) if (re.test(text)) return reason;
  return null;
}

/** @returns {{ ok: true } | { ok: false, reason: string, reply: string }} */
export function screen(message, history) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return { ok: false, reason: "empty", reply: REPLIES.empty };
  if (text.length > MAX_MESSAGE) return { ok: false, reason: "too_long", reply: REPLIES.too_long };
  // Earlier user turns are screened too, since they are replayed to the model.
  const turns = trimHistory(history).filter((t) => t.role === "user").map((t) => t.content);
  for (const t of [text, ...turns]) {
    const reason = flag(t);
    if (reason) return { ok: false, reason, reply: REPLIES[reason] };
  }
  return { ok: true };
}

/** Masks emails, phone numbers and long digit strings before text reaches the model. */
export function redact(text) {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s\-().]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number]" : m));
}

const URL_RE = /(https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+)/gi;
const trimUrl = (u) => u.replace(/[.,;:!?]+$/, "").toLowerCase();

/** Rejects replies that invent links, leak the prompt, run long or say nothing. @returns {{ ok: boolean, answer: string }} */
export function checkAnswer(answer, chunks) {
  const text = typeof answer === "string" ? answer.trim() : "";
  if (!text || text.length > MAX_ANSWER || text.includes(SYSTEM_MARKER)) return { ok: false, answer: FALLBACK };
  const known = chunks.map((c) => c.text.toLowerCase()).join("\n");
  for (const url of text.match(URL_RE) ?? []) {
    if (!known.includes(trimUrl(url))) return { ok: false, answer: FALLBACK };
  }
  return { ok: true, answer: text };
}
