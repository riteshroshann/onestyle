// End to end on the static build: Talk, a rubbish message, one question at a time, Sheet, Shop, and the microphone.
// The studio's functions (/api/understand, /api/next, /api/transcribe) are mocked with page.route, so no key is needed.
//
//   (cd web && bun run build && bun x serve out -l 4201) &
//   PLAYWRIGHT=<path to playwright-core> STUDIO=http://localhost:4201 SHOTS=<dir> bun tests/e2e/studio.e2e.ts
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright-core");
const BASE = process.env.STUDIO ?? "http://localhost:4201";
const SHOTS = process.env.SHOTS ?? "";

const PHRASED: Record<string, string> = { age: "How old will the wearer be?", "neckline.shape": "Which neckline would you like?", occasion: "What is the occasion?" };

async function mock(page: any) {
  await page.route(/cdn\.jsdelivr\.net/, (r: any) => r.abort());   // no tagger download: the gazetteer answers, deterministically
  await page.route("**/api/understand", async (r: any) => {
    const { message } = JSON.parse(r.request().postData());
    const rubbish = /asdf|joke/i.test(message);
    await r.fulfill({ json: { about: rubbish ? "other" : "garment", updates: [] } });
  });
  await page.route("**/api/next", async (r: any) => {
    const { candidates } = JSON.parse(r.request().postData());
    const slot = candidates[0]?.slot;
    await r.fulfill({ json: { question: PHRASED[slot] ? { slot, text: PHRASED[slot], options: [] } : null } });
  });
  await page.route("**/api/transcribe", async (r: any) => {
    const { audio, format } = JSON.parse(r.request().postData());
    assert.equal(format, "wav");
    assert.ok(audio.startsWith("UklGR"), "the clip is sent as WAV");
    await r.fulfill({ json: { text: "ek maroon lehenga chahiye shaadi ke liye" } });
  });
}

const shot = async (page: any, name: string, w: number) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${name}-${w}.png` }); };
const browser = await chromium.launch({ channel: "msedge", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

for (const w of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 500 ? 900 : 844 }, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  await mock(page);

  // old links land on the page's own URL
  await page.goto(`${BASE}/studio/?view=sheet`);
  await page.waitForURL(/\/studio\/sheet\/$/);
  await page.goto(`${BASE}/studio/`);
  await page.waitForURL(/\/studio\/talk\/$/);
  await page.goto(`${BASE}/studio/talk/?new`);
  await page.getByLabel("Describe the garment").waitFor();
  await page.waitForTimeout(900);
  await shot(page, "empty", w);

  // rubbish is never turned into a garment
  const box = page.getByLabel("Describe the garment");
  await box.fill("asdf qwerty zxcv");
  await box.press("Enter");
  await page.getByText("I did not catch a garment").waitFor();
  assert.equal(await page.locator(".order dl").count(), 0, "no design from rubbish");
  await page.waitForTimeout(600);
  await shot(page, "rubbish", w);

  // a real brief: who it is for is captured, and exactly one question is asked
  await box.fill("A blue cotton kurta, I am a 20 year old guy");
  await box.press("Enter");
  await page.getByText(/for a man in their 20s/).first().waitFor();
  const asked: string[] = [];
  const current = async () => {
    await page.waitForTimeout(700);
    assert.equal(await page.getByRole("button", { name: "Skip", exact: true }).count(), 1, "one question per turn");
    const q = await page.locator("p.mb-4").last().innerText();
    assert.ok(!asked.includes(q), `asked twice: ${q}`);
    asked.push(q);
    return q;
  };
  await current();
  await shot(page, "question", w);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await current();
  // answer the next one by picking its first option, then type one answer in words
  await page.locator("div.mt-7").last().locator("button").first().click();
  await current();
  await box.fill("for a wedding");
  await box.press("Enter");
  await current();
  await shot(page, "conversation", w);

  // the sheet keeps the design and says who it is for
  await page.getByRole("link", { name: "Sheet" }).click();
  await page.waitForURL(/\/studio\/sheet\/$/);
  await page.getByText("Wearer").first().waitFor();
  await page.waitForTimeout(900);
  await shot(page, "sheet", w);

  // every shop search is for men, never women or kids
  await page.getByRole("link", { name: "Shop" }).click();
  await page.waitForURL(/\/studio\/shop\/$/);
  await page.getByLabel("Search shops for").waitFor();
  const hrefs: string[] = await page.locator("main a[target=_blank]").evaluateAll((as: HTMLAnchorElement[]) => as.map((a) => a.href));
  const shops = hrefs.filter((h) => /myntra|ajio|amazon|flipkart|nykaa/.test(h) && !/fabric/.test(decodeURIComponent(h)));
  assert.ok(shops.length >= 5);
  for (const h of shops) {
    const d = decodeURIComponent(decodeURIComponent(h)).toLowerCase();
    assert.ok(/\bmen\b/.test(d), `not for men: ${h}`);
    assert.ok(!/women|girls|kids|boys/.test(d), `wrong section: ${h}`);
  }
  await page.waitForTimeout(900);
  await shot(page, "shop", w);

  // back in Talk the conversation is still there
  await page.getByRole("link", { name: "Talk" }).click();
  await page.waitForURL(/\/studio\/talk\/$/);
  await page.getByText(/for a man in their 20s/).first().waitFor();

  // the microphone: record, stop, and the transcript waits in the composer to be checked, not sent
  await page.goto(`${BASE}/studio/talk/?new`);
  await page.getByRole("button", { name: "Speak instead" }).click();
  await page.getByText(/^0:0\d$/).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "listening", w);
  await page.getByRole("button", { name: "Stop and write it down" }).click();
  await page.waitForFunction(() => (document.querySelector("#brief") as HTMLTextAreaElement | null)?.value.includes("maroon lehenga"));
  await page.getByText("Check the words, then send.").waitFor();
  assert.equal(await page.locator(".fitting").count(), 0, "a transcript is never sent by itself");
  await shot(page, "transcript", w);

  assert.deepEqual(errors, [], `page errors at ${w}: ${errors.join(" | ")}`);
  console.log(`ok ${w}: redirects, rubbish guard, ${asked.length} questions without repeats, sheet, men-only shop links, voice to composer`);
  await ctx.close();
}
await browser.close();
