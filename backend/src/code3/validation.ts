import { domainDefinition } from "./domainDefinitions";
import { CANONICAL_DOMAINS } from "./types";
import type {
  CanonicalDomain,
  CanonicalListQuery,
  CanonicalRecordInput,
  CanonicalRecordUpdate,
  FileAssetMetadata,
  JsonObject,
  JsonValue,
} from "./types";

export type ValidationIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class Code3ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[] | ValidationIssue) {
    const normalized = Array.isArray(issues) ? issues : [issues];
    super(normalized[0]?.message || "The request is invalid.");
    this.name = "Code3ValidationError";
    this.issues = normalized;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SECURITY_FIELD_PATTERN = /(?:authorization|access.?token|refresh.?token|id.?token|session|cookie|password|secret|api.?key|owner.?subjects?|private.?key)/i;
const CREATE_FIELDS = new Set([
  "id", "status", "source", "externalProvider", "externalId", "sourceUrl", "notes", "metadata",
  "amountMinor", "currency", "rateBasisPoints", "quantity", "certificationNumber", "occurredAt", "relations", "fileAsset",
]);
const UPDATE_FIELDS = new Set([...CREATE_FIELDS].filter((field) => field !== "id").concat("expectedVersion"));

const LIMITS = Object.freeze({
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
  // Keep the accepted wire representation below the database's 256 KiB
  // jsonb-text constraint. PostgreSQL's jsonb text rendering adds separator
  // whitespace, so the API deliberately retains a small safety margin.
  metadataUtf8Bytes: 250_000,
  maximumQuantity: 1_000_000_000,
  maximumAmountMinor: Number.MAX_SAFE_INTEGER,
  maximumListLimit: 100,
  maximumFileSize: 100 * 1024 * 1024,
});

const FILE_ASSET_FIELDS = new Set([
  "storageProvider", "storagePath", "mimeType", "size", "sha256", "relatedRecordType", "relatedRecordId", "originalName",
]);
const FILE_STORAGE_PROVIDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const FILE_MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const FILE_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNoUnknownFields(value: Record<string, unknown>, allowed: Set<string>): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (!unknown.length) return;
  const ownerField = unknown.find((key) => key.toLowerCase().replace(/_/g, "") === "ownersubject");
  if (ownerField) {
    throw new Code3ValidationError(issue(ownerField, "owner_scope_forbidden", "Owner scope is derived from the authenticated server principal."));
  }
  throw new Code3ValidationError(unknown.map((key) => issue(key, "unknown_field", `Unknown field: ${key}.`)));
}

function optionalString(
  value: unknown,
  path: string,
  maximumLength: number,
  { nullable = true, uppercase = false }: { nullable?: boolean; uppercase?: boolean } = {},
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && nullable) return null;
  if (typeof value !== "string") throw new Code3ValidationError(issue(path, "invalid_type", `${path} must be a string.`));
  const normalized = value.trim();
  if (!normalized && !nullable) throw new Code3ValidationError(issue(path, "required", `${path} is required.`));
  if (normalized.length > maximumLength) throw new Code3ValidationError(issue(path, "too_long", `${path} is too long.`));
  return uppercase ? normalized.toUpperCase() : normalized;
}

function safeJson(value: unknown, path: string, depth = 0, counter = { count: 0 }): JsonValue {
  counter.count += 1;
  if (counter.count > LIMITS.metadataNodes) {
    throw new Code3ValidationError(issue(path, "too_many_values", "Metadata contains too many values."));
  }
  if (depth > LIMITS.metadataDepth) {
    throw new Code3ValidationError(issue(path, "too_deep", "Metadata nesting is too deep."));
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Code3ValidationError(issue(path, "non_finite_number", "Metadata cannot contain NaN or Infinity."));
    return value;
  }
  if (typeof value === "string") {
    if (value.length > LIMITS.metadataStringLength) throw new Code3ValidationError(issue(path, "too_long", "A metadata string is too long."));
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.metadataArrayLength) throw new Code3ValidationError(issue(path, "array_too_large", "A metadata array is too large."));
    return value.map((entry, index) => safeJson(entry, `${path}[${index}]`, depth + 1, counter));
  }
  if (!isPlainObject(value)) throw new Code3ValidationError(issue(path, "invalid_json_value", "Metadata must contain JSON values only."));
  const keys = Object.keys(value);
  if (keys.length > LIMITS.metadataKeysPerObject) throw new Code3ValidationError(issue(path, "too_many_keys", "A metadata object has too many keys."));
  const result: JsonObject = Object.create(null) as JsonObject;
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) throw new Code3ValidationError(issue(`${path}.${key}`, "prohibited_key", "Prototype-pollution keys are prohibited."));
    if (SECURITY_FIELD_PATTERN.test(key)) throw new Code3ValidationError(issue(`${path}.${key}`, "prohibited_security_field", "Security and session fields are prohibited from canonical records."));
    result[key] = safeJson(value[key], `${path}.${key}`, depth + 1, counter);
  }
  return result;
}

export function validateUuid(value: unknown, path = "id"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Code3ValidationError(issue(path, "invalid_uuid", `${path} must be a valid UUID.`));
  }
  return value.toLowerCase();
}

export function validateBasisPoints(
  value: unknown,
  path = "rateBasisPoints",
  options: { minimum?: number; maximum?: number } = {},
): number {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 100_000;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Code3ValidationError(issue(
      path,
      "invalid_basis_points",
      `${path} must be an integer number of basis points between ${minimum} and ${maximum}.`,
    ));
  }
  return value;
}

function validateUrl(value: unknown, path: string): string | null | undefined {
  const normalized = optionalString(value, path, LIMITS.sourceUrl);
  if (normalized === undefined || normalized === null || normalized === "") return normalized || null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsupported scheme");
    return parsed.toString();
  } catch {
    throw new Code3ValidationError(issue(path, "invalid_url", `${path} must be an HTTP or HTTPS URL.`));
  }
}

function validateInstant(value: unknown, path: string): string | null | undefined {
  if (value === undefined || value === null) return value as undefined | null;
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Code3ValidationError(issue(path, "invalid_date", `${path} must be an ISO 8601 instant with a time zone.`));
  }
  return new Date(value).toISOString();
}

function validateInteger(value: unknown, path: string, minimum: number, maximum: number): number | null | undefined {
  if (value === undefined || value === null) return value as undefined | null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Code3ValidationError(issue(path, "invalid_integer", `${path} must be a safe integer between ${minimum} and ${maximum}.`));
  }
  return value;
}

function validateRelations(domain: CanonicalDomain, value: unknown, requireRequired: boolean): Record<string, string> | undefined {
  const definition = domainDefinition(domain);
  if (value === undefined) {
    const missing = Object.entries(definition.relations).filter(([, rule]) => rule.required).map(([name]) => name);
    if (requireRequired && missing.length) throw new Code3ValidationError(missing.map((name) => issue(`relations.${name}`, "required", `${name} is required.`)));
    return undefined;
  }
  if (!isPlainObject(value)) throw new Code3ValidationError(issue("relations", "invalid_type", "relations must be an object."));
  const allowed = new Set(Object.keys(definition.relations));
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Code3ValidationError(unknown.map((key) => issue(`relations.${key}`, "unknown_relation", `Unknown relation: ${key}.`)));
  const normalized: Record<string, string> = Object.create(null);
  for (const [name, rule] of Object.entries(definition.relations)) {
    const relationValue = value[name];
    if (relationValue === undefined || relationValue === null || relationValue === "") {
      if (requireRequired && rule.required) throw new Code3ValidationError(issue(`relations.${name}`, "required", `${name} is required.`));
      continue;
    }
    normalized[name] = validateUuid(relationValue, `relations.${name}`);
  }
  return normalized;
}

function validateFileAssetMetadata(value: unknown): FileAssetMetadata {
  if (!isPlainObject(value)) throw new Code3ValidationError(issue("fileAsset", "invalid_type", "fileAsset must be an object."));
  assertNoUnknownFields(value, FILE_ASSET_FIELDS);
  const storageProvider = optionalString(value.storageProvider, "fileAsset.storageProvider", 80, { nullable: false }) as string | undefined;
  if (!storageProvider || !FILE_STORAGE_PROVIDER_PATTERN.test(storageProvider)) {
    throw new Code3ValidationError(issue("fileAsset.storageProvider", "invalid_storage_provider", "storageProvider is missing or invalid."));
  }
  const storagePath = optionalString(value.storagePath, "fileAsset.storagePath", 1_024, { nullable: false }) as string | undefined;
  if (!storagePath || storagePath.includes("\0") || storagePath.startsWith("/") || /(^|[\\/])\.\.([\\/]|$)/.test(storagePath) || /^(?:blob:|data:|https?:)/i.test(storagePath)) {
    throw new Code3ValidationError(issue("fileAsset.storagePath", "invalid_storage_path", "storagePath must be a bounded relative object key without traversal or URL schemes."));
  }
  const mimeType = optionalString(value.mimeType, "fileAsset.mimeType", 255, { nullable: false }) as string | undefined;
  if (!mimeType || !FILE_MIME_PATTERN.test(mimeType)) {
    throw new Code3ValidationError(issue("fileAsset.mimeType", "invalid_mime_type", "mimeType is missing or invalid."));
  }
  const size = validateInteger(value.size, "fileAsset.size", 0, LIMITS.maximumFileSize);
  if (size === undefined || size === null) throw new Code3ValidationError(issue("fileAsset.size", "required", "size is required."));
  const sha256 = optionalString(value.sha256, "fileAsset.sha256", 64, { nullable: false }) as string | undefined;
  if (!sha256 || !FILE_SHA256_PATTERN.test(sha256)) {
    throw new Code3ValidationError(issue("fileAsset.sha256", "invalid_sha256", "sha256 must be a 64-character hexadecimal digest."));
  }
  const relatedRecordType = value.relatedRecordType == null || value.relatedRecordType === ""
    ? null
    : String(value.relatedRecordType) as CanonicalDomain;
  if (relatedRecordType && !(CANONICAL_DOMAINS as readonly string[]).includes(relatedRecordType)) {
    throw new Code3ValidationError(issue("fileAsset.relatedRecordType", "invalid_domain", "relatedRecordType is not a canonical domain."));
  }
  const relatedRecordId = value.relatedRecordId == null || value.relatedRecordId === ""
    ? null
    : validateUuid(value.relatedRecordId, "fileAsset.relatedRecordId");
  if ((relatedRecordType == null) !== (relatedRecordId == null)) {
    throw new Code3ValidationError(issue("fileAsset.relatedRecordId", "incomplete_file_relation", "relatedRecordType and relatedRecordId must both be present or both be null."));
  }
  const originalName = value.originalName == null || value.originalName === ""
    ? null
    : optionalString(value.originalName, "fileAsset.originalName", 255, { nullable: false }) as string;
  return {
    storageProvider,
    storagePath,
    mimeType: mimeType.toLowerCase(),
    size,
    sha256: sha256.toLowerCase(),
    relatedRecordType,
    relatedRecordId,
    originalName,
  };
}

function normalizeInput(domain: CanonicalDomain, raw: unknown, updating: boolean): CanonicalRecordInput | CanonicalRecordUpdate {
  if (!isPlainObject(raw)) throw new Code3ValidationError(issue("body", "invalid_type", "The request body must be an object."));
  for (const key of Object.keys(raw)) {
    if (DANGEROUS_KEYS.has(key)) throw new Code3ValidationError(issue(key, "prohibited_key", "Prototype-pollution keys are prohibited."));
  }
  assertNoUnknownFields(raw, updating ? UPDATE_FIELDS : CREATE_FIELDS);
  const definition = domainDefinition(domain);
  const status = raw.status === undefined
    ? (updating ? undefined : definition.defaultStatus)
    : optionalString(raw.status, "status", 64, { nullable: false, uppercase: true });
  if (status !== undefined && status !== null && !definition.statuses.has(status)) {
    throw new Code3ValidationError(issue("status", "invalid_status", `status is not supported for ${domain}.`));
  }
  if (status === "ARCHIVED") {
    throw new Code3ValidationError(issue("status", "archive_action_required", "Use the explicit archive action instead of writing ARCHIVED status directly."));
  }
  const amountMinor = validateInteger(
    raw.amountMinor,
    "amountMinor",
    definition.allowNegativeAmountMinor ? -LIMITS.maximumAmountMinor : 0,
    LIMITS.maximumAmountMinor,
  );
  const quantity = validateInteger(
    raw.quantity,
    "quantity",
    definition.allowNegativeQuantity ? -LIMITS.maximumQuantity : 0,
    LIMITS.maximumQuantity,
  );
  const rateBasisPoints = raw.rateBasisPoints === undefined || raw.rateBasisPoints === null
    ? raw.rateBasisPoints as undefined | null
    : validateBasisPoints(raw.rateBasisPoints);
  const rawCurrency = optionalString(raw.currency, "currency", 3, { uppercase: true });
  if (rawCurrency && !CURRENCY_PATTERN.test(rawCurrency)) {
    throw new Code3ValidationError(issue("currency", "invalid_currency", "currency must be a three-letter ISO code."));
  }
  if (!updating && (amountMinor === undefined || amountMinor === null) && rawCurrency) {
    throw new Code3ValidationError(issue("currency", "currency_without_amount", "currency requires an amountMinor value."));
  }
  const currency = amountMinor !== undefined && amountMinor !== null && !rawCurrency ? "USD" : rawCurrency;
  const metadata = raw.metadata === undefined ? undefined : safeJson(raw.metadata, "metadata");
  if (metadata !== undefined && (!metadata || Array.isArray(metadata) || typeof metadata !== "object")) {
    throw new Code3ValidationError(issue("metadata", "invalid_type", "metadata must be an object."));
  }
  if (metadata !== undefined && Buffer.byteLength(JSON.stringify(metadata), "utf8") > LIMITS.metadataUtf8Bytes) {
    throw new Code3ValidationError(issue("metadata", "too_large", "Metadata exceeds the maximum encoded size."));
  }
  const fileAsset = raw.fileAsset === undefined ? undefined : validateFileAssetMetadata(raw.fileAsset);
  if (domain === "FILE_ASSET" && !updating && fileAsset === undefined) {
    throw new Code3ValidationError(issue("fileAsset", "required", "FILE_ASSET records require fileAsset metadata."));
  }
  if (domain !== "FILE_ASSET" && fileAsset !== undefined) {
    throw new Code3ValidationError(issue("fileAsset", "unsupported_field", "fileAsset metadata is accepted only for FILE_ASSET records."));
  }
  const normalized: CanonicalRecordInput = {
    ...(raw.id === undefined ? {} : { id: validateUuid(raw.id) }),
    ...(status === undefined ? {} : { status: status as string }),
    ...(raw.source === undefined ? {} : { source: optionalString(raw.source, "source", LIMITS.source, { nullable: false }) as string }),
    ...(raw.externalProvider === undefined ? {} : { externalProvider: optionalString(raw.externalProvider, "externalProvider", LIMITS.externalProvider) }),
    ...(raw.externalId === undefined ? {} : { externalId: optionalString(raw.externalId, "externalId", LIMITS.externalId) }),
    ...(raw.sourceUrl === undefined ? {} : { sourceUrl: validateUrl(raw.sourceUrl, "sourceUrl") }),
    ...(raw.notes === undefined ? {} : { notes: optionalString(raw.notes, "notes", LIMITS.notes) }),
    ...(metadata === undefined ? {} : { metadata: metadata as JsonObject }),
    ...(amountMinor === undefined ? {} : { amountMinor }),
    ...(currency === undefined ? {} : { currency }),
    ...(rateBasisPoints === undefined ? {} : { rateBasisPoints }),
    ...(quantity === undefined ? {} : { quantity }),
    ...(raw.certificationNumber === undefined ? {} : { certificationNumber: optionalString(raw.certificationNumber, "certificationNumber", LIMITS.certificationNumber) }),
    ...(raw.occurredAt === undefined ? {} : { occurredAt: validateInstant(raw.occurredAt, "occurredAt") }),
    ...(raw.relations === undefined && updating ? {} : { relations: validateRelations(domain, raw.relations, !updating) }),
    ...(fileAsset === undefined ? {} : { fileAsset }),
  };
  if (!updating) return normalized;
  const expectedVersion = validateInteger(raw.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
  if (expectedVersion === undefined || expectedVersion === null) {
    throw new Code3ValidationError(issue("expectedVersion", "required", "expectedVersion is required."));
  }
  return { ...normalized, expectedVersion } as CanonicalRecordUpdate;
}

export function validateCreateInput(domain: CanonicalDomain, raw: unknown): CanonicalRecordInput {
  return normalizeInput(domain, raw, false) as CanonicalRecordInput;
}

export function validateUpdateInput(domain: CanonicalDomain, raw: unknown): CanonicalRecordUpdate {
  if (domainDefinition(domain).immutable) {
    throw new Code3ValidationError(issue("record", "immutable_record", `${domain} records are immutable.`));
  }
  return normalizeInput(domain, raw, true) as CanonicalRecordUpdate;
}

export function validateArchiveInput(raw: unknown): { expectedVersion: number } {
  if (!isPlainObject(raw)) throw new Code3ValidationError(issue("body", "invalid_type", "The request body must be an object."));
  assertNoUnknownFields(raw, new Set(["expectedVersion"]));
  const expectedVersion = validateInteger(raw.expectedVersion, "expectedVersion", 1, Number.MAX_SAFE_INTEGER);
  if (expectedVersion === undefined || expectedVersion === null) throw new Code3ValidationError(issue("expectedVersion", "required", "expectedVersion is required."));
  return { expectedVersion };
}

export function validateListQuery(raw: Record<string, unknown>): CanonicalListQuery {
  const allowed = new Set(["limit", "cursor", "status", "includeArchived"]);
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Code3ValidationError(unknown.map((key) => issue(key, "unknown_query", `Unknown query field: ${key}.`)));
  let limit = 50;
  if (raw.limit !== undefined) {
    const parsed = typeof raw.limit === "string" && /^\d+$/.test(raw.limit) ? Number(raw.limit) : raw.limit;
    const validated = validateInteger(parsed, "limit", 1, LIMITS.maximumListLimit);
    if (validated === undefined || validated === null) throw new Code3ValidationError(issue("limit", "invalid_limit", "limit is required."));
    limit = validated;
  }
  const cursor = optionalString(raw.cursor, "cursor", 1_024, { nullable: false });
  const status = optionalString(raw.status, "status", 64, { nullable: false, uppercase: true });
  let includeArchived = false;
  if (raw.includeArchived !== undefined) {
    if (raw.includeArchived !== "true" && raw.includeArchived !== "false" && typeof raw.includeArchived !== "boolean") {
      throw new Code3ValidationError(issue("includeArchived", "invalid_boolean", "includeArchived must be true or false."));
    }
    includeArchived = raw.includeArchived === true || raw.includeArchived === "true";
  }
  return { limit, ...(cursor ? { cursor } : {}), ...(status ? { status } : {}), includeArchived };
}

export function validateDomainStatus(domain: CanonicalDomain, status?: string): void {
  if (status && !domainDefinition(domain).statuses.has(status)) {
    throw new Code3ValidationError(issue("status", "invalid_status", `status is not supported for ${domain}.`));
  }
}

export const CODE3_INPUT_LIMITS = LIMITS;
