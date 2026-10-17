import { getPhase2aQaFixture } from "../../fixtures/phase2aQaFixtures.js";
import { normalizeAccountOpsState } from "../../repository.js";
import {
  CAPTCHA_CHALLENGE_STATES,
  EXPORT_READINESS_STATES,
  EXPORT_SCHEMA_STATES,
  PHONE_RESOURCE_STATES,
  PROXY_GROUP_HEALTH_STATES,
  SERVER_STATES,
  UNIFIED_ORDER_STATES,
  VERIFICATION_ACTION_KINDS,
  VERIFICATION_ACTION_STATES,
} from "../constants.js";
import { normalizeAccountOpsOperationsSnapshot } from "../contracts.js";

export const PHASE_2A6A_QA_NOW = "2026-09-02T16:00:00.000Z";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function record(id, overrides = {}) { return { id, recordVersion: 1, updatedAt: PHASE_2A6A_QA_NOW, ...overrides }; }

function baseAccountOps() {
  return clone(getPhase2aQaFixture("healthy-profile-account").state);
}

function phone(overrides = {}) {
  return record("phone-resource:synthetic-01", { providerLabel: "Synthetic provider metadata", label: "Synthetic SMS resource 01", region: "US test region", retailerIds: ["retailer-preset:target"], accountIds: ["storeAccounts:target-business-01"], availability: PHONE_RESOURCE_STATES.ASSIGNED, verificationState: "VERIFIED", expiresAt: "2026-10-01T00:00:00.000Z", lastUsedAt: "2026-09-01T12:00:00.000Z", warnings: [], ...overrides });
}

function card(overrides = {}) {
  return record("payment-metadata:synthetic-01", { cardAlias: "Synthetic card reference", providerLabel: "Synthetic issuer metadata", last4: "0007", expirationMonth: 12, expirationYear: 2030, status: "ASSIGNED", profileId: "profile:business-01", retailerId: "retailer-preset:target", accountId: "storeAccounts:target-business-01", spendingLimitMinor: 25_000, currency: "USD", warnings: [], ...overrides });
}

function proxy(overrides = {}) {
  return record("proxy-view:synthetic-01", { groupLabel: "Synthetic residential group", providerLabel: "Synthetic provider metadata", proxyType: "RESIDENTIAL", region: "US test region", count: 25, health: PROXY_GROUP_HEALTH_STATES.HEALTHY, latencyMs: 125, assignments: ["Provider readiness review"], expiresAt: "2026-10-15T00:00:00.000Z", warnings: [], ...overrides });
}

function verification(overrides = {}) {
  return record("verification:synthetic-01", { kind: VERIFICATION_ACTION_KINDS.MFA, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED, challengeState: CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE, retailerId: "retailer-preset:walmart", accountId: "storeAccounts:target-business-01", workflowLabel: "Synthetic MFA review", createdAt: "2026-09-02T15:00:00.000Z", expiresAt: "2026-09-02T17:00:00.000Z", safeInstruction: "Complete the retailer prompt directly; Code 3 does not retain a verification value.", resumeAllowed: false, warnings: [], ...overrides });
}

function exportReadiness(provider, overrides = {}) {
  return record(`export-readiness:${provider.toLowerCase()}`, { provider, readinessState: EXPORT_READINESS_STATES.NOT_READY, supportedExportTypes: [], schemaState: EXPORT_SCHEMA_STATES.UNVERIFIED, profilesReady: 1, accountsReady: 1, proxiesReady: 0, productReadiness: "NOT_REVIEWED", warnings: ["No verified provider export schema is available."], compatibilityNote: "Local readiness metadata only; no provider connection or export action exists.", ...overrides });
}

function server(overrides = {}) {
  return record("server:synthetic-01", { friendlyName: "Synthetic automation host", providerLabel: "Synthetic cloud metadata", region: "Test region", osLabel: "Windows Server (label only)", purpose: "Future owner-managed automation", status: SERVER_STATES.OFFLINE, lastSeenAt: "2026-09-01T10:00:00.000Z", cpuSummary: "Not connected", memorySummary: "Not connected", estimatedCostMinor: 4_500, currency: "USD", assignedBots: [], remoteAccessMethod: "RDP (future)", warnings: ["No live server connection exists."], ...overrides });
}

function order(overrides = {}) {
  return record("order-view:synthetic-01", { retailerId: "retailer-preset:target", accountId: "storeAccounts:target-business-01", orderCandidateId: "order-candidate:synthetic-01", purchaseId: "purchase:synthetic-01", shipmentReferences: ["shipment-ref:synthetic-01"], receivingStatus: "NOT_RECEIVED", inventoryStatus: "NOT_CREATED", status: UNIFIED_ORDER_STATES.SHIPPED, externalOrderReference: "SYNTHETIC-ORDER-01", warnings: [], ...overrides });
}

function workspaceReference(id, referenceType, sourceReference, label, detail, attentionPriority = null) {
  return record(id, { referenceType, sourceReference, label, detail, area: "activity", attentionPriority, warnings: [] });
}

function baseOperations() {
  return {
    accountCreationPlans: [], phoneResources: [], paymentCards: [], verificationActions: [], proxyGroupViews: [], exportReadiness: [], webhookIntegrations: [], serverRecords: [], remoteAccessRecords: [], browserWorkspaces: [], orderViews: [], notificationPreferences: [], workspaceReferences: [],
  };
}

function mutateAccount(accountOps, patch) {
  accountOps.storeAccounts[0] = { ...accountOps.storeAccounts[0], ...patch, updatedAt: PHASE_2A6A_QA_NOW };
}

function buildFixture(id) {
  const accountOps = baseAccountOps();
  const operations = baseOperations();
  let rejectionInput = null;
  switch (id) {
    case "healthy-target-account": break;
    case "walmart-awaiting-mfa": mutateAccount(accountOps, { retailerId: "retailer-preset:walmart", status: "NEEDS_VERIFICATION", securityStatus: "MFA_REQUIRED", ownerConfirmedReadyAt: null }); break;
    case "captcha-required": mutateAccount(accountOps, { status: "NEEDS_VERIFICATION", securityStatus: "CAPTCHA_REQUIRED", ownerConfirmedReadyAt: null }); break;
    case "locked-account": mutateAccount(accountOps, { status: "LOCKED", securityStatus: "LOCKED", ownerConfirmedReadyAt: null }); break;
    case "disabled-account": mutateAccount(accountOps, { status: "DISABLED", ownerConfirmedReadyAt: null }); break;
    case "unverified-email": mutateAccount(accountOps, { status: "NEEDS_VERIFICATION", emailVerificationStatus: "PENDING", ownerConfirmedReadyAt: null }); break;
    case "unverified-phone": mutateAccount(accountOps, { status: "NEEDS_VERIFICATION", phoneVerificationRequired: true, phoneVerificationStatus: "PENDING", ownerConfirmedReadyAt: null }); break;
    case "expiring-sms-resource": operations.phoneResources.push(phone({ availability: PHONE_RESOURCE_STATES.NEEDS_ATTENTION, expiresAt: "2026-09-03T00:00:00.000Z", warnings: ["Synthetic resource expires soon."] })); break;
    case "available-phone": operations.phoneResources.push(phone({ availability: PHONE_RESOURCE_STATES.AVAILABLE, accountIds: [], retailerIds: [], verificationState: "UNKNOWN", lastUsedAt: null })); break;
    case "profile-missing-phone": operations.accountCreationPlans.push(record("creation-plan:missing-phone", { retailerId: "retailer-preset:target", accountLabel: "Synthetic profile missing phone", emailReference: "emailAliases:target-business-01", phoneReference: null, shippingProfileId: "profile:business-01", billingProfileId: "profile:business-01", credentialReference: null, creationState: "DRAFT", verificationRequirements: ["SMS"], warnings: ["Phone reference required before owner-led signup."], provenance: "SYNTHETIC_FIXTURE" })); break;
    case "profile-missing-email": operations.accountCreationPlans.push(record("creation-plan:missing-email", { retailerId: "retailer-preset:walmart", accountLabel: "Synthetic profile missing email", emailReference: null, phoneReference: "phone-resource:synthetic-01", shippingProfileId: "profile:business-01", billingProfileId: "profile:business-01", credentialReference: null, creationState: "DRAFT", verificationRequirements: ["EMAIL"], warnings: ["Email reference required before owner-led signup."], provenance: "SYNTHETIC_FIXTURE" })); break;
    case "virtual-card-metadata": operations.paymentCards.push(card()); break;
    case "proxy-group-healthy": operations.proxyGroupViews.push(proxy()); break;
    case "proxy-group-degraded": operations.proxyGroupViews.push(proxy({ health: PROXY_GROUP_HEALTH_STATES.DEGRADED, latencyMs: 850, warnings: ["Recorded latency needs review; no live check occurred."] })); break;
    case "stellar-export-not-ready": operations.exportReadiness.push(exportReadiness("STELLAR", { warnings: ["Stellar remains NOT_CONFIGURED; its inbound offline preview is not an export capability."] })); break;
    case "hayha-export-under-review": operations.exportReadiness.push(exportReadiness("HAYHA", { readinessState: EXPORT_READINESS_STATES.REVIEW_REQUIRED, warnings: ["Compatibility requires separate evidence review."], compatibilityNote: "No verified schema; review metadata only." })); break;
    case "server-offline": operations.serverRecords.push(server()); break;
    case "server-degraded": operations.serverRecords.push(server({ status: SERVER_STATES.DEGRADED, warnings: ["Synthetic health metadata needs review."] })); break;
    case "order-shipped": operations.orderViews.push(order()); break;
    case "order-partially-shipped": operations.orderViews.push(order({ status: UNIFIED_ORDER_STATES.PARTIALLY_SHIPPED, shipmentReferences: ["shipment-ref:synthetic-01", "shipment-ref:synthetic-02"] })); break;
    case "order-return-pending": operations.orderViews.push(order({ status: UNIFIED_ORDER_STATES.RETURN_STARTED, receivingStatus: "PARTIALLY_RECEIVED", inventoryStatus: "REVIEW_REQUIRED", warnings: ["Physical return and refund remain separate facts."] })); break;
    case "verification-expired": operations.verificationActions.push(verification({ state: VERIFICATION_ACTION_STATES.EXPIRED, expiresAt: "2026-09-01T00:00:00.000Z" })); break;
    case "duplicate-account-warning": accountOps.storeAccounts.push({ ...clone(accountOps.storeAccounts[0]), id: "storeAccounts:target-business-duplicate", accountDisplayName: "Business 01 duplicate", recordVersion: 1, createdAt: PHASE_2A6A_QA_NOW, updatedAt: PHASE_2A6A_QA_NOW }); break;
    case "attention-center-mixed": mutateAccount(accountOps, { status: "LOCKED", securityStatus: "LOCKED", ownerConfirmedReadyAt: null }); operations.verificationActions.push(verification()); operations.proxyGroupViews.push(proxy({ health: PROXY_GROUP_HEALTH_STATES.DEGRADED })); operations.serverRecords.push(server()); operations.orderViews.push(order({ status: UNIFIED_ORDER_STATES.RETURN_STARTED })); operations.workspaceReferences.push(workspaceReference("workspace-reference:receiving-review", "RECEIVING_DISCREPANCY", "receiving-event:synthetic-review", "Receiving discrepancy", "Synthetic received quantity needs owner review.", "HIGH"), workspaceReference("workspace-reference:accountant-review", "ACCOUNTANT_REVIEW", "accountant-review:synthetic-review", "Accountant review item", "Synthetic prior-period projection needs owner review.", "NORMAL"), workspaceReference("workspace-reference:inventory-search", "INVENTORY", "inventory:synthetic-search", "Synthetic sealed inventory", "Existing canonical Inventory relationship.")); break;
    case "webhook-hub-foundation": operations.webhookIntegrations.push(record("webhook:synthetic-01", { providerLabel: "Synthetic event source", direction: "INBOUND", eventTypes: ["ACCOUNT_HEALTH_METADATA"], enabled: false, lastEventAt: null, health: "NOT_CONFIGURED", warnings: ["No endpoint or secret is configured."] })); break;
    case "cloud-template-foundation": break;
    case "remote-session-closed": operations.serverRecords.push(server()); operations.remoteAccessRecords.push(record("remote-access:synthetic-01", { serverId: "server:synthetic-01", accessType: "RDP", state: "CLOSED", lastConnectedAt: null, operatorLabel: "Owner", warnings: ["Connection controls are unavailable."], connectionEnabled: false })); break;
    case "browser-session-safe": operations.browserWorkspaces.push(record("browser-workspace:synthetic-01", { profileId: "profile:business-01", retailerId: "retailer-preset:target", accountId: "storeAccounts:target-business-01", state: "CLOSED", tabCount: 0, extensionLabels: ["Approved extension metadata"], autofillProfileId: "profile:business-01", lastActiveAt: null, warnings: ["No cookies or fingerprint data are retained."], antiDetectionEnabled: false })); break;
    case "notification-preferences": operations.notificationPreferences.push(record("notification-preference:verification", { category: "VERIFICATION", channelPreferences: { IN_APP: true, PUSH: false, EMAIL: false, WEBHOOK: false }, warnings: ["No live delivery channel is configured."] })); break;
    case "sms-waiting-for-verification": operations.phoneResources.push(phone({ availability: PHONE_RESOURCE_STATES.WAITING_FOR_VERIFICATION, verificationState: "PENDING" })); break;
    case "captcha-challenge-open": operations.verificationActions.push(verification({ kind: VERIFICATION_ACTION_KINDS.CAPTCHA, challengeState: CAPTCHA_CHALLENGE_STATES.CHALLENGE_OPEN, workflowLabel: "Synthetic human verification", safeInstruction: "Complete the challenge directly in the retailer interface.", resumeAllowed: false })); break;
    case "verification-cancelled": operations.verificationActions.push(verification({ state: VERIFICATION_ACTION_STATES.CANCELLED })); break;
    case "unified-order-refunded": operations.orderViews.push(order({ status: UNIFIED_ORDER_STATES.REFUNDED, receivingStatus: "FULLY_RECEIVED", inventoryStatus: "UNCHANGED", warnings: ["Refund does not remove Inventory."] })); break;
    case "secret-bearing-payload-rejection": rejectionInput = { ...baseOperations(), serverRecords: [record("server:rejected", { friendlyName: "Rejected fixture", accessToken: "[synthetic-redacted]" })] }; break;
    default: throw new Error(`Unknown Phase 2A.6-A fixture: ${id}`);
  }
  const normalizedAccountOps = normalizeAccountOpsState(accountOps, { now: () => PHASE_2A6A_QA_NOW });
  return {
    accountOps: normalizedAccountOps,
    operations: rejectionInput ? null : normalizeAccountOpsOperationsSnapshot(operations),
    rejectionInput,
  };
}

const DEFINITIONS = Object.freeze([
  ["healthy-target-account", "Healthy Target account"],
  ["walmart-awaiting-mfa", "Walmart account awaiting MFA"],
  ["captcha-required", "CAPTCHA required"],
  ["locked-account", "Locked account"],
  ["disabled-account", "Disabled account"],
  ["unverified-email", "Unverified email"],
  ["unverified-phone", "Unverified phone"],
  ["expiring-sms-resource", "Expiring SMS resource"],
  ["available-phone", "Available phone resource"],
  ["profile-missing-phone", "Profile missing phone reference"],
  ["profile-missing-email", "Profile missing email reference"],
  ["virtual-card-metadata", "Virtual card metadata"],
  ["proxy-group-healthy", "Healthy proxy group"],
  ["proxy-group-degraded", "Degraded proxy group"],
  ["stellar-export-not-ready", "Stellar export not ready"],
  ["hayha-export-under-review", "Hayha export under review"],
  ["server-offline", "Server offline"],
  ["server-degraded", "Server degraded"],
  ["order-shipped", "Order shipped"],
  ["order-partially-shipped", "Order partially shipped"],
  ["order-return-pending", "Order return pending"],
  ["verification-expired", "Verification expired"],
  ["duplicate-account-warning", "Duplicate account warning"],
  ["attention-center-mixed", "Mixed attention priorities"],
  ["webhook-hub-foundation", "Webhook Hub foundation"],
  ["cloud-template-foundation", "Cloud template foundation"],
  ["remote-session-closed", "Remote session closed"],
  ["browser-session-safe", "Browser session safe metadata"],
  ["notification-preferences", "Notification preferences"],
  ["sms-waiting-for-verification", "SMS awaiting verification"],
  ["captcha-challenge-open", "CAPTCHA challenge open"],
  ["verification-cancelled", "Verification cancelled"],
  ["unified-order-refunded", "Unified order refunded"],
  ["secret-bearing-payload-rejection", "Secret-bearing payload rejected"],
]);

export const PHASE_2A6A_QA_FIXTURES = Object.freeze(DEFINITIONS.map(([id, title]) => Object.freeze({ id, title, expectsRejection: id === "secret-bearing-payload-rejection" })));

export function getPhase2a6aQaFixture(id) {
  const definition = PHASE_2A6A_QA_FIXTURES.find((fixture) => fixture.id === id);
  if (!definition) throw new Error(`Unknown Phase 2A.6-A fixture: ${String(id)}.`);
  return { ...definition, ...buildFixture(id) };
}
