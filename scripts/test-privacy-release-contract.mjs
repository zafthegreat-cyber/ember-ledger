import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

// Execute the real public verifier with an in-memory transport/filesystem. This
// checks its exit contract without contacting a deployment or writing evidence.
const source = await fs.readFile(new URL("./check-privacy-release.mjs", import.meta.url), "utf8");
async function run({ rejectedOrigin = "", wrongAllowOrigin = "", statusCode = 401 } = {}) {
  const requests = [];
  let evidence;
  const processStub = { argv: ["node", "check-privacy-release.mjs"], exitCode: 0, cwd: () => process.cwd() };
  const context = vm.createContext({
    URL, AbortSignal, TextDecoder, process: processStub, console: { log() {} },
    fetch: async (input, init) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://code3tcg.app");
      assert.ok(["GET", "OPTIONS"].includes(init.method), "Public verifier never mutates an account");
      assert.equal(init.credentials, "omit");
      assert.equal(init.redirect, "error");
      requests.push({ path: url.pathname, method: init.method });
      if (init.method === "OPTIONS") {
        const origin = init.headers.Origin;
        if (origin === "https://untrusted.example.invalid" || origin === rejectedOrigin) {
          return new Response(JSON.stringify({ error: { code: "origin_not_allowed" } }), { status: 403, headers: { "content-type": "application/json" } });
        }
        return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin === wrongAllowOrigin ? "https://wrong.example.invalid" : origin } });
      }
      if (url.pathname.startsWith("/api/")) return new Response(JSON.stringify({ error: { code: "account_sign_in_required" } }), {
        status: statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
      return new Response("<!doctype html><title>Synthetic</title>", { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async specifier => {
    const value = specifier === "node:assert/strict" ? assert : specifier === "node:path" ? path : specifier === "node:fs/promises" ? {
      mkdir: async () => {}, writeFile: async (_target, content) => { evidence = JSON.parse(content); },
    } : null;
    assert.ok(value, "Only the verifier's reviewed built-in imports are allowed");
    return new vm.SyntheticModule(["default"], function () { this.setExport("default", value); }, { context });
  });
  await module.evaluate();
  assert.equal(requests.length, 9);
  assert.equal(evidence.mutations, 0);
  assert.equal(evidence.deletionOperationalVerified, false, "A public smoke never claims operational deletion proof");
  return { code: processStub.exitCode, evidence };
}

assert.equal((await run()).code, 0, "All exact-origin public gates may pass");
for (const nativeOrigin of ["capacitor://localhost", "https://localhost"]) {
  assert.equal((await run({ rejectedOrigin: nativeOrigin })).code, 1, "A rejected native preflight must fail the command");
  assert.equal((await run({ wrongAllowOrigin: nativeOrigin })).code, 1, "A native ACAO mismatch must fail despite HTTP204");
}
assert.equal((await run({ rejectedOrigin: "https://code3tcg.app" })).code, 1, "A rejected web preflight remains a failure");
assert.equal((await run({ statusCode: 200 })).code, 1, "A successful unauthenticated API response remains a failure");
console.log("PASS 7 public privacy verifier exit-contract cases; no network or filesystem writes.");
