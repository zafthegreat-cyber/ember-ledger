export const TRADE_RECEIVED_ITEM_TYPES = ["Card", "Sealed", "Accessory", "Other"];

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

export function estimateTradeItemValue(item = {}, quantity = 1) {
  const unitValue = firstPositiveNumber(
    item.marketValue,
    item.market_value,
    item.marketPrice,
    item.market_price,
    item.currentMarketValue,
    item.current_market_value,
    item.lowPrice,
    item.low_price,
    item.midPrice,
    item.mid_price,
    item.salePrice,
    item.sale_price,
    item.plannedSalePrice,
    item.planned_sale_price,
    item.msrpPrice,
    item.msrp_price,
    item.unitCost,
    item.unit_cost,
  );
  const source =
    firstPositiveNumber(item.marketValue, item.market_value, item.marketPrice, item.market_price, item.currentMarketValue, item.current_market_value) ? "Market estimate" :
    firstPositiveNumber(item.lowPrice, item.low_price, item.midPrice, item.mid_price) ? "Price range estimate" :
    firstPositiveNumber(item.salePrice, item.sale_price, item.plannedSalePrice, item.planned_sale_price) ? "Planned price estimate" :
    firstPositiveNumber(item.msrpPrice, item.msrp_price) ? "MSRP estimate" :
    firstPositiveNumber(item.unitCost, item.unit_cost) ? "Cost basis estimate" :
    "Value needed";
  const safeQuantity = Math.max(1, Number(quantity || 1));
  return {
    confidence: unitValue > 0 ? source : "Needs value",
    totalValue: unitValue * safeQuantity,
    unitValue,
  };
}

export function normalizeTradeDraft(draft = {}) {
  const receivedQuantity = Math.max(1, Number.parseInt(String(draft.receivedQuantity || 1), 10) || 1);
  const outgoingQuantity = Math.max(1, Number.parseInt(String(draft.outgoingQuantity || 1), 10) || 1);
  const receivedValue = Number.parseFloat(String(draft.receivedValue || "").trim());
  const outgoingValue = Number.parseFloat(String(draft.outgoingValue || "").trim());
  return {
    id: draft.id || "",
    sourceItemId: String(draft.sourceItemId || ""),
    sourceKind: draft.sourceKind || "",
    outgoingName: String(draft.outgoingName || "").trim(),
    outgoingCondition: String(draft.outgoingCondition || "").trim(),
    outgoingQuantity,
    outgoingValue: Number.isFinite(outgoingValue) && outgoingValue >= 0 ? outgoingValue : "",
    receivedName: String(draft.receivedName || "").trim(),
    receivedType: TRADE_RECEIVED_ITEM_TYPES.includes(draft.receivedType) ? draft.receivedType : "Card",
    receivedSet: String(draft.receivedSet || "").trim(),
    receivedCondition: String(draft.receivedCondition || "").trim(),
    receivedQuantity,
    receivedValue: Number.isFinite(receivedValue) && receivedValue >= 0 ? receivedValue : "",
    tradeDate: String(draft.tradeDate || "").trim(),
    notes: String(draft.notes || "").trim(),
  };
}

export function validateTradeDraft(draft = {}, sourceItem = null) {
  const normalized = normalizeTradeDraft(draft);
  const errors = {};
  if ((!normalized.sourceItemId || !sourceItem) && !normalized.outgoingName) {
    errors.sourceItemId = "Choose a saved item or enter the item you traded away.";
  }
  if (!normalized.receivedName) errors.receivedName = "Enter what you would receive.";
  if (!normalized.receivedQuantity || normalized.receivedQuantity < 1) errors.receivedQuantity = "Quantity must be at least 1.";
  if (normalized.outgoingValue !== "" && (!Number.isFinite(Number(normalized.outgoingValue)) || Number(normalized.outgoingValue) < 0)) {
    errors.outgoingValue = "Value must be zero or more.";
  }
  if (normalized.receivedValue !== "" && (!Number.isFinite(Number(normalized.receivedValue)) || Number(normalized.receivedValue) < 0)) {
    errors.receivedValue = "Value must be zero or more.";
  }
  return {
    errors,
    ok: Object.keys(errors).length === 0,
  };
}

export function buildTradeComparison(draft = {}, sourceItem = {}, options = {}) {
  sourceItem = sourceItem || {};
  const normalized = normalizeTradeDraft(draft);
  const moneyFormatter = options.moneyFormatter || ((value) => `$${Number(value || 0).toFixed(2)}`);
  const hasManualOutgoingValue = normalized.outgoingValue !== "";
  const outgoing = hasManualOutgoingValue
    ? {
      confidence: "Manual estimate",
      totalValue: Number(normalized.outgoingValue),
      unitValue: Number(normalized.outgoingValue) / Math.max(1, normalized.outgoingQuantity),
    }
    : estimateTradeItemValue(sourceItem, normalized.outgoingQuantity);
  const receivedUnitValue = Number(normalized.receivedValue || 0);
  const receivedTotalValue = receivedUnitValue * normalized.receivedQuantity;
  const hasOutgoingValue = hasManualOutgoingValue || outgoing.totalValue > 0;
  const hasReceivedValue = normalized.receivedValue !== "";
  const difference = receivedTotalValue - outgoing.totalValue;
  let tone = "needs-review";
  let label = "Unknown Balance";
  let resultLabel = "Unknown Balance";
  let guidance = "Add estimated values later to compare what you gave with what you got.";

  if (hasOutgoingValue && hasReceivedValue) {
    if (difference > 0) {
      tone = "favorable";
      label = "Value Gained";
      resultLabel = "Value Gained";
      guidance = "The received side estimates higher. Confirm condition and source data before saving.";
    } else if (difference < 0) {
      tone = "caution";
      label = "Value Drift";
      resultLabel = "Value Drift";
      guidance = "You may be giving more estimated value. Confirm condition, demand, and family rules before accepting.";
    } else {
      tone = "fair";
      label = "Fair Trade";
      resultLabel = "Fair Trade";
      guidance = "The values you entered are even. Still review condition, demand, timing, and personal meaning.";
    }
  }

  return {
    difference,
    differenceLabel: hasOutgoingValue && hasReceivedValue
      ? `${difference >= 0 ? "+" : "-"}${moneyFormatter(Math.abs(difference))}`
      : "Unknown Balance",
    guidance,
    hasOutgoingValue,
    hasReceivedValue,
    label,
    outgoing,
    outgoingLabel: hasOutgoingValue ? moneyFormatter(outgoing.totalValue) : "Value needed",
    receivedLabel: hasReceivedValue ? moneyFormatter(receivedTotalValue) : "Value needed",
    receivedTotalValue,
    resultLabel,
    tone,
  };
}

export function buildTradeHistoryRecord(draft = {}, sourceItem = {}, options = {}) {
  sourceItem = sourceItem || {};
  const normalized = normalizeTradeDraft(draft);
  const comparison = buildTradeComparison(normalized, sourceItem, options);
  const now = options.now || new Date().toISOString();
  const manualSourceName = normalized.outgoingName || "Manual trade item";
  return {
    id: options.id || `trade-${Date.now()}`,
    sourceItemId: normalized.sourceItemId,
    sourceItemName: sourceItem.name || sourceItem.itemName || manualSourceName,
    sourceKind: normalized.sourceKind || options.sourceKind || (normalized.sourceItemId ? "" : "manual"),
    outgoingName: normalized.outgoingName,
    outgoingCondition: normalized.outgoingCondition,
    outgoingQuantity: normalized.outgoingQuantity,
    outgoingValue: comparison.outgoing.totalValue,
    outgoingValueConfidence: comparison.outgoing.confidence,
    receivedName: normalized.receivedName,
    receivedType: normalized.receivedType,
    receivedSet: normalized.receivedSet,
    receivedCondition: normalized.receivedCondition,
    receivedQuantity: normalized.receivedQuantity,
    receivedValue: comparison.receivedTotalValue,
    difference: comparison.difference,
    guidance: comparison.label,
    guidanceTone: comparison.tone,
    resultLabel: comparison.resultLabel,
    tradeDate: normalized.tradeDate || now.slice(0, 10),
    notes: normalized.notes,
    inventoryMutation: "none",
    createdAt: now,
    updatedAt: now,
  };
}
