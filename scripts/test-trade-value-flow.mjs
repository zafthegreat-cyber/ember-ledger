import assert from "node:assert/strict";

import {
  buildTradeComparison,
  buildTradeHistoryRecord,
  estimateTradeItemValue,
  normalizeTradeDraft,
  validateTradeDraft,
} from "../src/utils/tradeValueUtils.js";

const vaultItem = {
  id: "vault-charizard",
  name: "Charizard ex",
  marketPrice: 120,
  quantity: 1,
};

assert.equal(estimateTradeItemValue(vaultItem).totalValue, 120);
assert.equal(estimateTradeItemValue({ name: "Cost only", unitCost: 12 }, 2).totalValue, 24);

const normalized = normalizeTradeDraft({
  sourceItemId: "vault-charizard",
  outgoingQuantity: "1",
  receivedName: "Prismatic Evolutions Booster Bundle",
  receivedType: "Sealed",
  receivedQuantity: "2",
  receivedValue: "62.50",
});
assert.equal(normalized.receivedQuantity, 2);
assert.equal(normalized.receivedValue, 62.5);

const manualTrade = normalizeTradeDraft({
  outgoingName: "Binder lot with duplicate holos",
  outgoingValue: "35",
  outgoingCondition: "Mixed binder condition",
  receivedName: "Sealed booster bundle",
  receivedType: "Sealed",
  receivedValue: "44",
  tradeDate: "2026-06-09",
});
assert.equal(manualTrade.sourceKind, "");
assert.equal(manualTrade.outgoingName, "Binder lot with duplicate holos");
assert.equal(manualTrade.outgoingValue, 35);
assert.equal(manualTrade.tradeDate, "2026-06-09");

const invalid = validateTradeDraft({ sourceItemId: "", receivedName: "" }, null);
assert.equal(invalid.ok, false);
assert.match(invalid.errors.sourceItemId, /traded away/i);
assert.match(invalid.errors.receivedName, /receive/i);

const validManual = validateTradeDraft(manualTrade, null);
assert.equal(validManual.ok, true, "manual trade should not require a saved Vault/Forge item");

const favorable = buildTradeComparison(normalized, vaultItem, { moneyFormatter: (value) => `$${Number(value).toFixed(2)}` });
assert.equal(favorable.tone, "fair");
assert.equal(favorable.resultLabel, "Even Trade");
assert.equal(favorable.outgoingLabel, "$120.00");
assert.equal(favorable.receivedLabel, "$125.00");

const caution = buildTradeComparison({ ...normalized, receivedValue: "45" }, vaultItem);
assert.equal(caution.tone, "caution");
assert.equal(caution.resultLabel, "Value Lost");

const manualGain = buildTradeComparison(manualTrade, null, { moneyFormatter: (value) => `$${Number(value).toFixed(2)}` });
assert.equal(manualGain.tone, "favorable");
assert.equal(manualGain.resultLabel, "Value Gained");
assert.equal(manualGain.outgoingLabel, "$35.00");
assert.equal(manualGain.receivedLabel, "$44.00");

const missingValue = buildTradeComparison({ outgoingName: "Mystery lot", receivedName: "Unknown card" }, null);
assert.equal(missingValue.tone, "needs-review");
assert.equal(missingValue.resultLabel, "Unknown value");
assert.equal(missingValue.differenceLabel, "Needs value");

const record = buildTradeHistoryRecord(normalized, vaultItem, { id: "trade-test", now: "2026-05-31T12:00:00.000Z" });
assert.equal(record.id, "trade-test");
assert.equal(record.sourceItemId, "vault-charizard");
assert.equal(record.receivedName, "Prismatic Evolutions Booster Bundle");
assert.equal(record.inventoryMutation, "none", "trade history must not mutate inventory records");
assert.equal(record.outgoingValue, 120);
assert.equal(record.receivedValue, 125);
assert.equal(record.resultLabel, "Even Trade");

const manualRecord = buildTradeHistoryRecord(manualTrade, null, { id: "manual-trade-test", now: "2026-06-09T12:00:00.000Z" });
assert.equal(manualRecord.sourceKind, "manual");
assert.equal(manualRecord.sourceItemName, "Binder lot with duplicate holos");
assert.equal(manualRecord.outgoingCondition, "Mixed binder condition");
assert.equal(manualRecord.tradeDate, "2026-06-09");
assert.equal(manualRecord.resultLabel, "Value Gained");
assert.equal(manualRecord.inventoryMutation, "none", "manual trade history must not mutate inventory records");

console.log("Trade value flow tests passed.");
