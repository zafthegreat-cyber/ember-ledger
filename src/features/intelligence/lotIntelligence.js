import {
  ANALYSIS_METHODOLOGY,
  INTELLIGENCE_CONFIDENCE,
  LOT_ITEM_CERTAINTY,
} from "./constants.js";
import { evaluateConfidence } from "./confidence.js";
import {
  addMoney,
  assertMoney,
  assertSameCurrency,
  calculateBasisPointAmount,
  createMoney,
  subtractMoney,
} from "./money.js";

function normalizeItem(value, index, currency, defaultUnderlyingSourceId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`items[${index}] must be an object.`);
  const certainty = String(value.certainty || LOT_ITEM_CERTAINTY.UNKNOWN).toUpperCase();
  if (!Object.values(LOT_ITEM_CERTAINTY).includes(certainty)) throw new Error(`items[${index}].certainty is unsupported.`);
  const quantity = Number(value.quantity ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) throw new Error(`items[${index}].quantity is invalid.`);
  const values = {};
  for (const key of ["conservativeValueEach", "expectedValueEach", "optimisticValueEach"]) {
    values[key] = value[key] ? assertMoney(value[key], { field: `items[${index}].${key}` }) : createMoney(0, currency);
  }
  assertSameCurrency(Object.values(values), `items[${index}]`);
  const sellThroughBasisPoints = value.sellThroughBasisPoints ?? (certainty === LOT_ITEM_CERTAINTY.IDENTIFIED ? 8_500 : certainty === LOT_ITEM_CERTAINTY.PROBABLE ? 6_000 : 0);
  if (!Number.isSafeInteger(sellThroughBasisPoints) || sellThroughBasisPoints < 0 || sellThroughBasisPoints > 10_000) {
    throw new Error(`items[${index}].sellThroughBasisPoints is invalid.`);
  }
  const confidence = String(value.confidence || INTELLIGENCE_CONFIDENCE.LOW).toUpperCase();
  if (!Object.values(INTELLIGENCE_CONFIDENCE).includes(confidence)) {
    throw new Error(`items[${index}].confidence is unsupported.`);
  }
  return Object.freeze({
    itemId: String(value.itemId || `lot-item-${index + 1}`),
    label: String(value.label || "Unidentified item"),
    certainty,
    quantity,
    ...values,
    sellThroughBasisPoints,
    conditionUncertain: Boolean(value.conditionUncertain),
    duplicate: Boolean(value.duplicate),
    confidence,
    sourceId: String(value.sourceId || defaultUnderlyingSourceId),
    underlyingSourceId: String(value.underlyingSourceId || value.sourceId || defaultUnderlyingSourceId),
  });
}

function multiplyMoney(money, quantity, field) {
  const normalized = assertMoney(money, { field });
  const minorUnits = normalized.minorUnits * quantity;
  if (!Number.isSafeInteger(minorUnits)) throw new Error(`${field} total exceeds safe integer precision.`);
  return createMoney(minorUnits, normalized.currency);
}

export function analyzeMultiItemLot(input = {}) {
  const currency = String(input.currency || "USD").toUpperCase();
  const defaultUnderlyingSourceId = String(input.underlyingSourceId || input.sourceId || "lot-input");
  const items = (Array.isArray(input.items) ? input.items : []).map((item, index) => normalizeItem(item, index, currency, defaultUnderlyingSourceId));
  const ownerBulkValue = input.ownerBulkValue ? assertMoney(input.ownerBulkValue, { field: "ownerBulkValue" }) : null;
  const burdens = ["shippingBurden", "laborBurden", "handlingBurden"].map((key) => (
    input[key] ? assertMoney(input[key], { field: key }) : createMoney(0, currency)
  ));
  assertSameCurrency([
    ...items.flatMap((item) => [item.conservativeValueEach, item.expectedValueEach, item.optimisticValueEach]),
    ownerBulkValue,
    ...burdens,
  ].filter(Boolean), "lot");

  const totals = items.reduce((result, item) => {
    if (item.certainty === LOT_ITEM_CERTAINTY.UNKNOWN) return result;
    const conservative = multiplyMoney(item.conservativeValueEach, item.quantity, `items.${item.itemId}.conservative`);
    const expectedRetail = multiplyMoney(item.expectedValueEach, item.quantity, `items.${item.itemId}.expected`);
    const optimistic = multiplyMoney(item.optimisticValueEach, item.quantity, `items.${item.itemId}.optimistic`);
    const expectedSellable = calculateBasisPointAmount(expectedRetail, item.sellThroughBasisPoints, { field: "sellThroughBasisPoints" }).amount;
    const conservativeRate = Math.max(0, item.sellThroughBasisPoints - (item.conditionUncertain ? 2_500 : 1_500));
    const conservativeSellable = calculateBasisPointAmount(conservative, conservativeRate, { field: "conservativeSellThroughBasisPoints" }).amount;
    return {
      conservative: addMoney([result.conservative, conservativeSellable]),
      expected: addMoney([result.expected, expectedSellable]),
      optimistic: addMoney([result.optimistic, optimistic]),
    };
  }, {
    conservative: createMoney(0, currency),
    expected: createMoney(0, currency),
    optimistic: createMoney(0, currency),
  });

  const unknownItems = items.filter((item) => item.certainty === LOT_ITEM_CERTAINTY.UNKNOWN);
  const ownerUnknownBulk = ownerBulkValue || createMoney(0, currency);
  const unknownExpected = ownerBulkValue
    ? calculateBasisPointAmount(ownerBulkValue, 5_000, { field: "unknownBulkExpectedRate" }).amount
    : createMoney(0, currency);
  const burdenTotal = addMoney(burdens, { currency, field: "lotBurdens" });
  const grossScenarios = {
    conservative: totals.conservative,
    expected: addMoney([totals.expected, unknownExpected]),
    optimistic: addMoney([totals.optimistic, ownerUnknownBulk]),
  };
  const scenarios = Object.freeze(Object.fromEntries(Object.entries(grossScenarios).map(([key, value]) => [
    key,
    Object.freeze({
      grossValue: value,
      burdens: burdenTotal,
      netValue: subtractMoney(value, burdenTotal),
    }),
  ])));
  const spreadDrivers = [];
  if (unknownItems.length) spreadDrivers.push(`${unknownItems.length} unidentified line item${unknownItems.length === 1 ? " has" : "s have"} no value unless the owner supplied a separate bulk assumption.`);
  if (items.some((item) => item.conditionUncertain)) spreadDrivers.push("Condition uncertainty widens the conservative-to-optimistic range.");
  if (items.some((item) => item.sellThroughBasisPoints < 8_000)) spreadDrivers.push("Sell-through and liquidity assumptions reduce expected value below optimistic retail totals.");
  if (burdenTotal.minorUnits) spreadDrivers.push("Shipping, labor, and handling burden reduce every net scenario.");
  if (items.some((item) => item.duplicate)) spreadDrivers.push("Duplicate items may increase concentration and liquidity risk.");
  const confidence = evaluateConfidence({
    sources: items.filter((item) => item.certainty !== LOT_ITEM_CERTAINTY.UNKNOWN).map((item) => ({
      sourceId: item.sourceId,
      underlyingSourceId: item.underlyingSourceId,
      quality: item.confidence,
    })),
    sampleSize: items.length - unknownItems.length,
    freshness: 0.8,
    identityConfidence: unknownItems.length ? INTELLIGENCE_CONFIDENCE.LOW : INTELLIGENCE_CONFIDENCE.HIGH,
    conditionConfidence: items.some((item) => item.conditionUncertain) ? INTELLIGENCE_CONFIDENCE.LOW : INTELLIGENCE_CONFIDENCE.MEDIUM,
    completeness: items.length ? (items.length - unknownItems.length) / items.length : 0,
    contradictions: Number(input.contradictions || 0),
  });

  return Object.freeze({
    methodologyVersion: ANALYSIS_METHODOLOGY.LOT,
    currency,
    items: Object.freeze(items),
    identifiedItems: Object.freeze(items.filter((item) => item.certainty === LOT_ITEM_CERTAINTY.IDENTIFIED)),
    probableItems: Object.freeze(items.filter((item) => item.certainty === LOT_ITEM_CERTAINTY.PROBABLE)),
    unknownItems: Object.freeze(unknownItems),
    unknownContentsValuePolicy: ownerBulkValue ? "OWNER_BULK_ASSUMPTION_HAIRCUT" : "ZERO_UNLESS_OWNER_SUPPLIES_BULK_VALUE",
    ownerBulkValue,
    scenarios,
    burdens: Object.freeze({ shipping: burdens[0], labor: burdens[1], handling: burdens[2], total: burdenTotal }),
    confidence,
    spreadDrivers: Object.freeze(spreadDrivers),
    warnings: Object.freeze([
      ...(unknownItems.length ? ["Unknown contents are not assigned optimistic individual retail values."] : []),
      ...(confidence.band === INTELLIGENCE_CONFIDENCE.INSUFFICIENT ? ["Lot evidence is insufficient for a supported expected value."] : []),
    ]),
  });
}
