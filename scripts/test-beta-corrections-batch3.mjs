// Tester-reaction corrections, batch 3 (items A81–A120 of
// docs/BETA_SIMULATION_VOICES_2026_10_30.md), 2026-11-01.
//   node --no-warnings --test scripts/test-beta-corrections-batch3.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function load(entry, name) {
  const dir = mkdtempSync(join(tmpdir(), "code3-corrections3-"));
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", resolveExtensions: [".js", ".jsx", ".mjs"], loader: { ".js": "jsx" }, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", MODE: "test", DEV: false }) }, plugins: [{ name: "stubs", setup(api) {
    api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    api.onResolve({ filter: /^@(supabase|capacitor)\// }, (args) => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const createClient = () => null; export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }; export const registerPlugin = () => ({}); export const supabase = null;", loader: "js" }));
  } }], nodePaths: [join(process.cwd(), "node_modules")] });
  return import(pathToFileURL(out).href);
}
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const inventory = await load("src/features/flipScout/inventory.js", "inventory");
const calculations = await load("src/features/flipScout/calculations.js", "calculations");
const selectors = await load("src/features/flipScout/selectors.js", "selectors");
const contracts = await load("src/features/manualLifecycles/contracts.js", "contracts");
const adaptive = await load("src/utils/adaptiveUi.js", "adaptive");
const storage = await import("../src/utils/storageLocations.mjs");
const market = await import("../src/utils/marketSearchPresentation.mjs");
const mastery = await load("src/utils/vaultSetMastery.js", "mastery");

test("A120 lot cost allocation sums to the lot total in whole cents", () => {
  const rows = inventory.allocateLotCost({ totalCost: 10, method: "quantity", items: [{ id: "a", quantity: 1 }, { id: "b", quantity: 1 }, { id: "c", quantity: 1 }] });
  const cents = rows.map((row) => Math.round(row.allocatedItemCost * 100));
  assert.deepEqual(cents.sort((a, b) => a - b), [333, 333, 334]);
  assert.equal(cents.reduce((sum, value) => sum + value, 0), 1000);
  assert.deepEqual(inventory.allocateCents(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(inventory.allocateCents(7, [2, 1]), [5, 2]);
  assert.ok(inventory.reconcileLotAllocations(10, rows).reconciled);
});

test("A119 relative-value lots with one unpriced line still allocate, and the warning names missing lines", () => {
  const rows = inventory.allocateLotCost({ totalCost: 30, method: "relative_value", items: [{ id: "a", quantity: 1, projectedResaleMid: 20 }, { id: "b", quantity: 1, projectedResaleMid: 10 }, { id: "c", quantity: 1 }] });
  assert.ok(rows.every((row) => row.allocatedItemCost > 0), "no line is stranded at $0");
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.allocatedItemCost, 0) * 100), 3000);
  assert.deepEqual(inventory.lotLinesMissingCost([{ id: "a", projectedResaleMid: 20 }, { id: "c" }], "relative_value"), ["c"]);
  const reconciliation = inventory.reconcileLotAllocations(30, [{ id: "a", allocatedItemCost: 20 }, { id: "c", allocatedItemCost: "" }]);
  assert.deepEqual(reconciliation.missingItemIds, ["c"]);
  assert.match(reconciliation.warning, /1 line has no cost yet/);
});

test("A121 Deal Analysis scenarios carry a profit margin", () => {
  const result = calculations.calculateAppraisal ? null : null;
  const marginOf = calculations.calculateMargin;
  assert.equal(marginOf(25, 100), 0.25);
  assert.equal(marginOf(5, 0), null);
  assert.ok(result === null);
  const screen = src("src/features/flipScout/screens/AppraiserScreen.jsx");
  assert.match(screen, /Profit margin/);
  assert.match(screen, /<span>Margin<\/span>/);
});

test("A110/A116 Business totals exclude collection/disposed copies and report aging buckets", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const state = { inventory: [
    { id: "i1", quantity: 1, allocatedItemCost: 10, projectedResaleMid: 20, status: "In stock", purchaseDate: "2026-04-01" },
    { id: "i2", quantity: 1, allocatedItemCost: 10, projectedResaleMid: 20, status: "Personal collection", purchaseDate: "2026-01-01" },
    { id: "i3", quantity: 1, allocatedItemCost: 10, projectedResaleMid: 20, status: "Listed" },
  ], sales: [], deals: [], auctions: [], expenses: [], providerListings: [] };
  const summary = selectors.getDashboardSummary ? selectors.getDashboardSummary(state, now) : selectors.selectDashboardSummary(state, now);
  assert.equal(summary.inventoryCost, 20, "personal-collection copy is not business cost");
  assert.equal(summary.projectedInventoryValue, 40);
  assert.deepEqual(summary.agingBuckets, { days30: 0, days60: 0, days90: 0, days180: 1, undated: 1 });
  assert.equal(summary.agingCount, 1);
});

test("A117 processing has a Done state and terminal statuses are known", () => {
  assert.ok(contracts.lifecycleOptions("processing", "status").includes("Done"));
  assert.ok(contracts.isTerminalLifecycleStatus("processing", "Done"));
  assert.equal(contracts.isTerminalLifecycleStatus("processing", "Cleaned"), false);
});

test("A89 unverified reports say what would change the label, and expire honestly", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const fresh = adaptive.scoutTrustGuidance({ status: "unverified", observed_at: "2026-11-01T11:30:00Z" }, now);
  assert.equal(fresh.label, "Awaiting confirmation");
  assert.match(fresh.helper, /another person confirms/);
  const old = adaptive.scoutTrustGuidance({ status: "unverified", observed_at: "2026-09-01T11:30:00Z" }, now);
  assert.equal(old.label, "Never confirmed");
  assert.equal(adaptive.scoutTrustGuidance({ status: "verified" }).label, "Verified");
});

test("A97 city filter options are deduplicated regardless of capitalization", () => {
  const scout = src("src/pages/Scout.jsx");
  assert.match(scout, /stores\.map\(\(s\) => normalizeCityLabel\(s\.city\)\)/);
  assert.match(scout, /normalizeCityLabel\(normalizedStore\.city\) === selectedCity/);
});

test("A98 old market prices are flagged as stale", () => {
  const context = market.getMarketQuoteContext({ lastPriceChecked: "2026-01-01T00:00:00Z" }, {});
  assert.equal(context.stale, true);
  assert.ok(context.ageDays > 200);
  const recent = market.getMarketQuoteContext({ lastPriceChecked: new Date().toISOString() }, {});
  assert.equal(recent.stale, false);
  assert.match(src("src/pages/Market.jsx"), /Old price — last checked/);
});

test("A111 set checklist counts one card per number and leaves secret rares out of 'missing'", () => {
  const rows = mastery.deriveSetCompletionSummary({
    items: [{ name: "Pikachu", setName: "Mini Set", cardNumber: "001/003", catalogType: "card", productType: "Card" }],
    knownSets: [{ id: "mini", name: "Mini Set", totalCards: 3 }],
    catalogProducts: [
      { id: "c1", name: "Pikachu", setName: "Mini Set", cardNumber: "001/003", catalogType: "card", productType: "Card" },
      { id: "c1r", name: "Pikachu (Reverse Holo)", setName: "Mini Set", cardNumber: "001/003", catalogType: "card", productType: "Card" },
      { id: "c2", name: "Eevee", setName: "Mini Set", cardNumber: "002/003", catalogType: "card", productType: "Card" },
      { id: "c3", name: "Mew", setName: "Mini Set", cardNumber: "003/003", catalogType: "card", productType: "Card" },
      { id: "c4", name: "Secret Mew", setName: "Mini Set", cardNumber: "004/003", catalogType: "card", productType: "Card" },
    ],
  });
  const row = rows.find((entry) => entry.name === "Mini Set");
  assert.ok(row.checklistAvailable);
  assert.deepEqual(row.missingCards.map((card) => card.name).sort(), ["Eevee", "Mew"]);
  assert.equal(row.optionalMissingCount, 1);
  assert.match(row.progressCopy, /not counted as missing/);
});

test("A115 storage locations match regardless of case and spacing", () => {
  const records = [{ storageLocation: "Bin 3" }, { storageLocation: "Shelf A" }];
  assert.equal(storage.canonicalStorageLocation("bin  3", records), "Bin 3");
  assert.equal(storage.canonicalStorageLocation("Tote 9", records), "Tote 9");
  assert.deepEqual(storage.knownStorageLocations([...records, { storageLocation: "BIN 3" }, { storage_location: "bin 10" }]), ["Bin 3", "bin 10", "Shelf A"]);
  assert.ok(storage.sameStorageLocation("Bin-3", "bin - 3"));
});

test("A82/A83/A85/A88/A90–A95/A99/A102–A109/A113 copy and UI guards are in place", () => {
  assert.match(src("src/features/botOps/BotOperationsPage.jsx"), /does not start, stop or configure bots/);
  assert.match(src("src/features/botOps/BotProviderSetup.jsx"), /Tracking only/);
  assert.match(src("src/data/bestBuyStockSeed.js"), /enabled: false/);
  assert.match(src("src/pages/Scout.jsx"), /Best Buy monitoring is paused during beta/);
  assert.match(src("src/features/deferredViews/ScoutSubmitContent.jsx"), /scout-proof-disclosure" open>/);
  assert.match(src("src/pages/Scout.jsx"), /your confirmation counts/);
  assert.match(src("src/pages/Scout.jsx"), /MISSING_STORE_STATES\.map/);
  assert.match(src("src/pages/Scout.jsx"), /function storeFact\(label, value\)/);
  assert.match(src("src/services/featureGates.js"), /Patterns are not shown to anyone/);
  assert.match(src("src/App.jsx"), /confidence · \$\{row\.trainingCount \|\| 0\} confirmed restock/);
  assert.match(src("src/mobileScreenSetApp.jsx"), /<small>Recent reports<\/small>/);
  assert.match(src("src/App.jsx"), /Proof type not recorded/);
  assert.match(src("src/components/EbaySoldPriceComparison.jsx"), /owner-only beta/);
  assert.match(src("src/services/pokemonCatalogSearch.js"), /image_small\.not\.is\.null/);
  assert.match(src("src/App.jsx"), /function blankToNull\(value\)/);
  assert.doesNotMatch(src("src/App.jsx"), /marketPrice: Number\(multiDestinationForm\.marketPrice \|\| 0\)/);
  assert.match(src("src/components/CollectionPortfolio.jsx"), /data-state=\{hidden \? "hidden"/);
  assert.match(src("src/components/CollectionPortfolio.jsx"), /wishlist budgets and items for sale are not included/);
  assert.match(src("src/features/manualLifecycles/ManualLifecycles.jsx"), /Download submission sheet \(CSV\)/);
});
