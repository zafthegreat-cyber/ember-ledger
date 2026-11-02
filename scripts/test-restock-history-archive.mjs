import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { HISTORY_FIELD, historicalRestockSummary, prepareHistoricalRestockImport, readHistoricalRestockHistory } from "../src/features/restockHistory/historyArchive.mjs";
import { canonicalStringify, sha256Text } from "../src/features/backup/canonicalJson.js";
import { findProhibitedData } from "../src/features/backup/backupSecurity.js";
import { validateWorkspaceSources } from "../src/features/persistence/cloudWorkspaceSources.js";

const clone = value => JSON.parse(JSON.stringify(value));
const normalization = value => value.normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
function source(hash = "a".repeat(64)) {
  return { batchId: `user-feed-${hash.slice(0, 16)}`, kind: "user_supplied_feed_transcript", platform: "another_app_or_website", platformName: null,
    suppliedLocalDate: "2026-10-29", file: "source.txt", sha256: hash, byteLength: 1234, originalReportIdsAvailable: false,
    originalPermalinksAvailable: false, independentlyVerified: false, reportAppearances: 1, distinctReportsWithinSource: 1,
    repeatedWithinSource: 0, matchedEarlierReports: 0, addedDistinctObservations: 1, snapshotAppearances: 0 };
}
async function report({ note = "None found: All collectible inventory", status = "No stock found", quantity = "0 observed", line = "Not reported",
  at = "2026-10-12T11:00:00-04:00", batch = source(), ordinal = 1, photoReferences = [] } = {}) {
  const store = { retailer: "Synthetic Cards", branch: "Harbor", city: "Norfolk", state: "VA", storeId: null };
  store.identityKey = [store.retailer, store.branch, store.city, store.state].map(normalization).join("|");
  const observedAtUtc = new Date(at).toISOString(), occurrenceKey = `${store.identityKey}|${observedAtUtc}`;
  const contentKey = await sha256Text(JSON.stringify([occurrenceKey, status, note, quantity, line]));
  const originalReportText = `${status}\n● Needs a check · 17 days ago\n\n${note}\n\nSynthetic Cards · Harbor\nNorfolk, VA\nChecked · Oct 12, 2026, 11:00 AM ET\n\nQuantity ${quantity}\nLine ${line}\nView report\nDirections`;
  return { id: `history-${contentKey.slice(0, 24)}`, ordinal, contentKey, occurrenceKey, sourceReportId: null, sourceUrl: null, store,
    observedAt: at, observedAtUtc, timeZone: "America/New_York", originalTimeLabel: "Checked", originalTimeText: "Oct 12, 2026, 11:00 AM ET",
    reportedStatus: status, reportedOutcome: status === "No stock found" ? "no_stock_reported" : "stock_reported", originalNote: note,
    reportedQuantityText: quantity, reportedQueueText: line, reportedAbsenceScope: status === "No stock found" ? "all_collectible_inventory_as_reported" : null,
    photoReferences, verificationStatus: "unverified", historicalOnly: true, shouldTrainPredictions: false, restockArrivalTimeEstablished: false,
    reviewFlags: [], historySnapshots: [], sourceStartLine: 1, sourceEndLine: 14, copiedFreshnessLabel: "● Needs a check · 17 days ago", originalReportText,
    sourceOccurrences: [{ batchId: batch.batchId, sourceOrdinal: ordinal, sourceStartLine: 1, sourceEndLine: 14,
      copiedFreshnessLabel: "● Needs a check · 17 days ago", originalReportText }] };
}
function archive(rows, sources = [source()], claims = []) {
  const value = { schemaVersion: 2, archiveId: "code3-owner-supplied-restock-history", sources,
    storage: { location: "local_workspace_only", uploadedToApp: false, uploadedToCloud: false, public: false },
    constraints: ["Historical source claims only, not current stock."], summary: {}, observations: rows, snapshotOnlyClaims: claims };
  value.summary = historicalRestockSummary(value); return value;
}
const existingScout = () => ({ reports: [{ id: "existing-live", stockStatus: "in_stock", quantity: 2 }], restockIntel: [{ id: "existing-intel" }],
  stores: [{ id: "existing-store", favorite: true }], alertSettings: { enabled: true }, unknownFutureField: { preserve: "exact" } });

test("absent history is null; unreadable and unsupported saved history throws without a fallback", () => {
  assert.equal(readHistoricalRestockHistory(existingScout()), null);
  assert.throws(() => readHistoricalRestockHistory(null), /must be an object/);
  assert.throws(() => readHistoricalRestockHistory({ [HISTORY_FIELD]: null }), /must be an object/);
  assert.throws(() => readHistoricalRestockHistory({ [HISTORY_FIELD]: { format: "code3-historical-restock-history", version: 2, identifierEncoding: "sha256-colon-groups-v1", archive: {} } }), error => error.code === "UNSUPPORTED_HISTORY_VERSION");
});

test("first import and reload preserve every unrelated Scout field and both historical negative and positive details", async () => {
  const before = existingScout(), bytes = JSON.stringify(before);
  const negative = await report();
  const positive = await report({ status: "Restock reported", note: "Few tins left", quantity: "Not reported", line: "0", at: "2026-10-13T11:00:00-04:00", ordinal: 2 });
  const input = archive([negative, positive]), inputBytes = JSON.stringify(input);
  const result = await prepareHistoricalRestockImport(before, input);
  assert.equal(result.added, 2); assert.equal(result.existing, 0); assert.equal(result.changed, true);
  const { [HISTORY_FIELD]: saved, ...unchanged } = result.nextScout;
  assert.deepEqual(unchanged, before); assert.equal(JSON.stringify(before), bytes); assert.equal(JSON.stringify(input), inputBytes);
  assert.equal(saved.version, 1);
  const decoded = readHistoricalRestockHistory(result.nextScout);
  assert.deepEqual(decoded.observations, [negative, positive]);
  assert.equal(decoded.observations[1].reportedQuantityText, "Not reported");
  assert.equal(decoded.observations[1].reportedQueueText, "0");
});

test("repeated import is an exact no-op and recomputes a stale supplied summary", async () => {
  const input = archive([await report()]); input.summary.distinctObservations = 99_999;
  const first = await prepareHistoricalRestockImport({}, input);
  const again = await prepareHistoricalRestockImport(first.nextScout, input);
  assert.equal(again.added, 0); assert.equal(again.existing, 1); assert.equal(again.changed, false);
  assert.equal(again.summary.distinctObservations, 1);
  assert.equal(canonicalStringify(first.nextScout), canonicalStringify(again.nextScout));
});

test("same identity with changed original details fails before any state can change", async () => {
  const input = archive([await report()]), saved = await prepareHistoricalRestockImport(existingScout(), input);
  const before = JSON.stringify(saved.nextScout), changed = clone(input); changed.observations[0].originalNote = "Changed source claim";
  await assert.rejects(prepareHistoricalRestockImport(saved.nextScout, changed), error => error.code === "HISTORY_CONTENT_CONFLICT");
  assert.equal(JSON.stringify(saved.nextScout), before);
});

test("unsafe verification, training, invented photos and mismatched times are rejected", async () => {
  const input = archive([await report()]);
  for (const patch of [{ verificationStatus: "verified" }, { shouldTrainPredictions: true }, { historicalOnly: false }, { restockArrivalTimeEstablished: true },
    { sourceReportId: "invented" }, { timeZone: "UTC" }, { store: { ...input.observations[0].store, storeId: "claimed-canonical" } },
    { observedAt: "2026-10-12T11:00:00-05:00" }, { photoReferences: [{ caption: "Image", assetAvailable: true, url: "https://example.test/image.jpg" }] }]) {
    const changed = clone(input); Object.assign(changed.observations[0], patch);
    await assert.rejects(prepareHistoricalRestockImport({}, changed));
  }
});

test("a benign Luhn-shaped digest is stored losslessly without weakening ordinary security scanning", async () => {
  const batch = source("4111111111111111" + "a".repeat(48)), input = archive([await report({ batch })], [batch]);
  assert.ok(findProhibitedData(input).length);
  const result = await prepareHistoricalRestockImport({}, input);
  assert.equal(findProhibitedData(result.nextScout).length, 0);
  assert.match(result.nextScout[HISTORY_FIELD].archive.sources[0].sha256, /^sha256:41111111:11111111:/);
  assert.equal(readHistoricalRestockHistory(result.nextScout).sources[0].sha256, batch.sha256);
  assert.doesNotThrow(() => validateWorkspaceSources({ "legacy-restock-scout": { schemaVersion: 0, data: result.nextScout } }));
  const unsafe = archive([await report({ note: "Bearer synthetic_secret_1234567890" })]);
  await assert.rejects(prepareHistoricalRestockImport({}, unsafe), error => error.code === "SECURITY_REVIEW_REQUIRED");
});

test("overlapping source batches append provenance without duplicating the report", async () => {
  const firstSource = source(), secondSource = source("b".repeat(64));
  const first = await prepareHistoricalRestockImport({}, archive([await report({ batch: firstSource })], [firstSource]));
  const next = await prepareHistoricalRestockImport(first.nextScout, archive([await report({ batch: secondSource })], [secondSource]));
  assert.equal(next.added, 0); assert.equal(next.existing, 1); assert.equal(next.changed, true);
  const decoded = readHistoricalRestockHistory(next.nextScout);
  assert.equal(decoded.observations.length, 1); assert.equal(decoded.observations[0].sourceOccurrences.length, 2);
  assert.equal(decoded.summary.sourceBatches, 2); assert.equal(decoded.summary.repeatedReportAppearances, 1);
  const retry = await prepareHistoricalRestockImport(next.nextScout, archive([await report({ batch: secondSource })], [secondSource]));
  assert.equal(retry.changed, false);
});

test("conflicting bytes for the same source appearance are never silently overwritten", async () => {
  const input = archive([await report()]), saved = await prepareHistoricalRestockImport({}, input);
  const changed = clone(input); changed.observations[0].sourceOccurrences[0].originalReportText += "\nUnexplained change";
  await assert.rejects(prepareHistoricalRestockImport(saved.nextScout, changed), error => error.code === "HISTORY_PROVENANCE_CONFLICT");
});

test("additional photo captions on overlapping reports are retained as unavailable references", async () => {
  const first = await prepareHistoricalRestockImport({}, archive([await report({ photoReferences: [{ caption: "Watermarked shelf photo 1", assetAvailable: false, url: null }] })]));
  const nextSource = source("b".repeat(64));
  const next = await prepareHistoricalRestockImport(first.nextScout, archive([await report({ batch: nextSource,
    photoReferences: [{ caption: "Watermarked shelf photo 1", assetAvailable: false, url: null }, { caption: "Watermarked shelf photo 2", assetAvailable: false, url: null }] })], [nextSource]));
  assert.equal(next.summary.photoCaptions, 2); assert.equal(next.added, 0);
});

test("different same-location same-minute reports remain separate, with review flags", async () => {
  const initial = await prepareHistoricalRestockImport({}, archive([await report()]));
  const nextSource = source("c".repeat(64));
  const next = await prepareHistoricalRestockImport(initial.nextScout, archive([await report({ batch: nextSource, note: "None found: Pokemon" })], [nextSource]));
  const decoded = readHistoricalRestockHistory(next.nextScout);
  assert.equal(decoded.observations.length, 2); assert.equal(decoded.summary.sameLocationTimeGroupsWithDifferentDetails, 1);
  assert.ok(decoded.observations.every(row => row.reviewFlags.includes("same_location_time_different_report_details")));
});

test("incomplete claims keep unknown details, and a later full report resolves references without invented stock", async () => {
  const parent = await report(), at = "2026-10-13T11:00:00-04:00", utc = "2026-10-13T15:00:00.000Z", note = "None found: Pokemon";
  const claimDigest = await sha256Text(JSON.stringify([parent.store.identityKey, utc, "No stock found", note]));
  const claimId = `snapshot-${claimDigest.slice(0, 24)}`;
  const occurrence = { batchId: source().batchId, sourceOrdinal: 1, sourceStartLine: 21 };
  const snapshot = { relationship: "Latest store visit", reportedStatus: "No stock found", observedAt: at, observedAtUtc: utc, originalNote: note,
    sourceStartLine: 21, observationId: null, countedAsSeparateObservation: false,
    snapshotKey: JSON.stringify(["Latest store visit", utc, "No stock found", note]), sourceOccurrences: [occurrence],
    reviewState: "full_report_not_supplied", candidateObservationIds: [], unresolvedClaimId: claimId };
  parent.historySnapshots.push(snapshot);
  const claim = { id: claimId, store: clone(parent.store), observedAt: at, observedAtUtc: utc, timeZone: "America/New_York", reportedStatus: "No stock found", originalNote: note,
    reportedQuantityText: null, reportedQueueText: null, sourceReportId: null, sourceUrl: null, photoReferences: [], verificationStatus: "unverified", historicalOnly: true,
    shouldTrainPredictions: false, restockArrivalTimeEstablished: false, reviewState: "full_report_not_supplied", candidateObservationIds: [],
    references: [{ parentObservationId: parent.id, relationship: "Latest store visit", sourceOccurrences: [occurrence] }] };
  const withClaim = archive([parent], [source()], [claim]);
  const orphaned = clone(withClaim); orphaned.observations[0].historySnapshots = [];
  await assert.rejects(prepareHistoricalRestockImport({}, orphaned), error => error.code === "INVALID_HISTORY_LINK");
  const first = await prepareHistoricalRestockImport({}, withClaim);
  assert.equal(readHistoricalRestockHistory(first.nextScout).snapshotOnlyClaims[0].reportedQuantityText, null);
  const nextSource = source("d".repeat(64)), full = await report({ batch: nextSource, note, at });
  const next = await prepareHistoricalRestockImport(first.nextScout, archive([full], [nextSource]));
  const decoded = readHistoricalRestockHistory(next.nextScout);
  assert.equal(decoded.snapshotOnlyClaims.length, 0); assert.equal(decoded.summary.linkedHistorySnapshots, 1);
  assert.equal(decoded.observations[0].historySnapshots[0].observationId, full.id);
  assert.equal(decoded.observations[1].reportedQuantityText, "0 observed");
});

test("invalid snapshot destinations, duplicate input records and duplicate sources are rejected", async () => {
  const input = archive([await report()]);
  const duplicates = clone(input); duplicates.observations.push(clone(input.observations[0]));
  await assert.rejects(prepareHistoricalRestockImport({}, duplicates), error => error.code === "DUPLICATE_HISTORY_REPORT");
  const sources = clone(input); sources.sources.push(clone(sources.sources[0]));
  await assert.rejects(prepareHistoricalRestockImport({}, sources), error => error.code === "DUPLICATE_HISTORY_SOURCE");
  const invalid = clone(input); invalid.observations[0].historySnapshots.push({ relationship: "Latest store visit", reportedStatus: "No stock found",
    observedAt: input.observations[0].observedAt, observedAtUtc: input.observations[0].observedAtUtc, originalNote: "Different note", sourceStartLine: 21,
    observationId: input.observations[0].id, countedAsSeparateObservation: false,
    snapshotKey: JSON.stringify(["Latest store visit", input.observations[0].observedAtUtc, "No stock found", "Different note"]),
    sourceOccurrences: [{ batchId: source().batchId, sourceOrdinal: 1, sourceStartLine: 21 }] });
  await assert.rejects(prepareHistoricalRestockImport({}, invalid), error => error.code === "INVALID_HISTORY_LINK");
});

test("unsupported versions, prohibited keys, source paths and oversized data fail safely", async () => {
  const input = archive([await report()]);
  const future = clone(input); future.schemaVersion = 3;
  await assert.rejects(prepareHistoricalRestockImport({}, future), error => error.code === "UNSUPPORTED_HISTORY_VERSION");
  const polluted = JSON.parse(JSON.stringify(input).replace('"schemaVersion":2', '"schemaVersion":2,"__proto__":{}'));
  await assert.rejects(prepareHistoricalRestockImport({}, polluted), error => error.code === "PROHIBITED_KEY");
  const absolute = clone(input); absolute.sources[0].file = "C:/private/source.txt";
  await assert.rejects(prepareHistoricalRestockImport({}, absolute), error => error.code === "INVALID_HISTORY_PROVENANCE");
  const before = { enormousExistingValue: "x".repeat(8 * 1024 * 1024) }, savedBytes = JSON.stringify(before);
  await assert.rejects(prepareHistoricalRestockImport(before, input));
  assert.equal(JSON.stringify(before), savedBytes);
});

test("preparation never calls fetch or changes global browser storage", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error("Network access is forbidden in this unit test"); };
  try { await prepareHistoricalRestockImport(existingScout(), archive([await report()])); assert.equal(fetched, false); }
  finally { globalThis.fetch = originalFetch; }
});

// The actual owner-supplied archive stays outside Git and is only read when the
// operator explicitly requests it. Default CI uses synthetic data above.
const archiveFlag = process.argv.indexOf("--archive");
if (archiveFlag >= 0) {
  const archivePath = process.argv[archiveFlag + 1];
  if (!archivePath) throw new Error("--archive requires a local file path.");
  test("optional supplied archive preserves all 1057 observations and four incomplete claims through retry and readback", async () => {
    const input = JSON.parse(fs.readFileSync(archivePath, "utf8"));
    const scout = existingScout(), first = await prepareHistoricalRestockImport(scout, input);
    assert.equal(first.added, 1057); assert.equal(first.summary.distinctStoreLocations, 92); assert.equal(first.addedClaims, 4);
    assert.deepEqual(first.summary.reportedStatuses, { "No stock found": 571, "Partly out of stock": 24, "Restock reported": 348, "Stock update": 79, "Out of stock": 35 });
    const decoded = readHistoricalRestockHistory(first.nextScout);
    assert.deepEqual(decoded.observations.map(row => [row.id, row.originalNote, row.observedAt, row.reportedQuantityText, row.reportedQueueText]),
      input.observations.map(row => [row.id, row.originalNote, row.observedAt, row.reportedQuantityText, row.reportedQueueText]));
    assert.equal(decoded.summary.historySnapshots, 405); assert.equal(decoded.summary.linkedHistorySnapshots, 398);
    assert.equal(decoded.snapshotOnlyClaims.length, 4); assert.equal(decoded.summary.photoCaptions, 149);
    const second = await prepareHistoricalRestockImport(first.nextScout, input);
    assert.equal(second.added, 0); assert.equal(second.existing, 1057); assert.equal(second.changed, false);
    assert.deepEqual(first.nextScout.reports, scout.reports);
  });
}
