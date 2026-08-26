import assert from "node:assert/strict";
import fs from "node:fs";
import {
  BACKUP_COVERAGE,
  BACKUP_SOURCE_REGISTRY,
  RESTORE_PREVIEW_RESULTS,
  countSourceRecords,
  createVerifiedBackup,
  getBackupSource,
  previewBackupRestore,
  readCurrentBackupSources,
  sealBackupEnvelope,
} from "../src/features/backup/index.js";

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
    this.writes = 0;
    this.removes = 0;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.removes += 1; this.values.delete(key); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}

const NOW = "2026-08-19T15:00:00.000Z";
const accountOpsRecord = (id, value) => ({
  id,
  recordVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  ...value,
});
const baseDealState = {
  schemaVersion: 2,
  deals: [{ id: "deal-1", providerId: "ebay", externalListingId: "listing-1", askingPrice: 10, currency: "USD" }],
  appraisals: [], auctions: [], searchRules: [], purchases: [], lots: [], inventory: [], sales: [], expenses: [], mileage: [], activity: [], providerListings: [],
};
const localStorage = new MemoryStorage({ "ember-and-tide.flip-scout.v1": baseDealState });
const sessionStorage = new MemoryStorage({ "private-business-hub.form-draft.purchase.new": { title: "Draft" } });
const baseline = await createVerifiedBackup({ localStorage, sessionStorage, createdAt: NOW });
assert.equal(baseline.coverageStatus, BACKUP_COVERAGE.COMPLETE);

async function mutateAndSeal(mutator) {
  const envelope = JSON.parse(baseline.json);
  mutator(envelope);
  for (const section of envelope.sections) {
    const source = getBackupSource(section.sourceId, BACKUP_SOURCE_REGISTRY);
    if (source) section.recordCount = countSourceRecords(section.data, source);
  }
  return sealBackupEnvelope(envelope);
}

const ready = await previewBackupRestore(baseline.json, {
  currentSources: { "deal-finder": baseDealState },
  startedAt: NOW,
});
assert.equal(ready.result, RESTORE_PREVIEW_RESULTS.READY_FOR_FUTURE_RESTORE);
assert.equal(ready.manifestIntegrity, "VALID");
assert.equal(ready.sectionIntegrity, "VALID");
assert.equal(ready.writesPerformed, 0);
assert.equal(ready.matchingRecords, 1);
assert.equal(ready.potentialUpdates, 0);

const updatedCurrent = structuredClone(baseDealState);
updatedCurrent.deals[0].askingPrice = 9;
const comparison = await previewBackupRestore(baseline.json, { currentSources: { "deal-finder": updatedCurrent } });
assert.equal(comparison.potentialUpdates, 1);

const partialExport = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: NOW,
  configuredSourceIds: ["supabase-owner-data"],
});
const partialPreview = await previewBackupRestore(partialExport.json);
assert.equal(partialPreview.result, RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS);
assert.match(partialPreview.warnings.join(" "), /coverage is PARTIAL/i);

const corruptedSection = JSON.parse(baseline.json);
corruptedSection.sections.find((section) => section.sourceId === "deal-finder").data.deals[0].askingPrice = 999;
assert.equal((await previewBackupRestore(JSON.stringify(corruptedSection))).result, RESTORE_PREVIEW_RESULTS.CORRUPTED);

const corruptedManifest = JSON.parse(baseline.json);
corruptedManifest.manifest.createdAt = "tampered";
assert.equal((await previewBackupRestore(JSON.stringify(corruptedManifest))).result, RESTORE_PREVIEW_RESULTS.CORRUPTED);

const unsupportedFormat = JSON.parse(baseline.json);
unsupportedFormat.formatVersion = 99;
assert.equal((await previewBackupRestore(JSON.stringify(unsupportedFormat))).result, RESTORE_PREVIEW_RESULTS.UNSUPPORTED);

const unsupportedSchema = await mutateAndSeal((envelope) => {
  envelope.sections.find((section) => section.sourceId === "deal-finder").schemaVersion = 99;
});
const unsupportedSchemaPreview = await previewBackupRestore(JSON.stringify(unsupportedSchema));
assert.equal(unsupportedSchemaPreview.result, RESTORE_PREVIEW_RESULTS.UNSUPPORTED);
assert.equal(unsupportedSchemaPreview.unsupportedSchemas[0].sourceId, "deal-finder");

const unknownSource = await mutateAndSeal((envelope) => {
  envelope.sections.push({ sourceId: "future-source", schemaVersion: 1, recordCount: 1, data: [{ id: "future-1" }], warnings: [], sha256: "" });
});
const unknownPreview = await previewBackupRestore(JSON.stringify(unknownSource));
assert.equal(unknownPreview.result, RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS);
assert.deepEqual(unknownPreview.unknownSources, ["future-source"]);

const validAccountOps = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "account-ops");
  section.data.updatedAt = NOW;
  section.data.profileGroups = [accountOpsRecord("group-business", { displayName: "Business" })];
  section.data.profiles = [accountOpsRecord("profile-1", { profileGroupId: "group-business", displayName: "Business 01" })];
  section.data.emailDomains = [accountOpsRecord("domain-1", { domain: "example.invalid", mode: "LOCAL_METADATA_ONLY" })];
  section.data.emailAliases = [accountOpsRecord("alias-1", {
    aliasAddress: "bestbuy-business-01@example.invalid",
    domain: "example.invalid",
    localPart: "bestbuy-business-01",
    profileId: "profile-1",
    domainId: "domain-1",
    retailerId: "retailer-preset:best-buy",
  })];
  section.data.storeAccounts = [accountOpsRecord("account-1", {
    profileId: "profile-1",
    aliasId: "alias-1",
    retailerId: "retailer-preset:best-buy",
  })];
  section.data.tasks = [accountOpsRecord("task-1", {
    title: "Review account",
    profileId: "profile-1",
    accountId: "account-1",
    retailerId: "retailer-preset:best-buy",
  })];
  section.data.activity = [accountOpsRecord("activity-1", { type: "ACCOUNT_CREATED", title: "Account created", accountId: "account-1" })];
});
const validAccountOpsPreview = await previewBackupRestore(JSON.stringify(validAccountOps));
assert.equal(validAccountOpsPreview.result, RESTORE_PREVIEW_RESULTS.READY_FOR_FUTURE_RESTORE);
assert.equal(validAccountOpsPreview.brokenReferences.length, 0, "static retailer presets and valid local relationships must preview cleanly");

const brokenAccountOpsProfile = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "account-ops");
  section.data.emailDomains = [accountOpsRecord("domain-1", { domain: "example.invalid", mode: "LOCAL_METADATA_ONLY" })];
  section.data.emailAliases = [accountOpsRecord("alias-broken", {
    aliasAddress: "broken@example.invalid",
    domain: "example.invalid",
    localPart: "broken",
    domainId: "domain-1",
    profileId: "profile-missing",
  })];
});
const brokenAccountOpsProfilePreview = await previewBackupRestore(JSON.stringify(brokenAccountOpsProfile));
assert.equal(brokenAccountOpsProfilePreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.ok(brokenAccountOpsProfilePreview.brokenReferences.some((issue) => issue.reference === "profile-missing" && issue.severity === "ERROR"));

const brokenAccountOpsRetailer = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "account-ops");
  section.data.profiles = [accountOpsRecord("profile-1", { displayName: "Business 01" })];
  section.data.storeAccounts = [accountOpsRecord("account-broken", { profileId: "profile-1", retailerId: "retailer-custom-missing" })];
});
const brokenAccountOpsRetailerPreview = await previewBackupRestore(JSON.stringify(brokenAccountOpsRetailer));
assert.equal(brokenAccountOpsRetailerPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.ok(brokenAccountOpsRetailerPreview.brokenReferences.some((issue) => issue.reference === "retailer-custom-missing"));

const unknownRetailerPresetReference = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "account-ops");
  section.data.profiles = [accountOpsRecord("profile-1", { displayName: "Business 01" })];
  section.data.storeAccounts = [accountOpsRecord("account-invalid-preset", { profileId: "profile-1", retailerId: "retailer-preset:not-real" })];
});
const unknownRetailerPresetPreview = await previewBackupRestore(JSON.stringify(unknownRetailerPresetReference));
assert.equal(unknownRetailerPresetPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.ok(unknownRetailerPresetPreview.brokenReferences.some((issue) => issue.reference === "retailer-preset:not-real"));

const duplicateAccountOpsAlias = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "account-ops");
  section.data.emailDomains = [accountOpsRecord("domain-1", { domain: "example.invalid", mode: "LOCAL_METADATA_ONLY" })];
  section.data.emailAliases = [
    accountOpsRecord("alias-1", { aliasAddress: "Duplicate@Example.invalid", domain: "example.invalid", localPart: "duplicate", domainId: "domain-1" }),
    accountOpsRecord("alias-2", { aliasAddress: "duplicate@example.invalid", domain: "example.invalid", localPart: "duplicate", domainId: "domain-1" }),
  ];
});
const duplicateAccountOpsAliasPreview = await previewBackupRestore(JSON.stringify(duplicateAccountOpsAlias));
assert.equal(duplicateAccountOpsAliasPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.deepEqual(duplicateAccountOpsAliasPreview.duplicateAliases, [{
  aliasAddress: "duplicate@example.invalid",
  firstId: "alias-1",
  secondId: "alias-2",
}]);

const duplicateIds = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.deals.push({ ...section.data.deals[0] });
});
const duplicatePreview = await previewBackupRestore(JSON.stringify(duplicateIds));
assert.equal(duplicatePreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.equal(duplicatePreview.duplicateIds.length, 1);
assert.equal(duplicatePreview.duplicateProviderListings.length, 1);

const crossSourceSameCollectionCollision = await mutateAndSeal((envelope) => {
  envelope.sections.find((section) => section.sourceId === "deal-finder").data.sales = [{ id: "shared-sale-id" }];
  envelope.sections.find((section) => section.sourceId === "legacy-core-business").data.sales = [{ id: "shared-sale-id" }];
});
const crossSourceCollisionPreview = await previewBackupRestore(JSON.stringify(crossSourceSameCollectionCollision));
assert.equal(crossSourceCollisionPreview.result, RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS);
assert.deepEqual(crossSourceCollisionPreview.idCollisions, [{
  id: "shared-sale-id",
  first: "sales",
  firstSourceId: "deal-finder",
  second: "sales",
  secondSourceId: "legacy-core-business",
}]);

const duplicateCertifications = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.inventory = [
    { id: "inventory-1", certificationNumber: "CERT-1" },
    { id: "inventory-2", certificationNumber: "cert-1" },
  ];
});
const certificationPreview = await previewBackupRestore(JSON.stringify(duplicateCertifications));
assert.equal(certificationPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.equal(certificationPreview.duplicateCertifications.length, 1);

const brokenReference = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.inventory = [{ id: "inventory-present" }];
  section.data.sales = [{ id: "sale-1", inventoryItemId: "inventory-missing" }];
});
const brokenPreview = await previewBackupRestore(JSON.stringify(brokenReference));
assert.equal(brokenPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.ok(brokenPreview.brokenReferences.some((issue) => issue.reference === "inventory-missing" && issue.severity === "ERROR"));

const orphanedRecoveryRecords = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.sales = [{ id: "sale-2", returnId: "return-missing" }];
  section.data.lots = [{ id: "lot-1", allocationId: "allocation-missing" }];
});
const orphanedRecoveryPreview = await previewBackupRestore(JSON.stringify(orphanedRecoveryRecords));
assert.ok(orphanedRecoveryPreview.brokenReferences.some((issue) => issue.reference === "return-missing"));
assert.ok(orphanedRecoveryPreview.brokenReferences.some((issue) => issue.reference === "allocation-missing"));

const invalidMoney = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.deals[0].askingPrice = "NaN";
});
const invalidMoneyPreview = await previewBackupRestore(JSON.stringify(invalidMoney));
assert.equal(invalidMoneyPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.equal(invalidMoneyPreview.invalidMoney.length, 1);

const negativeMoney = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.deals[0].askingPrice = -1;
});
assert.equal((await previewBackupRestore(JSON.stringify(negativeMoney))).result, RESTORE_PREVIEW_RESULTS.BLOCKED);

const excessPrecision = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.deals[0].askingPrice = 10.123;
});
const precisionPreview = await previewBackupRestore(JSON.stringify(excessPrecision));
assert.equal(precisionPreview.result, RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS);
assert.equal(precisionPreview.unsupportedPrecision.length, 1);

const missingCurrency = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  delete section.data.deals[0].currency;
});
const missingCurrencyPreview = await previewBackupRestore(JSON.stringify(missingCurrency));
assert.equal(missingCurrencyPreview.result, RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS);
assert.equal(missingCurrencyPreview.missingCurrency.length, 1);

const currencyMismatch = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.deals.push({ id: "deal-2", askingPrice: 20, currency: "CAD" });
});
const currencyPreview = await previewBackupRestore(JSON.stringify(currencyMismatch));
assert.equal(currencyPreview.result, RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS);
assert.equal(currencyPreview.currencyMismatches.length, 1);

const prohibited = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "deal-finder");
  section.data.deals[0].accessToken = "malicious-token";
});
const prohibitedPreview = await previewBackupRestore(JSON.stringify(prohibited));
assert.equal(prohibitedPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
assert.ok(prohibitedPreview.prohibitedFields.some((path) => /accessToken/.test(path)));

const phase2aProhibited = await mutateAndSeal((envelope) => {
  const section = envelope.sections.find((entry) => entry.sourceId === "account-ops");
  section.data.profiles = [accountOpsRecord("profile-secret", { displayName: "Business 01" })];
  section.data.storeAccounts = [accountOpsRecord("account-secret", {
    profileId: "profile-secret",
    retailerId: "retailer-preset:target",
    credentialReference: { provider: "EXTERNAL_PASSWORD_MANAGER", referenceId: "safe-reference", label: "Safe metadata" },
    otpCode: "123456",
    retailerPassword: "not-allowed",
    cvv: "123",
    passphrase: "not-allowed",
    credentials: { value: "not-allowed" },
    sessionState: "not-allowed",
  })];
});
const phase2aProhibitedPreview = await previewBackupRestore(JSON.stringify(phase2aProhibited));
assert.equal(phase2aProhibitedPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
for (const field of ["otpCode", "retailerPassword", "cvv", "passphrase", "credentials"]) {
  assert.ok(phase2aProhibitedPreview.prohibitedFields.some((path) => path.endsWith(`.${field}`)), `${field} must be rejected during restore preview`);
}
assert.match(phase2aProhibitedPreview.errors.join(" "), /SECRET_FIELD_REJECTED/, "Account Ops schema validation must reject nested session-state injection");
assert.ok(!phase2aProhibitedPreview.prohibitedFields.some((path) => /credentialReference(?:\.|$)/.test(path)), "credentialReference metadata remains permitted");

const topLevelProhibited = JSON.parse(baseline.json);
topLevelProhibited.accessToken = "malicious-token";
const topLevelProhibitedPreview = await previewBackupRestore(JSON.stringify(topLevelProhibited));
assert.equal(topLevelProhibitedPreview.result, RESTORE_PREVIEW_RESULTS.CORRUPTED);
assert.ok(topLevelProhibitedPreview.prohibitedFields.some((path) => /accessToken/.test(path)));

const manifestProhibited = await mutateAndSeal((envelope) => {
  envelope.manifest.refreshToken = "malicious-token";
});
const manifestProhibitedPreview = await previewBackupRestore(JSON.stringify(manifestProhibited));
assert.equal(manifestProhibitedPreview.result, RESTORE_PREVIEW_RESULTS.CORRUPTED);
assert.ok(manifestProhibitedPreview.prohibitedFields.some((path) => /refreshToken/.test(path)));

assert.equal((await previewBackupRestore('{"format":"code-3-backup"')).result, RESTORE_PREVIEW_RESULTS.CORRUPTED);
assert.equal(
  (await previewBackupRestore('{"format":"code-3-backup","formatVersion":1,"__proto__":{"polluted":true}}')).result,
  RESTORE_PREVIEW_RESULTS.BLOCKED,
);
assert.equal(({}).polluted, undefined);

const oversizedPreview = await previewBackupRestore(baseline.json, { limits: { maxBytes: 100 } });
assert.equal(oversizedPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);
const excessiveRecordsPreview = await previewBackupRestore(baseline.json, { limits: { maxTotalRecords: 0 } });
assert.equal(excessiveRecordsPreview.result, RESTORE_PREVIEW_RESULTS.BLOCKED);

const localBefore = localStorage.snapshot();
const sessionBefore = sessionStorage.snapshot();
const currentSnapshot = readCurrentBackupSources({ localStorage, sessionStorage });
await previewBackupRestore(baseline.json, {
  currentSources: currentSnapshot.sources,
});
assert.equal(localStorage.snapshot(), localBefore, "restore preview must not write localStorage");
assert.equal(sessionStorage.snapshot(), sessionBefore, "restore preview must not write sessionStorage");
assert.equal(localStorage.writes, 0);
assert.equal(sessionStorage.writes, 0);
assert.equal(localStorage.removes, 0);
assert.equal(sessionStorage.removes, 0);

const registeredWritableTypes = new Set(BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport).map((source) => source.storageType));
assert.deepEqual([...registeredWritableTypes].sort(), ["LOCAL_STORAGE", "SESSION_STORAGE"], "Phase 1A must snapshot every registered writable storage type");
const previewSource = fs.readFileSync(new URL("../src/features/backup/restorePreview.js", import.meta.url), "utf8");
assert.doesNotMatch(previewSource, /setItem\s*\(|removeItem\s*\(|\.clear\s*\(|indexedDB|from\s+["'][^"']*(?:supabase|postgres|db|fileSystem)/i, "restore preview must not import or invoke a write surface");

console.log("Code 3 restore-preview tests passed (ready, warning, blocked, unsupported, corrupted, and zero-write paths)." );
