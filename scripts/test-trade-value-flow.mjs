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

const invalid = validateTradeDraft({ sourceItemId: "", receivedName: "" }, null);
assert.equal(invalid.ok, false);
assert.match(invalid.errors.sourceItemId, /trading away/i);
assert.match(invalid.errors.receivedName, /receive/i);

const favorable = buildTradeComparison(normalized, vaultItem, { moneyFormatter: (value) => `$${Number(value).toFixed(2)}` });
assert.equal(favorable.tone, "fair");
assert.equal(favorable.outgoingLabel, "$120.00");
assert.equal(favorable.receivedLabel, "$125.00");

const caution = buildTradeComparison({ ...normalized, receivedValue: "45" }, vaultItem);
assert.equal(caution.tone, "caution");

const record = buildTradeHistoryRecord(normalized, vaultItem, { id: "trade-test", now: "2026-05-31T12:00:00.000Z" });
assert.equal(record.id, "trade-test");
assert.equal(record.sourceItemId, "vault-charizard");
assert.equal(record.receivedName, "Prismatic Evolutions Booster Bundle");
assert.equal(record.inventoryMutation, "none", "trade history must not mutate inventory records");
assert.equal(record.outgoingValue, 120);
assert.equal(record.receivedValue, 125);

console.log("Trade value flow tests passed.");
