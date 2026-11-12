"""Make the picture library for the visual picker with FLUX.2 [klein] 4B (Apache 2.0), then rank, review and publish it.

    python scripts/looks.py bases               draw the base sketches that edits start from (4 seeds each)
    python scripts/looks.py make [--only G]     draw every picture: text seeds, plus edit seeds where a group has a base
    python scripts/looks.py rank                score each variant with CLIP against every option in its group
    python scripts/looks.py sheets              contact sheets for review, one per group, auto-pick outlined
    python scripts/looks.py publish             clean the picks and write web/public/looks and web/lib/looks.json

Raw variants live in engine/looks/raw (not committed). engine/looks/picks.json records the base and per-picture choices
a person made after looking at the sheets; anything not listed there falls back to the CLIP ranking.
It runs on a 6 GB laptop GPU in two phases: every prompt is encoded once and cached, then the transformer runs
entirely on the GPU with float8 weight storage. Generation is at 640 px; the published pictures are 384 px.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))
from bespoke.looks import BASES, entries, slug  # noqa: E402

MODEL = "black-forest-labs/FLUX.2-klein-4B"
CLIP = "openai/clip-vit-large-patch14"
LOOKS = ROOT / "engine" / "looks"
RAW = LOOKS / "raw"
PICKS = LOOKS / "picks.json"
RANKING = LOOKS / "ranking.json"
PUBLIC = ROOT / "web" / "public" / "looks"
MANIFEST = ROOT / "web" / "lib" / "looks.json"
PHOTO = {"fabric", "print", "finish"}
SIZE = {"line": (640, 640), "figure": (576, 960), "fabric": (640, 640), "print": (640, 640), "finish": (640, 640)}
TEXT_SEEDS = {"line": [0, 1], "figure": [0, 1], "fabric": [0, 1], "print": [0, 1], "finish": [0, 1]}
EDIT_SEEDS = [0, 1]


def picks() -> dict:
    return json.loads(PICKS.read_text()) if PICKS.exists() else {"bases": {}, "pictures": {}}


def embed_all(prompts: list[str]) -> None:
    """Phase one: encode every prompt once with the 4B text encoder, cache the embeddings, then free it."""
    import gc
    import torch
    from diffusers import Flux2KleinPipeline
    from diffusers.hooks import apply_group_offloading
    todo = sorted({q for q in prompts if not emb_path(q).exists()})
    if not todo:
        return
    pipe = Flux2KleinPipeline.from_pretrained(MODEL, transformer=None, vae=None, torch_dtype=torch.bfloat16)
    # the encoder is 8 GB in bf16; stream it through the GPU one layer at a time (unpinned: Windows will not pin it).
    # Block-level grouping kept whole blocks resident and spilled past 6 GB (9 s a prompt); leaf level peaks at
    # 2.6 GB and, in batches of 8, takes 0.6 s a prompt.
    apply_group_offloading(pipe.text_encoder, onload_device=torch.device("cuda"), offload_device=torch.device("cpu"),
                           offload_type="leaf_level", use_stream=False)
    t0 = time.time()
    with torch.inference_mode():
        for k in range(0, len(todo), 8):
            batch = todo[k:k + 8]
            emb, _ = pipe.encode_prompt(prompt=batch, device=torch.device("cuda"))
            for q, e in zip(batch, emb):
                path = emb_path(q); path.parent.mkdir(parents=True, exist_ok=True)
                torch.save(e.to("cpu", torch.bfloat16).clone(), path)
    print(f"encoded {len(todo)} prompts in {time.time() - t0:.0f} s", flush=True)
    del pipe; gc.collect(); torch.cuda.empty_cache()


def emb_path(prompt: str) -> Path:
    import hashlib
    return RAW / "emb" / (hashlib.sha1(prompt.encode()).hexdigest()[:16] + ".pt")


def load_pipe():
    """Phase two: the 4B transformer stays on the GPU with weights stored as float8 and computed in bfloat16
    (about 4 GB), so nothing is streamed during sampling. The text encoder is not loaded at all."""
    import torch
    from diffusers import Flux2KleinPipeline
    pipe = Flux2KleinPipeline.from_pretrained(MODEL, text_encoder=None, tokenizer=None, torch_dtype=torch.bfloat16)
    pipe.transformer.enable_layerwise_casting(storage_dtype=torch.float8_e4m3fn, compute_dtype=torch.bfloat16)
    pipe.transformer.to("cuda")
    pipe.vae.to("cuda")
    pipe.vae.enable_tiling()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def draw(pipe, prompt: str, size: tuple[int, int], seeds: list[int], out: list[Path], image=None):
    """Several seeds from one cached embedding. Skips files that already exist, so runs can resume."""
    import torch
    todo = [(s, o) for s, o in zip(seeds, out) if not o.exists()]
    if not todo:
        return 0.0
    emb = torch.load(emb_path(prompt)).unsqueeze(0).to("cuda")
    t0 = time.time()
    with torch.inference_mode():
        for seed, o in todo:
            img = pipe(prompt_embeds=emb, image=image, width=size[0], height=size[1], num_inference_steps=4,
                       guidance_scale=1.0, generator=torch.Generator("cpu").manual_seed(seed)).images[0]
            o.parent.mkdir(parents=True, exist_ok=True)
            img.save(o)
    return (time.time() - t0) / len(todo)


def base_path(name: str, seed: int) -> Path:
    return RAW / "bases" / f"{name}_{seed}.png"


def cmd_bases(args):
    embed_all(list(BASES.values()))
    pipe = load_pipe()
    for name, prompt in BASES.items():
        kind = "figure" if name.startswith("figure") else "line"
        dt = draw(pipe, prompt, SIZE[kind], [0, 1, 2, 3], [base_path(name, s) for s in range(4)])
        print(f"base {name}: {dt:.1f} s per image", flush=True)


def variants(e: dict, text_too: bool = False) -> list[tuple[str, int, Path]]:
    """Details with a base are edits of it, so the set stays consistent; everything else is drawn from text.
    An edit cannot make a large change of shape (a boat neck from a round one), so review can ask for text
    drawings of an edited option as well; those count as candidates whenever they exist."""
    text = [("text", s, RAW / "text" / f"{slug(e['key'])}_{s}.png") for s in TEXT_SEEDS[e["kind"]]]
    if e.get("base"):
        edit = [("edit", s, RAW / "edit" / f"{slug(e['key'])}_{s}.png") for s in EDIT_SEEDS]
        return edit + [t for t in text if text_too or t[2].exists()]
    return text


# what the assistant asks about, drawn first so the conversation gets its pictures soonest
ASKED = {"garment": ["kurti", "anarkali", "lehenga", "saree blouse", "dress", "co-ord set", "shirt", "trousers"],
         "fabric": ["cotton", "georgette", "silk", "chanderi", "rayon", "linen", "terry", "fleece", "wool", "denim", "polyester", "velvet"]}


def first(e: dict) -> int:
    if e.get("base"):
        return 0
    return 1 if e["value"] in ASKED.get(e["slot"], []) else 2


def cmd_make(args):
    from PIL import Image
    chosen = picks()["bases"]
    E = [e for e in entries() if not args.only or e["group"] in args.only or e["key"] in args.only]
    E.sort(key=first)
    embed_all([e["prompt"] for e in E] + [e["edit"] for e in E if e.get("edit")])
    pipe = load_pipe()
    times = []
    for i, e in enumerate(E):
        v = variants(e, text_too=bool(args.text))
        size = SIZE[e["kind"]]
        if args.seeds is not None:               # draw some seeds now, more later only where review asks for them
            v = [(m, s, p) for m, s, p in v if s in args.seeds]
        text = [(s, p) for m, s, p in v if m == "text"]
        dt = draw(pipe, e["prompt"], size, [s for s, _ in text], [p for _, p in text])
        if dt: times.append(dt)
        edit = [(s, p) for m, s, p in v if m == "edit"]
        if edit:
            base = Image.open(base_path(e["base"], chosen.get(e["base"], 0))).convert("RGB")
            dt = draw(pipe, e["edit"], size, [s for s, _ in edit], [p for _, p in edit], image=[base])
            if dt: times.append(dt)
        if times:
            print(f"[{i + 1}/{len(E)}] {e['key']}  {sum(times) / len(times):.1f} s per image", flush=True)


def describe(e: dict) -> str:
    return (f"a photo of {e['desc']}" if e["kind"] in PHOTO else f"a line drawing of {e['desc']}")


def cmd_rank(args):
    """CLIP ViT-L/14 zero-shot within each group: how sure is it that this variant shows this option and not another?"""
    import numpy as np
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor
    model = CLIPModel.from_pretrained(CLIP).eval()
    proc = CLIPProcessor.from_pretrained(CLIP)
    E = entries()
    groups: dict[str, list[dict]] = {}
    for e in E:
        groups.setdefault(e["group"], []).append(e)

    def unit(out):    # newer transformers return an output object whose pooler_output is the projected feature
        return torch.nn.functional.normalize(getattr(out, "pooler_output", out), dim=-1)

    ranking = {}
    with torch.inference_mode():
        for g, items in groups.items():
            t = proc(text=[describe(e) for e in items], return_tensors="pt", padding=True, truncation=True)
            T = unit(model.get_text_features(**t))
            for j, e in enumerate(items):
                rows = []
                for mode, seed, p in variants(e):
                    if not p.exists():
                        continue
                    img = Image.open(p).convert("RGB")
                    I = unit(model.get_image_features(**proc(images=img, return_tensors="pt")))
                    prob = (100 * I @ T.T).softmax(-1)[0]
                    score = float(prob[j])
                    if e["kind"] not in PHOTO:          # line art must stay clear of the edges and mostly white
                        a = np.asarray(img.convert("L"), dtype=np.float32)
                        edge = np.concatenate([a[:6].ravel(), a[-6:].ravel(), a[:, :6].ravel(), a[:, -6:].ravel()])
                        if (edge < 200).mean() > 0.01: score *= 0.6
                        if (a < 128).mean() > 0.25: score *= 0.6
                    rows.append({"mode": mode, "seed": seed, "score": round(score, 4), "top": items[int(prob.argmax())]["value"]})
                rows.sort(key=lambda r: -r["score"])
                ranking[e["key"]] = rows
            print(g, "ranked", flush=True)
    RANKING.write_text(json.dumps(ranking, indent=1))
    weak = [k for k, r in ranking.items() if r and r[0]["score"] < 0.3]
    print(f"{len(ranking)} pictures ranked; {len(weak)} uncertain: {weak}")


def choice(e: dict, P: dict, R: dict) -> tuple[str, int] | None:
    if e["key"] in P["pictures"]:
        m, s = P["pictures"][e["key"]].split(":")
        return m, int(s)
    r = R.get(e["key"])
    return (r[0]["mode"], r[0]["seed"]) if r else None


def cmd_sheets(args):
    from PIL import Image, ImageDraw, ImageFont
    P, R = picks(), json.loads(RANKING.read_text()) if RANKING.exists() else {}
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    out = RAW / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[dict]] = {}
    for e in entries():
        groups.setdefault(e["group"], []).append(e)
    th = 180
    for g, items in groups.items():
        for part in range(0, len(items), 8):
            chunk = items[part:part + 8]
            cols = max(len(variants(e)) for e in chunk)
            sheet = Image.new("RGB", (170 + cols * (th + 8), len(chunk) * (th + 30) + 10), "white")
            d = ImageDraw.Draw(sheet)
            for r, e in enumerate(chunk):
                y = 10 + r * (th + 30)
                d.text((10, y + th // 2), e["value"], fill="black", font=font)
                c = choice(e, P, R)
                for k, (mode, seed, p) in enumerate(variants(e)):
                    x = 170 + k * (th + 8)
                    if p.exists():
                        im = Image.open(p).convert("RGB"); im.thumbnail((th, th))
                        sheet.paste(im, (x + (th - im.width) // 2, y + (th - im.height) // 2))
                    d.text((x, y + th + 4), f"{mode}:{seed}", fill="#888", font=font)
                    if c == (mode, seed):
                        d.rectangle([x - 3, y - 3, x + th + 3, y + th + 3], outline="#e5484d", width=4)
            sheet.save(out / f"{g.replace('.', '-').replace('@', '--')}_{part // 8}.jpg", quality=85)
    print("sheets in", out)


def clean_line(im):
    """Black-on-white sketch to ink-on-transparent: white disappears, lines keep their weight, then trim and pad."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im.convert("L"), dtype=np.float32)
    alpha = np.clip((246 - a) / 170, 0, 1) ** 0.85
    out = np.zeros((*a.shape, 4), dtype=np.uint8)
    out[..., :3] = (29, 29, 31)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    box = img.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return img.crop(box) if box else img


def fit(img, w: int, h: int, margin: float = 0.07):
    from PIL import Image
    iw, ih = img.size
    s = min(w * (1 - 2 * margin) / iw, h * (1 - 2 * margin) / ih)
    img = img.resize((max(1, round(iw * s)), max(1, round(ih * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(img, ((w - img.width) // 2, (h - img.height) // 2), img)
    return canvas


def cmd_publish(args):
    from PIL import Image
    P, R = picks(), json.loads(RANKING.read_text()) if RANKING.exists() else {}
    manifest: dict = {"photo": sorted({e["slot"] for e in entries() if e["kind"] in PHOTO}), "tall": ["garment.length"], "looks": {}}
    missing = []
    for e in entries():
        c = choice(e, P, R)
        src = c and next((p for m, s, p in variants(e) if (m, s) == c), None)
        if not src or not src.exists():
            missing.append(e["key"]); continue
        im = Image.open(src)
        dst = PUBLIC / f"{slug(e['key'])}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        if e["kind"] in PHOTO:
            im = im.convert("RGB"); side = min(im.size)
            im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
            im.resize((384, 384), Image.LANCZOS).save(dst, "WEBP", quality=80, method=6)
        else:
            w, h = (288, 384) if e["kind"] == "figure" and e["slot"] == "garment.length" else (384, 384)
            fit(clean_line(im), w, h).save(dst, "WEBP", quality=88, alpha_quality=90, method=6)
        manifest["looks"].setdefault(e["group"], {})[e["value"]] = f"/looks/{slug(e['key'])}.webp"
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    total = sum(f.stat().st_size for f in PUBLIC.rglob("*.webp"))
    print(f"published {sum(len(v) for v in manifest['looks'].values())} pictures, {total / 1e6:.1f} MB; missing {missing}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["bases", "make", "rank", "sheets", "publish"])
    ap.add_argument("--only", nargs="*", help="groups (e.g. neckline.shape, bodice.fit@knit) or keys")
    ap.add_argument("--seeds", nargs="*", type=int, help="draw only these seeds (make)")
    ap.add_argument("--text", action="store_true", help="also draw edited options from text (make, with --only)")
    a = ap.parse_args()
    {"bases": cmd_bases, "make": cmd_make, "rank": cmd_rank, "sheets": cmd_sheets, "publish": cmd_publish}[a.cmd](a)
