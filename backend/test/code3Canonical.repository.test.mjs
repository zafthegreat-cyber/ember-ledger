import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { MemoryCanonicalRepository } = require("../dist/code3/memoryRepository.js");
const { CanonicalService } = require("../dist/code3/service.js");
const { CanonicalNotFoundError, CanonicalVersionConflictError } = require("../dist/code3/repository.js");
const { validateBasisPoints, validateCreateInput } = require("../dist/code3/validation.js");
const { validateCanonicalDryRun } = require("../dist/code3/dryRun.js");
const { exportCanonicalOwnerRecords } = require("../dist/code3/serverExport.js");

const IDS = {
  deal1: "00000000-0000-4000-8000-000000000001",
  deal2: "00000000-0000-4000-8000-000000000002",
  deal3: "00000000-0000-4000-8000-000000000003",
  purchase: "00000000-0000-4000-8000-000000000010",
  lot: "00000000-0000-4000-8000-000000000011",
  file: "00000000-0000-4000-8000-000000000012",
};

function owner(subject) {
  return Object.freeze({
    ownerSubject: `supabase:${subject}`,
    principal: Object.freeze({ provider: "supabase", subject, issuedAt: 1, expiresAt: 9_999_999_999 }),
  });
}

function repository() {
  let tick = 0;
  return new MemoryCanonicalRepository({
    now: () => new Date(Date.UTC(2026, 7, 20, 12, 0, tick++)),
  });
}

test("owner-scoped repositories prevent cross-owner reads and updates", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  const ownerB = owner("owner-b");
  const created = await service.create(ownerA, "DEAL", { id: IDS.deal1, status: "NEW", source: "manual" });
  assert.equal((await service.getById(ownerA, "DEAL", created.id)).id, created.id);
  assert.equal(await repo.getById(ownerB, "DEAL", created.id), null);
  await assert.rejects(
    () => service.update(ownerB, "DEAL", created.id, { status: "WATCH", expectedVersion: 1 }),
    CanonicalNotFoundError,
  );
  assert.equal((await service.getById(ownerA, "DEAL", created.id)).status, "NEW");
});

test("client-supplied owner scope is rejected rather than trusted", () => {
  assert.throws(
    () => validateCreateInput("DEAL", { id: IDS.deal1, ownerSubject: "supabase:attacker" }),
    (error) => error.issues.some((entry) => entry.code === "owner_scope_forbidden"),
  );
  assert.throws(
    () => validateCreateInput("DEAL", { id: IDS.deal1, owner_subject: "supabase:attacker" }),
    (error) => error.issues.some((entry) => entry.code === "owner_scope_forbidden"),
  );
});

test("stable IDs are unique across domains within an owner and remain owner-scoped", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  const ownerB = owner("owner-b");
  await service.create(ownerA, "DEAL", { id: IDS.deal1 });
  await assert.rejects(
    () => service.create(ownerA, "PURCHASE", { id: IDS.deal1 }),
    (error) => error.duplicateType === "ID",
  );
  await service.create(ownerB, "PURCHASE", { id: IDS.deal1 });
  assert.equal((await service.getById(ownerA, "DEAL", IDS.deal1)).domain, "DEAL");
  assert.equal((await service.getById(ownerB, "PURCHASE", IDS.deal1)).domain, "PURCHASE");

  const preview = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "e".repeat(64),
    actions: [{ action: "INSERT", domain: "PURCHASE", input: { id: IDS.deal1 } }],
  });
  assert.equal(preview.status, "BLOCKED");
  assert.equal(preview.results[0].issues[0].code, "duplicate_id");
});

for (const [name, input, code] of [
  ["bad UUID", { id: "not-a-uuid" }, "invalid_uuid"],
  ["invalid status", { status: "BUY_NOW" }, "invalid_status"],
  ["invalid URL", { sourceUrl: "file:///secret" }, "invalid_url"],
  ["invalid amountMinor", { amountMinor: 12.34 }, "invalid_integer"],
  ["invalid currency", { amountMinor: 1234, currency: "US" }, "invalid_currency"],
  ["invalid percentage", { rateBasisPoints: 1250.5 }, "invalid_basis_points"],
  ["negative quantity", { quantity: -1 }, "invalid_integer"],
  ["excess notes", { notes: "x".repeat(32_001) }, "too_long"],
  ["unknown field", { arbitrary: true }, "unknown_field"],
]) {
  test(`strict validation rejects ${name}`, () => {
    assert.throws(
      () => validateCreateInput("DEAL", input),
      (error) => error.issues.some((entry) => entry.code === code),
    );
  });
}

test("strict validation rejects prototype-pollution keys and non-finite metadata", () => {
  const polluted = JSON.parse('{"metadata":{"__proto__":{"polluted":true}}}');
  assert.throws(
    () => validateCreateInput("DEAL", polluted),
    (error) => error.issues.some((entry) => entry.code === "prohibited_key"),
  );
  assert.throws(
    () => validateCreateInput("DEAL", { metadata: { score: Number.POSITIVE_INFINITY } }),
    (error) => error.issues.some((entry) => entry.code === "non_finite_number"),
  );
  assert.throws(
    () => validateCreateInput("DEAL", { metadata: { accessToken: "must-not-persist" } }),
    (error) => error.issues.some((entry) => entry.code === "prohibited_security_field"),
  );
});

test("metadata wire bytes stay below the database jsonb-text size boundary", () => {
  const accepted = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`key${index}`, "x".repeat(2_400)]));
  assert.ok(Buffer.byteLength(JSON.stringify(accepted), "utf8") < 250_000);
  assert.equal(validateCreateInput("DEAL", { metadata: accepted }).metadata.key0.length, 2_400);

  const rejected = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`key${index}`, "x".repeat(2_600)]));
  assert.ok(Buffer.byteLength(JSON.stringify(rejected), "utf8") > 250_000);
  assert.throws(
    () => validateCreateInput("DEAL", { metadata: rejected }),
    (error) => error.issues.some((entry) => entry.code === "too_large"),
  );
});

test("basis-point rates are finite bounded integers", () => {
  assert.equal(validateBasisPoints(1_250), 1_250);
  for (const value of [12.5, Number.NaN, Number.POSITIVE_INFINITY, -1, 100_001, "1250"]) {
    assert.throws(() => validateBasisPoints(value), /basis points/);
  }
  assert.equal(validateCreateInput("DEAL", { rateBasisPoints: 1_250 }).rateBasisPoints, 1_250);
});

test("money values always retain an explicit matching currency", async () => {
  assert.throws(
    () => validateCreateInput("DEAL", { currency: "USD" }),
    (error) => error.issues.some((entry) => entry.code === "currency_without_amount"),
  );
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  const created = await service.create(ownerA, "DEAL", { id: IDS.deal1, amountMinor: 1_234 });
  assert.equal(created.currency, "USD");
  await assert.rejects(
    () => service.update(ownerA, "DEAL", created.id, { amountMinor: null, expectedVersion: 1 }),
    (error) => error.issues.some((entry) => entry.code === "incomplete_money"),
  );
});

test("required owner-scoped foreign references are validated", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  const ownerB = owner("owner-b");
  await assert.rejects(
    () => service.create(ownerA, "PURCHASE_LOT", { id: IDS.lot }),
    (error) => error.issues.some((entry) => entry.code === "required"),
  );
  await service.create(ownerB, "PURCHASE", { id: IDS.purchase });
  await assert.rejects(
    () => service.create(ownerA, "PURCHASE_LOT", { id: IDS.lot, relations: { purchaseId: IDS.purchase } }),
    (error) => error.issues.some((entry) => entry.code === "invalid_foreign_reference"),
  );
  await service.create(ownerA, "PURCHASE", { id: IDS.purchase });
  const lot = await service.create(ownerA, "PURCHASE_LOT", { id: IDS.lot, relations: { purchaseId: IDS.purchase } });
  assert.deepEqual(lot.relations, { purchaseId: IDS.purchase });
});

test("matching record versions update and stale versions return conflict metadata", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  const created = await service.create(ownerA, "DEAL", { id: IDS.deal1, status: "NEW" });
  const updated = await service.update(ownerA, "DEAL", created.id, { status: "WATCH", expectedVersion: 1 });
  assert.equal(updated.recordVersion, 2);
  assert.equal(updated.status, "WATCH");
  await assert.rejects(
    () => service.update(ownerA, "DEAL", created.id, { status: "PASSED", expectedVersion: 1 }),
    (error) => {
      assert.ok(error instanceof CanonicalVersionConflictError);
      assert.deepEqual(error.conflict, {
        recordId: IDS.deal1,
        currentVersion: 2,
        updatedAt: updated.updatedAt,
        conflictType: "STALE_RECORD_VERSION",
      });
      return true;
    },
  );
});

test("partial external-identity updates match PostgreSQL uniqueness behavior", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", { id: IDS.deal1, externalProvider: "ebay", externalId: "listing-1" });
  await service.create(ownerA, "DEAL", { id: IDS.deal2, externalProvider: "other", externalId: "listing-1" });
  await assert.rejects(
    () => service.update(ownerA, "DEAL", IDS.deal2, { expectedVersion: 1, externalProvider: "ebay" }),
    (error) => error.duplicateType === "EXTERNAL_IDENTITY",
  );
});

test("pagination uses a stable cursor, enforces the limit, and preserves owner scope", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  const ownerB = owner("owner-b");
  for (const id of [IDS.deal1, IDS.deal2, IDS.deal3]) await service.create(ownerA, "DEAL", { id });
  await service.create(ownerB, "DEAL", { id: IDS.deal1 });
  const first = await service.list(ownerA, "DEAL", { limit: "2" });
  assert.deepEqual(first.records.map((record) => record.id), [IDS.deal1, IDS.deal2]);
  assert.ok(first.nextCursor);
  const second = await service.list(ownerA, "DEAL", { limit: "2", cursor: first.nextCursor });
  assert.deepEqual(second.records.map((record) => record.id), [IDS.deal3]);
  assert.equal(second.nextCursor, null);
  assert.throws(() => service.list(ownerA, "DEAL", { limit: "101" }), /between 1 and 100/);
  const malformedCursor = Buffer.from(JSON.stringify({
    createdAt: "2026-08-20T12:00:00.000Z",
    id: "-".repeat(36),
  }), "utf8").toString("base64url");
  await assert.rejects(
    () => service.list(ownerA, "DEAL", { cursor: malformedCursor }),
    (error) => error.issues.some((entry) => entry.code === "invalid_cursor"),
  );
});

test("archived external identities and owned-item certifications may be reused consistently", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", { id: IDS.deal1, externalProvider: "ebay", externalId: "archived-listing" });
  await service.archive(ownerA, "DEAL", IDS.deal1, { expectedVersion: 1 });
  await service.create(ownerA, "DEAL", { id: IDS.deal2, externalProvider: "ebay", externalId: "archived-listing" });

  await service.create(ownerA, "OWNED_ITEM", { id: IDS.purchase, certificationNumber: "CERT-ARCHIVED" });
  await service.archive(ownerA, "OWNED_ITEM", IDS.purchase, { expectedVersion: 1 });
  await service.create(ownerA, "OWNED_ITEM", { id: IDS.lot, certificationNumber: "CERT-ARCHIVED" });

  await service.create(ownerA, "DEAL", { id: IDS.deal3, certificationNumber: "NON-ITEM-CERT" });
  await service.create(ownerA, "PURCHASE", { id: IDS.file, certificationNumber: "NON-ITEM-CERT" });
});

test("bounded server export omits owner scope and marks truncation as PARTIAL", async () => {
  const repo = repository();
  let snapshotReads = 0;
  const originalConsistentRead = repo.withConsistentRead.bind(repo);
  repo.withConsistentRead = async (operation) => {
    snapshotReads += 1;
    return originalConsistentRead(operation);
  };
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", { id: IDS.deal1 });
  await service.create(ownerA, "DEAL", { id: IDS.deal2 });
  const exported = await exportCanonicalOwnerRecords(repo, ownerA, { maxRecordsPerDomain: 1, now: () => new Date("2026-08-20T12:00:00.000Z") });
  assert.equal(exported.format, "code-3-server-export");
  assert.equal(exported.coverageStatus, "PARTIAL");
  assert.deepEqual(exported.truncatedDomains, ["DEAL"]);
  assert.equal(exported.domains.DEAL.length, 1);
  assert.equal(snapshotReads, 1, "server export must use one repository-consistent read snapshot");
  assert.match(exported.sourceHash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(exported), /owner-a|ownerSubject|owner_subject/);
});

test("migration dry run validates actions and performs zero repository writes", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", { id: IDS.deal1 });
  const before = repo.snapshot();
  const result = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "a".repeat(64),
    actions: [
      { action: "INSERT", domain: "DEAL", input: { id: IDS.deal2, status: "NEW" } },
      { action: "UPDATE", domain: "DEAL", recordId: IDS.deal1, input: { expectedVersion: 1, status: "WATCH" } },
      { action: "SKIP", domain: "DEAL", recordId: IDS.deal1 },
    ],
  });
  assert.equal(result.status, "READY");
  assert.equal(result.zeroWrites, true);
  assert.deepEqual(repo.snapshot(), before);
  await assert.rejects(
    () => validateCanonicalDryRun(repo, ownerA, {
      formatVersion: 1,
      sourceBackupHash: "a".repeat(64),
      actions: [{ action: "DELETE", domain: "DEAL", recordId: IDS.deal1 }],
    }),
    /never accept or propose DELETE/,
  );
});

test("dry run identifies a newer remote record without changing it", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", { id: IDS.deal1 });
  await service.update(ownerA, "DEAL", IDS.deal1, { expectedVersion: 1, status: "WATCH" });
  const before = repo.snapshot();
  const result = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "b".repeat(64),
    actions: [{ action: "UPDATE", domain: "DEAL", recordId: IDS.deal1, input: { expectedVersion: 1, status: "PASSED" } }],
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.results[0].outcome, "WOULD_CONFLICT");
  assert.equal(result.results[0].issues[0].code, "stale_record_version");
  assert.deepEqual(repo.snapshot(), before);
});

test("dry run rejects writes that the canonical service would reject without changing records", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "PURCHASE", { id: IDS.purchase, amountMinor: 1234, currency: "USD" });
  const before = repo.snapshot();

  const missingRelation = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "c".repeat(64),
    actions: [{
      action: "INSERT",
      domain: "PURCHASE_LOT",
      input: { id: IDS.lot, relations: { purchaseId: IDS.deal1 } },
    }],
  });
  assert.equal(missingRelation.status, "BLOCKED");
  assert.equal(missingRelation.results[0].outcome, "INVALID");
  assert.equal(missingRelation.results[0].issues[0].code, "invalid_foreign_reference");

  const incompleteMoney = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "d".repeat(64),
    actions: [{
      action: "UPDATE",
      domain: "PURCHASE",
      recordId: IDS.purchase,
      input: { expectedVersion: 1, amountMinor: null },
    }],
  });
  assert.equal(incompleteMoney.status, "BLOCKED");
  assert.equal(incompleteMoney.results[0].outcome, "INVALID");
  assert.equal(incompleteMoney.results[0].issues[0].code, "incomplete_money");
  assert.deepEqual(repo.snapshot(), before, "service-equivalent dry-run validation must perform zero writes");
});

test("dry run validates plan-local references without writing either record", async () => {
  const repo = repository();
  const ownerA = owner("owner-a");
  const before = repo.snapshot();
  const result = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "f".repeat(64),
    actions: [
      { action: "INSERT", domain: "PURCHASE_LOT", input: { id: IDS.lot, relations: { purchaseId: IDS.purchase } } },
      { action: "INSERT", domain: "PURCHASE", input: { id: IDS.purchase } },
    ],
  });
  assert.equal(result.status, "READY");
  assert.deepEqual(result.results.map((entry) => entry.outcome), ["VALIDATED", "VALIDATED"]);
  assert.deepEqual(repo.snapshot(), before);
});

test("dry run blocks missing persisted IDs and dependents of invalid planned inserts", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", {
    id: IDS.deal1,
    externalProvider: "ebay",
    externalId: "duplicate-listing",
  });
  const result = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "9".repeat(64),
    actions: [
      {
        action: "INSERT",
        domain: "DEAL",
        recordId: IDS.deal2,
        input: { id: IDS.deal2, externalProvider: "ebay", externalId: "duplicate-listing" },
      },
      {
        action: "INSERT",
        domain: "DEAL_SNAPSHOT",
        recordId: IDS.deal3,
        input: { id: IDS.deal3, relations: { dealId: IDS.deal2 } },
      },
      {
        action: "INSERT",
        domain: "DEAL",
        recordId: IDS.file,
        input: {},
      },
    ],
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.results[0].outcome, "WOULD_CONFLICT");
  assert.ok(result.results[1].issues.some((issue) => issue.code === "planned_reference_target_invalid"));
  assert.ok(result.results[2].issues.some((issue) => issue.code === "stable_id_required"));
});

test("archive state is controlled only by explicit archive and archived records cannot be patched", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  assert.throws(
    () => validateCreateInput("DEAL", { id: IDS.deal1, status: "ARCHIVED" }),
    (error) => error.issues.some((entry) => entry.code === "archive_action_required"),
  );
  const created = await service.create(ownerA, "DEAL", { id: IDS.deal1 });
  const archived = await service.archive(ownerA, "DEAL", created.id, { expectedVersion: 1 });
  assert.ok(archived.archivedAt);
  await assert.rejects(
    () => service.update(ownerA, "DEAL", created.id, { expectedVersion: 2, status: "WATCH" }),
    (error) => error.issues.some((entry) => entry.code === "archived_record_immutable"),
  );
  const dryRun = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "8".repeat(64),
    actions: [{ action: "UPDATE", domain: "DEAL", recordId: created.id, input: { expectedVersion: 2, status: "WATCH" } }],
  });
  assert.equal(dryRun.status, "BLOCKED");
  assert.ok(dryRun.results[0].issues.some((issue) => issue.code === "archived_record_immutable"));
});

test("dry run blocks unresolved decisions and plan-wide identity collisions", async () => {
  const repo = repository();
  const ownerA = owner("owner-a");
  const duplicateId = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "1".repeat(64),
    actions: [
      { action: "INSERT", domain: "DEAL", input: { id: IDS.deal1 } },
      { action: "INSERT", domain: "PURCHASE", input: { id: IDS.deal1 } },
    ],
  });
  assert.equal(duplicateId.status, "BLOCKED");
  assert.ok(duplicateId.results.every((entry) => entry.issues.some((issue) => issue.code === "duplicate_id_in_plan")));

  const duplicateExternal = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "2".repeat(64),
    actions: [
      { action: "INSERT", domain: "DEAL", input: { id: IDS.deal1, externalProvider: "ebay", externalId: "listing-1" } },
      { action: "INSERT", domain: "DEAL", input: { id: IDS.deal2, externalProvider: "ebay", externalId: "listing-1" } },
    ],
  });
  assert.equal(duplicateExternal.status, "BLOCKED");
  assert.ok(duplicateExternal.results.every((entry) => entry.issues.some((issue) => issue.code === "duplicate_external_identity_in_plan")));

  const decision = await validateCanonicalDryRun(repo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "3".repeat(64),
    actions: [{ action: "REQUIRES_DECISION", domain: "DEAL", recordId: IDS.deal1 }],
  });
  assert.equal(decision.status, "BLOCKED");
  assert.equal(decision.results[0].outcome, "REQUIRES_DECISION");
  assert.equal(decision.results[0].valid, false);
});

test("FileAsset metadata is strict, owner-scoped, related, and dry-run safe", async () => {
  const repo = repository();
  const service = new CanonicalService(repo);
  const ownerA = owner("owner-a");
  await service.create(ownerA, "DEAL", { id: IDS.deal1 });
  const metadata = {
    storageProvider: "supabase-storage",
    storagePath: "receipts/2026/receipt-1.jpg",
    mimeType: "image/jpeg",
    size: 2048,
    sha256: "a".repeat(64),
    relatedRecordType: "DEAL",
    relatedRecordId: IDS.deal1,
    originalName: "receipt.jpg",
  };
  const asset = await service.create(ownerA, "FILE_ASSET", { id: IDS.file, fileAsset: metadata });
  assert.deepEqual(asset.fileAsset, metadata);
  await assert.rejects(
    () => service.create(ownerA, "FILE_ASSET", { id: IDS.deal2, fileAsset: metadata }),
    (error) => error.duplicateType === "FILE_STORAGE_PATH",
  );
  await assert.rejects(
    () => service.create(ownerA, "FILE_ASSET", { id: IDS.deal2, fileAsset: { ...metadata, storagePath: "https://example.com/private.jpg" } }),
    (error) => error.issues.some((entry) => entry.code === "invalid_storage_path"),
  );
  await assert.rejects(
    () => service.create(ownerA, "FILE_ASSET", { id: IDS.deal2, fileAsset: { ...metadata, relatedRecordId: IDS.deal3 } }),
    (error) => error.issues.some((entry) => entry.code === "invalid_foreign_reference"),
  );

  const emptyRepo = repository();
  const before = emptyRepo.snapshot();
  const dryRun = await validateCanonicalDryRun(emptyRepo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "4".repeat(64),
    actions: [
      { action: "INSERT", domain: "FILE_ASSET", input: { id: IDS.file, fileAsset: metadata } },
      { action: "INSERT", domain: "DEAL", input: { id: IDS.deal1 } },
    ],
  });
  assert.equal(dryRun.status, "READY");
  assert.deepEqual(emptyRepo.snapshot(), before);

  const duplicatePath = await validateCanonicalDryRun(emptyRepo, ownerA, {
    formatVersion: 1,
    sourceBackupHash: "5".repeat(64),
    actions: [
      { action: "INSERT", domain: "FILE_ASSET", input: { id: IDS.file, fileAsset: metadata } },
      { action: "INSERT", domain: "FILE_ASSET", input: { id: IDS.deal2, fileAsset: metadata } },
      { action: "INSERT", domain: "DEAL", input: { id: IDS.deal1 } },
    ],
  });
  assert.equal(duplicatePath.status, "BLOCKED");
  assert.ok(duplicatePath.results.slice(0, 2).every((entry) => entry.issues.some((issue) => issue.code === "duplicate_file_storage_path_in_plan")));
});
