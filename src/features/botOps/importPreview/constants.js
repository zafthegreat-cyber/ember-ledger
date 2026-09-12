export const STELLAR_PREVIEW_FORMAT_STATES = Object.freeze({
  SUPPORTED: "SUPPORTED",
  PARTIALLY_RECOGNIZED: "PARTIALLY_RECOGNIZED",
  UNKNOWN_FORMAT: "UNKNOWN_FORMAT",
  UNSAFE: "UNSAFE",
  REJECTED: "REJECTED",
});

export const STELLAR_PREVIEW_FILE_STATES = Object.freeze({
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
});

export const STELLAR_PREVIEW_FIELD_STATES = Object.freeze({
  RECOGNIZED: "RECOGNIZED",
  AMBIGUOUS: "AMBIGUOUS",
  INVALID: "INVALID",
  MISSING: "MISSING",
  UNSUPPORTED: "UNSUPPORTED",
});

export const STELLAR_PREVIEW_SECURITY_CATEGORIES = Object.freeze({
  AUTHORITY_DATA: "AUTHORITY_DATA",
  CREDENTIAL_DATA: "CREDENTIAL_DATA",
  SESSION_DATA: "SESSION_DATA",
  PAYMENT_DATA: "PAYMENT_DATA",
  PROXY_AUTHENTICATION_DATA: "PROXY_AUTHENTICATION_DATA",
  LICENSE_DATA: "LICENSE_DATA",
  PERSONAL_PROFILE_DATA: "PERSONAL_PROFILE_DATA",
  RAW_PROVIDER_DATA: "RAW_PROVIDER_DATA",
  CREDENTIAL_BEARING_URL: "CREDENTIAL_BEARING_URL",
  UNSAFE_OBJECT_STRUCTURE: "UNSAFE_OBJECT_STRUCTURE",
  INPUT_LIMIT_EXCEEDED: "INPUT_LIMIT_EXCEEDED",
});

export const STELLAR_PREVIEW_LIMITS = Object.freeze({
  maximumFileBytes: 1024 * 1024,
  maximumRecords: 500,
  maximumDepth: 16,
  maximumNodes: 12_000,
  maximumKeysPerObject: 100,
  maximumStringLength: 8_192,
  maximumFieldLength: 160,
  maximumIdentifierLength: 128,
  maximumUnknownFields: 100,
  maximumFindings: 50,
  maximumQuantity: 1_000,
  maximumMoneyMinorUnits: 100_000_000,
  maximumFilenameLength: 120,
});

export const STELLAR_PREVIEW_ALLOWED_MIME_TYPES = Object.freeze([
  "",
  "application/json",
]);

export const STELLAR_PREVIEW_FIELD_ALIASES = Object.freeze({
  taskReference: Object.freeze(["id", "taskId", "task_id"]),
  taskLabel: Object.freeze(["name", "taskName", "task_name", "label"]),
  retailer: Object.freeze(["retailer", "site", "siteId", "site_id"]),
  productIdentifier: Object.freeze(["productId", "product_id", "productIdentifier", "product_identifier"]),
  sku: Object.freeze(["sku"]),
  upc: Object.freeze(["upc"]),
  gtin: Object.freeze(["gtin"]),
  tcin: Object.freeze(["tcin"]),
  productTitle: Object.freeze(["productTitle", "product_title", "title"]),
  quantity: Object.freeze(["quantity", "qty"]),
  maxPriceMajor: Object.freeze(["maxPrice", "max_price", "priceLimit", "price_limit"]),
  maxPriceMinor: Object.freeze(["maxPriceMinor", "max_price_minor", "maxPriceCents", "max_price_cents"]),
  currency: Object.freeze(["currency", "currencyCode", "currency_code"]),
  mode: Object.freeze(["mode", "taskMode", "task_mode", "type"]),
  enabled: Object.freeze(["enabled", "isEnabled", "is_enabled"]),
  status: Object.freeze(["status", "taskStatus", "task_status"]),
  createdAt: Object.freeze(["createdAt", "created_at"]),
  updatedAt: Object.freeze(["updatedAt", "updated_at"]),
  groupReference: Object.freeze(["groupId", "group_id"]),
  groupLabel: Object.freeze(["groupName", "group_name"]),
});

export const STELLAR_PREVIEW_ROOT_FIELDS = Object.freeze([
  "tasks",
  "taskGroups",
]);

export const STELLAR_PREVIEW_GROUP_FIELDS = Object.freeze([
  "id",
  "name",
  "groupId",
  "group_id",
  "groupName",
  "group_name",
  "retailer",
  "site",
  "siteId",
  "site_id",
  "tasks",
]);

export const STELLAR_PREVIEW_EXPORTED_STATUSES = Object.freeze([
  "DRAFT",
  "READY",
  "RUNNING",
  "PAUSED",
  "STOPPED",
  "WAITING",
  "MONITORING",
  "CARTED",
  "CHECKOUT_ATTEMPT",
  "SUCCESS",
  "FAILED",
  "RATE_LIMITED",
  "ACCOUNT_ERROR",
  "PROXY_ERROR",
  "PAYMENT_ERROR",
  "RETAILER_BLOCK",
  "UNKNOWN",
]);

export const STELLAR_PREVIEW_CONTRACT = Object.freeze({
  provider: "STELLAR",
  acceptedFormat: "JSON_ONLY",
  schemaCompatibilityVerified: false,
  supportedStateEmitted: false,
  ephemeralOnly: true,
  persistenceAllowed: false,
  backupAllowed: false,
  migrationAllowed: false,
  networkAccess: false,
  importAvailable: false,
  taskCreationAvailable: false,
  attemptCreationAvailable: false,
  checkoutEvidenceCreationAvailable: false,
  orderCandidateCreationAvailable: false,
  purchaseMutationAvailable: false,
  inventoryMutationAvailable: false,
  rawFileRetentionAllowed: false,
  rawFileHashingAllowed: false,
});
