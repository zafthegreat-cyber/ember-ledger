import { CANONICAL_DOMAINS } from "./migrationSourceRegistry.js";
import { validateCanonicalFileAssetInput } from "./fileAsset.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SECURITY_FIELD_PATTERN = /(?:authorization|access.?token|refresh.?token|id.?token|session|cookie|password|secret|api.?key|owner.?subjects?|private.?key)/i;

const CREATE_FIELDS = new Set([
  "id", "status", "source", "externalProvider", "externalId", "sourceUrl", "notes", "metadata",
  "amountMinor", "currency", "rateBasisPoints", "quantity", "certificationNumber", "occurredAt", "relations",
  "fileAsset",
]);
const UPDATE_FIELDS = new Set([...CREATE_FIELDS].filter((field) => field !== "id").concat("expectedVersion"));

export const CANONICAL_INPUT_LIMITS = Object.freeze({
  source: 120,
  externalProvider: 80,
  externalId: 500,
  sourceUrl: 2_048,
  notes: 32_000,
  certificationNumber: 160,
  metadataDepth: 12,
  metadataKeysPerObject: 100,
  metadataArrayLength: 250,
  metadataStringLength: 16_384,
  metadataNodes: 5_000,
  metadataUtf8Bytes: 250_000,
  maximumQuantity: 1_000_000_000,
  maximumAmountMinor: Number.MAX_SAFE_INTEGER,
  maximumRateBasisPoints: 100_000,
});

const GENERIC_STATUSES = ["ACTIVE", "INACTIVE", "DRAFT", "COMPLETE", "ARCHIVED"];

export const CANONICAL_STATUS_CONTRACT = Object.freeze({
  DEAL: ["NEW", "NEEDS_REVIEW", "NEEDS_ANALYSIS", "STRONG_OPPORTUNITY", "WORTH_AN_OFFER", "WATCH", "SAVED", "OFFER_PLANNED", "OFFER_MADE", "BIDDING", "PURCHASED", "PASSED", "EXPIRED", "DUPLICATE", "ARCHIVED"],
  DEAL_SNAPSHOT: ["CAPTURED", "ARCHIVED"],
  DEAL_ANALYSIS: ["DRAFT", "COMPLETE", "SUPERSEDED", "ARCHIVED"],
  SEARCH_RULE: ["ACTIVE", "PAUSED", "FAILED", "ARCHIVED"],
  AUCTION_EVENT: ["DRAFT", "WATCHING", "ACTIVE", "ENDED", "WON", "LOST", "CANCELLED", "ARCHIVED"],
  AUCTION_LOT: ["DRAFT", "WATCHING", "ACTIVE", "WON", "LOST", "PASSED", "EXPIRED", "ARCHIVED"],
  BID_PLAN: ["DRAFT", "READY", "SUPERSEDED", "ARCHIVED"],
  RESTOCK_STORE_PROFILE: GENERIC_STATUSES,
  RESTOCK_EVENT: ["POSSIBLE", "CONFIRMED", "STALE", "REJECTED", "ARCHIVED"],
  RESTOCK_PREDICTION: ["PENDING", "CONFIRMED", "CORRECT", "PARTIAL", "INCORRECT", "NOT_ENOUGH_DATA", "ARCHIVED"],
  STORE_VISIT: ["RECORDED", "SUCCESSFUL", "UNSUCCESSFUL", "ARCHIVED"],
  PRODUCT_OBSERVATION: ["OBSERVED", "SOLD_OUT", "STALE", "ARCHIVED"],
  PURCHASE: ["PLANNED", "OFFER_MADE", "WON", "AWAITING_PAYMENT", "PAID", "IN_TRANSIT", "PICKUP_REQUIRED", "RECEIVED", "PROCESSING", "COMPLETED", "RETURNED", "REFUNDED", "CANCELLED", "ARCHIVED"],
  PURCHASE_LOT: ["UNPROCESSED", "PROCESSING", "RECONCILED", "COMPLETED", "ARCHIVED"],
  COST_ALLOCATION: ["DRAFT", "RECONCILED", "ACCEPTED_WITH_DIFFERENCE", "ARCHIVED"],
  OWNED_ITEM: ["UNPROCESSED", "NEEDS_IDENTIFICATION", "NEEDS_REVIEW", "NEEDS_CLEANING", "NEEDS_PHOTOS", "NEEDS_PRICING", "READY_TO_LIST", "LISTED", "RESERVED", "SOLD", "SHIPPED", "RETURNED", "HOLD", "GRADING_CANDIDATE", "SUBMITTED_FOR_GRADING", "DONATED", "WRITTEN_OFF", "MISSING", "ARCHIVED"],
  INVENTORY_ADJUSTMENT: ["RECORDED", "VOIDED", "ARCHIVED"],
  STORAGE_LOCATION: GENERIC_STATUSES,
  SALE: ["DRAFT", "RECORDED", "PAID", "SHIPPED", "COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED", "ARCHIVED"],
  SALE_LINE_ITEM: ["RECORDED", "RETURNED", "VOIDED", "ARCHIVED"],
  SHIPMENT: ["DRAFT", "READY", "SHIPPED", "DELIVERED", "LOST", "RETURNED", "ARCHIVED"],
  RETURN: ["REQUESTED", "IN_TRANSIT", "RECEIVED", "INSPECTED", "COMPLETED", "REJECTED", "VOIDED", "ARCHIVED"],
  EXPENSE: ["RECORDED", "RECONCILED", "VOIDED", "ARCHIVED"],
  MILEAGE_TRIP: ["RECORDED", "RECONCILED", "VOIDED", "ARCHIVED"],
  RECEIPT_METADATA: ["NEEDS_REVIEW", "VERIFIED", "DUPLICATE", "VOIDED", "ARCHIVED"],
  OWNER_PREFERENCE: GENERIC_STATUSES,
  FEATURE_SETTING: ["ACTIVE", "DISABLED", "UNAVAILABLE", "ARCHIVED"],
  FILE_ASSET: ["REFERENCE_ONLY", "AVAILABLE", "MISSING", "UNSUPPORTED", "QUARANTINED", "ARCHIVED"],
});

function relation(targetDomain, required = false) {
  return Object.freeze({ targetDomain, required });
}

export const CANONICAL_RELATION_CONTRACT = Object.freeze({
  DEAL: {},
  DEAL_SNAPSHOT: { dealId: relation(CANONICAL_DOMAINS.DEAL, true) },
  DEAL_ANALYSIS: { dealId: relation(CANONICAL_DOMAINS.DEAL) },
  SEARCH_RULE: {},
  AUCTION_EVENT: {},
  AUCTION_LOT: { auctionEventId: relation(CANONICAL_DOMAINS.AUCTION_EVENT, true) },
  BID_PLAN: { auctionLotId: relation(CANONICAL_DOMAINS.AUCTION_LOT, true) },
  RESTOCK_STORE_PROFILE: {},
  RESTOCK_EVENT: { storeId: relation(CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, true) },
  RESTOCK_PREDICTION: { storeId: relation(CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, true) },
  STORE_VISIT: { storeId: relation(CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, true), purchaseId: relation(CANONICAL_DOMAINS.PURCHASE) },
  PRODUCT_OBSERVATION: { storeId: relation(CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, true) },
  PURCHASE: { dealId: relation(CANONICAL_DOMAINS.DEAL), auctionLotId: relation(CANONICAL_DOMAINS.AUCTION_LOT) },
  PURCHASE_LOT: { purchaseId: relation(CANONICAL_DOMAINS.PURCHASE, true) },
  COST_ALLOCATION: { purchaseId: relation(CANONICAL_DOMAINS.PURCHASE, true), purchaseLotId: relation(CANONICAL_DOMAINS.PURCHASE_LOT), ownedItemId: relation(CANONICAL_DOMAINS.OWNED_ITEM) },
  OWNED_ITEM: { purchaseId: relation(CANONICAL_DOMAINS.PURCHASE), purchaseLotId: relation(CANONICAL_DOMAINS.PURCHASE_LOT), storageLocationId: relation(CANONICAL_DOMAINS.STORAGE_LOCATION) },
  INVENTORY_ADJUSTMENT: { ownedItemId: relation(CANONICAL_DOMAINS.OWNED_ITEM, true), saleId: relation(CANONICAL_DOMAINS.SALE), returnId: relation(CANONICAL_DOMAINS.RETURN) },
  STORAGE_LOCATION: { parentStorageLocationId: relation(CANONICAL_DOMAINS.STORAGE_LOCATION) },
  SALE: {},
  SALE_LINE_ITEM: { saleId: relation(CANONICAL_DOMAINS.SALE, true), ownedItemId: relation(CANONICAL_DOMAINS.OWNED_ITEM, true) },
  SHIPMENT: { saleId: relation(CANONICAL_DOMAINS.SALE, true) },
  RETURN: { saleId: relation(CANONICAL_DOMAINS.SALE, true) },
  EXPENSE: { purchaseId: relation(CANONICAL_DOMAINS.PURCHASE), saleId: relation(CANONICAL_DOMAINS.SALE), auctionEventId: relation(CANONICAL_DOMAINS.AUCTION_EVENT), ownedItemId: relation(CANONICAL_DOMAINS.OWNED_ITEM), receiptId: relation(CANONICAL_DOMAINS.RECEIPT_METADATA) },
  MILEAGE_TRIP: { purchaseId: relation(CANONICAL_DOMAINS.PURCHASE), saleId: relation(CANONICAL_DOMAINS.SALE), auctionEventId: relation(CANONICAL_DOMAINS.AUCTION_EVENT), storeVisitId: relation(CANONICAL_DOMAINS.STORE_VISIT) },
  RECEIPT_METADATA: { fileAssetId: relation(CANONICAL_DOMAINS.FILE_ASSET) },
  OWNER_PREFERENCE: {},
  FEATURE_SETTING: {},
  FILE_ASSET: {},
});

export const IMMUTABLE_CANONICAL_DOMAINS = Object.freeze(new Set([CANONICAL_DOMAINS.DEAL_SNAPSHOT]));
export const NEGATIVE_AMOUNT_DOMAINS = Object.freeze(new Set([CANONICAL_DOMAINS.INVENTORY_ADJUSTMENT, CANONICAL_DOMAINS.RETURN]));
export const NEGATIVE_QUANTITY_DOMAINS = Object.freeze(new Set([CANONICAL_DOMAINS.INVENTORY_ADJUSTMENT]));

function issue(path, code, message) {
  return { path, code, message };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeLegacyStatus(domain, value) {
  if (value == null || value === "") return { valid: true, value: undefined, changed: false };
  if (typeof value !== "string") return { valid: false, value: undefined, changed: false, issue: issue("status", "invalid_type", "status must be a string.") };
  const trimmed = value.trim();
  const normalized = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .toUpperCase();
  const supported = CANONICAL_STATUS_CONTRACT[domain] || [];
  if (!supported.includes(normalized)) {
    return { valid: false, value: normalized, changed: normalized !== trimmed, issue: issue("status", "invalid_status", `status is not supported for ${domain}.`) };
  }
  return { valid: true, value: normalized, changed: normalized !== trimmed };
}

function validateString(value, path, maximumLength, { nullable = true, required = false } = {}) {
  if (value === undefined) return [];
  if (value === null && nullable) return [];
  if (typeof value !== "string") return [issue(path, "invalid_type", `${path} must be a string.`)];
  if (required && !value.trim()) return [issue(path, "required", `${path} is required.`)];
  if (value.trim().length > maximumLength) return [issue(path, "too_long", `${path} is too long.`)];
  return [];
}

function validateMetadata(value) {
  const issues = [];
  try {
    const serialized = JSON.stringify(value);
    const byteLength = new TextEncoder().encode(serialized).byteLength;
    if (byteLength > CANONICAL_INPUT_LIMITS.metadataUtf8Bytes) {
      issues.push(issue(
        "metadata",
        "too_large",
        `metadata exceeds the ${CANONICAL_INPUT_LIMITS.metadataUtf8Bytes}-byte UTF-8 JSON limit.`,
      ));
    }
  } catch {
    issues.push(issue("metadata", "invalid_json_value", "metadata must be serializable JSON."));
  }
  const stack = [{ value, path: "metadata", depth: 0 }];
  let nodeCount = 0;
  while (stack.length) {
    const current = stack.pop();
    nodeCount += 1;
    if (nodeCount > CANONICAL_INPUT_LIMITS.metadataNodes) {
      issues.push(issue(current.path, "too_many_values", "Metadata contains too many values."));
      break;
    }
    if (current.depth > CANONICAL_INPUT_LIMITS.metadataDepth) {
      issues.push(issue(current.path, "too_deep", "Metadata nesting is too deep."));
      continue;
    }
    if (current.value === null || typeof current.value === "boolean") continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) issues.push(issue(current.path, "non_finite_number", "Metadata cannot contain NaN or Infinity."));
      continue;
    }
    if (typeof current.value === "string") {
      if (current.value.length > CANONICAL_INPUT_LIMITS.metadataStringLength) issues.push(issue(current.path, "too_long", "A metadata string is too long."));
      continue;
    }
    if (Array.isArray(current.value)) {
      if (current.value.length > CANONICAL_INPUT_LIMITS.metadataArrayLength) issues.push(issue(current.path, "array_too_large", "A metadata array is too large."));
      current.value.forEach((entry, index) => stack.push({ value: entry, path: `${current.path}[${index}]`, depth: current.depth + 1 }));
      continue;
    }
    if (!isPlainObject(current.value)) {
      issues.push(issue(current.path, "invalid_json_value", "Metadata must contain JSON values only."));
      continue;
    }
    const keys = Object.keys(current.value);
    if (keys.length > CANONICAL_INPUT_LIMITS.metadataKeysPerObject) issues.push(issue(current.path, "too_many_keys", "A metadata object has too many keys."));
    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key)) issues.push(issue(`${current.path}.${key}`, "prohibited_key", "Prototype-pollution keys are prohibited."));
      if (SECURITY_FIELD_PATTERN.test(key)) issues.push(issue(`${current.path}.${key}`, "prohibited_security_field", "Security and session fields are prohibited from canonical records."));
      stack.push({ value: current.value[key], path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }
  return issues;
}

export function validateCanonicalWireInput(domain, raw, options = {}) {
  const updating = options.update === true;
  const issues = [];
  if (!Object.values(CANONICAL_DOMAINS).includes(domain)) return { valid: false, issues: [issue("domain", "invalid_domain", "The canonical domain is not supported.")] };
  if (!isPlainObject(raw)) return { valid: false, issues: [issue("body", "invalid_type", "The canonical input must be an object.")] };
  if (updating && IMMUTABLE_CANONICAL_DOMAINS.has(domain)) issues.push(issue("record", "immutable_record", `${domain} records are immutable.`));
  const allowed = updating ? UPDATE_FIELDS : CREATE_FIELDS;
  for (const key of Object.keys(raw)) {
    if (DANGEROUS_KEYS.has(key)) issues.push(issue(key, "prohibited_key", "Prototype-pollution keys are prohibited."));
    else if (!allowed.has(key)) issues.push(issue(key, "unknown_field", `Unknown field: ${key}.`));
  }
  if (!updating && raw.id !== undefined && (typeof raw.id !== "string" || !UUID_PATTERN.test(raw.id))) issues.push(issue("id", "invalid_uuid", "id must be a valid UUID."));
  if (updating && (!Number.isSafeInteger(raw.expectedVersion) || raw.expectedVersion < 1)) issues.push(issue("expectedVersion", "required", "expectedVersion must be a positive safe integer."));
  if (raw.status !== undefined) {
    if (typeof raw.status !== "string" || !(CANONICAL_STATUS_CONTRACT[domain] || []).includes(raw.status)) issues.push(issue("status", "invalid_status", `status is not supported for ${domain}.`));
    else if (raw.status === "ARCHIVED") issues.push(issue("status", "archive_action_required", "ARCHIVED status requires the explicit archive action."));
  }
  issues.push(...validateString(raw.source, "source", CANONICAL_INPUT_LIMITS.source, { nullable: false, required: true }));
  issues.push(...validateString(raw.externalProvider, "externalProvider", CANONICAL_INPUT_LIMITS.externalProvider));
  issues.push(...validateString(raw.externalId, "externalId", CANONICAL_INPUT_LIMITS.externalId));
  issues.push(...validateString(raw.sourceUrl, "sourceUrl", CANONICAL_INPUT_LIMITS.sourceUrl));
  issues.push(...validateString(raw.notes, "notes", CANONICAL_INPUT_LIMITS.notes));
  issues.push(...validateString(raw.certificationNumber, "certificationNumber", CANONICAL_INPUT_LIMITS.certificationNumber));
  if (typeof raw.sourceUrl === "string" && raw.sourceUrl.trim()) {
    try {
      const url = new URL(raw.sourceUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported scheme");
    } catch {
      issues.push(issue("sourceUrl", "invalid_url", "sourceUrl must be an HTTP or HTTPS URL."));
    }
  }
  if (raw.amountMinor !== undefined && raw.amountMinor !== null) {
    const minimum = NEGATIVE_AMOUNT_DOMAINS.has(domain) ? -CANONICAL_INPUT_LIMITS.maximumAmountMinor : 0;
    if (!Number.isSafeInteger(raw.amountMinor) || raw.amountMinor < minimum) issues.push(issue("amountMinor", "invalid_integer", "amountMinor is outside the supported safe-integer range."));
  }
  if (raw.currency !== undefined && raw.currency !== null && (typeof raw.currency !== "string" || !CURRENCY_PATTERN.test(raw.currency))) issues.push(issue("currency", "invalid_currency", "currency must be a three-letter uppercase ISO code."));
  if (!updating && (raw.amountMinor === undefined || raw.amountMinor === null) && typeof raw.currency === "string" && raw.currency.trim()) {
    issues.push(issue("currency", "currency_without_amount", "currency requires an amountMinor value."));
  }
  if (raw.rateBasisPoints !== undefined && raw.rateBasisPoints !== null && (!Number.isSafeInteger(raw.rateBasisPoints) || raw.rateBasisPoints < 0 || raw.rateBasisPoints > CANONICAL_INPUT_LIMITS.maximumRateBasisPoints)) issues.push(issue("rateBasisPoints", "invalid_basis_points", "rateBasisPoints must be an integer between 0 and 100000."));
  if (raw.quantity !== undefined && raw.quantity !== null) {
    const minimum = NEGATIVE_QUANTITY_DOMAINS.has(domain) ? -CANONICAL_INPUT_LIMITS.maximumQuantity : 0;
    if (!Number.isSafeInteger(raw.quantity) || raw.quantity < minimum || raw.quantity > CANONICAL_INPUT_LIMITS.maximumQuantity) issues.push(issue("quantity", "invalid_integer", "quantity is outside the supported integer range."));
  }
  if (raw.occurredAt !== undefined && raw.occurredAt !== null && (typeof raw.occurredAt !== "string" || !ISO_INSTANT_PATTERN.test(raw.occurredAt) || !Number.isFinite(Date.parse(raw.occurredAt)))) issues.push(issue("occurredAt", "invalid_date", "occurredAt must be an ISO 8601 instant with a time zone."));
  if (raw.metadata !== undefined) {
    if (!isPlainObject(raw.metadata)) issues.push(issue("metadata", "invalid_type", "metadata must be an object."));
    else issues.push(...validateMetadata(raw.metadata));
  }
  if (domain === CANONICAL_DOMAINS.FILE_ASSET) {
    if (!updating && raw.fileAsset === undefined) issues.push(issue("fileAsset", "required", "fileAsset is required."));
    if (raw.fileAsset !== undefined) {
      const fileAsset = validateCanonicalFileAssetInput(raw.fileAsset);
      for (const message of fileAsset.errors) issues.push(issue("fileAsset", "invalid_file_asset", message));
    }
  } else if (raw.fileAsset !== undefined) {
    issues.push(issue("fileAsset", "unsupported_field", `fileAsset is not supported for ${domain}.`));
  }
  const relationRules = CANONICAL_RELATION_CONTRACT[domain] || {};
  if (raw.relations !== undefined && !isPlainObject(raw.relations)) issues.push(issue("relations", "invalid_type", "relations must be an object."));
  if (isPlainObject(raw.relations)) {
    for (const key of Object.keys(raw.relations)) {
      if (!relationRules[key]) issues.push(issue(`relations.${key}`, "unknown_relation", `Unknown relation: ${key}.`));
    }
    for (const [name, rule] of Object.entries(relationRules)) {
      const value = raw.relations[name];
      if ((value == null || value === "") && !updating && rule.required) issues.push(issue(`relations.${name}`, "required", `${name} is required.`));
      else if (value != null && value !== "" && (typeof value !== "string" || !UUID_PATTERN.test(value))) issues.push(issue(`relations.${name}`, "invalid_uuid", `relations.${name} must be a valid UUID.`));
    }
  } else if (!updating) {
    for (const [name, rule] of Object.entries(relationRules)) if (rule.required) issues.push(issue(`relations.${name}`, "required", `${name} is required.`));
  }
  return { valid: issues.length === 0, issues };
}

export function isCanonicalUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
