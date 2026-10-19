import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { buildMarketSourceSnapshot } = require("../dist/services/marketSources.service.js");
const { marketRouter } = require("../dist/routes/market.routes.js");
const { createLegacyApiBoundary } = require("../dist/security/legacyApiBoundary.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const OBSERVED = "2026-10-18T20:00:00Z";
const row = { tcgplayerProductId: "451396", source: "TCGCSV", variant: "Holofoil", currency: "USD", marketPrice: 25, marketPriceBasis: "market", priceCheckedAt: OBSERVED };

test("snapshot uses only exact TCGplayer IDs and exposes a bounded public allowlist", () => {
  const snapshot = buildMarketSourceSnapshot("451396", [
    { ...row, user_id: "private", note: "private", sourceUrl: "javascript:alert(1)" },
    { ...row, tcgplayerProductId: "999", marketPrice: 99 },
    { ...row, tcgplayerProductId: undefined, sku: "451396" },
    { ...row },
  ], { lastImportedAt: OBSERVED, secret: "private" });
  assert.equal(snapshot.quotes.length, 1);
  assert.equal(snapshot.quotes[0].amount, 25);
  assert.equal(snapshot.quotes[0].observedAt, "2026-10-18T20:00:00.000Z");
  assert.equal(snapshot.quotes[0].condition, "Product-level aggregate");
  assert.equal(snapshot.quotes[0].sourceUrl, "https://www.tcgplayer.com/product/451396");
  assert.doesNotMatch(JSON.stringify(snapshot), /private|user_id|javascript/);
  for (const id of ["../secrets", "0", "1?x=2", "-3", "4e3", "999999999999"]) assert.equal(buildMarketSourceSnapshot(id, [row], {}), null);
});

test("legacy metadata timestamps do not become price observation timestamps", () => {
  const snapshot = buildMarketSourceSnapshot("451396", [{ ...row, marketPriceBasis: undefined, priceCheckedAt: undefined, timestamp: OBSERVED, sourceUpdatedAt: OBSERVED, updatedAt: OBSERVED }], { lastImportedAt: OBSERVED });
  assert.equal(snapshot.quotes[0].observedAt, "");
  assert.equal(snapshot.quotes[0].priceBasis, "unknown");
  assert.equal(snapshot.quotes[0].marketEligible, false);
  assert.equal(snapshot.snapshotLastImportedAt, "2026-10-18T20:00:00.000Z");
});

test("manual, admin and estimated values are never relabeled as TCGplayer quotes", () => {
  const rows = [
    { ...row, marketStatus: "manual" }, { ...row, externalSource: "Manual" },
    { ...row, marketValueSource: "admin" }, { ...row, sourceType: "mock" },
    { ...row, marketSource: "estimated" }, { ...row, source: "Other provider" },
  ];
  assert.equal(buildMarketSourceSnapshot("451396", rows, {}).quotes.length, 0);
  assert.equal(buildMarketSourceSnapshot("451396", [...rows, row], {}).quotes.length, 1);
});

test("variants are separate, median fallback is listing, and invalid values never become zero quotes", () => {
  const snapshot = buildMarketSourceSnapshot("451396", [row, { ...row, variant: "Normal", marketPriceBasis: "mid" },
    ...[null, "", 0, -1, "bad", Infinity, 1e12].map(marketPrice => ({ ...row, marketPrice })),
    { ...row, currency: "EUR" },
  ], {});
  assert.equal(snapshot.quotes.length, 2);
  assert.equal(snapshot.quotes[1].kind, "listing");
  assert.equal(snapshot.quotes[1].marketEligible, false);
  const bounded = buildMarketSourceSnapshot("451396", Array.from({ length: 100 }, (_, index) => ({ ...row, variant: `Printing ${index}` })), {});
  assert.equal(bounded.quotes.length, 20);
  assert.equal(buildMarketSourceSnapshot("451396", [], {}).status, "no_quote");
});

test("public route validates identity, serves generated prices without auth and keeps writes protected", async () => {
  const root = resolve(import.meta.dirname, "../..");
  const previousCwd = process.cwd();
  process.chdir(root);
  const rows = JSON.parse(readFileSync(resolve(root, "src/data/generated/marketPrices.json"), "utf8"));
  const known = rows.find(candidate => candidate.currency === "USD" && Number(candidate.marketPrice) > 0 && /^[1-9]\d{0,9}$/.test(candidate.tcgplayerProductId));
  assert.ok(known);
  const env = { NODE_ENV: "production", CODE3_OWNER_SUBJECTS: "supabase:owner" };
  const security = createOwnerSecurity({ env, runtimeKind: "production", identityProvider: { providerId: "supabase", isConfigured: () => true, verifyAccessToken: async () => ({ ok: false, reason: "invalid" }) } });
  const app = express();
  app.use(createLegacyApiBoundary({ security, env, runtimeKind: "production" }));
  app.use("/api/market", marketRouter);
  const server = await new Promise(resolveServer => { const listening = app.listen(0, "127.0.0.1", () => resolveServer(listening)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/market`;
    const readable = await fetch(`${base}/sources/${known.tcgplayerProductId}`);
    assert.equal(readable.status, 200);
    assert.match(readable.headers.get("cache-control"), /public/);
    const payload = await readable.json();
    assert.equal(payload.productId, known.tcgplayerProductId);
    assert.ok(payload.quotes.length > 0 && payload.quotes.length <= 20);
    assert.doesNotMatch(JSON.stringify(payload), /user_id|password|service_role|[A-Z]:\\/);
    const invalid = await fetch(`${base}/sources/retailer-sku`);
    assert.equal(invalid.status, 400);
    const missing = await fetch(`${base}/sources/9999999999`);
    assert.equal(missing.status, 200);
    assert.equal((await missing.json()).status, "no_quote");
    const denied = await fetch(`${base}/refresh/${known.tcgplayerProductId}`, { method: "POST" });
    assert.equal(denied.status, 401);
  } finally {
    await new Promise((resolveServer, reject) => server.close(error => error ? reject(error) : resolveServer()));
    process.chdir(previousCwd);
  }
});
