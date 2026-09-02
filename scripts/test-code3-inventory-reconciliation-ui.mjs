import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../src/features/purchaseReceiving/PurchaseReceivingPage.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/features/purchaseReceiving/purchase-receiving.css", import.meta.url), "utf8");
const saleScreen = fs.readFileSync(new URL("../src/features/flipScout/screens/records/SalesScreen.jsx", import.meta.url), "utf8");
const dashboardScreen = fs.readFileSync(new URL("../src/features/flipScout/screens/DashboardScreen.jsx", import.meta.url), "utf8");
const resultsScreen = fs.readFileSync(new URL("../src/features/flipScout/screens/records/ResultsScreen.jsx", import.meta.url), "utf8");
const businessWorkspace = fs.readFileSync(new URL("../src/pages/EverydayWorkspaces.jsx", import.meta.url), "utf8");
let assertions = 0;
const has = (source, pattern, message) => { assert.match(source, pattern, message); assertions += 1; };
const lacks = (source, pattern, message) => { assert.doesNotMatch(source, pattern, message); assertions += 1; };

for (const copy of [
  "Historical Reconciliation",
  "Original Historical State",
  "Proposed Correction",
  "Affected Records",
  "Accounting & Inventory Consequences",
  "Review Historical Effect",
  "Confirm Reconciliation",
  "Confirm COGS Adjustment",
  "Confirm Transfer Reconciliation",
  "Confirm Reconciliation Reversal",
  "Review Reconciliation Reversal",
  "Latest reconciliation to reverse",
  "Inventory Reconciliation Candidate != Historical Mutation",
]) has(page, new RegExp(copy), `${copy} is explicit`);

has(page, /function reconciliationProposalFromForm\(candidate = correctionCandidate\)/, "historical review builds a dedicated bounded reconciliation proposal");
for (const mapping of [
  "COGS_RECONCILIATION",
  "SALE_PRODUCT_RECONCILIATION",
  "RETURN_AFTER_SALE_RECONCILIATION",
  "LOT_PROVENANCE_RECONCILIATION",
  "TRANSFER_PROVENANCE_RECONCILIATION",
  "PRIOR_CORRECTION_REVERSAL",
]) has(page, new RegExp(mapping), `${mapping} is mapped explicitly rather than passing a correction category to the reconciliation gateway`);
has(page, /service\.previewInventoryReconciliation\(selected\.id, reconciliationProposalFromForm\(\)\)/, "preview uses the reconciliation category contract and trusted item reference");
has(page, /service\.confirmInventoryReconciliation\(selected\.id, reconciliationCandidate\.candidateId, \{[\s\S]*expectedVersion: reconciliationCandidate\.expectedVersion,[\s\S]*proposal,/, "confirmation supplies identity, reviewed version, and proposal for authoritative re-derivation");
has(page, /proposal\.reversesReconciliationEventId = form\.reversesReconciliationEventId/, "only a reconciliation reversal sends its canonical event reference");
has(page, /listInventoryReconciliationEvents\?\.\(\) \|\| \[\]/, "canonical reconciliation history reloads through the service without becoming browser authority");
has(page, /setReconciliationCandidate\(null\)/, "form and lifecycle changes invalidate stale historical previews");
has(page, /actionInFlightRef\.current/, "same-turn duplicate submissions remain synchronously guarded");
has(page, /Number\(candidate\?\.soldQuantity \|\| 0\) > 0[\s\S]*RETURN_TO_RETAILER[\s\S]*PARTIAL_RETURN/, "returns after a Sale enter historical review even when the physically available quantity is otherwise valid");
has(page, /proposal\.quantity = candidate\?\.availableQuantity/, "a full return re-derives its physically available quantity instead of trusting browser input");
has(page, /aria-busy=\{busy \? "true" : "false"\}/, "pending reconciliation state is announced");
has(page, /disabled=\{busy \|\| !candidate\.eligible\}/, "blocked and pending reconciliation cannot be confirmed");
has(page, /Confirming Reconciliation…/, "pending confirmation has explicit copy");

for (const field of [
  "saleCogsEffectMinorUnits",
  "remainingInventoryCostEffectMinorUnits",
  "costEffectMinorUnits",
  "quantityEffect",
  "originalCogsMinorUnits",
  "priorEffectiveCogsMinorUnits",
  "correctedCogsMinorUnits",
  "cogsDeltaMinorUnits",
  "originalProductReference",
  "correctedProductReference",
]) has(page, new RegExp(field), `${field} is visible only as a reviewed projection`);

has(page, /Completed Sales and Transfers remain immutable/, "owner-facing copy preserves completed history");
has(page, /Original completed records remain unchanged/, "preview does not imply historical replacement");
has(page, /canonical managed Transfer authority is not available/, "transfer reconciliation fails closed honestly");
has(page, /No Transfer or Inventory history can be changed from this preview/, "blocked transfer preview has zero mutation authority");
has(page, /Historical Sale, Transfer, Purchase, Receiving, creation, and prior correction records remain append-only/, "all upstream and downstream history remains explicit");

const reconciliationComponent = page.slice(page.indexOf("function HistoricalReconciliationPreview"), page.indexOf("function InventoryCorrectionDialog"));
lacks(reconciliationComponent, />\s*(?:Apply|Fix|Done)\s*</, "reconciliation actions use no ambiguous mutation labels");
lacks(reconciliationComponent, /fetch\s*\(|WebSocket\s*\(|localStorage|sessionStorage|indexedDB/i, "reconciliation UI has no network or persistence client");
lacks(reconciliationComponent, /NM|NEAR_MINT|LIGHTLY_PLAYED|GRADING_COMPANY|CERTIFICATION/i, "Raw and Graded authority remains deferred");

has(saleScreen, /getSaleReportingProjection\(sale, state\)/, "Sales render from the validated append-only accounting projection");
has(saleScreen, /productRelationshipAdjusted \? reporting\.originalProductReference : item\?\.name/, "historical Sale heading cannot be silently replaced by the current Inventory product name");
for (const label of ["Original COGS", "COGS adjustment", "Effective COGS", "Historical product", "Current reporting relationship"]) {
  has(saleScreen, new RegExp(label), `${label} remains explicit in Sale reporting`);
}
has(saleScreen, /The Sale remains unchanged/, "Sales UI states the immutable-history boundary");
has(dashboardScreen, /realizedCogsAdjustment/, "dashboard discloses append-only COGS adjustment context");
has(resultsScreen, /effective recorded costs/, "actual-versus-projected results identify effective reporting costs");
has(businessWorkspace, /getSaleReportingProjection/, "Business Sales and Reports reuse the canonical reporting projection");
has(businessWorkspace, /Original cost of goods sold/, "Business Sale detail preserves original COGS");
has(businessWorkspace, /Append-only COGS adjustment/, "Business Sale detail identifies the reporting delta separately");

has(css, /\.inventory-reconciliation-preview/, "reconciliation preview has a dedicated layout");
has(css, /\.inventory-reconciliation-state-flow[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/, "desktop state comparison is explicit");
has(css, /@media \(max-width: 700px\)[\s\S]*\.inventory-reconciliation-state-flow \{ grid-template-columns: minmax\(0, 1fr\); \}/, "historical comparison stacks safely on mobile");
has(css, /overflow-wrap:\s*anywhere/, "long stable references cannot force horizontal overflow");
has(css, /min-height:\s*44px/, "existing tap target floor remains intact");
has(css, /prefers-reduced-motion/, "reduced motion remains supported");
has(css, /:focus-visible/, "keyboard focus remains visible");

console.log(`Code 3 Inventory Reconciliation UI: ${assertions} assertions passed.`);
