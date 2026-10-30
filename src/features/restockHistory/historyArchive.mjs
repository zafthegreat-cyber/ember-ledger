import { canonicalStringify, parseUntrustedJsonValue, sha256Text } from "../backup/canonicalJson.js";
import { validateWorkspaceSources, WORKSPACE_MAX_BYTES } from "../persistence/cloudWorkspaceSources.js";

export const HISTORY_FIELD = "historicalRestockHistory";
const FORMAT = "code3-historical-restock-history";
const ENCODING = "sha256-colon-groups-v1";
const ARCHIVE_ID = "code3-owner-supplied-restock-history";
const STATUS = new Set(["No stock found", "Partly out of stock", "Restock reported", "Stock update", "Out of stock"]);
const HASH = /^[a-f0-9]{64}$/;
const ID = /^(history|snapshot)-[a-f0-9]{24}$/;
const BATCH = /^user-feed-[a-f0-9]{16}$/;
const textEncoder = new globalThis.TextEncoder();

export class HistoricalRestockImportError extends Error {
  constructor(code, message) { super(message); this.name = "HistoricalRestockImportError"; this.code = code; }
}
function fail(code, message) { throw new HistoricalRestockImportError(code, `${message} Existing reports and prices are unchanged.`); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function requireRecord(value, context) { if (!record(value)) fail("INVALID_HISTORY", `${context} must be an object.`); }
function requireArray(value, context) { if (!Array.isArray(value)) fail("INVALID_HISTORY", `${context} must be an array.`); }
function requireText(value, context, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) fail("INVALID_HISTORY", `${context} must contain text.`);
}
function fields(value, allowed, context) {
  requireRecord(value, context);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail("UNSUPPORTED_HISTORY_FIELD", `${context} contains an unsupported field.`);
}
function integer(value, context, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail("INVALID_HISTORY", `${context} is invalid.`);
}
const clone = value => parseUntrustedJsonValue(canonicalStringify(value), { maxBytes: WORKSPACE_MAX_BYTES });
const normalize = value => value.normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
const same = (a, b) => canonicalStringify(a) === canonicalStringify(b);

function checkTimestamp(row, context) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/.test(row.observedAt || "")
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(row.observedAtUtc || "")
    || !Number.isFinite(Date.parse(row.observedAt)) || new Date(row.observedAt).toISOString() !== row.observedAtUtc) {
    fail("INVALID_HISTORY_TIME", `${context} has an invalid observation time.`);
  }
  if (Object.hasOwn(row, "timeZone") && row.timeZone !== "America/New_York") fail("INVALID_HISTORY_TIME", `${context} must retain its Eastern observation timezone.`);
  // Offsets in the source must agree with Eastern calendar time, not the device timezone.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(row.observedAtUtc)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` !== row.observedAt.slice(0, 16)) fail("INVALID_HISTORY_TIME", `${context} has an inconsistent Eastern time.`);
}

function checkStore(store) {
  fields(store, ["retailer", "branch", "city", "state", "storeId", "identityKey"], "Historical location");
  for (const key of ["retailer", "branch", "city", "state", "identityKey"]) requireText(store[key], `Location ${key}`);
  if (store.storeId !== null || !/^[A-Z]{2}$/.test(store.state)) fail("INVALID_HISTORY_STORE", "Imported location labels cannot claim a canonical store match.");
  const identity = [store.retailer, store.branch, store.city, store.state].map(normalize).join("|");
  if (store.identityKey !== identity) fail("INVALID_HISTORY_STORE", "A historical location identity does not match its original labels.");
}

function checkClaimSafety(row, context) {
  if (row.verificationStatus !== "unverified" || row.historicalOnly !== true || row.shouldTrainPredictions !== false
    || row.restockArrivalTimeEstablished !== false || row.sourceReportId !== null || row.sourceUrl !== null) {
    fail("UNSAFE_HISTORY_FLAGS", `${context} must remain historical, unverified and excluded from live stock and predictions.`);
  }
  if (row.timeZone !== "America/New_York") fail("INVALID_HISTORY_TIME", `${context} is missing its Eastern observation timezone.`);
  if (!STATUS.has(row.reportedStatus)) fail("INVALID_HISTORY_STATUS", `${context} has an unsupported reported status.`);
  requireText(row.originalNote, `${context} original note`);
  checkStore(row.store); checkTimestamp(row, context);
  requireArray(row.photoReferences, `${context} photo references`);
  for (const photo of row.photoReferences) {
    fields(photo, ["caption", "assetAvailable", "url"], "Photo caption");
    requireText(photo.caption, "Photo caption");
    if (photo.assetAvailable !== false || photo.url !== null) fail("UNSUPPORTED_HISTORY_PHOTO", "This text history cannot invent attached image assets.");
  }
}

function checkOccurrence(ref, sources, { snapshot = false } = {}) {
  fields(ref, snapshot ? ["batchId", "sourceOrdinal", "sourceStartLine"]
    : ["batchId", "sourceOrdinal", "sourceStartLine", "sourceEndLine", "copiedFreshnessLabel", "originalReportText"], "Source occurrence");
  if (!sources.has(ref.batchId)) fail("INVALID_HISTORY_PROVENANCE", "A source occurrence refers to an unknown batch.");
  integer(ref.sourceOrdinal, "Source report number", 1); integer(ref.sourceStartLine, "Source line", 1);
  if (!snapshot) {
    integer(ref.sourceEndLine, "Source end line", ref.sourceStartLine);
    requireText(ref.copiedFreshnessLabel, "Copied freshness label"); requireText(ref.originalReportText, "Original report text");
  }
}

const sourceFields = ["batchId", "kind", "platform", "platformName", "suppliedLocalDate", "file", "sha256", "byteLength", "originalReportIdsAvailable", "originalPermalinksAvailable", "independentlyVerified", "reportAppearances", "distinctReportsWithinSource", "repeatedWithinSource", "matchedEarlierReports", "addedDistinctObservations", "snapshotAppearances"];
const reportFields = ["id", "ordinal", "contentKey", "occurrenceKey", "sourceReportId", "sourceUrl", "store", "observedAt", "observedAtUtc", "timeZone", "originalTimeLabel", "originalTimeText", "reportedStatus", "reportedOutcome", "originalNote", "reportedQuantityText", "reportedQueueText", "reportedAbsenceScope", "photoReferences", "verificationStatus", "historicalOnly", "shouldTrainPredictions", "restockArrivalTimeEstablished", "reviewFlags", "historySnapshots", "sourceStartLine", "sourceEndLine", "copiedFreshnessLabel", "originalReportText", "sourceOccurrences"];
const snapshotFields = ["relationship", "reportedStatus", "observedAt", "observedAtUtc", "originalNote", "sourceStartLine", "observationId", "countedAsSeparateObservation", "snapshotKey", "sourceOccurrences", "reviewState", "candidateObservationIds", "unresolvedClaimId"];
const incompleteFields = ["id", "store", "observedAt", "observedAtUtc", "timeZone", "reportedStatus", "originalNote", "reportedQuantityText", "reportedQueueText", "sourceReportId", "sourceUrl", "photoReferences", "verificationStatus", "historicalOnly", "shouldTrainPredictions", "restockArrivalTimeEstablished", "reviewState", "candidateObservationIds", "references"];

function validateArchiveShape(input) {
  const archive = clone(input);
  fields(archive, ["schemaVersion", "archiveId", "sources", "storage", "constraints", "summary", "observations", "snapshotOnlyClaims"], "History archive");
  if (archive.schemaVersion !== 2 || archive.archiveId !== ARCHIVE_ID) fail("UNSUPPORTED_HISTORY_VERSION", "Choose a supported version 2 restock history archive.");
  for (const key of ["sources", "constraints", "observations", "snapshotOnlyClaims"]) requireArray(archive[key], key);
  if (!archive.sources.length || !archive.observations.length) fail("EMPTY_HISTORY", "This history contains no full observations to import.");
  fields(archive.storage, ["location", "uploadedToApp", "uploadedToCloud", "public"], "Archive storage metadata");
  if (archive.storage.public !== false) fail("PUBLIC_HISTORY_BLOCKED", "Imported history must stay private to this account.");
  for (const value of archive.constraints) requireText(value, "History constraint");
  const sources = new Map();
  for (const source of archive.sources) {
    fields(source, sourceFields, "History source");
    if (!BATCH.test(source.batchId || "") || !HASH.test(source.sha256 || "") || source.batchId !== `user-feed-${source.sha256.slice(0, 16)}`) fail("INVALID_HISTORY_PROVENANCE", "A source hash or batch identity is invalid.");
    if (sources.has(source.batchId)) fail("DUPLICATE_HISTORY_SOURCE", "The archive contains a repeated source identity.");
    if (source.kind !== "user_supplied_feed_transcript" || source.platform !== "another_app_or_website" || source.platformName !== null
      || source.independentlyVerified !== false || source.originalReportIdsAvailable !== false || source.originalPermalinksAvailable !== false) fail("UNSUPPORTED_HISTORY_SOURCE", "This importer accepts unverified copied feed history only.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.suppliedLocalDate || "")) fail("INVALID_HISTORY_PROVENANCE", "A source received date is invalid.");
    requireText(source.file, "Source file name");
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)|^[\\/]|^[a-z]:/i.test(source.file)) fail("INVALID_HISTORY_PROVENANCE", "Source file names must be relative archive labels.");
    for (const key of ["byteLength", "reportAppearances", "distinctReportsWithinSource", "repeatedWithinSource", "matchedEarlierReports", "addedDistinctObservations", "snapshotAppearances"]) integer(source[key], `Source ${key}`);
    sources.set(source.batchId, source);
  }
  const ids = new Set(), keys = new Set();
  for (const row of archive.observations) {
    fields(row, reportFields, "Historical report");
    if (!/^history-[a-f0-9]{24}$/.test(row.id || "") || !HASH.test(row.contentKey || "") || row.id !== `history-${row.contentKey.slice(0, 24)}`) fail("INVALID_HISTORY_ID", "A report identity is invalid.");
    if (ids.has(row.id) || keys.has(row.contentKey)) fail("DUPLICATE_HISTORY_REPORT", "The archive contains repeated full reports; deduplicate its source archive first.");
    ids.add(row.id); keys.add(row.contentKey);
    checkClaimSafety(row, "Historical report");
    if (row.occurrenceKey !== `${row.store.identityKey}|${row.observedAtUtc}`) fail("INVALID_HISTORY_ID", "A report occurrence does not match its location and date.");
    for (const key of ["reportedQuantityText", "reportedQueueText", "originalTimeLabel", "originalTimeText", "reportedOutcome", "copiedFreshnessLabel", "originalReportText"]) requireText(row[key], `Report ${key}`);
    if (row.reportedAbsenceScope !== null && !["all_collectible_inventory_as_reported", "products_in_this_reported_drop_only", "source_specified_items_only"].includes(row.reportedAbsenceScope)) fail("INVALID_HISTORY_SCOPE", "A historical absence scope is unsupported.");
    integer(row.ordinal, "Report order", 1); integer(row.sourceStartLine, "Report source line", 1); integer(row.sourceEndLine, "Report end line", row.sourceStartLine);
    requireArray(row.reviewFlags, "Review flags"); row.reviewFlags.forEach(flag => requireText(flag, "Review flag"));
    requireArray(row.sourceOccurrences, "Report provenance");
    if (!row.sourceOccurrences.length) fail("INVALID_HISTORY_PROVENANCE", "A historical report has no source appearance.");
    row.sourceOccurrences.forEach(ref => checkOccurrence(ref, sources));
    requireArray(row.historySnapshots, "History snapshots");
    for (const snapshot of row.historySnapshots) {
      fields(snapshot, snapshotFields, "History snapshot");
      if (!["Latest store visit", "Latest update to this restock"].includes(snapshot.relationship) || !STATUS.has(snapshot.reportedStatus)
        || snapshot.countedAsSeparateObservation !== false || snapshot.observationId !== null && !/^history-[a-f0-9]{24}$/.test(snapshot.observationId || "")) fail("INVALID_HISTORY_LINK", "A history reference is invalid.");
      checkTimestamp(snapshot, "History snapshot"); requireText(snapshot.originalNote, "Snapshot note");
      integer(snapshot.sourceStartLine, "Snapshot source line", 1);
      if (snapshot.snapshotKey !== JSON.stringify([snapshot.relationship, snapshot.observedAtUtc, snapshot.reportedStatus, snapshot.originalNote])) fail("INVALID_HISTORY_LINK", "A snapshot identity does not match its source details.");
      requireArray(snapshot.sourceOccurrences, "Snapshot provenance"); snapshot.sourceOccurrences.forEach(ref => checkOccurrence(ref, sources, { snapshot: true }));
      if (!snapshot.sourceOccurrences.length) fail("INVALID_HISTORY_PROVENANCE", "A snapshot has no source appearance.");
      if (Object.hasOwn(snapshot, "candidateObservationIds")) { requireArray(snapshot.candidateObservationIds, "Snapshot candidates"); if (snapshot.candidateObservationIds.some(id => !/^history-[a-f0-9]{24}$/.test(id))) fail("INVALID_HISTORY_LINK", "A snapshot candidate identity is invalid."); }
      if (Object.hasOwn(snapshot, "unresolvedClaimId") && !/^snapshot-[a-f0-9]{24}$/.test(snapshot.unresolvedClaimId || "")) fail("INVALID_HISTORY_LINK", "An incomplete claim identity is invalid.");
    }
  }
  const claimIds = new Set();
  for (const claim of archive.snapshotOnlyClaims) {
    fields(claim, incompleteFields, "Incomplete history claim");
    if (!/^snapshot-[a-f0-9]{24}$/.test(claim.id || "") || claimIds.has(claim.id)) fail("INVALID_HISTORY_ID", "An incomplete claim identity is invalid or repeated.");
    claimIds.add(claim.id); checkClaimSafety(claim, "Incomplete history claim");
    if (claim.reportedQuantityText !== null || claim.reportedQueueText !== null || claim.photoReferences.length) fail("INVENTED_HISTORY_DETAILS", "Incomplete history cannot invent missing quantities, queues or photos.");
    if (!["full_report_not_supplied", "multiple_possible_full_reports"].includes(claim.reviewState)) fail("INVALID_HISTORY_LINK", "An incomplete claim has an invalid review state.");
    requireArray(claim.candidateObservationIds, "Incomplete claim candidates");
    if (claim.candidateObservationIds.some(id => !ids.has(id))) fail("INVALID_HISTORY_LINK", "An incomplete claim candidate is missing.");
    requireArray(claim.references, "Incomplete claim provenance");
    if (!claim.references.length) fail("INVALID_HISTORY_LINK", "An incomplete claim has no parent reference.");
    for (const ref of claim.references) {
      fields(ref, ["parentObservationId", "relationship", "sourceOccurrences"], "Incomplete claim reference");
      if (!ids.has(ref.parentObservationId) || !["Latest store visit", "Latest update to this restock"].includes(ref.relationship)) fail("INVALID_HISTORY_LINK", "An incomplete claim parent is missing.");
      requireArray(ref.sourceOccurrences, "Incomplete claim provenance"); ref.sourceOccurrences.forEach(occurrence => checkOccurrence(occurrence, sources, { snapshot: true }));
    }
  }
  const byId = new Map(archive.observations.map(row => [row.id, row]));
  const byClaim = new Map(archive.snapshotOnlyClaims.map(row => [row.id, row]));
  for (const row of archive.observations) for (const snapshot of row.historySnapshots) {
    const target = snapshot.observationId ? byId.get(snapshot.observationId) : byClaim.get(snapshot.unresolvedClaimId);
    if (!target || target.store.identityKey !== row.store.identityKey || target.observedAtUtc !== snapshot.observedAtUtc
      || target.reportedStatus !== snapshot.reportedStatus || target.originalNote !== snapshot.originalNote) fail("INVALID_HISTORY_LINK", "A history reference does not match its full report or incomplete claim.");
  }
  for (const claim of archive.snapshotOnlyClaims) for (const ref of claim.references) {
    const parent = byId.get(ref.parentObservationId);
    const linked = parent.historySnapshots.find(snapshot => snapshot.unresolvedClaimId === claim.id && snapshot.relationship === ref.relationship
      && snapshot.observedAtUtc === claim.observedAtUtc && snapshot.reportedStatus === claim.reportedStatus && snapshot.originalNote === claim.originalNote);
    if (!linked || !same(linked.sourceOccurrences, ref.sourceOccurrences)) fail("INVALID_HISTORY_LINK", "An incomplete claim must retain the matching parent snapshot and exact provenance.");
  }
  archive.summary = historicalRestockSummary(archive);
  return archive;
}

/** A strict bijection for validated digest/identifier fields only. Free text is never encoded. */
function encodeIdentifier(value, key, decoding) {
  if (value === null) return value;
  if (["contentKey", "sha256"].includes(key)) {
    const pattern = decoding ? /^sha256:(?:[a-f0-9]{8}:){7}[a-f0-9]{8}$/ : HASH;
    if (!pattern.test(value || "")) fail("INVALID_HISTORY_ENCODING", "A history checksum encoding is invalid.");
    return decoding ? value.slice(7).replaceAll(":", "") : `sha256:${value.match(/.{8}/g).join(":")}`;
  }
  if (key === "batchId") {
    if (decoding) {
      if (!/^user-feed:[a-f0-9]{8}:[a-f0-9]{8}$/.test(value || "")) fail("INVALID_HISTORY_ENCODING", "A source identity encoding is invalid.");
      return `user-feed-${value.slice(10).replaceAll(":", "")}`;
    }
    if (!BATCH.test(value || "")) fail("INVALID_HISTORY_ENCODING", "A source identity is invalid.");
    return `user-feed:${value.slice(10).match(/.{8}/g).join(":")}`;
  }
  if (decoding) {
    if (!/^(?:history|snapshot):[a-f0-9]{8}:[a-f0-9]{8}:[a-f0-9]{8}$/.test(value || "")) fail("INVALID_HISTORY_ENCODING", "A historical record identity encoding is invalid.");
    const split = value.indexOf(":"); return `${value.slice(0, split)}-${value.slice(split + 1).replaceAll(":", "")}`;
  }
  if (!ID.test(value || "")) fail("INVALID_HISTORY_ENCODING", "A historical record identity is invalid.");
  const split = value.indexOf("-"); return `${value.slice(0, split)}:${value.slice(split + 1).match(/.{8}/g).join(":")}`;
}

function transformIdentifiers(value, decoding = false, key = "") {
  if (key === "candidateObservationIds") return value.map(id => encodeIdentifier(id, "id", decoding));
  if (["contentKey", "sha256", "batchId", "id", "observationId", "parentObservationId", "unresolvedClaimId"].includes(key)) return encodeIdentifier(value, key, decoding);
  if (Array.isArray(value)) return value.map(entry => transformIdentifiers(entry, decoding));
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([field, child]) => [field, transformIdentifiers(child, decoding, field)]));
  return value;
}

export function historicalRestockSummary(archive) {
  const observations = archive.observations || [], snapshots = observations.flatMap(row => row.historySnapshots || []);
  const countBy = key => observations.reduce((counts, row) => { const value = key(row); counts[value] = (counts[value] || 0) + 1; return counts; }, {});
  const dates = observations.map(row => row.observedAt.slice(0, 10)).sort(), times = observations.map(row => row.observedAtUtc).sort();
  const appearances = observations.reduce((count, row) => count + row.sourceOccurrences.length, 0);
  const groups = new Map(); for (const row of observations) groups.set(row.occurrenceKey, (groups.get(row.occurrenceKey) || 0) + 1);
  return { sourceBatches: archive.sources.length, sourceReportAppearances: appearances, distinctObservations: observations.length,
    repeatedReportAppearances: appearances - observations.length, distinctStoreLocations: new Set(observations.map(row => row.store.identityKey)).size,
    reportedStatuses: countBy(row => row.reportedStatus), cities: countBy(row => row.store.city), dailyObservations: countBy(row => row.observedAt.slice(0, 10)),
    earliestLocalDate: dates[0] || null, latestLocalDate: dates.at(-1) || null, earliestObservedAtUtc: times[0] || null, latestObservedAtUtc: times.at(-1) || null,
    historySnapshotAppearances: snapshots.reduce((count, row) => count + row.sourceOccurrences.length, 0), historySnapshots: snapshots.length,
    linkedHistorySnapshots: snapshots.filter(row => row.observationId).length, unresolvedHistorySnapshotReferences: snapshots.filter(row => !row.observationId).length,
    distinctSnapshotOnlyClaims: archive.snapshotOnlyClaims.length, photoCaptions: observations.flatMap(row => row.photoReferences).length,
    observationsWithPhotoCaptions: observations.filter(row => row.photoReferences.length).length,
    observationsFlaggedForReview: observations.filter(row => row.reviewFlags.length).length,
    sameLocationTimeGroupsWithDifferentDetails: [...groups.values()].filter(count => count > 1).length };
}

/** Null means no history was saved; unreadable or future data is never an empty success. */
export function readHistoricalRestockHistory(scout) {
  requireRecord(scout, "Saved Scout data");
  if (!Object.hasOwn(scout, HISTORY_FIELD)) return null;
  const envelope = scout[HISTORY_FIELD];
  fields(envelope, ["format", "version", "identifierEncoding", "archive"], "Saved historical reports");
  if (envelope.format !== FORMAT || envelope.version !== 1 || envelope.identifierEncoding !== ENCODING) fail("UNSUPPORTED_HISTORY_VERSION", "Saved history requires a supported app version.");
  validateWorkspaceSources({ "legacy-restock-scout": { schemaVersion: 0, data: { [HISTORY_FIELD]: envelope } } });
  return validateArchiveShape(transformIdentifiers(clone(envelope.archive), true));
}

async function verifyContentIdentities(archive) {
  for (const row of archive.observations) {
    const digest = await sha256Text(JSON.stringify([row.occurrenceKey, row.reportedStatus, row.originalNote, row.reportedQuantityText, row.reportedQueueText]));
    if (digest !== row.contentKey) fail("HISTORY_CONTENT_CONFLICT", "A report's original details changed without a matching identity.");
  }
  for (const claim of archive.snapshotOnlyClaims) {
    const digest = await sha256Text(JSON.stringify([claim.store.identityKey, claim.observedAtUtc, claim.reportedStatus, claim.originalNote]));
    if (claim.id !== `snapshot-${digest.slice(0, 24)}`) fail("HISTORY_CONTENT_CONFLICT", "An incomplete claim's details changed without a matching identity.");
  }
}

function unionReferences(first, second, key) {
  const result = first.map(entry => clone(entry));
  const index = new Map(result.map((entry, i) => [key(entry), i]));
  for (const entry of second) {
    const id = key(entry);
    if (index.has(id)) {
      if (!same(result[index.get(id)], entry)) fail("HISTORY_PROVENANCE_CONFLICT", "The same source appearance has different recorded details.");
    } else { index.set(id, result.length); result.push(clone(entry)); }
  }
  return result;
}
const occurrenceIdentity = ref => `${ref.batchId}|${ref.sourceOrdinal}|${ref.sourceStartLine}`;
const snapshotIdentity = snapshot => JSON.stringify([snapshot.relationship, snapshot.observedAtUtc, snapshot.reportedStatus, snapshot.originalNote]);

function mergeRecord(first, second) {
  const immutable = ["id", "contentKey", "occurrenceKey", "store", "observedAt", "observedAtUtc", "timeZone", "reportedStatus", "reportedOutcome", "originalNote", "reportedQuantityText", "reportedQueueText", "reportedAbsenceScope", "sourceReportId", "sourceUrl", "verificationStatus", "historicalOnly", "shouldTrainPredictions", "restockArrivalTimeEstablished"];
  if (immutable.some(key => !same(first[key], second[key]))) fail("HISTORY_CONTENT_CONFLICT", "An existing historical identity has different original details.");
  const merged = clone(first);
  merged.sourceOccurrences = unionReferences(first.sourceOccurrences, second.sourceOccurrences, occurrenceIdentity);
  merged.photoReferences = unionReferences(first.photoReferences, second.photoReferences, photo => photo.caption);
  merged.reviewFlags = [...new Set([...first.reviewFlags, ...second.reviewFlags])];
  for (const snapshot of second.historySnapshots) {
    const existing = merged.historySnapshots.find(candidate => snapshotIdentity(candidate) === snapshotIdentity(snapshot));
    if (existing) existing.sourceOccurrences = unionReferences(existing.sourceOccurrences, snapshot.sourceOccurrences, occurrenceIdentity);
    else merged.historySnapshots.push(clone(snapshot));
  }
  return merged;
}

function relinkHistory(archive) {
  const occurrences = new Map(), incomplete = new Map();
  for (const row of archive.observations) { const rows = occurrences.get(row.occurrenceKey) || []; rows.push(row); occurrences.set(row.occurrenceKey, rows); }
  for (const claim of archive.snapshotOnlyClaims) incomplete.set(claim.id, { ...clone(claim), references: [] });
  for (const row of archive.observations) {
    if ((occurrences.get(row.occurrenceKey)?.length || 0) > 1 && !row.reviewFlags.includes("same_location_time_different_report_details")) row.reviewFlags.push("same_location_time_different_report_details");
    for (const snapshot of row.historySnapshots) {
      const candidates = occurrences.get(`${row.store.identityKey}|${snapshot.observedAtUtc}`) || [];
      const exact = candidates.filter(candidate => candidate.reportedStatus === snapshot.reportedStatus && candidate.originalNote === snapshot.originalNote);
      if (exact.length === 1) {
        snapshot.observationId = exact[0].id;
        delete snapshot.reviewState; delete snapshot.unresolvedClaimId; delete snapshot.candidateObservationIds;
      } else {
        snapshot.observationId = null;
        const claim = incomplete.get(snapshot.unresolvedClaimId);
        if (!claim) fail("INVALID_HISTORY_LINK", "An incomplete history claim could not be preserved during this merge.");
        claim.candidateObservationIds = candidates.map(candidate => candidate.id);
        claim.reviewState = exact.length > 1 ? "multiple_possible_full_reports" : "full_report_not_supplied";
        snapshot.reviewState = claim.reviewState; snapshot.candidateObservationIds = [...claim.candidateObservationIds];
        claim.references.push({ parentObservationId: row.id, relationship: snapshot.relationship, sourceOccurrences: clone(snapshot.sourceOccurrences) });
      }
    }
  }
  archive.snapshotOnlyClaims = [...incomplete.values()].filter(claim => claim.references.length);
}

/** Pure preparation only: no browser storage, database, feed, price or network writes. */
export async function prepareHistoricalRestockImport(scout, input, { projectUrl } = {}) {
  requireRecord(scout, "Saved Scout data");
  const original = clone(scout), incoming = validateArchiveShape(input), existing = readHistoricalRestockHistory(original);
  await verifyContentIdentities(incoming); if (existing) await verifyContentIdentities(existing);
  const existingKeys = new Set(existing?.observations.map(row => row.contentKey) || []);
  const existingClaimIds = new Set(existing?.snapshotOnlyClaims.map(row => row.id) || []);
  let merged;
  if (!existing) merged = incoming;
  else {
    merged = clone(existing);
    const sourceIndex = new Map(merged.sources.map(source => [source.batchId, source]));
    for (const source of incoming.sources) {
      const saved = sourceIndex.get(source.batchId);
      if (saved) {
        // Per-import counters may differ with source order. Source identity and bytes may not.
        for (const key of ["sha256", "byteLength", "kind", "platform", "independentlyVerified"]) if (!same(saved[key], source[key])) fail("HISTORY_PROVENANCE_CONFLICT", "An existing source identity has conflicting provenance.");
      } else { const added = clone(source); merged.sources.push(added); sourceIndex.set(source.batchId, added); }
    }
    const byId = new Map(merged.observations.map((row, index) => [row.id, index]));
    for (const row of incoming.observations) {
      if (byId.has(row.id)) merged.observations[byId.get(row.id)] = mergeRecord(merged.observations[byId.get(row.id)], row);
      else { const added = clone(row); added.ordinal = merged.observations.length + 1; byId.set(row.id, merged.observations.length); merged.observations.push(added); }
    }
    for (const claim of incoming.snapshotOnlyClaims) {
      const saved = merged.snapshotOnlyClaims.find(row => row.id === claim.id);
      if (!saved) merged.snapshotOnlyClaims.push(clone(claim));
      else if (["store", "observedAt", "observedAtUtc", "reportedStatus", "originalNote"].some(key => !same(saved[key], claim[key]))) fail("HISTORY_CONTENT_CONFLICT", "An existing incomplete claim has different source details.");
    }
  }
  relinkHistory(merged);
  merged.summary = historicalRestockSummary(merged);
  merged = validateArchiveShape(merged);
  const envelope = { format: FORMAT, version: 1, identifierEncoding: ENCODING, archive: transformIdentifiers(merged) };
  const nextScout = { ...original, [HISTORY_FIELD]: envelope };
  // Use unchanged workspace/security/size guards. Benign checksums are formatted
  // explicitly above; free text and all other values receive the normal scan.
  validateWorkspaceSources({ "legacy-restock-scout": { schemaVersion: 0, data: nextScout } }, { projectUrl });
  if (textEncoder.encode(canonicalStringify(nextScout)).byteLength > WORKSPACE_MAX_BYTES) fail("HISTORY_TOO_LARGE", "The combined historical source exceeds the cloud save limit.");
  return { nextScout, added: incoming.observations.filter(row => !existingKeys.has(row.contentKey)).length,
    existing: incoming.observations.filter(row => existingKeys.has(row.contentKey)).length,
    addedClaims: incoming.snapshotOnlyClaims.filter(row => !existingClaimIds.has(row.id)).length,
    existingClaims: incoming.snapshotOnlyClaims.filter(row => existingClaimIds.has(row.id)).length,
    changed: !same(original, nextScout), summary: merged.summary };
}
