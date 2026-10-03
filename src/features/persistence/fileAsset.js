import { CANONICAL_DOMAINS } from "./migrationSourceRegistry.js";

export const FILE_ASSET_METADATA_VERSION = 1;

const ALLOWED_FIELDS = new Set([
  "id",
  "storageProvider",
  "storagePath",
  "mimeType",
  "size",
  "sha256",
  "createdAt",
  "relatedRecordType",
  "relatedRecordId",
  "originalName",
  "metadataVersion",
]);
const PROHIBITED_FIELDS = new Set(["owner", "ownerSubject", "owner_subject", "token", "accessToken", "secret"]);
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STORAGE_PROVIDER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PATH_LENGTH = 1024;
const WIRE_FIELDS = new Set([
  "storageProvider",
  "storagePath",
  "mimeType",
  "size",
  "sha256",
  "relatedRecordType",
  "relatedRecordId",
  "originalName",
]);

function hasPrototypeKey(value) {
  return Object.keys(value || {}).some((key) => ["__proto__", "constructor", "prototype"].includes(key));
}

function validateFileAssetCore(value, options = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: ["FileAsset data must be a plain object."], normalized: null };
  }
  if (hasPrototypeKey(value)) errors.push("FileAsset data contains a prohibited prototype key.");
  if (!STORAGE_PROVIDER_PATTERN.test(String(value.storageProvider || ""))) errors.push("FileAsset storageProvider is missing or invalid.");
  const storagePath = String(value.storagePath || "").trim();
  if (!storagePath || storagePath.length > MAX_PATH_LENGTH || storagePath.includes("\0") || storagePath.startsWith("/") || /(^|[\\/])\.\.([\\/]|$)/.test(storagePath)) {
    errors.push("FileAsset storagePath must be a bounded relative object key without traversal segments.");
  }
  if (/^(?:blob:|data:|https?:)/i.test(storagePath)) {
    errors.push("FileAsset storagePath must be an object-storage key, not a URL or embedded file.");
  }
  if (!MIME_PATTERN.test(String(value.mimeType || "")) || String(value.mimeType).length > 255) errors.push("FileAsset mimeType is missing or invalid.");
  if (!Number.isSafeInteger(value.size) || value.size < 0 || value.size > (options.maxFileSize || MAX_FILE_SIZE)) {
    errors.push("FileAsset size is outside the supported range.");
  }
  if (!SHA256_PATTERN.test(String(value.sha256 || ""))) errors.push("FileAsset sha256 must be a 64-character hexadecimal digest.");
  const relatedRecordType = value.relatedRecordType == null || value.relatedRecordType === "" ? null : String(value.relatedRecordType);
  const relatedRecordId = value.relatedRecordId == null || value.relatedRecordId === "" ? null : String(value.relatedRecordId);
  if (relatedRecordType && !Object.values(CANONICAL_DOMAINS).includes(relatedRecordType)) errors.push("FileAsset relatedRecordType must be a canonical domain.");
  if (relatedRecordId && !UUID_PATTERN.test(relatedRecordId)) errors.push("FileAsset relatedRecordId must be a canonical UUID.");
  if ((relatedRecordType == null) !== (relatedRecordId == null)) errors.push("FileAsset relatedRecordType and relatedRecordId must both be present or both be empty.");
  if (value.originalName != null && (typeof value.originalName !== "string" || value.originalName.length > 255)) {
    errors.push("FileAsset originalName must be at most 255 characters.");
  }
  return {
    errors,
    normalized: errors.length ? null : {
      storageProvider: value.storageProvider,
      storagePath,
      mimeType: String(value.mimeType).toLowerCase(),
      size: value.size,
      sha256: String(value.sha256).toLowerCase(),
      relatedRecordType,
      relatedRecordId,
      ...(value.originalName != null ? { originalName: value.originalName } : {}),
    },
  };
}

export function validateCanonicalFileAssetInput(value, options = {}) {
  const core = validateFileAssetCore(value, options);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: core.errors, normalized: null };
  }
  const unknownFields = Object.keys(value).filter((key) => !WIRE_FIELDS.has(key));
  const errors = [...core.errors];
  if (unknownFields.length) errors.push(`Unsupported canonical FileAsset field(s): ${unknownFields.sort().join(", ")}.`);
  return { valid: errors.length === 0, errors, normalized: errors.length ? null : core.normalized };
}

export function validateFileAssetMetadata(value, options = {}) {
  const errors = [];
  const warnings = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["FileAsset metadata must be a plain object."], warnings };
  }
  if (hasPrototypeKey(value)) errors.push("FileAsset metadata contains a prohibited prototype key.");

  const unknownFields = Object.keys(value).filter((key) => !ALLOWED_FIELDS.has(key));
  const ownerFields = unknownFields.filter((key) => PROHIBITED_FIELDS.has(key));
  if (ownerFields.length) errors.push("Owner identity and security fields are derived by the server and are not accepted in FileAsset metadata.");
  const ordinaryUnknown = unknownFields.filter((key) => !PROHIBITED_FIELDS.has(key));
  if (ordinaryUnknown.length) errors.push(`Unsupported FileAsset field(s): ${ordinaryUnknown.sort().join(", ")}.`);

  if (!SAFE_ID_PATTERN.test(String(value.id || ""))) errors.push("FileAsset id is missing or invalid.");
  const core = validateFileAssetCore(value, options);
  errors.push(...core.errors);
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) errors.push("FileAsset createdAt is invalid.");
  if (value.metadataVersion != null && value.metadataVersion !== FILE_ASSET_METADATA_VERSION) {
    errors.push("FileAsset metadataVersion is unsupported.");
  }
  if (!options.fileBytesAvailable) {
    warnings.push("File bytes were not verified; migration preview validates metadata only.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: errors.length ? null : {
      ...value,
      metadataVersion: FILE_ASSET_METADATA_VERSION,
      ...core.normalized,
    },
  };
}
