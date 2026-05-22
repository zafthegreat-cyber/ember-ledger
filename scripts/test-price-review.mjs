import assert from "node:assert/strict";

import {
  buildMarketValueReviewPatch,
  buildPlannedPriceReviewPatch,
  buildPriceReviewFields,
  formatPriceDisplay,
  priceValueForRole,
} from "../src/utils/pricingReliabilityUtils.js";
import {
  buildEmberAssistContext,
  buildEmberAssistFallbackResponse,
} from "../src/utils/emberAssist.js";

const money = (value) => `$${Number(value).toFixed(2)}`;
const now = new Date("2026-05-21T12:00:00.000Z");

const manualFallbackItem = {
  id: "manual-1",
  name: "Manual UPC item",
  barcode: "0820650854109",
  unitCost: 24,
  marketPrice: 35,
  marketValueSource: "manual",
  marketPriceReviewedAt: "2026-05-20T00:00:00.000Z",
  msrpPrice: 29.99,
  salePrice: 42,
};

const fields = buildPriceReviewFields(manualFallbackItem, { context: "forge", now, moneyFormatter: money });
assert.equal(fields.find((field) => field.role === "cost").displayValue, "$24.00");
assert.equal(fields.find((field) => field.role === "msrp").displayValue, "$29.99");
assert.equal(fields.find((field) => field.role === "market").confidence, "Manual");
assert.equal(fields.find((field) => field.role === "planned").displayValue, "$42.00");
assert.equal(priceValueForRole(manualFallbackItem, "market"), 35);
assert.equal(priceValueForRole(manualFallbackItem, "planned"), 42);

const missingFields = buildPriceReviewFields({ id: "missing" }, { context: "vault", now, moneyFormatter: money });
assert.equal(missingFields.find((field) => field.role === "market").displayValue, "Market value missing");
assert.equal(missingFields.find((field) => field.role === "market").confidence, "Missing");
assert.notEqual(formatPriceDisplay(null, { moneyFormatter: money }), "$0.00");

const staleFields = buildPriceReviewFields(
  { id: "stale", marketPrice: 18, marketValueSource: "catalog", lastPriceChecked: "2026-01-01T00:00:00.000Z" },
  { context: "vault", now, moneyFormatter: money }
);
assert.equal(staleFields.find((field) => field.role === "market").confidence, "Stale");

const marketPatch = buildMarketValueReviewPatch(manualFallbackItem, 47.5, {
  note: "Checked recent comps",
  changedAt: "2026-05-21T12:00:00.000Z",
});
const patchedMarketItem = { ...manualFallbackItem, ...marketPatch };
assert.equal(patchedMarketItem.marketPrice, 47.5);
assert.equal(patchedMarketItem.marketValueSource, "manual");
assert.equal(patchedMarketItem.marketPriceConfidence, "Manual");
assert.equal(patchedMarketItem.barcode, "0820650854109", "Manual market review should not drop UPC/barcode context");
assert.match(patchedMarketItem.priceReviewNote, /Checked recent comps/);

const plannedPatch = buildPlannedPriceReviewPatch(manualFallbackItem, 52, {
  note: "Ready for local sale",
  changedAt: "2026-05-21T12:30:00.000Z",
});
assert.equal(plannedPatch.salePrice, 52);
assert.equal(plannedPatch.plannedSalePriceSource, "manual");
assert.equal(plannedPatch.plannedSalePriceConfidence, "Manual");

const manualAnswer = buildEmberAssistFallbackResponse(
  "What does manual price mean?",
  buildEmberAssistContext({ activeTab: "inventory" })
);
assert.match(manualAnswer.answer, /user or admin entered/i);
assert.match(manualAnswer.answer, /not look like a live guaranteed market price/i);

const staleAnswer = buildEmberAssistFallbackResponse(
  "What does stale price mean?",
  buildEmberAssistContext({ activeTab: "vault" })
);
assert.match(staleAnswer.answer, /reviewed/i);

const exactValueAnswer = buildEmberAssistFallbackResponse(
  "Can Ember & Tide tell me the exact value?",
  buildEmberAssistContext({ activeTab: "vault" })
);
assert.match(exactValueAnswer.answer, /cannot promise an exact value/i);
assert.doesNotMatch(exactValueAnswer.answer, /guaranteed/i);

const separationAnswer = buildEmberAssistFallbackResponse(
  "What is the difference between MSRP, market value, and planned sale price?",
  buildEmberAssistContext({ activeTab: "inventory" })
);
assert.match(separationAnswer.answer, /MSRP, market value, and planned sale price are separate/i);

console.log("Price review tests passed.");
