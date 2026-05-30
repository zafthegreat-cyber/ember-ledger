import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildQuickAddSuccessMessage,
  calendarEventToQuickAddSeed,
  findQuickAddCatalogMatch,
  normalizeQuickAddDestinations,
  quickAddDestinationNames,
} from "../src/utils/quickAddRouting.js";
import {
  resolveAdaptiveUiState,
  selectSmartQuickAddActionPlan,
  selectSmartQuickAddKeys,
} from "../src/utils/adaptiveUi.js";
import { APP_SETUP_PAGE_GROUPS } from "../src/utils/appPersonalizationUtils.js";

assert.deepEqual(
  normalizeQuickAddDestinations({ forge: true, vault: false, ignored: true }),
  { vault: false, wishlist: false, forge: true, tidetradr: false }
);

assert.deepEqual(
  normalizeQuickAddDestinations({ vault: true }),
  { vault: true, wishlist: false, forge: false, tidetradr: false }
);

assert.deepEqual(quickAddDestinationNames({ vault: true, forge: true }), ["Vault", "Forge"]);

const releaseEvent = {
  title: "Chaos Rising Booster Bundle",
  productName: "Chaos Rising Booster Bundle",
  eventType: "Product Release",
  dateKey: "2026-09-18",
  sourceLabel: "Confirmed Release",
  sourceUrl: "https://www.pokemon.com/",
};
const seed = calendarEventToQuickAddSeed(releaseEvent, { vault: true });
assert.equal(seed.itemName, "Chaos Rising Booster Bundle");
assert.equal(seed.destinations.vault, true);
assert.equal(seed.destinations.forge, false);
assert.match(seed.notes, /Confirmed Release/);

const catalogMatch = findQuickAddCatalogMatch([
  { id: "a", name: "Prismatic Evolutions Elite Trainer Box", setName: "Prismatic Evolutions", productType: "Elite Trainer Box" },
  { id: "b", name: "Chaos Rising Booster Bundle", setName: "Mega Evolution", productType: "Booster Bundle" },
], releaseEvent);
assert.equal(catalogMatch.id, "b");

assert.equal(
  buildQuickAddSuccessMessage({
    itemName: "Prismatic Evolutions Booster Bundle",
    entries: [{ destination: "Forge", quantity: 3, purchaserName: "Zena" }],
  }),
  "Prismatic Evolutions Booster Bundle saved to Forge x3 (Zena)."
);

assert.equal(
  buildQuickAddSuccessMessage({
    itemName: "Collector Chest",
    entries: [
      { destination: "Vault", quantity: 1 },
      { destination: "Forge", quantity: 2, purchaserName: "Dillon" },
    ],
  }),
  "Collector Chest saved to Vault x1 and Forge x2 (Dillon)."
);

const collectorState = resolveAdaptiveUiState({ currentRoute: "dashboard" });
const collectorQuickAdd = selectSmartQuickAddKeys(collectorState, { currentPage: "dashboard", forgeAvailable: true });
assert.deepEqual(collectorQuickAdd, ["vault", "scout", "missing", "quickFind"]);
assert.equal(collectorQuickAdd.some((key) => ["forge", "sale", "receipt", "mileage", "expense", "reviewMissing"].includes(key)), false);

const familyState = resolveAdaptiveUiState({
  currentRoute: "dashboard",
  setupPreferences: { purposes: ["collect_pokemon_with_my_family_kids"], enabledToolsets: ["the_spark_kids_program"] },
});
const familyPlan = selectSmartQuickAddActionPlan(familyState, { currentPage: "dashboard", forgeAvailable: true });
assert.deepEqual(familyPlan.visibleKeys, ["vault", "scout", "missing", "spark"]);
assert.deepEqual(familyPlan.overflowKeys, ["quickFind"]);

const sellerState = resolveAdaptiveUiState({
  currentRoute: "forge",
  setupPreferences: { primaryMode: "casual_seller", enabledToolsets: ["forge_seller_tools", "sales_tracking"] },
});
const sellerPlan = selectSmartQuickAddActionPlan(sellerState, { currentPage: "forge", forgeAvailable: true });
assert.deepEqual(sellerPlan.visibleKeys, ["forge", "sale", "receipt", "mileage", "vault", "missing"]);
assert.deepEqual(sellerPlan.overflowKeys, ["scout", "quickFind"]);

const businessState = resolveAdaptiveUiState({
  currentRoute: "forge",
  setupPreferences: { primaryMode: "business_seller", businessTools: "yes_i_need_sales_expenses_mileage_receipts" },
});
const businessPlan = selectSmartQuickAddActionPlan(businessState, { currentPage: "forge", forgeAvailable: true });
assert.deepEqual(businessPlan.visibleKeys, ["forge", "sale", "receipt", "mileage", "vault", "missing"]);
assert.ok(businessPlan.overflowKeys.includes("expense"));
assert.ok(businessPlan.overflowKeys.includes("scout"));
assert.ok(businessPlan.overflowKeys.includes("quickFind"));
assert.ok(businessPlan.visibleKeys.length <= 6);

const adminState = resolveAdaptiveUiState({ currentRoute: "admin", adminToolsVisible: true });
const adminQuickAdd = selectSmartQuickAddKeys(adminState, { currentPage: "admin", forgeAvailable: true });
assert.ok(adminQuickAdd.includes("reviewMissing"));
assert.ok(adminQuickAdd.includes("store"));
assert.equal(collectorQuickAdd.includes("reviewMissing"), false);

const quickAddSetupGroup = APP_SETUP_PAGE_GROUPS.find((group) => group.key === "quickAdd");
const scanAnythingOption = quickAddSetupGroup.options.find((option) => option.key === "quickFind");
assert.equal(scanAnythingOption.label, "Scan Anything");
assert.match(scanAnythingOption.helper, /Search, UPC\/SKU, or manual entry/);

assert.equal(selectSmartQuickAddKeys(collectorState, { currentPage: "scout", forgeAvailable: true })[0], "scout");
assert.equal(selectSmartQuickAddKeys(collectorState, { currentPage: "vault", forgeAvailable: true })[0], "vault");
assert.equal(selectSmartQuickAddKeys(sellerState, { currentPage: "market", forgeAvailable: true })[0], "forge");

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const upcFallbackStart = appSource.indexOf("quick-add-upc-fallback");
assert.ok(upcFallbackStart > 0, "UPC/SKU flow should render a nearby no-results fallback action panel.");
const upcFallbackSource = appSource.slice(upcFallbackStart, upcFallbackStart + 1600);
assert.match(upcFallbackSource, /Search Again/);
assert.match(upcFallbackSource, /Manual Entry/);
assert.match(upcFallbackSource, /Request Missing Item/);
assert.match(appSource, /normalizedUpcQuery\.length > 18/);
assert.match(appSource, /No exact identifier match\. Use Search Again, Manual Entry, or Request Missing Item\./);
assert.match(appSource, /const visibleEntryCount = sellerQuickAddActive \? Math\.max\(6, quickAddPreferencePlan\.maxVisible\) : quickAddPreferencePlan\.maxVisible;/);
assert.match(appSource, /title: "Scan Anything", description: "Search, enter UPC\/SKU, or add manually\."/);
assert.match(appSource, /openQuickAddReviewForProduct\(product, source = "quick-add-search"\)/);
assert.match(appSource, /quickAddDestinationSeed\(sellerDestinationDefault\)/);
assert.match(appSource, /suppressSuggestions\s+emptyMessage="No matches yet\. Try fewer words, UPC, SKU, or set name\."/);
assert.match(appSource, /Scan Card/);
assert.match(appSource, /Scan Binder/);
assert.match(appSource, /Scan Slab/);
assert.match(appSource, /Scan Receipt/);
assert.match(appSource, /add-anything-option--locked/);
assert.match(appSource, /Scout screenshot\/photo review/);
assert.match(appSource, /quickAddScoutScanValidation/);
assert.match(appSource, /scoutScanSourceText/);
assert.match(appSource, /Source text/);
assert.match(appSource, /sourceText/);
assert.match(appSource, /Add the store or store name before saving\./);
assert.match(appSource, /Add observed date\/time or mark the time unknown\./);
assert.match(appSource, /Add at least one item, note, or screenshot\/photo indicator\./);
assert.match(appSource, /scoutScanSaving/);
assert.match(appSource, /Save Scout Report/);
assert.match(appSource, /Scout report saved from Scan Anything\./);
assert.match(appSource, /openScoutReportDetail\(report, \{ fallback: report, focus: "details" \}\)/);
assert.match(appSource, /Scan page of cards/);
assert.match(appSource, /cardScanRows/);
assert.match(appSource, /Add card row/);
assert.match(appSource, /Review this card/);
assert.match(appSource, /Review first filled card/);
assert.match(appSource, /destination: "vault"/);
assert.match(appSource, /Automatic card detection is coming later/);
assert.doesNotMatch(appSource, /OCR is live|automatic OCR is live|AI extraction is live/i);
assert.doesNotMatch(appSource, /Receipt OCR is coming later/);
assert.doesNotMatch(appSource, /Camera scan coming later/);
assert.doesNotMatch(appSource, /Camera scanning and OCR are coming later/);

console.log("Quick Add routing tests passed.");
