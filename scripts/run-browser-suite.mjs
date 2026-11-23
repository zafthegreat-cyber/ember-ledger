// Runs the browser tests listed in scripts/browser-suite.json against a running
// app (APP_URL, default http://127.0.0.1:5217), one at a time, and fails if any
// listed test fails. Tests under "knownFailing" are not run here; they are
// stale or need data the CI app doesn't have, and are tracked as work to fix.
// CI starts the app with: vite --host 127.0.0.1 --port 5217 --strictPort
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const suite = JSON.parse(readFileSync(new URL("./browser-suite.json", import.meta.url), "utf8"));
const appUrl = process.env.APP_URL || "http://127.0.0.1:5217";
const only = process.argv.slice(2);
// SHARD="2/3" runs every third listed test starting with the second, so CI can
// split the suite across parallel jobs. Ignored when files are named explicitly.
const shardMatch = /^(\d+)\/(\d+)$/.exec(process.env.SHARD || "");
const [shardIndex, shardCount] = shardMatch ? [Number(shardMatch[1]), Number(shardMatch[2])] : [1, 1];
if (shardIndex < 1 || shardIndex > shardCount) throw new Error(`Invalid SHARD "${process.env.SHARD}"`);
const files = only.length ? only : suite.passing.filter((_, index) => index % shardCount === shardIndex - 1);
const failed = [];
for (const file of files) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ["--no-warnings", `scripts/${file}`], {
    env: { ...process.env, APP_URL: appUrl },
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.status === 0) {
    console.log(`PASS ${file} (${seconds}s)`);
  } else {
    failed.push(file);
    console.log(`FAIL ${file} (${seconds}s)`);
    const tail = `${result.stdout || ""}\n${result.stderr || ""}`.trim().split("\n").slice(-25).join("\n");
    console.log(tail);
    // Annotations show on the run page without signing in, unlike the full log.
    if (process.env.GITHUB_ACTIONS) {
      const escape = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
      console.log(`::error title=FAIL ${file}::${escape(tail.split("\n").slice(-12).join("\n"))}`);
    }
  }
}
console.log(`\n${files.length - failed.length}/${files.length} browser tests passed; ${suite.knownFailing.length} known-failing tests not run.`);
if (failed.length) process.exit(1);
