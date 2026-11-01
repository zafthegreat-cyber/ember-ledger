// Simulated beta, round 2: feature coverage and user wants.
//   node --no-warnings scripts/simulate-beta-features.mjs [--users=100000] [--workers=2]
// Part A runs every pure domain module behind the product areas for each of the
// synthetic users and reports per-feature health. Part B models what each
// persona would ask for, using the real gates, the Feature Status Matrix and
// Part A's results. Offline only.
import { Worker } from "node:worker_threads";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import os from "node:os";
import { build } from "esbuild";
import { PERSONAS } from "./lib/beta-simulation-worker.mjs";
import { canUseFeature, FEATURE_LABELS, getLockedFeatureDetails, PLAN_IDS } from "../src/services/featureGates.js";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, value] = arg.replace(/^--/, "").split("="); return [key, value ?? "true"]; }));
const USERS = Number(args.users || 100000);
const WORKERS = Math.max(1, Number(args.workers || Math.min(2, os.cpus().length)));
const OUT_DIR = resolve("artifacts/qa/beta-simulation-features");
await mkdir(OUT_DIR, { recursive: true });

// ---------- Part A: bundle modules and run workers ----------
const modulePath = resolve(OUT_DIR, "feature-modules.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `
export { summarizeCollectionPortfolio } from './src/utils/collectionValueCoverage.mjs';
export { buildPortfolioCsv } from './src/utils/collectionPortfolio.mjs';
export { deriveSetCompletionSummary } from './src/utils/vaultSetMastery.js';
export { buildCollectionSetRows, filterCollectionSetRows } from './src/utils/collectionSets.mjs';
export { buildWishlistToOwnedRecord } from './src/utils/vaultWorkflowUtils.js';
export { summarizeInventoryValuation } from './src/utils/inventoryValuationUtils.js';
export { buildPriceReliabilitySummary } from './src/utils/pricingReliabilityUtils.js';
export { searchCatalog } from './src/utils/catalogSearchUtils.js';
export { matchUpcToProduct, getBestCatalogMatches } from './src/utils/scanMatchUtils.js';
export { validateTradeDraft, buildTradeComparison } from './src/utils/tradeValueUtils.js';
export { findQuickAddCatalogMatch } from './src/utils/quickAddRouting.js';
export { estimateMarketConfidence } from './src/utils/marketDataUtils.js';
export { prepareRestockFeedEntries, filterRestockFeed } from './src/utils/restockFeedPresentation.mjs';
export { canSubmitScoutGuess } from './src/utils/dropRadarUtils.mjs';
export { buildRegionalStoreBuckets } from './src/utils/regionalBrowsingUtils.js';
export { storeMatchesSearch } from './src/utils/storeSearchUtils.js';
export { buildConfirmedRestockNotification, normalizeNotificationPreferences, notificationEnabled } from './src/utils/notificationCenterUtils.js';
export { summarizeSalesRecords, buildYearEndTaxSummary, groupMileageByVehicle, buildSalesExportRows, validateManualSaleDraft } from './src/utils/businessTaxRecords.js';
export { parseBulkImportText, validateManualFallbackDraft } from './src/utils/inventoryImportUtils.js';
export { describeExport } from './src/utils/exportDisclosure.mjs';
export { validateTidepoolPostDraft, validateTidepoolCommentDraft } from './src/utils/communitySafety.js';
export { validateSparkApplication } from './src/utils/kidsProgramSafety.js';
export { getEmberAssistStarterPrompts } from './src/utils/businessAssistantLite.js';
export { buildOnboardingChecklist, getEmptyStateGuidance } from './src/utils/onboardingGuidance.js';
export { makeSuggestion, findSimilarSuggestion } from './src/utils/suggestionReviewUtils.js';
` }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".json": "json" }, define: { "import.meta.env.DEV": "false", "import.meta.env.MODE": '"test"', "import.meta.env.VITE_SUPABASE_URL": '""', "import.meta.env.VITE_SUPABASE_ANON_KEY": '""' }, outfile: modulePath, logLevel: "silent" });

function mergeMetrics(target, source) {
  target.users = (target.users || 0) + source.users;
  target.byPersona = target.byPersona || {}; for (const [k, v] of Object.entries(source.byPersona)) target.byPersona[k] = (target.byPersona[k] || 0) + v;
  target.features = target.features || {};
  for (const [key, entry] of Object.entries(source.features)) {
    const t = target.features[key] || { runs: 0, throws: 0, invariantFailures: 0, totalMs: 0, maxMs: 0, p95: 0 };
    t.runs += entry.runs; t.throws += entry.throws; t.invariantFailures += entry.invariantFailures; t.totalMs += entry.totalMs; t.maxMs = Math.max(t.maxMs, entry.maxMs); t.p95 = Math.max(t.p95, entry.p95); t.avgMs = t.runs ? t.totalMs / t.runs : 0;
    target.features[key] = t;
  }
  target.issues = [...(target.issues || []), ...source.issues].slice(0, 120);
  target.issueCounts = target.issueCounts || {}; for (const [k, v] of Object.entries(source.issueCounts)) target.issueCounts[k] = (target.issueCounts[k] || 0) + v;
  target.observations = target.observations || {};
  for (const [k, v] of Object.entries(source.observations)) { if (k === "priceMissingMarketPctAvg") { target.observations[k] = ((target.observations[k] || 0) + v) / (target.observations[k] ? 2 : 1); continue; } target.observations[k] = (target.observations[k] || 0) + v; }
  return target;
}

async function runWorkers() {
  const perWorker = Math.ceil(USERS / WORKERS); const progress = new Array(WORKERS).fill(0);
  const results = await Promise.all(Array.from({ length: WORKERS }, (_, i) => new Promise((resolvePromise, reject) => {
    const worker = new Worker(new URL("./lib/beta-features-worker.mjs", import.meta.url), { workerData: { start: i * perWorker, end: Math.min(USERS, (i + 1) * perWorker), modulePath } });
    worker.on("message", (m) => { if (m.type === "progress") { progress[i] = m.done; process.stdout.write(`\r  users: ${progress.reduce((a, b) => a + b, 0).toLocaleString()} / ${USERS.toLocaleString()}   `); } if (m.type === "done") resolvePromise(m.metrics); });
    worker.on("error", reject); worker.on("exit", (code) => { if (code !== 0) reject(new Error(`worker ${i} exited ${code}`)); });
  })));
  process.stdout.write(`\r  users: ${USERS.toLocaleString()} / ${USERS.toLocaleString()}   \n`);
  const merged = {}; for (const r of results) mergeMetrics(merged, r); return merged;
}

// ---------- Part B: what users would want ----------
// Each persona's goals name the gate key (if any), the matrix rows that back
// the goal, and how central it is (weight 1–3). A goal is "working" when the
// gate passes for the persona's tier, the Part A feature ran without throws, and
// the best-status matching matrix row is IMPLEMENTED or IMPLEMENTED_DIFFERENTLY. Otherwise the goal
// turns into a request with a probability that the user would raise it.
const MATRIX_PATH = resolve("docs/FEATURE_STATUS_MATRIX.md");
async function loadMatrix() {
  try {
    const text = await readFile(MATRIX_PATH, "utf8"); const rows = []; let section = "";
    for (const line of text.split("\n")) {
      if (line.startsWith("## ")) section = line.slice(3).trim();
      else if (line.startsWith("| ") && !line.startsWith("| Page") && !line.startsWith("| ---")) { const c = line.trim().replace(/^\||\|$/g, "").split("|").map((x) => x.trim()); if (c.length >= 3) rows.push({ section, feature: c[0], route: c[1], status: c[2], gap: c[c.length - 1] }); }
    }
    return rows;
  } catch { return []; }
}
const matrix = await loadMatrix();
const statusCounts = {}; for (const row of matrix) statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
const matrixStatus = (pattern) => { const rows = matrix.filter((row) => pattern.test(row.feature)); if (!rows.length) return { status: "UNLISTED", rows: [] }; const order = ["MISSING", "FUTURE", "BACKEND_REQUIRED", "BLOCKED_BY_AUTHORIZATION", "FRONTEND_ONLY", "CLIENT_LOCAL_ONLY", "PARTIALLY_IMPLEMENTED", "IMPLEMENTED_DIFFERENTLY", "IMPLEMENTED"]; return { status: rows.map((r) => r.status).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0], rows: rows.map((r) => `${r.feature} (${r.status})`).slice(0, 4) }; };

const GOALS = {
  "family-parent": [
    ["Track the family's cards and sealed products", "vault_basic", "vault.portfolio", /^(My Collection|Collection search\/filter\/summary)$/, 3],
    ["See what the collection is worth", "portfolio_value", "vault.portfolio", /^(My Collection|Collection search\/filter\/summary)$/, 2],
    ["Set progress for the kids' favourite sets", "set_completion", "vault.setCompletion", /^(Sets|Set Detail)$/, 2],
    ["Separate kid profiles with parent controls", "kid_profiles", null, /^Kids' Packs$/, 3],
    ["Kid-safe Vault view", "kid_safe_vault", null, /^Kids' Packs$/, 2],
    ["Apply to The Spark for the kids", null, "spark.application", /^(Donations|Giveaways|Community Events \/ Impact)$/, 2],
    ["Get told when the local Target restocks", "scout_reports_basic", "scout.notifications", /^(Notifications|Provider-backed notifications)$/, 3],
    ["Back up everything in one file", null, null, /^(Complete backup and restore|JSON backup\/import)$/, 1],
  ],
  "kid-with-parent": [
    ["Keep my own binder list", "vault_basic", "vault.portfolio", /^(My Collection|Collection search\/filter\/summary)$/, 3],
    ["Wishlist I can show my parent", "kid_wishlists", null, /^Wishlist$/, 3],
    ["See how close I am to finishing a set", "set_completion", "vault.setCompletion", /^(Sets|Set Detail)$/, 2],
    ["Trade fairly with a friend (with parent approval)", null, "market.tradeAnalyzer", /^Decision summary$/, 2],
    ["Read Tidepool and see events", null, null, /^Community Events \/ Impact$/, 1],
  ],
  "casual-collector": [
    ["Track collection and value", "portfolio_value", "vault.portfolio", /^(My Collection|Collection search\/filter\/summary)$/, 3],
    ["Set completion and missing cards", "set_completion", "vault.setCompletion", /^(Sets|Set Detail)$/, 3],
    ["Search cards and sealed by name or number", "catalog_basic_search", "market.search", /^Universal Search$/, 3],
    ["Scan a barcode to add a product", "scanner_search_limited", "market.upcScan", /^Scan\/share listing entry$/, 2],
    ["Price history on my cards", "price_history", null, /^(Live Restocks|Comparable Records)$/, 2],
    ["Wishlist alerts when a price drops", "wishlist_alerts", null, /^(Notifications|Provider-backed notifications)$/, 2],
    ["Export my collection to a spreadsheet", "collection_export", "vault.csvExport", /^Complete bookkeeping export$/, 2],
    ["Follow a few Scout stores", "scout_current_details", "scout.feed", /^(Live Restocks|Store Detail)$/, 2],
    ["Save Market searches", "saved_market_searches", null, /^Saved Opportunities$/, 1],
  ],
  "active-seller": [
    ["Inventory with cost basis", "forge_inventory", "vault.inventoryValuation", /^(Resale Inventory|Inventory Item Detail)$/, 3],
    ["Record sales and see profit", "sales_tracking", "forge.salesSummary", /^(Sales landing\/list|Record Sale \/ Sale Detail)$/, 3],
    ["Expenses and mileage for taxes", "mileage", "forge.mileage", /^(Expenses|Mileage)$/, 3],
    ["Year-end export for my accountant", "business_reports", "forge.yearEnd", /^(Reports|Complete bookkeeping export)$/, 3],
    ["Bulk import a purchase list", "forge_inventory", "forge.bulkImport", /^(CSV import preview\/mapping|Unified import queue)$/, 2],
    ["List on eBay from the app", "marketplace_exports", null, /^(Active Listings|Listing Drafts)$/, 3],
    ["Find deals and auctions worth buying", "deal_finder", null, /^(Deals \/ Deal Feed|Auction Feed)$/, 2],
    ["Cross-list across platforms", "cross_listing_status", null, /^(Sales channel profiles|Active Listings)$/, 2],
    ["Receipt scan into expenses", "receipt_scan_review", null, /^(Receipts|Receipt AI assistance)$/, 2],
  ],
  "power-seller": [
    ["Thousands of items without the app slowing down", "forge_inventory", "vault.inventoryValuation", /^(Resale Inventory|Inventory Item Detail)$/, 3],
    ["Sales, fees and profit by channel", "sales_tracking", "forge.salesSummary", /^(Sales landing\/list|Record Sale \/ Sale Detail)$/, 3],
    ["Reliable backup and cloud sync of a large workspace", null, null, /^(Complete backup and restore|Cross-device sync\/conflicts)$/, 3],
    ["Shop profile in the directory", "shop_profile_tools", null, /^Shop profile$/, 2],
    ["Order emails pulled into purchases automatically", null, null, /^(Email alert import|Mailbox provider trusted runtime)$/, 2],
    ["Staff seats / partner access", "shop_profile_tools", null, /^Future role policy$/, 2],
    ["Bot and restock tooling that actually runs", null, null, /^(Tasks|Task Groups)$/, 1],
  ],
  scout: [
    ["Report what I saw on the shelf in seconds", "scout_reports_basic", "scout.feed", /^Report Restock$/, 3],
    ["See current details for the stores I follow", "scout_current_details", "scout.feedFilter", /^(Live Restocks|Store Detail)$/, 3],
    ["Alerts when a followed store restocks", "wishlist_alerts", "scout.notifications", /^(Notifications|Provider-backed notifications)$/, 3],
    ["Earn Scout points / reputation for good reports", null, "scout.guessEligibility", /^Prediction outcome review$/, 2],
    ["A real month calendar of drops and releases", null, null, /^(Tasks and Calendar|Auction Calendar)$/, 2],
    ["Post sightings and tips in Tidepool", null, "tidepool.post", /^Community Events \/ Impact$/, 2],
  ],
  "new-lurker": [
    ["Understand what the app is for in one screen", null, "onboarding.checklist", /^Home landing$/, 3],
    ["Add one card and see something useful", "vault_basic", "vault.portfolio", /^(My Collection|Collection search\/filter\/summary)$/, 3],
    ["See collection value without paying", "portfolio_value", "vault.portfolio", /^Collection search\/filter\/summary$/, 2],
    ["Browse local restock reports", "scout_reports_basic", "scout.feed", /^(Live Restocks|Store Detail)$/, 2],
    ["Install as an app on my phone", null, null, /^PWA install\/offline shell$/, 1],
  ],
};

const WORKING_STATUSES = new Set(["IMPLEMENTED", "IMPLEMENTED_DIFFERENTLY"]);
function modelWants(users) {
  const total = Object.values(users.byPersona).reduce((a, b) => a + b, 0);
  const personas = [];
  const requests = new Map();
  for (const persona of PERSONAS) {
    const population = users.byPersona[persona.key] || 0;
    const profile = { tier: persona.tier, appAccess: true };
    const goals = (GOALS[persona.key] || []).map(([goal, gate, feature, pattern, weight]) => {
      const gateOk = gate ? canUseFeature(profile, gate) : true;
      const featureHealth = feature ? users.features[feature] : null;
      // A goal counts as broken when more than 0.1% of its runs threw or failed an invariant.
      const featureOk = !featureHealth || (featureHealth.throws + featureHealth.invariantFailures) <= Math.max(1, featureHealth.runs) * 0.001;
      const { status, rows } = matrixStatus(pattern);
      const matrixOk = status === "UNLISTED" || WORKING_STATUSES.has(status);
      // Outcomes: working (1.0) · local-only = works on this device, no cloud (0.75)
      // · partial (0.5) · not-built = FRONTEND_ONLY/MISSING/FUTURE/BLOCKED/BACKEND_REQUIRED (0)
      // · locked by tier (0) · broken in simulation (0).
      let outcome = "working"; let reason = ""; let credit = 1;
      if (!gateOk) { outcome = "locked"; credit = 0; const locked = getLockedFeatureDetails(gate); reason = `Locked for ${persona.tier}: needs ${locked.tierLabel}.`; }
      else if (!featureOk) { outcome = "broken"; credit = 0; reason = `${feature} threw or failed an invariant in the simulation.`; }
      else if (!matrixOk) {
        if (status === "CLIENT_LOCAL_ONLY") { outcome = "local-only"; credit = 0.75; }
        else if (status === "PARTIALLY_IMPLEMENTED") { outcome = "partial"; credit = 0.5; }
        else { outcome = "not-built"; credit = 0; }
        reason = `Feature Status Matrix: ${rows.join("; ")}.`;
      }
      const probability = outcome === "working" ? 0 : outcome === "broken" ? 0.9 : outcome === "locked" ? (weight >= 3 ? 0.6 : 0.35) : outcome === "local-only" ? (weight >= 3 ? 0.2 : 0.1) : outcome === "partial" ? (weight >= 3 ? 0.4 : 0.25) : (weight >= 3 ? 0.6 : 0.4);
      if (probability) {
        const key = `${outcome}:${goal}`;
        const entry = requests.get(key) || { outcome, goal, gate, feature, reason, personas: {}, estimatedUsers: 0 };
        entry.personas[persona.key] = Math.round(population * probability); entry.estimatedUsers += Math.round(population * probability);
        requests.set(key, entry);
      }
      return { goal, gate, feature, weight, outcome, credit, reason, matrixStatus: status };
    });
    const weightTotal = goals.reduce((s, g) => s + g.weight, 0);
    const working = goals.reduce((s, g) => s + g.weight * g.credit, 0);
    personas.push({ persona: persona.key, tier: persona.tier, population, share: population / total, satisfaction: weightTotal ? Math.round((working / weightTotal) * 100) : 0, goals });
  }
  return { personas, requests: [...requests.values()].sort((a, b) => b.estimatedUsers - a.estimatedUsers) };
}

const t0 = performance.now();
console.log(`Feature coverage simulation: ${USERS.toLocaleString()} users on ${WORKERS} worker(s).`);
const users = args.recompute ? (JSON.parse(await readFile(resolve(OUT_DIR, "results.json"), "utf8"))).users : await runWorkers();
const wants = modelWants(users);
const previous = args.recompute ? JSON.parse(await readFile(resolve(OUT_DIR, "results.json"), "utf8")) : null;
const results = { startedAt: previous?.startedAt || new Date(Date.now() - (performance.now() - t0)).toISOString(), elapsedMs: previous?.elapsedMs ?? performance.now() - t0, config: { users: USERS, workers: WORKERS, node: process.version }, matrixStatusCounts: statusCounts, matrixRows: matrix.length, users, wants };
await writeFile(resolve(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
console.log(`Done in ${(results.elapsedMs / 1000).toFixed(1)}s → ${resolve(OUT_DIR, "results.json")}`);
console.log("\nFeature health (runs / throws / invariant failures / avg ms / p95 ms / max ms):");
for (const [key, f] of Object.entries(users.features)) console.log(`  ${key.padEnd(26)} ${String(f.runs).padStart(8)} ${String(f.throws).padStart(6)} ${String(f.invariantFailures).padStart(6)} ${f.avgMs.toFixed(2).padStart(8)} ${f.p95.toFixed(1).padStart(8)} ${f.maxMs.toFixed(0).padStart(7)}`);
console.log("\nObservations:", JSON.stringify(users.observations));
console.log("Issues:", JSON.stringify(users.issueCounts));
console.log("\nPersona satisfaction:", wants.personas.map((p) => `${p.persona} ${p.satisfaction}%`).join(" · "));
console.log("Top requests:"); for (const r of wants.requests.slice(0, 15)) console.log(`  ~${r.estimatedUsers.toLocaleString()} users · [${r.outcome}] ${r.goal} — ${r.reason.slice(0, 110)}`);
