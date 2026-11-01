// Feature-coverage worker for the simulated beta. For each synthetic user it runs
// every pure domain module behind the product areas (Vault, Market, Scout,
// Forge, Tidepool, The Spark, Ember Assist, onboarding, suggestions) and records
// runs, throws, invariant failures and timings per feature. No network, no
// writes outside artifacts/. Modules arrive pre-bundled (workerData.modulePath)
// because several app utilities use bundler-style extensionless imports.
import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { generateUser, PERSONAS } from "./beta-simulation-worker.mjs";

const M = await import(pathToFileURL(workerData.modulePath).href);

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Shared synthetic catalog (5,000 products with barcodes) per worker.
const catalogRng = mulberry32(99);
const SETS = ["Scarlet & Violet", "Paldea Evolved", "Obsidian Flames", "151", "Paradox Rift", "Temporal Forces", "Surging Sparks", "Prismatic Evolutions"];
const NAMES = ["Charizard", "Pikachu", "Umbreon", "Gengar", "Mew", "Eevee", "Lugia", "Rayquaza", "Gardevoir", "Snorlax"];
const CATALOG = Array.from({ length: 2500 }, (_, i) => ({
  id: `cat-${i}`, catalogType: i % 4 === 0 ? "sealed" : "card", name: i % 4 === 0 ? `${pick(catalogRng, SETS)} Booster Bundle` : `${pick(catalogRng, NAMES)} ${(i % 250) + 1}/${200 + (i % 50)}`,
  setName: pick(catalogRng, SETS), productType: i % 4 === 0 ? "Sealed" : "Single", cardNumber: String((i % 250) + 1), barcode: `0${String(820650000000 + i)}`, upc: `0${String(820650000000 + i)}`, sku: `SKU${100000 + i}`, marketPrice: Math.round(catalogRng() * 20000) / 100, msrp: i % 4 === 0 ? 29.99 : "",
}));

const FEATURES = ["vault.portfolio", "vault.setCompletion", "vault.collectionSets", "vault.csvExport", "vault.wishlistToOwned", "vault.inventoryValuation", "vault.priceReliability",
  "market.search", "market.upcScan", "market.bestMatch", "market.tradeAnalyzer", "market.quickAdd", "market.confidence",
  "scout.feed", "scout.feedFilter", "scout.guessEligibility", "scout.regionalBuckets", "scout.storeSearch", "scout.notifications",
  "forge.salesSummary", "forge.yearEnd", "forge.mileage", "forge.exportRows", "forge.bulkImport", "forge.manualFallback", "forge.saleDraft",
  "tidepool.post", "tidepool.comment", "spark.application", "assist.prompts", "onboarding.checklist", "onboarding.emptyStates", "suggestions.submit", "exports.disclosure"];

function newMetrics() {
  const features = Object.fromEntries(FEATURES.map((key) => [key, { runs: 0, throws: 0, invariantFailures: 0, totalMs: 0, maxMs: 0, p95Samples: [] }]));
  return { users: 0, byPersona: {}, features, issues: [], issueCounts: {}, observations: {
    upcHits: 0, upcMisses: 0, upcFalseMatches: 0, searchEmpty: 0, searchRuns: 0, tradeUnknownBalance: 0, tradeRuns: 0, guessAllowed: 0, guessBlocked: 0, notificationsBuilt: 0, notificationsSuppressedByPrefs: 0,
    commentsUnsafeBlocked: 0, commentsUnsafePassed: 0, bulkRowsParsed: 0, bulkRowsNeedingName: 0, fallbackInvalid: 0, fallbackValid: 0, suggestionsDuplicate: 0, suggestions: 0, emptyStatesMissing: 0,
    priceMissingMarketPct: [], valuationMismatch: 0, setRowsWithProgress: 0, setRowsTotal: 0, assistPromptsEmpty: 0,
  } };
}
function issue(metrics, code, detail) { metrics.issueCounts[code] = (metrics.issueCounts[code] || 0) + 1; if (metrics.issues.length < 60) metrics.issues.push({ code, ...detail }); }
function run(metrics, feature, fn, user) {
  const entry = metrics.features[feature];
  entry.runs += 1;
  const start = performance.now();
  try { return fn(); }
  catch (error) { entry.throws += 1; issue(metrics, `THROW:${feature}`, { user: user.index, persona: user.persona.key, message: String(error?.message).slice(0, 160), at: String(error?.stack || "").split("\n")[1]?.trim().slice(0, 120) }); return undefined; }
  finally { const ms = performance.now() - start; entry.totalMs += ms; if (ms > entry.maxMs) entry.maxMs = ms; if (entry.p95Samples.length < 4000 && Math.random() < 0.2) entry.p95Samples.push(ms); }
}
function invariant(metrics, feature, ok, user, detail) { if (!ok) { metrics.features[feature].invariantFailures += 1; issue(metrics, `INVARIANT:${feature}`, { user: user.index, persona: user.persona.key, ...detail }); } }

function simulate(user, metrics) {
  const { items, wishlist, sales, expenses, mileageTrips, vehicles, reports, posts, profile, persona, rng } = user;
  const o = metrics.observations;
  metrics.users += 1; metrics.byPersona[persona.key] = (metrics.byPersona[persona.key] || 0) + 1;

  // ---- Vault ----
  const cards = items.filter((item) => item.productClassification === "single");
  const sealed = items.filter((item) => item.productClassification === "sealed");
  const summary = run(metrics, "vault.portfolio", () => M.summarizeCollectionPortfolio({ owned: items, cards, sealed, wishlist }), user);
  if (summary) invariant(metrics, "vault.portfolio", summary.ownedQuantity === items.reduce((s, i) => s + i.quantity, 0) && summary.pricedQuantity <= summary.ownedQuantity && Number.isFinite(summary.totalKnownValue), user, { owned: summary.ownedQuantity });
  if (items.length && items.length <= 1500) {
    const completion = run(metrics, "vault.setCompletion", () => M.deriveSetCompletionSummary({ items, wishlistItems: wishlist }), user);
    if (completion) invariant(metrics, "vault.setCompletion", completion && typeof completion === "object", user, {});
    const rows = run(metrics, "vault.collectionSets", () => M.buildCollectionSetRows({ items, knownSets: [], catalogProducts: CATALOG.slice(0, 500) }), user);
    if (Array.isArray(rows)) { o.setRowsTotal += rows.length; o.setRowsWithProgress += rows.filter((row) => (row.ownedItems?.length ?? row.ownedCardQuantity ?? 0) > 0).length; const filtered = run(metrics, "vault.collectionSets", () => M.filterCollectionSetRows(rows, { query: "151", scope: "all" }), user); invariant(metrics, "vault.collectionSets", Array.isArray(filtered) && filtered.length <= rows.length, user, {}); }
  }
  if (items.length && items.length <= 3000) {
    const csv = run(metrics, "vault.csvExport", () => M.buildPortfolioCsv(items, { includeValues: true }), user);
    if (csv) invariant(metrics, "vault.csvExport", csv.split("\r\n").length === items.length + 1, user, { rows: csv.split("\r\n").length });
  }
  if (wishlist.length) {
    const owned = run(metrics, "vault.wishlistToOwned", () => M.buildWishlistToOwnedRecord(wishlist[0], {}), user);
    if (owned) invariant(metrics, "vault.wishlistToOwned", Boolean(owned.name) && Number(owned.quantity ?? 1) >= 1, user, { owned: Object.keys(owned).slice(0, 8) });
  }
  if (items.length) {
    const valuation = run(metrics, "vault.inventoryValuation", () => M.summarizeInventoryValuation(items.slice(0, 2000), { context: "forge" }), user);
    if (valuation) {
      const quantity = items.slice(0, 2000).reduce((s, i) => s + i.quantity, 0);
      const reported = Number(valuation.totalQuantity ?? valuation.quantity ?? valuation.itemCount ?? NaN);
      if (Number.isFinite(reported) && reported !== quantity) o.valuationMismatch += 1;
    }
    const reliability = run(metrics, "vault.priceReliability", () => M.buildPriceReliabilitySummary(items.slice(0, 2000), { context: "forge", now: new Date("2026-10-30T12:00:00Z") }), user);
    if (reliability) { invariant(metrics, "vault.priceReliability", reliability.totalRecords >= 0 && reliability.knownMarketValuePercent >= 0 && reliability.knownMarketValuePercent <= 100, user, { pct: reliability.knownMarketValuePercent }); o.priceMissingMarketPct.push(100 - reliability.knownMarketValuePercent); }
  }

  // ---- Market ----
  for (let i = 0; i < 1; i += 1) {
    const query = `${pick(rng, NAMES)}${rng() < 0.5 ? ` ${Math.floor(rng() * 250) + 1}` : ""}`;
    const results = run(metrics, "market.search", () => M.searchCatalog(query, CATALOG, 24), user);
    o.searchRuns += 1; if (Array.isArray(results) && !results.length) o.searchEmpty += 1;
    if (Array.isArray(results)) invariant(metrics, "market.search", results.length <= 24, user, { len: results.length });
  }
  const hit = rng() < 0.7;
  const upc = hit ? CATALOG[Math.floor(rng() * CATALOG.length)].barcode : `0${String(999000000000 + Math.floor(rng() * 1e6))}`;
  const upcMatches = run(metrics, "market.upcScan", () => M.matchUpcToProduct(upc, CATALOG), user);
  if (Array.isArray(upcMatches)) { if (hit) { if (upcMatches.length) o.upcHits += 1; else o.upcMisses += 1; } else if (upcMatches.length) { o.upcFalseMatches += 1; invariant(metrics, "market.upcScan", false, user, { upc }); } }
  if (rng() < 0.12) run(metrics, "market.bestMatch", () => M.getBestCatalogMatches(`${pick(rng, NAMES)} ${pick(rng, SETS)}`, CATALOG), user);
  if (items.length && rng() < 0.4) {
    const source = items[Math.floor(rng() * items.length)];
    const draft = { sourceItemId: source.id, outgoingQuantity: 1, receivedName: `${pick(rng, NAMES)} ${Math.floor(rng() * 200)}`, receivedQuantity: 1, receivedValue: rng() < 0.7 ? String(Math.round(rng() * 10000) / 100) : "" };
    const validity = run(metrics, "market.tradeAnalyzer", () => M.validateTradeDraft(draft, source), user);
    const comparison = run(metrics, "market.tradeAnalyzer", () => M.buildTradeComparison(draft, source), user);
    o.tradeRuns += 1;
    if (validity && comparison) { invariant(metrics, "market.tradeAnalyzer", validity.ok === true && ["favorable", "caution", "needs-review", "fair"].includes(comparison.tone), user, { tone: comparison.tone }); if (comparison.tone === "needs-review") o.tradeUnknownBalance += 1; }
  }
  run(metrics, "market.quickAdd", () => M.findQuickAddCatalogMatch(CATALOG.slice(0, 1000), { title: `${pick(rng, SETS)} Booster Bundle release`, productName: `${pick(rng, SETS)} Booster Bundle` }), user);
  if (items.length) run(metrics, "market.confidence", () => M.estimateMarketConfidence(items[0], { marketPrice: items[0].marketPrice, source: "manual", updatedAt: "2026-10-01" }), user);

  // ---- Scout ----
  if (reports.length) {
    const entries = run(metrics, "scout.feed", () => M.prepareRestockFeedEntries(reports), user);
    if (entries) {
      invariant(metrics, "scout.feed", entries.length === reports.length && entries.every((e, i) => i === 0 || (entries[i - 1].observedAt ?? -Infinity) >= (e.observedAt ?? -Infinity)), user, {});
      const filtered = run(metrics, "scout.feedFilter", () => M.filterRestockFeed(entries, { stock: "in_stock", period: "7d" }, Date.parse("2026-10-30T12:00:00Z")), user);
      if (filtered) invariant(metrics, "scout.feedFilter", filtered.every((e) => e.stockGroup === "in_stock"), user, {});
    }
    const notification = run(metrics, "scout.notifications", () => M.buildConfirmedRestockNotification({ ...reports[0], verificationStatus: "confirmed" }, {}), user);
    if (notification) {
      o.notificationsBuilt += 1;
      const prefs = run(metrics, "scout.notifications", () => M.normalizeNotificationPreferences({}), user);
      const enabled = run(metrics, "scout.notifications", () => M.notificationEnabled(prefs, notification), user);
      if (enabled === false) o.notificationsSuppressedByPrefs += 1;
    }
  }
  const guess = run(metrics, "scout.guessEligibility", () => M.canSubmitScoutGuess({ ...profile, scoutPoints: Math.floor(rng() * 120) }, {}), user);
  if (guess !== undefined) { if (guess === true || guess?.allowed) o.guessAllowed += 1; else o.guessBlocked += 1; }
  const storeProfiles = reports.slice(0, 40).map((r) => ({ id: r.id, name: r.storeName, chain: r.retailer, city: r.city, state: r.region }));
  if (storeProfiles.length) {
    const buckets = run(metrics, "scout.regionalBuckets", () => M.buildRegionalStoreBuckets(storeProfiles, {}), user);
    if (buckets) invariant(metrics, "scout.regionalBuckets", Array.isArray(buckets) || typeof buckets === "object", user, {});
    const matches = run(metrics, "scout.storeSearch", () => storeProfiles.filter((store) => M.storeMatchesSearch(store, "target")), user);
    if (matches) invariant(metrics, "scout.storeSearch", matches.every((s) => /target/i.test(`${s.name} ${s.chain}`)), user, {});
  }

  // ---- Forge ----
  if (sales.length || expenses.length || mileageTrips.length) {
    const salesSummary = run(metrics, "forge.salesSummary", () => M.summarizeSalesRecords(sales), user);
    if (salesSummary) invariant(metrics, "forge.salesSummary", Object.values(salesSummary).every((v) => typeof v !== "number" || Number.isFinite(v)), user, {});
    const tax = run(metrics, "forge.yearEnd", () => M.buildYearEndTaxSummary({ year: 2026, expenses, mileageTrips, vehicles, inventoryItems: items, sales }), user);
    if (tax) invariant(metrics, "forge.yearEnd", Number.isFinite(tax.expenses?.total) && Number.isFinite(tax.sales?.revenue ?? 0), user, {});
    const groups = run(metrics, "forge.mileage", () => M.groupMileageByVehicle(mileageTrips, vehicles), user);
    if (groups) invariant(metrics, "forge.mileage", groups.reduce((s, g) => s + (g.tripCount || 0), 0) === mileageTrips.length, user, { trips: mileageTrips.length });
    const rows = run(metrics, "forge.exportRows", () => M.buildSalesExportRows(sales.slice(0, 300)), user);
    if (rows) { invariant(metrics, "forge.exportRows", rows.length === Math.min(300, sales.length), user, {}); const disclosure = run(metrics, "exports.disclosure", () => M.describeExport({ format: "csv", rows, recordCount: sales.length }), user); if (disclosure) invariant(metrics, "exports.disclosure", sales.length === 0 || disclosure.containsPrivateData, user, {}); }
    const draft = run(metrics, "forge.saleDraft", () => M.validateManualSaleDraft({ manualItemName: "Card", saleDate: "2026-05-01", platform: "eBay", quantitySold: 1, finalSalePrice: "25" }), user);
    if (draft) invariant(metrics, "forge.saleDraft", draft.valid === true, user, { errors: draft.errors });
  }
  if ((persona.key === "active-seller" || persona.key === "power-seller") && rng() < 0.5) {
    const lines = ["name,qty,cost,store,notes", ...Array.from({ length: 30 }, (_, i) => `${pick(rng, NAMES)} ${i + 1}/198,${1 + (i % 3)},${(rng() * 50).toFixed(2)},${pick(rng, ["Target", "Walmart", "Card Shop"])},lot ${i}`), "", "3x Booster Bundle $29.99", "Eevee 25/198"];
    const parsed = run(metrics, "forge.bulkImport", () => M.parseBulkImportText(lines.join("\n")), user);
    if (parsed) { o.bulkRowsParsed += parsed.length; o.bulkRowsNeedingName += parsed.filter((row) => !String(row.itemName || "").trim()).length; invariant(metrics, "forge.bulkImport", parsed.length === 32, user, { parsed: parsed.length }); }
    const fallbackOk = run(metrics, "forge.manualFallback", () => M.validateManualFallbackDraft({ itemName: "Mystery lot", quantity: 2, unitCost: "12.50", destination: "forge" }), user);
    const fallbackBad = run(metrics, "forge.manualFallback", () => M.validateManualFallbackDraft({ itemName: "", quantity: 0 }), user);
    const okResult = fallbackOk && (fallbackOk.valid === true || (Array.isArray(fallbackOk) ? fallbackOk.length === 0 : Object.keys(fallbackOk.errors || fallbackOk).length === 0));
    const badResult = fallbackBad && (fallbackBad.valid === false || (Array.isArray(fallbackBad) ? fallbackBad.length > 0 : Object.keys(fallbackBad.errors || fallbackBad).length > 0));
    if (okResult) o.fallbackValid += 1; else o.fallbackInvalid += 1;
    invariant(metrics, "forge.manualFallback", Boolean(okResult && badResult), user, { ok: fallbackOk, bad: fallbackBad });
  }

  // ---- Tidepool ----
  if (posts.length && persona.role !== "kid") {
    run(metrics, "tidepool.post", () => M.validateTidepoolPostDraft({ title: posts[0].title, body: posts[0].body }), user);
    const unsafe = run(metrics, "tidepool.comment", () => M.validateTidepoolCommentDraft("Text me at 757-555-0101 for the deal"), user);
    if (unsafe !== undefined) { if (unsafe) o.commentsUnsafeBlocked += 1; else o.commentsUnsafePassed += 1; }
    const safe = run(metrics, "tidepool.comment", () => M.validateTidepoolCommentDraft("Nice pull, congrats!"), user);
    if (safe !== undefined) invariant(metrics, "tidepool.comment", safe === "", user, { safe });
  }

  // ---- The Spark ----
  if (persona.key === "family-parent" && rng() < 0.3) {
    const result = run(metrics, "spark.application", () => M.validateSparkApplication({ parentName: "Parent", email: "parent@example.com", childAgeRange: "9_12", favoritePokemon: "Eevee", requestedAccess: ["packs"], agreesNoResale: true, consentContact: true }), user);
    if (result !== undefined) invariant(metrics, "spark.application", result === "", user, { result });
  }

  // ---- Ember Assist, onboarding, suggestions ----
  const prompts = run(metrics, "assist.prompts", () => M.getEmberAssistStarterPrompts({ activeTab: pick(rng, ["vault", "scout", "forge", "market", "hearth"]) }), user);
  if (Array.isArray(prompts) && !prompts.length) o.assistPromptsEmpty += 1;
  const checklist = run(metrics, "onboarding.checklist", () => M.buildOnboardingChecklist({ vaultItems: items.length, forgeItems: sales.length, scoutReports: reports.length }, {}), user);
  if (checklist) invariant(metrics, "onboarding.checklist", checklist.length === 12, user, {});
  for (const key of ["vault", "forge", "scout", "market", "hearth", "tidepool", "spark"]) {
    const guidance = run(metrics, "onboarding.emptyStates", () => M.getEmptyStateGuidance(key), user);
    if (guidance && !(guidance.title || guidance.heading || guidance.message || guidance.description)) o.emptyStatesMissing += 1;
  }
  if (rng() < 0.05) {
    const suggestion = run(metrics, "suggestions.submit", () => M.makeSuggestion({ title: pick(rng, ["Add a month calendar", "Let me follow more stores", "Dark mode for kids", "Export to Google Sheets", "Price alerts"]), details: "From the simulated beta", category: "feature" }), user);
    if (suggestion) { o.suggestions += 1; const similar = run(metrics, "suggestions.submit", () => M.findSimilarSuggestion([suggestion, { ...suggestion, id: "other" }], suggestion), user); if (similar) o.suggestionsDuplicate += 1; }
  }
}

function serialize(metrics) {
  for (const entry of Object.values(metrics.features)) { const s = entry.p95Samples.sort((a, b) => a - b); entry.p95 = s.length ? s[Math.floor(0.95 * s.length)] : 0; entry.avgMs = entry.runs ? entry.totalMs / entry.runs : 0; delete entry.p95Samples; }
  const pct = metrics.observations.priceMissingMarketPct; metrics.observations.priceMissingMarketPctAvg = pct.length ? pct.reduce((a, b) => a + b, 0) / pct.length : 0; delete metrics.observations.priceMissingMarketPct;
  return metrics;
}

if (parentPort) {
  const metrics = newMetrics();
  let last = performance.now();
  for (let index = workerData.start; index < workerData.end; index += 1) {
    simulate(generateUser(index), metrics);
    if (performance.now() - last > 5000) { parentPort.postMessage({ type: "progress", done: index - workerData.start + 1 }); last = performance.now(); }
  }
  parentPort.postMessage({ type: "done", metrics: serialize(metrics) });
}
export { FEATURES, PERSONAS };
