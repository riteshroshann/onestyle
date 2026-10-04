"""Write web/tests/parity_fixtures.json: the Python tokenizer and gazetteer output on the gold test set and
300 synthetic requests. The TypeScript engine must reproduce every fixture exactly."""
import json
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1]
ROOT = ENGINE.parent
sys.path.insert(0, str(ENGINE))
from bespoke.lexicon import tag_rules, tokenize  # noqa: E402

rows = [json.loads(l) for l in (ROOT / "data/processed/test.jsonl").read_text(encoding="utf8").splitlines()]
rows += [json.loads(l) for l in (ROOT / "data/processed/synth_dev.jsonl").read_text(encoding="utf8").splitlines()][:300]
fx = []
for r in rows:
    text = " ".join(r["tokens"])
    t = tokenize(text)
    fx.append({"text": text, "tokens": t, "spans": [[s.start, s.end, s.tag, s.value] for s in tag_rules(t)]})
(ROOT / "web/tests/parity_fixtures.json").write_text(json.dumps(fx, ensure_ascii=False), encoding="utf8")
print(len(fx), "fixtures")
