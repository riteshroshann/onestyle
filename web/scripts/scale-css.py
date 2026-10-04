"""Make every fixed size in globals.css follow one scale factor, --s.

Desktop browsers at 80% zoom looked right, so desktop uses --s: .8 and phones keep --s: 1. Zooming shrinks
px lengths but not viewport-relative ones, so only px values are rewritten (vw, %, em stay as they are).
Hairlines (1px, 1.5px) stay crisp. Media-query breakpoints are left alone. Idempotent: run it again and
nothing changes.
"""
import re
from pathlib import Path

P = Path(__file__).resolve().parents[1] / "app" / "globals.css"
css = P.read_text(encoding="utf8")
if "--s:" in css:
    print("already scaled")
    raise SystemExit

PX = re.compile(r"(?<![\w.-])(-?\d+(?:\.\d+)?)px")


def scale_block(text: str) -> str:
    def rep(m):
        v = float(m.group(1))
        if abs(v) <= 1.5 or v == 0:
            return m.group(0)
        return f"calc({m.group(1)}px * var(--s))"
    return PX.sub(rep, text)


out, i = [], 0
# leave @media conditions untouched, scale everything else
for m in re.finditer(r"@media[^{]*\{", css):
    out.append(scale_block(css[i:m.start()]))
    out.append(m.group(0))
    i = m.end()
out.append(scale_block(css[i:]))
css = "".join(out)
css = css.replace("  color-scheme: light;\n}", "  color-scheme: light;\n  --s: 1;\n}\n/* the look of the site at 80% browser zoom, as the default on desktop */\n@media (min-width: 1024px) { :root { --s: .8; } }", 1)
P.write_text(css, encoding="utf8")
print("scaled", css.count("var(--s)"), "lengths")
