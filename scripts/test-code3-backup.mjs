import assert from "node:assert/strict";
import {
  BACKUP_COVERAGE,
  BACKUP_SOURCE_REGISTRY,
  CODE3_BACKUP_FORMAT,
  CODE3_BACKUP_FORMAT_VERSION,
  canonicalStringify,
  createVerifiedBackup,
  readCurrentBackupSources,
  verifyBackupEnvelope,
  verifyBackupJson,
} from "../src/features/backup/index.js";
import fs from "node:fs";

class MemoryStorage {
  constructor(values = {}, throwingKeys = []) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
    this.throwingKeys = new Set(throwingKeys);
    this.writes = 0;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) {
    if (this.throwingKeys.has(key)) throw new Error("simulated read failure");
    return this.values.get(key) ?? null;
  }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}

const NOW = "2026-08-19T14:05:00.000Z";
const localStorage = new MemoryStorage({
  "ember-and-tide.flip-scout.v1": {
    schemaVersion: 2,
    deals: [{ id: "deal-1", providerId: "ebay", externalListingId: "ebay-1", askingPrice: 25, currency: "USD" }],
    appraisals: [], auctions: [], searchRules: [], purchases: [], lots: [], inventory: [], sales: [], expenses: [], mileage: [], activity: [], providerListings: [],
  },
  "private-business-hub.owner-center.v1": {
    schemaVersion: 1,
    restockStoreProfiles: [{ id: "store-1", name: "Local store" }],
    restockEvents: [], restockPredictions: [], storeVisits: [], productObservations: [], imports: [], jobs: [],
    controls: { scoring: {}, features: {} },
  },
  "et-tcg-beta-data": {
    items: [{ id: "owned-1", name: "Card", accessToken: "must-not-export" }],
    sales: [], expenses: [], mileageTrips: [],
    profile: { email: "owner@example.invalid", refreshToken: "must-not-export" },
    subscriptionProfile: { plan: "private" },
    workspaceMembers: [{ id: "member-1", role: "owner" }],
  },
  "et-tcg-phase2-data": {
    receiptRecords: [{ id: "receipt-1", merchant: "Shop", total: 4, currency: "USD" }],
    receiptLineItems: [], dealFinderSessions: [], dealFinderItems: [], scannerIntakeSessions: [], marketplaceListingChannels: [],
    kidCommunityProjects: [], kidCommunityProjectItems: [], aiAssistEvents: [],
    userTrustProfile: { role: "owner", token: "must-not-export" },
  },
  "et-tcg-app-theme": "dark",
  "sb-example-auth-token": { access_token: "must-not-export" },
});
const sessionStorage = new MemoryStorage({
  "private-business-hub.deal-analysis-draft.v1": { step: 2, form: { title: "Draft" } },
  "private-business-hub.form-draft.sale.new": { itemId: "owned-1" },
  "et-beta-invite-token": "must-not-export",
});

const beforeLocal = localStorage.snapshot();
const beforeSession = sessionStorage.snapshot();
const currentSources = readCurrentBackupSources({ localStorage, sessionStorage });
assert.equal(currentSources.sources["deal-finder"].deals[0].id, "deal-1");
assert.equal(currentSources.sources["legacy-core-business"].items[0].accessToken, undefined);
assert.equal(localStorage.snapshot(), beforeLocal, "current-source reads must not write localStorage");
assert.equal(sessionStorage.snapshot(), beforeSession, "current-source reads must not write sessionStorage");
const complete = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: NOW,
  applicationVersion: "phase-1a-test",
  sourceCommit: "264d5a5",
});
assert.equal(complete.fileName, "code-3-backup-2026-08-19-1405.json");

assert.equal(complete.backup.format, CODE3_BACKUP_FORMAT);
assert.equal(complete.backup.formatVersion, CODE3_BACKUP_FORMAT_VERSION);
assert.equal(complete.coverageStatus, BACKUP_COVERAGE.COMPLETE);
assert.equal(complete.verified, true, "a complete export should be immediately self-verified");
assert.equal(complete.integrityVerified, true);
assert.equal(complete.backup.integrity.selfVerificationPassed, true);
assert.match(complete.fileName, /^code-3-backup-2026-08-19-1405\.json$/);
assert.equal(localStorage.snapshot(), beforeLocal, "export must not write localStorage");
assert.equal(sessionStorage.snapshot(), beforeSession, "export must not write sessionStorage");
assert.equal(localStorage.writes, 0);
assert.equal(sessionStorage.writes, 0);

const dealSection = complete.backup.sections.find((section) => section.sourceId === "deal-finder");
const ownerSection = complete.backup.sections.find((section) => section.sourceId === "owner-center");
const coreSection = complete.backup.sections.find((section) => section.sourceId === "legacy-core-business");
const phase2Section = complete.backup.sections.find((section) => section.sourceId === "phase2-local-fallback");
assert.equal(dealSection.recordCount, 1);
assert.equal(ownerSection.recordCount, 1);
assert.equal(phase2Section.recordCount, 1);
assert.equal(coreSection.recordCount, 1);
assert.equal(coreSection.data.profile, undefined, "identity profile is outside the legacy business allowlist");
assert.equal(coreSection.data.workspaceMembers, undefined, "membership data is outside the legacy business allowlist");
assert.equal(coreSection.data.items[0].accessToken, undefined, "nested security data must be removed");
assert.equal(phase2Section.data.userTrustProfile, undefined, "trust/role identity state must be excluded");
assert.doesNotMatch(complete.json, /must-not-export/);
assert.doesNotMatch(complete.json, /sb-example-auth-token/);
assert.ok(complete.backup.manifest.securityExclusions.length >= 4);

const verification = await verifyBackupJson(complete.json);
assert.equal(verification.valid, true);

const repeated = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: NOW,
  applicationVersion: "phase-1a-test",
  sourceCommit: "264d5a5",
});
assert.equal(repeated.backup.manifest.manifestHash, complete.backup.manifest.manifestHash, "manifest hash must be deterministic");
assert.deepEqual(
  repeated.backup.sections.map((section) => section.sha256),
  complete.backup.sections.map((section) => section.sha256),
  "section hashes must be deterministic",
);
assert.equal(canonicalStringify({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');

const cloudPartial = await createVerifiedBackup({
  localStorage,
  sessionStorage,
  createdAt: NOW,
  configuredSourceIds: ["supabase-owner-data"],
});
assert.equal(cloudPartial.coverageStatus, BACKUP_COVERAGE.PARTIAL);
assert.equal(cloudPartial.verified, true, "a partial export can still have verified integrity");
assert.equal(cloudPartial.backup.manifest.excludedSources.find((source) => source.sourceId === "supabase-owner-data").affectsCoverage, true);

const fileStorage = new MemoryStorage({
  "ember-and-tide.flip-scout.v1": {
    schemaVersion: 2,
    deals: [{ id: "deal-image", images: ["blob:temporary-image"] }],
  },
});
const filePartial = await createVerifiedBackup({ localStorage: fileStorage, sessionStorage: new MemoryStorage(), createdAt: NOW });
assert.equal(filePartial.coverageStatus, BACKUP_COVERAGE.PARTIAL);
assert.equal(filePartial.backup.manifest.fileReferences.ephemeral, 1);
assert.equal(filePartial.backup.manifest.excludedSources.find((source) => source.sourceId === "file-assets").affectsCoverage, true);

const corruptSection = JSON.parse(complete.json);
corruptSection.sections[0].data.deals.push({ id: "tampered" });
assert.equal((await verifyBackupEnvelope(corruptSection)).valid, false);

const corruptManifest = JSON.parse(complete.json);
corruptManifest.manifest.coverageStatus = BACKUP_COVERAGE.PARTIAL;
assert.equal((await verifyBackupEnvelope(corruptManifest)).valid, false);

const corruptEnvelopeMetadata = JSON.parse(complete.json);
corruptEnvelopeMetadata.coverageStatus = BACKUP_COVERAGE.PARTIAL;
corruptEnvelopeMetadata.sourceCommit = "tampered";
assert.equal((await verifyBackupEnvelope(corruptEnvelopeMetadata)).valid, false, "hashed manifest metadata must bind envelope metadata");

const unavailableStorage = new MemoryStorage({}, ["ember-and-tide.flip-scout.v1"]);
const failed = await createVerifiedBackup({ localStorage: unavailableStorage, sessionStorage: new MemoryStorage(), createdAt: NOW });
assert.equal(failed.coverageStatus, BACKUP_COVERAGE.FAILED);
assert.equal(failed.verified, false, "a failed export must not be labeled verified");
assert.equal(failed.integrityVerified, true, "the generated partial file can still be internally consistent without being a verified backup");

const unsupportedSchemaStorage = new MemoryStorage({
  "ember-and-tide.flip-scout.v1": { ...JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1")), schemaVersion: 999 },
});
const unsupportedSchemaExport = await createVerifiedBackup({ localStorage: unsupportedSchemaStorage, sessionStorage: new MemoryStorage(), createdAt: NOW });
assert.equal(unsupportedSchemaExport.coverageStatus, BACKUP_COVERAGE.FAILED, "an unsupported stored schema cannot be called complete");
assert.equal(unsupportedSchemaExport.verified, false);

const malformedShapeStorage = new MemoryStorage({
  "ember-and-tide.flip-scout.v1": { ...JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1")), deals: { id: "not-an-array" } },
});
const malformedShapeExport = await createVerifiedBackup({ localStorage: malformedShapeStorage, sessionStorage: new MemoryStorage(), createdAt: NOW });
assert.equal(malformedShapeExport.coverageStatus, BACKUP_COVERAGE.FAILED, "a malformed registered source cannot be called complete");
assert.equal(malformedShapeExport.verified, false);

const backupPanelSource = fs.readFileSync(new URL("../src/features/backup/BackupRecoveryPanel.jsx", import.meta.url), "utf8");
assert.match(backupPanelSource, /if \(!result\.verified\)/, "the UI must not download an internally consistent export whose coverage failed");

assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "supabase-owner-data" && !source.includedInPhase1AExport));
assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "authentication-state" && source.containsSecurityOrSessionState));

console.log(`Code 3 backup tests passed (${complete.backup.sections.length} sections, ${complete.backup.coverageSummary.recordCount} records).`);
