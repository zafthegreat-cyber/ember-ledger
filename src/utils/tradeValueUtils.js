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
  // #22: when a side has no value, fall back to a catalog/market estimate the
  // caller found for the received item (options.receivedEstimate = { value,
  // source }) so the analyzer gives a one-tap answer instead of "Unknown".
  const receivedEstimate = options.receivedEstimate && Number(options.receivedEstimate.value) > 0
    ? { value: Number(options.receivedEstimate.value), source: String(options.receivedEstimate.source || "Catalog estimate") }
    : null;
  const usedReceivedEstimate = normalized.receivedValue === "" && Boolean(receivedEstimate);
  const receivedUnitValue = usedReceivedEstimate ? receivedEstimate.value : Number(normalized.receivedValue || 0);
  const receivedTotalValue = receivedUnitValue * normalized.receivedQuantity;
  const hasOutgoingValue = hasManualOutgoingValue || outgoing.totalValue > 0;
  const hasReceivedValue = normalized.receivedValue !== "" || usedReceivedEstimate;
  const difference = receivedTotalValue - outgoing.totalValue;
  const missingSides = [
    ...(hasOutgoingValue ? [] : ["what you gave"]),
    ...(hasReceivedValue ? [] : ["what you got"]),
  ];
  let tone = "needs-review";
  let label = missingSides.length ? `Value needed: ${missingSides.join(" and ")}` : "Unknown Balance";
  let resultLabel = label;
  let guidance = missingSides.length
    ? `Add an estimated value for ${missingSides.join(" and ")} to compare. Tip: a card's Market Watch price or what you paid both work as a starting estimate.`
    : "Add estimated values later to compare what you gave with what you got.";

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

  // SHOULD 21 (2026-11-14): when a side is missing, say what IS known and
  // offer the concrete numbers the person already has instead of "Unknown".
  const now = options.now ? new Date(options.now) : new Date();
  const priceDate = sourceItem.marketPriceUpdatedAt || sourceItem.market_price_updated_at || sourceItem.priceUpdatedAt || sourceItem.price_updated_at || sourceItem.marketCheckedAt || sourceItem.market_checked_at || "";
  const priceAgeDays = priceDate && Number.isFinite(Date.parse(priceDate)) ? Math.floor((now.getTime() - Date.parse(priceDate)) / 86400000) : null;
  const stalePrice = !hasManualOutgoingValue && outgoing.confidence === "Market estimate" && priceAgeDays !== null && priceAgeDays > (options.staleAfterDays ?? 30);
  const fallbackSuggestions = [];
  if (!hasOutgoingValue) {
    const paid = firstPositiveNumber(sourceItem.purchasePrice, sourceItem.purchase_price, sourceItem.unitCost, sourceItem.unit_cost, sourceItem.allocatedItemCost);
    if (paid) fallbackSuggestions.push({ side: "outgoing", label: `Use what you paid (${moneyFormatter(paid * normalized.outgoingQuantity)})`, value: paid * normalized.outgoingQuantity, source: "What you paid" });
    fallbackSuggestions.push({ side: "outgoing", label: "Look up a Market price", value: null, source: "Market" });
  }
  if (!hasReceivedValue) {
    if (receivedEstimate) fallbackSuggestions.push({ side: "received", label: `Use the ${receivedEstimate.source.toLowerCase()} (${moneyFormatter(receivedEstimate.value * normalized.receivedQuantity)})`, value: receivedEstimate.value * normalized.receivedQuantity, source: receivedEstimate.source });
    else if (normalized.receivedType === "Sealed") fallbackSuggestions.push({ side: "received", label: "Use the shelf price (MSRP) as a floor", value: null, source: "MSRP" });
    else fallbackSuggestions.push({ side: "received", label: "Ask what they'd sell it for and use that", value: null, source: "Asking price" });
  }
  let partialLabel = "";
  if (hasOutgoingValue && !hasReceivedValue) partialLabel = `You're giving about ${moneyFormatter(outgoing.totalValue)}. Add what you got to compare.`;
  else if (!hasOutgoingValue && hasReceivedValue) partialLabel = `You're getting about ${moneyFormatter(receivedTotalValue)}. Add what you gave to compare.`;
  else if (!hasOutgoingValue && !hasReceivedValue) partialLabel = "No values yet. Either side can start with what you paid or a Market price.";
  if (stalePrice && hasOutgoingValue && hasReceivedValue) guidance = `${guidance} The Market price for what you gave is ${priceAgeDays} days old; refresh it before deciding.`;

  return {
    difference,
    differenceLabel: hasOutgoingValue && hasReceivedValue
      ? `${difference >= 0 ? "+" : "-"}${moneyFormatter(Math.abs(difference))}`
      : "Unknown Balance",
    fallbackSuggestions,
    partialLabel,
    priceAgeDays,
    stalePrice,
    guidance,
    hasOutgoingValue,
    hasReceivedValue,
    label,
    missingSides,
    outgoing,
    outgoingLabel: hasOutgoingValue ? moneyFormatter(outgoing.totalValue) : "Value needed",
    receivedLabel: hasReceivedValue ? moneyFormatter(receivedTotalValue) : "Value needed",
    receivedEstimate: usedReceivedEstimate ? receivedEstimate : null,
    receivedConfidence: usedReceivedEstimate ? receivedEstimate.source : normalized.receivedValue !== "" ? "Manual estimate" : "Needs value",
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
