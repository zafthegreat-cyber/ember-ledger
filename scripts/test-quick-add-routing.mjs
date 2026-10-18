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
assert.deepEqual(collectorQuickAdd, ["scanCards", "addScoutReport", "scanScreenshot", "addVaultItem", "requestMissingItem"]);
assert.equal(collectorQuickAdd.some((key) => ["uploadReceipt", "addSale", "logMileage", "addExpense", "reviewFlaggedReports"].includes(key)), false);

const familyState = resolveAdaptiveUiState({
  currentRoute: "dashboard",
  setupPreferences: { purposes: ["collect_pokemon_with_my_family_kids"], enabledToolsets: ["the_spark_kids_program"] },
});
const familyPlan = selectSmartQuickAddActionPlan(familyState, { currentPage: "dashboard", forgeAvailable: true });
assert.deepEqual(familyPlan.visibleKeys, ["scanCards", "addScoutReport", "scanScreenshot", "addVaultItem", "buildKidsPack"]);
assert.deepEqual(familyPlan.overflowKeys, ["requestMissingItem"]);

const sellerState = resolveAdaptiveUiState({
  currentRoute: "forge",
  setupPreferences: { primaryMode: "casual_seller", enabledToolsets: ["forge_seller_tools", "sales_tracking"] },
});
const sellerPlan = selectSmartQuickAddActionPlan(sellerState, { currentPage: "forge", forgeAvailable: true });
assert.deepEqual(sellerPlan.visibleKeys, ["uploadReceipt", "addSale", "logMileage", "addInventoryCost", "addVaultItem", "addScoutReport"]);
assert.deepEqual(sellerPlan.overflowKeys, ["requestMissingItem", "scanCards"]);

const businessState = resolveAdaptiveUiState({
  currentRoute: "forge",
  setupPreferences: { primaryMode: "business_seller", businessTools: "yes_i_need_sales_expenses_mileage_receipts" },
});
const businessPlan = selectSmartQuickAddActionPlan(businessState, { currentPage: "forge", forgeAvailable: true });
assert.deepEqual(businessPlan.visibleKeys, ["uploadReceipt", "addSale", "addExpense", "logMileage", "addInventoryCost", "addVaultItem"]);
assert.ok(businessPlan.overflowKeys.includes("addScoutReport"));
assert.ok(businessPlan.overflowKeys.includes("requestMissingItem"));
assert.ok(businessPlan.overflowKeys.includes("scanCards"));
assert.ok(businessPlan.visibleKeys.length <= 6);

const adminState = resolveAdaptiveUiState({ currentRoute: "admin", adminToolsVisible: true });
const adminQuickAdd = selectSmartQuickAddKeys(adminState, { currentPage: "admin", forgeAvailable: true });
assert.ok(adminQuickAdd.includes("reviewFlaggedReports"));
assert.ok(adminQuickAdd.includes("reviewBetaRequests"));
assert.equal(collectorQuickAdd.includes("reviewFlaggedReports"), false);

const quickAddSetupGroup = APP_SETUP_PAGE_GROUPS.find((group) => group.key === "quickAdd");
const scanCardsOption = quickAddSetupGroup.options.find((option) => option.key === "scanCards");
const scanScreenshotOption = quickAddSetupGroup.options.find((option) => option.key === "scanScreenshot");
assert.equal(scanCardsOption.label, "Scan Cards");
assert.equal(scanScreenshotOption.label, "Scan Screenshot");
assert.match(scanScreenshotOption.helper, /Review screenshot text/);

assert.equal(selectSmartQuickAddKeys(collectorState, { currentPage: "scout", forgeAvailable: true })[0], "scanScreenshot");
assert.equal(selectSmartQuickAddKeys(collectorState, { currentPage: "vault", forgeAvailable: true })[0], "scanCards");
assert.equal(selectSmartQuickAddKeys(sellerState, { currentPage: "market", forgeAvailable: true })[0], "searchCard");

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const addFlowSource = fs.readFileSync(new URL("../src/features/deferredViews/AddAnythingContent.jsx", import.meta.url), "utf8");
const sharedNavSource = fs.readFileSync(new URL("../src/components/operations/OperationsUI.jsx", import.meta.url), "utf8");

// The deferred view owns Add markup; App still owns routing, saving, and authority.
assert.match(appSource, /const AddAnythingContent = lazy\(\(\) => import\("\.\/features\/deferredViews\/AddAnythingContent"\)\)/);
assert.match(appSource, /<AddAnythingContent scope=\{\{/);
const upcFallbackStart = addFlowSource.indexOf("quick-add-upc-fallback");
assert.ok(upcFallbackStart > 0, "UPC/SKU flow should render a nearby no-results fallback action panel.");
const upcFallbackSource = addFlowSource.slice(upcFallbackStart, upcFallbackStart + 1600);
assert.match(upcFallbackSource, /Search Again/);
assert.match(upcFallbackSource, /Manual Entry/);
assert.match(upcFallbackSource, /Request Missing Item/);
assert.match(addFlowSource, /normalizedUpcQuery\.length > 18/);
assert.match(addFlowSource, /No exact identifier match\. Use Search Again, Manual Entry, or Request Missing Item\./);
assert.match(appSource, /function renderAddActionSheetContent\(\) \{\s*return renderAddAnythingFlowContent\(\);\s*\}/, "The action sheet should delegate to the active Add flow.");
assert.match(addFlowSource, /key: "scan-listing", title: presentation\.isCollector \? "Scan or review" : "Scan Listing"/);
assert.match(addFlowSource, /key: "scan-listing"[^\n]+onClick: \(\) => setQuickAddPath\("scanAnything"\)/, "Both persona labels retain the existing review-first scan chooser.");
assert.match(addFlowSource, /key: "sell-or-trade"[^\n]+window\.setTimeout\(onOpenSellTrade, 0\)/, "The collector shortcut uses the existing sell/trade destination callback.");
assert.match(addFlowSource, /key: "add-collection-item", title: "Add Collection Item"/);
assert.match(addFlowSource, /overflowEntryOptions\.map\(\(option\) =>/);
assert.match(appSource, /title: "Scan Anything", description: "Search, enter UPC\/SKU, or add manually\."/);
assert.match(appSource, /openQuickAddReviewForProduct\(product, source = "quick-add-search"\)/);
assert.match(addFlowSource, /quick-add-showcase-preview/);
assert.match(addFlowSource, /Review destination and details before anything is saved\./);
assert.match(addFlowSource, /<CollectorShowcaseCard/);
assert.match(appSource, /quickAddDestinationSeed\(sellerDestinationDefault\)/);
assert.match(addFlowSource, /suppressSuggestions\s+emptyMessage="No matches yet\. Try fewer words, UPC, SKU, or set name\."/);
assert.match(addFlowSource, /Scan Card/);
assert.match(addFlowSource, /Scan Binder/);
assert.match(addFlowSource, /Scan Slab/);
assert.match(addFlowSource, /Scan Receipt/);
assert.match(addFlowSource, /add-anything-option--locked/);
assert.match(addFlowSource, /Scout screenshot\/photo review/);
assert.match(appSource, /quickAddScoutScanValidation/);
assert.match(appSource, /scoutScanSourceText/);
assert.match(appSource, /extractTextFromScoutScanImage/);
assert.match(appSource, /window\.TextDetector/);
assert.match(appSource, /buildScoutScanExtractionPatch/);
assert.match(addFlowSource, /Review Scout Scan/);
assert.match(addFlowSource, /We filled what we could\. Review before saving\. Nothing is saved yet\./);
assert.match(addFlowSource, /Re-run Extraction/);
assert.match(addFlowSource, /Browser text extraction and pasted text only prefill this draft/);
assert.match(addFlowSource, /label="Details \/ source text"/);
assert.match(appSource, /sourceText/);
assert.match(addFlowSource, /Text extracted/);
assert.match(addFlowSource, /Paste review/);
assert.match(addFlowSource, /Needs Review/);
assert.match(addFlowSource, /OCR unavailable/);
assert.match(appSource, /Add the store or store name before saving\./);
assert.match(appSource, /Add observed date\/time or mark the time unknown\./);
assert.match(appSource, /Add at least one item, note, or screenshot\/photo indicator\./);
assert.match(appSource, /scoutScanSaving/);
assert.match(addFlowSource, /Save Report/);
assert.match(appSource, /Want to add proof or more details\?/);
assert.match(appSource, /Report could not be saved\. Please review and try again\./);
assert.match(addFlowSource, /openScoutReportDetail\(report, \{ fallback: report, focus: "details" \}\)/);
assert.match(appSource, /ariaLabel: "Open global Add menu".*action: \(\) => openAddActionSheet\("mobile-navigation"\)/);
assert.match(appSource, /<MobileBottomNavigation items=\{mobileBottomTabs\}/);
assert.match(sharedNavSource, /aria-label=\{item\.ariaLabel \|\| item\.label\}/);
assert.match(sharedNavSource, /onClick=\{\(\) => onSelect\?\.\(item\)\}/);
assert.doesNotMatch(appSource, /\{ key: "quickAdd", label: "Add", icon: "plus", center: true/);
assert.match(appSource, /key: "settings", label: "Settings", icon: "settings", target: "settings"/);
assert.match(addFlowSource, /<summary>More<\/summary>/);
assert.match(appSource, /Reset to Recommended/);
assert.match(appSource, /action === "scanScreenshot"/);
assert.match(appSource, /action === "chooseWatchedStore"/);
assert.match(appSource, /action === "reviewFlaggedReports"/);
assert.match(addFlowSource, /Scan page of cards/);
assert.match(addFlowSource, /cardScanRows/);
assert.match(addFlowSource, /Add card row/);
assert.match(addFlowSource, /Review this card/);
assert.match(addFlowSource, /Review first filled card/);
assert.match(appSource, /destination: "vault"/);
assert.match(addFlowSource, /Automatic card detection is coming later/);
for (const [sourceName, source] of [["App", appSource], ["AddAnythingContent", addFlowSource]]) {
  assert.doesNotMatch(source, /OCR is live|automatic OCR is live|AI extraction is live|auto-save OCR/i, `${sourceName} must not claim automated OCR is live.`);
  assert.doesNotMatch(source, /Receipt OCR is coming later/, `${sourceName} must not use the retired receipt OCR copy.`);
  assert.doesNotMatch(source, /Camera scan coming later/, `${sourceName} must not use the retired camera scan copy.`);
  assert.doesNotMatch(source, /Camera scanning and OCR are coming later/, `${sourceName} must not conflate camera scanning and text extraction.`);
}

console.log("Quick Add routing tests passed.");
