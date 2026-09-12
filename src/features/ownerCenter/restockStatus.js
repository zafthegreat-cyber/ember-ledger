export const VISIT_OUTCOME = Object.freeze({
  SUCCESS: "SUCCESS",
  UNSUCCESSFUL: "UNSUCCESSFUL",
  UNKNOWN: "UNKNOWN",
});

export const RESTOCK_PREDICTION_OUTCOME = Object.freeze({
  CORRECT: "CORRECT",
  PARTIAL: "PARTIAL",
  INCORRECT: "INCORRECT",
  UNKNOWN: "UNKNOWN",
});

export function isConfirmedRestockStatus(value) {
  const status = String(value || "").trim();
  if (/\b(unconfirmed|not confirmed|possible|unknown)\b/i.test(status)) return false;
  return /\b(confirmed|in stock|purchase recorded|restock evidence)\b/i.test(status);
}

export function restockVisitOutcome(record = {}) {
  if (record.successful === true) return VISIT_OUTCOME.SUCCESS;
  if (record.successful === false) return VISIT_OUTCOME.UNSUCCESSFUL;
  const status = `${record.outcome || ""} ${record.status || ""} ${record.notes || ""}`;
  if (/\b(unsuccessful|empty|not found|no purchase)\b/i.test(status)) return VISIT_OUTCOME.UNSUCCESSFUL;
  if (/\b(successful|found|purchase recorded)\b/i.test(status)) return VISIT_OUTCOME.SUCCESS;
  return VISIT_OUTCOME.UNKNOWN;
}

export function restockPredictionOutcome(value) {
  const outcome = String(value || "").trim();
  if (/\b(unconfirmed|not confirmed|not correct|unknown|pending)\b/i.test(outcome)) return RESTOCK_PREDICTION_OUTCOME.UNKNOWN;
  if (/\b(incorrect|missed|wrong)\b/i.test(outcome)) return RESTOCK_PREDICTION_OUTCOME.INCORRECT;
  if (/\b(partial|partially correct)\b/i.test(outcome)) return RESTOCK_PREDICTION_OUTCOME.PARTIAL;
  if (/\b(confirmed|correct)\b/i.test(outcome)) return RESTOCK_PREDICTION_OUTCOME.CORRECT;
  return RESTOCK_PREDICTION_OUTCOME.UNKNOWN;
}

function normalizedIdentityPart(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchesRestockStore(record = {}, store = {}) {
  const recordId = normalizedIdentityPart(record.storeId);
  const storeId = normalizedIdentityPart(store.id || store.storeId);
  if (recordId && storeId) return recordId === storeId;

  const recordName = normalizedIdentityPart(record.store || record.storeName || record.name);
  const storeName = normalizedIdentityPart(store.store || store.storeName || store.name);
  if (!recordName || !storeName || recordName !== storeName) return false;

  const recordRetailer = normalizedIdentityPart(record.retailer);
  const storeRetailer = normalizedIdentityPart(store.retailer);
  if (recordRetailer && storeRetailer && recordRetailer !== storeRetailer) return false;

  const recordAddress = normalizedIdentityPart(record.address);
  const storeAddress = normalizedIdentityPart(store.address);
  if (recordAddress && storeAddress && recordAddress !== storeAddress) return false;
  return true;
}

export function latestConfirmedRestockEvent(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => isConfirmedRestockStatus(event?.confirmationStatus || event?.status || ""))
    .sort((left, right) => {
      const rightTime = Date.parse(right?.eventTime || right?.occurredAt || "") || 0;
      const leftTime = Date.parse(left?.eventTime || left?.occurredAt || "") || 0;
      return rightTime - leftTime;
    })[0] || null;
}
