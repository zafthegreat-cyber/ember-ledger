import { assertSafeAccountOpsInput } from "../security.js";
import {
  ACCOUNT_CREATION_STATES,
  ACCOUNT_OPS_AUTOMATION_BOUNDARIES,
  ACCOUNT_OPS_CLOUD_TEMPLATES,
  ACCOUNT_OPS_OPERATING_AREAS,
  ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION,
  ATTENTION_PRIORITIES,
  BROWSER_WORKSPACE_STATES,
  CAPTCHA_CHALLENGE_STATES,
  EXPORT_READINESS_STATES,
  EXPORT_SCHEMA_STATES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  PAYMENT_METADATA_STATES,
  PHONE_RESOURCE_STATES,
  PROXY_GROUP_HEALTH_STATES,
  REMOTE_ACCESS_STATES,
  SERVER_STATES,
  UNIFIED_ORDER_STATES,
  VERIFICATION_ACTION_KINDS,
  VERIFICATION_ACTION_STATES,
  WEBHOOK_DIRECTIONS,
  WEBHOOK_HEALTH_STATES,
  WORKSPACE_REFERENCE_TYPES,
} from "./constants.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const NORMALIZED_OPERATIONS_SNAPSHOTS = new WeakSet();
const COLLECTIONS = Object.freeze([
  "accountCreationPlans",
  "phoneResources",
  "paymentCards",
  "verificationActions",
  "proxyGroupViews",
  "exportReadiness",
  "webhookIntegrations",
  "serverRecords",
  "cloudTemplates",
  "remoteAccessRecords",
  "browserWorkspaces",
  "orderViews",
  "notificationPreferences",
  "workspaceReferences",
]);

export const ACCOUNT_OPS_OPERATIONS_COLLECTIONS = COLLECTIONS;

export class AccountOpsOperationsValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsOperationsValidationError";
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function finalizeOperationsSnapshot(value) {
  NORMALIZED_OPERATIONS_SNAPSHOTS.add(value);
  return deepFreeze(value);
}

function text(value, field, maximum = 300, required = false) {
  if (value == null) value = "";
  if (typeof value !== "string") throw new AccountOpsOperationsValidationError("INVALID_TEXT", `${field} must be text.`, { field });
  const normalized = value.trim();
  if (required && !normalized) throw new AccountOpsOperationsValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
  if (normalized.length > maximum) throw new AccountOpsOperationsValidationError("TEXT_TOO_LONG", `${field} is too long.`, { field });
  return normalized;
}

function id(value, field, required = false) {
  const normalized = text(value, field, 160, required);
  if (normalized && !ID_PATTERN.test(normalized)) throw new AccountOpsOperationsValidationError("INVALID_ID", `${field} is invalid.`, { field });
  return normalized || null;
}

function iso(value, field, required = false) {
  if (value == null || value === "") {
    if (required) throw new AccountOpsOperationsValidationError("REQUIRED_DATE", `${field} is required.`, { field });
    return null;
  }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new AccountOpsOperationsValidationError("INVALID_DATE", `${field} must be a valid date and time.`, { field });
  return new Date(value).toISOString();
}

function enumValue(value, values, field, fallback) {
  const allowed = new Set(Object.values(values));
  const normalized = String(value == null || value === "" ? fallback : value).toUpperCase();
  if (!allowed.has(normalized)) throw new AccountOpsOperationsValidationError("INVALID_ENUM", `${field} has an unsupported value.`, { field });
  return normalized;
}

function integer(value, field, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER, nullable = false } = {}) {
  if (value == null || value === "") {
    if (nullable) return null;
    value = 0;
  }
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AccountOpsOperationsValidationError("INVALID_INTEGER", `${field} must be a bounded safe integer.`, { field });
  }
  return value;
}

function currency(value, field = "currency") {
  const normalized = text(value || "USD", field, 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new AccountOpsOperationsValidationError("INVALID_CURRENCY", `${field} must be a three-letter currency code.`, { field });
  return normalized;
}

function strings(value, field, maximumItems = 30, maximumText = 200) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximumItems) throw new AccountOpsOperationsValidationError("INVALID_ARRAY", `${field} must be a bounded array.`, { field });
  return [...new Set(value.map((entry) => text(entry, field, maximumText, true)))];
}

function ids(value, field, maximumItems = 30) {
  return strings(value, field, maximumItems, 160).map((entry) => id(entry, field, true));
}

function strictRecord(input, fields, recordType) {
  assertSafeAccountOpsInput(input, { path: recordType });
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountOpsOperationsValidationError("INVALID_RECORD", `${recordType} must be a plain object.`);
  const unknown = Object.keys(input).filter((key) => !fields.includes(key));
  if (unknown.length) throw new AccountOpsOperationsValidationError("UNKNOWN_FIELD", `${recordType} contains an unsupported field.`, { recordType, field: unknown[0] });
}

function base(input, recordType) {
  return {
    id: id(input.id, `${recordType}.id`, true),
    recordVersion: integer(input.recordVersion ?? 1, `${recordType}.recordVersion`, { minimum: 1, maximum: 1_000_000 }),
    updatedAt: iso(input.updatedAt, `${recordType}.updatedAt`),
  };
}

function warnings(input, recordType) {
  return strings(input.warnings, `${recordType}.warnings`, 20, 400);
}

function safeReference(value, field) {
  if (value == null) return null;
  strictRecord(value, ["provider", "referenceId", "label", "status", "lastUpdatedAt"], field);
  return {
    provider: text(value.provider, `${field}.provider`, 80, true),
    referenceId: id(value.referenceId, `${field}.referenceId`),
    label: text(value.label, `${field}.label`, 160),
    status: text(value.status || "NOT_CONFIGURED", `${field}.status`, 64, true).toUpperCase(),
    lastUpdatedAt: iso(value.lastUpdatedAt, `${field}.lastUpdatedAt`),
  };
}

export function normalizeAccountCreationPlan(input = {}) {
  const type = "AccountCreationPlan";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "retailerId", "accountLabel", "emailReference", "phoneReference", "shippingProfileId", "billingProfileId", "credentialReference", "creationState", "verificationRequirements", "warnings", "provenance"], type);
  return deepFreeze({
    ...base(input, type),
    retailerId: id(input.retailerId, `${type}.retailerId`, true),
    accountLabel: text(input.accountLabel, `${type}.accountLabel`, 160, true),
    emailReference: id(input.emailReference, `${type}.emailReference`),
    phoneReference: id(input.phoneReference, `${type}.phoneReference`),
    shippingProfileId: id(input.shippingProfileId, `${type}.shippingProfileId`),
    billingProfileId: id(input.billingProfileId, `${type}.billingProfileId`),
    credentialReference: safeReference(input.credentialReference, `${type}.credentialReference`),
    creationState: enumValue(input.creationState, ACCOUNT_CREATION_STATES, `${type}.creationState`, ACCOUNT_CREATION_STATES.DRAFT),
    verificationRequirements: strings(input.verificationRequirements, `${type}.verificationRequirements`, 12, 80),
    warnings: warnings(input, type),
    provenance: text(input.provenance || "OWNER_DRAFT", `${type}.provenance`, 80, true).toUpperCase(),
    authoritative: false,
    automaticSignupAllowed: false,
  });
}

export function normalizePhoneResource(input = {}) {
  const type = "PhoneResource";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "providerLabel", "label", "region", "retailerIds", "accountIds", "availability", "verificationState", "expiresAt", "lastUsedAt", "warnings"], type);
  return deepFreeze({ ...base(input, type), providerLabel: text(input.providerLabel, `${type}.providerLabel`, 120), label: text(input.label, `${type}.label`, 160, true), region: text(input.region, `${type}.region`, 80), retailerIds: ids(input.retailerIds, `${type}.retailerIds`), accountIds: ids(input.accountIds, `${type}.accountIds`), availability: enumValue(input.availability, PHONE_RESOURCE_STATES, `${type}.availability`, PHONE_RESOURCE_STATES.AVAILABLE), verificationState: text(input.verificationState || "UNKNOWN", `${type}.verificationState`, 64, true).toUpperCase(), expiresAt: iso(input.expiresAt, `${type}.expiresAt`), lastUsedAt: iso(input.lastUsedAt, `${type}.lastUsedAt`), warnings: warnings(input, type), containsPhoneNumber: false, containsVerificationValue: false });
}

export function normalizePaymentCardMetadata(input = {}) {
  const type = "PaymentCardMetadata";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "cardAlias", "providerLabel", "last4", "expirationMonth", "expirationYear", "status", "profileId", "retailerId", "accountId", "spendingLimitMinor", "currency", "warnings"], type);
  const last4 = text(input.last4, `${type}.last4`, 4);
  if (last4 && !/^\d{4}$/.test(last4)) throw new AccountOpsOperationsValidationError("INVALID_LAST4", "Payment card metadata may contain exactly four trailing digits only.");
  const month = integer(input.expirationMonth, `${type}.expirationMonth`, { minimum: 1, maximum: 12, nullable: true });
  const year = integer(input.expirationYear, `${type}.expirationYear`, { minimum: 2020, maximum: 2200, nullable: true });
  if ((month == null) !== (year == null)) throw new AccountOpsOperationsValidationError("INCOMPLETE_EXPIRATION", "Expiration month and year must be supplied together.");
  return deepFreeze({ ...base(input, type), cardAlias: text(input.cardAlias, `${type}.cardAlias`, 120, true), providerLabel: text(input.providerLabel, `${type}.providerLabel`, 120), last4: last4 || null, expirationMonth: month, expirationYear: year, status: enumValue(input.status, PAYMENT_METADATA_STATES, `${type}.status`, PAYMENT_METADATA_STATES.UNKNOWN), profileId: id(input.profileId, `${type}.profileId`), retailerId: id(input.retailerId, `${type}.retailerId`), accountId: id(input.accountId, `${type}.accountId`), spendingLimitMinor: integer(input.spendingLimitMinor, `${type}.spendingLimitMinor`, { minimum: 0, maximum: Number.MAX_SAFE_INTEGER, nullable: true }), currency: currency(input.currency), warnings: warnings(input, type), containsFullCardNumber: false, containsSecurityCode: false });
}

export function normalizeVerificationAction(input = {}) {
  const type = "VerificationAction";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "kind", "state", "challengeState", "retailerId", "accountId", "workflowLabel", "createdAt", "expiresAt", "safeInstruction", "resumeAllowed", "warnings"], type);
  const kind = enumValue(input.kind, VERIFICATION_ACTION_KINDS, `${type}.kind`, VERIFICATION_ACTION_KINDS.SECURITY_PROMPT);
  const challengeState = enumValue(input.challengeState, CAPTCHA_CHALLENGE_STATES, `${type}.challengeState`, CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE);
  if (kind !== VERIFICATION_ACTION_KINDS.CAPTCHA && challengeState !== CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE) throw new AccountOpsOperationsValidationError("CAPTCHA_STATE_MISMATCH", "Only CAPTCHA actions may use a CAPTCHA challenge state.");
  return deepFreeze({ ...base(input, type), kind, state: enumValue(input.state, VERIFICATION_ACTION_STATES, `${type}.state`, VERIFICATION_ACTION_STATES.ACTION_REQUIRED), challengeState, retailerId: id(input.retailerId, `${type}.retailerId`), accountId: id(input.accountId, `${type}.accountId`), workflowLabel: text(input.workflowLabel, `${type}.workflowLabel`, 180, true), createdAt: iso(input.createdAt, `${type}.createdAt`, true), expiresAt: iso(input.expiresAt, `${type}.expiresAt`), safeInstruction: text(input.safeInstruction, `${type}.safeInstruction`, 500), resumeAllowed: input.resumeAllowed === true, warnings: warnings(input, type), humanCompletionRequired: true, verificationValueStored: false });
}

export function normalizeProxyGroupView(input = {}) {
  const type = "ProxyGroupView";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "groupLabel", "providerLabel", "proxyType", "region", "count", "health", "latencyMs", "assignments", "expiresAt", "warnings"], type);
  return deepFreeze({ ...base(input, type), groupLabel: text(input.groupLabel, `${type}.groupLabel`, 160, true), providerLabel: text(input.providerLabel, `${type}.providerLabel`, 120), proxyType: text(input.proxyType, `${type}.proxyType`, 80), region: text(input.region, `${type}.region`, 80), count: integer(input.count, `${type}.count`, { minimum: 0, maximum: 100_000 }), health: enumValue(input.health, PROXY_GROUP_HEALTH_STATES, `${type}.health`, PROXY_GROUP_HEALTH_STATES.UNKNOWN), latencyMs: integer(input.latencyMs, `${type}.latencyMs`, { minimum: 0, maximum: 600_000, nullable: true }), assignments: strings(input.assignments, `${type}.assignments`, 30, 160), expiresAt: iso(input.expiresAt, `${type}.expiresAt`), warnings: warnings(input, type), containsEndpoint: false, containsAuthentication: false });
}

export function normalizeExportReadiness(input = {}) {
  const type = "ExportReadiness";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "provider", "readinessState", "supportedExportTypes", "schemaState", "profilesReady", "accountsReady", "proxiesReady", "productReadiness", "warnings", "compatibilityNote"], type);
  return deepFreeze({ ...base(input, type), provider: text(input.provider, `${type}.provider`, 80, true).toUpperCase(), readinessState: enumValue(input.readinessState, EXPORT_READINESS_STATES, `${type}.readinessState`, EXPORT_READINESS_STATES.NOT_READY), supportedExportTypes: strings(input.supportedExportTypes, `${type}.supportedExportTypes`, 12, 100), schemaState: enumValue(input.schemaState, EXPORT_SCHEMA_STATES, `${type}.schemaState`, EXPORT_SCHEMA_STATES.UNVERIFIED), profilesReady: integer(input.profilesReady, `${type}.profilesReady`, { minimum: 0, maximum: 100_000 }), accountsReady: integer(input.accountsReady, `${type}.accountsReady`, { minimum: 0, maximum: 100_000 }), proxiesReady: integer(input.proxiesReady, `${type}.proxiesReady`, { minimum: 0, maximum: 100_000 }), productReadiness: text(input.productReadiness || "NOT_REVIEWED", `${type}.productReadiness`, 80, true).toUpperCase(), warnings: warnings(input, type), compatibilityNote: text(input.compatibilityNote, `${type}.compatibilityNote`, 500), providerCapabilityVerified: false, liveConnection: false, directExportAllowed: false });
}

export function normalizeWebhookIntegration(input = {}) {
  const type = "WebhookIntegration";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "providerLabel", "direction", "eventTypes", "enabled", "lastEventAt", "health", "warnings"], type);
  if (input.enabled === true) throw new AccountOpsOperationsValidationError("LIVE_WEBHOOK_FORBIDDEN", "Live webhook integrations are not enabled in this phase.");
  return deepFreeze({ ...base(input, type), providerLabel: text(input.providerLabel, `${type}.providerLabel`, 120, true), direction: enumValue(input.direction, WEBHOOK_DIRECTIONS, `${type}.direction`, WEBHOOK_DIRECTIONS.INBOUND), eventTypes: strings(input.eventTypes, `${type}.eventTypes`, 30, 100), enabled: false, lastEventAt: iso(input.lastEventAt, `${type}.lastEventAt`), health: enumValue(input.health, WEBHOOK_HEALTH_STATES, `${type}.health`, WEBHOOK_HEALTH_STATES.NOT_CONFIGURED), warnings: warnings(input, type), endpointConfigured: false, containsSecret: false });
}

export function normalizeServerRecord(input = {}) {
  const type = "ServerRecord";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "friendlyName", "providerLabel", "region", "osLabel", "purpose", "status", "lastSeenAt", "cpuSummary", "memorySummary", "estimatedCostMinor", "currency", "assignedBots", "remoteAccessMethod", "warnings"], type);
  return deepFreeze({ ...base(input, type), friendlyName: text(input.friendlyName, `${type}.friendlyName`, 160, true), providerLabel: text(input.providerLabel, `${type}.providerLabel`, 120), region: text(input.region, `${type}.region`, 80), osLabel: text(input.osLabel, `${type}.osLabel`, 120), purpose: text(input.purpose, `${type}.purpose`, 240), status: enumValue(input.status, SERVER_STATES, `${type}.status`, SERVER_STATES.UNKNOWN), lastSeenAt: iso(input.lastSeenAt, `${type}.lastSeenAt`), cpuSummary: text(input.cpuSummary, `${type}.cpuSummary`, 120), memorySummary: text(input.memorySummary, `${type}.memorySummary`, 120), estimatedCostMinor: integer(input.estimatedCostMinor, `${type}.estimatedCostMinor`, { minimum: 0, maximum: Number.MAX_SAFE_INTEGER, nullable: true }), currency: currency(input.currency), assignedBots: strings(input.assignedBots, `${type}.assignedBots`, 20, 120), remoteAccessMethod: text(input.remoteAccessMethod, `${type}.remoteAccessMethod`, 80), warnings: warnings(input, type), liveControlEnabled: false });
}

export function normalizeCloudTemplate(input = {}) {
  const type = "CloudTemplate";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "templateLabel", "providerLabel", "region", "sizeClass", "estimatedCostMinor", "currency", "diskGb", "purpose", "recommendedBotCapacity", "provisioningEnabled", "warnings"], type);
  if (input.provisioningEnabled === true) throw new AccountOpsOperationsValidationError("PROVISIONING_FORBIDDEN", "Cloud provisioning is not enabled in this phase.");
  return deepFreeze({ ...base(input, type), templateLabel: text(input.templateLabel, `${type}.templateLabel`, 160, true), providerLabel: text(input.providerLabel, `${type}.providerLabel`, 120) || "Not selected", region: text(input.region, `${type}.region`, 80) || "Not selected", sizeClass: text(input.sizeClass, `${type}.sizeClass`, 100, true), estimatedCostMinor: integer(input.estimatedCostMinor, `${type}.estimatedCostMinor`, { minimum: 0, maximum: Number.MAX_SAFE_INTEGER, nullable: true }), currency: currency(input.currency), diskGb: integer(input.diskGb, `${type}.diskGb`, { minimum: 1, maximum: 100_000, nullable: true }), purpose: text(input.purpose, `${type}.purpose`, 240, true), recommendedBotCapacity: integer(input.recommendedBotCapacity, `${type}.recommendedBotCapacity`, { minimum: 0, maximum: 10_000, nullable: true }), provisioningEnabled: false, warnings: warnings(input, type) });
}

export function normalizeRemoteAccessRecord(input = {}) {
  const type = "RemoteAccessRecord";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "serverId", "accessType", "state", "lastConnectedAt", "operatorLabel", "warnings", "connectionEnabled"], type);
  if (input.connectionEnabled === true) throw new AccountOpsOperationsValidationError("REMOTE_CONNECTION_FORBIDDEN", "Remote connections are not enabled in this phase.");
  return deepFreeze({ ...base(input, type), serverId: id(input.serverId, `${type}.serverId`, true), accessType: text(input.accessType, `${type}.accessType`, 80, true), state: enumValue(input.state, REMOTE_ACCESS_STATES, `${type}.state`, REMOTE_ACCESS_STATES.UNKNOWN), lastConnectedAt: iso(input.lastConnectedAt, `${type}.lastConnectedAt`), operatorLabel: text(input.operatorLabel, `${type}.operatorLabel`, 120), warnings: warnings(input, type), connectionEnabled: false });
}

export function normalizeBrowserWorkspace(input = {}) {
  const type = "BrowserWorkspace";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "profileId", "retailerId", "accountId", "state", "tabCount", "extensionLabels", "autofillProfileId", "lastActiveAt", "warnings", "antiDetectionEnabled"], type);
  if (input.antiDetectionEnabled === true) throw new AccountOpsOperationsValidationError("ANTI_DETECTION_FORBIDDEN", "Detection-evasion browser behavior is prohibited.");
  return deepFreeze({ ...base(input, type), profileId: id(input.profileId, `${type}.profileId`, true), retailerId: id(input.retailerId, `${type}.retailerId`), accountId: id(input.accountId, `${type}.accountId`), state: enumValue(input.state, BROWSER_WORKSPACE_STATES, `${type}.state`, BROWSER_WORKSPACE_STATES.CLOSED), tabCount: integer(input.tabCount, `${type}.tabCount`, { minimum: 0, maximum: 500 }), extensionLabels: strings(input.extensionLabels, `${type}.extensionLabels`, 30, 120), autofillProfileId: id(input.autofillProfileId, `${type}.autofillProfileId`), lastActiveAt: iso(input.lastActiveAt, `${type}.lastActiveAt`), warnings: warnings(input, type), antiDetectionEnabled: false, cookieCaptureAllowed: false });
}

export function normalizeUnifiedOrderView(input = {}) {
  const type = "UnifiedOrderView";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "retailerId", "accountId", "orderCandidateId", "purchaseId", "shipmentReferences", "receivingStatus", "inventoryStatus", "status", "externalOrderReference", "warnings"], type);
  return deepFreeze({ ...base(input, type), retailerId: id(input.retailerId, `${type}.retailerId`, true), accountId: id(input.accountId, `${type}.accountId`), orderCandidateId: id(input.orderCandidateId, `${type}.orderCandidateId`), purchaseId: id(input.purchaseId, `${type}.purchaseId`), shipmentReferences: strings(input.shipmentReferences, `${type}.shipmentReferences`, 20, 160), receivingStatus: text(input.receivingStatus || "NOT_RECEIVED", `${type}.receivingStatus`, 80, true).toUpperCase(), inventoryStatus: text(input.inventoryStatus || "NOT_CREATED", `${type}.inventoryStatus`, 80, true).toUpperCase(), status: enumValue(input.status, UNIFIED_ORDER_STATES, `${type}.status`, UNIFIED_ORDER_STATES.UNKNOWN), externalOrderReference: text(input.externalOrderReference, `${type}.externalOrderReference`, 160), warnings: warnings(input, type), authoritative: false, purchaseMutationAllowed: false, inventoryMutationAllowed: false });
}

export function normalizeNotificationPreference(input = {}) {
  const type = "NotificationPreference";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "category", "channelPreferences", "warnings"], type);
  if (!NOTIFICATION_CATEGORIES.includes(input.category)) throw new AccountOpsOperationsValidationError("INVALID_NOTIFICATION_CATEGORY", "Notification category is unsupported.");
  const preferences = input.channelPreferences || {};
  strictRecord(preferences, NOTIFICATION_CHANNELS, `${type}.channelPreferences`);
  return deepFreeze({ ...base(input, type), category: input.category, channelPreferences: Object.fromEntries(NOTIFICATION_CHANNELS.map((channel) => [channel, preferences[channel] === true])), warnings: warnings(input, type), liveDeliveryEnabled: false });
}

export function normalizeWorkspaceReference(input = {}) {
  const type = "WorkspaceReference";
  strictRecord(input, ["id", "recordVersion", "updatedAt", "referenceType", "sourceReference", "label", "detail", "area", "attentionPriority", "warnings"], type);
  const area = text(input.area, `${type}.area`, 40, true).toLowerCase();
  if (!ACCOUNT_OPS_OPERATING_AREAS.some((candidate) => candidate.key === area)) {
    throw new AccountOpsOperationsValidationError("INVALID_AREA", `${type}.area is unsupported.`, { field: `${type}.area` });
  }
  return deepFreeze({
    ...base(input, type),
    referenceType: enumValue(input.referenceType, WORKSPACE_REFERENCE_TYPES, `${type}.referenceType`, WORKSPACE_REFERENCE_TYPES.INVENTORY),
    sourceReference: id(input.sourceReference, `${type}.sourceReference`, true),
    label: text(input.label, `${type}.label`, 180, true),
    detail: text(input.detail, `${type}.detail`, 300),
    area,
    attentionPriority: input.attentionPriority == null || input.attentionPriority === "" ? null : enumValue(input.attentionPriority, ATTENTION_PRIORITIES, `${type}.attentionPriority`, ATTENTION_PRIORITIES.NORMAL),
    warnings: warnings(input, type),
    navigationOnly: true,
    authoritative: false,
    mutationAllowed: false,
  });
}

const NORMALIZERS = Object.freeze({
  accountCreationPlans: normalizeAccountCreationPlan,
  phoneResources: normalizePhoneResource,
  paymentCards: normalizePaymentCardMetadata,
  verificationActions: normalizeVerificationAction,
  proxyGroupViews: normalizeProxyGroupView,
  exportReadiness: normalizeExportReadiness,
  webhookIntegrations: normalizeWebhookIntegration,
  serverRecords: normalizeServerRecord,
  cloudTemplates: normalizeCloudTemplate,
  remoteAccessRecords: normalizeRemoteAccessRecord,
  browserWorkspaces: normalizeBrowserWorkspace,
  orderViews: normalizeUnifiedOrderView,
  notificationPreferences: normalizeNotificationPreference,
  workspaceReferences: normalizeWorkspaceReference,
});

export function createEmptyAccountOpsOperationsSnapshot() {
  return finalizeOperationsSnapshot({
    contractVersion: ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION,
    ...Object.fromEntries(COLLECTIONS.map((collection) => [collection, collection === "cloudTemplates"
      ? ACCOUNT_OPS_CLOUD_TEMPLATES.map((template) => normalizeCloudTemplate({ ...template, recordVersion: 1, updatedAt: null, providerLabel: "Not selected", region: "Not selected", estimatedCostMinor: null, currency: "USD", provisioningEnabled: false, warnings: [] }))
      : []])),
    boundaries: clone(ACCOUNT_OPS_AUTOMATION_BOUNDARIES),
    persisted: false,
    authoritative: false,
  });
}

export function normalizeAccountOpsOperationsSnapshot(input = {}) {
  if (input && typeof input === "object" && NORMALIZED_OPERATIONS_SNAPSHOTS.has(input)) return input;
  assertSafeAccountOpsInput(input, { path: "AccountOpsOperationsSnapshot" });
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountOpsOperationsValidationError("INVALID_SNAPSHOT", "Account Ops operations input must be an object.");
  const allowed = new Set(["contractVersion", ...COLLECTIONS]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new AccountOpsOperationsValidationError("UNKNOWN_SNAPSHOT_FIELD", "Account Ops operations input contains an unsupported collection.", { field: unknown[0] });
  if (input.contractVersion && input.contractVersion !== ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION) throw new AccountOpsOperationsValidationError("UNSUPPORTED_CONTRACT", "Account Ops operations contract version is unsupported.");
  const empty = createEmptyAccountOpsOperationsSnapshot();
  const normalized = { contractVersion: ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION };
  for (const collection of COLLECTIONS) {
    const rows = input[collection] == null ? empty[collection] : input[collection];
    if (!Array.isArray(rows) || rows.length > 1_000) throw new AccountOpsOperationsValidationError("INVALID_COLLECTION", `${collection} must be a bounded array.`, { collection });
    const seen = new Set();
    normalized[collection] = rows.map((row) => {
      const record = NORMALIZERS[collection](row);
      if (seen.has(record.id)) throw new AccountOpsOperationsValidationError("DUPLICATE_ID", `${collection} contains a duplicate ID.`, { collection });
      seen.add(record.id);
      return record;
    });
  }
  normalized.boundaries = clone(ACCOUNT_OPS_AUTOMATION_BOUNDARIES);
  normalized.persisted = false;
  normalized.authoritative = false;
  return finalizeOperationsSnapshot(normalized);
}

export function normalizeAttentionPriority(value) {
  return enumValue(value, ATTENTION_PRIORITIES, "attention.priority", ATTENTION_PRIORITIES.NORMAL);
}

export function assertOperationsSnapshotIsEphemeral(snapshot) {
  if (!snapshot || snapshot.persisted !== false || snapshot.authoritative !== false) throw new AccountOpsOperationsValidationError("EPHEMERAL_BOUNDARY_REQUIRED", "Account Ops operations projections must remain non-authoritative and non-persisted.");
  if (Object.values(snapshot.boundaries || {}).some(Boolean)) throw new AccountOpsOperationsValidationError("LIVE_CAPABILITY_FORBIDDEN", "Account Ops operations projections cannot enable a live capability.");
  return true;
}
