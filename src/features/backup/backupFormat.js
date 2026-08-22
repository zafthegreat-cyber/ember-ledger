import {
  canonicalStringify,
  hashCanonicalJson,
  parseUntrustedBackupJson,
  parseUntrustedJsonValue,
} from "./canonicalJson.js";
import {
  BACKUP_SOURCE_REGISTRY,
  BACKUP_STORAGE_TYPES,
  isSourceCoverageRelevant,
} from "./backupSourceRegistry.js";
import {
  isProhibitedStorageKey,
  sanitizeBackupData,
  SECURITY_EXCLUSION_SUMMARY,
} from "./backupSecurity.js";
import { validateBackupSourceData } from "./backupValidation.js";

export const CODE3_BACKUP_FORMAT = "code-3-backup";
export const CODE3_BACKUP_FORMAT_VERSION = 1;
export const BACKUP_COVERAGE = Object.freeze({ COMPLETE: "COMPLETE", PARTIAL: "PARTIAL", FAILED: "FAILED" });
const ENVELOPE_FIELDS = new Set(["format", "formatVersion", "createdAt", "applicationVersion", "sourceCommit", "coverageStatus", "coverageSummary", "manifest", "sections", "integrity"]);
const MANIFEST_FIELDS = new Set(["formatVersion", "createdAt", "applicationVersion", "sourceCommit", "coverageStatus", "coverageSummary", "includedSources", "excludedSources", "securityExclusions", "fileReferences", "knownLimitations", "sections", "manifestHash"]);

function cloneJson(value) {
  return JSON.parse(canonicalStringify(value));
}

function readRaw(storage, key) {
  if (!storage || typeof storage.getItem !== "function") throw new Error("Storage is unavailable.");
  return storage.getItem(key);
}

function parseStoredValue(raw, fallback, allowPlainText = false) {
  if (raw == null || raw === "") return cloneJson(fallback);
  try {
    return parseUntrustedJsonValue(raw);
  } catch (error) {
    if (allowPlainText && error?.code === "MALFORMED_JSON") return String(raw);
    throw error;
  }
}

function listStorageKeys(storage) {
  if (!storage || typeof storage.key !== "function" || !Number.isFinite(Number(storage.length))) return [];
  const keys = [];
  for (let index = 0; index < Number(storage.length); index += 1) {
    const key = storage.key(index);
    if (typeof key === "string") keys.push(key);
  }
  return keys;
}

function pickAllowedFields(value, allowedFields = []) {
  const result = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(value, field)) result[field] = value[field];
  }
  return result;
}

function readSourceData(source, context) {
  const storage = source.storageType === BACKUP_STORAGE_TYPES.SESSION_STORAGE
    ? context.sessionStorage
    : context.localStorage;

  if (source.exportAdapter === "json-key" || source.exportAdapter === "allowlisted-json-key") {
    if (isProhibitedStorageKey(source.storageKey)) throw new Error("Prohibited storage keys cannot be exported.");
    const parsed = parseStoredValue(readRaw(storage, source.storageKey), source.emptyValue);
    return source.exportAdapter === "allowlisted-json-key"
      ? pickAllowedFields(parsed, source.allowedFields)
      : parsed;
  }

  if (source.exportAdapter === "exact-key-group" || source.exportAdapter === "safe-session-key-group") {
    const keys = new Set(source.storageKeys || []);
    if (source.exportAdapter === "safe-session-key-group") {
      for (const key of listStorageKeys(storage)) {
        if ((source.storagePrefixes || []).some((prefix) => key.startsWith(prefix))) keys.add(key);
      }
    }
    const result = Object.create(null);
    for (const key of [...keys].sort()) {
      if (isProhibitedStorageKey(key)) continue;
      const raw = readRaw(storage, key);
      if (raw == null) continue;
      result[key] = parseStoredValue(raw, null, source.exportAdapter === "exact-key-group");
    }
    return result;
  }

  throw new Error(`No Phase 1A export adapter exists for ${source.sourceId}.`);
}

export function readCurrentBackupSources(options = {}) {
  const sourceRegistry = options.sourceRegistry || BACKUP_SOURCE_REGISTRY;
  const sources = Object.create(null);
  const warnings = [];
  for (const source of sourceRegistry) {
    if (!source.includedInPhase1AExport) continue;
    try {
      const sanitized = sanitizeBackupData(readSourceData(source, options));
      sources[source.sourceId] = sanitized.data;
      if (sanitized.excludedPaths.length) {
        warnings.push({
          sourceId: source.sourceId,
          message: `Excluded ${sanitized.excludedPaths.length} prohibited security or session field(s).`,
        });
      }
    } catch (error) {
      warnings.push({
        sourceId: source.sourceId,
        message: `Current source could not be read: ${error?.message || "Unknown error."}`,
      });
    }
  }
  return { sources, warnings };
}

function valueAtPath(value, path) {
  if (path === "$") return value;
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

export function countSourceRecords(data, source) {
  if (!source.recordPaths?.length) return 0;
  let count = 0;
  for (const path of source.recordPaths) {
    const value = valueAtPath(data, path);
    if (Array.isArray(value)) count += value.length;
    else if (path === "$" && value && typeof value === "object" && Object.keys(value).length) count += 1;
  }
  return count;
}

const FILE_FIELD_PATTERN = /(?:^|_)(?:image|images|photo|photos|receipt|evidence|attachment|file)(?:url|urls|uri|path|paths|reference|references)?$/i;

export function summarizeFileReferences(value) {
  const summary = { total: 0, embedded: 0, ephemeral: 0, signedOrExpiring: 0, remote: 0, unresolved: 0 };
  const stack = [{ value, key: "" }];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current.value)) {
      for (const entry of current.value) stack.push({ value: entry, key: current.key });
      continue;
    }
    if (current.value && typeof current.value === "object") {
      for (const [key, child] of Object.entries(current.value)) stack.push({ value: child, key });
      continue;
    }
    if (!FILE_FIELD_PATTERN.test(current.key) || typeof current.value !== "string" || !current.value.trim()) continue;
    summary.total += 1;
    const reference = current.value.trim();
    if (/^data:/i.test(reference)) summary.embedded += 1;
    else if (/^blob:/i.test(reference)) summary.ephemeral += 1;
    else if (/^https?:/i.test(reference) && /(?:token|signature|expires|x-amz-|signed)/i.test(reference)) summary.signedOrExpiring += 1;
    else if (/^https?:/i.test(reference)) summary.remote += 1;
    else summary.unresolved += 1;
  }
  return summary;
}

function addFileSummaries(target, addition) {
  for (const key of Object.keys(target)) target[key] += Number(addition[key] || 0);
}

function sectionHashPayload(section) {
  return {
    sourceId: section.sourceId,
    schemaVersion: section.schemaVersion,
    recordCount: section.recordCount,
    data: section.data,
    warnings: section.warnings || [],
  };
}

function manifestHashPayload(manifest) {
  const copy = cloneJson(manifest);
  delete copy.manifestHash;
  return copy;
}

export async function sealBackupEnvelope(envelope, hashImplementation) {
  const sealed = cloneJson(envelope);
  sealed.sections = Array.isArray(sealed.sections) ? sealed.sections : [];
  for (const section of sealed.sections) {
    section.sha256 = await hashCanonicalJson(sectionHashPayload(section), hashImplementation);
  }
  const existingIncluded = new Map((sealed.manifest?.includedSources || []).map((source) => [source.sourceId, source]));
  const indexedSections = sealed.sections.map((section) => ({
      sourceId: section.sourceId,
      schemaVersion: section.schemaVersion,
      recordCount: section.recordCount,
      sha256: section.sha256,
  }));
  const coverageSummary = {
    ...(sealed.coverageSummary || sealed.manifest?.coverageSummary || {}),
    includedSourceCount: sealed.sections.length,
    excludedSourceCount: sealed.manifest?.excludedSources?.length || 0,
    recordCount: sealed.sections.reduce((sum, section) => sum + Number(section.recordCount || 0), 0),
  };
  sealed.coverageSummary = coverageSummary;
  sealed.manifest = {
    ...(sealed.manifest || {}),
    formatVersion: sealed.formatVersion,
    createdAt: sealed.createdAt,
    applicationVersion: sealed.applicationVersion,
    sourceCommit: sealed.sourceCommit,
    coverageStatus: sealed.coverageStatus,
    coverageSummary: cloneJson(coverageSummary),
    includedSources: sealed.sections.map((section) => ({
      ...(existingIncluded.get(section.sourceId) || { sourceId: section.sourceId, displayName: section.sourceId }),
      recordCount: section.recordCount,
      schemaVersion: section.schemaVersion,
    })),
    sections: indexedSections,
  };
  sealed.manifest.manifestHash = await hashCanonicalJson(manifestHashPayload(sealed.manifest), hashImplementation);
  sealed.integrity = {
    algorithm: "SHA-256",
    manifestHash: sealed.manifest.manifestHash,
    selfVerificationPassed: false,
  };
  return sealed;
}

export async function verifyBackupEnvelope(envelope, options = {}) {
  const errors = [];
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) errors.push("Backup envelope is not an object.");
  if (envelope?.format !== CODE3_BACKUP_FORMAT) errors.push("Backup format is not recognized.");
  if (envelope?.formatVersion !== CODE3_BACKUP_FORMAT_VERSION) errors.push("Backup format version is not supported.");
  if (!Array.isArray(envelope?.sections)) errors.push("Backup sections are missing.");
  if (!envelope?.manifest || typeof envelope.manifest !== "object") errors.push("Backup manifest is missing.");
  if (errors.length) return { valid: false, errors };
  const unknownEnvelopeFields = Object.keys(envelope).filter((field) => !ENVELOPE_FIELDS.has(field));
  if (unknownEnvelopeFields.length) errors.push(`Backup envelope contains unsupported fields: ${unknownEnvelopeFields.join(", ")}.`);
  const unknownManifestFields = Object.keys(envelope.manifest).filter((field) => !MANIFEST_FIELDS.has(field));
  if (unknownManifestFields.length) errors.push(`Backup manifest contains unsupported fields: ${unknownManifestFields.join(", ")}.`);
  if (typeof envelope.createdAt !== "string" || !Number.isFinite(Date.parse(envelope.createdAt))) errors.push("Backup creation time is invalid.");
  if (typeof envelope.applicationVersion !== "string" || typeof envelope.sourceCommit !== "string") errors.push("Backup version metadata is invalid.");
  if (!Object.values(BACKUP_COVERAGE).includes(envelope.coverageStatus)) errors.push("Backup coverage state is invalid.");
  if (!envelope.coverageSummary || typeof envelope.coverageSummary !== "object" || Array.isArray(envelope.coverageSummary)) errors.push("Backup coverage summary is invalid.");
  if (!envelope.integrity || typeof envelope.integrity !== "object" || Array.isArray(envelope.integrity)) errors.push("Backup integrity metadata is invalid.");
  if (envelope.manifest.formatVersion !== envelope.formatVersion) errors.push("Envelope and manifest format versions do not match.");
  if (envelope.manifest.createdAt !== envelope.createdAt) errors.push("Envelope and manifest creation times do not match.");
  if (envelope.manifest.applicationVersion !== envelope.applicationVersion) errors.push("Envelope and manifest application versions do not match.");
  if (envelope.manifest.sourceCommit !== envelope.sourceCommit) errors.push("Envelope and manifest source commits do not match.");
  if (envelope.manifest.coverageStatus !== envelope.coverageStatus) errors.push("Envelope and manifest coverage states do not match.");
  try {
    if (canonicalStringify(envelope.manifest.coverageSummary) !== canonicalStringify(envelope.coverageSummary)) {
      errors.push("Envelope and manifest coverage summaries do not match.");
    }
  } catch (error) {
    errors.push(`Coverage summary is invalid: ${error.message}`);
  }

  const expectedManifestSections = [];
  for (const section of envelope.sections) {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      errors.push("Backup contains an invalid section.");
      continue;
    }
    if (!section.sourceId || !Number.isInteger(section.schemaVersion) || !Number.isInteger(section.recordCount) || section.data === undefined) {
      errors.push(`Section structure is invalid for ${section.sourceId || "unknown"}.`);
      continue;
    }
    try {
      const actualHash = await hashCanonicalJson(sectionHashPayload(section), options.hashImplementation);
      if (actualHash !== section.sha256) errors.push(`Section integrity failed for ${section.sourceId || "unknown"}.`);
    } catch (error) {
      errors.push(`Section integrity could not be calculated for ${section.sourceId || "unknown"}: ${error.message}`);
    }
    expectedManifestSections.push({
      sourceId: section.sourceId,
      schemaVersion: section.schemaVersion,
      recordCount: section.recordCount,
      sha256: section.sha256,
    });
  }
  try {
    if (canonicalStringify(expectedManifestSections) !== canonicalStringify(envelope.manifest.sections || [])) {
      errors.push("Manifest section index does not match backup sections.");
    }
    const indexedRecordCount = expectedManifestSections.reduce((sum, section) => sum + section.recordCount, 0);
    if (indexedRecordCount !== envelope.manifest.coverageSummary?.recordCount) {
      errors.push("Manifest record count does not match backup sections.");
    }
  } catch (error) {
    errors.push(`Manifest section index is invalid: ${error.message}`);
  }
  let actualManifestHash = "";
  try {
    actualManifestHash = await hashCanonicalJson(manifestHashPayload(envelope.manifest), options.hashImplementation);
    if (actualManifestHash !== envelope.manifest.manifestHash) errors.push("Manifest integrity failed.");
  } catch (error) {
    errors.push(`Manifest integrity could not be calculated: ${error.message}`);
  }
  if (envelope.integrity?.algorithm !== "SHA-256") errors.push("Backup integrity algorithm is not supported.");
  if (envelope.integrity?.manifestHash !== envelope.manifest.manifestHash) errors.push("Envelope and manifest hashes do not match.");
  return { valid: errors.length === 0, errors, manifestHash: actualManifestHash };
}

export async function verifyBackupJson(raw, options = {}) {
  let backup;
  try {
    backup = parseUntrustedBackupJson(raw, options.limits);
  } catch (error) {
    return { valid: false, errors: [error.message], errorCode: error.code || "PARSE_ERROR" };
  }
  return { backup, ...(await verifyBackupEnvelope(backup, options)) };
}

function resolveCoverage(excludedSources, failedSources) {
  if (failedSources.some((source) => source.affectsCoverage)) return BACKUP_COVERAGE.FAILED;
  if (excludedSources.some((source) => source.affectsCoverage)) return BACKUP_COVERAGE.PARTIAL;
  return BACKUP_COVERAGE.COMPLETE;
}

function backupFileTimestamp(createdAt) {
  const parsed = new Date(createdAt);
  if (!Number.isFinite(parsed.getTime())) return "unknown-date";
  const iso = parsed.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 16).replace(":", "")}`;
}

export async function createVerifiedBackup(options = {}) {
  const sourceRegistry = options.sourceRegistry || BACKUP_SOURCE_REGISTRY;
  const createdAt = options.createdAt || new Date().toISOString();
  const configuredSourceIds = options.configuredSourceIds || [];
  const sections = [];
  const includedSources = [];
  const excludedSources = [];
  const failedSources = [];
  const fileReferences = { total: 0, embedded: 0, ephemeral: 0, signedOrExpiring: 0, remote: 0, unresolved: 0 };

  for (const source of sourceRegistry) {
    if (!source.includedInPhase1AExport) continue;
    try {
      const rawData = readSourceData(source, options);
      const sanitized = sanitizeBackupData(rawData);
      const validation = validateBackupSourceData(source, sanitized.data);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      const warnings = sanitized.excludedPaths.length
        ? [`Excluded ${sanitized.excludedPaths.length} prohibited security or session field(s).`]
        : [];
      const schemaVersion = validation.schemaVersion;
      const section = {
        sourceId: source.sourceId,
        schemaVersion,
        recordCount: countSourceRecords(sanitized.data, source),
        data: sanitized.data,
        warnings,
        sha256: "",
      };
      sections.push(section);
      includedSources.push({ sourceId: source.sourceId, displayName: source.displayName, recordCount: section.recordCount, schemaVersion });
      addFileSummaries(fileReferences, summarizeFileReferences(sanitized.data));
    } catch (error) {
      const failure = {
        sourceId: source.sourceId,
        displayName: source.displayName,
        reason: `Source could not be read or validated: ${error?.message || "Unknown error."}`,
        affectsCoverage: isSourceCoverageRelevant(source, { configuredSourceIds }),
      };
      excludedSources.push(failure);
      failedSources.push(failure);
    }
  }

  const coverageContext = { configuredSourceIds, hasFileReferences: fileReferences.total > fileReferences.embedded };
  for (const source of sourceRegistry) {
    if (source.includedInPhase1AExport || !source.exclusionReason) continue;
    excludedSources.push({
      sourceId: source.sourceId,
      displayName: source.displayName,
      reason: source.exclusionReason,
      affectsCoverage: isSourceCoverageRelevant(source, coverageContext),
    });
  }

  const coverageStatus = resolveCoverage(excludedSources, failedSources);
  const envelope = {
    format: CODE3_BACKUP_FORMAT,
    formatVersion: CODE3_BACKUP_FORMAT_VERSION,
    createdAt,
    applicationVersion: String(options.applicationVersion || "unknown"),
    sourceCommit: String(options.sourceCommit || "unknown"),
    coverageStatus,
    coverageSummary: {
      includedSourceCount: includedSources.length,
      excludedSourceCount: excludedSources.length,
      recordCount: includedSources.reduce((sum, source) => sum + source.recordCount, 0),
      fileReferences,
      serverDataIncluded: false,
    },
    manifest: {
      formatVersion: CODE3_BACKUP_FORMAT_VERSION,
      createdAt,
      applicationVersion: String(options.applicationVersion || "unknown"),
      sourceCommit: String(options.sourceCommit || "unknown"),
      coverageStatus,
      coverageSummary: {
        includedSourceCount: includedSources.length,
        excludedSourceCount: excludedSources.length,
        recordCount: includedSources.reduce((sum, source) => sum + source.recordCount, 0),
        fileReferences,
        serverDataIncluded: false,
      },
      includedSources,
      excludedSources,
      securityExclusions: SECURITY_EXCLUSION_SUMMARY,
      fileReferences,
      knownLimitations: [
        "Phase 1A does not embed referenced file bytes.",
        "Phase 1A does not query Supabase, PostgreSQL, or process-memory data.",
        "Restore preview is inspection-only; this format is not applied in Phase 1A.",
      ],
      sections: [],
      manifestHash: "",
    },
    sections,
    integrity: { algorithm: "SHA-256", manifestHash: "", selfVerificationPassed: false },
  };

  let sealed = await sealBackupEnvelope(envelope, options.hashImplementation);
  let json = JSON.stringify(sealed, null, 2);
  const firstVerification = await verifyBackupJson(json, options);
  const selfVerificationPassed = firstVerification.valid;
  sealed.integrity.selfVerificationPassed = selfVerificationPassed;
  json = JSON.stringify(sealed, null, 2);
  const finalVerification = await verifyBackupJson(json, options);
  const verified = finalVerification.valid && selfVerificationPassed && coverageStatus !== BACKUP_COVERAGE.FAILED;

  return {
    backup: finalVerification.backup || sealed,
    json,
    verified,
    integrityVerified: finalVerification.valid && selfVerificationPassed,
    coverageStatus,
    fileName: `code-3-backup-${backupFileTimestamp(createdAt)}.json`,
    verification: finalVerification,
    activity: {
      type: "BACKUP_EXPORT_COMPLETED",
      createdAt,
      coverageStatus,
      recordCount: envelope.coverageSummary.recordCount,
      integrityResult: finalVerification.valid ? "PASSED" : "FAILED",
      warningCount: sections.reduce((sum, section) => sum + section.warnings.length, 0),
      errorCount: finalVerification.errors?.length || 0,
    },
  };
}
