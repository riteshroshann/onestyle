"""Check that the int8 ONNX tagger shipped to the browser matches the PyTorch model on the test set."""
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from seqeval.metrics import f1_score
from transformers import AutoTokenizer

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "scripts"))
from bespoke.decode import viterbi  # noqa: E402
from bespoke.lexicon import labels  # noqa: E402
from ladder import encode_words  # noqa: E402

d = ENGINE.parent / "web" / "public" / "models" / "bespoke-tagger"
tok = AutoTokenizer.from_pretrained(d)
sess = ort.InferenceSession(str(d / "onnx" / "model_quantized.onnx"))
test = [json.loads(l) for l in (ENGINE.parent / "data" / "processed" / "test.jsonl").read_text(encoding="utf8").splitlines()]
L = labels()
pred = []
for r in test:
    ids, first = encode_words(tok, r["tokens"])
    x = np.array([ids], dtype=np.int64)
    logits = sess.run(["logits"], {"input_ids": x, "attention_mask": np.ones_like(x), "token_type_ids": np.zeros_like(x)})[0][0]
    lp = logits - np.log(np.exp(logits - logits.max(-1, keepdims=True)).sum(-1, keepdims=True)) - logits.max(-1, keepdims=True)
    tags = viterbi(lp[first], L)
    pred.append(tags + ["O"] * (len(r["tokens"]) - len(tags)))
f1 = f1_score([r["tags"] for r in test], pred)
torch_f1 = json.loads((ENGINE.parent / "results" / "tagging.json").read_text())["L3 minilm"]["f1"]
print(f"int8 ONNX test F1 {f1:.4f}  vs PyTorch {torch_f1:.4f}")
res = json.loads((ENGINE.parent / "results" / "tagging.json").read_text())
res["L3 minilm int8 ONNX (browser)"] = {"system": "L3 minilm int8 ONNX (browser)", "f1": round(f1, 4), "size_MB": round((d / "onnx" / "model_quantized.onnx").stat().st_size / 1e6, 1)}
(ENGINE.parent / "results" / "tagging.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
