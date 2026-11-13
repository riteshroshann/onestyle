// Every check Bespoke has, in one run: types, the build, every unit suite, the three browser walks against the fresh
// build, and the security checks (locally, then against the live site when asked).
// usage: bun tests/run-all.ts [--live] [--skip-e2e]
//   PLAYWRIGHT_CORE=<path to playwright-core/index.mjs> points the browser walks at a playwright-core install; they
//   launch Microsoft Edge. Without it, they are skipped and the run says so.
// Author: Ritesh Roshan
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const E2E = !args.includes("--skip-e2e");
const PW = process.env.PLAYWRIGHT_CORE ?? "";
const PORT = 4299;
const BASE = `http://localhost:${PORT}`;
const bun = process.execPath;
// screenshots from the walks go to a temp folder, never into the repo
const SHOTS = mkdtempSync(join(tmpdir(), "bespoke-shots-"));

const results: [string, "pass" | "fail" | "skip", string][] = [];
function run(name: string, cmd: string, argv: string[], env: Record<string, string> = {}, cwd = process.cwd()) {
  process.stdout.write(`… ${name}\n`);
  const r = spawnSync(cmd, argv, { cwd, encoding: "utf8", env: { ...process.env, ...env }, shell: process.platform === "win32" && cmd !== bun });
  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split(/\r?\n/).filter((l) => !/answered \d{3}$/.test(l)).slice(-1)[0] ?? "";
  results.push([name, r.status === 0 ? "pass" : "fail", tail.slice(0, 110)]);
  if (r.status !== 0) console.log(`${r.stdout ?? ""}${r.stderr ?? ""}`.split(/\r?\n/).slice(-15).join("\n"));
}

run("types", bun, ["x", "tsc", "--noEmit", "-p", "."]);
run("build", bun, ["run", "build"]);
for (const f of readdirSync("tests").filter((f) => f.endsWith(".test.ts")).sort()) run(`unit: ${f}`, bun, [`tests/${f}`]);

if (E2E && PW) {
  const server = spawn(bun, ["x", "serve", "out", "-l", String(PORT)], { stdio: "ignore", shell: process.platform === "win32" });
  await wait(4000);
  try {
    run("e2e: studio", bun, ["tests/e2e/studio.e2e.ts"], { PLAYWRIGHT: PW, STUDIO: BASE, SHOTS });
    run("e2e: board", bun, ["tests/e2e/board.e2e.mjs"], { PLAYWRIGHT_CORE: PW, BASE, SHOTS });
    // the inbox walk loads playwright-core from the folder it runs in
    run("e2e: inbox", bun, [resolve("tests/e2e/inbox.e2e.ts"), BASE, SHOTS], {}, dirname(dirname(dirname(PW))));
    run("security: local build", bun, ["tests/security/pentest.mjs", BASE]);
  } finally {
    server.kill();
  }
} else results.push(["browser walks", "skip", PW ? "--skip-e2e" : "set PLAYWRIGHT_CORE to run them"]);

if (LIVE) run("security: live site", bun, ["tests/security/pentest.mjs", "https://onestyle-tawny.vercel.app"]);
else results.push(["security: live site", "skip", "pass --live"]);

console.log(`\nscreenshots: ${SHOTS}\nsummary`);
for (const [name, state, tail] of results) console.log(`  ${state.padEnd(4)}  ${name.padEnd(28)} ${tail}`);
const failed = results.filter(([, s]) => s === "fail").length;
console.log(`\n${results.filter(([, s]) => s === "pass").length} passed, ${failed} failed, ${results.filter(([, s]) => s === "skip").length} skipped`);
process.exit(failed ? 1 : 0);
