// Verified feedback findings F01–F20 (QA report feedback-20-verified-20261030),
// implemented in this working copy on 2026-10-31.
//
//   node --no-warnings --test scripts/test-feedback-20-findings.mjs
//
// Pure modules are exercised directly. Component-level findings (F01, F02,
// F03, F11, F15, F16, F19, F20) are checked against the source text so a
// future refactor that drops the guard fails here rather than in the field.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStockScreenshotText, createStockScreenshotPatch } from "../src/utils/stockScreenshotDraft.mjs";
import { businessRecordMatchesQuery, businessRecordSearchText } from "../src/utils/businessInventorySearch.mjs";
import { availableQuantity, isSoldOut, projectedResaleTotal, projectedResaleTotalNote, recordQuantity, remainingStockCost, unitsOnHandTotal } from "../src/utils/businessInventoryTotals.mjs";
import { amountIssue, presentAmount, presentMoney, recordCurrency } from "../src/utils/recordPresentation.mjs";
import { buildPortfolioCsv, getPortfolioItemValuation, summarizePortfolio } from "../src/utils/collectionPortfolio.mjs";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stores = [{ id: "s1", name: "Target Short Pump", city: "Richmond", state: "VA" }];
const now = new Date("2026-10-31T12:00:00").getTime();
const baseChoices = { observedTimeConfirmed: true, reportDate: "2026-10-31", reportTime: "11:50", platform: "discord", storeId: "s1", reportType: "stock_on_shelf" };

// ---------------------------------------------------------------- F04–F08
test("F04: changing the reviewed game/category clears the previous catalog identity", () => {
  const draft = { storeId: "s1", productName: "Prismatic Evolutions ETB", productCategory: "Pokemon TCG", catalogProductId: "cat-1", productImageUrl: "x.png", reportType: "stock_on_shelf" };
  const result = createStockScreenshotPatch(draft, { ...baseChoices, replaceEnteredFields: true, productName: "Prismatic Evolutions ETB", productCategory: "Magic: The Gathering" }, { stores, now });
  assert.equal(result.ok, true);
  assert.equal(result.patch.catalogProductId, "");
  assert.equal(result.patch.productImageUrl, "");
  assert.equal(result.patch.manualItemEntry, true);
  const unchanged = createStockScreenshotPatch(draft, { ...baseChoices, replaceEnteredFields: true, productName: "Prismatic Evolutions ETB", productCategory: "Pokemon TCG" }, { stores, now });
  assert.equal(unchanged.ok, true);
  assert.equal(Object.hasOwn(unchanged.patch, "catalogProductId"), false, "same category keeps the catalog link");
});

test("F05: a question without a question mark is not a stock claim", () => {
  for (const text of ["Is Prismatic Evolutions in stock at Target", "wondering if ETBs are in stock at target", "anyone know if Target has Prismatic Evolutions on shelf"]) {
    const result = parseStockScreenshotText(text, { stores });
    assert.ok(result.flags.includes("indirect_or_future_claim"), `${text}: ${result.flags.join(",")}`);
    assert.equal(result.reportType, "");
  }
});

test("F06: negated depletion ('never sold out') needs review instead of becoming no_stock", () => {
  const result = parseStockScreenshotText("Prismatic Evolutions ETBs never sold out here, still on shelf", { stores });
  assert.ok(result.flags.includes("negated_status_needs_review"));
  assert.equal(result.reportType, "");
  const plain = parseStockScreenshotText("Prismatic Evolutions ETBs sold out at Target", { stores });
  assert.equal(plain.reportType, "no_stock");
});

test("F07: a bare status line with no product nearby is ignored, not attached to a later product", () => {
  const result = parseStockScreenshotText("Sold out\nTarget restocked Prismatic Evolutions ETBs on shelf", { stores });
  assert.ok(result.flags.includes("unrelated_availability_ignored"));
  assert.equal(result.reportType, "stock_on_shelf");
});

test("F08: recognized products past the bounded list are counted and flagged, never silently dropped", () => {
  const sets = ["Prismatic Evolutions", "Surging Sparks", "Journey Together", "Destined Rivals", "Phantasmal Flames", "Fusion Strike"];
  const types = ["ETB", "booster box", "booster bundle", "tin"];
  const lines = sets.flatMap((set) => types.map((type) => `${set} ${type} on shelf`));
  const result = parseStockScreenshotText(lines.join("\n"), { stores });
  assert.equal(result.items.length, 8);
  assert.equal(result.omittedProductCount, lines.length - 8);
  assert.ok(result.flags.includes("product_list_truncated"));
});

// ---------------------------------------------------------------- F09–F10
test("F09: saved identifiers (SKU, barcode, UPC, catalog IDs) are searchable, with or without separators", () => {
  const record = { name: "Prismatic Evolutions ETB", sku: "PE-ETB-001", barcode: "820650857775", catalogProductId: "cat_42" };
  assert.ok(businessRecordMatchesQuery(record, "pe-etb-001"));
  assert.ok(businessRecordMatchesQuery(record, "peetb001"));
  assert.ok(businessRecordMatchesQuery(record, "820650857775"));
  assert.ok(businessRecordMatchesQuery(record, "cat_42"));
  assert.equal(businessRecordMatchesQuery(record, "999999"), false);
});

test("F10: game, language, edition, grader and storage metadata are searchable in camelCase or snake_case", () => {
  const record = { name: "Charizard", tcgGame: "pokemon", language: "Japanese", edition: "1st Edition", gradingCompany: "PSA", grade: "10", storage_location: "Binder 3" };
  const text = businessRecordSearchText(record);
  assert.match(text, /pokémon|pokemon/);
  assert.ok(businessRecordMatchesQuery(record, "japanese psa 10"));
  assert.ok(businessRecordMatchesQuery(record, "binder 3"));
  assert.ok(businessRecordMatchesQuery(record, "1st edition"));
  assert.ok(businessRecordMatchesQuery(record, "graded"));
  assert.equal(businessRecordMatchesQuery({ name: "Loose pack" }, "psa"), false);
});

// ---------------------------------------------------------------- F12–F14
test("F12: quantity aliases are honored and an unknown quantity never reads as sold out", () => {
  assert.equal(recordQuantity({ ownedQuantity: "3" }), 3);
  assert.equal(recordQuantity({ quantity_on_hand: 2 }), 2);
  assert.equal(recordQuantity({}), null);
  assert.equal(recordQuantity({ quantity: "" }), null);
  assert.equal(availableQuantity({}, 0), null);
  assert.equal(isSoldOut({}, 0), false, "unknown is not sold out");
  assert.equal(isSoldOut({ quantity: 2 }, 2), true);
  assert.equal(isSoldOut({ quantity: 2 }, 1), false);
  assert.deepEqual(unitsOnHandTotal([{ quantity: 4 }, {}, { ownedQuantity: 2 }], () => 1), { total: 4, missing: 1, counted: 2 });
});

test("F13: available cost is the remaining-stock cost, not the full purchase cost after sales", () => {
  assert.equal(remainingStockCost({ allocatedItemCost: 30, quantity: 3 }, 1), 20);
  assert.equal(remainingStockCost({ allocatedItemCost: 30, quantity: 3 }, 3), 0);
  assert.equal(remainingStockCost({ totalPurchaseCost: 30 }, 0), 30, "no sales keeps the saved cost");
  assert.equal(remainingStockCost({}, 0), null, "no saved cost stays unknown");
  assert.equal(remainingStockCost({ allocatedItemCost: "", quantity: 2 }, 0), null);
});

test("F14: projected total = per-unit midpoint × remaining units, keeps explicit $0, reports partial coverage", () => {
  const rows = [{ quantity: 3, projectedResaleMid: 10 }, { projectedResaleMid: 0 }, { quantity: 2 }, { quantity_on_hand: 5, projectedResaleMid: "2" }];
  const total = projectedResaleTotal(rows, (row) => (row.quantity === 3 ? 1 : 0));
  assert.equal(total.total, 2 * 10 + 0 + 5 * 2);
  assert.equal(total.covered, 3);
  assert.equal(total.missing, 1);
  assert.equal(total.assumedSingle, 1);
  assert.equal(total.partial, true);
  assert.match(projectedResaleTotalNote(total), /1 of 4 items has no estimate yet/);
  assert.match(projectedResaleTotalNote(total), /counted as 1 unit/);
  const zeroOnly = projectedResaleTotal([{ quantity: 1, projectedResaleMid: 0 }]);
  assert.equal(zeroOnly.hasEstimates, true, "an explicit $0 estimate is still an estimate");
  assert.equal(zeroOnly.total, 0);
  assert.equal(projectedResaleTotal([{ quantity: 1 }]).hasEstimates, false);
});

// ---------------------------------------------------------------- F17–F18
test("F17: non-USD saved estimates stay saved, are labeled, and are excluded from the USD total", () => {
  const items = [{ name: "A", marketPrice: 10, quantity: 2 }, { name: "B", marketPrice: 5, priceCurrency: "EUR" }, { name: "C", marketPrice: 7, currency: "usd" }];
  const eur = getPortfolioItemValuation(items[1]);
  assert.equal(eur.value, null);
  assert.equal(eur.unitValue, 5, "the saved amount is preserved");
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.source, "unconverted");
  assert.match(eur.label, /EUR/);
  assert.match(eur.label, /not converted/i);
  const summary = summarizePortfolio(items);
  assert.equal(summary.total, 27);
  assert.equal(summary.unconvertedCount, 1);
  assert.deepEqual(summary.unconvertedCurrencies, ["EUR"]);
  const csv = buildPortfolioCsv(items);
  assert.match(csv, /"Estimate currency"/);
  assert.match(csv, /"B",.*"5","EUR","","Saved EUR estimate/);
  assert.equal(getPortfolioItemValuation({ marketPrice: 5, priceCurrency: "USD", currency: "EUR" }).value, 5, "explicit price currency wins");
});

test("F18: malformed acquisition values present as unknown; numeric zero is kept", () => {
  assert.equal(presentAmount(true), null);
  assert.equal(presentAmount(false), null);
  assert.equal(presentAmount("   "), null);
  assert.equal(presentAmount(-4), null);
  assert.equal(presentAmount("-4"), null);
  assert.equal(presentAmount(Number.POSITIVE_INFINITY), null);
  assert.equal(presentAmount({ amount: 4 }), null);
  assert.equal(presentAmount(0), 0);
  assert.equal(presentAmount("0"), 0);
  assert.equal(presentAmount("12.50"), 12.5);
  assert.equal(presentAmount("$1,250.00"), 1250);
  assert.equal(presentMoney(0), "$0.00");
  assert.equal(presentMoney(true), "Not recorded");
  assert.equal(presentMoney("  ", { unknown: "—" }), "—");
  assert.equal(amountIssue(true), "boolean");
  assert.equal(amountIssue("  "), "blank");
  assert.equal(amountIssue(-1), "negative");
  assert.equal(amountIssue(5), null);
  assert.equal(recordCurrency({ currency: "eur" }), "EUR");
  assert.equal(recordCurrency({ currency: "dollars" }), "");
});

// ------------------------------------------------- component-level guards
test("F01: cloud controls remount per account", () => {
  const panel = src("src/features/persistence/CloudSyncPanel.jsx");
  assert.match(panel, /<CloudSyncPanelControls key=\{accountKey\} \/>/);
  assert.match(panel, /workspace\?\.user\?\.id/);
});

test("F02/F03: screenshot review resets with a new image and cannot apply stale suggestions", () => {
  const component = src("src/components/StockScreenshotImport.jsx");
  assert.match(component, /function resetSourceReview\(\)/);
  assert.match(component, /const reviewStale = Boolean\(suggestions\) && text !== reviewedText;/);
  assert.match(component, /negated_status_needs_review/);
  assert.match(component, /unrelated_availability_ignored/);
  assert.match(component, /product_list_truncated/);
});

test("F11/F15/F16: business lists reveal more rows, zero projections survive editing, hidden values hide copy costs", () => {
  const page = src("src/pages/EverydayWorkspaces.jsx");
  assert.doesNotMatch(page, /slice\(0, 24\)/, "no silent 24-row cap");
  assert.match(page, /function RevealMoreList/);
  for (const field of ["Low", "Mid", "High"]) assert.match(page, new RegExp(`value=\\{form\\.projectedResale${field} \\?\\? ""\\}`));
  assert.match(page, /showValues=\{!portfolioViewState\.hidden\}/);
  assert.match(page, /"Acquisition cost", value: !showValues \? VALUE_HIDDEN/);
  assert.match(page, /presentAmount\(value\)/, "money() goes through the presentation boundary");
  assert.match(page, /return remainingStockCost\(record, soldQuantityForInventory\(record\.id, sales\)\);/);
  assert.match(page, /return availableQuantity\(record, soldQuantityForInventory\(record\.id, sales\)\);/);
});

test("F19: portfolio export uses the shared file adapter with a duplicate-click guard and honest failure copy", () => {
  const component = src("src/components/CollectionPortfolio.jsx");
  assert.match(component, /import \{ exportFile, exportFileError, exportFileStatus \} from "\.\.\/native\/nativeFiles\.js";/);
  assert.match(component, /if \(exportingRef\.current\) return;/);
  assert.match(component, /await exportFile\(\{ blob, filename: "code3-tcg-portfolio\.csv" \}\)/);
  assert.match(component, /exportFileError\(error\)/);
  assert.doesNotMatch(component, /anchor\.click\(\)/);
  assert.match(component, /Export \$\{activeName === "All portfolios" \? "all portfolios" : "this portfolio"\}/);
});

test("F20: password auth handler has a synchronous in-flight guard cleared in finally", () => {
  const app = src("src/App.jsx");
  assert.match(app, /const authInFlightRef = useRef\(false\);/);
  assert.match(app, /if \(authInFlightRef\.current\) return;\n\s+authInFlightRef\.current = true;\n\s+setAuthLoading\(true\);/);
  assert.match(app, /authInFlightRef\.current = false;\n\s+setAuthLoading\(false\);/);
});
