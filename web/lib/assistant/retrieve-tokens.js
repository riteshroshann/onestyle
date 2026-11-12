// Tokenizer shared by the index builder and the retriever, so both sides see words the same way.
// Author: Ritesh Roshan

const STOPWORDS = new Set((
  "a an the of to in on for and or is are was be do does did i my me it its you your can could will would should how what when where which who " +
  "with at by as if so under over into from this that there then than just please tell about " +
  "kaise kya hai hain ka ki ke ko se me mein mai main pe par aur ya batao batau bataye bata karna kare karu karun mera meri mujhe hoga hota hoti hote matlab write make want need get give show best today"
).split(/\s+/));

// Hinglish and spelling variants fold into the English word the corpus uses.
const SYNONYMS = {
  gala: "neckline", gale: "neckline", neck: "neckline", necklines: "neckline",
  baazu: "sleeve", bazu: "sleeve", baju: "sleeve", aasteen: "sleeve", asteen: "sleeve", aaste: "sleeve",
  naap: "measurement", naapte: "measurement", naapna: "measurement", naapu: "measurement", undo: "back", revert: "back", wapas: "back", nap: "measurement", measure: "measurement", measured: "measurement", measuring: "measurement", measurements: "measurement",
  darzi: "tailor", darji: "tailor", tailors: "tailor",
  kapda: "fabric", kapde: "fabric", cloth: "fabric", material: "fabric",
  rang: "colour", color: "colour", colors: "colour", colours: "colour",
  kamar: "waist", kulha: "hip", kulhe: "hip", kandha: "shoulder", kandhe: "shoulder", chaati: "bust", chest: "bust",
  peeche: "back", peeth: "back", gehra: "deep", gehri: "deep", gahra: "deep", deeper: "deep", depth: "deep",
  lambai: "length", lamba: "long", lambi: "long",
  bhejna: "send", bhejo: "send", bheju: "send", sending: "send", sent: "send",
  describing: "describe", description: "describe", batana: "describe",
  chhota: "short", chhoti: "short", dheela: "loose", dhila: "loose", dheeli: "loose",
  pictures: "picture", photo: "picture", photos: "picture", image: "picture", images: "picture", pic: "picture", pics: "picture",
  board: "moodboard",
  message: "chat", messages: "chat", baat: "chat",
};

function stem(word) {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** @param {string} text @returns {string[]} */
export function tokenize(text) {
  const words = String(text).toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = [];
  for (const raw of words) {
    if (STOPWORDS.has(raw)) continue;
    const word = SYNONYMS[raw] ?? SYNONYMS[stem(raw)] ?? stem(raw);
    if (!STOPWORDS.has(word)) out.push(word);
  }
  return out;
}
