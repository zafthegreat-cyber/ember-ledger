import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertMigrationPlanIsReadOnly,
  CANONICAL_INPUT_LIMITS,
  CANONICAL_DOMAINS,
  createMigrationPreview,
  MIGRATION_ACTIONS,
  MIGRATION_PREVIEW_STATUSES,
  MIGRATION_SOURCE_CLASSIFICATIONS,
  MIGRATION_SOURCE_REGISTRY,
  previewMoneyToMinor,
  runLocalMigrationPreview,
  toCanonicalDryRunRequest,
  validateCanonicalWireInput,
  validateFileAssetMetadata,
  validateMigrationSourceRegistry,
} from "../src/features/persistence/index.js";
import { BACKUP_SOURCE_REGISTRY, hashCanonicalJson } from "../src/features/backup/index.js";

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

const DEAL_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_DEAL_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-08-20T12:00:00.000Z";
const NEXT = "2026-08-20T12:05:00.000Z";

function emptyCanonicalRemote(overrides = {}) {
  return {
    status: "AVAILABLE",
    included: true,
    coverageStatus: "COMPLETE",
    coverageExplanation: "Every canonical domain was exported without truncation.",
    recordCount: 0,
    truncatedDomains: [],
    domains: Object.fromEntries(Object.values(CANONICAL_DOMAINS).map((domain) => [domain, []])),
    ...overrides,
  };
}

const registryValidation = validateMigrationSourceRegistry();
assert.equal(registryValidation.valid, true, registryValidation.errors.join("\n"));
assert.equal(MIGRATION_SOURCE_REGISTRY.length, BACKUP_SOURCE_REGISTRY.length, "every Phase 1A backup source must have one migration classification");
assert.ok(MIGRATION_SOURCE_REGISTRY.every((source) => Object.values(MIGRATION_SOURCE_CLASSIFICATIONS).includes(source.classification)));
const accountOpsMigrationSource = MIGRATION_SOURCE_REGISTRY.find((source) => source.sourceId === "account-ops");
assert.equal(accountOpsMigrationSource.classification, MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING);
assert.equal(accountOpsMigrationSource.paths.length, 8, "every Account Ops recovery collection needs an explicit migration decision");
assert.ok(accountOpsMigrationSource.paths.every((mapping) => mapping.classification === MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING && mapping.targetDomain === null));

assert.deepEqual(previewMoneyToMinor(12.34, { currency: "USD" }).proposedAmountMinor, 1234);
assert.deepEqual(previewMoneyToMinor(12.3, { currency: "USD" }).proposedAmountMinor, 1230);
assert.deepEqual(previewMoneyToMinor(12, { currency: "USD" }).proposedAmountMinor, 1200);
assert.equal(previewMoneyToMinor(12.345, { currency: "USD" }).status, "BLOCKED");
assert.equal(previewMoneyToMinor(Number.NaN, { currency: "USD" }).status, "BLOCKED");
assert.equal(previewMoneyToMinor(Number.POSITIVE_INFINITY, { currency: "USD" }).status, "BLOCKED");
assert.equal(previewMoneyToMinor("12.34", { currency: "USD" }).status, "BLOCKED", "string money must not be silently parsed");
assert.equal(previewMoneyToMinor(12.34, { currency: "CAD", expectedCurrency: "USD" }).status, "BLOCKED");
const malformedExplicitCurrency = previewMoneyToMinor(12.34, { currency: "US", defaultCurrency: "USD" });
assert.equal(malformedExplicitCurrency.status, "BLOCKED", "an explicitly malformed currency must not silently fall back to USD");
assert.equal(malformedExplicitCurrency.proposedAmountMinor, null);
assert.ok(malformedExplicitCurrency.issues.some((issue) => issue.code === "INVALID_EXPLICIT_CURRENCY"));
const defaultCurrencyProposal = previewMoneyToMinor(12.34, { defaultCurrency: "USD" });
assert.equal(defaultCurrencyProposal.status, "WARNING");
assert.equal(defaultCurrencyProposal.proposedAmountMinor, 1234);

const goodFileAsset = {
  id: "asset-1",
  storageProvider: "supabase-storage",
  storagePath: "owners/redacted/receipts/asset-1.pdf",
  mimeType: "application/pdf",
  size: 1234,
  sha256: "b".repeat(64),
  createdAt: NOW,
  relatedRecordType: null,
  relatedRecordId: null,
};
assert.equal(validateFileAssetMetadata(goodFileAsset).valid, true);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, storagePath: "../secret" }).valid, false);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, ownerSubject: "client-forged" }).valid, false);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, sha256: "not-a-hash" }).valid, false);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, relatedRecordType: "ReceiptMetadata", relatedRecordId: "receipt-1" }).valid, false);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, storageProvider: "p".repeat(80) }).valid, true);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, storageProvider: "p".repeat(81) }).valid, false);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, mimeType: `a/${"b".repeat(253)}` }).valid, true);
assert.equal(validateFileAssetMetadata({ ...goodFileAsset, mimeType: `a/${"b".repeat(254)}` }).valid, false);

const currencyWithoutAmount = validateCanonicalWireInput("DEAL", {
  id: DEAL_ID,
  source: "test",
  currency: "USD",
  relations: {},
});
assert.equal(currencyWithoutAmount.valid, false);
assert.ok(currencyWithoutAmount.issues.some((issue) => issue.code === "currency_without_amount"));
const archivedCreateInput = validateCanonicalWireInput("DEAL", { id: DEAL_ID, source: "test", status: "ARCHIVED", relations: {} });
assert.equal(archivedCreateInput.valid, false);
assert.ok(archivedCreateInput.issues.some((issue) => issue.code === "archive_action_required"));
const archivedUpdateInput = validateCanonicalWireInput("DEAL", { source: "test", status: "ARCHIVED", expectedVersion: 1 }, { update: true });
assert.equal(archivedUpdateInput.valid, false);
assert.ok(archivedUpdateInput.issues.some((issue) => issue.code === "archive_action_required"));

const metadataWithinByteLimit = Object.fromEntries(Array.from({ length: 19 }, (_, index) => [`field${index}`, "x".repeat(13_000)]));
assert.ok(new TextEncoder().encode(JSON.stringify(metadataWithinByteLimit)).byteLength <= CANONICAL_INPUT_LIMITS.metadataUtf8Bytes);
assert.equal(validateCanonicalWireInput("DEAL", { id: DEAL_ID, source: "test", metadata: metadataWithinByteLimit, relations: {} }).valid, true);
const metadataOverByteLimit = { ...metadataWithinByteLimit, field19: "x".repeat(13_000) };
assert.ok(new TextEncoder().encode(JSON.stringify(metadataOverByteLimit)).byteLength > CANONICAL_INPUT_LIMITS.metadataUtf8Bytes);
const oversizedMetadataValidation = validateCanonicalWireInput("DEAL", { id: DEAL_ID, source: "test", metadata: metadataOverByteLimit, relations: {} });
assert.equal(oversizedMetadataValidation.valid, false);
assert.ok(oversizedMetadataValidation.issues.some((issue) => issue.code === "too_large"));

const validFileAssetPreview = await createMigrationPreview({
  localSources: { "file-assets": [goodFileAsset] },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
const validFileAssetAction = validFileAssetPreview.plan.actions.find((action) => action.domain === "FILE_ASSET");
assert.equal(validFileAssetAction.action, MIGRATION_ACTIONS.INSERT);
assert.equal(validFileAssetAction.input.fileAsset.storagePath, goodFileAsset.storagePath);
assert.ok(!("id" in validFileAssetAction.input.fileAsset));
assert.ok(!("createdAt" in validFileAssetAction.input.fileAsset));
assert.equal(validateCanonicalWireInput("FILE_ASSET", validFileAssetAction.input).valid, true);

const invalidFileAssetPreview = await createMigrationPreview({
  localSources: { "file-assets": [{ ...goodFileAsset, storagePath: "../secret" }] },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(invalidFileAssetPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(invalidFileAssetPreview.blockers.some((blocker) => blocker.code === "INVALID_FILE_ASSET"));

const duplicateFileAssetPreview = await createMigrationPreview({
  localSources: { "file-assets": [goodFileAsset, { ...goodFileAsset }] },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(duplicateFileAssetPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateFileAssetPreview.duplicateIds.length, 1);

const missingFileAssetReferencePreview = await createMigrationPreview({
  localSources: {
    "phase2-local-fallback": {
      receiptRecords: [{ id: "77777777-7777-4777-8777-777777777777", fileAssetId: "88888888-8888-4888-8888-888888888888" }],
      receiptLineItems: [], dealFinderItems: [], dealFinderSessions: [], scannerIntakeSessions: [], marketplaceListingChannels: [],
      kidCommunityProjects: [], kidCommunityProjectItems: [], aiAssistEvents: [],
    },
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.ok(missingFileAssetReferencePreview.referenceProblems.some((problem) => problem.expectedDomain === "FILE_ASSET" && problem.severity === "BLOCKER"));

const unmanifestedFileReferencePreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: DEAL_ID, imageUrl: "https://example.test/item.jpg" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.ok(unmanifestedFileReferencePreview.warnings.some((warning) => warning.code === "FILE_REFERENCE_MANIFEST_MISSING"));

function dealFinderState(overrides = {}) {
  return {
    schemaVersion: 2,
    deals: [], appraisals: [], auctions: [], searchRules: [], purchases: [], lots: [], costAllocations: [],
    inventory: [], sales: [], returns: [], expenses: [], mileage: [], activity: [], providerListings: [],
    ...overrides,
  };
}

const localDeal = {
  id: DEAL_ID,
  title: "Local deal",
  providerId: "ebay",
  externalListingId: "listing-1",
  listingUrl: "https://www.ebay.com/itm/listing-1",
  status: "Needs Review",
  askingPrice: 12.34,
  currency: "USD",
  recordVersion: 1,
};
const localSources = { "deal-finder": dealFinderState({ deals: [localDeal] }) };
const sourceFingerprint = await hashCanonicalJson(localDeal);

const insertPreview = await createMigrationPreview({
  localSources,
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
  ownerSubject: "supabase:test-owner",
});
assert.equal(insertPreview.status, MIGRATION_PREVIEW_STATUSES.READY_WITH_WARNINGS, "safe normalization and FileAsset coverage remain visible warnings");
const insertAction = insertPreview.plan.actions.find((action) => action.domain === "DEAL");
assert.equal(insertAction.action, MIGRATION_ACTIONS.INSERT);
assert.equal(insertAction.input.status, "NEEDS_REVIEW");
assert.equal(insertAction.input.amountMinor, 1234);
assert.equal(insertAction.input.currency, "USD");
assert.ok(insertPreview.moneyConversions.some((conversion) => conversion.field === "askingPrice" && conversion.status === "VALID" && conversion.proposedAmountMinor === 1234));
assert.equal(validateCanonicalWireInput("DEAL", insertAction.input).valid, true);
const insertDryRun = toCanonicalDryRunRequest(insertPreview.plan);
assert.deepEqual(Object.keys(insertDryRun).sort(), ["actions", "formatVersion", "sourceBackupHash"]);
assert.deepEqual(Object.keys(insertDryRun.actions[0]).sort(), ["action", "domain", "input", "recordId"]);
assert.equal(insertDryRun.actions[0].domain, "DEAL");
assert.ok(!("sourceId" in insertDryRun.actions[0]), "dry-run action provenance must remain client-side");
assert.equal(insertPreview.writesPerformed, 0);
assertMigrationPlanIsReadOnly(insertPreview.plan);
assert.ok(insertPreview.plan.actions.every((action) => action.action !== "DELETE"));
assert.doesNotMatch(JSON.stringify(insertPreview), /supabase:test-owner/, "raw owner subjects must not appear in previews or plans");

const truncatedDealRemote = emptyCanonicalRemote({
  coverageStatus: "PARTIAL",
  coverageExplanation: "DEAL reached the export limit.",
  truncatedDomains: ["DEAL"],
});
const truncatedDealPreview = await createMigrationPreview({ localSources, remoteSnapshot: truncatedDealRemote, createdAt: NOW });
assert.equal(truncatedDealPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(truncatedDealPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(truncatedDealPreview.blockers.some((blocker) => blocker.code === "REMOTE_COMPARISON_REQUIRED"));

const missingDealRemote = emptyCanonicalRemote({ coverageStatus: "PARTIAL" });
delete missingDealRemote.domains.DEAL;
const missingDealPreview = await createMigrationPreview({ localSources, remoteSnapshot: missingDealRemote, createdAt: NOW });
assert.equal(missingDealPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(missingDealPreview.warnings.some((warning) => warning.code === "REMOTE_DOMAIN_NOT_AUTHORITATIVE"));

const identicalRemote = emptyCanonicalRemote({
  recordCount: 1,
  domains: {
    ...emptyCanonicalRemote().domains,
    DEAL: [{
      id: DEAL_ID,
      domain: "DEAL",
      externalProvider: "ebay",
      externalId: "listing-1",
      metadata: {
        migration: {
          sourceId: "deal-finder",
          sourceCollection: "deals",
          sourceRecordId: DEAL_ID,
          sourceFingerprint,
        },
        sourceRecord: localDeal,
      },
      recordVersion: 1,
    }],
  },
});
const identicalPreview = await createMigrationPreview({ localSources, remoteSnapshot: identicalRemote, createdAt: NOW });
assert.equal(identicalPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.SKIP);
assert.equal(identicalPreview.domains.find((domain) => domain.domain === "DEAL").existingMatches, 1);

const changedRemote = {
  ...identicalRemote,
  domains: { ...identicalRemote.domains, DEAL: [{ ...identicalRemote.domains.DEAL[0], metadata: { ...identicalRemote.domains.DEAL[0].metadata, migration: { ...identicalRemote.domains.DEAL[0].metadata.migration, sourceFingerprint: "c".repeat(64) } } }] },
};
const changedPreview = await createMigrationPreview({ localSources, remoteSnapshot: changedRemote, createdAt: NOW });
assert.equal(changedPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.UPDATE);
assert.equal(changedPreview.plan.actions.find((action) => action.domain === "DEAL").expectedVersion, 1);
const updateDryRun = toCanonicalDryRunRequest(changedPreview.plan);
const updateAction = updateDryRun.actions.find((action) => action.action === "UPDATE");
assert.equal(updateAction.input.expectedVersion, 1);
assert.equal(validateCanonicalWireInput("DEAL", updateAction.input, { update: true }).valid, true);

const provenLineageRemote = {
  ...identicalRemote,
  domains: {
    ...identicalRemote.domains,
    DEAL: [{
      ...identicalRemote.domains.DEAL[0],
      id: SECOND_DEAL_ID,
      externalProvider: null,
      externalId: null,
      metadata: {
        ...identicalRemote.domains.DEAL[0].metadata,
        migration: { ...identicalRemote.domains.DEAL[0].metadata.migration, sourceFingerprint: "f".repeat(64) },
      },
    }],
  },
};
const provenLineagePreview = await createMigrationPreview({ localSources, remoteSnapshot: provenLineageRemote, createdAt: NOW });
const provenLineageUpdate = provenLineagePreview.plan.actions.find((action) => action.domain === "DEAL");
assert.equal(provenLineageUpdate.action, MIGRATION_ACTIONS.UPDATE);
assert.equal(provenLineageUpdate.recordId, SECOND_DEAL_ID, "same-lineage updates must target the existing remote record ID");

const unprovenStableIdRemote = {
  ...identicalRemote,
  domains: { ...identicalRemote.domains, DEAL: [{ id: DEAL_ID, domain: "DEAL", recordVersion: 1, sourceFingerprint: "e".repeat(64) }] },
};
const unprovenStableIdPreview = await createMigrationPreview({ localSources, remoteSnapshot: unprovenStableIdRemote, createdAt: NOW });
assert.equal(unprovenStableIdPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(unprovenStableIdPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(unprovenStableIdPreview.conflicts.some((conflict) => conflict.code === "STABLE_ID_CONTENT_COLLISION"));

const newerRemote = {
  ...identicalRemote,
  domains: { ...identicalRemote.domains, DEAL: [{ ...identicalRemote.domains.DEAL[0], recordVersion: 2, updatedAt: NEXT, metadata: { ...identicalRemote.domains.DEAL[0].metadata, migration: { ...identicalRemote.domains.DEAL[0].metadata.migration, sourceFingerprint: "d".repeat(64) } } }] },
};
const newerPreview = await createMigrationPreview({ localSources, remoteSnapshot: newerRemote, createdAt: NOW });
assert.equal(newerPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(newerPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(newerPreview.conflicts.some((conflict) => conflict.code === "REMOTE_NEWER"));

const providerConflictRemote = {
  ...identicalRemote,
  domains: { ...identicalRemote.domains, DEAL: [{ id: SECOND_DEAL_ID, domain: "DEAL", externalProvider: "ebay", externalId: "listing-1", recordVersion: 1 }] },
};
const providerConflictPreview = await createMigrationPreview({ localSources, remoteSnapshot: providerConflictRemote, createdAt: NOW });
assert.equal(providerConflictPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(providerConflictPreview.conflicts.some((conflict) => conflict.code === "PROVIDER_EXTERNAL_ID_CONFLICT"));

const duplicatePurchaseProviderPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      purchases: [
        { id: DEAL_ID, status: "Paid", providerId: "ebay", externalId: "purchase-order-1" },
        { id: SECOND_DEAL_ID, status: "Paid", providerId: "EBAY", externalId: "purchase-order-1" },
      ],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(duplicatePurchaseProviderPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicatePurchaseProviderPreview.duplicateProviderExternalIds.length, 1);
assert.equal(duplicatePurchaseProviderPreview.duplicateProviderExternalIds[0].domain, "PURCHASE");

const THIRD_RECORD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const purchaseProviderRemote = emptyCanonicalRemote({
  recordCount: 1,
  domains: {
    ...emptyCanonicalRemote().domains,
    PURCHASE: [{
      id: THIRD_RECORD_ID,
      domain: "PURCHASE",
      externalProvider: "ebay",
      externalId: "purchase-order-2",
      recordVersion: 1,
    }],
  },
});
const purchaseProviderRemoteConflict = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      purchases: [{ id: DEAL_ID, status: "Paid", providerId: "ebay", externalId: "purchase-order-2" }],
    }),
  },
  remoteSnapshot: purchaseProviderRemote,
  createdAt: NOW,
});
assert.equal(purchaseProviderRemoteConflict.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(purchaseProviderRemoteConflict.conflicts.some((conflict) => conflict.code === "PROVIDER_EXTERNAL_ID_CONFLICT" && conflict.domain === "PURCHASE"));

const crossDomainProviderReuse = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      deals: [{ id: DEAL_ID, providerId: "ebay", externalId: "shared-provider-id" }],
      purchases: [{ id: SECOND_DEAL_ID, status: "Paid", providerId: "ebay", externalId: "shared-provider-id" }],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(crossDomainProviderReuse.duplicateProviderExternalIds.length, 0, "provider/external uniqueness is domain-qualified");

const archivedProviderRemote = emptyCanonicalRemote({
  recordCount: 1,
  domains: {
    ...emptyCanonicalRemote().domains,
    DEAL: [{
      id: SECOND_DEAL_ID,
      domain: "DEAL",
      externalProvider: "ebay",
      externalId: "listing-1",
      archivedAt: NOW,
      recordVersion: 2,
    }],
  },
});
const archivedProviderReusePreview = await createMigrationPreview({ localSources, remoteSnapshot: archivedProviderRemote, createdAt: NOW });
assert.equal(archivedProviderReusePreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.INSERT);
assert.ok(!archivedProviderReusePreview.conflicts.some((conflict) => conflict.code === "PROVIDER_EXTERNAL_ID_CONFLICT"));

const localArchivedIdentityReusePreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      deals: [localDeal, { ...localDeal, id: SECOND_DEAL_ID, archivedAt: NOW }],
      inventory: [
        { id: "99999999-9999-4999-8999-999999999999", certificationNumber: "CERT-A" },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", certificationNumber: "cert-a", archivedAt: NOW },
      ],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(localArchivedIdentityReusePreview.duplicateProviderExternalIds.length, 0);
assert.equal(localArchivedIdentityReusePreview.duplicateCertifications.length, 0);
const localArchivedDealAction = localArchivedIdentityReusePreview.plan.actions.find((action) => action.domain === "DEAL" && action.sourceIndex === 1);
assert.equal(localArchivedDealAction.action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.equal(localArchivedDealAction.reason, "ARCHIVE_ACTION_REQUIRED");

const archivedStatusMigrationPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: DEAL_ID, status: "Archived" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(archivedStatusMigrationPreview.plan.actions[0].action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.equal(archivedStatusMigrationPreview.plan.actions[0].reason, "ARCHIVE_ACTION_REQUIRED");

const archivedSemanticCertificationPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      inventory: [
        { certificationNumber: "CERT-SEMANTIC" },
        { certificationNumber: "cert-semantic", archivedAt: NOW },
      ],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(archivedSemanticCertificationPreview.duplicateIds.length, 0);
assert.equal(archivedSemanticCertificationPreview.duplicateCertifications.length, 0);
const archivedSemanticAction = archivedSemanticCertificationPreview.plan.actions.find((action) => action.sourceIndex === 1);
assert.equal(archivedSemanticAction.action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(!("recordId" in archivedSemanticAction), "an archived certification must not manufacture an active semantic identity");

const duplicateIdPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [localDeal, { ...localDeal, title: "Duplicate" }] }) },
  remoteSnapshot: identicalRemote,
  createdAt: NOW,
});
assert.equal(duplicateIdPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateIdPreview.duplicateIds.length, 1);

const ownerWideDuplicateIdPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      deals: [localDeal],
      purchases: [{ id: DEAL_ID, status: "Paid" }],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(ownerWideDuplicateIdPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(ownerWideDuplicateIdPreview.duplicateIds.length, 1, "stable UUIDs must be unique owner-wide across canonical domains");
assert.deepEqual(
  new Set([ownerWideDuplicateIdPreview.duplicateIds[0].firstDomain, ownerWideDuplicateIdPreview.duplicateIds[0].secondDomain]),
  new Set(["DEAL", "PURCHASE"]),
);

const ownerWideRemoteCollision = emptyCanonicalRemote({
  recordCount: 1,
  domains: {
    ...emptyCanonicalRemote().domains,
    PURCHASE: [{ id: DEAL_ID, domain: "PURCHASE", recordVersion: 1 }],
  },
});
const ownerWideRemoteCollisionPreview = await createMigrationPreview({
  localSources,
  remoteSnapshot: ownerWideRemoteCollision,
  createdAt: NOW,
});
assert.equal(ownerWideRemoteCollisionPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(ownerWideRemoteCollisionPreview.conflicts.some((conflict) => conflict.code === "OWNER_WIDE_ID_COLLISION"));
assert.equal(ownerWideRemoteCollisionPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.REQUIRES_DECISION);

const duplicateCertificationPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      inventory: [
        { id: DEAL_ID, certificationNumber: "CERT-1" },
        { id: SECOND_DEAL_ID, certificationNumber: "cert-1" },
      ],
    }),
  },
  createdAt: NOW,
});
assert.equal(duplicateCertificationPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateCertificationPreview.duplicateCertifications.length, 1);

const duplicateSaleReferencePreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      sales: [
        { id: DEAL_ID, saleReference: "ORDER-1" },
        { id: SECOND_DEAL_ID, saleReference: "order-1" },
      ],
    }),
  },
  createdAt: NOW,
});
assert.equal(duplicateSaleReferencePreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateSaleReferencePreview.duplicateSaleReferences.length, 1);

const duplicateExpensePreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      expenses: [
        { id: DEAL_ID, date: "2026-08-20", merchant: " Card Shop ", amount: 12.34, currency: "USD" },
        { id: SECOND_DEAL_ID, date: "2026-08-20T23:59:00Z", merchant: "card   shop", amount: 12.34, currency: "usd" },
      ],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(duplicateExpensePreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateExpensePreview.duplicateExpenseSemanticKeys.length, 1);
assert.ok(duplicateExpensePreview.plan.actions.every((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION));

const incompleteExpenseIdentityPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      expenses: [
        { id: DEAL_ID, date: "2026-08-20", merchant: "Card Shop", amount: 12.34 },
        { id: SECOND_DEAL_ID, date: "2026-08-20", merchant: "Card Shop", amount: 12.34 },
      ],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(incompleteExpenseIdentityPreview.duplicateExpenseSemanticKeys.length, 0, "expense matching must not guess when currency is absent");

const duplicateImportReferencePreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      deals: [
        { id: DEAL_ID, importReference: "IMPORT-42" },
        { id: SECOND_DEAL_ID, externalImportId: "import-42" },
      ],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(duplicateImportReferencePreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateImportReferencePreview.duplicateImportReferences.length, 1);
assert.ok(duplicateImportReferencePreview.plan.actions.every((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION));

const brokenReferencePreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ sales: [{ id: DEAL_ID, inventoryItemId: "missing-item" }] }) },
  createdAt: NOW,
});
assert.equal(brokenReferencePreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(brokenReferencePreview.referenceProblems.some((problem) => problem.expectedDomain === "OWNED_ITEM"));

const PURCHASE_ID = "33333333-3333-4333-8333-333333333333";
const LOT_ID = "44444444-4444-4444-8444-444444444444";
const relationPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      purchases: [{ id: PURCHASE_ID, status: "Paid", recordVersion: 1 }],
      lots: [{ id: LOT_ID, purchaseId: PURCHASE_ID, status: "Unprocessed", recordVersion: 1 }],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
const lotInsert = relationPreview.plan.actions.find((action) => action.domain === "PURCHASE_LOT");
assert.equal(lotInsert.action, MIGRATION_ACTIONS.INSERT);
assert.equal(lotInsert.input.relations.purchaseId, PURCHASE_ID);
assert.equal(validateCanonicalWireInput("PURCHASE_LOT", lotInsert.input).valid, true);

const missingRequiredRelation = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ lots: [{ id: LOT_ID, status: "Unprocessed" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(missingRequiredRelation.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(missingRequiredRelation.plan.actions.find((action) => action.domain === "PURCHASE_LOT").action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(missingRequiredRelation.blockers.some((entry) => entry.inputCode === "required" || entry.inputCode === "REQUIRED_RELATION_MISSING"));

const invalidCanonicalInputPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: DEAL_ID, status: "Maybe Later", listingUrl: "javascript:alert(1)", quantity: "2" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(invalidCanonicalInputPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(invalidCanonicalInputPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(invalidCanonicalInputPreview.blockers.some((entry) => entry.inputCode === "invalid_status"));
assert.ok(invalidCanonicalInputPreview.blockers.some((entry) => entry.inputCode === "invalid_url"));
assert.ok(invalidCanonicalInputPreview.blockers.some((entry) => entry.inputCode === "invalid_integer"));

const oversizedMigrationMetadataPreview = await createMigrationPreview({
  localSources: {
    "deal-finder": dealFinderState({
      deals: [{ id: DEAL_ID, ...metadataOverByteLimit }],
    }),
  },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(oversizedMigrationMetadataPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(oversizedMigrationMetadataPreview.plan.actions.find((action) => action.domain === "DEAL").action, MIGRATION_ACTIONS.REQUIRES_DECISION);
assert.ok(oversizedMigrationMetadataPreview.blockers.some((entry) => entry.inputCode === "too_large"));

const invalidMoneyPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: DEAL_ID, askingPrice: "12.34", currency: "USD" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(invalidMoneyPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(invalidMoneyPreview.moneyIssues.some((problem) => problem.code === "MONEY_CONVERSION_BLOCKED"));

const malformedCurrencyPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: DEAL_ID, askingPrice: 12.34, currency: "US" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(malformedCurrencyPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(malformedCurrencyPreview.moneyIssues.some((problem) => problem.money.issues.some((issue) => issue.code === "INVALID_EXPLICIT_CURRENCY")));

const mappingRequiredPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ auctions: [{ id: DEAL_ID, title: "Combined local auction" }] }) },
  createdAt: NOW,
});
assert.equal(mappingRequiredPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(mappingRequiredPreview.plan.actions[0].action, MIGRATION_ACTIONS.REQUIRES_DECISION);

const accountOpsMappingPreview = await createMigrationPreview({
  localSources: {
    "account-ops": {
      schemaVersion: 1,
      profileGroups: [{ id: "group-1" }],
      profiles: [{ id: "profile-1" }],
      emailDomains: [{ id: "domain-1" }],
      emailAliases: [{ id: "alias-1" }],
      retailers: [{ id: "retailer-1" }],
      storeAccounts: [{ id: "account-1" }],
      tasks: [{ id: "task-1" }],
      activity: [{ id: "activity-1" }],
    },
  },
  createdAt: NOW,
});
assert.equal(accountOpsMappingPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.deepEqual(
  new Set(accountOpsMappingPreview.plan.actions.map((action) => action.sourceCollection)),
  new Set(["profileGroups", "profiles", "emailDomains", "emailAliases", "retailers", "storeAccounts", "tasks", "activity"]),
);
assert.ok(accountOpsMappingPreview.plan.actions.every((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION));
assert.throws(
  () => toCanonicalDryRunRequest(accountOpsMappingPreview.plan),
  /unsupported canonical domain/i,
  "Account Ops cannot enter the canonical dry-run contract without a future approved domain mapping",
);

const unsupportedPreserved = await createMigrationPreview({
  localSources: { "legacy-community": { posts: [{ id: "post-1", price: "unknown", currency: "US" }], comments: [], reactions: [], trustedCircle: [] } },
  createdAt: NOW,
});
assert.ok(unsupportedPreserved.plan.actions.every((action) => action.action === MIGRATION_ACTIONS.SKIP));
assert.ok(unsupportedPreserved.warnings.some((warning) => warning.code === "SOURCE_EXCLUDED"));
assert.equal(unsupportedPreserved.moneyIssues.length, 0, "excluded legacy junk must not be canonically money-validated");
assert.ok(!unsupportedPreserved.blockers.some((blocker) => blocker.code === "MONEY_CONVERSION_BLOCKED"));
assert.equal(toCanonicalDryRunRequest(unsupportedPreserved.plan).actions.length, 0, "legacy-only skips are client findings, not invalid backend domains");

const previouslyResidualPaths = {
  "legacy-core-business": {
    purchasers: [{ id: "purchaser-1" }],
    marketplaceReports: [{ id: "market-report-1" }],
    marketPriceMemories: [{ id: "price-memory-1" }],
    itemComparisons: [{ id: "comparison-1" }],
    vehicles: [{ id: "vehicle-1" }],
    workspaces: [{ id: "workspace-1" }],
  },
  "legacy-restock-scout": {
    routes: [{ id: "route-1" }],
    restockIntel: [{ id: "intel-1" }],
    intelImportReviews: [{ id: "intel-review-1" }],
    storeAliases: [{ id: "alias-1" }],
    bestBuyStoreStock: [{ id: "stock-1" }],
    bestBuyAlerts: [{ id: "alert-1" }],
    bestBuyNightlyReports: [{ id: "nightly-1" }],
  },
  "postgres-owner-data": {
    records: [{ id: DEAL_ID, domain: "DEAL" }],
  },
};
const residualPathPreview = await createMigrationPreview({
  localSources: previouslyResidualPaths,
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
const expectedResidualCollections = new Set([
  "purchasers", "marketplaceReports", "marketPriceMemories", "itemComparisons", "vehicles", "workspaces",
  "routes", "restockIntel", "intelImportReviews", "storeAliases", "bestBuyStoreStock", "bestBuyAlerts", "bestBuyNightlyReports", "records",
]);
assert.deepEqual(new Set(residualPathPreview.plan.actions.map((action) => action.sourceCollection)), expectedResidualCollections);
assert.equal(residualPathPreview.plan.actions.length, expectedResidualCollections.size, "every registered residual record path must produce a visible classified action");
assert.ok(residualPathPreview.plan.actions.every((action) => [MIGRATION_ACTIONS.SKIP, MIGRATION_ACTIONS.REQUIRES_DECISION].includes(action.action)));
assert.ok(residualPathPreview.warnings.some((warning) => warning.code === "SOURCE_EXCLUDED"));
assert.ok(residualPathPreview.conflicts.some((conflict) => conflict.code === "REQUIRES_MAPPING"));

const legacyIdentityBefore = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: "legacy-a", title: "A" }, { id: "legacy-b", title: "B" }] }) },
  createdAt: NOW,
});
const legacyIdentityAfterUnrelatedChange = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: "legacy-a", title: "A" }, { id: "legacy-b", title: "B changed" }] }) },
  createdAt: NEXT,
});
const legacyIdentityAfterOwnChange = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ id: "legacy-a", title: "A changed" }, { id: "legacy-b", title: "B" }] }) },
  createdAt: NEXT,
});
const legacyAId = legacyIdentityBefore.plan.actions.find((action) => action.sourceRecordId === "legacy-a").recordId;
assert.equal(legacyIdentityAfterUnrelatedChange.plan.actions.find((action) => action.sourceRecordId === "legacy-a").recordId, legacyAId, "unrelated record changes must not alter a proposed canonical ID");
assert.equal(legacyIdentityAfterOwnChange.plan.actions.find((action) => action.sourceRecordId === "legacy-a").recordId, legacyAId, "a stable legacy ID must remain stable when its content changes");

const anonymousA = { title: "Anonymous A" };
const anonymousB = { title: "Anonymous B" };
const anonymousIdentityBefore = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [anonymousA, anonymousB] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
const anonymousIdentityAfter = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ title: "Anonymous A changed" }, anonymousB] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NEXT,
});
assert.equal(anonymousIdentityBefore.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.ok(anonymousIdentityBefore.plan.actions.every((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION));
assert.ok(anonymousIdentityBefore.plan.actions.every((action) => !("recordId" in action)), "anonymous records must not receive content- or position-derived IDs");
assert.ok(anonymousIdentityAfter.plan.actions.every((action) => !("recordId" in action)), "changing a mutable title must not manufacture a new canonical identity");
assert.ok(anonymousIdentityBefore.conflicts.every((conflict) => conflict.code === "STABLE_ID_ASSIGNMENT_REQUIRED"));
const duplicateAnonymousPreview = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [anonymousA, { ...anonymousA }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
assert.equal(duplicateAnonymousPreview.status, MIGRATION_PREVIEW_STATUSES.BLOCKED);
assert.equal(duplicateAnonymousPreview.duplicateIds.length, 0, "anonymous records have no proposed ID until the owner assigns a durable identity");
assert.ok(duplicateAnonymousPreview.plan.actions.every((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION));

const semanticIdentityBefore = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ providerId: "ebay", externalListingId: "semantic-listing", title: "Before" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NOW,
});
const semanticIdentityAfter = await createMigrationPreview({
  localSources: { "deal-finder": dealFinderState({ deals: [{ providerId: "EBAY", externalListingId: "semantic-listing", title: "After" }] }) },
  remoteSnapshot: emptyCanonicalRemote(),
  createdAt: NEXT,
});
const semanticIdBefore = semanticIdentityBefore.plan.actions[0].recordId;
assert.ok(semanticIdBefore, "an explicit provider/external listing pair may provide a stable semantic identity");
assert.equal(semanticIdentityAfter.plan.actions[0].recordId, semanticIdBefore);

const deterministicFirst = await createMigrationPreview({ localSources, remoteSnapshot: identicalRemote, createdAt: NOW, sourceCommit: "26d30b9" });
const deterministicSecond = await createMigrationPreview({ localSources, remoteSnapshot: identicalRemote, createdAt: NEXT, sourceCommit: "26d30b9" });
assert.equal(deterministicFirst.plan.planHash, deterministicSecond.plan.planHash, "plan hash must exclude volatile preview time");
assert.equal(deterministicFirst.previewHash, deterministicSecond.previewHash, "preview hash must be deterministic for the same substantive inputs");

const localStorage = new MemoryStorage({ "ember-and-tide.flip-scout.v1": localSources["deal-finder"] });
const sessionStorage = new MemoryStorage();
const beforeLocal = localStorage.snapshot();
const beforeSession = sessionStorage.snapshot();
const zeroWritePreview = await runLocalMigrationPreview({ localStorage, sessionStorage, createdAt: NOW });
assert.equal(zeroWritePreview.writesPerformed, 0);
assert.equal(localStorage.snapshot(), beforeLocal);
assert.equal(sessionStorage.snapshot(), beforeSession);
assert.equal(localStorage.writes, 0);
assert.equal(sessionStorage.writes, 0);
assert.equal(localStorage.removes, 0);
assert.equal(sessionStorage.removes, 0);

const emptyLocalPreview = await runLocalMigrationPreview({ localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), createdAt: NOW });
const unreadableSourcePreview = await runLocalMigrationPreview({
  localStorage: new MemoryStorage({ "ember-and-tide.flip-scout.v1": "{not-json" }),
  sessionStorage: new MemoryStorage(),
  createdAt: NOW,
});
assert.ok(unreadableSourcePreview.warnings.some((warning) => warning.code === "SOURCE_READ_WARNING"));
assert.ok(unreadableSourcePreview.plan.warnings.some((warning) => warning.code === "SOURCE_READ_WARNING"));
assert.equal(unreadableSourcePreview.status, MIGRATION_PREVIEW_STATUSES.READY_WITH_WARNINGS);
assert.ok(unreadableSourcePreview.warnings.some((warning) => warning.code === "FILE_REFERENCE_MANIFEST_UNSUPPORTED"));
assert.ok(emptyLocalPreview.warnings.some((warning) => warning.code === "FILE_REFERENCE_MANIFEST_UNSUPPORTED"));
const warningHashBaseline = await createMigrationPreview({ localSources: {}, createdAt: NOW });
const warningHashVariant = await createMigrationPreview({
  localSources: {},
  createdAt: NOW,
  sourceReadWarnings: [{ sourceId: "deal-finder", message: "Source could not be read." }],
});
assert.notEqual(warningHashVariant.plan.planHash, warningHashBaseline.plan.planHash, "source-read warnings must participate in the plan hash");
assert.notEqual(warningHashVariant.previewHash, warningHashBaseline.previewHash, "source-read warnings must participate in the preview hash");

const previewSource = fs.readFileSync(new URL("../src/features/persistence/migrationPreview.js", import.meta.url), "utf8");
assert.doesNotMatch(previewSource, /setItem\s*\(|removeItem\s*\(|\.clear\s*\(|indexedDB|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i, "migration preview must not contain a write surface");

console.log("Code 3 migration-preview tests passed (money, mappings, deterministic plans, conflicts, references, and zero writes).");
