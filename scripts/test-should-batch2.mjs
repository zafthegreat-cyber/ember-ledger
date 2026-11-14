// SHOULD batch 2 (2026-11-14): GTIN normaliser + card-number ranking (19),
// onboarding checklist (15), trade analyzer fallbacks (21), quick restock
// report (18), set aliases (20), saved searches / follows (35), returns (36).
// Run: node --no-warnings --test scripts/test-should-batch2.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

async function load(entry, name) {
  // Bundles live under node_modules so bare "react" imports (kept external to
  // share one React instance with the test) still resolve.
  mkdirSync(join(process.cwd(), "node_modules", ".cache"), { recursive: true });
  const dir = mkdtempSync(join(process.cwd(), "node_modules", ".cache", "code3-should2-"));
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", MODE: "test", DEV: false }) }, plugins: [{ name: "stubs", setup(api) {
    api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    api.onResolve({ filter: /^@(supabase|capacitor)\// }, (args) => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const createClient = () => null; export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }; export const registerPlugin = () => ({}); export const supabase = null;", loader: "js" }));
  } }], resolveExtensions: [".js", ".jsx", ".mjs"], loader: { ".js": "jsx" }, jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"], nodePaths: [join(process.cwd(), "node_modules")] });
  return import(pathToFileURL(out).href);
}

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ---------- 19. GTIN ----------
const gtin = await import("../src/utils/gtin.mjs");

test("GTIN: check digits, UPC-A/EAN-13/GTIN-14 equivalence, UPC-E expansion", () => {
  assert.equal(gtin.gtinCheckDigit("03600029145"), "2"); // classic example 036000291452
  assert.ok(gtin.isValidGtin("036000291452"));
  assert.ok(!gtin.isValidGtin("036000291453"));
  assert.ok(gtin.isValidGtin("4006381333931")); // EAN-13
  assert.equal(gtin.canonicalGtin("0 036000 29145 2"), "036000291452");
  assert.equal(gtin.canonicalGtin("00036000291452"), "036000291452");
  assert.ok(gtin.gtinsMatch("036000291452", "0036000291452"));
  assert.ok(gtin.gtinsMatch("036000291452", "00036000291452"));
  assert.ok(!gtin.gtinsMatch("036000291452", "036000291453"));
  // UPC-E 01234565 → UPC-A 012345000065
  assert.equal(gtin.expandUpcE("01234565"), "012345000065");
  assert.equal(gtin.canonicalGtin("01234565"), "012345000065");
  // EAN-8 is its own thing.
  assert.equal(gtin.canonicalGtin("96385074"), "96385074");
  assert.deepEqual(gtin.gtinVariants("036000291452"), ["036000291452", "0036000291452", "00036000291452"]);
  assert.equal(gtin.canonicalGtin("abc"), "");
  assert.equal(gtin.canonicalGtin("12345"), "");
  assert.match(gtin.describeGtinProblem("12345"), /not a UPC\/EAN length/);
  assert.match(gtin.describeGtinProblem("036000291453"), /mistyped/);
  assert.equal(gtin.describeGtinProblem("036000291452"), "");
});

test("GTIN: stored codes keep their digits, but valid identifiers accept padding without accepting invalid checksums or numeric SKU suffixes", async () => {
  const mod = await load("src/utils/inventoryImportUtils.js", "import-utils");
  // Stored values stay as entered (existing records depend on it) …
  assert.equal(mod.normalizeBarcodeValue("0036000291452"), "0036000291452");
  assert.equal(mod.normalizeBarcodeValue("abc-123"), "ABC123");
  // … while comparisons treat UPC-A and its EAN-13/GTIN-14 forms as one product.
  assert.ok(mod.identifiersMatch("0036000291452", "036000291452"));
  assert.ok(mod.identifiersMatch("00036000291452", "0 036000 29145 2"));
  assert.ok(!mod.identifiersMatch("036000291452", "036000291453"));
  assert.ok(mod.identifiersMatch("ABC-123", "abc123"));
  assert.ok(gtin.isValidGtin("036000291452"), "positive fixture is a valid GTIN");
  assert.ok(!gtin.isValidGtin("820650853024"), "previous fixture had an invalid check digit");
  assert.ok(!mod.identifiersMatch("0820650853024", "820650853024"), "invalid check digits do not gain padded aliases");
  assert.ok(!mod.identifiersMatch("SKU-036000291452", "036000291452"), "SKU digits are not a GTIN");
  assert.ok(mod.identifiersMatch("01234565", "012345000065"), "valid UPC-E expands for matching");
  for (const [stored, scanned] of [["01234565", "012345000065"], ["012345000065", "01234565"]]) {
    assert.equal(mod.findCatalogProductsByBarcode([{ id: "upce", upc: stored }], scanned).length, 1);
  }
  const ids = mod.catalogIdentifiersForProduct({ upc: "036000291452" });
  assert.ok(ids.includes("036000291452") && ids.includes("0036000291452") && ids.includes("00036000291452"));
});

// ---------- 19. Ranking ----------
test("search ranking: the card with the queried number comes first; barcodes match in any padding", async () => {
  const { searchCatalog } = await load("src/utils/catalogSearchUtils.js", "catalog-search");
  const catalog = [
    { id: "a", name: "Charizard", setName: "Base Set", cardNumber: "4/102", upc: "" },
    { id: "b", name: "Charizard ex", setName: "Obsidian Flames", cardNumber: "125/197", upc: "" },
    { id: "c", name: "Charizard", setName: "Base Set 2", cardNumber: "4", upc: "" },
    { id: "d", name: "Charmander", setName: "Base Set", cardNumber: "46/102", upc: "" },
    { id: "e", name: "Scarlet & Violet Booster Bundle", productType: "Booster Bundle", upc: "036000291452" },
  ];
  const results = searchCatalog("charizard 4/102", catalog);
  assert.ok(results.length >= 1);
  assert.equal(results[0].item.id, "a", "full-fraction match ranks first");
  assert.equal(results[0].reason, "Card number match");
  // Bare "4" row is still a match (A104/A105) but ranks below the full fraction.
  const ids = results.map((r) => r.item.id);
  assert.ok(ids.includes("c"));
  assert.ok(ids.indexOf("a") < ids.indexOf("c"));
  assert.ok(!ids.includes("b"), "a different number is excluded");
  assert.ok(!ids.includes("d"), "a different card is excluded");
  // Barcode in EAN-13 padding finds the UPC-A row.
  const byBarcode = searchCatalog("0036000291452", catalog);
  assert.equal(byBarcode[0]?.item.id, "e");
  assert.equal(byBarcode[0]?.reason, "Exact UPC/SKU/barcode match");
  const spaced = searchCatalog("0 036000 29145 2", catalog);
  assert.equal(spaced[0]?.item.id, "e");
});

// ---------- 15. Persona checklist ----------
const checklist = await import("../src/features/onboarding/personaChecklist.js");

test("checklist: three steps per persona, computed from real counts, kid-safe variant", () => {
  const fresh = checklist.buildPersonaChecklist({ persona: "collector", counts: {} });
  assert.equal(fresh.total, 3);
  assert.equal(fresh.done, 0);
  assert.equal(fresh.nextStep.key, "vault");
  const partial = checklist.buildPersonaChecklist({ persona: "collector", counts: { vaultItems: 2, watchlist: 1 } });
  assert.equal(partial.done, 2);
  assert.equal(partial.nextStep.key, "store");
  assert.ok(!partial.complete);
  const complete = checklist.buildPersonaChecklist({ persona: "collector", counts: { vaultItems: 1, followedStores: 1, marketSearches: 1 } });
  assert.ok(complete.complete);
  const seller = checklist.buildPersonaChecklist({ persona: "seller", counts: { inventory: 4 } });
  assert.deepEqual(seller.steps.map((s) => s.key), ["inventory", "receipt", "sale"]);
  assert.equal(seller.done, 1);
  assert.match(seller.intro, /private/i);
  const store = checklist.buildPersonaChecklist({ persona: "store", counts: {} });
  assert.deepEqual(store.steps.map((s) => s.key), ["inventory", "report", "profile"]);
  // Kid-safe wins over persona and never mentions money, selling or prices.
  const kid = checklist.buildPersonaChecklist({ persona: "seller", kidSafe: true, counts: { vaultItems: 1 } });
  assert.equal(kid.key, "kid");
  assert.doesNotMatch(JSON.stringify(kid), /price|sell|\$|profit|receipt/i);
  assert.equal(kid.steps[0].done, true);
  assert.equal(kid.steps[1].done, false, "set step needs three cards");
  // Unknown persona falls back to collector; every persona has exactly three steps.
  assert.equal(checklist.buildPersonaChecklist({ persona: "wizard" }).key, "collector");
  for (const persona of ["collector", "seller", "store"]) assert.equal(checklist.buildPersonaChecklist({ persona }).steps.length, 3);
});

test("checklist: dismissal is remembered per persona; complete lists never show", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const list = checklist.buildPersonaChecklist({ persona: "collector", counts: {} });
  assert.ok(checklist.shouldShowChecklist(list, storage));
  checklist.dismissChecklist("collector", storage);
  assert.ok(!checklist.shouldShowChecklist(list, storage));
  assert.ok(checklist.shouldShowChecklist(checklist.buildPersonaChecklist({ persona: "seller" }), storage), "seller list not affected");
  const done = checklist.buildPersonaChecklist({ persona: "seller", counts: { inventory: 1, receipts: 1, sales: 1 } });
  assert.ok(!checklist.shouldShowChecklist(done, storage));
  // A throwing storage never breaks rendering.
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.ok(checklist.shouldShowChecklist(list, broken));
  assert.doesNotThrow(() => checklist.dismissChecklist("collector", broken));
});

test("checklist: Home mounts it with real counts and routes each target", async () => {
  const home = src("src/pages/OperationsHome.jsx");
  assert.match(home, /<PersonaChecklist persona=\{presentation\.persona\} kidSafe=\{kidSafeView\} counts=\{checklistCounts\} onOpen=\{openChecklistTarget\} \/>/);
  for (const target of ['"collectionWorkspace"', '"restocks"', '"market"', '"report-restock"', '"publicProfile"', '"tour"', 'startsWith("business:")']) assert.ok(home.includes(target), `route for ${target}`);
  assert.match(src("src/App.jsx"), /marketSearchesRun: catalogSearchHasRun \? 1 : 0,/);
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: PersonaChecklist } = await load("src/features/onboarding/PersonaChecklist.jsx", "persona-checklist");
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const html = renderToStaticMarkup(React.createElement(PersonaChecklist, { persona: "collector", counts: { vaultItems: 1 } }));
  assert.match(html, /Getting started · 1 of 3/);
  assert.equal((html.match(/<li/g) || []).length, 3);
  assert.match(html, /class="is-done"/);
  assert.match(html, /aria-label="Hide this checklist"/);
  const none = renderToStaticMarkup(React.createElement(PersonaChecklist, { persona: "collector", counts: { vaultItems: 1, followedStores: 1, marketSearches: 1 } }));
  assert.equal(none, "", "complete checklist renders nothing");
  delete globalThis.localStorage;
});

// ---------- 18. Two-tap restock report ----------
const quick = await import("../src/features/restocks/quickReport.js");

test("quick report: store choices dedupe and put the remembered store first; options land on review with now", () => {
  const followed = [{ id: "s1", storeName: "Target Harbour View", retailer: "Target" }, { id: "s2", storeName: "Walmart Suffolk", retailer: "Walmart" }];
  const nearby = [{ id: "s2", storeName: "Walmart Suffolk" }, { id: "s3", storeName: "GameStop" }];
  const choices = quick.quickReportStoreChoices({ followed, nearby, memory: { lastStoreId: "s2" } });
  assert.deepEqual(choices.map((c) => c.id), ["s2", "s1", "s3"]);
  assert.equal(choices[0].reason, "Last reported");
  assert.equal(quick.quickReportStoreChoices({ followed: Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, storeName: `Store ${i}` })) }).length, 4);
  const options = quick.buildQuickReportOptions({ store: followed[0], status: "low_stock", memory: { lastCategory: "Booster bundles" }, now: new Date("2026-11-14T15:00:00Z") });
  assert.equal(options.reportType, "low_stock");
  assert.equal(options.productCategory, "Booster bundles");
  assert.equal(options.startStep, "review");
  assert.equal(options.observedAt, "2026-11-14T15:00:00.000Z");
  assert.ok(options.quick);
  assert.equal(quick.buildQuickReportOptions({ store: followed[0], status: "nonsense" }).reportType, "stock_on_shelf");
  assert.equal(quick.buildQuickReportOptions({ store: followed[0] }).productCategory, quick.DEFAULT_QUICK_CATEGORY);
  // Memory round-trips and survives a broken storage.
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  quick.rememberQuickReportChoice({ storeId: "s1", storeName: "Target Harbour View", status: "stock_on_shelf" }, storage);
  quick.rememberQuickReportChoice({ category: "ETBs" }, storage);
  assert.deepEqual(quick.readQuickReportMemory(storage), { lastStoreId: "s1", lastStoreName: "Target Harbour View", lastCategory: "ETBs", lastStatus: "stock_on_shelf" });
  const broken = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } };
  assert.doesNotThrow(() => quick.rememberQuickReportChoice({ storeId: "a" }, broken));
  assert.equal(quick.readQuickReportMemory(broken).lastStoreId, "");
  assert.equal(quick.QUICK_REPORT_STATUSES.length, 3);
});

test("quick report: the submit flow honours productCategory/startStep only for quick launches with a store", () => {
  const app = src("src/App.jsx");
  assert.match(app, /productCategory: options\.productCategory \|\| "",/);
  assert.match(app, /options\.quick && seededStore \? \{ storeConfirmed: true, reportTypeTouched: true \} : \{\}/);
  assert.match(app, /setQuickScoutReportStep\(options\.quick && seededStore && options\.startStep \? options\.startStep : "where"\)/);
  assert.match(app, /onReportRestock: \(options = \{\}\) => openScoutSubmitFlow\(\{ source: "home-restock", \.\.\.options \}\)/);
  const home = src("src/pages/OperationsHome.jsx");
  assert.match(home, /<QuickRestockLauncher followedStores=\{followedStores\}/);
  assert.match(home, /kidSafe=\{kidSafeView\} onLaunch=\{\(options\) => onReportRestock\(options\)\}/);
});

test("quick report: launcher renders stores + three statuses, nothing for kids or with no stores", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: QuickRestockLauncher } = await load("src/features/restocks/QuickRestockLauncher.jsx", "quick-launcher");
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const html = renderToStaticMarkup(React.createElement(QuickRestockLauncher, { followedStores: [{ id: "s1", storeName: "Target Harbour View", retailer: "Target" }] }));
  assert.match(html, /Target Harbour View/);
  assert.equal((html.match(/quick-restock__status /g) || []).length, 3);
  assert.match(html, /aria-checked="true"/);
  assert.equal(renderToStaticMarkup(React.createElement(QuickRestockLauncher, { followedStores: [{ id: "s1", storeName: "X" }], kidSafe: true })), "");
  assert.equal(renderToStaticMarkup(React.createElement(QuickRestockLauncher, { followedStores: [] })), "");
  delete globalThis.localStorage;
});

// ---------- 21. Trade analyzer fallbacks ----------
test("trade analyzer: partial labels, concrete fallbacks and stale-price warnings", async () => {
  const { buildTradeComparison } = await import("../src/utils/tradeValueUtils.js");
  const money = (v) => `$${Number(v).toFixed(2)}`;
  const onlyGave = buildTradeComparison({ outgoingQuantity: 1, receivedName: "Pikachu", receivedType: "Card" }, { name: "Charizard", marketPrice: 120 }, { moneyFormatter: money });
  assert.equal(onlyGave.partialLabel, "You're giving about $120.00. Add what you got to compare.");
  assert.equal(onlyGave.differenceLabel, "Unknown Balance");
  assert.deepEqual(onlyGave.fallbackSuggestions.map((f) => f.source), ["Asking price"]);
  const sealed = buildTradeComparison({ outgoingQuantity: 1, receivedName: "ETB", receivedType: "Sealed" }, { name: "Charizard", marketPrice: 120 }, { moneyFormatter: money });
  assert.equal(sealed.fallbackSuggestions[0].source, "MSRP");
  const nothing = buildTradeComparison({ outgoingQuantity: 2, receivedName: "Pikachu" }, { name: "Mystery", purchasePrice: 15 }, { moneyFormatter: money });
  assert.match(nothing.partialLabel, /No values yet/);
  const paid = nothing.fallbackSuggestions.find((f) => f.source === "What you paid");
  assert.equal(paid.value, 30, "quantity-aware");
  assert.ok(nothing.fallbackSuggestions.some((f) => f.source === "Market"));
  const withEstimate = buildTradeComparison({ outgoingQuantity: 1, receivedName: "Pikachu", receivedQuantity: 2 }, { marketPrice: 50 }, { moneyFormatter: money, receivedEstimate: { value: 20, source: "Catalog estimate" } });
  assert.equal(withEstimate.partialLabel, "", "estimate fills the side so no partial state");
  assert.equal(withEstimate.resultLabel, "Value Drift");
  const stale = buildTradeComparison({ outgoingQuantity: 1, receivedName: "Pikachu", receivedValue: "100" }, { marketPrice: 120, marketPriceUpdatedAt: "2026-09-01" }, { moneyFormatter: money, now: "2026-11-14" });
  assert.ok(stale.stalePrice);
  assert.equal(stale.priceAgeDays, 74);
  assert.match(stale.guidance, /74 days old/);
  const fresh = buildTradeComparison({ outgoingQuantity: 1, receivedName: "Pikachu", receivedValue: "100" }, { marketPrice: 120, marketPriceUpdatedAt: "2026-11-10" }, { moneyFormatter: money, now: "2026-11-14" });
  assert.ok(!fresh.stalePrice);
  assert.doesNotMatch(fresh.guidance, /days old/);
  assert.match(src("src/App.jsx"), /comparison\.partialLabel \? "—" : comparison\.differenceLabel/);
});

// ---------- 20. Japanese ↔ English set aliases ----------
const sets = await import("../src/data/japaneseSetAliases.mjs");

test("set aliases: Japanese name, romaji or code resolve to the English set and back", () => {
  assert.equal(sets.englishSetNameFor("sv2a"), "Scarlet & Violet 151");
  assert.equal(sets.englishSetNameFor("ポケモンカード151"), "Scarlet & Violet 151");
  assert.equal(sets.englishSetNameFor("Terastal Festival ex"), "Prismatic Evolutions");
  assert.equal(sets.englishSetNameFor("S12A"), "Crown Zenith");
  assert.equal(sets.englishSetNameFor("nothing here"), "");
  const resolved = sets.resolveSetAcrossLanguages("古代の咆哮");
  assert.equal(resolved.english, "Paradox Rift");
  assert.equal(resolved.matched.language, "ja");
  assert.equal(resolved.matched.code, "sv4k");
  assert.equal(resolved.japanese.length, 3, "Paradox Rift drew from three Japanese sets");
  assert.equal(sets.resolveSetAcrossLanguages("Paradox Rift").matched.language, "en");
  assert.ok(sets.japaneseAliasesFor("Evolving Skies").includes("s7R"));
  assert.deepEqual(sets.japaneseAliasesFor("unknown"), []);
  // Every row has at least one Japanese set with name, romaji and code.
  for (const row of sets.JAPANESE_SET_ALIASES) {
    assert.ok(row.japanese.length >= 1, row.english);
    for (const ja of row.japanese) assert.ok(ja.name && ja.romaji && ja.code, `${row.english} ${JSON.stringify(ja)}`);
  }
});

test("set aliases: per-language progress keeps English and Japanese printings apart", () => {
  const items = [
    { setName: "Scarlet & Violet 151", cardNumber: "4/165", language: "en" },
    { setName: "Scarlet & Violet 151", cardNumber: "004/165" }, // same card, duplicate → counts once
    { setName: "Scarlet & Violet 151", cardNumber: "25/165", language: "English" },
    { setCode: "sv2a", cardNumber: "006/165" }, // Japanese by code, no language field
    { setName: "ポケモンカード151", cardNumber: "199/165", language: "ja" },
    { setName: "Obsidian Flames", cardNumber: "1/197" }, // other set
  ];
  const progress = sets.setProgressByLanguage(items, "Scarlet & Violet 151", { englishTotal: 165, japaneseTotals: { sv2a: 165 } });
  assert.equal(progress.languages.en.owned, 2);
  assert.equal(progress.languages.en.percent, 1);
  assert.equal(progress.languages.ja.owned, 2);
  assert.equal(progress.languages.ja.total, 165);
  assert.ok(progress.mixed);
  assert.equal(progress.languages.ja.sets[0].code, "sv2a");
  const unknownSet = sets.setProgressByLanguage([{ setName: "Custom Set", cardNumber: "1" }], "Custom Set");
  assert.equal(unknownSet.languages.en.owned, 1);
  assert.equal(unknownSet.languages.en.total, null);
  assert.equal(unknownSet.languages.en.percent, null, "no made-up percentage without a total");
});

test("set aliases: catalog search finds the English set from a Japanese code or name", async () => {
  const { searchCatalog, getAliasExpansions } = await load("src/utils/catalogSearchUtils.js", "catalog-search-ja");
  const { getSetByCodeOrAlias } = await load("src/data/pokemonSetCatalog.js", "set-catalog");
  assert.equal(getSetByCodeOrAlias("sv2a")?.name, "Scarlet & Violet 151");
  assert.equal(getSetByCodeOrAlias("テラスタルフェスex")?.name, "Prismatic Evolutions");
  assert.ok(getAliasExpansions("ポケモンカード151").includes("scarlet and violet 151"));
  const catalog = [
    { id: "etb151", name: "Scarlet & Violet 151 Elite Trainer Box", setName: "Scarlet & Violet 151", productType: "Elite Trainer Box" },
    { id: "etbpe", name: "Prismatic Evolutions Elite Trainer Box", setName: "Prismatic Evolutions", productType: "Elite Trainer Box" },
  ];
  assert.equal(searchCatalog("ポケモンカード151", catalog)[0]?.item.id, "etb151");
  assert.equal(searchCatalog("sv8a etb", catalog)[0]?.item.id, "etbpe");
});

// ---------- 36. Purchase returns ----------
test("purchase return lifecycle: staged, refund-capped, append-only", async () => {
  const { buildLifecycleRecord, validateLifecycleTransition, isTerminalLifecycleStatus, lifecycleOptions } = await load("src/features/manualLifecycles/contracts.js", "lifecycles");
  const at = (n) => new Date(Date.UTC(2026, 10, 14, 12, n)).toISOString();
  const base = { inventory: [], sales: [], auctions: [], mileage: [], purchases: [{ id: "p1", title: "Target run", totalPurchaseCost: 59.98 }], manualLifecycles: [] };
  const values = (over) => ({ purchaseId: "p1", quantity: 2, status: "Requested", reason: "Damaged", refundMinor: 0, refundReference: "", notes: "", ...over });
  const v1 = buildLifecycleRecord("purchaseReturn", values({}), null, { id: "r1", at: at(0) });
  const s1 = { ...base, manualLifecycles: [v1] };
  assert.doesNotThrow(() => validateLifecycleTransition(base, s1));
  // Must start at Requested.
  assert.throws(() => validateLifecycleTransition(base, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ status: "Returned" }), null, { id: "r2", at: at(0) })] }), /first stage/);
  // Refund before the seller refunded you is rejected; Returned → Refunded needs amount + reference.
  assert.throws(() => validateLifecycleTransition(s1, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ status: "Returned", refundMinor: 1000 }), v1, { at: at(1) })] }), /only once the seller/);
  const v2 = buildLifecycleRecord("purchaseReturn", values({ status: "Returned" }), v1, { at: at(1) });
  const s2 = { ...base, manualLifecycles: [v2] };
  assert.doesNotThrow(() => validateLifecycleTransition(s1, s2));
  assert.throws(() => validateLifecycleTransition(s2, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ status: "Refunded" }), v2, { at: at(2) })] }), /refund amount/);
  // Refund cannot exceed what the purchase cost (59.98 → 5998 minor).
  assert.throws(() => validateLifecycleTransition(s2, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ status: "Refunded", refundMinor: 6000, refundReference: "RMA-1" }), v2, { at: at(2) })] }), /exceed what this purchase cost/);
  const v3 = buildLifecycleRecord("purchaseReturn", values({ status: "Refunded", refundMinor: 5998, refundReference: "RMA-1" }), v2, { at: at(2) });
  const s3 = { ...base, manualLifecycles: [v3] };
  assert.doesNotThrow(() => validateLifecycleTransition(s2, s3));
  // Skipping stages or reducing a refund is rejected; Closed is terminal.
  assert.throws(() => validateLifecycleTransition(s1, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ status: "Refunded", refundMinor: 100, refundReference: "x" }), v1, { at: at(1) })] }), /in order/);
  assert.throws(() => validateLifecycleTransition(s3, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ status: "Closed", refundMinor: 100, refundReference: "RMA-1" }), v3, { at: at(3) })] }), /cannot be reduced/);
  const v4 = buildLifecycleRecord("purchaseReturn", values({ status: "Closed", refundMinor: 5998, refundReference: "RMA-1" }), v3, { at: at(3) });
  assert.doesNotThrow(() => validateLifecycleTransition(s3, { ...base, manualLifecycles: [v4] }));
  assert.ok(isTerminalLifecycleStatus("purchaseReturn", "Closed"));
  assert.ok(isTerminalLifecycleStatus("purchaseReturn", "Cancelled"));
  assert.deepEqual(lifecycleOptions("purchaseReturn", "reason").slice(0, 2), ["Damaged", "Not as described"]);
  // The purchase link is fixed once saved; a missing purchase is rejected.
  assert.throws(() => validateLifecycleTransition(s1, { ...base, manualLifecycles: [buildLifecycleRecord("purchaseReturn", values({ purchaseId: "p9" }), v1, { at: at(1) })] }), /missing|cannot be reassigned/);
  // Inventory untouched: the lifecycle never changes inventory records.
  assert.deepEqual(s3.inventory, []);
  const ui = src("src/features/manualLifecycles/ManualLifecycles.jsx");
  assert.match(ui, /purchaseReturn: "Purchase return"/);
  assert.match(src("src/pages/EverydayWorkspaces.jsx"), /types=\{\["purchaseReturn"\]\} title="Returns to the seller" purchaseId=\{selected\.record\.id\}/);
});

// ---------- 37. CSV worker ----------
test("csv export: identical output, worker used only above the threshold, falls back on failure", async () => {
  const csv = await import("../src/features/exports/csv.js");
  const rows = [{ a: "1", b: 'say "hi"' }, { a: "2", b: "" }];
  assert.equal(csv.rowsToCsv(rows), 'a,b\n"1","say ""hi"""\n"2",""');
  assert.equal(csv.rowsToCsv([]), "");
  assert.equal(await csv.rowsToCsvAsync(rows), csv.rowsToCsv(rows), "small exports stay synchronous");
  // Fake worker: echoes a CSV; then a worker that throws → main-thread fallback.
  const big = Array.from({ length: 2500 }, (_, i) => ({ n: String(i) }));
  let posted = null;
  globalThis.Worker = function FakeWorker() {};
  csv.setCsvWorkerFactory(() => ({ postMessage(message) { posted = message; setTimeout(() => this.onmessage({ data: { csv: "from-worker" } }), 0); }, terminate() {} }));
  assert.equal(await csv.rowsToCsvAsync(big), "from-worker");
  assert.equal(posted.type, "csv");
  assert.equal(posted.rows.length, 2500);
  csv.setCsvWorkerFactory(() => { throw new Error("no worker"); });
  assert.equal(await csv.rowsToCsvAsync(big), csv.rowsToCsv(big));
  csv.setCsvWorkerFactory(() => ({ postMessage() { setTimeout(() => this.onerror(new Error("boom")), 0); }, terminate() {} }));
  assert.equal(await csv.rowsToCsvAsync(big), csv.rowsToCsv(big));
  csv.setCsvWorkerFactory(() => ({ postMessage() {}, terminate() {} }));
  assert.equal(await csv.rowsToCsvAsync(big, { timeoutMs: 20 }), csv.rowsToCsv(big), "hung worker times out to the main thread");
  delete globalThis.Worker;
  assert.match(src("src/App.jsx"), /const csv = await rowsToCsvAsync\(rows\);/);
});

// ---------- 35. Saved Market searches ----------
test("saved searches: dedupe, cap, newest first, remove, survive bad storage", async () => {
  const saved = await import("../src/features/market/savedSearches.js");
  let rows = [];
  const t = (n) => new Date(Date.UTC(2026, 10, 14, 12, n));
  rows = saved.addSavedSearch(rows, "  Prismatic   Evolutions ETB ", { now: t(0) });
  rows = saved.addSavedSearch(rows, "charizard 4/102", { now: t(1) });
  rows = saved.addSavedSearch(rows, "PRISMATIC EVOLUTIONS etb", { now: t(2) });
  assert.deepEqual(rows.map((r) => r.query), ["Prismatic Evolutions ETB", "charizard 4/102"], "re-saving moves to the front without duplicating");
  assert.equal(rows[0].savedAt, t(0).toISOString(), "original save time kept");
  assert.equal(rows[0].lastRunAt, t(2).toISOString());
  assert.ok(saved.isSavedSearch(rows, "Charizard 4/102"));
  rows = saved.touchSavedSearch(rows, "charizard 4/102", t(3));
  assert.equal(rows[0].query, "charizard 4/102");
  rows = saved.removeSavedSearch(rows, "CHARIZARD 4/102");
  assert.equal(rows.length, 1);
  for (let i = 0; i < 30; i += 1) rows = saved.addSavedSearch(rows, `q${i}`);
  assert.equal(rows.length, saved.SAVED_SEARCHES_MAX);
  assert.equal(saved.addSavedSearch(rows, "   ").length, rows.length, "blank is ignored");
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saved.writeSavedSearches(rows, storage);
  assert.equal(saved.readSavedSearches(storage).length, saved.SAVED_SEARCHES_MAX);
  storage.setItem(saved.SAVED_SEARCHES_KEY, "{not json");
  assert.deepEqual(saved.readSavedSearches(storage), []);
  assert.deepEqual(saved.readSavedSearches({ getItem() { throw new Error("blocked"); } }), []);
  assert.match(src("src/pages/Market.jsx"), /<SavedSearches currentQuery=\{submittedQuery\} hasRun=\{Boolean\(catalogSearchHasRun\)\} onRun=\{\(query\) => \{ setCatalogSearch\(query\); submitCatalogSearch\(query\); \}\} \/>/);
});

// ---------- 31. What's new ----------
test("release notes: newest first, seen tracking, hidden for brand-new accounts", async () => {
  const notes = await import("../src/features/tour/releaseNotes.js");
  assert.ok(notes.RELEASE_NOTES.length >= 3);
  const dates = notes.RELEASE_NOTES.map((n) => n.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), "newest first");
  assert.equal(new Set(notes.RELEASE_NOTES.map((n) => n.id)).size, notes.RELEASE_NOTES.length, "ids unique");
  assert.equal(notes.whatsNewSince("").length, notes.RELEASE_NOTES.length);
  assert.equal(notes.whatsNewSince(notes.RELEASE_NOTES[0].id).length, 0);
  assert.equal(notes.whatsNewSince(notes.RELEASE_NOTES[1].id).length, 1);
  assert.equal(notes.whatsNewSince("never-existed").length, notes.RELEASE_NOTES.length);
  assert.ok(notes.shouldShowWhatsNewCard({ seenId: "" }));
  assert.ok(!notes.shouldShowWhatsNewCard({ seenId: "", isNewAccount: true }), "new accounts get the checklist, not release notes");
  assert.ok(!notes.shouldShowWhatsNewCard({ seenId: notes.RELEASE_NOTES[0].id }));
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  notes.markWhatsNewSeen("x", storage);
  assert.equal(notes.readWhatsNewSeen(storage), "x");
  assert.equal(notes.readWhatsNewSeen({ getItem() { throw new Error("no"); } }), "");
  const app = src("src/App.jsx");
  assert.match(app, /const releaseUpdates = RELEASE_NOTES\.map/);
  assert.match(app, /onOpenFeedback: openQuickFeedback,/);
  assert.match(src("src/features/feedback/QuickFeedback.jsx"), /window\.addEventListener\(OPEN_FEEDBACK_EVENT, onOpen\)/);
  assert.match(src("src/pages/OperationsHome.jsx"), /<WhatsNewCard isNewAccount=/);
});

// ---------- Rule A + open beta gates ----------
test("plans: Rule A gates and the open-beta unlock", async () => {
  const gates = await load("src/services/featureGates.js", "gates");
  assert.equal(gates.OPEN_BETA_GATES_OPEN, true);
  // Rule A after beta: collector essentials free, business/restocks tooling paid.
  for (const key of ["set_completion", "portfolio_value", "wishlist_alerts", "collection_export", "unlimited_vault", "saved_market_searches", "variants", "graded_slab_tracking"]) {
    assert.equal(gates.canUseFeature("free", key, { openBeta: false }), true, `${key} should be free`);
  }
  for (const key of ["forge_inventory", "deal_finder", "receipt_scan_review", "price_history", "kid_profiles", "shop_profile_tools"]) {
    assert.equal(gates.canUseFeature("free", key, { openBeta: false }), false, `${key} should be paid after beta`);
  }
  // Open beta: all of those are on for a free member today; staff + protected stay closed.
  for (const key of ["forge_inventory", "deal_finder", "receipt_scan_review", "price_history", "kid_profiles"]) assert.equal(gates.canUseFeature("free", key), true, `${key} open during beta`);
  for (const key of ["admin_review", "admin_catalog_manage", "scout_pattern_tools", "scout_raw_history", "restock_predictions"]) assert.equal(gates.canUseFeature("free", key), false, `${key} must stay closed`);
  const access = gates.getTierAccess({ tier: "free" });
  assert.equal(access.scoutStoreSlots, 3);
  assert.equal(access.canViewRawScoutHistory, false);
  assert.equal(access.canAccessAdminModeration, false);
  assert.equal(gates.getTierAccess({ tier: "free" }, { openBeta: false }).scoutStoreSlots, 1);
  assert.equal(gates.TIER_PRICING.free.cta, "Included for everyone");
  assert.equal(gates.TIER_PRICING.collector.cta, "On for everyone");
  assert.doesNotMatch(gates.TIER_PRICING.free.features.join(" "), /Not included: total collection value/);
  assert.ok(src("docs/PLANS_AND_SERVICES.md").includes("Free covers everything an ordinary collector needs"));
});
