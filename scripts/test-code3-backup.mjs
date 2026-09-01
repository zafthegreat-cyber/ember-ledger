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
import { findProhibitedData, sanitizeBackupData } from "../src/features/backup/backupSecurity.js";
import fs from "node:fs";
import { getPhase2dQaFixture } from "../src/features/botOps/fixtures/phase2dQaFixtures.js";
import { createFixtureDraftInput } from "../src/features/purchaseReceiving/fixtures/phase2caFixtures.js";
import {
  createMemoryPurchaseReceivingStorage,
  createPurchaseReceivingService,
  PURCHASE_RECEIVING_STORAGE_KEY,
} from "../src/features/purchaseReceiving/index.js";
import { createInventoryHarness, confirmFixturePurchase, exactDraft, receive } from "./inventory-creation-test-helpers.mjs";
import { FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";

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
let purchaseIdSequence = 0;
const purchaseReceivingStorage = createMemoryPurchaseReceivingStorage();
const purchaseReceivingService = createPurchaseReceivingService({
  storage: purchaseReceivingStorage,
  isOwnerAuthorized: () => true,
  now: () => NOW,
  idFactory: (prefix) => `${prefix}.backup-${purchaseIdSequence += 1}.test`,
});
const createdPurchaseDraft = await purchaseReceivingService.createDraft(createFixtureDraftInput());
const readyPurchaseDraft = await purchaseReceivingService.markDraftReady(createdPurchaseDraft.draft.id, createdPurchaseDraft.draft.recordVersion);
const confirmedPurchase = await purchaseReceivingService.confirmDraft(readyPurchaseDraft.draft.id, { expectedVersion: readyPurchaseDraft.draft.recordVersion });
await purchaseReceivingService.recordReceivingEvent(confirmedPurchase.purchase.id, {
  idempotencyKey: "receiving.backup.test",
  locationReference: "storage.backup.test",
  entries: [{
    lineItemId: confirmedPurchase.purchase.lineItems[0].lineItemId,
    quantityReceived: 1,
    quantityAffected: 1,
    condition: "NEW",
    discrepancy: "NONE",
  }],
});
const purchaseReceivingState = JSON.parse(purchaseReceivingStorage.getItem(PURCHASE_RECEIVING_STORAGE_KEY));
purchaseReceivingState.purchaseDrafts[0].retailerPassword = "phase2ca-retailer-password-must-not-export";
purchaseReceivingState.purchases[0].paymentCardNumber = "phase2ca-card-number-must-not-export";
purchaseReceivingState.receivingEvents[0].rawSourcePayload = { token: "phase2ca-raw-source-must-not-export" };
purchaseReceivingState.inventoryHandoffPreview = { rows: [{ id: "phase2ca-handoff-must-not-export" }] };
purchaseReceivingState.purchaseDrafts[0].pwd = "phase2ca-pwd-must-not-export";
purchaseReceivingState.purchaseDrafts[0].rawBody = "phase2ca-raw-body-must-not-export";
purchaseReceivingState.purchaseDrafts[0].credentialUri = "postgresql://synthetic-user@database.invalid/code3";

const hostileBackupMetadata = {
  pwd: "synthetic-password.invalid",
  nested: { rawBody: "synthetic raw body" },
  connectionHint: "rediss://synthetic-user:synthetic-password@redis.invalid:6379",
  encodedConnectionHint: "https%3A%2F%2Fsynthetic-token%40service.invalid",
  tokenQueryHint: "https://service.invalid/status?access_token=synthetic.invalid",
  encodedTokenQueryHint: "https%3A%2F%2Fservice.invalid%2Fstatus%3Fapi_key%3Dsynthetic.invalid",
  paymentHint: ["4111", "1111", "1111", "1111"].join(" "),
  requestValue: "synthetic raw request",
  myPwd: "synthetic-password.invalid",
  subjectValue: "synthetic-owner-subject.invalid",
  numericPaymentHint: 378282246310005,
  passwordValue: "synthetic.invalid",
  clientSecretValue: "synthetic.invalid",
  apiKeyValue: "synthetic.invalid",
  cardNumberValue: "synthetic.invalid",
  cvvValue: "synthetic.invalid",
  rawBodyValue: "synthetic raw body",
  ownerSubjectValue: "synthetic-owner-subject.invalid",
  ownerIdValue: "synthetic-owner-id.invalid",
  malformedEncodedCredentialHint: "https://service.invalid/?access%5Ftoken=synthetic.invalid%ZZ",
  deeplyEncodedCredentialHint: Array.from({ length: 4 }).reduce((value) => encodeURIComponent(value), "https://service.invalid/?access_token=synthetic.invalid"),
  hyphenatedCredentialHint: "https://service.invalid/?access-token=synthetic.invalid",
  semicolonCredentialHint: "https://service.invalid/?x=1;api-key=synthetic.invalid",
  htmlCredentialHint: "https://service.invalid/?x=1&amp;access_token=synthetic.invalid",
  encryptedPrivateKeyHint: "-----BEGIN ENCRYPTED PRIVATE KEY-----",
  pgpPrivateKeyHint: "-----BEGIN PGP PRIVATE KEY BLOCK-----",
  serializedCredentialHint: JSON.stringify({ [["access", "token"].join("_")]: "synthetic.invalid" }),
  cookieHeaderHint: "Cookie: sessionid=synthetic.invalid",
  setCookieHeaderHint: "Set-Cookie: auth=synthetic.invalid; HttpOnly",
  supabaseSecretHint: ["sb", "secret", "A".repeat(24)].join("_"),
  gitlabTokenHint: ["glpat", "A".repeat(24)].join("-"),
  npmTokenHint: ["npm", "A".repeat(32)].join("_"),
  sendgridTokenHint: ["SG", "A".repeat(16), "B".repeat(24)].join("."),
  clientSecretQueryHint: "https://service.invalid/callback?client_secret=synthetic.invalid",
  oauthStateQueryHint: "https://service.invalid/callback?oauth_state=synthetic.invalid",
  codeVerifierQueryHint: "https://service.invalid/callback?code_verifier=synthetic.invalid",
  pkceVerifierQueryHint: "https://service.invalid/callback?pkce_verifier=synthetic.invalid",
  authorizationCodeQueryHint: "https://service.invalid/callback?authorization_code=synthetic.invalid",
  idTokenQueryHint: "https://service.invalid/callback?id_token=synthetic.invalid",
  signedUrlHint: "https://storage.invalid/file?X-Amz-Credential=synthetic.invalid&X-Amz-Signature=synthetic.invalid",
  signatureUrlHint: "https://storage.invalid/file?signature=synthetic.invalid",
};
assert.equal(findProhibitedData(hostileBackupMetadata).length, 41, "backup scan finds aliases, authority, raw content, credentials, and payment-like values");
const sanitizedHostileBackupMetadata = sanitizeBackupData(hostileBackupMetadata);
assert.deepEqual(Object.keys(sanitizedHostileBackupMetadata.data), ["nested"], "backup sanitization retains only the harmless structural container");
assert.deepEqual(Object.keys(sanitizedHostileBackupMetadata.data.nested), [], "backup sanitization removes the nested raw-content value");
assert.equal(sanitizedHostileBackupMetadata.excludedPaths.length, 41, "backup sanitization reports every excluded hostile path without values");
const safeProductChecksum = sanitizeBackupData({ upc: "4111111111111111", title: "Synthetic card identifier" });
assert.equal(safeProductChecksum.data.upc, "4111111111111111", "allowlisted product checksum identifiers are not mistaken for payment credentials");
const safeNumericProductChecksum = sanitizeBackupData({ upc: 378282246310005, title: "Synthetic numeric product identifier" });
assert.equal(safeNumericProductChecksum.data.upc, 378282246310005, "numeric allowlisted product identifiers remain recoverable");
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
  [PURCHASE_RECEIVING_STORAGE_KEY]: purchaseReceivingState,
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
assert.equal(currentSources.sources["purchase-receiving"].purchaseDrafts[0].retailerPassword, undefined);
assert.equal(currentSources.sources["purchase-receiving"].purchases[0].paymentCardNumber, undefined);
assert.equal(currentSources.sources["purchase-receiving"].receivingEvents[0].rawSourcePayload, undefined);
assert.equal(currentSources.sources["purchase-receiving"].inventoryHandoffPreview, undefined);
assert.equal(currentSources.sources["purchase-receiving"].purchaseDrafts[0].pwd, undefined);
assert.equal(currentSources.sources["purchase-receiving"].purchaseDrafts[0].rawBody, undefined);
assert.equal(currentSources.sources["purchase-receiving"].purchaseDrafts[0].credentialUri, undefined);
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
const purchaseReceivingSection = complete.backup.sections.find((section) => section.sourceId === "purchase-receiving");
assert.equal(dealSection.recordCount, 1);
assert.equal(ownerSection.recordCount, 1);
assert.equal(phase2Section.recordCount, 3);
assert.equal(coreSection.recordCount, 1);
assert.equal(accountOpsSection.recordCount, 8);
assert.equal(inboxOrderSection.recordCount, 4);
assert.equal(botOperationsSection.recordCount, 9);
assert.equal(purchaseReceivingSection.recordCount, 7);
assert.equal(botOperationsSection.data.installations[0].accessToken, undefined, "bot tokens must never enter backup data");
assert.equal(botOperationsSection.data.proxyGroups[0].proxyPassword, undefined, "proxy credentials must never enter backup data");
assert.equal(botOperationsSection.data.attempts[0].rawProviderPayload, undefined, "raw provider payloads must never enter backup data");
assert.equal(botOperationsSection.data.checkoutEvidence[0].cvv, undefined, "payment security values must never enter backup data");
assert.equal(botOperationsSection.data.checkoutEvidence[0].purchaseCreated, false, "Checkout Evidence must remain distinct from Purchase");
assert.equal(purchaseReceivingSection.data.purchaseDrafts[0].automaticPurchaseCreationAllowed, false, "Purchase Draft must remain distinct from Purchase");
assert.equal(purchaseReceivingSection.data.purchases[0].inventoryCreated, false, "Purchase must remain distinct from received Inventory");
assert.equal(purchaseReceivingSection.data.receivingEvents[0].createsInventory, false, "Receiving must not create Inventory");
assert.equal(purchaseReceivingSection.data.purchaseDrafts[0].retailerPassword, undefined, "retailer credentials must not enter Purchase backups");
assert.equal(purchaseReceivingSection.data.purchases[0].paymentCardNumber, undefined, "payment credentials must not enter Purchase backups");
assert.equal(purchaseReceivingSection.data.receivingEvents[0].rawSourcePayload, undefined, "raw evidence must not enter Purchase backups");
assert.equal(purchaseReceivingSection.data.inventoryHandoffPreview, undefined, "derived Inventory Handoff Preview must not become a backup source");
assert.equal(purchaseReceivingSection.data.purchaseDrafts[0].pwd, undefined, "password aliases must not enter Purchase backups");
assert.equal(purchaseReceivingSection.data.purchaseDrafts[0].rawBody, undefined, "raw source aliases must not enter Purchase backups");
assert.equal(purchaseReceivingSection.data.purchaseDrafts[0].credentialUri, undefined, "credential-bearing URI values must not enter Purchase backups");
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
assert.doesNotMatch(complete.json, /phase2ca-(?:retailer-password|card-number|raw-source|handoff)-must-not-export/);
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

const managedInventoryHarness = createInventoryHarness();
const managedInventoryPurchase = await confirmFixturePurchase(managedInventoryHarness.service, exactDraft({ id: "backup-managed-sale", totalMinorUnits: 1000 }));
await receive(managedInventoryHarness.service, managedInventoryPurchase, { condition: "SEALED", id: "backup-managed-sale" });
const managedInventoryCandidate = managedInventoryHarness.service.previewInventoryCreation(managedInventoryPurchase.id)[0];
const managedInventoryResult = await managedInventoryHarness.service.confirmInventoryCreation(managedInventoryCandidate.candidateId, { expectedVersion: managedInventoryCandidate.expectedVersion });
const tamperedManagedInventoryState = JSON.parse(managedInventoryHarness.inventoryStorage.getItem(FLIP_SCOUT_STORAGE_KEY));
tamperedManagedInventoryState.sales.push({
  id: "sale.backup-wrong-exact-cost.test",
  inventoryItemId: managedInventoryResult.inventoryItem.id,
  quantitySold: 1,
  status: "Completed",
  inventoryAllocationSequence: 1,
  inventoryAllocationAt: NOW,
  allocatedCostOfGoodsSoldMinorUnits: 999,
  allocatedCostOfGoodsSold: 9.99,
  costAuthority: "INTEGER_MINOR_UNITS",
});
const tamperedManagedInventoryExport = await createVerifiedBackup({
  localStorage: new MemoryStorage({ [FLIP_SCOUT_STORAGE_KEY]: tamperedManagedInventoryState }),
  sessionStorage: new MemoryStorage(),
  createdAt: NOW,
});
assert.equal(tamperedManagedInventoryExport.coverageStatus, BACKUP_COVERAGE.FAILED, "backup validation rejects wrong exact COGS linked to owner-confirmed Inventory");
assert.equal(tamperedManagedInventoryExport.verified, false);

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
assert.ok(BACKUP_SOURCE_REGISTRY.some((source) => source.sourceId === "purchase-receiving" && source.includedInPhase1AExport));
assert.equal(BACKUP_SOURCE_REGISTRY.length, 25);
assert.equal(BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport).length, 21);

console.log(`Code 3 backup tests passed (${complete.backup.sections.length} sections, ${complete.backup.coverageSummary.recordCount} records).`);
