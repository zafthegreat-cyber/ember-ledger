import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchMarketSourceQuotes, resolveMarketSourceIdentity } from "../src/services/liveMarketSources.mjs";

const NOW = "2026-10-19T17:00:00.000Z";
const OBSERVED = "2026-10-18T20:00:00.000Z";
const item = { tcgplayerProductId: "451396", groupId: "3170", game: "Pokemon TCG", variant: "Holofoil", language: "English", catalogType: "card" };
const snapshot = (quotes = [{ amount: 25, currency: "USD", variant: "Holofoil", kind: "market", priceBasis: "market", observedAt: OBSERVED }]) => ({ productId: "451396", snapshotLastImportedAt: NOW, quotes });
const response = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const dexCard = pricing => ({ id: "swsh3-136", updated: "2020-01-01T00:00:00Z", pricing });

test("provider identity uses explicit IDs, never SKU or unrelated external IDs", () => {
  for (const candidate of [{ sku: "451396" }, { id: "swsh3-136", cardId: "swsh3-136" }, { sourceProductId: "451396" }, { externalProductId: "451396" }]) {
    const identity = resolveMarketSourceIdentity(candidate);
    assert.equal(identity.tcgplayerProductId, "");
    assert.equal(identity.tcgdexCardId, "");
  }
  assert.equal(resolveMarketSourceIdentity(item).tcgplayerCategoryId, "3");
  assert.equal(resolveMarketSourceIdentity({ ...item, game: "Magic" }).tcgplayerCategoryId, "");
  for (const unsafe of ["0", "1/../../secrets", "https://evil.test/1", "1?x=1", "1e4", "-1", "999999999999999999"]) assert.equal(resolveMarketSourceIdentity({ tcgplayerProductId: unsafe }).tcgplayerProductId, "");
  assert.notEqual(resolveMarketSourceIdentity(item).key, resolveMarketSourceIdentity({ ...item, language: "Japanese" }).key);
});

test("TCGplayer comparison fetches only our daily snapshot and leaves saved values untouched", async () => {
  const original = { ...item, marketPrice: 99, unitCost: 15, msrp: 20 };
  const copy = JSON.stringify(original);
  const calls = [];
  const result = await fetchMarketSourceQuotes(original, { now: NOW, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(snapshot()); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/market/sources/451396");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.redirect, "error");
  assert.deepEqual(calls[0].options.headers, { Accept: "application/json" });
  assert.equal(result.quotes[0].amount, 25);
  assert.equal(result.quotes[0].observedAt, OBSERVED);
  assert.equal(result.quotes[0].checkedAt, NOW);
  assert.equal(result.quotes[0].condition, "Product-level aggregate");
  assert.equal(result.quotes[0].marketEligible, true);
  assert.equal(JSON.stringify(original), copy);
});

test("legacy cached amounts retain unknown dates and basis instead of using product metadata dates", async () => {
  const result = await fetchMarketSourceQuotes(item, { now: NOW, fetchImpl: async () => response(snapshot([{ amount: 42, currency: "USD", variant: "Holofoil", kind: "market", timestamp: NOW, sourceUpdatedAt: NOW, sourceUrl: "javascript:alert(1)" }])) });
  assert.equal(result.quotes[0].amount, 42);
  assert.equal(result.quotes[0].observedAt, "");
  assert.equal(result.quotes[0].priceBasis, "unknown");
  assert.equal(result.quotes[0].marketEligible, false);
  assert.equal(result.quotes[0].snapshotLastImportedAt, NOW);
  assert.equal(result.quotes[0].sourceUrl, "https://www.tcgplayer.com/product/451396");
});

test("variant, condition, graded and language mismatches are never market eligible", async () => {
  for (const change of [{ variant: "Reverse Holofoil" }, { condition: "Near Mint" }, { condition: "Lightly Played" }, { grade: 10, gradingCompany: "PSA" }, { language: "Japanese" }]) {
    const result = await fetchMarketSourceQuotes({ ...item, ...change }, { fetchImpl: async () => response(snapshot()) });
    assert.equal(result.quotes[0].marketEligible, false, JSON.stringify(change));
  }
});

test("all positive printing rows stay separate and mid reference is never a market estimate", async () => {
  const result = await fetchMarketSourceQuotes({ ...item, variant: "" }, { fetchImpl: async () => response(snapshot([
    { amount: 4, currency: "USD", variant: "Normal", kind: "market", priceBasis: "market", observedAt: OBSERVED },
    { amount: 8, currency: "USD", variant: "Holofoil", kind: "listing", priceBasis: "mid", observedAt: OBSERVED },
    ...[0, -1, null, "", "NaN", Infinity, 1e12].map(amount => ({ amount, currency: "USD", variant: "Normal", kind: "market" })),
    { amount: 9, currency: "EUR", variant: "Normal", kind: "market" },
  ])) });
  assert.equal(result.quotes.length, 2);
  assert.equal(result.quotes[1].kind, "listing");
  assert.equal(result.quotes[1].marketEligible, false);
  assert.match(result.quotes[1].matchNote, /asking price/);
});

test("TCGdex keeps TCGplayer USD and Cardmarket EUR pricing and upstream dates separate", async () => {
  const calls = [];
  const result = await fetchMarketSourceQuotes({ tcgdexCardId: "swsh3-136", language: "en" }, { now: NOW, fetchImpl: async url => {
    calls.push(url);
    return response(dexCard({ tcgplayer: { unit: "USD", updated: OBSERVED, normal: { marketPrice: 0.09 }, "reverse-holofoil": { marketPrice: 0.23 } }, cardmarket: { unit: "EUR", updated: "2026-10-17T00:00:00Z", trend: 0.08, "trend-holo": 0.21 } }));
  } });
  assert.deepEqual(calls, ["https://api.tcgdex.net/v2/en/cards/swsh3-136"]);
  assert.equal(result.quotes.length, 4);
  assert.deepEqual(result.quotes.map(quote => quote.currency), ["USD", "USD", "EUR", "EUR"]);
  assert.equal(result.quotes[0].observedAt, OBSERVED);
  assert.equal(result.quotes[2].observedAt, "2026-10-17T00:00:00.000Z");
  assert.equal(result.quotes[2].kind, "trend");
  assert.equal(new Set(result.sources.map(source => source.id)).size, result.sources.length);
});

test("TCGdex validates response identity, currency, dates and known variant fields", async () => {
  const invalidId = await fetchMarketSourceQuotes({ tcgdexId: "swsh3-136" }, { fetchImpl: async () => response({ id: "wrong-1", pricing: {} }) });
  assert.equal(invalidId.quotes.length, 0);
  assert.equal(invalidId.sources.at(-1).status, "unavailable");
  const result = await fetchMarketSourceQuotes({ tcgdexId: "swsh3-136" }, { fetchImpl: async () => response(dexCard({ tcgplayer: { unit: "USD", normal: { marketPrice: 1 }, unknown: { marketPrice: 800 } }, cardmarket: { unit: "USD", trend: 15 } })) });
  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].observedAt, "");
  assert.equal(result.quotes[0].marketEligible, false);
});

test("missing match, missing quote and failed requests are distinct and do not synthesize prices", async () => {
  const noFetch = async () => { throw new Error("Must not fetch"); };
  const missing = await fetchMarketSourceQuotes({ sku: "451396", marketPrice: 99 }, { fetchImpl: noFetch });
  assert.equal(missing.quotes.length, 0);
  assert.ok(missing.sources.every(source => source.status === "match_required"));
  const empty = await fetchMarketSourceQuotes(item, { fetchImpl: async () => response(snapshot([])) });
  assert.equal(empty.sources[0].status, "no_quote");
  for (const failing of [async () => new Response("", { status: 429 }), async () => { throw new Error("Network"); }, async () => new Response("broken json"), async () => response({ productId: "9", quotes: [] }), async () => response(snapshot(new Array(21).fill({})))]) {
    const result = await fetchMarketSourceQuotes(item, { fetchImpl: failing });
    assert.equal(result.quotes.length, 0);
    assert.equal(result.sources[0].status, "unavailable");
  }
});

test("cache coalesces concurrent requests and preserves actual observation dates", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; await new Promise(resolve => setTimeout(resolve, 5)); return response(snapshot()); };
  const [first, second] = await Promise.all([fetchMarketSourceQuotes(item, { fetchImpl, now: NOW }), fetchMarketSourceQuotes(item, { fetchImpl, now: "2026-10-19T18:00:00Z" })]);
  assert.equal(calls, 1);
  assert.equal(first.quotes[0].observedAt, second.quotes[0].observedAt);
  assert.notEqual(first.checkedAt, second.checkedAt);
  await fetchMarketSourceQuotes(item, { fetchImpl });
  assert.equal(calls, 1);
});

test("external abort cancels a single request and does not cancel another subscriber", async () => {
  const controller = new AbortController();
  let requestSignal;
  let complete;
  const fetchImpl = async (_url, options) => {
    requestSignal = options.signal;
    return new Promise((resolve, reject) => {
      complete = () => resolve(response(snapshot()));
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  };
  const a = fetchMarketSourceQuotes(item, { fetchImpl, signal: controller.signal });
  const b = fetchMarketSourceQuotes(item, { fetchImpl });
  await Promise.resolve();
  controller.abort();
  assert.equal((await a).sources[0].status, "aborted");
  assert.equal(requestSignal.aborted, false);
  complete();
  assert.equal((await b).quotes.length, 1);
  const stopped = new AbortController();
  stopped.abort();
  const aborted = await fetchMarketSourceQuotes(item, { fetchImpl: async () => { throw new Error("No call after abort"); }, signal: stopped.signal });
  assert.equal(aborted.sources[0].status, "aborted");
});

test("oversized responses are rejected before parsing", async () => {
  const result = await fetchMarketSourceQuotes(item, { fetchImpl: async () => new Response("{}", { headers: { "content-length": "2000000" } }) });
  assert.equal(result.sources[0].status, "unavailable");
  const streamed = await fetchMarketSourceQuotes(item, { fetchImpl: async () => new Response("x".repeat(1_000_001)) });
  assert.equal(streamed.sources[0].status, "unavailable");
});

test("all subscribers cancelling aborts the underlying provider request", async () => {
  const controller = new AbortController();
  let underlying;
  const pending = fetchMarketSourceQuotes(item, { signal: controller.signal, fetchImpl: async (_url, { signal }) => {
    underlying = signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  } });
  await Promise.resolve();
  controller.abort();
  assert.equal((await pending).sources[0].status, "aborted");
  assert.equal(underlying.aborted, true);
});

test("requests time out even if a fetch implementation ignores abort", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let underlying;
  const pending = fetchMarketSourceQuotes(item, { fetchImpl: async (_url, { signal }) => { underlying = signal; return new Promise(() => {}); } });
  await Promise.resolve();
  context.mock.timers.tick(12_001);
  const result = await pending;
  assert.equal(result.sources[0].status, "unavailable");
  assert.equal(underlying.aborted, true);
  context.mock.timers.reset();
});
