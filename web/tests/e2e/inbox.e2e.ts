// End to end on the local build (no Supabase keys): a maker and a customer sign up, a design goes from the studio
// to the maker, they talk, and the badge, toast, tab title, typing and safety rules are checked in a real browser.
//
//   cd web && bun run build && (bun x serve out -l 4203 &)
//   cd <a folder with playwright-core installed> && bun <path>/web/tests/e2e/inbox.e2e.ts http://localhost:4203 [screenshot dir]
//
// The local store keeps data in this browser's storage, which two browser contexts never share. So both people use
// two tabs of one context; each tab remembers who signed in there (lib/market/local.ts).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:4203";
const SHOTS = process.argv[3] ?? process.cwd();
const { chromium } = createRequire(join(process.cwd(), "noop.js"))("playwright-core") as typeof import("playwright-core");

const value = (v: string) => ({ value: v, p: 1, src: "words", evidence: v });
const SPEC = {
  version: 1, slots: { garment: value("kurti"), fabric: value("silk"), "sleeve.length": value("three quarter"), "garment.length": value("knee") },
  lists: { colour: [value("navy")] }, excluded: [], comparisons: [], history: [],
};
const MAKER = { name: "Meera Stitches", email: "meera@example.com", password: "needle-and-thread", city: "Jaipur" };
const CUSTOMER = { name: "Asha Patil", email: "asha@example.com", password: "correct horse", city: "Pune" };

const errors: string[] = [];
// the splash and entrance springs settle before a picture is taken
const shot = async (p: Page, name: string) => { await p.bringToFront(); await p.waitForTimeout(1200); await p.screenshot({ path: join(SHOTS, `inbox-${name}.png`) }); };
const step = (s: string) => console.log(`  ${s}`);
const convo = (p: Page) => p.getByRole("list", { name: "Conversation", exact: true });

async function signUp(p: Page, path: string, who: typeof MAKER) {
  await p.goto(BASE + path);
  await p.getByLabel("Name").fill(who.name);
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password", { exact: true }).fill(who.password);
  await p.getByLabel("City").fill(who.city);
  await p.getByRole("button", { name: "Create account" }).click();
}

const browser: Browser = await chromium.launch({ channel: "msedge" });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const maker = await ctx.newPage();
  const customer = await ctx.newPage();
  for (const p of [maker, customer]) p.on("pageerror", (e) => errors.push(e.message));

  step("sign-in gate on the customer inbox when signed out");
  await customer.goto(BASE + "/orders/");
  await customer.getByRole("dialog").waitFor();
  assert.equal(await customer.getByRole("link", { name: "Log in" }).last().getAttribute("href"), "/login/?next=%2Forders%2F");
  await shot(customer, "gate-1440");

  step("both sign up, in their own tabs");
  await signUp(maker, "/makers/signup/", MAKER);
  await maker.waitForURL(/\/makers\/$/);
  await maker.getByText("No requests yet.").waitFor();
  await shot(maker, "maker-empty-1440");
  await signUp(customer, "/signup/", CUSTOMER);
  await customer.waitForURL(/\/orders\/$/);
  await customer.getByText("Nothing sent yet.").waitFor();
  await shot(customer, "customer-empty-1440");

  step("the customer sends a design from the studio");
  await customer.evaluate((spec) => { sessionStorage.setItem("bespoke.spec", JSON.stringify(spec)); sessionStorage.setItem("bespoke.msgs", "[]"); }, SPEC);
  await customer.goto(BASE + "/studio/?view=sheet");
  await customer.getByRole("button", { name: "Send to a maker" }).click();
  await customer.getByRole("button", { name: new RegExp(MAKER.name) }).click();
  await customer.getByLabel("Note to the maker").fill("Can you make this for a wedding in June?");
  await customer.getByRole("button", { name: `Send to ${MAKER.name}` }).click();
  await customer.waitForURL(/\/orders\/\?r=/);
  await convo(customer).getByText("Can you make this for a wedding in June?").waitFor();

  step("the maker hears about it: toast, badge, tab title");
  await maker.getByTestId("toast").waitFor();
  assert.match(await maker.getByTestId("toast").innerText(), /Asha Patil/);
  await maker.getByRole("link", { name: "Inbox, 1 unread" }).waitFor();
  assert.match(await maker.title(), /^\(1\) /);
  await shot(maker, "maker-toast-1440");

  step("the maker opens it, flags a missing detail, accepts and replies");
  await maker.getByTestId("thread-row").first().click();
  await maker.getByText("Navy kurti").first().waitFor();
  await maker.getByRole("link", { name: "Inbox", exact: true }).waitFor();
  assert.doesNotMatch(await maker.title(), /^\(/, "reading clears the tab title");
  await maker.getByRole("button", { name: "Flag missing details" }).click();
  await maker.getByRole("button", { name: "Bust measurement", exact: true }).click();
  await maker.getByRole("button", { name: "Ask for it" }).click();
  await convo(maker).getByText("Could you share the bust measurement?").waitFor();
  await maker.getByRole("button", { name: /^Status:/ }).click();
  await maker.getByRole("menuitemradio", { name: "Being made" }).click();
  await convo(maker).getByText("Marked as being made.").waitFor();
  await maker.getByRole("button", { name: "Can you share a reference photo?" }).click();
  assert.equal(await maker.getByLabel("Message").inputValue(), "Can you share a reference photo?", "a quick reply lands in the composer");
  await maker.getByLabel("Message").fill("Lovely choice. June works for me.");
  await maker.getByRole("button", { name: "Send" }).click();
  await convo(maker).getByText("Lovely choice. June works for me.").waitFor();
  await maker.getByRole("button", { name: "Full sheet" }).click();
  await maker.getByRole("dialog", { name: "Tailor sheet" }).waitFor();
  await maker.waitForTimeout(500);
  await shot(maker, "maker-sheet-1440");
  await maker.keyboard.press("Escape");

  step("the customer, elsewhere on the site, gets a toast and a badge");
  await customer.goto(BASE + "/");
  await customer.getByRole("link", { name: /^Inbox/ }).waitFor();
  await maker.getByLabel("Message").fill("Also, which shade of navy?");
  await maker.getByRole("button", { name: "Send" }).click();
  await customer.getByTestId("toast").filter({ hasText: "which shade of navy" }).waitFor();
  assert.match(await customer.title(), /^\(\d+\) /);
  const badge = await customer.getByRole("link", { name: /^Inbox, \d+ unread/ }).getAttribute("aria-label");
  assert.ok(badge && Number(badge.match(/\d+/)?.[0]) >= 1);
  await customer.waitForTimeout(400);
  await shot(customer, "customer-toast-1440");
  await customer.getByTestId("toast").filter({ hasText: "which shade of navy" }).click();
  await customer.waitForURL(/\/orders\/\?r=/);
  await convo(customer).getByText("Also, which shade of navy?").waitFor();
  await customer.getByRole("link", { name: "Inbox", exact: true }).waitFor();
  await customer.getByText(/needs bust measurement/).waitFor();
  await customer.getByRole("button", { name: "Answer" }).click();
  assert.equal(await customer.getByLabel("Message").inputValue(), "Bust measurement: ");

  step("typing shows on the other side");
  await customer.getByLabel("Message").pressSequentially("36", { delay: 40 });
  await maker.getByLabel(`${CUSTOMER.name} is typing`).waitFor();
  await shot(maker, "maker-typing-1440");
  await customer.getByRole("button", { name: "Send" }).click();
  await convo(maker).getByText("Bust measurement: 36").waitFor();
  await shot(customer, "customer-thread-1440");

  step("markup in a message is shown as text");
  const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>bold</b>`;
  await customer.getByLabel("Message").fill(payload);
  await customer.getByRole("button", { name: "Send" }).click();
  await convo(maker).getByText(payload).waitFor();
  assert.equal(await maker.evaluate(() => (window as unknown as { __xss?: number }).__xss), undefined);
  assert.equal(await maker.locator("[data-testid=bubble] img, [data-testid=bubble] b, [data-testid=bubble] script").count(), 0);

  step("an overly long message cannot be sent");
  await customer.getByLabel("Message").fill("x".repeat(2001));
  assert.equal(await customer.getByRole("button", { name: "Send" }).isDisabled(), true);
  await customer.getByRole("alert").filter({ hasText: "Shorten it to 2000 characters" }).waitFor();
  await customer.getByLabel("Message").fill("");

  step("a customer cannot change status");
  assert.equal(await customer.getByRole("button", { name: /^Status:/ }).count(), 0);

  step("next= only goes to paths on this site");
  for (const bad of ["//evil.example/x", "https://evil.example/", "/\\evil.example", "javascript:alert(1)"]) {
    await customer.goto(`${BASE}/login/?next=${encodeURIComponent(bad)}`);
    await customer.waitForURL((u) => u.pathname === "/orders/");
    assert.equal(new URL(customer.url()).origin, new URL(BASE).origin, `next=${bad}`);
  }
  await customer.goto(`${BASE}/login/?next=${encodeURIComponent("/about/")}`);
  await customer.waitForURL((u) => u.pathname === "/about/");

  step("phone: list and thread are two screens");
  await maker.setViewportSize({ width: 390, height: 844 });
  await maker.goto(BASE + "/makers/");
  await maker.getByTestId("thread-row").first().waitFor();
  await maker.waitForTimeout(400);
  await shot(maker, "maker-list-390");
  await maker.getByTestId("thread-row").first().click();
  await maker.getByRole("button", { name: "All conversations" }).waitFor();
  await maker.waitForTimeout(500);
  await shot(maker, "maker-thread-390");
  await maker.getByRole("button", { name: /^Status:/ }).click();
  await maker.getByRole("menuitem", { name: "Flag missing details" }).click();
  await maker.getByText("What is missing from the sheet?").waitFor();
  await shot(maker, "maker-flag-390");
  await maker.getByRole("button", { name: "Cancel" }).click();
  await maker.getByRole("button", { name: "All conversations" }).click();
  await maker.getByTestId("thread-row").first().waitFor();
  await customer.setViewportSize({ width: 390, height: 844 });
  await customer.goto(BASE + "/orders/");
  await customer.getByTestId("thread-row").first().click();
  await customer.waitForTimeout(500);
  await shot(customer, "customer-thread-390");

  assert.deepEqual(errors, [], "no page errors");
  console.log("inbox e2e: all passed");
} finally {
  await browser.close();
}
