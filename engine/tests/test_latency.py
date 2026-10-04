"""Latency of the int8 ONNX tagger that ships to the browser, measured on CPU with onnxruntime."""
import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

ENGINE = Path(__file__).resolve().parents[1]
ROOT = ENGINE.parent
sys.path.insert(0, str(ENGINE / "scripts"))
from ladder import encode_words  # noqa: E402

MODEL = ROOT / "web" / "public" / "models" / "bespoke-tagger"


def test_onnx_cpu_latency_per_request():
    tok = AutoTokenizer.from_pretrained(MODEL)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1          # one thread, closer to a phone than a workstation
    sess = ort.InferenceSession(str(MODEL / "onnx" / "model_quantized.onnx"), opts)
    rows = [json.loads(l) for l in (ROOT / "data" / "processed" / "test.jsonl").read_text(encoding="utf8").splitlines()]
    times = []
    for r in rows * 3:
        ids, _ = encode_words(tok, r["tokens"])
        x = np.array([ids], dtype=np.int64)
        t0 = time.perf_counter()
        sess.run(["logits"], {"input_ids": x, "attention_mask": np.ones_like(x), "token_type_ids": np.zeros_like(x)})
        times.append((time.perf_counter() - t0) * 1000)
    times.sort()
    report = {"requests": len(times), "p50_ms": round(times[len(times) // 2], 2), "p95_ms": round(times[int(len(times) * 0.95)], 2),
              "max_ms": round(times[-1], 2), "threads": 1}
    (ROOT / "results" / "latency-onnx.json").write_text(json.dumps(report, indent=1))
    print(report)
    assert report["p95_ms"] < 50, report
