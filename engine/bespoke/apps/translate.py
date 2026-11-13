"""Machine translation: the English tailor sheet into Hindi.

The product writes the Hindi sheet with a bilingual ontology and sentence templates (describe.ts sheetLines).
Here each sheet row, as printed in English ("Neckline: V, front depth 6.75 in from the high shoulder point"),
is scored against a hand-written Hindi reference, for the template system and for the free local model
Helsinki-NLP/opus-mt-en-hi. Metrics: corpus BLEU and chrF++ (sacrebleu), exact match, sentence-chrF++ with a
bootstrap interval. Gold: data/gold/translation.jsonl, 69 rows, one annotator, written from the English alone.
"""
from __future__ import annotations

import json
import subprocess

import numpy as np

from .common import GOLD, ROOT, bootstrap_ci, read_jsonl, write_result

MT_MODEL = "Helsinki-NLP/opus-mt-en-hi"


def template_sheet(rows: list[dict]) -> dict[tuple[str, str], str]:
    """The deployed Hindi row for each (part, English text), produced by running the shipped TypeScript on the binding gold requests."""
    texts = [json.loads(l)["text"] for l in (GOLD / "binding.jsonl").read_text(encoding="utf8").splitlines() if l.strip()]
    out = subprocess.run(["node", "--experimental-strip-types", "scripts/eval-bridge.mjs"], cwd=ROOT / "web", input=json.dumps({"items": [{"messages": [t]} for t in texts]}),
                         capture_output=True, text=True, check=True, encoding="utf8")
    found = {(l["part"], l["en"]): f"{l['hiPart']}: {l['hi']}" for r in json.loads(out.stdout) for l in r["sheet"]}
    return found


def neural(sources: list[str]) -> list[str]:
    from transformers import MarianMTModel, MarianTokenizer

    tok, model = MarianTokenizer.from_pretrained(MT_MODEL), MarianMTModel.from_pretrained(MT_MODEL).eval()
    out: list[str] = []
    for i in range(0, len(sources), 16):
        batch = tok(sources[i:i + 16], return_tensors="pt", padding=True)
        out += tok.batch_decode(model.generate(**batch, num_beams=4, max_length=96), skip_special_tokens=True)
    return out


def run() -> dict:
    from sacrebleu.metrics import BLEU, CHRF

    all_rows = read_jsonl(GOLD / "translation.jsonl")
    tpl = template_sheet(all_rows)
    # an engine change can stop a gold row from being produced (the English text of the row changes); those rows are
    # left out of every system, so the comparison stays like for like, and listed in the result
    rows = [r for r in all_rows if (r["part"], r["en"]) in tpl]
    dropped = [f"{r['part']}: {r['en']}" for r in all_rows if (r["part"], r["en"]) not in tpl]
    refs = [r["reference"] for r in rows]
    sources = [f"{r['part']}: {r['en']}" for r in rows]
    systems = {"template_system_deployed": [tpl[(r["part"], r["en"])] for r in rows], "opus_mt_en_hi": neural(sources)}
    bleu, chrf = BLEU(effective_order=True), CHRF(word_order=2)
    out: dict = {"task": "English tailor-sheet rows to Hindi", "gold": "data/gold/translation.jsonl", "n_rows": len(rows), "rows_no_longer_produced_by_the_engine": dropped, "seed": 13,
                 "note": "rows are short (a few words); BLEU is corpus-level with effective order and is harsh on them, chrF++ is the better guide",
                 "neural_model": MT_MODEL, "interval": "bootstrap over rows, 1000 resamples", "systems": {}}
    for name, hyp in systems.items():
        sent = [chrf.sentence_score(h, [r]).score for h, r in zip(hyp, refs)]
        out["systems"][name] = {
            "bleu": round(bleu.corpus_score(hyp, [refs]).score, 2), "chrf_pp": round(chrf.corpus_score(hyp, [refs]).score, 2),
            "chrf_pp_sentence_mean": round(float(np.mean(sent)), 2), "chrf_pp_sentence_ci95": bootstrap_ci(sent, lambda v: float(np.mean(v))),
            "exact_match": round(float(np.mean([h == r for h, r in zip(hyp, refs)])), 4)}
    out["examples"] = [{"source": sources[i], "reference": refs[i], **{k: v[i] for k, v in systems.items()}} for i in (0, 9, 30, 41, 55)]
    out["rows_by_part_exact_match_template"] = {p: round(float(np.mean([h == r for h, r, x in zip(systems["template_system_deployed"], refs, rows) if x["part"] == p])), 3)
                                               for p in sorted({x["part"] for x in rows})}
    write_result("translation", out)
    return out
