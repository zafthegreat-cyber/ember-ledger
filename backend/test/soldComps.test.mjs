import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";
const require = createRequire(import.meta.url);
const { soldCompsHealth, searchSoldComps, normalizeSoldComps } = require("../dist/services/soldComps.service.js");
const { createEbayRouter } = require("../dist/routes/ebay.routes.js");
const now = Date.parse("2026-10-25T12:00:00Z");
const env = { COMPSAPI_ENABLED: "true", COMPSAPI_API_KEY: "TEST_ONLY_COMPS_KEY" };
const identity = { name: "Charizard", setName: "Base Set", cardNumber: "4/102", printing: "holo", language: "en", condition: "NM", grader: "", grade: "" };
const sale = (id, price, patch = {}) => ({
  item_id: String(800000000000 + id), title: "Pokemon Charizard Base Set 4/102 Holo English NM", price,
  last_sold: "2026-10-24T10:00:00Z", units_sold: 1, us_sale: true,
  card: { graded: false, card_number: "4/102", condition: "nm", language: "en", first_edition: false, flags: [] }, ...patch,
});
const payload = items => ({ ok: true, source: "ebay", items });
const response = (body, options = {}) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...options });

test("disabled or missing configuration never contacts the provider or exposes credentials", async () => {
  for (const config of [{}, { ...env, COMPSAPI_ENABLED: "false" }, { COMPSAPI_ENABLED: "true" }]) {
    assert.equal(soldCompsHealth(config).configured, false);
    await assert.rejects(searchSoldComps(identity, config, { fetchImpl: () => assert.fail("unexpected paid request") }), error => error.status === 503);
  }
  assert.equal(soldCompsHealth(env).configured, true);
  assert.doesNotMatch(JSON.stringify(soldCompsHealth(env)), /TEST_ONLY_COMPS_KEY/);
});

test("search uses the documented fixed host, private header and bounded explicit card filters", async () => {
  let calls = 0;
  const result = await searchSoldComps(identity, env, { now: () => now, fetchImpl: async (url, options) => {
    calls++; const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "https://api.compsapi.com/v1/sold");
    assert.equal(parsed.searchParams.get("q"), "Charizard Base Set 4/102");
    for (const [key, value] of Object.entries({ site: "US", days: "90", size: "100", cards: "1", graded: "false", card_condition: "nm", lang: "en", first_edition: "false", exclude: "junk,sealed" })) assert.equal(parsed.searchParams.get(key), value);
    assert.doesNotMatch(parsed.href, /TEST_ONLY_COMPS_KEY/);
    assert.equal(options.headers["X-API-Key"], env.COMPSAPI_API_KEY);
    assert.equal(options.redirect, "error");
    return response(payload([sale(1, 100), sale(2, 120), sale(3, 110)]));
  } });
  assert.equal(calls, 1); assert.equal(result.estimatedMarketPrice, 110); assert.equal(result.sampleSize, 3);
});

test("incomplete or mixed card identity is rejected before any provider request", async () => {
  for (const patch of [{ name: "" }, { setName: "" }, { cardNumber: "" }, { printing: "any" }, { language: "" }, { condition: "" }, { grader: "PSA", grade: "10" }, { grader: "PSA", grade: "11", condition: "" }, { grade: "9" }]) {
    await assert.rejects(searchSoldComps({ ...identity, ...patch }, env, { fetchImpl: () => assert.fail("unexpected request") }), error => error.code === "match_required");
  }
});

test("estimate uses distinct matched single sales, exact cents and a public allowlist", () => {
  const row = sale(1, 100.01, { seller: "private seller", user_id: "private id", image: "https://private.test", url: "javascript:bad" });
  const result = normalizeSoldComps(payload([row, row, sale(2, 100.02), sale(3, 100.03), sale(4, 100.04)]), identity, now);
  assert.equal(result.estimatedMarketPrice, 100.03);
  assert.equal(result.sampleSize, 4); assert.equal(result.shippingTreatment, "EXCLUDE_SHIPPING");
  assert.equal(result.comparables[0].sourceUrl, `https://www.ebay.com/itm/${row.item_id}`);
  assert.doesNotMatch(JSON.stringify(result), /private|seller|user_id|javascript|TEST_ONLY/);
});

test("wrong set, number, language, printing, condition, grade, stale rows and aggregate listings cannot set market value", () => {
  const card = sale(1, 100).card;
  const invalid = [
    { title: "Pokemon Charizard Celebrations 4/102 Holo English NM" },
    { title: "Pokemon Charizard Base Set 4/102 Reverse Holo English NM" },
    { title: "Pokemon Charizard Base Set 4/102 Non-Holo English NM" },
    { title: "Pokemon Charizard Base Set 4/102 Holo Shadowless English NM" },
    { title: "Pokemon Charizard Base Set 4/102 Holo 1st Edition English NM" },
    { title: "Pokemon Charizard Base Set 4/102 Holo English NM proxy" },
    { card: { ...card, card_number: "6/102" } }, { card: { ...card, language: "ja" } },
    { card: { ...card, condition: "lp" } }, { card: { ...card, graded: true, grader: "PSA", grade: "10" } },
    { card: { ...card, flags: ["lot"] } }, { card: { ...card, first_edition: true } },
    { units_sold: 2 }, { units_sold: undefined }, { us_sale: false }, { price: 0 }, { price: "1.001" }, { price: "NaN" },
    { last_sold: "2026-06-01T00:00:00Z" }, { last_sold: "2026-10-26T00:00:00Z" }, { last_sold: "2026-10-24" },
  ];
  for (let index = 0; index < invalid.length; index++) {
    const result = normalizeSoldComps(payload([sale(index + 1, 100, invalid[index]), sale(80, 110), sale(81, 120)]), identity, now);
    assert.equal(result.sampleSize, 2, JSON.stringify(invalid[index]));
    assert.equal(result.marketEligible, false); assert.equal(result.estimatedMarketPrice, null);
  }
});

test("explicit grade and edition stay separate from raw condition and other grades", () => {
  const graded = { ...identity, condition: "", grader: "PSA", grade: "8", printing: "first_edition" };
  const row = sale(1, 500, { title: "Charizard Base Set 4/102 Holo English 1st Edition PSA 8", card: { ...sale(1, 1).card, first_edition: true, graded: true, grader: "PSA", grade: "8", condition: null } });
  const result = normalizeSoldComps(payload([row, { ...row, item_id: "800000000002", price: 510 }, { ...row, item_id: "800000000003", price: 520 }, { ...row, item_id: "800000000004", card: { ...row.card, grade: "9" } }]), graded, now);
  assert.equal(result.estimatedMarketPrice, 510); assert.equal(result.sampleSize, 3);
  assert.equal(result.comparables[0].condition, "PSA 8");
});

test("minimum sample and IQR filtering cannot fabricate a zero or use an extreme price", () => {
  for (const prices of [[], [100], [100, 110]]) {
    const result = normalizeSoldComps(payload(prices.map((price, index) => sale(index, price))), identity, now);
    assert.equal(result.estimatedMarketPrice, null); assert.equal(result.status, "insufficient_sales");
  }
  const result = normalizeSoldComps(payload([100, 101, 102, 103, 104, 105, 106, 10000].map((price, index) => sale(index, price))), identity, now);
  assert.equal(result.outliersRemoved, 1); assert.equal(result.sampleSize, 7); assert.equal(result.estimatedMarketPrice, 103);
});

test("provider errors, redirects, timeouts and malformed/oversized bodies fail safely", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(searchSoldComps(identity, env, { fetchImpl: async () => response({ error: env.COMPSAPI_API_KEY }, { status, headers: { "retry-after": "75" } }) }), error => {
      assert.doesNotMatch(error.message, /TEST_ONLY_COMPS_KEY/);
      return status === 429 ? error.status === 429 && error.retryAfterSeconds === 75 : error.status === 502;
    });
  }
  for (const body of ["not json", JSON.stringify(payload([])).replace('"ebay"', '"other"'), "x".repeat(2_000_001)]) {
    await assert.rejects(searchSoldComps(identity, env, { fetchImpl: async () => new Response(body) }), error => error.status === 502);
  }
  await assert.rejects(searchSoldComps(identity, env, { timeoutMs: 5, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")), { once: true })) }), error => error.status === 504);
  await assert.rejects(searchSoldComps(identity, env, { fetchImpl: async () => { throw new Error(`redirect ${env.COMPSAPI_API_KEY}`); } }), error => error.status === 502 && !error.message.includes(env.COMPSAPI_API_KEY));
});

test("sold routes retain owner authentication and do not cache responses", async () => {
  const savedEnabled = process.env.COMPSAPI_ENABLED; process.env.COMPSAPI_ENABLED = "false";
  const app = express(); app.use(express.json());
  app.use("/api/ebay", createEbayRouter((req, res, next) => {
    if (req.get("x-test-owner") !== "yes") return res.status(401).json({ ok: false });
    res.locals.authPrincipal = { provider: "test", subject: "owner" }; next();
  }));
  const server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/ebay/sold`;
    assert.equal((await fetch(`${base}/health`)).status, 401);
    assert.equal((await fetch(`${base}/search`, { method: "POST" })).status, 401);
    const health = await fetch(`${base}/health`, { headers: { "x-test-owner": "yes" } });
    assert.equal(health.status, 200); assert.equal(health.headers.get("cache-control"), "no-store");
    assert.equal((await health.json()).configured, false);
    const search = await fetch(`${base}/search`, { method: "POST", headers: { "x-test-owner": "yes", "content-type": "application/json" }, body: JSON.stringify(identity) });
    assert.equal(search.status, 503); assert.equal(search.headers.get("cache-control"), "no-store");
    assert.equal((await search.json()).error.code, "sold_data_not_configured");
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (savedEnabled === undefined) delete process.env.COMPSAPI_ENABLED; else process.env.COMPSAPI_ENABLED = savedEnabled;
  }
});
