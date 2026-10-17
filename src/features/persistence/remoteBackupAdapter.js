import { canonicalStringify, hashCanonicalJson } from "../backup/canonicalJson.js";
import { CANONICAL_DOMAINS } from "./migrationSourceRegistry.js";
import { validateCanonicalFileAssetInput } from "./fileAsset.js";

export const REMOTE_BACKUP_EXPORT_FORMAT = "code-3-server-export";
export const REMOTE_BACKUP_EXPORT_VERSION = 1;
export const REMOTE_BACKUP_STATES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  ERROR: "ERROR",
});
export const REMOTE_BACKUP_COVERAGE = Object.freeze({ COMPLETE: "COMPLETE", PARTIAL: "PARTIAL" });

const PROHIBITED_KEY_PATTERN = /(?:authorization|access.?token|refresh.?token|id.?token|session|cookie|password|secret|api.?key|owner.?subjects?|private.?key)/i;
const PROHIBITED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clone(value) {
  return JSON.parse(canonicalStringify(value));
}

function countDomainRecords(domains) {
  return Object.values(domains || {}).reduce((sum, records) => sum + (Array.isArray(records) ? records.length : 0), 0);
}

function inspectSafeExportValue(value) {
  const errors = [];
  const stack = [{ value, path: "$", depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    if (current.depth > 40) {
      errors.push(`Remote export exceeds the nesting limit at ${current.path}.`);
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      if (current.value.length > 50_000) errors.push(`Remote export array is too large at ${current.path}.`);
      current.value.forEach((entry, index) => stack.push({ value: entry, path: `${current.path}[${index}]`, depth: current.depth + 1 }));
      continue;
    }
    for (const [key, child] of Object.entries(current.value)) {
      if (PROHIBITED_KEYS.has(key) || PROHIBITED_KEY_PATTERN.test(key)) {
        errors.push(`Remote export contains a prohibited field at ${current.path}.${key}.`);
      }
      stack.push({ value: child, path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }
  return errors;
}

export function validateRemoteBackupExport(value) {
  const errors = inspectSafeExportValue(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push("Remote export must be an object.");
    return { valid: false, errors };
  }
  if (value.format !== REMOTE_BACKUP_EXPORT_FORMAT) errors.push("Remote export format is not recognized.");
  if (value.formatVersion !== REMOTE_BACKUP_EXPORT_VERSION) errors.push("Remote export version is not supported.");
  if (!Object.values(REMOTE_BACKUP_COVERAGE).includes(value.coverageStatus)) errors.push("Remote export coverage status is invalid.");
  if (typeof value.coverageExplanation !== "string" || value.coverageExplanation.length > 2_000) errors.push("Remote export coverage explanation is invalid.");
  if (!Array.isArray(value.truncatedDomains) || value.truncatedDomains.some((domain) => typeof domain !== "string" || !domain.trim())) {
    errors.push("Remote export truncatedDomains is invalid.");
  }
  if (typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/i.test(value.sourceHash)) errors.push("Remote export sourceHash is invalid.");
  if (!value.domains || typeof value.domains !== "object" || Array.isArray(value.domains)) errors.push("Remote export domains are missing.");
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) errors.push("Remote export creation time is invalid.");
  if (value.domains && typeof value.domains === "object") {
    const supportedDomains = new Set(Object.values(CANONICAL_DOMAINS));
    const ownerWideIds = new Map();
    for (const [domain, records] of Object.entries(value.domains)) {
      if (!supportedDomains.has(domain)) errors.push(`Remote export domain ${domain || "unknown"} is not canonical.`);
      if (!domain || !Array.isArray(records)) errors.push(`Remote export domain ${domain || "unknown"} must contain an array.`);
      if (Array.isArray(records) && records.length > 50_000) errors.push(`Remote export domain ${domain} exceeds the record limit.`);
      for (const record of Array.isArray(records) ? records : []) {
        if (!record || typeof record !== "object" || Array.isArray(record)) errors.push(`Remote export domain ${domain} contains a non-record value.`);
        else {
          if (record.domain !== domain) errors.push(`Remote export record domain does not match ${domain}.`);
          if (typeof record.id !== "string" || !UUID_PATTERN.test(record.id)) errors.push(`Remote export record in ${domain} has an invalid stable ID.`);
          else {
            const normalizedId = record.id.toLowerCase();
            if (ownerWideIds.has(normalizedId)) errors.push(`Remote export repeats owner-wide canonical ID ${record.id} in ${ownerWideIds.get(normalizedId)} and ${domain}.`);
            else ownerWideIds.set(normalizedId, domain);
          }
          if (domain === CANONICAL_DOMAINS.FILE_ASSET) {
            const fileAsset = validateCanonicalFileAssetInput(record.fileAsset);
            for (const message of fileAsset.errors) errors.push(`Remote FILE_ASSET ${record.id || "unknown"}: ${message}`);
          } else if (record.fileAsset != null) {
            errors.push(`Remote export record ${record.id || "unknown"} in ${domain} contains unsupported fileAsset data.`);
          }
        }
      }
    }
    for (const domain of Array.isArray(value.truncatedDomains) ? value.truncatedDomains : []) {
      if (!supportedDomains.has(domain)) errors.push(`Remote export truncated domain ${domain} is not canonical.`);
    }
    if (value.coverageStatus === REMOTE_BACKUP_COVERAGE.COMPLETE) {
      const missingDomains = [...supportedDomains].filter((domain) => !Object.prototype.hasOwnProperty.call(value.domains, domain));
      if (missingDomains.length) errors.push(`COMPLETE remote export is missing canonical domains: ${missingDomains.join(", ")}.`);
    }
  }
  const actualRecordCount = errors.length ? 0 : countDomainRecords(value.domains);
  if (!Number.isSafeInteger(value.recordCount) || value.recordCount < 0 || value.recordCount !== actualRecordCount) {
    errors.push("Remote export recordCount does not match its domains.");
  }
  if (value.coverageStatus === REMOTE_BACKUP_COVERAGE.COMPLETE && value.truncatedDomains?.length) {
    errors.push("Remote export cannot be COMPLETE when domains are truncated.");
  }
  return {
    valid: errors.length === 0,
    errors,
    recordCount: errors.length ? 0 : actualRecordCount,
    normalized: errors.length ? null : clone(value),
  };
}

function responseStatus(response) {
  const status = Number(response?.status);
  if (status === 401) return REMOTE_BACKUP_STATES.UNAUTHORIZED;
  if (status === 403) return REMOTE_BACKUP_STATES.FORBIDDEN;
  if (status >= 500 || status === 0) return REMOTE_BACKUP_STATES.UNAVAILABLE;
  return REMOTE_BACKUP_STATES.ERROR;
}

export function createUnavailableRemoteBackupAdapter(reason = "Canonical server export is not configured.") {
  return Object.freeze({
    kind: "REMOTE_BACKUP_EXPORT",
    async inspect() {
      return { status: REMOTE_BACKUP_STATES.UNAVAILABLE, included: false, domains: {}, recordCount: 0, reason };
    },
  });
}

export function createRemoteBackupExportAdapter(options = {}) {
  const request = options.request;
  const route = String(options.route || "/api/code3/export");
  if (typeof request !== "function" || !route.startsWith("/api/code3/")) {
    throw new Error("Remote backup adapters require an owner-authorized Code 3 request function and route.");
  }

  return Object.freeze({
    kind: "REMOTE_BACKUP_EXPORT",
    route,
    async inspect({ signal } = {}) {
      let response;
      try {
        response = await request(route, { method: "GET", cache: "no-store", signal });
      } catch {
        return {
          status: REMOTE_BACKUP_STATES.UNAVAILABLE,
          included: false,
          domains: {},
          recordCount: 0,
          reason: "Canonical server export is unavailable.",
        };
      }

      if (!response || response.ok === false) {
        const status = responseStatus(response);
        return {
          status,
          included: false,
          domains: {},
          recordCount: 0,
          reason: status === REMOTE_BACKUP_STATES.UNAUTHORIZED
            ? "Sign in is required before server records can be included."
            : status === REMOTE_BACKUP_STATES.FORBIDDEN
              ? "Owner authorization is required before server records can be included."
              : "Canonical server export is unavailable.",
        };
      }

      let body;
      let validation;
      try {
        body = typeof response.json === "function" ? await response.json() : response.body;
        validation = validateRemoteBackupExport(body);
      } catch {
        return {
          status: REMOTE_BACKUP_STATES.ERROR,
          included: false,
          domains: {},
          recordCount: 0,
          reason: "Canonical server export returned an unreadable response.",
          errors: ["Remote export JSON could not be parsed or validated."],
        };
      }
      if (!validation.valid) {
        return {
          status: REMOTE_BACKUP_STATES.ERROR,
          included: false,
          domains: {},
          recordCount: 0,
          reason: "Canonical server export failed validation.",
          errors: validation.errors,
        };
      }
      const calculatedSourceHash = await hashCanonicalJson(validation.normalized.domains);
      if (calculatedSourceHash !== validation.normalized.sourceHash.toLowerCase()) {
        return {
          status: REMOTE_BACKUP_STATES.ERROR,
          included: false,
          domains: {},
          recordCount: 0,
          reason: "Canonical server export failed integrity verification.",
          errors: ["Remote export sourceHash does not match its canonical domains."],
        };
      }
      return {
        status: REMOTE_BACKUP_STATES.AVAILABLE,
        included: true,
        domains: validation.normalized.domains,
        recordCount: validation.recordCount,
        sourceHash: validation.normalized.sourceHash,
        createdAt: validation.normalized.createdAt,
        coverageStatus: validation.normalized.coverageStatus,
        coverageExplanation: validation.normalized.coverageExplanation,
        truncatedDomains: [...validation.normalized.truncatedDomains],
        warnings: validation.normalized.truncatedDomains.map((domain) => `Canonical server export truncated ${domain}.`),
      };
    },
  });
}

export function remoteCoverageState(remoteResult) {
  if (
    remoteResult?.status === REMOTE_BACKUP_STATES.AVAILABLE
    && remoteResult.included === true
    && remoteResult.coverageStatus === REMOTE_BACKUP_COVERAGE.COMPLETE
    && !(remoteResult.truncatedDomains || []).length
  ) {
    return { coverageStatus: "COMPLETE", serverDataIncluded: true, warning: "" };
  }
  return {
    coverageStatus: "PARTIAL",
    serverDataIncluded: remoteResult?.status === REMOTE_BACKUP_STATES.AVAILABLE && remoteResult.included === true,
    warning: remoteResult?.coverageExplanation
      || remoteResult?.reason
      || (remoteResult?.truncatedDomains?.length
        ? `Canonical server export truncated: ${remoteResult.truncatedDomains.join(", ")}.`
        : "Canonical server records are not included."),
  };
}
