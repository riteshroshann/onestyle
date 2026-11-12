// Bespoke docs: the sliding nav pill, reveals, copy buttons and the search panel. No libraries.
const PAGES = [
  ["index.html", "Overview", "What Bespoke is and how it is built"],
  ["guide.html", "Using Bespoke", "Talk, Board, Sheet, Shop, makers and Ask"],
  ["developers.html", "Developer guide", "Architecture, the text analytics pipeline, running it"],
  ["mcp.html", "MCP server", "Use Bespoke from Claude and other agents"],
  ["contributing.html", "Contributing", "How to make a change that lands"],
];

// the dark pill slides to the page you are on
function pill() {
  const links = document.querySelector(".links");
  const here = links?.querySelector('[aria-current="page"]');
  if (!links || !here) return;
  const p = document.createElement("span");
  p.className = "pill";
  links.prepend(p);
  const place = (el) => { p.style.left = `${el.offsetLeft}px`; p.style.width = `${el.offsetWidth}px`; };
  place(here);
  // measured again once the font is in, so the pill fits the word
  document.fonts?.ready.then(() => place(here));
  links.querySelectorAll("a").forEach((a) => {
    a.addEventListener("mouseenter", () => { place(a); a.style.color = "#fff"; if (a !== here) here.style.color = "inherit"; });
    a.addEventListener("mouseleave", () => { place(here); a.style.color = ""; here.style.color = ""; });
  });
  addEventListener("resize", () => place(here));
}

function reveals() {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -60px" });
  els.forEach((e) => io.observe(e));
}

function copies() {
  document.querySelectorAll("pre").forEach((pre) => {
    const b = document.createElement("button");
    b.className = "copy"; b.type = "button"; b.textContent = "Copy";
    b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pre.querySelector("code")?.innerText ?? pre.innerText); b.textContent = "Copied"; b.classList.add("done"); }
      catch { b.textContent = "Select and copy"; }
      setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1600);
    });
    // the button lives in a wrapper, so it stays in the corner while the code scrolls
    const box = document.createElement("div");
    box.className = "code";
    pre.replaceWith(box);
    box.append(pre, b);
  });
}

// search: every heading on every page, fetched once, ranked by word overlap
async function index() {
  const out = [];
  await Promise.all(PAGES.map(async ([href, page]) => {
    try {
      const html = await (await fetch(href)).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("h1, h2, h3").forEach((h) => {
        const id = h.id || h.closest("section")?.id || "";
        // the whole section is searchable, not just its heading
        const body = (h.closest("section") ?? h.parentElement)?.textContent ?? "";
        out.push({ href: id ? `${href}#${id}` : href, title: h.textContent.trim(), page, words: `${h.textContent} ${body}`.toLowerCase() });
      });
    } catch { /* a page that fails to load is left out of search */ }
  }));
  return out;
}

function search() {
  const root = document.createElement("div");
  root.className = "ask";
  root.innerHTML = `<div class="panel" role="dialog" aria-label="Search the docs"><header><b>Search the docs</b><p>Guides, the pipeline, the MCP server</p></header>
    <input type="search" placeholder="Try: tagger, moodboard, MCP" aria-label="Search the docs"><ul></ul></div>
    <button class="ask-btn" type="button" aria-expanded="false">Search the docs <kbd>/</kbd></button>`;
  document.body.append(root);
  const panel = root.querySelector(".panel"), input = root.querySelector("input"), list = root.querySelector("ul"), btn = root.querySelector(".ask-btn");
  let items = null, active = 0;
  const show = (hits) => {
    active = 0;
    list.innerHTML = hits.length ? hits.slice(0, 8).map((h, i) => `<li><a href="${h.href}" class="${i === 0 ? "on" : ""}" style="animation-delay:${i * 30}ms"><b>${h.title}</b><span>${h.page}</span></a></li>`).join("") : `<li class="none">Nothing matches that yet.</li>`;
  };
  const run = () => {
    const q = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!items) return;
    if (!q.length) return show(PAGES.map(([href, title, text]) => ({ href, title, page: text })));
    show(items.map((h) => ({ h, s: q.reduce((n, w) => n + (h.title.toLowerCase().includes(w) ? 3 : 0) + (h.words.includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.h));
  };
  const toggle = async (open) => {
    panel.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
    if (open) { input.focus(); items ??= await index(); run(); } else btn.focus();
  };
  btn.addEventListener("click", () => toggle(!panel.classList.contains("open")));
  input.addEventListener("input", run);
  input.addEventListener("keydown", (e) => {
    const links = [...list.querySelectorAll("a")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); links[active]?.classList.remove("on"); active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length; links[active]?.classList.add("on"); }
    if (e.key === "Enter" && links[active]) location.href = links[active].href;
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) toggle(false);
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName ?? "")) { e.preventDefault(); toggle(true); }
  });
}

pill(); reveals(); copies(); search();
