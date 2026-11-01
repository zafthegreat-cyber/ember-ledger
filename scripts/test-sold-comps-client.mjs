import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
const source = readFileSync(new URL("../src/features/flipScout/ebayClient.js", import.meta.url), "utf8");
async function client(fetchImpl, ownerHeaders = async () => ({ Authorization: "Bearer TEST_OWNER_TOKEN" })) {
  const context = createContext({ window: { setTimeout, clearTimeout, location: { search: "" } }, URLSearchParams, AbortController, DOMException, fetch: fetchImpl });
  const owner = new SyntheticModule(["getOwnerRequestHeaders", "isLocalDevelopmentIdentityEnabled"], function () {
    this.setExport("getOwnerRequestHeaders", ownerHeaders); this.setExport("isLocalDevelopmentIdentityEnabled", () => false);
  }, { context });
  const native = new SyntheticModule(["getApiBase"], function () { this.setExport("getApiBase", () => "https://app.example.test"); }, { context });
  const module = new SourceTextModule(source, { context });
  await module.link(name => { if (name.endsWith("ownerSession.js")) return owner; if (name.endsWith("nativeRuntime.js")) return native; throw new Error(`Unexpected import ${name}`); });
  await module.evaluate(); return module.namespace;
}
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
test("sold transport uses owner authentication, application routes and only the explicit identity body", async () => {
  const calls = [];
  const api = await client(async (url, init) => { calls.push({ url, init }); return response({ ok: true, configured: true }); });
  await api.getEbaySoldHealth(); await api.searchEbaySoldComparables({ name: "Charizard", cardNumber: "4/102" });
  assert.equal(calls[0].url, "https://app.example.test/api/ebay/sold/health");
  assert.equal(calls[1].url, "https://app.example.test/api/ebay/sold/search");
  assert.equal(calls[1].init.headers.Authorization, "Bearer TEST_OWNER_TOKEN");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), { name: "Charizard", cardNumber: "4/102" });
  assert.ok(!Object.keys(calls[1].init.headers).some(key => /api.key/i.test(key)));
});
test("cancel during the asynchronous session read prevents the provider-facing request", async () => {
  let resolveHeaders;
  const api = await client(() => assert.fail("request sent after cancellation"), () => new Promise(resolve => { resolveHeaders = resolve; }));
  const controller = new AbortController(); const pending = api.searchEbaySoldComparables({}, { signal: controller.signal });
  controller.abort(); resolveHeaders({});
  await assert.rejects(pending, error => error.code === "aborted");
});
test("cancel while fetching stops the request and remains distinct from a timeout", async () => {
  let started; const ready = new Promise(resolve => { started = resolve; });
  const api = await client((_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError"))); started(); }));
  const controller = new AbortController(); const pending = api.searchEbaySoldComparables({}, { signal: controller.signal });
  await ready; controller.abort(); await assert.rejects(pending, error => error.code === "aborted");
});
test("owner denial and unconfigured-provider responses stay errors instead of fabricated price results", async () => {
  for (const status of [401, 403, 503]) {
    const api = await client(async () => response({ ok: false, error: { code: "sold_data_not_configured", message: "Sold prices are not connected." } }, status));
    await assert.rejects(api.searchEbaySoldComparables({}), error => error.status === status);
  }
  const api = await client(async () => new Response("<html>SPA fallback</html>"));
  await assert.rejects(api.getEbaySoldHealth(), /unreadable response/);
});
