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
import { getPhase2dQaFixture } from "../src/features/botOps/fixtures/phase2dQaFixtures.js";

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
const accountOpsRecord = (id, value) => ({
  id,
  recordVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  ...value,
});
const inboxOrderRecord = (id, recordType, value) => ({
  id,
  format: "code3.inbox-order.v1",
  recordType,
  recordVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  ...value,
});
const botOpsState = getPhase2dQaFixture("synthetic-checkout-success").state;
botOpsState.installations[0].accessToken = "phase2da-bot-token-must-not-export";
botOpsState.proxyGroups[0].proxyPassword = "phase2da-proxy-password-must-not-export";
botOpsState.attempts[0].rawProviderPayload = { cookie: "phase2da-cookie-must-not-export" };
botOpsState.checkoutEvidence[0].cvv = "000";
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
  "code3.account-ops.v1": {
    schemaVersion: 1,
    updatedAt: NOW,
    profileGroups: [accountOpsRecord("profile-group-business", { displayName: "Business" })],
    profiles: [accountOpsRecord("profile-business-1", { profileGroupId: "profile-group-business", displayName: "Business 01" })],
    emailDomains: [accountOpsRecord("domain-example", { domain: "example.invalid", mode: "LOCAL_METADATA_ONLY" })],
    emailAliases: [accountOpsRecord("alias-business-1", {
      aliasAddress: "shop-business-01@example.invalid",
      domain: "example.invalid",
      localPart: "shop-business-01",
      profileId: "profile-business-1",
      domainId: "domain-example",
      status: "ACTIVE",
      password: "phase2a-password-must-not-export",
      retailerPassword: "phase2a-retailer-password-must-not-export",
      otp: "phase2a-otp-must-not-export",
      passphrase: "phase2a-passphrase-must-not-export",
    })],
    retailers: [accountOpsRecord("retailer-custom-1", { displayName: "Example Retailer" })],
    storeAccounts: [accountOpsRecord("store-account-1", {
      retailerId: "retailer-custom-1",
      profileId: "profile-business-1",
      aliasId: "alias-business-1",
      credentialReference: { provider: "EXTERNAL_PASSWORD_MANAGER", referenceId: "vault-reference-1", label: "Example account" },
      accessToken: "phase2a-token-must-not-export",
      cvv: "phase2a-cvv-must-not-export",
      credentials: { value: "phase2a-credentials-must-not-export" },
      session: "phase2a-session-must-not-export",
    })],
    tasks: [accountOpsRecord("account-task-1", { accountId: "store-account-1", title: "Review account", status: "OPEN" })],
    activity: [accountOpsRecord("account-activity-1", { type: "ACCOUNT_CREATED", title: "Account created" })],
  },
  "code3.inbox-order.v1": {
    schemaVersion: 1,
    updatedAt: NOW,
    messageEvents: [inboxOrderRecord("message-event-1", "NORMALIZED_MESSAGE_EVENT", {
      providerConnectionId: "connection-fixture-1",
      providerEventKey: "connection-fixture-1:message-1",
      sourceHash: "a".repeat(64),
      rawContentRetained: false,
      category: "ORDER_CONFIRMATION",
      warnings: [],
      accessToken: "phase2b1-access-token-must-not-export",
      rawMessageContent: "phase2b1-raw-message-must-not-export",
    })],
    orderCandidates: [inboxOrderRecord("order-candidate-1", "ORDER_CANDIDATE", {
      providerConnectionId: "connection-fixture-1",
      sourceEventIds: ["message-event-1"],
      purchaseCreated: false,
      automaticImportAllowed: false,
      ownerReviewRequired: true,
      ownerReview: { state: "NEW", corrections: [] },
      warnings: [],
      refreshToken: "phase2b1-refresh-token-must-not-export",
      managedReference: "phase2b2b-managed-reference-must-not-export",
    })],
    candidateEvents: [inboxOrderRecord("candidate-event-1", "ORDER_CANDIDATE_EVENT", {
      candidateId: "order-candidate-1",
      type: "DETECTED",
      details: { sourceEventId: "message-event-1" },
    })],
    activity: [inboxOrderRecord("inbox-order-activity-1", "INBOX_ORDER_ACTIVITY", {
      type: "MESSAGE_NORMALIZED",
      summary: "Synthetic order evidence normalized.",
    })],
  },
  "code3.bot-ops.v1": botOpsState,
  "et-tcg-beta-data": {
    items: [{
      id: "owned-1",
      name: "Card",
      cardNumber: "TG-001",
      paymentCardNumber: "phase2da-payment-pan-must-not-export",
      accessToken: "must-not-export",
    }],
    sales: [], expenses: [], mileageTrips: [],
    profile: { email: "owner@example.invalid", refreshToken: "must-not-export" },
    subscriptionProfile: { plan: "private" },
    workspaceMembers: [{ id: "member-1", role: "owner" }],
  },
  "et-tcg-phase2-data": {
    receiptRecords: [{ id: "receipt-1", merchant: "Shop", total: 4, currency: "USD" }],
    receiptLineItems: [], dealFinderSessions: [{ id: "deal-session-1" }], dealFinderItems: [{ id: "deal-item-1", sessionId: "deal-session-1" }], scannerIntakeSessions: [], marketplaceListingChannels: [],
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
assert.equal(currentSources.sources["account-ops"].storeAccounts[0].id, "store-account-1");
assert.equal(currentSources.sources["account-ops"].storeAccounts[0].accessToken, undefined);
assert.equal(currentSources.sources["account-ops"].storeAccounts[0].cvv, undefined);
assert.equal(currentSources.sources["account-ops"].storeAccounts[0].credentials, undefined);
assert.equal(currentSources.sources["account-ops"].storeAccounts[0].session, undefined);
assert.equal(currentSources.sources["account-ops"].emailAliases[0].password, undefined);
assert.equal(currentSources.sources["account-ops"].emailAliases[0].retailerPassword, undefined);
assert.equal(currentSources.sources["account-ops"].emailAliases[0].otp, undefined);
assert.equal(currentSources.sources["account-ops"].emailAliases[0].passphrase, undefined);
assert.equal(currentSources.sources["inbox-order-intelligence"].messageEvents[0].id, "message-event-1");
assert.equal(currentSources.sources["legacy-core-business"].items[0].cardNumber, "TG-001", "TCG card identity must remain recoverable");
assert.equal(currentSources.sources["legacy-core-business"].items[0].paymentCardNumber, undefined, "payment card numbers must never enter backup data");
assert.equal(currentSources.sources["inbox-order-intelligence"].messageEvents[0].accessToken, undefined);
assert.equal(currentSources.sources["inbox-order-intelligence"].messageEvents[0].rawMessageContent, undefined);
assert.equal(currentSources.sources["inbox-order-intelligence"].orderCandidates[0].refreshToken, undefined);
assert.equal(currentSources.sources["bot-operations"].installations[0].accessToken, undefined);
assert.equal(currentSources.sources["bot-operations"].proxyGroups[0].proxyPassword, undefined);
assert.equal(currentSources.sources["bot-operations"].attempts[0].rawProviderPayload, undefined);
assert.equal(currentSources.sources["bot-operations"].checkoutEvidence[0].cvv, undefined);
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
const accountOpsSection = complete.backup.sections.find((section) => section.sourceId === "account-ops");
const inboxOrderSection = complete.backup.sections.find((section) => section.sourceId === "inbox-order-intelligence");
const botOperationsSection = complete.backup.sections.find((section) => section.sourceId === "bot-operations");
assert.equal(dealSection.recordCount, 1);
assert.equal(ownerSection.recordCount, 1);
assert.equal(phase2Section.recordCount, 3);
assert.equal(coreSection.recordCount, 1);
assert.equal(accountOpsSection.recordCount, 8);
assert.equal(inboxOrderSection.recordCount, 4);
assert.equal(botOperationsSection.recordCount, 9);
assert.equal(botOperationsSection.data.installations[0].accessToken, undefined, "bot tokens must never enter backup data");
assert.equal(botOperationsSection.data.proxyGroups[0].proxyPassword, undefined, "proxy credentials must never enter backup data");
assert.equal(botOperationsSection.data.attempts[0].rawProviderPayload, undefined, "raw provider payloads must never enter backup data");
assert.equal(botOperationsSection.data.checkoutEvidence[0].cvv, undefined, "payment security values must never enter backup data");
assert.equal(botOperationsSection.data.checkoutEvidence[0].purchaseCreated, false, "Checkout Evidence must remain distinct from Purchase");
assert.equal(inboxOrderSection.data.messageEvents[0].accessToken, undefined, "provider tokens must be removed from normalized message metadata");
assert.equal(inboxOrderSection.data.messageEvents[0].rawMessageContent, undefined, "raw protected message content must be removed");
assert.equal(inboxOrderSection.data.orderCandidates[0].refreshToken, undefined, "refresh tokens must be removed from Order Candidates");
assert.equal(inboxOrderSection.data.orderCandidates[0].managedReference, undefined, "managed provider-secret references must be removed from backups");
assert.equal(accountOpsSection.data.storeAccounts[0].accessToken, undefined, "Account Ops tokens must be removed");
assert.equal(accountOpsSection.data.storeAccounts[0].cvv, undefined, "Account Ops card-security values must be removed");
assert.equal(accountOpsSection.data.storeAccounts[0].credentials, undefined, "Account Ops credential payloads must be removed");
assert.equal(accountOpsSection.data.storeAccounts[0].session, undefined, "Account Ops sessions must be removed");
assert.equal(accountOpsSection.data.emailAliases[0].password, undefined, "Account Ops plaintext passwords must be removed");
assert.equal(accountOpsSection.data.emailAliases[0].retailerPassword, undefined, "compound Account Ops password fields must be removed");
assert.equal(accountOpsSection.data.emailAliases[0].otp, undefined, "Account Ops OTPs must be removed");
assert.equal(accountOpsSection.data.emailAliases[0].passphrase, undefined, "Account Ops passphrases must be removed");
assert.deepEqual(
  accountOpsSection.data.storeAccounts[0].credentialReference,
  { provider: "EXTERNAL_PASSWORD_MANAGER", referenceId: "vault-reference-1", label: "Example account" },
  "non-secret credential references remain recoverable metadata",
);
assert.equal(coreSection.data.profile, undefined, "identity profile is outside the legacy business allowlist");
assert.equal(coreSection.data.workspaceMembers, undefined, "membership data is outside the legacy business allowlist");
assert.equal(coreSection.data.items[0].accessToken, undefined, "nested security data must be removed");
assert.equal(coreSection.data.items[0].cardNumber, "TG-001", "TCG card identity must remain in the verified backup");
assert.equal(coreSection.data.items[0].paymentCardNumber, undefined, "payment card numbers must remain excluded");
assert.equal(phase2Section.data.userTrustProfile, undefined, "trust/role identity state must be excluded");
assert.equal(phase2Section.data.dealFinderItems[0].sessionId, "deal-session-1", "business workflow session references must remain recoverable");
assert.doesNotMatch(complete.json, /must-not-export/);
assert.doesNotMatch(complete.json, /phase2a-(?:retailer-)?(?:password|otp|passphrase|token|cvv|credentials|session)-must-not-export/);
assert.doesNotMatch(complete.json, /phase2b1-(?:access-token|refresh-token|raw-message)-must-not-export/);
assert.doesNotMatch(complete.json, /phase2b2b-managed-reference-must-not-export/);
assert.doesNotMatch(complete.json, /phase2da-(?:bot-token|proxy-password|cookie)-must-not-export/);
assert.doesNotMatch(complete.json, /phase2da-payment-pan-must-not-export/);
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

const malformedAccountOpsStorage = new MemoryStorage({
  "code3.account-ops.v1": {
    schemaVersion: 1,
    profileGroups: [], profiles: [], emailDomains: [], emailAliases: [], retailers: [], storeAccounts: [], tasks: [],
  },
});
const malformedAccountOpsExport = await createVerifiedBackup({ localStorage: malformedAccountOpsStorage, sessionStorage: new MemoryStorage(), createdAt: NOW });
assert.equal(malformedAccountOpsExport.coverageStatus, BACKUP_COVERAGE.FAILED, "an incomplete Account Ops source cannot be called complete");
assert.equal(malformedAccountOpsExport.verified, false);

const malformedInboxOrderStorage = new MemoryStorage({
  "code3.inbox-order.v1": {
    schemaVersion: 1,
    updatedAt: NOW,
    messageEvents: [inboxOrderRecord("unsafe-message", "NORMALIZED_MESSAGE_EVENT", {
      providerConnectionId: "connection-fixture-1",
      providerEventKey: "connection-fixture-1:unsafe-message",
      sourceHash: "b".repeat(64),
      rawContentRetained: false,
      body: "Raw message bodies are not a recoverable source.",
    })],
    orderCandidates: [],
    candidateEvents: [],
    activity: [],
  },
});
const malformedInboxOrderExport = await createVerifiedBackup({ localStorage: malformedInboxOrderStorage, sessionStorage: new MemoryStorage(), createdAt: NOW });
assert.equal(malformedInboxOrderExport.coverageStatus, BACKUP_COVERAGE.FAILED, "raw message bodies must prevent an inbox/order source from being called complete");
assert.equal(malformedInboxOrderExport.verified, false);

const backupPanelSource = fs.readFileSync(new URL("../src/features/backup/BackupRecoveryPanel.jsx", import.meta.url), "utf8");
assert.match(backupPanelSource, /if \(!result\.verified\)/, "the UI must not download an internally consistent export whose coverage failed");

assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "supabase-owner-data" && !source.includedInPhase1AExport));
assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "authentication-state" && source.containsSecurityOrSessionState));
assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "account-ops" && source.includedInPhase1AExport));
assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "inbox-order-intelligence" && source.includedInPhase1AExport));
assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "bot-operations" && source.includedInPhase1AExport));
assert.equal(BACKUP_SOURCE_REGISTRY.length, 24);
assert.equal(BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport).length, 20);

console.log(`Code 3 backup tests passed (${complete.backup.sections.length} sections, ${complete.backup.coverageSummary.recordCount} records).`);
