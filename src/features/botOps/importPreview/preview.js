import {
  STELLAR_PREVIEW_ALLOWED_MIME_TYPES,
  STELLAR_PREVIEW_CONTRACT,
  STELLAR_PREVIEW_FILE_STATES,
  STELLAR_PREVIEW_FORMAT_STATES,
  STELLAR_PREVIEW_LIMITS,
} from "./constants.js";
import { recognizeStellarTaskExportFormat } from "./formatRecognizer.js";
import { normalizeStellarTaskExportRecords } from "./normalizer.js";
import {
  scanStellarTaskExportSecurity,
  stellarPreviewSecurityMessage,
} from "./securityScanner.js";

const encoder = new TextEncoder();

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function stellarPreviewBasename(value, maximumLength = STELLAR_PREVIEW_LIMITS.maximumFilenameLength) {
  const segments = String(value || "").split(/[\\/]/);
  const basename = (segments.at(-1) || "selected-export.json")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim() || "selected-export.json";
  if (basename.length <= maximumLength) return basename;
  const extension = basename.toLowerCase().endsWith(".json") ? ".json" : "";
  return `${basename.slice(0, Math.max(1, maximumLength - extension.length))}${extension}`;
}

export function validateStellarPreviewFileMetadata(metadata = {}, limitOverrides = {}) {
  const limits = { ...STELLAR_PREVIEW_LIMITS, ...limitOverrides };
  const displayName = stellarPreviewBasename(metadata.name, limits.maximumFilenameLength);
  const mimeType = String(metadata.type || "").trim().toLowerCase();
  const sizeBytes = Number(metadata.size);
  const errors = [];
  if (!displayName.toLowerCase().endsWith(".json")) errors.push("JSON_FILE_REQUIRED");
  if (!STELLAR_PREVIEW_ALLOWED_MIME_TYPES.includes(mimeType)) errors.push("JSON_MIME_REQUIRED");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) errors.push("FILE_EMPTY_OR_INVALID");
  if (Number.isSafeInteger(sizeBytes) && sizeBytes > limits.maximumFileBytes) errors.push("FILE_TOO_LARGE");
  return deepFreeze({
    state: errors.length ? STELLAR_PREVIEW_FILE_STATES.REJECTED : STELLAR_PREVIEW_FILE_STATES.ACCEPTED,
    displayName,
    mimeType,
    sizeBytes: Number.isSafeInteger(sizeBytes) ? sizeBytes : 0,
    errors,
  });
}

function emptySummary() {
  return {
    recordCount: 0,
    safeRecognizedTaskCount: 0,
    rejectedRecordCount: 0,
    warningCount: 0,
    duplicateCount: 0,
    retailerCount: 0,
    missingProductIdentifierCount: 0,
    malformedPriceCount: 0,
    malformedQuantityCount: 0,
  };
}

function basePreview(file, formatRecognitionState, overrides = {}) {
  return {
    kind: "StellarTaskExportPreview",
    provider: "STELLAR",
    ephemeral: true,
    authoritative: false,
    imported: false,
    persisted: false,
    contract: STELLAR_PREVIEW_CONTRACT,
    file,
    formatRecognitionState,
    securitySafe: false,
    safeToPreview: false,
    summary: emptySummary(),
    recognizedFields: [],
    ignoredFields: [],
    detectedRetailerLabels: [],
    compatibilityNotes: [],
    warnings: [],
    blockingSecurityFindings: [],
    tasks: [],
    ...overrides,
  };
}

function rejectedPreview(file, code, message) {
  return deepFreeze(basePreview(file, STELLAR_PREVIEW_FORMAT_STATES.REJECTED, {
    warnings: [code],
    compatibilityNotes: [message],
  }));
}

export function previewStellarTaskExportText(input = {}, limitOverrides = {}) {
  const limits = { ...STELLAR_PREVIEW_LIMITS, ...limitOverrides };
  if (typeof input.text !== "string") {
    const file = validateStellarPreviewFileMetadata({ name: input.fileName, type: input.mimeType, size: 0 }, limits);
    return rejectedPreview(file, "JSON_TEXT_REQUIRED", "The selected file could not be read as JSON text.");
  }
  const actualSize = encoder.encode(input.text).byteLength;
  const file = validateStellarPreviewFileMetadata({
    name: input.fileName,
    type: input.mimeType,
    size: actualSize,
  }, limits);
  if (file.state === STELLAR_PREVIEW_FILE_STATES.REJECTED) {
    return rejectedPreview(file, file.errors[0] || "FILE_REJECTED", "The selected file does not meet the offline preview limits.");
  }

  let parsed;
  try {
    parsed = JSON.parse(input.text);
  } catch {
    return rejectedPreview(file, "MALFORMED_JSON", "The selected JSON is malformed or incomplete.");
  }

  const security = scanStellarTaskExportSecurity(parsed, limits);
  if (!security.safe) {
    return deepFreeze(basePreview(file, STELLAR_PREVIEW_FORMAT_STATES.UNSAFE, {
      securitySafe: false,
      blockingSecurityFindings: security.findings.map((finding) => ({
        category: finding.category,
        count: finding.count,
        message: stellarPreviewSecurityMessage(finding.category),
      })),
      compatibilityNotes: ["Normalization stopped before any task metadata was produced."],
    }));
  }

  const format = recognizeStellarTaskExportFormat(parsed, limits);
  if (format.state !== STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED) {
    return deepFreeze(basePreview(file, format.state, {
      securitySafe: true,
      ignoredFields: format.ignoredRootFields || [],
      compatibilityNotes: format.compatibilityNotes || [],
      summary: { ...emptySummary(), recordCount: format.sourceRecordCount || 0 },
    }));
  }

  const normalized = normalizeStellarTaskExportRecords(format, limits);
  const taskWarnings = normalized.tasks.flatMap((task) => task.warnings);
  const warnings = [...new Set([...normalized.warnings, ...taskWarnings])];
  const duplicateCount = normalized.tasks.filter((task) => task.duplicate).length;
  const missingProductIdentifierCount = normalized.tasks.filter((task) => !(
    task.product.productIdentifier.value
    || task.product.sku.value
    || task.product.upc.value
    || task.product.gtin.value
    || task.product.tcin.value
  )).length;
  const malformedPriceCount = normalized.tasks.filter((task) => task.maxPrice.state === "INVALID").length;
  const malformedQuantityCount = normalized.tasks.filter((task) => task.quantity.state === "INVALID").length;
  return deepFreeze(basePreview(file, format.state, {
    securitySafe: true,
    safeToPreview: true,
    summary: {
      recordCount: format.sourceRecordCount,
      safeRecognizedTaskCount: normalized.tasks.length,
      rejectedRecordCount: normalized.rejectedRecordCount,
      warningCount: warnings.length,
      duplicateCount,
      retailerCount: normalized.detectedRetailerLabels.length,
      missingProductIdentifierCount,
      malformedPriceCount,
      malformedQuantityCount,
    },
    recognizedFields: normalized.recognizedFields,
    ignoredFields: normalized.ignoredFields,
    detectedRetailerLabels: normalized.detectedRetailerLabels,
    compatibilityNotes: format.compatibilityNotes,
    warnings,
    tasks: normalized.tasks,
  }));
}

export async function createStellarTaskExportPreviewFromFile(file, limitOverrides = {}) {
  const metadata = validateStellarPreviewFileMetadata({
    name: file?.name,
    type: file?.type,
    size: file?.size,
  }, limitOverrides);
  if (metadata.state === STELLAR_PREVIEW_FILE_STATES.REJECTED) {
    return rejectedPreview(metadata, metadata.errors[0] || "FILE_REJECTED", "The selected file does not meet the offline preview limits.");
  }
  if (!file || typeof file.text !== "function") {
    return rejectedPreview(metadata, "FILE_READ_UNAVAILABLE", "The selected file cannot be read by this browser.");
  }
  const text = await file.text();
  return previewStellarTaskExportText({
    fileName: metadata.displayName,
    mimeType: metadata.mimeType,
    text,
  }, limitOverrides);
}
