import {
  INTELLIGENCE_CONFIDENCE,
  RESTOCK_OBSERVATION_TYPE,
} from "../intelligence/constants.js";
import { analyzeRestockIntelligence } from "../intelligence/restockIntelligence.js";
import { VISIT_OUTCOME, isConfirmedRestockStatus, restockVisitOutcome } from "./restockStatus.js";

function text(value) {
  return String(value ?? "").trim();
}

function confidence(value) {
  const normalized = text(value).toUpperCase().replaceAll("-", "_");
  if (normalized.includes("HIGH")) return INTELLIGENCE_CONFIDENCE.HIGH;
  if (normalized.includes("MODERATE") || normalized.includes("MEDIUM")) return INTELLIGENCE_CONFIDENCE.MEDIUM;
  if (normalized.includes("LOW") || normalized.includes("WEAK")) return INTELLIGENCE_CONFIDENCE.LOW;
  return INTELLIGENCE_CONFIDENCE.LOW;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function identity(record, fallback) {
  return text(record.id || record.reportId || record.visitId || record.observationId) || fallback;
}

function storeId(record) {
  return text(record.storeId || record.store || record.storeName);
}

function productId(record) {
  return text(record.productId || record.product || record.productName || record.itemName);
}

function optionalQuantity(value, field) {
  if (value === "" || value === null || value === undefined) return null;
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error(`${field} must be a finite non-negative number.`);
  return quantity;
}

function eventObservation(record, index) {
  const occurredAt = timestamp(record.eventTime || record.reportTime || record.date || record.createdAt || record.created_at);
  if (!occurredAt) return null;
  const status = text(`${record.confirmationStatus || ""} ${record.status || ""} ${record.stockStatus || ""}`);
  let type = null;
  if (isConfirmedRestockStatus(status)) type = RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED;
  if (/\b(empty|out of stock|sold out)\b/i.test(status)) type = RESTOCK_OBSERVATION_TYPE.EMPTY_SHELF;
  if (!type) return null;
  const id = identity(record, `event-${index + 1}`);
  const observedQuantity = optionalQuantity(record.quantity, `events[${index}].quantity`);
  return {
    observationId: `restock-event:${id}`,
    type,
    storeId: storeId(record),
    retailer: text(record.retailer || record.chain),
    productId: productId(record),
    occurredAt,
    observedQuantity,
    sourceId: text(record.source || record.sourceType) || `restock-event:${id}`,
    underlyingSourceId: text(record.underlyingSourceId) || `restock-event:${id}`,
    confidence: confidence(record.reliability || record.confidence),
    evidence: text(record.evidence || record.notes),
  };
}

function visitObservation(record, index) {
  const occurredAt = timestamp(record.visitTime || record.arrivalTime || record.date || record.createdAt);
  if (!occurredAt) return null;
  const outcome = restockVisitOutcome(record);
  if (outcome === VISIT_OUTCOME.UNKNOWN) return null;
  const id = identity(record, `visit-${index + 1}`);
  const observedQuantity = optionalQuantity(record.quantityPurchased, `visits[${index}].quantityPurchased`);
  return {
    observationId: `store-visit:${id}`,
    type: outcome === VISIT_OUTCOME.SUCCESS ? RESTOCK_OBSERVATION_TYPE.VISIT_SUCCESS : RESTOCK_OBSERVATION_TYPE.VISIT_UNSUCCESSFUL,
    storeId: storeId(record),
    retailer: text(record.retailer),
    productId: productId(record),
    occurredAt,
    observedQuantity,
    sourceId: `owner-visit:${id}`,
    underlyingSourceId: `owner-visit:${id}`,
    confidence: INTELLIGENCE_CONFIDENCE.HIGH,
    evidence: text(record.notes),
  };
}

function productObservation(record, index) {
  const occurredAt = timestamp(record.dateSeen || record.observedAt || record.date || record.createdAt);
  if (!occurredAt) return null;
  const rawQuantity = record.quantity ?? record.observedQuantity;
  const quantity = optionalQuantity(rawQuantity, `observations[${index}].quantity`);
  const status = text(record.status || record.selloutStatus);
  const emptyStatus = /\b(empty|out of stock|sold out)\b/i.test(status);
  const stockedStatus = /\b(in stock|observed|available)\b/i.test(status);
  if (quantity === null && !emptyStatus && !stockedStatus) return null;
  const empty = quantity !== null ? quantity === 0 : emptyStatus;
  const id = identity(record, `product-${index + 1}`);
  return {
    observationId: `product-observation:${id}`,
    type: empty ? RESTOCK_OBSERVATION_TYPE.EMPTY_SHELF : RESTOCK_OBSERVATION_TYPE.STOCK_OBSERVED,
    storeId: storeId(record),
    retailer: text(record.retailer),
    productId: productId(record),
    occurredAt,
    observedQuantity: quantity,
    sourceId: `owner-observation:${id}`,
    underlyingSourceId: `owner-observation:${id}`,
    confidence: confidence(record.confidence),
    evidence: text(record.evidence || record.notes),
  };
}

export function buildRestockObservations({ events = [], visits = [], observations = [] } = {}) {
  return [
    ...events.map(eventObservation),
    ...visits.map(visitObservation),
    ...observations.map(productObservation),
  ].filter(Boolean);
}

export function calculateRestockIntelligence(data = {}, options = {}) {
  const observations = buildRestockObservations(data);
  const result = analyzeRestockIntelligence({
    observations,
    storeId: options.storeId || null,
    productId: options.productId || null,
    asOf: options.asOf || new Date().toISOString(),
    staleAfterDays: options.staleAfterDays ?? 60,
  });
  const distinctStores = new Set(observations.map((row) => row.storeId).filter(Boolean));
  if (!options.storeId && distinctStores.size > 1) {
    return Object.freeze({
      ...result,
      likelihoodBand: result.sampleSize ? "LOW" : "INSUFFICIENT",
      confidence: result.sampleSize ? INTELLIGENCE_CONFIDENCE.LOW : INTELLIGENCE_CONFIDENCE.INSUFFICIENT,
      expectedWindow: null,
      warnings: Object.freeze([
        ...result.warnings,
        "Aggregate observations span multiple stores; select a store before interpreting a restock window.",
      ]),
      recommendation: "Review a specific store before planning a trip; aggregate activity is not a store-level prediction.",
    });
  }
  return result;
}
