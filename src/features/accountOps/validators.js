import {
  ACCOUNT_OPS_PROVENANCE,
  ACCOUNT_SETUP_STAGES,
  ACCOUNT_TASK_PRIORITIES,
  ACCOUNT_TASK_STATUSES,
  ACCOUNT_TASK_TYPES,
  ALIAS_PROVISIONING_STATES,
  CREDENTIAL_REFERENCE_PROVIDERS,
  EMAIL_ALIAS_STATUSES,
  EMAIL_DOMAIN_MODES,
  EMAIL_DOMAIN_STATUSES,
  RECORD_STATUS,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
} from "./constants.js";
import { assertSafeAccountOpsInput } from "./security.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const LOCAL_PART_PATTERN = /^(?=.{1,64}$)[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/i;

export class AccountOpsValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsValidationError";
    this.code = code;
    this.details = details;
  }
}

function enumValues(values) { return new Set(Object.values(values)); }
function text(value, field, maximum = 4_000, required = false) {
  if (value == null) value = "";
  if (typeof value !== "string") throw new AccountOpsValidationError("INVALID_TEXT", `${field} must be text.`, { field });
  const normalized = value.trim();
  if (required && !normalized) throw new AccountOpsValidationError("REQUIRED_FIELD", `${field} is required.`, { field });
  if (normalized.length > maximum) throw new AccountOpsValidationError("TEXT_TOO_LONG", `${field} is too long.`, { field });
  return normalized;
}
function optionalIso(value, field) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new AccountOpsValidationError("INVALID_DATE", `${field} must be a valid date and time.`, { field });
  return new Date(value).toISOString();
}
function boolean(value, fallback = false) { return value == null ? fallback : value === true; }
function enumValue(value, values, field, fallback) {
  const candidate = value == null || value === "" ? fallback : String(value).toUpperCase();
  if (!enumValues(values).has(candidate)) throw new AccountOpsValidationError("INVALID_ENUM", `${field} has an unsupported value.`, { field, value });
  return candidate;
}
function id(value, field, required = false) {
  const normalized = text(value, field, 160, required);
  if (normalized && !ID_PATTERN.test(normalized)) throw new AccountOpsValidationError("INVALID_ID", `${field} is invalid.`, { field });
  return normalized || null;
}
function url(value, field) {
  const normalized = text(value, field, 2_048);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("scheme");
    if (parsed.username || parsed.password || parsed.hash) throw new Error("credentials");
    for (const key of parsed.searchParams.keys()) {
      const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (/(?:accesstoken|refreshtoken|idtoken|authtoken|bearertoken|password|passphrase|secret|apikey|privatekey|session|sessionid|cookie|otp|onetimecode|onetimepin|verificationcode|credentials?)/i.test(normalizedKey)) {
        throw new Error("credentials");
      }
    }
    return parsed.toString();
  } catch {
    throw new AccountOpsValidationError("INVALID_URL", `${field} must be a safe HTTP or HTTPS URL without embedded credentials.`, { field });
  }
}
function stringArray(value, field, maximum = 50) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new AccountOpsValidationError("INVALID_ARRAY", `${field} must be a bounded array.`, { field });
  return [...new Set(value.map((entry) => text(entry, field, 200, true)))];
}
function safeMetadata(value, field) {
  if (value == null) return {};
  assertSafeAccountOpsInput(value, { path: field });
  if (typeof value !== "object" || Array.isArray(value)) throw new AccountOpsValidationError("INVALID_OBJECT", `${field} must be an object.`, { field });
  return JSON.parse(JSON.stringify(value));
}
function assertFields(input, fields, persisted) {
  assertSafeAccountOpsInput(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountOpsValidationError("INVALID_RECORD", "A plain record is required.");
  const permitted = new Set([...fields, "id", ...(persisted ? ["recordVersion", "createdAt", "updatedAt", "archivedAt"] : [])]);
  const unknown = Object.keys(input).filter((key) => !permitted.has(key));
  if (unknown.length) throw new AccountOpsValidationError("UNKNOWN_FIELD", `Unsupported Account Ops field: ${unknown[0]}.`, { fields: unknown });
}
function metadata(input, statusFallback = RECORD_STATUS.ACTIVE) {
  return {
    ...(input.id ? { id: id(input.id, "id", true) } : {}),
    status: text(input.status, "status", 64) || statusFallback,
    ...(input.recordVersion != null ? { recordVersion: Number(input.recordVersion) } : {}),
    ...(input.createdAt ? { createdAt: optionalIso(input.createdAt, "createdAt") } : {}),
    ...(input.updatedAt ? { updatedAt: optionalIso(input.updatedAt, "updatedAt") } : {}),
    ...(input.archivedAt ? { archivedAt: optionalIso(input.archivedAt, "archivedAt") } : {}),
  };
}

export function validateDomainName(value) {
  const normalized = text(value, "domain", 253, true).toLowerCase().replace(/^@/, "");
  if (!DOMAIN_PATTERN.test(normalized)) throw new AccountOpsValidationError("INVALID_DOMAIN", "Enter a valid business email domain.");
  return normalized;
}
export function validateEmailLocalPart(value) {
  const normalized = text(value, "localPart", 64, true).toLowerCase();
  if (!LOCAL_PART_PATTERN.test(normalized) || normalized.startsWith(".") || normalized.endsWith(".") || normalized.includes("..")) {
    throw new AccountOpsValidationError("INVALID_LOCAL_PART", "The generated email local part is invalid.");
  }
  return normalized;
}
export function validateEmailAddress(value) {
  const normalized = text(value, "aliasAddress", 254, true).toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator < 1) throw new AccountOpsValidationError("INVALID_EMAIL", "Enter a valid email address.");
  const localPart = validateEmailLocalPart(normalized.slice(0, separator));
  const domain = validateDomainName(normalized.slice(separator + 1));
  return { aliasAddress: `${localPart}@${domain}`, localPart, domain };
}

export function normalizeCredentialReference(value) {
  if (value == null) return null;
  assertSafeAccountOpsInput(value, { path: "credentialReference" });
  if (typeof value !== "object" || Array.isArray(value)) throw new AccountOpsValidationError("INVALID_CREDENTIAL_REFERENCE", "credentialReference must be an object.");
  const allowed = new Set(["provider", "referenceId", "label", "lastUpdatedAt"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new AccountOpsValidationError("INVALID_CREDENTIAL_REFERENCE", "Credential references may contain metadata only.");
  const provider = enumValue(value.provider, CREDENTIAL_REFERENCE_PROVIDERS, "credentialReference.provider", CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE);
  const referenceId = text(value.referenceId, "credentialReference.referenceId", 500);
  if (provider !== CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE && !referenceId) throw new AccountOpsValidationError("CREDENTIAL_REFERENCE_REQUIRED", "The selected secure store requires a reference ID.");
  if (provider === CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE && referenceId) throw new AccountOpsValidationError("CREDENTIAL_REFERENCE_UNAVAILABLE", "An unavailable secure store cannot retain a reference ID.");
  return { provider, referenceId: referenceId || null, label: text(value.label, "credentialReference.label", 200), lastUpdatedAt: optionalIso(value.lastUpdatedAt, "credentialReference.lastUpdatedAt") };
}

const groupFields = ["displayName", "description", "status"];
export function normalizeProfileGroup(input, { persisted = false } = {}) {
  assertFields(input, groupFields, persisted);
  return {
    ...metadata(input),
    status: enumValue(input.status, RECORD_STATUS, "status", RECORD_STATUS.ACTIVE),
    displayName: text(input.displayName, "displayName", 160, true),
    description: text(input.description, "description", 1_000),
  };
}

function address(value, field) {
  if (value == null) return null;
  const raw = safeMetadata(value, field);
  const allowed = new Set(["line1", "line2", "city", "region", "postalCode", "country"]);
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length) throw new AccountOpsValidationError("UNKNOWN_ADDRESS_FIELD", `${field} contains an unsupported field.`);
  return {
    line1: text(raw.line1, `${field}.line1`, 300), line2: text(raw.line2, `${field}.line2`, 300),
    city: text(raw.city, `${field}.city`, 160), region: text(raw.region, `${field}.region`, 160),
    postalCode: text(raw.postalCode, `${field}.postalCode`, 40), country: text(raw.country, `${field}.country`, 80),
  };
}
const profileFields = ["displayName", "aliasLabel", "profileGroupId", "fullName", "businessName", "emailPreference", "phone", "shippingAddress", "billingAddress", "notes", "status"];
export function normalizeProfile(input, { persisted = false } = {}) {
  assertFields(input, profileFields, persisted);
  return {
    ...metadata(input), status: enumValue(input.status, RECORD_STATUS, "status", RECORD_STATUS.ACTIVE),
    displayName: text(input.displayName, "displayName", 160, true), aliasLabel: text(input.aliasLabel, "aliasLabel", 80),
    profileGroupId: id(input.profileGroupId, "profileGroupId"), fullName: text(input.fullName, "fullName", 300),
    businessName: text(input.businessName, "businessName", 300), emailPreference: text(input.emailPreference, "emailPreference", 300),
    phone: text(input.phone, "phone", 80), shippingAddress: address(input.shippingAddress, "shippingAddress"),
    billingAddress: address(input.billingAddress, "billingAddress"), notes: text(input.notes, "notes", 16_000),
  };
}

const domainFields = ["domain", "mode", "providerId", "status", "catchAllOwnerConfirmedAt", "notes"];
export function normalizeEmailDomain(input, { persisted = false } = {}) {
  assertFields(input, domainFields, persisted);
  return {
    ...metadata(input, EMAIL_DOMAIN_STATUSES.NOT_CONFIGURED), domain: validateDomainName(input.domain),
    mode: enumValue(input.mode, EMAIL_DOMAIN_MODES, "mode", EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY),
    providerId: text(input.providerId, "providerId", 160),
    status: enumValue(input.status, EMAIL_DOMAIN_STATUSES, "status", EMAIL_DOMAIN_STATUSES.NOT_CONFIGURED),
    catchAllOwnerConfirmedAt: optionalIso(input.catchAllOwnerConfirmedAt, "catchAllOwnerConfirmedAt"), notes: text(input.notes, "notes", 16_000),
  };
}

const aliasFields = ["aliasAddress", "domain", "localPart", "domainId", "profileId", "retailerId", "purpose", "status", "disabledAt", "provider", "providerExternalId", "forwardingDestinationMetadata", "verificationState", "provisioningState", "provenance", "notes"];
export function normalizeEmailAlias(input, { persisted = false } = {}) {
  assertFields(input, aliasFields, persisted);
  const parsed = validateEmailAddress(input.aliasAddress);
  const suppliedDomain = input.domain ? validateDomainName(input.domain) : parsed.domain;
  const suppliedLocal = input.localPart ? validateEmailLocalPart(input.localPart) : parsed.localPart;
  if (parsed.domain !== suppliedDomain || parsed.localPart !== suppliedLocal) throw new AccountOpsValidationError("ALIAS_COMPONENT_MISMATCH", "Alias address, local part, and domain do not match.");
  return {
    ...metadata(input, EMAIL_ALIAS_STATUSES.PENDING), ...parsed, domainId: id(input.domainId, "domainId", true),
    profileId: id(input.profileId, "profileId"), retailerId: id(input.retailerId, "retailerId"), purpose: text(input.purpose, "purpose", 500),
    status: enumValue(input.status, EMAIL_ALIAS_STATUSES, "status", EMAIL_ALIAS_STATUSES.PENDING),
    disabledAt: optionalIso(input.disabledAt, "disabledAt"), provider: text(input.provider, "provider", 160) || "LOCAL_METADATA_ONLY",
    providerExternalId: text(input.providerExternalId, "providerExternalId", 500),
    forwardingDestinationMetadata: safeMetadata(input.forwardingDestinationMetadata, "forwardingDestinationMetadata"),
    verificationState: enumValue(input.verificationState, VERIFICATION_STATES, "verificationState", VERIFICATION_STATES.UNKNOWN),
    provisioningState: enumValue(input.provisioningState, ALIAS_PROVISIONING_STATES, "provisioningState", ALIAS_PROVISIONING_STATES.GENERATED_LOCAL),
    provenance: enumValue(input.provenance, ACCOUNT_OPS_PROVENANCE, "provenance", ACCOUNT_OPS_PROVENANCE.GENERATED_LOCAL),
    notes: text(input.notes, "notes", 16_000),
  };
}

const retailerFields = ["displayName", "website", "signupUrl", "accountUrl", "orderHistoryUrl", "notes", "iconMetadata", "capabilities", "accountRulesMetadata", "automatedProvisioningSupported", "custom", "status"];
export function normalizeRetailer(input, { persisted = false } = {}) {
  assertFields(input, retailerFields, persisted);
  if (input.automatedProvisioningSupported === true) throw new AccountOpsValidationError("AUTOMATION_NOT_SUPPORTED", "Phase 2A does not support automated retailer-account provisioning.");
  const retailerId = input.id ? id(input.id, "id", true) : undefined;
  if (retailerId?.startsWith("retailer-preset:")) throw new AccountOpsValidationError("RESERVED_RETAILER_ID", "Custom retailers cannot use the retailer preset ID namespace.");
  return {
    ...metadata(input), status: enumValue(input.status, RECORD_STATUS, "status", RECORD_STATUS.ACTIVE),
    displayName: text(input.displayName, "displayName", 200, true), website: url(input.website, "website"),
    signupUrl: url(input.signupUrl, "signupUrl"), accountUrl: url(input.accountUrl, "accountUrl"), orderHistoryUrl: url(input.orderHistoryUrl, "orderHistoryUrl"),
    notes: text(input.notes, "notes", 16_000), iconMetadata: safeMetadata(input.iconMetadata, "iconMetadata"),
    capabilities: stringArray(input.capabilities, "capabilities"), accountRulesMetadata: safeMetadata(input.accountRulesMetadata, "accountRulesMetadata"),
    automatedProvisioningSupported: false, custom: true,
  };
}

const accountFields = ["retailerId", "profileId", "aliasId", "username", "accountDisplayName", "status", "emailVerificationStatus", "phoneVerificationStatus", "securityStatus", "setupStage", "phoneVerificationRequired", "lastVerifiedAt", "lastLoginAt", "lastOrderAt", "notes", "credentialReference", "externalIdentity", "ownerConfirmedReadyAt"];
export function normalizeStoreAccount(input, { persisted = false } = {}) {
  assertFields(input, accountFields, persisted);
  return {
    ...metadata(input, STORE_ACCOUNT_STATUSES.SETUP), retailerId: id(input.retailerId, "retailerId", true), profileId: id(input.profileId, "profileId", true),
    aliasId: id(input.aliasId, "aliasId"), username: text(input.username, "username", 320), accountDisplayName: text(input.accountDisplayName, "accountDisplayName", 200),
    status: enumValue(input.status, STORE_ACCOUNT_STATUSES, "status", STORE_ACCOUNT_STATUSES.SETUP),
    emailVerificationStatus: enumValue(input.emailVerificationStatus, VERIFICATION_STATES, "emailVerificationStatus", VERIFICATION_STATES.PENDING),
    phoneVerificationStatus: enumValue(input.phoneVerificationStatus, VERIFICATION_STATES, "phoneVerificationStatus", VERIFICATION_STATES.UNKNOWN),
    securityStatus: text(input.securityStatus, "securityStatus", 160) || "UNKNOWN",
    setupStage: enumValue(input.setupStage, ACCOUNT_SETUP_STAGES, "setupStage", ACCOUNT_SETUP_STAGES.PREPARED),
    phoneVerificationRequired: boolean(input.phoneVerificationRequired), lastVerifiedAt: optionalIso(input.lastVerifiedAt, "lastVerifiedAt"),
    lastLoginAt: optionalIso(input.lastLoginAt, "lastLoginAt"), lastOrderAt: optionalIso(input.lastOrderAt, "lastOrderAt"),
    notes: text(input.notes, "notes", 16_000), credentialReference: normalizeCredentialReference(input.credentialReference),
    externalIdentity: safeMetadata(input.externalIdentity, "externalIdentity"), ownerConfirmedReadyAt: optionalIso(input.ownerConfirmedReadyAt, "ownerConfirmedReadyAt"),
  };
}

const taskFields = ["type", "title", "status", "priority", "dueAt", "profileId", "accountId", "retailerId", "source", "notes", "completedAt"];
export function normalizeAccountTask(input, { persisted = false } = {}) {
  assertFields(input, taskFields, persisted);
  return {
    ...metadata(input, ACCOUNT_TASK_STATUSES.OPEN), type: enumValue(input.type, ACCOUNT_TASK_TYPES, "type", ACCOUNT_TASK_TYPES.CUSTOM),
    title: text(input.title, "title", 300, true), status: enumValue(input.status, ACCOUNT_TASK_STATUSES, "status", ACCOUNT_TASK_STATUSES.OPEN),
    priority: enumValue(input.priority, ACCOUNT_TASK_PRIORITIES, "priority", ACCOUNT_TASK_PRIORITIES.NORMAL), dueAt: optionalIso(input.dueAt, "dueAt"),
    profileId: id(input.profileId, "profileId"), accountId: id(input.accountId, "accountId"), retailerId: id(input.retailerId, "retailerId"),
    source: text(input.source, "source", 160) || "OWNER", notes: text(input.notes, "notes", 16_000), completedAt: optionalIso(input.completedAt, "completedAt"),
  };
}

const activityFields = ["type", "title", "summary", "profileId", "accountId", "retailerId", "aliasId", "occurredAt", "status"];
export function normalizeAccountActivity(input, { persisted = false } = {}) {
  assertFields(input, activityFields, persisted);
  return {
    ...metadata(input), status: enumValue(input.status, RECORD_STATUS, "status", RECORD_STATUS.ACTIVE),
    type: text(input.type, "type", 120, true), title: text(input.title, "title", 300, true),
    summary: text(input.summary, "summary", 1_000), profileId: id(input.profileId, "profileId"), accountId: id(input.accountId, "accountId"),
    retailerId: id(input.retailerId, "retailerId"), aliasId: id(input.aliasId, "aliasId"), occurredAt: optionalIso(input.occurredAt, "occurredAt"),
  };
}

export const ACCOUNT_OPS_RECORD_NORMALIZERS = Object.freeze({
  profileGroups: normalizeProfileGroup,
  profiles: normalizeProfile,
  emailDomains: normalizeEmailDomain,
  emailAliases: normalizeEmailAlias,
  retailers: normalizeRetailer,
  storeAccounts: normalizeStoreAccount,
  tasks: normalizeAccountTask,
  activity: normalizeAccountActivity,
});
