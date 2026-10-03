import assert from "node:assert/strict";
import {
  CANONICAL_DOMAINS,
  createLocalCollectionDataSource,
  createPersistenceGateway,
  createRemoteBackupExportAdapter,
  createRemoteHttpDataSource,
  createUnavailableRemoteBackupAdapter,
  PERSISTENCE_MODES,
  remoteCoverageState,
  REMOTE_BACKUP_STATES,
  resolvePersistenceMode,
  validateRemoteBackupExport,
} from "../src/features/persistence/index.js";
import { createVerifiedBackup, hashCanonicalJson } from "../src/features/backup/index.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
    this.writes = 0;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}

class StateRepository {
  constructor(state = { records: [] }) { this.state = structuredClone(state); this.writes = 0; }
  load() { return structuredClone(this.state); }
  save(nextState) { this.writes += 1; this.state = structuredClone(nextState); return { state: this.load(), error: "" }; }
}

assert.equal(resolvePersistenceMode(), PERSISTENCE_MODES.LOCAL_ONLY, "local persistence must remain the default");
assert.throws(
  () => resolvePersistenceMode(PERSISTENCE_MODES.REMOTE_ACTIVE),
  (error) => error.code === "REMOTE_ACTIVATION_REQUIRED",
  "remote persistence must never activate implicitly",
);
assert.equal(resolvePersistenceMode(PERSISTENCE_MODES.REMOTE_ACTIVE, {
  explicitRemoteActivation: true,
  remoteActivationReason: "OWNER_CONFIRMED_CUTOVER",
}), PERSISTENCE_MODES.REMOTE_ACTIVE);

const repository = new StateRepository({
  records: [
    { id: "record-b", recordVersion: 1, title: "B", status: "ACTIVE", createdAt: "2026-08-20T09:00:00.000Z" },
    { id: "record-a", recordVersion: 1, title: "A", status: "ACTIVE", createdAt: "2026-08-20T09:00:00.000Z" },
    { id: "record-archived", recordVersion: 1, title: "Archived", status: "ARCHIVED", archivedAt: "2026-08-20T09:10:00.000Z", createdAt: "2026-08-20T09:10:00.000Z" },
  ],
});
let timeIndex = 0;
const times = ["2026-08-20T10:00:00.000Z", "2026-08-20T10:01:00.000Z", "2026-08-20T10:02:00.000Z"];
const local = createLocalCollectionDataSource({
  repository,
  collection: "records",
  now: () => times[timeIndex++] || times.at(-1),
  idFactory: () => "record-c",
});
const pageOne = await local.list({ limit: 1 });
assert.deepEqual(pageOne.records.map((record) => record.id), ["record-a"]);
assert.match(pageOne.nextCursor, /^local:/);
const pageTwo = await local.list({ limit: 1, cursor: pageOne.nextCursor });
assert.deepEqual(pageTwo.records.map((record) => record.id), ["record-b"]);
assert.equal(pageTwo.nextCursor, null);
assert.deepEqual((await local.list({ status: "ARCHIVED" })).records, [], "archived records are excluded by default");
assert.deepEqual((await local.list({ status: "ARCHIVED", includeArchived: true })).records.map((record) => record.id), ["record-archived"]);

const firstStablePage = await local.list({ limit: 1 });
repository.state.records.push({ id: "record-aa", recordVersion: 1, title: "Inserted later", status: "ACTIVE", createdAt: "2026-08-20T09:00:00.000Z" });
assert.deepEqual(
  (await local.list({ limit: 5, cursor: firstStablePage.nextCursor })).records.map((record) => record.id),
  ["record-aa", "record-b"],
  "keyset pagination should remain stable when a record is inserted after the prior cursor",
);

const created = await local.create({ title: "C" });
assert.equal(created.id, "record-c");
assert.equal(created.recordVersion, 1);
await assert.rejects(
  () => local.create({ id: "owner-forged", ownerSubject: "supabase:not-authority" }),
  (error) => error.code === "CLIENT_OWNER_FIELD_REJECTED",
);
await assert.rejects(
  () => local.update("record-c", { title: "Changed" }, 0),
  (error) => error.code === "VERSION_CONFLICT" && error.status === 409 && error.details.currentVersion === 1,
);
const updated = await local.update("record-c", { title: "Changed" }, 1);
assert.equal(updated.recordVersion, 2);
const archived = await local.archive("record-c", 2);
assert.equal(archived.recordVersion, 3);
assert.ok(archived.archivedAt);
assert.equal(archived.status, "ARCHIVED");

const previewGateway = createPersistenceGateway({ mode: PERSISTENCE_MODES.MIGRATION_PREVIEW, localDataSource: local });
const writesBeforePreview = repository.writes;
assert.throws(() => previewGateway.create({ title: "No write" }), (error) => error.code === "MIGRATION_PREVIEW_IS_READ_ONLY");
assert.throws(() => previewGateway.update("record-c", { title: "No write" }, 3), (error) => error.code === "MIGRATION_PREVIEW_IS_READ_ONLY");
assert.throws(() => previewGateway.archive("record-c", 3), (error) => error.code === "MIGRATION_PREVIEW_IS_READ_ONLY");
assert.equal(repository.writes, writesBeforePreview, "migration mode must not call local mutation methods");

const requests = [];
const remoteDataSource = createRemoteHttpDataSource({
  route: "/api/code3/deals",
  request: async (path, init) => {
    requests.push({ path, init });
    if (init.method === "GET") return { ok: true, records: [{ id: "remote-1" }], nextCursor: "cursor-2" };
    return { ok: true, record: { id: "record-1", recordVersion: 8 } };
  },
});
assert.deepEqual(await remoteDataSource.list({ limit: 1 }), { records: [{ id: "remote-1" }], nextCursor: "cursor-2" });
await remoteDataSource.archive("record-1", 7);
assert.equal(requests.at(-1).path, "/api/code3/deals/record-1/archive");
assert.equal(requests.at(-1).init.method, "POST");
assert.equal(requests.at(-1).init.body, JSON.stringify({ expectedVersion: 7 }));
assert.equal(requests.at(-1).init.headers["Content-Type"], "application/json");
assert.ok(!requests.some((request) => request.init.method === "DELETE"), "client archive contract must never send DELETE");
await assert.rejects(
  () => remoteDataSource.create({ owner_subject: "client-forged" }),
  (error) => error.code === "CLIENT_OWNER_FIELD_REJECTED",
);
const conflictDataSource = createRemoteHttpDataSource({
  route: "/api/code3/deals",
  request: async () => ({
    ok: false,
    status: 409,
    error: {
      code: "record_version_conflict",
      message: "The record changed after it was loaded.",
      conflict: { recordId: "record-1", currentVersion: 9, updatedAt: "2026-08-20T10:03:00.000Z", conflictType: "STALE_RECORD_VERSION" },
    },
  }),
});
await assert.rejects(
  () => conflictDataSource.update("record-1", { status: "ACTIVE" }, 8),
  (error) => error.code === "VERSION_CONFLICT" && error.status === 409 && error.details.currentVersion === 9 && error.details.remoteCode === "record_version_conflict",
);

const validServerExport = {
  format: "code-3-server-export",
  formatVersion: 1,
  createdAt: "2026-08-20T11:00:00.000Z",
  coverageStatus: "COMPLETE",
  coverageExplanation: "All canonical domains fit within the bounded export.",
  recordCount: 1,
  sourceHash: "a".repeat(64),
  truncatedDomains: [],
  domains: {
    ...Object.fromEntries(Object.values(CANONICAL_DOMAINS).map((domain) => [domain, []])),
    DEAL: [{ id: "11111111-1111-4111-8111-111111111111", domain: "DEAL", recordVersion: 1 }],
  },
};
validServerExport.sourceHash = await hashCanonicalJson(validServerExport.domains);
assert.equal(validateRemoteBackupExport(validServerExport).valid, true);
const incompleteCompleteExport = { ...validServerExport, domains: { DEAL: validServerExport.domains.DEAL } };
assert.equal(validateRemoteBackupExport(incompleteCompleteExport).valid, false, "COMPLETE export must enumerate every canonical domain");
const ownerWideDuplicateExport = structuredClone(validServerExport);
ownerWideDuplicateExport.domains.PURCHASE.push({
  id: validServerExport.domains.DEAL[0].id,
  domain: "PURCHASE",
  recordVersion: 1,
});
ownerWideDuplicateExport.recordCount = 2;
assert.equal(validateRemoteBackupExport(ownerWideDuplicateExport).valid, false, "canonical IDs must be unique owner-wide, including across domains");

const fileAssetExport = structuredClone(validServerExport);
fileAssetExport.domains.DEAL = [];
fileAssetExport.domains.FILE_ASSET = [{
  id: "55555555-5555-4555-8555-555555555555",
  domain: "FILE_ASSET",
  recordVersion: 1,
  fileAsset: {
    storageProvider: "supabase-storage",
    storagePath: "owners/redacted/receipts/asset.pdf",
    mimeType: "application/pdf",
    size: 321,
    sha256: "b".repeat(64),
    relatedRecordType: "RECEIPT_METADATA",
    relatedRecordId: "66666666-6666-4666-8666-666666666666",
  },
}];
assert.equal(validateRemoteBackupExport(fileAssetExport).valid, true);
const invalidFileAssetExport = structuredClone(fileAssetExport);
invalidFileAssetExport.domains.FILE_ASSET[0].fileAsset.storagePath = "../outside";
assert.equal(validateRemoteBackupExport(invalidFileAssetExport).valid, false, "remote FileAsset records must satisfy the canonical nested wire contract");

const completeRemoteAdapter = createRemoteBackupExportAdapter({
  request: async () => ({ ok: true, status: 200, json: async () => validServerExport }),
});
const completeRemote = await completeRemoteAdapter.inspect();
assert.equal(completeRemote.status, REMOTE_BACKUP_STATES.AVAILABLE);
assert.equal(completeRemote.coverageStatus, "COMPLETE");
assert.equal(remoteCoverageState(completeRemote).coverageStatus, "COMPLETE");
const tamperedExport = structuredClone(validServerExport);
tamperedExport.domains.DEAL[0].recordVersion = 2;
const tamperedRemote = await createRemoteBackupExportAdapter({
  request: async () => ({ ok: true, status: 200, json: async () => tamperedExport }),
}).inspect();
assert.equal(tamperedRemote.status, REMOTE_BACKUP_STATES.ERROR);
assert.equal(tamperedRemote.included, false);
assert.match(tamperedRemote.reason, /integrity/i);
const incompleteCompleteRemote = await createRemoteBackupExportAdapter({
  request: async () => ({ ok: true, status: 200, json: async () => incompleteCompleteExport }),
}).inspect();
assert.equal(incompleteCompleteRemote.status, REMOTE_BACKUP_STATES.ERROR);
assert.equal(remoteCoverageState(incompleteCompleteRemote).coverageStatus, "PARTIAL");

const partialServerExport = {
  ...validServerExport,
  coverageStatus: "PARTIAL",
  coverageExplanation: "Deal reached the per-domain export limit.",
  truncatedDomains: ["DEAL"],
};
const partialRemote = await createRemoteBackupExportAdapter({
  request: async () => ({ ok: true, status: 200, json: async () => partialServerExport }),
}).inspect();
assert.equal(partialRemote.status, REMOTE_BACKUP_STATES.AVAILABLE);
assert.equal(remoteCoverageState(partialRemote).coverageStatus, "PARTIAL", "truncated server exports must never be promoted to COMPLETE");
assert.match(remoteCoverageState(partialRemote).warning, /per-domain export limit/i);

const falseComplete = { ...validServerExport, truncatedDomains: ["DEAL"] };
assert.equal(validateRemoteBackupExport(falseComplete).valid, false, "COMPLETE plus truncation is invalid");
const unsafeRemote = structuredClone(validServerExport);
unsafeRemote.domains.DEAL[0].accessToken = "prohibited";
assert.equal(validateRemoteBackupExport(unsafeRemote).valid, false);

const unauthorized = await createRemoteBackupExportAdapter({
  request: async () => ({ ok: false, status: 401 }),
}).inspect();
assert.equal(unauthorized.status, REMOTE_BACKUP_STATES.UNAUTHORIZED);
assert.equal(unauthorized.included, false);
assert.equal(remoteCoverageState(unauthorized).coverageStatus, "PARTIAL");
assert.equal((await createUnavailableRemoteBackupAdapter().inspect()).status, REMOTE_BACKUP_STATES.UNAVAILABLE);

const malformedRemote = await createRemoteBackupExportAdapter({
  request: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } }),
}).inspect();
assert.equal(malformedRemote.status, REMOTE_BACKUP_STATES.ERROR);
assert.equal(malformedRemote.included, false);
assert.equal(remoteCoverageState(malformedRemote).coverageStatus, "PARTIAL");

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
const backupWithRemote = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: "2026-08-20T11:05:00.000Z",
  remoteExportResult: completeRemote,
});
assert.equal(backupWithRemote.coverageStatus, "COMPLETE");
assert.equal(backupWithRemote.backup.coverageSummary.serverDataIncluded, true);
assert.equal(backupWithRemote.backup.sections.find((section) => section.sourceId === "postgres-owner-data").recordCount, 1);
assert.equal(backupWithRemote.verified, true);

const backupWithPartialRemote = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: "2026-08-20T11:06:00.000Z",
  remoteExportResult: partialRemote,
});
assert.equal(backupWithPartialRemote.coverageStatus, "PARTIAL");
assert.equal(backupWithPartialRemote.backup.coverageSummary.serverDataIncluded, true);

const backupWithoutAuthorizedRemote = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: "2026-08-20T11:07:00.000Z",
  remoteExportResult: unauthorized,
});
assert.equal(backupWithoutAuthorizedRemote.coverageStatus, "PARTIAL");
assert.equal(backupWithoutAuthorizedRemote.backup.coverageSummary.serverDataIncluded, false);

const backupWithMalformedRemote = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: "2026-08-20T11:08:00.000Z",
  remoteExportResult: malformedRemote,
});
assert.equal(backupWithMalformedRemote.verified, true, "a malformed server response must not prevent a valid local partial backup");
assert.equal(backupWithMalformedRemote.coverageStatus, "PARTIAL");
assert.equal(backupWithMalformedRemote.backup.coverageSummary.serverDataIncluded, false);
assert.equal(localStorage.writes, 0);
assert.equal(sessionStorage.writes, 0);

console.log("Code 3 client persistence tests passed (local default, explicit remote gate, archive contract, concurrency, and remote backup coverage).");
