import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/features/purchaseReceiving/accountantReview/AccountantReviewPanel.jsx", import.meta.url), "utf8");
const moneyDisplay = await readFile(new URL("../src/features/purchaseReceiving/accountantReview/moneyDisplay.js", import.meta.url), "utf8");
const css = await readFile(new URL("../src/features/purchaseReceiving/accountantReview/accountant-review.css", import.meta.url), "utf8");
let assertions = 0;
const has = (source, pattern, message) => { assert.match(source, pattern, message); assertions += 1; };
const lacks = (source, pattern, message) => { assert.doesNotMatch(source, pattern, message); assertions += 1; };

has(panel, /data-accountant-review="read-only"/, "Accountant Review exposes a stable read-only QA identity");
has(panel, /data-accounting-mutation="false"/, "Accountant Review explicitly exposes zero accounting mutation authority");
has(panel, /data-filing-status="FILING_STATUS_UNKNOWN"/, "filing status remains explicitly unknown");
has(panel, /eyebrow="Read-only accounting review"/, "owner-facing heading identifies the read-only boundary");
has(panel, /<StatusBadge tone="neutral">Read only<\/StatusBadge>/, "read-only state is text, not color alone");
has(panel, /className="accountant-review-summary" role="region"/, "the named summary is an explicit accessible region");

for (const invariant of [
  "Original Transaction Period != Correction Period",
  "Original COGS != Reconciliation Adjustment",
  "Historical Record != Current Effective Projection",
  "Accountant Review != Accounting Mutation",
]) has(panel, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${invariant} remains explicit`);

for (const label of [
  "Prior-period adjustments",
  "Current-period adjustments",
  "Net COGS adjustment",
  "Sales affected",
  "Lots affected",
  "Prior-year items",
  "Items needing review",
  "Items shown",
  "Original COGS",
  "COGS adjustment",
  "Effective COGS",
  "Original profit",
  "Profit adjustment",
  "Effective profit",
  "Original lot cost",
  "Effective lot cost",
  "Current projection including later corrections",
  "Filing status unknown",
  "Physical Inventory moved",
]) has(panel, new RegExp(label), `${label} is explicit`);

for (const domainField of [
  "taxReviewFlag",
  "reconciliationAdjustmentMinorUnits",
  "inventoryLotId",
  "currentEffectiveCogsMinorUnits",
  "movementClassification",
  "physicalInventoryMoved",
  "eventId",
  "correctionDate",
  "cogsAdjustmentMinorUnits",
  "priorEffectiveCogsMinorUnits",
  "resultingEffectiveCogsMinorUnits",
  "originalRecordedCogsMinorUnits",
  "totalEffectiveAdjustmentMinorUnits",
  "soldQuantity",
  "latestReconciliationDate",
]) has(panel, new RegExp(domainField), `${domainField} is aligned with the normalized preview contract`);
has(panel, /original=\{priorEffectiveCogs\}/, "each event equation begins with that event's prior effective COGS");
has(panel, /effective=\{resultingEffectiveCogs\}/, "each event equation ends with that event's resulting effective COGS");
has(panel, /Prior effective COGS/, "event-level COGS is not mislabeled as the immutable original");
has(panel, /This adjustment/, "event-level signed delta is labeled as the current event only");
has(panel, /Resulting effective COGS/, "event-level result is distinct from the final aggregate projection");
has(panel, /Combined currency total/, "mixed currencies are explicitly not aggregated");
has(panel, /Exact totals remain separated by currency/, "currency-separated summary behavior is explained");
has(panel, /summaryForVisibleItems/, "filtered summary values are recalculated from visible review items");
has(panel, /summary totals above include only the review items shown/i, "filtered aggregate scope is explicit");
has(panel, /!filtersActive && visiblePeriods\.length/, "whole-period projections are hidden while row filters are active");
has(panel, /Clear filters to view complete month, quarter, and year projections/, "period-summary filtering cannot misrepresent hidden reconciliation effects");
has(panel, /Net proceeds used for profit/, "profit authority is distinguished from gross Sale revenue");
has(panel, /Prior effective product/, "event rows distinguish the immediately prior product from immutable Sale-time identity");
has(panel, /Original recorded product/, "Sale review keeps original Sale-time identity visible");
has(panel, /Current effective product/, "product reclassification keeps the current reporting relationship visible");
has(panel, /event\.originalProductReference/, "reconciliation chains expose the original product relationship");
has(panel, /event\.correctedProductReference/, "reconciliation chains expose the corrected product relationship");
has(panel, /Later Inventory adjustments/, "later physical disposition and correction effects remain visible beside reconciliation-only effects");
has(panel, /Remaining Inventory cost effect/, "physical returns show their exact Inventory cost effect without calling it COGS");
has(panel, /Realized and remaining effects reconcile to the reconciliation-only effect/, "lot conservation copy does not conflate reconciliation with later Inventory effects");
has(panel, /included in the total effective adjustment/, "the current lot total names its separate later-adjustment component");
for (const optionKey of ["years", "quarters", "months", "retailers", "productReferences", "saleIds", "categories", "severities"]) {
  has(panel, new RegExp(`"${optionKey}"`), `${optionKey} consumes the domain filter option shape`);
}
has(panel, /\["months", "quarters", "years"\]\.flatMap/, "period summary groups consume the domain month, quarter, and year collections");

for (const key of ["year", "quarter", "month", "retailer", "productReference", "saleId", "category", "severity"]) {
  has(panel, new RegExp(`"${key}"`), `${key} has an ephemeral local filter`);
}
has(panel, /<fieldset className="accountant-review-filters">/, "filters use a semantic fieldset");
has(panel, /<legend>Filter Accountant Review<\/legend>/, "filters have a visible legend");
has(panel, /Clear Filters/, "the only state-changing control clears ephemeral filters");
has(panel, /setFilters\(next\)/, "filter state remains component-local");
for (const group of ["Needs Review", "Prior Year", "Prior Quarter", "Prior Month", "Current Month"]) {
  has(panel, new RegExp(group), `${group} has a bounded read-only grouping label`);
}

has(panel, /may warrant accountant review/i, "prior-period wording remains cautious");
has(panel, /not tax or legal conclusions/i, "review levels are not presented as professional conclusions");
has(panel, /does not infer filing status or provide tax treatment/i, "filing and tax treatment are explicitly not inferred");
has(panel, /reconciliation timestamps use the UTC calendar date/i, "the current reporting-period date basis is disclosed without claiming an owner-business time zone");
has(panel, /The historical Sale remains unchanged/, "Sale history remains distinct from effective reporting");
has(panel, /original historical snapshot remains preserved/i, "period summaries preserve original snapshots");
has(panel, /data-value-basis="ORIGINAL_RECORDED"/, "original recorded values retain a distinct visible basis");
has(panel, /data-value-basis="CURRENT_EFFECTIVE"/, "current effective values retain a distinct visible basis");

for (const forbidden of [
  /Post Adjustment/i,
  /Journal Entry/i,
  /Book Entry/i,
  /Amend Tax Return/i,
  /Mark Deductible/i,
  /File Return/i,
  /Sync QuickBooks/i,
  /Tax error/i,
  /Tax violation/i,
  /Must amend/i,
  /IRS requires/i,
  /<textarea/i,
  /Export Preview/i,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket\s*\(/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/i,
  /confirmInventory/i,
  /confirmPurchase/i,
  /confirmReconciliation/i,
  /repository\.(?:save|write|update|create)/i,
]) lacks(panel, forbidden, "Accountant Review contains no accounting, tax, storage, network, or business mutation path");

has(css, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\)/, "summary and review cards adapt without a desktop-only table");
has(css, /min-width:\s*0/, "review content can shrink inside responsive grids");
has(css, /min-height:\s*44px/, "filter targets meet the mobile target floor");
has(css, /font-variant-numeric:\s*tabular-nums/, "exact-money comparisons align numerically");
has(css, /overflow-wrap:\s*anywhere/, "long references cannot force horizontal overflow");
has(css, /@media \(max-width:\s*700px\)/, "mobile layout has a dedicated breakpoint");
has(css, /\.accountant-review-money-flow \{ grid-template-columns:\s*minmax\(0, 1fr\); \}/, "money comparisons stack on mobile");
has(css, /:focus-visible/, "keyboard focus remains visible");
has(css, /@media \(prefers-reduced-motion:\s*reduce\)/, "reduced motion is respected");
has(css, /transition:\s*none\s*!important/, "transitions are disabled for reduced motion");

has(moneyDisplay, /formatMoneyForDisplay/, "money display reuses the shared exact-money formatter");
has(moneyDisplay, /BigInt\(minorUnits\)/, "signed display takes magnitude without floating-point division");
lacks(moneyDisplay, /\/\s*100/, "accounting display never divides safe integer minor units through Number arithmetic");

console.log(`Code 3 Accountant Review UI contract: ${assertions} assertions passed.`);
