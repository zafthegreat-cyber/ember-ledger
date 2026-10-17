import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../src/features/purchaseReceiving/PurchaseReceivingPage.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/features/purchaseReceiving/purchase-receiving.css", import.meta.url), "utf8");
const business = fs.readFileSync(new URL("../src/pages/EverydayWorkspaces.jsx", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/features/purchaseReceiving/service.js", import.meta.url), "utf8");
const asyncBusinessScreens = Object.freeze({
  deals: fs.readFileSync(new URL("../src/features/flipScout/screens/DealsScreen.jsx", import.meta.url), "utf8"),
  auctions: fs.readFileSync(new URL("../src/features/flipScout/screens/AuctionsScreen.jsx", import.meta.url), "utf8"),
  rules: fs.readFileSync(new URL("../src/features/flipScout/screens/SearchRulesScreen.jsx", import.meta.url), "utf8"),
  purchases: fs.readFileSync(new URL("../src/features/flipScout/screens/records/PurchasesInventoryScreen.jsx", import.meta.url), "utf8"),
  expenses: fs.readFileSync(new URL("../src/features/flipScout/screens/records/ExpensesMileageScreen.jsx", import.meta.url), "utf8"),
  sales: fs.readFileSync(new URL("../src/features/flipScout/screens/records/SalesScreen.jsx", import.meta.url), "utf8"),
  appraiser: fs.readFileSync(new URL("../src/features/flipScout/screens/AppraiserScreen.jsx", import.meta.url), "utf8"),
});

let assertions = 0;
const match = (value, pattern, message) => { assert.match(value, pattern, message); assertions += 1; };
const noMatch = (value, pattern, message) => { assert.doesNotMatch(value, pattern, message); assertions += 1; };

match(page, /Confirm Inventory Creation/, "explicit mutation copy is present");
match(page, /Inventory Creation Candidate != Inventory/);
match(page, /data-inventory-writer="owner-confirmed-only"/);
match(page, /service\.previewInventoryCreation/);
match(page, /service\.confirmInventoryCreation/);
match(page, /Quantity and cost are re-derived/);
match(page, /disabled=\{busy \|\| !candidate\.eligible\}/);
match(page, /Resolved product reference/);
match(page, /Damaged/);
noMatch(page, />Apply Inventory</i);
noMatch(page, />Create All Inventory</i);
noMatch(page, /automaticInventoryCreation:\s*true/);
noMatch(page, /VITE_|fetch\(|WebSocket\(/);

match(service, /assertOwner\(\);\s*assertSafePurchaseReceivingInput\(input\)/s, "OWNER gate precedes browser input processing");
match(service, /allowed = new Set\(\["expectedVersion", "review"\]\)/);
match(service, /deriveCurrentCandidate/);
match(service, /allowed = new Set\(\["expectedVersion", "review"\]\)/, "browser quantities and costs are absent from the Inventory confirmation allowlist");

match(business, /record\.provenanceManaged === true/);
match(business, /append-only correction workflow/);
match(business, /inventoryRecordCostMajorUnits/, "Business Inventory renders exact minor-unit provenance through the shared projection helper");
match(business, /suggestedInventorySaleCogsMajorUnits/, "Business Sales consumes deterministic unit-cost slices");
match(css, /@media \(max-width: 700px\)/);
match(css, /min-height: 44px/);
match(css, /prefers-reduced-motion/);
match(css, /inventory-creation-review/);

for (const [screen, source] of Object.entries(asyncBusinessScreens).filter(([name]) => name !== "purchases")) {
  match(source, /await onSave\(/, `${screen} waits for the repository result before reporting success`);
  noMatch(source, /^(?!.*await onSave\().*\bonSave\(/m, `${screen} has no fire-and-forget Business save caller`);
}
match(asyncBusinessScreens.purchases, /const saved = await action\(\)/, "Purchase, lot, and unmanaged Inventory forms await their guarded save action");
for (const [screen, source] of Object.entries(asyncBusinessScreens).filter(([name]) => name !== "appraiser")) {
  match(source, /saveInFlightRef\.current/, `${screen} synchronously rejects a queued duplicate submission`);
  match(source, /disabled=\{saving\}|canContinue=\{canContinue && !saving\}/, `${screen} disables submit while storage is pending`);
}
match(business, /saveInFlightRef\.current/, "the shared Business form synchronously rejects a queued duplicate submission");
match(business, /canContinue=\{canContinue && !saving\}/, "the shared Business form disables submit while storage is pending");
match(business, /const cancel = \(\) => \{\s*if \(saveInFlightRef\.current\) return;/s, "the shared Business cancel path cannot clear a pending form");
for (const screen of ["deals", "auctions", "rules", "purchases", "expenses", "sales"]) {
  match(asyncBusinessScreens[screen], /disabled=\{saving\}[^>]*onClick=\{\(\) => \{ if \(saveInFlightRef\.current\) return;/, `${screen} cannot reset its form while a save is pending`);
}
match(asyncBusinessScreens.purchases, /disabled=\{saving\} onClick=\{onClose\}>Cancel/, "Inventory cancel remains disabled until its save settles");
match(asyncBusinessScreens.deals, /disabled=\{saving\} onClick=\{\(\) => onAnalyze/, "Deal analysis cannot navigate away from a pending save");
match(asyncBusinessScreens.appraiser, /disabled=\{isSaving \|\| index > step\}/, "Appraiser workflow navigation remains stable while saving");
match(asyncBusinessScreens.deals, /await onDelete\("deals"/, "Deal detail waits for confirmed deletion before closing");
match(asyncBusinessScreens.auctions, /await onDelete\("auctions"/, "Auction detail waits for confirmed deletion before closing");
match(asyncBusinessScreens.appraiser, /if \(!saved\) throw new Error/, "analysis save cannot report success after a failed repository result");

console.log(`Code 3 Inventory Creation UI: ${assertions} assertions passed.`);
