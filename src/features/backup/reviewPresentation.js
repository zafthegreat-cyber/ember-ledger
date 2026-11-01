import { exportFile } from "../../native/nativeFiles.js";

const TEXT_LIMIT = 1200;
export const REVIEW_REPORT_FINDING_LIMIT = 100;
export const RESTORE_FINDING_GROUPS = Object.freeze([
  ["Duplicate IDs", "duplicateIds"], ["ID collisions", "idCollisions"], ["Duplicate provider listings", "duplicateProviderListings"],
  ["Duplicate certifications", "duplicateCertifications"], ["Duplicate aliases", "duplicateAliases"], ["Broken references", "brokenReferences"],
  ["Unknown sources", "unknownSources"], ["Unsupported schemas", "unsupportedSchemas"], ["Invalid money", "invalidMoney"],
  ["Unsupported precision", "unsupportedPrecision"], ["Missing fields", "missingFields"], ["Missing currency", "missingCurrency"],
  ["Currency mismatches", "currencyMismatches"], ["Prohibited fields", "prohibitedFields"],
]);
const DETAIL_FIELDS = Object.freeze({
  code: "Finding code",
  sourceId: "Source", domain: "Record type", collection: "Collection", id: "Record ID", recordId: "Record ID", path: "Location",
  reference: "Referenced ID", expectedCollections: "Expected collection", field: "Field", recordName: "Record", severity: "Severity", schemaVersion: "Schema version",
  precision: "Decimal places", firstSourceId: "First source", first: "First collection", secondSourceId: "Second source", second: "Second collection",
  firstId: "First record ID", secondId: "Second record ID", provider: "Provider", externalListingId: "Listing ID",
  certificationNumber: "Certification", currencies: "Currencies", action: "Proposed action",
});

function text(value) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  const clean = Array.from(String(value)).map(character => character.charCodeAt(0) < 32 && !"\n\t".includes(character) ? " " : character).join("");
  return clean.length > TEXT_LIMIT ? `${clean.slice(0, TEXT_LIMIT)}… [shortened]` : clean;
}

export function displayReviewValue(value, fallback = "Not available") { return text(value) || fallback; }

export function presentReviewFinding(finding) {
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) return { message: text(finding) || "Review required.", details: [] };
  const details = Object.entries(DETAIL_FIELDS).flatMap(([field, label]) => {
    if (!Object.hasOwn(finding, field)) return [];
    const raw = finding[field];
    const value = Array.isArray(raw) ? `${raw.slice(0, 20).map(text).filter(Boolean).join(", ")}${raw.length > 20 ? ` (${raw.length - 20} more omitted)` : ""}` : text(raw);
    return value ? [{ label, value }] : [];
  });
  return { message: text(finding.message) || text(finding.reason) || text(finding.code) || "Review the affected record or field.", details };
}

function findingGroup(label, input) {
  const findings = Array.isArray(input) ? input : [];
  return { label, total: findings.length, shown: Math.min(findings.length, REVIEW_REPORT_FINDING_LIMIT), omitted: Math.max(0, findings.length - REVIEW_REPORT_FINDING_LIMIT), findings: findings.slice(0, REVIEW_REPORT_FINDING_LIMIT).map(presentReviewFinding) };
}

function counts(input) {
  return Object.entries(input || {}).slice(0, 100).filter(([, value]) => Number.isSafeInteger(value) && value >= 0).map(([name, value]) => ({ name: text(name), count: value }));
}

// #80: bounded, text-safe copy of the compatibility and dry-run review so a
// downloaded report records which versions were checked and what a restore
// would have done. Never includes record contents.
function compatibilitySummary(input) {
  if (!input || typeof input !== "object") return null;
  const integer = (value) => (Number.isSafeInteger(value) ? value : null);
  return {
    status: text(input.status) || "UNKNOWN",
    format: { recognized: input.format?.recognized === true, formatVersion: integer(input.format?.formatVersion), supportedFormatVersion: integer(input.format?.supportedFormatVersion), status: text(input.format?.status) || "UNKNOWN" },
    application: { backupVersion: text(input.application?.backupVersion) || "unknown", currentVersion: text(input.application?.currentVersion) || "unknown", relation: text(input.application?.relation) || "UNKNOWN", createdAt: text(input.application?.createdAt) || null },
    sources: (Array.isArray(input.sources) ? input.sources : []).slice(0, 100).map((row) => ({
      sourceId: text(row?.sourceId), displayName: text(row?.displayName), schemaVersion: integer(row?.schemaVersion), currentSchemaVersion: integer(row?.currentSchemaVersion),
      supportedSchemaVersions: (Array.isArray(row?.supportedSchemaVersions) ? row.supportedSchemaVersions : []).filter(Number.isSafeInteger).slice(0, 50),
      status: text(row?.status) || "UNKNOWN", restorable: row?.restorable === true,
    })),
    messages: (Array.isArray(input.messages) ? input.messages : []).slice(0, 20).map(text).filter(Boolean),
  };
}

function dryRunSummary(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.sources)) return null;
  const integer = (value) => (Number.isSafeInteger(value) ? value : 0);
  const row = (entry) => ({ sourceId: text(entry?.sourceId), displayName: text(entry?.displayName), backupRecords: integer(entry?.backupRecords), currentRecords: integer(entry?.currentRecords), newRecords: integer(entry?.newRecords), matchingRecords: integer(entry?.matchingRecords), existingVersionsKept: integer(entry?.existingVersionsKept), recordsAfter: integer(entry?.recordsAfter) });
  return { sources: input.sources.slice(0, 100).map(row), totals: input.totals ? row({ ...input.totals, sourceId: "all", displayName: "All sources" }) : null };
}

function totals(input) {
  if (!input) return null;
  return { counts: counts(input.counts), amountMinorByDomainAndCurrency: Object.entries(input.amountMinorByDomainAndCurrency || {}).slice(0, 100).filter(([name, value]) => /^[A-Z_]+:[A-Z]{3}$/.test(name) && typeof value === "string" && /^-?\d{1,100}$/.test(value)).map(([name, amountMinor]) => ({ name, amountMinor })) };
}

export function createBackupReviewReport({ kind, result, reviewedAt = new Date().toISOString() }) {
  if (!["restore-preview", "migration-preview", "migration-rehearsal"].includes(kind) || !result || typeof result !== "object") throw new Error("A completed review is required before downloading its report.");
  const metadata = {};
  for (const field of ["result", "status", "sourceFileName", "formatVersion", "formatRecognized", "manifestIntegrity", "sectionIntegrity", "schemaCompatibility", "canonicalStatus", "remoteStatus", "legacyCloudStatus", "coverageStatus", "backupHash", "planHash", "previewHash", "beforeHash", "afterHash", "rollbackHash", "rollbackVerified", "localRecordCount", "remoteRecordCount", "newRecords", "matchingRecords", "potentialUpdates", "domainsReady", "appliedActions"]) {
    if (Object.hasOwn(result, field) && ["string", "number", "boolean"].includes(typeof result[field])) metadata[field] = typeof result[field] === "string" ? text(result[field]) : result[field];
  }
  if (kind === "migration-preview" && typeof result.plan?.planHash === "string" && /^[a-f0-9]{64}$/.test(result.plan.planHash)) metadata.planHash = result.plan.planHash;
  const groups = [...(kind === "restore-preview" ? RESTORE_FINDING_GROUPS : [["Blockers", "blockers"], ["Conflicts", "conflicts"], ["Unresolved or skipped actions", "exclusions"], ["Money conversion issues", "moneyIssues"], ["Reference problems", "referenceProblems"]]), ["Errors", "errors"], ["Warnings", "warnings"]];
  return {
    format: "code3.backup-review-report", version: 1, kind, reviewedAt: text(reviewedAt),
    purpose: "Diagnostic summary only. This is not a backup, restore approval, or migration plan. No records or attachment bytes are included. IDs, paths and findings may identify private records.",
    writesPerformed: Number.isSafeInteger(result.writesPerformed) ? result.writesPerformed : 0, activationAllowed: false,
    limits: { findingsPerGroup: REVIEW_REPORT_FINDING_LIMIT, textCharacters: TEXT_LIMIT, sourceCounts: 100, notes: "Finding-group totals and omitted counts are retained. Other source/total lists are capped at 100 entries, and list-valued details at 20. Long text is shortened. Refer to the reviewed backup for complete source data." },
    metadata, findings: groups.map(([label, key]) => findingGroup(label, result[key])).filter(group => group.total > 0),
    sourceCounts: counts(result.recordCounts || result.sourceCounts), sourceSchemas: counts(result.sourceSchemas),
    sourceCoverage: [findingGroup("Included sources", result.includedSources), findingGroup("Excluded sources", result.excludedSources)],
    compatibility: compatibilitySummary(result.compatibility), dryRun: dryRunSummary(result.dryRun),
    before: totals(result.before), after: totals(result.after),
  };
}

export function downloadBackupReviewReport(report, options = {}) {
  return exportFile({ ...options, blob: new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }), filename: `code-3-${report.kind}-review.json` });
}
