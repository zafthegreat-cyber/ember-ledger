import { assertMoney } from "../intelligence/money.js";
import { INTELLIGENCE_CONFIDENCE } from "../intelligence/constants.js";
import {
  BOT_ATTEMPT_EVENTS,
  BOT_CAPABILITIES,
  BOT_EVIDENCE_REVIEW_STATES,
  BOT_FAILURE_CATEGORIES,
  BOT_INSTALLATION_HEALTH,
  BOT_INTEGRATION_MODES,
  BOT_OPS_FORMAT,
  BOT_PROVENANCE,
  BOT_PROVIDER_KEYS,
  BOT_PROXY_HEALTH,
  BOT_PROXY_TYPES,
  BOT_RECORD_STATUS,
  BOT_SCHEDULE_MODES,
  BOT_TASK_MODES,
  BOT_TASK_STATUSES,
} from "./constants.js";
import { assertSafeBotOpsInput, safeBotOpsClone } from "./security.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,199}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const RECORD_TYPES = Object.freeze({
  installations: "BOT_INSTALLATION",
  retailerAccountLinks: "RETAILER_ACCOUNT_LINK",
  botProfiles: "BOT_PROFILE",
  proxyGroups: "PROXY_GROUP",
  productTargets: "PRODUCT_TARGET",
  taskGroups: "BOT_TASK_GROUP",
  tasks: "BOT_TASK",
  attempts: "BOT_ATTEMPT",
  checkoutEvidence: "BOT_CHECKOUT_EVIDENCE",
  activity: "BOT_ACTIVITY",
});

export class BotOpsValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BotOpsValidationError";
    this.code = code;
    this.details = details;
  }
}

const enumSet = (values) => new Set(Object.values(values));

function plainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BotOpsValidationError("INVALID_OBJECT", `${field} must be a plain object.`, { field });
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new BotOpsValidationError("INVALID_OBJECT", `${field} must be a plain object.`, { field });
  }
  return value;
}

function text(value, field, maximum = 4_000, required = false) {
  if (value == null) value = "";
  if (typeof value !== "string") throw new BotOpsValidationError("INVALID_TEXT", `${field} must be text.`, { field });
  const normalized = value.trim();
  if (required && !normalized) throw new BotOpsValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
  if (normalized.length > maximum) throw new BotOpsValidationError("TEXT_TOO_LONG", `${field} is too long.`, { field });
  return normalized;
}

function id(value, field, required = false) {
  const normalized = text(value, field, 200, required);
  if (normalized && !ID_PATTERN.test(normalized)) throw new BotOpsValidationError("INVALID_ID", `${field} is invalid.`, { field });
  return normalized || null;
}

function optionalIso(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new BotOpsValidationError("INVALID_DATE", `${field} must be a valid date and time.`, { field });
  }
  return new Date(value).toISOString();
}

function enumValue(value, values, field, fallback) {
  const candidate = value == null || value === "" ? fallback : String(value).toUpperCase();
  if (!enumSet(values).has(candidate)) throw new BotOpsValidationError("INVALID_ENUM", `${field} has an unsupported value.`, { field, value });
  return candidate;
}

function boolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value !== "boolean") throw new BotOpsValidationError("INVALID_BOOLEAN", "Boolean fields must use true or false.");
  return value;
}

function integer(value, field, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
  if (value == null || value === "") return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BotOpsValidationError("INVALID_INTEGER", `${field} must be a bounded safe integer.`, { field });
  }
  return value;
}

function stringArray(value, field, maximum = 100) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new BotOpsValidationError("INVALID_ARRAY", `${field} must be a bounded array.`, { field });
  return [...new Set(value.map((entry) => text(entry, field, 300, true)))];
}

function idArray(value, field, maximum = 100) {
  return [...new Set(stringArray(value, field, maximum).map((entry) => id(entry, field, true)))];
}

function warnings(value) {
  return stringArray(value, "warnings", 100).map((entry) => entry.slice(0, 500));
}

function money(value, field) {
  if (value == null) return null;
  const normalized = assertMoney(value, { field });
  return { minorUnits: normalized.minorUnits, currency: normalized.currency };
}

function capabilitySnapshot(value, provider) {
  if (value == null) value = {};
  plainObject(value, "capabilitySnapshot");
  const allowed = new Set(Object.values(BOT_CAPABILITIES));
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BotOpsValidationError("UNKNOWN_CAPABILITY", `Unsupported capability: ${unknown[0]}.`);
  const normalized = Object.fromEntries([...allowed].map((key) => [key, boolean(value[key], false)]));
  if (provider !== BOT_PROVIDER_KEYS.MOCK && Object.values(normalized).some(Boolean)) {
    throw new BotOpsValidationError("LIVE_CAPABILITY_NOT_AVAILABLE", "Phase 2D-A live bot capabilities must remain disabled.");
  }
  return normalized;
}

function assertFields(input, fields, persisted) {
  assertSafeBotOpsInput(input);
  plainObject(input, "record");
  const allowed = new Set([...fields, "id", ...(persisted ? ["recordVersion", "createdAt", "updatedAt", "archivedAt"] : [])]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new BotOpsValidationError("UNKNOWN_FIELD", `Unsupported Bot Operations field: ${unknown[0]}.`, { fields: unknown });
}

function metadata(input, recordType, statusFallback = BOT_RECORD_STATUS.ACTIVE) {
  const format = input.format == null ? BOT_OPS_FORMAT : text(input.format, "format", 100, true);
  const suppliedType = input.recordType == null ? recordType : text(input.recordType, "recordType", 100, true);
  if (format !== BOT_OPS_FORMAT) throw new BotOpsValidationError("INVALID_FORMAT", "The Bot Operations format is unsupported.");
  if (suppliedType !== recordType) throw new BotOpsValidationError("INVALID_RECORD_TYPE", `Expected ${recordType}.`);
  return {
    ...(input.id ? { id: id(input.id, "id", true) } : {}),
    format,
    recordType,
    status: enumValue(input.status, BOT_RECORD_STATUS, "status", statusFallback),
    ...(input.recordVersion != null ? { recordVersion: integer(input.recordVersion, "recordVersion", { minimum: 1 }) } : {}),
    ...(input.createdAt ? { createdAt: optionalIso(input.createdAt, "createdAt") } : {}),
    ...(input.updatedAt ? { updatedAt: optionalIso(input.updatedAt, "updatedAt") } : {}),
    ...(input.archivedAt ? { archivedAt: optionalIso(input.archivedAt, "archivedAt") } : {}),
  };
}

const sharedFields = ["format", "recordType", "status"];

export function normalizeBotInstallation(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "provider", "friendlyName", "runtimeLabel", "connectionMode", "version", "healthState", "lastSeenAt", "capabilitySnapshot", "warnings", "enabled"];
  assertFields(input, fields, persisted);
  const provider = enumValue(input.provider, BOT_PROVIDER_KEYS, "provider", null);
  if (!provider) throw new BotOpsValidationError("REQUIRED_FIELD", "provider is required.");
  const healthState = enumValue(input.healthState, BOT_INSTALLATION_HEALTH, "healthState", BOT_INSTALLATION_HEALTH.DISCONNECTED);
  const enabled = boolean(input.enabled, false);
  if (provider !== BOT_PROVIDER_KEYS.MOCK
    && (enabled || ![BOT_INSTALLATION_HEALTH.DISCONNECTED, BOT_INSTALLATION_HEALTH.UNKNOWN, BOT_INSTALLATION_HEALTH.DISABLED].includes(healthState))) {
    throw new BotOpsValidationError("LIVE_INSTALLATION_STATE_PROHIBITED", "Hayha and Stellar must remain disconnected and disabled until a live adapter phase is authorized.");
  }
  return {
    ...metadata(input, RECORD_TYPES.installations), provider,
    friendlyName: text(input.friendlyName, "friendlyName", 200, true),
    runtimeLabel: text(input.runtimeLabel, "runtimeLabel", 200),
    connectionMode: enumValue(input.connectionMode, BOT_INTEGRATION_MODES, "connectionMode", provider === BOT_PROVIDER_KEYS.MOCK ? BOT_INTEGRATION_MODES.TEST_ONLY_MOCK : BOT_INTEGRATION_MODES.LOCAL_COMPANION),
    version: text(input.version, "version", 100),
    healthState,
    lastSeenAt: optionalIso(input.lastSeenAt, "lastSeenAt"),
    capabilitySnapshot: capabilitySnapshot(input.capabilitySnapshot, provider),
    warnings: warnings(input.warnings),
    enabled,
  };
}

export function normalizeRetailerAccountLink(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "retailerId", "accountOpsStoreAccountId", "accountOpsProfileId", "accountLabel", "aliasLabel", "installationIds", "taskGroupIds", "shippingProfileReference", "billingProfileReference", "phoneProfileReference", "warnings", "lastActivityAt"];
  assertFields(input, fields, persisted);
  return {
    ...metadata(input, RECORD_TYPES.retailerAccountLinks),
    retailerId: id(input.retailerId, "retailerId", true),
    accountOpsStoreAccountId: id(input.accountOpsStoreAccountId, "accountOpsStoreAccountId", true),
    accountOpsProfileId: id(input.accountOpsProfileId, "accountOpsProfileId"),
    accountLabel: text(input.accountLabel, "accountLabel", 200, true),
    aliasLabel: text(input.aliasLabel, "aliasLabel", 320),
    installationIds: idArray(input.installationIds, "installationIds"),
    taskGroupIds: idArray(input.taskGroupIds, "taskGroupIds"),
    shippingProfileReference: id(input.shippingProfileReference, "shippingProfileReference"),
    billingProfileReference: id(input.billingProfileReference, "billingProfileReference"),
    phoneProfileReference: id(input.phoneProfileReference, "phoneProfileReference"),
    warnings: warnings(input.warnings),
    lastActivityAt: optionalIso(input.lastActivityAt, "lastActivityAt"),
  };
}

export function normalizeBotProfile(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "displayName", "accountOpsProfileId", "shippingProfileReference", "billingProfileReference", "retailerCompatibility", "installationIds", "notes"];
  assertFields(input, fields, persisted);
  return {
    ...metadata(input, RECORD_TYPES.botProfiles),
    displayName: text(input.displayName, "displayName", 200, true),
    accountOpsProfileId: id(input.accountOpsProfileId, "accountOpsProfileId", true),
    shippingProfileReference: id(input.shippingProfileReference, "shippingProfileReference"),
    billingProfileReference: id(input.billingProfileReference, "billingProfileReference"),
    retailerCompatibility: idArray(input.retailerCompatibility, "retailerCompatibility"),
    installationIds: idArray(input.installationIds, "installationIds"),
    notes: text(input.notes, "notes", 16_000),
  };
}

export function normalizeProxyGroup(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "displayName", "proxyType", "providerLabel", "region", "installationIds", "retailerIds", "taskGroupIds", "healthState", "latencyMs", "lastCheckedAt", "warnings", "proxyCount"];
  assertFields(input, fields, persisted);
  return {
    ...metadata(input, RECORD_TYPES.proxyGroups),
    displayName: text(input.displayName, "displayName", 200, true),
    proxyType: enumValue(input.proxyType, BOT_PROXY_TYPES, "proxyType", BOT_PROXY_TYPES.UNKNOWN),
    providerLabel: text(input.providerLabel, "providerLabel", 200),
    region: text(input.region, "region", 100),
    installationIds: idArray(input.installationIds, "installationIds"),
    retailerIds: idArray(input.retailerIds, "retailerIds"),
    taskGroupIds: idArray(input.taskGroupIds, "taskGroupIds"),
    healthState: enumValue(input.healthState, BOT_PROXY_HEALTH, "healthState", BOT_PROXY_HEALTH.UNKNOWN),
    latencyMs: integer(input.latencyMs, "latencyMs", { maximum: 3_600_000 }),
    lastCheckedAt: optionalIso(input.lastCheckedAt, "lastCheckedAt"),
    warnings: warnings(input.warnings),
    proxyCount: integer(input.proxyCount, "proxyCount", { maximum: 100_000, fallback: 0 }),
  };
}

export function normalizeProductTarget(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "retailerId", "canonicalProductId", "sku", "tcin", "upc", "title", "category", "maxPrice", "referencePrice", "quantityLimit", "availabilityMode", "notes", "reviewState", "provenance"];
  assertFields(input, fields, persisted);
  const canonicalProductId = id(input.canonicalProductId, "canonicalProductId");
  const sku = text(input.sku, "sku", 200);
  const tcin = text(input.tcin, "tcin", 100);
  const upc = text(input.upc, "upc", 100);
  if (!canonicalProductId && !sku && !tcin && !upc) throw new BotOpsValidationError("PRODUCT_ID_REQUIRED", "A product target requires a stable product identifier.");
  return {
    ...metadata(input, RECORD_TYPES.productTargets),
    retailerId: id(input.retailerId, "retailerId", true), canonicalProductId, sku, tcin, upc,
    title: text(input.title, "title", 500, true), category: text(input.category, "category", 200),
    maxPrice: money(input.maxPrice, "maxPrice"), referencePrice: money(input.referencePrice, "referencePrice"),
    quantityLimit: integer(input.quantityLimit, "quantityLimit", { minimum: 1, maximum: 1_000, fallback: 1 }),
    availabilityMode: text(input.availabilityMode, "availabilityMode", 100) || "UNKNOWN",
    notes: text(input.notes, "notes", 16_000),
    reviewState: enumValue(input.reviewState, BOT_EVIDENCE_REVIEW_STATES, "reviewState", BOT_EVIDENCE_REVIEW_STATES.NEW),
    provenance: enumValue(input.provenance, BOT_PROVENANCE, "provenance", BOT_PROVENANCE.OWNER_ENTERED),
  };
}

export function normalizeTaskGroup(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "name", "retailerId", "productCategory", "provider", "installationId", "retailerAccountLinkId", "botProfileId", "proxyGroupId", "scheduleMode", "taskMode", "quantityLimit", "maxPrice", "enabled", "warnings"];
  assertFields(input, fields, persisted);
  const provider = enumValue(input.provider, BOT_PROVIDER_KEYS, "provider", null);
  if (!provider) throw new BotOpsValidationError("REQUIRED_FIELD", "provider is required.");
  const enabled = boolean(input.enabled, false);
  if (provider !== BOT_PROVIDER_KEYS.MOCK && enabled) {
    throw new BotOpsValidationError("LIVE_TASK_GROUP_PROHIBITED", "Task Groups for unconfigured live providers cannot be enabled.");
  }
  return {
    ...metadata(input, RECORD_TYPES.taskGroups), name: text(input.name, "name", 300, true),
    retailerId: id(input.retailerId, "retailerId", true), productCategory: text(input.productCategory, "productCategory", 200), provider,
    installationId: id(input.installationId, "installationId", true), retailerAccountLinkId: id(input.retailerAccountLinkId, "retailerAccountLinkId"),
    botProfileId: id(input.botProfileId, "botProfileId"), proxyGroupId: id(input.proxyGroupId, "proxyGroupId"),
    scheduleMode: enumValue(input.scheduleMode, BOT_SCHEDULE_MODES, "scheduleMode", BOT_SCHEDULE_MODES.MANUAL),
    taskMode: enumValue(input.taskMode, BOT_TASK_MODES, "taskMode", BOT_TASK_MODES.MANUAL_DRAFT),
    quantityLimit: integer(input.quantityLimit, "quantityLimit", { minimum: 1, maximum: 1_000, fallback: 1 }),
    maxPrice: money(input.maxPrice, "maxPrice"), enabled, warnings: warnings(input.warnings),
  };
}

export function normalizeBotTask(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "taskGroupId", "productTargetId", "retailerId", "provider", "installationId", "maxPrice", "quantityTarget", "taskMode", "retailerAccountLinkId", "botProfileId", "proxyGroupId", "runtimeStatus", "lastAttemptAt", "lastResult", "warnings", "providerReferenceId", "provenance"];
  assertFields(input, fields, persisted);
  const provider = enumValue(input.provider, BOT_PROVIDER_KEYS, "provider", null);
  if (!provider) throw new BotOpsValidationError("REQUIRED_FIELD", "provider is required.");
  const runtimeStatus = enumValue(input.runtimeStatus, BOT_TASK_STATUSES, "runtimeStatus", BOT_TASK_STATUSES.DRAFT);
  if (provider !== BOT_PROVIDER_KEYS.MOCK && ![BOT_TASK_STATUSES.DRAFT, BOT_TASK_STATUSES.READY, BOT_TASK_STATUSES.PAUSED, BOT_TASK_STATUSES.STOPPED, BOT_TASK_STATUSES.UNKNOWN].includes(runtimeStatus)) {
    throw new BotOpsValidationError("LIVE_TASK_STATUS_PROHIBITED", "Unconfigured live providers cannot report an active runtime status.");
  }
  return {
    ...metadata(input, RECORD_TYPES.tasks), taskGroupId: id(input.taskGroupId, "taskGroupId", true),
    productTargetId: id(input.productTargetId, "productTargetId", true), retailerId: id(input.retailerId, "retailerId", true), provider,
    installationId: id(input.installationId, "installationId", true), maxPrice: money(input.maxPrice, "maxPrice"),
    quantityTarget: integer(input.quantityTarget, "quantityTarget", { minimum: 1, maximum: 1_000, fallback: 1 }),
    taskMode: enumValue(input.taskMode, BOT_TASK_MODES, "taskMode", BOT_TASK_MODES.MANUAL_DRAFT),
    retailerAccountLinkId: id(input.retailerAccountLinkId, "retailerAccountLinkId"), botProfileId: id(input.botProfileId, "botProfileId"),
    proxyGroupId: id(input.proxyGroupId, "proxyGroupId"), runtimeStatus,
    lastAttemptAt: optionalIso(input.lastAttemptAt, "lastAttemptAt"), lastResult: text(input.lastResult, "lastResult", 500),
    warnings: warnings(input.warnings), providerReferenceId: id(input.providerReferenceId, "providerReferenceId"),
    provenance: enumValue(input.provenance, BOT_PROVENANCE, "provenance", BOT_PROVENANCE.OWNER_ENTERED),
  };
}

export function normalizeBotAttempt(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "providerEventKey", "providerEventId", "sourceHash", "provider", "installationId", "taskId", "retailerId", "occurredAt", "normalizedEvent", "runtimeStatus", "success", "failureCategory", "message", "productTargetId", "retailerAccountLinkId", "botProfileId", "proxyGroupId", "checkoutEvidenceId", "provenance", "eventRevision", "warnings"];
  assertFields(input, fields, persisted);
  const provider = enumValue(input.provider, BOT_PROVIDER_KEYS, "provider", null);
  if (!provider) throw new BotOpsValidationError("REQUIRED_FIELD", "provider is required.");
  const sourceHash = text(input.sourceHash, "sourceHash", 64, true).toLowerCase();
  if (!HASH_PATTERN.test(sourceHash)) throw new BotOpsValidationError("INVALID_SOURCE_HASH", "sourceHash must be a SHA-256 hex digest.");
  const normalizedEvent = enumValue(input.normalizedEvent, BOT_ATTEMPT_EVENTS, "normalizedEvent", BOT_ATTEMPT_EVENTS.UNKNOWN);
  const runtimeStatus = enumValue(input.runtimeStatus, BOT_TASK_STATUSES, "runtimeStatus", BOT_TASK_STATUSES.UNKNOWN);
  const success = boolean(input.success, false);
  const failureCategory = enumValue(input.failureCategory, BOT_FAILURE_CATEGORIES, "failureCategory", BOT_FAILURE_CATEGORIES.NONE);
  if (provider !== BOT_PROVIDER_KEYS.MOCK) throw new BotOpsValidationError("LIVE_PROVIDER_EVENT_PROHIBITED", "Phase 2D-A cannot persist live Hayha or Stellar events.");
  const hasSuccessSignal = normalizedEvent === BOT_ATTEMPT_EVENTS.CHECKOUT_SUCCEEDED || runtimeStatus === BOT_TASK_STATUSES.SUCCESS;
  if ((success || hasSuccessSignal)
    && (!success || normalizedEvent !== BOT_ATTEMPT_EVENTS.CHECKOUT_SUCCEEDED || runtimeStatus !== BOT_TASK_STATUSES.SUCCESS || failureCategory !== BOT_FAILURE_CATEGORIES.NONE)) {
    throw new BotOpsValidationError("INCONSISTENT_SUCCESS", "Successful attempts require a checkout-success event, SUCCESS status, and no failure category.");
  }
  return {
    ...metadata(input, RECORD_TYPES.attempts), providerEventKey: text(input.providerEventKey, "providerEventKey", 800, true),
    providerEventId: id(input.providerEventId, "providerEventId", true), sourceHash, provider,
    installationId: id(input.installationId, "installationId", true), taskId: id(input.taskId, "taskId", true),
    retailerId: id(input.retailerId, "retailerId", true), occurredAt: optionalIso(input.occurredAt, "occurredAt"),
    normalizedEvent, runtimeStatus, success, failureCategory,
    message: text(input.message, "message", 500), productTargetId: id(input.productTargetId, "productTargetId"),
    retailerAccountLinkId: id(input.retailerAccountLinkId, "retailerAccountLinkId"), botProfileId: id(input.botProfileId, "botProfileId"),
    proxyGroupId: id(input.proxyGroupId, "proxyGroupId"), checkoutEvidenceId: id(input.checkoutEvidenceId, "checkoutEvidenceId"),
    provenance: enumValue(input.provenance, BOT_PROVENANCE, "provenance", BOT_PROVENANCE.PROVIDER_NORMALIZED),
    eventRevision: integer(input.eventRevision, "eventRevision", { minimum: 1, maximum: 10_000, fallback: 1 }), warnings: warnings(input.warnings),
  };
}

export function normalizeCheckoutEvidence(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "evidenceKey", "sourceHash", "provider", "installationId", "taskId", "attemptId", "retailerId", "productTargetId", "quantity", "expectedAmount", "externalOrderReference", "retailerAccountLinkId", "botProfileId", "occurredAt", "confidence", "warnings", "provenance", "reviewState", "corrections", "reviewedAt", "orderCandidateLinks", "requiresOwnerReview", "purchaseCreated", "automaticPurchaseCreationAllowed", "inventoryCreated", "automaticReceivingAllowed"];
  assertFields(input, fields, persisted);
  const sourceHash = text(input.sourceHash, "sourceHash", 64, true).toLowerCase();
  if (!HASH_PATTERN.test(sourceHash)) throw new BotOpsValidationError("INVALID_SOURCE_HASH", "sourceHash must be a SHA-256 hex digest.");
  const corrections = input.corrections == null ? [] : input.corrections;
  if (!Array.isArray(corrections) || corrections.length > 100) throw new BotOpsValidationError("INVALID_CORRECTIONS", "corrections must be a bounded array.");
  const normalizedCorrections = corrections.map((entry, index) => {
    plainObject(entry, `corrections[${index}]`);
    const allowed = new Set(["field", "previousValue", "correctedValue", "correctedAt", "reason", "provenance"]);
    const unknown = Object.keys(entry).filter((key) => !allowed.has(key));
    if (unknown.length) throw new BotOpsValidationError("UNKNOWN_CORRECTION_FIELD", `Unsupported correction field: ${unknown[0]}.`);
    assertSafeBotOpsInput(entry, { path: `corrections[${index}]` });
    return {
      field: text(entry.field, `corrections[${index}].field`, 100, true),
      previousValue: text(entry.previousValue, `corrections[${index}].previousValue`, 500),
      correctedValue: text(entry.correctedValue, `corrections[${index}].correctedValue`, 500),
      correctedAt: optionalIso(entry.correctedAt, `corrections[${index}].correctedAt`),
      reason: text(entry.reason, `corrections[${index}].reason`, 500),
      provenance: enumValue(entry.provenance, BOT_PROVENANCE, `corrections[${index}].provenance`, BOT_PROVENANCE.OWNER_ENTERED),
    };
  });
  const orderCandidateLinks = input.orderCandidateLinks == null ? [] : input.orderCandidateLinks;
  if (!Array.isArray(orderCandidateLinks) || orderCandidateLinks.length > 100) throw new BotOpsValidationError("INVALID_ORDER_CANDIDATE_LINKS", "orderCandidateLinks must be a bounded array.");
  const normalizedLinks = orderCandidateLinks.map((entry, index) => {
    plainObject(entry, `orderCandidateLinks[${index}]`);
    const allowed = new Set(["orderCandidateId", "observedAt", "confidence", "sourceHash", "provenance"]);
    const unknown = Object.keys(entry).filter((key) => !allowed.has(key));
    if (unknown.length) throw new BotOpsValidationError("UNKNOWN_ORDER_CANDIDATE_LINK_FIELD", `Unsupported Order Candidate link field: ${unknown[0]}.`);
    assertSafeBotOpsInput(entry, { path: `orderCandidateLinks[${index}]` });
    const linkHash = text(entry.sourceHash, `orderCandidateLinks[${index}].sourceHash`, 64, true).toLowerCase();
    if (!HASH_PATTERN.test(linkHash)) throw new BotOpsValidationError("INVALID_SOURCE_HASH", "Order Candidate link sourceHash must be a SHA-256 hex digest.");
    return {
      orderCandidateId: id(entry.orderCandidateId, `orderCandidateLinks[${index}].orderCandidateId`, true),
      observedAt: optionalIso(entry.observedAt, `orderCandidateLinks[${index}].observedAt`),
      confidence: text(entry.confidence, `orderCandidateLinks[${index}].confidence`, 30) || "INSUFFICIENT",
      sourceHash: linkHash,
      provenance: enumValue(entry.provenance, BOT_PROVENANCE, `orderCandidateLinks[${index}].provenance`, BOT_PROVENANCE.SYSTEM_DERIVED),
    };
  });
  const reviewState = enumValue(input.reviewState, BOT_EVIDENCE_REVIEW_STATES, "reviewState", BOT_EVIDENCE_REVIEW_STATES.NEEDS_REVIEW);
  const requiresOwnerReview = [BOT_EVIDENCE_REVIEW_STATES.NEW, BOT_EVIDENCE_REVIEW_STATES.NEEDS_REVIEW, BOT_EVIDENCE_REVIEW_STATES.RECONCILED].includes(reviewState);
  if ((input.requiresOwnerReview != null && input.requiresOwnerReview !== requiresOwnerReview)
    || input.purchaseCreated === true || input.automaticPurchaseCreationAllowed === true
    || input.inventoryCreated === true || input.automaticReceivingAllowed === true) {
    throw new BotOpsValidationError("PURCHASE_BOUNDARY_VIOLATION", "Checkout Evidence is review-only and cannot create Purchases, receiving records, or inventory.");
  }
  return {
    ...metadata(input, RECORD_TYPES.checkoutEvidence), evidenceKey: text(input.evidenceKey, "evidenceKey", 800, true), sourceHash,
    provider: enumValue(input.provider, BOT_PROVIDER_KEYS, "provider", null), installationId: id(input.installationId, "installationId", true),
    taskId: id(input.taskId, "taskId", true), attemptId: id(input.attemptId, "attemptId", true), retailerId: id(input.retailerId, "retailerId", true),
    productTargetId: id(input.productTargetId, "productTargetId", true), quantity: integer(input.quantity, "quantity", { minimum: 1, maximum: 1_000, fallback: 1 }),
    expectedAmount: money(input.expectedAmount, "expectedAmount"), externalOrderReference: text(input.externalOrderReference, "externalOrderReference", 300),
    retailerAccountLinkId: id(input.retailerAccountLinkId, "retailerAccountLinkId"), botProfileId: id(input.botProfileId, "botProfileId"),
    occurredAt: optionalIso(input.occurredAt, "occurredAt"), confidence: enumValue(input.confidence, INTELLIGENCE_CONFIDENCE, "confidence", INTELLIGENCE_CONFIDENCE.INSUFFICIENT),
    warnings: warnings(input.warnings), provenance: enumValue(input.provenance, BOT_PROVENANCE, "provenance", BOT_PROVENANCE.SYSTEM_DERIVED),
    reviewState,
    corrections: normalizedCorrections, reviewedAt: optionalIso(input.reviewedAt, "reviewedAt"), orderCandidateLinks: normalizedLinks, requiresOwnerReview,
    purchaseCreated: false, automaticPurchaseCreationAllowed: false, inventoryCreated: false, automaticReceivingAllowed: false,
  };
}

export function normalizeBotActivity(input, { persisted = false } = {}) {
  const fields = [...sharedFields, "type", "summary", "occurredAt", "installationId", "taskGroupId", "taskId", "attemptId", "checkoutEvidenceId", "warnings"];
  assertFields(input, fields, persisted);
  return {
    ...metadata(input, RECORD_TYPES.activity), type: text(input.type, "type", 100, true),
    summary: text(input.summary, "summary", 500, true), occurredAt: optionalIso(input.occurredAt, "occurredAt"),
    installationId: id(input.installationId, "installationId"), taskGroupId: id(input.taskGroupId, "taskGroupId"),
    taskId: id(input.taskId, "taskId"), attemptId: id(input.attemptId, "attemptId"), checkoutEvidenceId: id(input.checkoutEvidenceId, "checkoutEvidenceId"),
    warnings: warnings(input.warnings),
  };
}

export const BOT_OPS_RECORD_NORMALIZERS = Object.freeze({
  installations: normalizeBotInstallation,
  retailerAccountLinks: normalizeRetailerAccountLink,
  botProfiles: normalizeBotProfile,
  proxyGroups: normalizeProxyGroup,
  productTargets: normalizeProductTarget,
  taskGroups: normalizeTaskGroup,
  tasks: normalizeBotTask,
  attempts: normalizeBotAttempt,
  checkoutEvidence: normalizeCheckoutEvidence,
  activity: normalizeBotActivity,
});

export const BOT_OPS_RECORD_TYPES = RECORD_TYPES;

export function normalizeBotOpsRecord(collection, input, options) {
  const normalizer = BOT_OPS_RECORD_NORMALIZERS[collection];
  if (!normalizer) throw new BotOpsValidationError("UNKNOWN_COLLECTION", `Unknown Bot Operations collection: ${collection}.`);
  return safeBotOpsClone(normalizer(input, options));
}
