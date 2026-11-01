// Improvement #80: schema/version compatibility and dry-run summary before a
// backup is accepted. Domain checks run on the real restore preview and plan;
// the component is rendered with react-dom/server through esbuild, like the
// other app-improvement presentation tests. Synthetic storage only; zero writes.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BACKUP_SOURCE_REGISTRY,
  CODE3_BACKUP_FORMAT_VERSION,
  COMPATIBILITY_STATUS,
  FORMAT_COMPATIBILITY,
  SOURCE_COMPATIBILITY,
  APPLICATION_VERSION_RELATION,
  compareApplicationVersions,
  countSourceRecords,
  createVerifiedBackup,
  describeCompatibilityFailure,
  describeVersionList,
  getBackupSource,
  previewBackupRestore,
  sealBackupEnvelope,
  summarizeBackupCompatibility,
  summarizeRestoreDryRun,
} from "../src/features/backup/index.js";
import { createBackupReviewReport } from "../src/features/backup/reviewPresentation.js";
import { planWorkspaceRestore } from "../src/features/backup/workspaceRestorePlan.js";
import { WORKSPACE_LOCAL_SOURCES } from "../src/features/backup/workspaceRecovery.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
    this.writes = 0;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.writes += 1; this.values.delete(key); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}

const NOW = "2026-10-30T15:00:00.000Z";
const dealSource = getBackupSource("deal-finder", BACKUP_SOURCE_REGISTRY);
const dealState = (deals) => ({
  schemaVersion: 2,
  deals, appraisals: [], auctions: [], searchRules: [], purchases: [], lots: [], inventory: [], sales: [], expenses: [], mileage: [], activity: [], providerListings: [],
});
const deal = (id, askingPrice) => ({ id, providerId: "ebay", externalListingId: `listing-${id}`, askingPrice, currency: "USD" });

const sourceStorage = new MemoryStorage({ [dealSource.storageKey]: dealState([deal("deal-1", 10), deal("deal-2", 20), deal("deal-3", 30)]) });
const backup = await createVerifiedBackup({ localStorage: sourceStorage, sessionStorage: new MemoryStorage(), createdAt: NOW, applicationVersion: "2.4.0", sourceCommit: "test", configuredSourceIds: ["supabase-owner-data"] });
assert.equal(backup.verified, true);

async function mutateAndSeal(mutator) {
  const envelope = JSON.parse(backup.json);
  mutator(envelope);
  for (const section of envelope.sections) {
    const source = getBackupSource(section.sourceId, BACKUP_SOURCE_REGISTRY);
    if (source) section.recordCount = countSourceRecords(section.data, source);
  }
  return JSON.stringify(await sealBackupEnvelope(envelope));
}

test("application versions compare numerically and unknown strings never claim an order", () => {
  assert.equal(compareApplicationVersions("2.4.0", "2.4.0"), APPLICATION_VERSION_RELATION.SAME);
  assert.equal(compareApplicationVersions("2.10.0", "2.4.0"), APPLICATION_VERSION_RELATION.BACKUP_NEWER);
  assert.equal(compareApplicationVersions("v1.9", "2.0.1"), APPLICATION_VERSION_RELATION.BACKUP_OLDER);
  assert.equal(compareApplicationVersions("2.4.0-beta.1", "2.4.0"), APPLICATION_VERSION_RELATION.SAME);
  assert.equal(compareApplicationVersions("unknown", "2.4.0"), APPLICATION_VERSION_RELATION.UNKNOWN);
  assert.equal(compareApplicationVersions("2.4.0", "not supplied to browser build"), APPLICATION_VERSION_RELATION.UNKNOWN);
  assert.equal(describeVersionList([1, 2, 3, 4]), "1–4");
  assert.equal(describeVersionList([1, 3]), "1, 3");
  assert.equal(describeVersionList([]), "none");
});

test("a current backup reports every source as readable with its supported versions", async () => {
  const preview = await previewBackupRestore(backup.json, { currentApplicationVersion: "2.4.0" });
  assert.ok(["READY_FOR_FUTURE_RESTORE", "READY_WITH_WARNINGS"].includes(preview.result), preview.result);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.compatibility.status, COMPATIBILITY_STATUS.COMPATIBLE);
  assert.equal(preview.compatibility.format.status, FORMAT_COMPATIBILITY.COMPATIBLE);
  assert.equal(preview.compatibility.format.formatVersion, CODE3_BACKUP_FORMAT_VERSION);
  assert.equal(preview.compatibility.application.relation, APPLICATION_VERSION_RELATION.SAME);
  const row = preview.compatibility.sources.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(row.status, SOURCE_COMPATIBILITY.COMPATIBLE);
  assert.equal(row.schemaVersion, 2);
  assert.deepEqual(row.supportedSchemaVersions, dealSource.supportedSchemaVersions);
  assert.equal(row.currentSchemaVersion, dealSource.schemaVersion);
  assert.equal(row.restorable, true);
  assert.ok(preview.compatibility.sources.length >= 2, "every exported section is listed");
  assert.equal(preview.writesPerformed, 0);
});

test("a newer source schema names the source, both versions, and the update action", async () => {
  const raw = await mutateAndSeal((envelope) => { envelope.sections.find((section) => section.sourceId === "deal-finder").schemaVersion = 99; });
  const preview = await previewBackupRestore(raw);
  assert.equal(preview.result, "UNSUPPORTED");
  assert.equal(preview.compatibility.status, COMPATIBILITY_STATUS.UNSUPPORTED);
  const row = preview.compatibility.sources.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(row.status, SOURCE_COMPATIBILITY.NEWER_THAN_SUPPORTED);
  assert.equal(row.restorable, false);
  assert.match(row.message, /Deal Finder records was saved with version 99/);
  assert.match(row.message, new RegExp(`reads versions ${describeVersionList(dealSource.supportedSchemaVersions)}`));
  assert.match(row.message, /Update the app/);
  assert.match(describeCompatibilityFailure(preview.compatibility), /Deal Finder records was saved with version 99/);
  assert.equal(preview.sourceSummaries.some((entry) => entry.sourceId === "deal-finder"), false, "unsupported sections are not dry-run counted");
});

test("an older unsupported schema is explained differently from a newer one", () => {
  const registry = [{ ...dealSource, supportedSchemaVersions: [5, 6], schemaVersion: 6 }];
  const summary = summarizeBackupCompatibility(JSON.parse(backup.json), { sourceRegistry: registry });
  const row = summary.sources.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(row.status, SOURCE_COMPATIBILITY.OLDER_UNSUPPORTED);
  assert.match(row.message, /no longer reads/);
  assert.match(row.message, /supported: 5–6/);
  assert.equal(summary.status, COMPATIBILITY_STATUS.UNSUPPORTED);
});

test("format problems are explained before any source check", async () => {
  const newer = JSON.parse(backup.json); newer.formatVersion = CODE3_BACKUP_FORMAT_VERSION + 1;
  const newerPreview = await previewBackupRestore(JSON.stringify(newer));
  assert.equal(newerPreview.result, "UNSUPPORTED");
  assert.equal(newerPreview.compatibility.format.status, FORMAT_COMPATIBILITY.NEWER_THAN_SUPPORTED);
  assert.match(describeCompatibilityFailure(newerPreview.compatibility), new RegExp(`format version ${CODE3_BACKUP_FORMAT_VERSION + 1}; this app reads version ${CODE3_BACKUP_FORMAT_VERSION}`));
  const foreign = JSON.parse(backup.json); foreign.format = "someone-elses-backup";
  const foreignPreview = await previewBackupRestore(JSON.stringify(foreign));
  assert.equal(foreignPreview.compatibility.status, COMPATIBILITY_STATUS.UNRECOGNIZED);
  assert.match(describeCompatibilityFailure(foreignPreview.compatibility), /not a Code 3 backup/);
  assert.equal((await previewBackupRestore("{not json")).compatibility, null, "unparseable files carry no compatibility review");
});

test("unknown sources and a newer saving app are notes, not blockers", async () => {
  const raw = await mutateAndSeal((envelope) => {
    envelope.applicationVersion = "3.0.0"; envelope.manifest.applicationVersion = "3.0.0";
    envelope.sections.push({ sourceId: "future-source", schemaVersion: 1, recordCount: 1, data: [{ id: "future-1" }], warnings: [], sha256: "" });
  });
  const preview = await previewBackupRestore(raw, { currentApplicationVersion: "2.4.0" });
  assert.equal(preview.result, "READY_WITH_WARNINGS");
  assert.equal(preview.compatibility.status, COMPATIBILITY_STATUS.COMPATIBLE_WITH_NOTES);
  assert.equal(preview.compatibility.application.relation, APPLICATION_VERSION_RELATION.BACKUP_NEWER);
  assert.equal(preview.compatibility.sources.find((entry) => entry.sourceId === "future-source").status, SOURCE_COMPATIBILITY.UNKNOWN_SOURCE);
  assert.match(preview.compatibility.messages.join(" "), /newer app version \(3\.0\.0\)/);
  assert.match(preview.compatibility.messages.join(" "), /future-source is not a source this app knows/);
});

test("dry run counts new, already saved and differing records per source without writing", async () => {
  const current = dealState([deal("deal-1", 10), deal("deal-2", 25)]);
  const preview = await previewBackupRestore(backup.json, { currentSources: { "deal-finder": current } });
  const row = preview.sourceSummaries.find((entry) => entry.sourceId === "deal-finder");
  assert.deepEqual({ ...row }, { sourceId: "deal-finder", displayName: dealSource.displayName, backupRecords: 3, currentRecords: 2, newRecords: 1, matchingRecords: 1, existingVersionsKept: 1, recordsAfter: 3 });
  assert.equal(preview.dryRun.totals.newRecords >= 1, true);
  assert.equal(preview.newRecords, preview.dryRun.totals.newRecords, "aggregate counts agree with the per-source summary");
  assert.equal(preview.potentialUpdates, preview.dryRun.totals.existingVersionsKept);
  assert.equal(preview.matchingRecords, preview.dryRun.totals.matchingRecords);
  const direct = summarizeRestoreDryRun(JSON.parse(backup.json).sections, { currentSources: {}, restorableSourceIds: ["deal-finder"] });
  assert.equal(direct.sources.length, 1);
  assert.equal(direct.sources[0].newRecords, 3);
  assert.equal(direct.sources[0].currentRecords, 0);
});

test("the recovery plan carries the review and a blocked plan still explains the version problem", async () => {
  const storage = new MemoryStorage({ [dealSource.storageKey]: dealState([deal("deal-1", 10), deal("deal-2", 25)]) });
  const before = storage.snapshot();
  const planned = await planWorkspaceRestore(backup.json, { storage, currentApplicationVersion: "2.4.0" });
  // Session-only sources are exported but not recovered here, so the review is compatible with notes.
  assert.equal(planned.review.compatibility.status, COMPATIBILITY_STATUS.COMPATIBLE_WITH_NOTES);
  assert.ok(planned.review.compatibility.sources.some((entry) => entry.status === SOURCE_COMPATIBILITY.COMPATIBLE && entry.restorable === false));
  assert.match(planned.review.compatibility.messages.join(" "), /not restored by this recovery/);
  const row = planned.review.dryRun.sources.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(row.newRecords, 1);
  assert.equal(row.existingVersionsKept, 1);
  assert.equal(planned.plan.addedRecords, planned.review.dryRun.totals.newRecords, "plan total matches the dry-run total");
  assert.equal(planned.plan.preservedConflicts, planned.review.dryRun.totals.existingVersionsKept);
  assert.equal(Object.hasOwn(planned.plan, "review"), false, "review is not part of the hashed plan");
  const restorableIds = WORKSPACE_LOCAL_SOURCES.map((source) => source.sourceId);
  for (const entry of planned.review.compatibility.sources) assert.equal(entry.restorable, restorableIds.includes(entry.sourceId) && entry.status === SOURCE_COMPATIBILITY.COMPATIBLE);

  const unsupported = await mutateAndSeal((envelope) => { envelope.sections.find((section) => section.sourceId === "deal-finder").schemaVersion = 99; });
  await assert.rejects(planWorkspaceRestore(unsupported, { storage }), (error) => {
    assert.equal(error.code, "BACKUP_NOT_READY");
    assert.match(error.message, /Deal Finder records was saved with version 99/);
    assert.equal(error.review.compatibility.status, COMPATIBILITY_STATUS.UNSUPPORTED);
    assert.equal(error.review.dryRun, null);
    return true;
  });
  assert.equal(storage.snapshot(), before, "planning and blocked planning never write");
  assert.equal(storage.writes, 0);
});

test("the downloadable review report records versions and dry-run counts without record contents", async () => {
  const preview = await previewBackupRestore(backup.json, { currentSources: { "deal-finder": dealState([deal("deal-1", 10)]) }, currentApplicationVersion: "2.4.0" });
  const report = createBackupReviewReport({ kind: "restore-preview", result: preview, reviewedAt: NOW });
  assert.equal(report.compatibility.status, COMPATIBILITY_STATUS.COMPATIBLE);
  assert.equal(report.compatibility.application.backupVersion, "2.4.0");
  const row = report.compatibility.sources.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(row.schemaVersion, 2);
  assert.equal(Object.hasOwn(row, "message"), false);
  const dry = report.dryRun.sources.find((entry) => entry.sourceId === "deal-finder");
  assert.equal(dry.newRecords, 2);
  assert.equal(report.dryRun.totals.displayName, "All sources");
  assert.doesNotMatch(JSON.stringify(report), /listing-deal-1/, "report never includes record data");
});

const directory = resolve("artifacts/qa/restore-compatibility-100");
await mkdir(directory, { recursive: true });
const output = resolve(directory, "restore-review-summary-test.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `export {default as RestoreReviewSummary} from './src/features/backup/RestoreReviewSummary.jsx';` }, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, outfile: output });
// The recovery gate mounts before the app; keep its review component free of
// receipt, Supabase and native-runtime imports.
assert.doesNotMatch(await readFile(output, "utf8"), /@supabase\/supabase-js|@capacitor\/core|PrivateReceipt/);
const { RestoreReviewSummary } = await import(pathToFileURL(output).href);
const render = (props) => renderToStaticMarkup(React.createElement(RestoreReviewSummary, props));

test("the review component names versions, flags the blocking source and tables the dry run", async () => {
  const preview = await previewBackupRestore(backup.json, { currentSources: { "deal-finder": dealState([deal("deal-1", 10), deal("deal-2", 25)]) }, currentApplicationVersion: "2.4.0" });
  const html = render({ compatibility: preview.compatibility, dryRun: preview.dryRun });
  assert.match(html, /Compatibility check/);
  assert.match(html, /Compatible</);
  assert.match(html, new RegExp(`Version ${CODE3_BACKUP_FORMAT_VERSION} \\(supported\\)`));
  assert.match(html, /Saved by app version<\/dt><dd>2\.4\.0/);
  assert.match(html, new RegExp(`Backup schema 2 · this app reads ${describeVersionList(dealSource.supportedSchemaVersions)} \\(current ${dealSource.schemaVersion}\\)`));
  assert.match(html, /scope="col">Would be added/);
  assert.match(html, /data-label="Would be added"><strong>1</);
  assert.match(html, /data-label="Existing version kept">1</);
  assert.match(html, /All sources/);
  assert.match(html, /1 record\(s\) in the backup differ from a saved record with the same ID/);
  assert.match(html, /Nothing has been changed/);

  const unsupported = await previewBackupRestore(await mutateAndSeal((envelope) => { envelope.sections.find((section) => section.sourceId === "deal-finder").schemaVersion = 99; }));
  const blocked = render({ compatibility: unsupported.compatibility, dryRun: null });
  assert.match(blocked, /Unsupported</);
  assert.match(blocked, /Newer than this app/);
  assert.match(blocked, /data-status="NEWER_THAN_SUPPORTED"/);
  assert.match(blocked, /Update the app before restoring this backup/);
  assert.doesNotMatch(blocked, /What a restore would do/);
  assert.equal(render({ compatibility: null }), "");
});
