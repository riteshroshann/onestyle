// The moodboard end to end on a local build, with the picture reader mocked.
// Run: (cd web && bun x serve out -l 4202 &) then
//   PLAYWRIGHT_CORE=<path to playwright-core/index.mjs> SHOTS=<dir> bun web/tests/e2e/board.e2e.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const BASE = process.env.BASE ?? "http://localhost:4202";
const SHOTS = process.env.SHOTS ?? ".";
const here = path.dirname(fileURLToPath(import.meta.url));
const photos = ["013.webp", "030.webp"].map((f) => path.join(here, "../../public/photos", f));

const READING = {
  pictures: [
    { n: 1, shows: "An anime girl under cherry blossoms at dusk", borrow: "Scatter blossom motifs over a soft pink base, with violet as a deep contrast.",
      palette: [{ name: "sakura pink", hex: "#f4b6c2", base: "pink" }, { name: "dusk violet", hex: "#5b4b8a", base: "purple" }, { name: "cream", hex: "#fff4e0", base: "ivory" }],
      mood: ["dreamy", "soft"], motifs: ["cherry blossoms", "petals"], pattern: ["floral"], "lower.silhouette": ["a-line"], fabric: ["chiffon"], embellishment: ["sequins"], style: ["feminine"] },
    { n: 2, shows: "Brutalist concrete stairs in hard light", borrow: "Clean geometric panels and a strict, structured line.",
      palette: [{ name: "concrete", hex: "#9a9a96", base: "grey" }, { name: "shadow", hex: "#2b2b2b", base: "black" }],
      mood: ["bold"], motifs: ["steps", "blocks"], pattern: ["geometric"], "lower.silhouette": ["straight"], fabric: ["crepe"], embellishment: [], style: ["minimal"] },
  ],
  leftOut: [],
  direction: {
    summary: "Soft florals held in a strict, architectural shape.",
    ideas: [
      { title: "Blossom anarkali", why: "The flare carries the falling petals; violet piping gives it a spine.", garment: "anarkali", "lower.silhouette": "flared", fabric: "georgette", pattern: "floral", colour: ["pink", "purple"] },
      { title: "Concrete co-ord", why: "A calm, structured take for daytime.", garment: "co-ord set", fabric: "crepe", pattern: "geometric", colour: ["grey", "pink"] },
      { title: "Petal saree blouse", why: "A small dose of the board for a festive saree.", garment: "saree blouse", "sleeve.style": "puff", colour: ["pink"] },
    ],
  },
};

const browser = await chromium.launch({ channel: "msedge" });
const failures = [];
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 500 ? 900 : 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let sent = null;
  let mode = "ok";
  await page.route("**/api/vision", async (route) => {
    sent = JSON.parse(route.request().postData() ?? "{}");
    if (mode === "refused") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ refused: "unsafe", message: "These pictures can't be read here. Try pictures of clothes, colours, places or art you love.", pictures: [], leftOut: [1, 2], direction: { summary: "", ideas: [] } }) });
    await new Promise((r) => setTimeout(r, 900)); // long enough to see the progress state
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(READING) });
  });

  await page.goto(`${BASE}/studio/?new`);
  await page.getByRole("link", { name: "Board", exact: true }).first().click();
  await page.locator("input[type=file]").first().setInputFiles(photos);
  await page.waitForTimeout(2500);

  // reading: progress, then results
  await page.getByRole("button", { name: "Read the board" }).click();
  await page.getByText("Reading your board.").waitFor({ timeout: 5000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/board-progress-${width}.png` });
  await page.getByText("Here is a direction.").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/board-results-${width}.png` });
  await page.getByRole("dialog").evaluate((d) => d.scrollTo(0, d.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/board-results-end-${width}.png` });

  assert.equal(sent.pictures.length, 2);
  for (const p of sent.pictures) {
    const size = await page.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); return Math.max(i.naturalWidth, i.naturalHeight); }, p.dataURL);
    assert.ok(size <= 768, `picture sent at ${size} px`);
    assert.match(p.dataURL, /^data:image\/jpeg;base64,/);
  }
  // nothing runs off the side of the reading
  const overflow = await page.getByRole("dialog").evaluate((d) => {
    const out = [];
    const box = d.getBoundingClientRect();
    for (const el of d.querySelectorAll("h2, h3, p:not(.sr-only), button")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < box.left - 1 || r.right > box.right + 1 || el.scrollWidth > el.clientWidth + 1)) out.push(el.textContent.slice(0, 40));
    }
    return out;
  });
  assert.deepEqual(overflow, [], `cut off at ${width}: ${overflow.join(" | ")}`);
  assert.equal(await page.getByRole("button", { name: /Blossom anarkali/ }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: /Concrete co-ord/ }).click();

  // keep the notes: they are written onto the canvas
  await page.getByRole("button", { name: "Keep the notes on the board" }).click();
  await page.getByRole("button", { name: "Clear notes" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${SHOTS}/board-notes-${width}.png` });

  // circle a detail: overlay closes and a hint shows on the canvas
  await page.getByRole("button", { name: "Read the board" }).click();
  await page.getByText("Here is a direction.").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Circle a detail" }).click();
  await page.getByText("Draw a circle round the detail you love").waitFor({ timeout: 3000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/board-circle-${width}.png` });
  await page.getByRole("button", { name: "Got it" }).click();

  // a refusal is polite and leads back to the board
  mode = "refused";
  await page.getByRole("button", { name: "Read the board" }).click();
  await page.getByText("Let's try other pictures.").waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/board-refused-${width}.png` });
  await page.getByRole("button", { name: "Back to the board" }).click();
  mode = "ok";

  // use this direction: back to Talk with the board's reading in the chat
  await page.getByRole("button", { name: "Read the board" }).click();
  await page.getByText("Here is a direction.").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Use this direction" }).click();
  await page.getByText(/From your board/).first().waitFor({ timeout: 5000 });
  assert.equal(await page.getByRole("link", { name: "Talk", exact: true }).first().getAttribute("aria-current"), "page");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/board-talk-${width}.png` });

  // the notes were saved with the board: open it again from the boards menu and they are still there
  await page.getByRole("link", { name: "Board", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button[aria-haspopup="dialog"]').first().click();
  await page.getByRole("dialog", { name: "Your boards" }).locator("li button").first().click();
  await page.getByRole("button", { name: "Clear notes" }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/board-reopened-${width}.png` });

  if (errors.length) failures.push(`${width}: page errors: ${errors.join(" | ")}`);
  console.log(`${width}: progress, results, notes on canvas, circle hint, refusal, Use this direction and saved notes all work`);
  await page.close();
}
await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("ok: board e2e");
