import assert from "node:assert/strict";
import { accountOpsStatusTone } from "../src/features/accountOps/operationsFoundation/presentation.js";
import {
  ACCOUNT_CREATION_STATES,
  ACCOUNT_HEALTH_CENTER_STATES,
  ACCOUNT_OPS_AUTOMATION_BOUNDARIES,
  ACCOUNT_OPS_CLOUD_TEMPLATES,
  ACCOUNT_OPS_OPERATING_AREAS,
  ACCOUNT_OPS_OPERATIONS_COLLECTIONS,
  ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION,
  ACCOUNT_OPS_PROVIDER_EXPORTS,
  ACCOUNT_SETUP_STAGES,
  ATTENTION_PRIORITIES,
  BROWSER_WORKSPACE_STATES,
  CAPTCHA_CHALLENGE_STATES,
  EXPORT_READINESS_STATES,
  EXPORT_SCHEMA_STATES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  PAYMENT_METADATA_STATES,
  PHONE_RESOURCE_STATES,
  PROXY_GROUP_HEALTH_STATES,
  REMOTE_ACCESS_STATES,
  SERVER_STATES,
  STORE_ACCOUNT_STATUSES,
  UNIFIED_ORDER_STATES,
  VERIFICATION_ACTION_KINDS,
  VERIFICATION_ACTION_STATES,
  VERIFICATION_STATES,
  WEBHOOK_DIRECTIONS,
  WEBHOOK_HEALTH_STATES,
  WORKSPACE_REFERENCE_TYPES,
  AccountOpsOperationsValidationError,
  assertOperationsSnapshotIsEphemeral,
  buildAttentionCenter,
  createAccountOpsOperationsViewModel,
  createEmptyAccountOpsOperationsSnapshot,
  deriveAccountCreationPlans,
  deriveAccountHealthCenter,
  deriveDefaultExportReadiness,
  deriveProfileCompatibilityViews,
  deriveVerificationInbox,
  detectAccountConflicts,
  normalizeAccountCreationPlan,
  normalizeAccountOpsOperationsSnapshot,
  normalizeAttentionPriority,
  normalizeBrowserWorkspace,
  normalizeCloudTemplate,
  normalizeExportReadiness,
  normalizeNotificationPreference,
  normalizePaymentCardMetadata,
  normalizePhoneResource,
  normalizeProxyGroupView,
  normalizeRemoteAccessRecord,
  normalizeServerRecord,
  normalizeUnifiedOrderView,
  normalizeVerificationAction,
  normalizeWebhookIntegration,
  normalizeWorkspaceReference,
  searchAccountOpsOperations,
} from "../src/features/accountOps/index.js";
import { getPhase2a6aQaFixture } from "../src/features/accountOps/operationsFoundation/fixtures/index.js";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const deepEqual = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const throws = (fn, predicate, message) => { assert.throws(fn, predicate, message); assertions += 1; };

function deepFrozen(value, message) {
  const seen = new Set();
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    assert.equal(Object.isFrozen(current), true, `${message}: nested value must be frozen`);
    assertions += 1;
    stack.push(...Object.values(current));
  }
}

const NOW = "2026-09-02T16:00:00.000Z";
const meta = (id) => ({ id, recordVersion: 1, updatedAt: NOW });

const planInput = {
  ...meta("creation-plan:synthetic-target"),
  retailerId: "retailer-preset:target",
  accountLabel: "Synthetic Target account",
  emailReference: "emailAliases:synthetic-target",
  phoneReference: "phone-resource:synthetic-01",
  shippingProfileId: "profile:synthetic-01",
  billingProfileId: "profile:synthetic-01",
  credentialReference: { provider: "EXTERNAL_PASSWORD_MANAGER", referenceId: "vault:item-synthetic", label: "External vault reference", status: "AVAILABLE" },
  creationState: ACCOUNT_CREATION_STATES.WAITING_FOR_TERMS,
  verificationRequirements: ["TERMS"],
  warnings: ["Owner action is required."],
  provenance: "SYNTHETIC_TEST",
};
const phoneInput = {
  ...meta("phone-resource:synthetic-01"), providerLabel: "Synthetic SMS metadata", label: "SMS reference 01", region: "US test region",
  retailerIds: ["retailer-preset:target"], accountIds: ["storeAccounts:synthetic-target"], availability: PHONE_RESOURCE_STATES.ASSIGNED,
  verificationState: "VERIFIED", expiresAt: "2026-10-01T00:00:00.000Z", lastUsedAt: "2026-09-01T00:00:00.000Z", warnings: [],
};
const paymentInput = {
  ...meta("payment-metadata:synthetic-01"), cardAlias: "Purchasing reference", providerLabel: "Synthetic issuer metadata", last4: "0007",
  expirationMonth: 12, expirationYear: 2030, status: PAYMENT_METADATA_STATES.ASSIGNED, profileId: "profile:synthetic-01",
  retailerId: "retailer-preset:target", accountId: "storeAccounts:synthetic-target", spendingLimitMinor: 25_000, currency: "USD", warnings: [],
};
const verificationInput = {
  ...meta("verification:synthetic-captcha"), kind: VERIFICATION_ACTION_KINDS.CAPTCHA, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED,
  challengeState: CAPTCHA_CHALLENGE_STATES.WAITING_FOR_USER, retailerId: "retailer-preset:target", accountId: "storeAccounts:synthetic-target",
  workflowLabel: "Human verification challenge", createdAt: NOW, expiresAt: "2026-09-02T17:00:00.000Z",
  safeInstruction: "Complete the challenge directly in the retailer interface.", resumeAllowed: false, warnings: [],
};
const proxyInput = {
  ...meta("proxy-view:synthetic-01"), groupLabel: "Synthetic proxy group", providerLabel: "Synthetic provider metadata", proxyType: "ISP",
  region: "US test region", count: 12, health: PROXY_GROUP_HEALTH_STATES.DEGRADED, latencyMs: 450,
  assignments: ["Provider readiness review"], expiresAt: "2026-10-01T00:00:00.000Z", warnings: ["Metadata needs review."],
};
const exportInput = {
  ...meta("export-readiness:stellar"), provider: "STELLAR", readinessState: EXPORT_READINESS_STATES.READY_FOR_PREVIEW,
  supportedExportTypes: ["OFFLINE_PREVIEW"], schemaState: EXPORT_SCHEMA_STATES.PARTIALLY_VERIFIED, profilesReady: 1, accountsReady: 1,
  proxiesReady: 0, productReadiness: "REVIEW_REQUIRED", warnings: ["No direct provider export exists."], compatibilityNote: "Preview metadata only.",
};
const webhookInput = {
  ...meta("webhook:synthetic-01"), providerLabel: "Synthetic event source", direction: WEBHOOK_DIRECTIONS.INBOUND,
  eventTypes: ["ACCOUNT_HEALTH_METADATA"], enabled: false, lastEventAt: null, health: WEBHOOK_HEALTH_STATES.NOT_CONFIGURED,
  warnings: ["No endpoint is configured."],
};
const serverInput = {
  ...meta("server:synthetic-01"), friendlyName: "Synthetic automation host", providerLabel: "Synthetic cloud metadata", region: "Test region",
  osLabel: "Windows (label only)", purpose: "Future owner-managed automation", status: SERVER_STATES.OFFLINE, lastSeenAt: null,
  cpuSummary: "Not connected", memorySummary: "Not connected", estimatedCostMinor: 4_500, currency: "USD", assignedBots: [],
  remoteAccessMethod: "RDP (future)", warnings: ["No live connection exists."],
};
const cloudInput = {
  ...meta("cloud-template:synthetic-monitor"), templateLabel: "Synthetic monitor", providerLabel: "Not selected", region: "Not selected",
  sizeClass: "TO_BE_SELECTED", estimatedCostMinor: null, currency: "USD", diskGb: null, purpose: "Future lightweight monitor",
  recommendedBotCapacity: null, provisioningEnabled: false, warnings: [],
};
const remoteInput = {
  ...meta("remote-access:synthetic-01"), serverId: "server:synthetic-01", accessType: "RDP", state: REMOTE_ACCESS_STATES.CLOSED,
  lastConnectedAt: null, operatorLabel: "Owner", warnings: ["Connection controls are unavailable."], connectionEnabled: false,
};
const browserInput = {
  ...meta("browser-workspace:synthetic-01"), profileId: "profile:synthetic-01", retailerId: "retailer-preset:target",
  accountId: "storeAccounts:synthetic-target", state: BROWSER_WORKSPACE_STATES.CLOSED, tabCount: 0,
  extensionLabels: ["Approved extension metadata"], autofillProfileId: "profile:synthetic-01", lastActiveAt: null,
  warnings: ["No browser state is retained."], antiDetectionEnabled: false,
};
const orderInput = {
  ...meta("order-view:synthetic-01"), retailerId: "retailer-preset:target", accountId: "storeAccounts:synthetic-target",
  orderCandidateId: "order-candidate:synthetic-01", purchaseId: "purchase:synthetic-01", shipmentReferences: ["shipment-ref:synthetic-01"],
  receivingStatus: "NOT_RECEIVED", inventoryStatus: "NOT_CREATED", status: UNIFIED_ORDER_STATES.SHIPPED,
  externalOrderReference: "SYNTHETIC-ORDER-01", warnings: [],
};
const notificationInput = {
  ...meta("notification-preference:verification"), category: "VERIFICATION",
  channelPreferences: { IN_APP: true, PUSH: false, EMAIL: false, WEBHOOK: false }, warnings: ["No live delivery is configured."],
};
const workspaceReferenceInput = {
  ...meta("workspace-reference:synthetic-purchase"), referenceType: WORKSPACE_REFERENCE_TYPES.PURCHASE,
  sourceReference: "purchase:synthetic-01", label: "Synthetic Purchase relationship", detail: "Review canonical Purchase metadata.",
  area: "orders", attentionPriority: ATTENTION_PRIORITIES.NORMAL, warnings: [],
};

equal(ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION, "code3.account-ops.operations-foundation.v1", "contract version is explicit");
deepEqual(ACCOUNT_OPS_OPERATIONS_COLLECTIONS, ["accountCreationPlans", "phoneResources", "paymentCards", "verificationActions", "proxyGroupViews", "exportReadiness", "webhookIntegrations", "serverRecords", "cloudTemplates", "remoteAccessRecords", "browserWorkspaces", "orderViews", "notificationPreferences", "workspaceReferences"], "all bounded model collections are registered");
deepEqual(ACCOUNT_OPS_OPERATING_AREAS.map((area) => area.key), ["overview", "accounts", "identity", "payment", "network", "verification", "automation", "orders", "infrastructure", "activity"], "one coherent information architecture is exported");
deepEqual(Object.values(ACCOUNT_CREATION_STATES), ["DRAFT", "READY", "SIGNUP_OPEN", "WAITING_FOR_CAPTCHA", "WAITING_FOR_MFA", "WAITING_FOR_EMAIL", "WAITING_FOR_SMS", "WAITING_FOR_TERMS", "VERIFYING", "ACTIVE", "NEEDS_ATTENTION", "FAILED", "DISABLED"], "account-creation lifecycle is complete");
deepEqual(Object.values(ACCOUNT_HEALTH_CENTER_STATES), ["HEALTHY", "NEEDS_VERIFICATION", "PASSWORD_RESET_REQUIRED", "EMAIL_UNVERIFIED", "PHONE_UNVERIFIED", "MFA_REQUIRED", "CAPTCHA_REQUIRED", "LOCKED", "DISABLED", "UNKNOWN"], "account-health states are explicit");
deepEqual(Object.values(VERIFICATION_ACTION_KINDS), ["CAPTCHA", "MFA", "EMAIL_VERIFICATION", "SMS_VERIFICATION", "SECURITY_PROMPT", "TERMS", "PASSWORD_RESET"], "verification kinds remain human-action categories");
deepEqual(Object.values(VERIFICATION_ACTION_STATES), ["ACTION_REQUIRED", "WAITING", "COMPLETED", "FAILED", "EXPIRED", "CANCELLED"], "verification lifecycle is bounded");
deepEqual(Object.values(CAPTCHA_CHALLENGE_STATES), ["CAPTCHA_REQUIRED", "WAITING_FOR_USER", "CHALLENGE_OPEN", "SOLVED", "FAILED", "EXPIRED", "CANCELLED", "NOT_APPLICABLE"], "CAPTCHA review states are complete");
deepEqual(Object.values(PHONE_RESOURCE_STATES), ["AVAILABLE", "ASSIGNED", "WAITING_FOR_VERIFICATION", "VERIFIED", "EXPIRED", "RELEASED", "NEEDS_ATTENTION"], "phone metadata states are bounded");
deepEqual(Object.values(PAYMENT_METADATA_STATES), ["AVAILABLE", "ASSIGNED", "PAUSED", "EXPIRED", "CLOSED", "UNKNOWN"], "payment metadata states are bounded");
deepEqual(Object.values(PROXY_GROUP_HEALTH_STATES), ["HEALTHY", "DEGRADED", "EXPIRED", "UNKNOWN"], "proxy metadata states are bounded");
deepEqual(Object.values(EXPORT_READINESS_STATES), ["NOT_READY", "REVIEW_REQUIRED", "PARTIALLY_SUPPORTED", "READY_FOR_PREVIEW", "UNSUPPORTED"], "export-readiness states exclude live export");
deepEqual(Object.values(EXPORT_SCHEMA_STATES), ["UNVERIFIED", "PARTIALLY_VERIFIED", "VERIFIED", "UNSUPPORTED"], "schema evidence is separate from readiness");
deepEqual(Object.values(UNIFIED_ORDER_STATES), ["ORDERED", "PROCESSING", "READY_FOR_PICKUP", "SHIPPED", "PARTIALLY_SHIPPED", "DELIVERED", "CANCELLED", "RETURN_STARTED", "RETURNED", "REFUNDED", "PARTIALLY_REFUNDED", "UNKNOWN"], "unified order states are read-only relationship states");
deepEqual(Object.values(WEBHOOK_DIRECTIONS), ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"], "webhook directions are metadata only");
deepEqual(Object.values(WEBHOOK_HEALTH_STATES), ["NOT_CONFIGURED", "HEALTHY", "DEGRADED", "DISABLED", "UNKNOWN"], "webhook health is bounded");
deepEqual(Object.values(SERVER_STATES), ["OFFLINE", "ONLINE", "DEGRADED", "STARTING", "STOPPING", "UNKNOWN"], "server states are metadata only");
deepEqual(Object.values(REMOTE_ACCESS_STATES), ["CLOSED", "AVAILABLE", "CONNECTING", "ACTIVE", "DEGRADED", "UNKNOWN"], "remote-access states are explicit");
deepEqual(Object.values(BROWSER_WORKSPACE_STATES), ["CLOSED", "OPEN", "PAUSED", "NEEDS_ATTENTION", "UNKNOWN"], "browser workspace states are explicit");
deepEqual(Object.values(ATTENTION_PRIORITIES), ["CRITICAL", "HIGH", "NORMAL", "INFO"], "attention priorities are bounded");
deepEqual(NOTIFICATION_CATEGORIES, ["VERIFICATION", "ACCOUNTS", "BOTS", "ORDERS", "SERVERS", "BUSINESS"], "notification categories are bounded");
deepEqual(NOTIFICATION_CHANNELS, ["IN_APP", "PUSH", "EMAIL", "WEBHOOK"], "future notification channels are metadata only");
deepEqual(Object.values(WORKSPACE_REFERENCE_TYPES), ["BOT", "BOT_TASK", "PURCHASE", "INVENTORY", "RECEIVING_DISCREPANCY", "ACCOUNTANT_REVIEW"], "cross-workspace references are explicitly bounded");
equal(ACCOUNT_OPS_PROVIDER_EXPORTS.length, 5, "five provider-readiness definitions exist");
deepEqual(ACCOUNT_OPS_PROVIDER_EXPORTS.map((row) => row.provider), ["STELLAR", "HAYHA", "SHIKARI", "VALOR", "REFRACT"], "provider list is explicit");
ok(ACCOUNT_OPS_PROVIDER_EXPORTS.slice(0, 2).every((row) => row.readinessState === EXPORT_READINESS_STATES.NOT_READY && row.schemaState === EXPORT_SCHEMA_STATES.UNVERIFIED), "Stellar and Hayha remain unverified and not ready");
ok(ACCOUNT_OPS_PROVIDER_EXPORTS.slice(2).every((row) => row.readinessState === EXPORT_READINESS_STATES.UNSUPPORTED && row.schemaState === EXPORT_SCHEMA_STATES.UNSUPPORTED), "unreviewed providers remain unsupported");
equal(ACCOUNT_OPS_CLOUD_TEMPLATES.length, 3, "three planning-only cloud templates exist");
ok(ACCOUNT_OPS_CLOUD_TEMPLATES.every((template) => template.provider == null && template.estimatedCostMinor == null), "cloud templates do not claim providers or current prices");
ok(Object.values(ACCOUNT_OPS_AUTOMATION_BOUNDARIES).every((value) => value === false), "every live automation boundary remains false");
deepFrozen(ACCOUNT_OPS_AUTOMATION_BOUNDARIES, "automation boundaries");

const normalizedModels = {
  plan: normalizeAccountCreationPlan(planInput),
  phone: normalizePhoneResource(phoneInput),
  payment: normalizePaymentCardMetadata(paymentInput),
  verification: normalizeVerificationAction(verificationInput),
  proxy: normalizeProxyGroupView(proxyInput),
  export: normalizeExportReadiness(exportInput),
  webhook: normalizeWebhookIntegration(webhookInput),
  server: normalizeServerRecord(serverInput),
  cloud: normalizeCloudTemplate(cloudInput),
  remote: normalizeRemoteAccessRecord(remoteInput),
  browser: normalizeBrowserWorkspace(browserInput),
  order: normalizeUnifiedOrderView(orderInput),
  notification: normalizeNotificationPreference(notificationInput),
  workspaceReference: normalizeWorkspaceReference(workspaceReferenceInput),
};

for (const [name, model] of Object.entries(normalizedModels)) deepFrozen(model, `${name} model`);
equal(normalizedModels.plan.authoritative, false, "creation plan is non-authoritative");
equal(normalizedModels.plan.automaticSignupAllowed, false, "creation plan cannot submit signup");
equal(normalizedModels.plan.credentialReference.referenceId, "vault:item-synthetic", "only a secure reference is retained");
equal(normalizedModels.phone.containsPhoneNumber, false, "phone resource excludes the actual number");
equal(normalizedModels.phone.containsVerificationValue, false, "phone resource excludes verification values");
equal(normalizedModels.payment.last4, "0007", "payment metadata retains only four display digits");
equal(normalizedModels.payment.containsFullCardNumber, false, "payment metadata excludes PAN");
equal(normalizedModels.payment.containsSecurityCode, false, "payment metadata excludes security code");
equal(normalizedModels.verification.humanCompletionRequired, true, "verification requires a human");
equal(normalizedModels.verification.verificationValueStored, false, "verification values are never stored");
equal(normalizedModels.verification.resumeAllowed, false, "fixture cannot resume automation");
equal(normalizedModels.proxy.containsEndpoint, false, "proxy metadata excludes endpoints");
equal(normalizedModels.proxy.containsAuthentication, false, "proxy metadata excludes authentication");
equal(normalizedModels.export.providerCapabilityVerified, false, "export parsing never verifies provider capability");
equal(normalizedModels.export.liveConnection, false, "export readiness has no live provider connection");
equal(normalizedModels.export.directExportAllowed, false, "direct export remains unavailable");
equal(normalizedModels.webhook.enabled, false, "webhook integration remains disabled");
equal(normalizedModels.webhook.endpointConfigured, false, "webhook endpoint is absent");
equal(normalizedModels.webhook.containsSecret, false, "webhook secrets are absent");
equal(normalizedModels.server.liveControlEnabled, false, "server controls remain disabled");
equal(normalizedModels.cloud.provisioningEnabled, false, "cloud provisioning remains disabled");
equal(normalizedModels.remote.connectionEnabled, false, "remote connection remains disabled");
equal(normalizedModels.browser.antiDetectionEnabled, false, "anti-detection remains disabled");
equal(normalizedModels.browser.cookieCaptureAllowed, false, "cookie capture remains disabled");
equal(normalizedModels.order.authoritative, false, "order view is non-authoritative");
equal(normalizedModels.order.purchaseMutationAllowed, false, "order view cannot create Purchases");
equal(normalizedModels.order.inventoryMutationAllowed, false, "order view cannot mutate Inventory");
equal(normalizedModels.notification.liveDeliveryEnabled, false, "notification preferences cannot send");
equal(normalizedModels.workspaceReference.navigationOnly, true, "cross-workspace references only navigate");
equal(normalizedModels.workspaceReference.mutationAllowed, false, "cross-workspace references cannot mutate canonical records");
equal(normalizedModels.workspaceReference.authoritative, false, "cross-workspace references remain non-authoritative");

throws(() => normalizePaymentCardMetadata({ ...paymentInput, last4: "12A4" }), (error) => error instanceof AccountOpsOperationsValidationError && error.code === "INVALID_LAST4", "non-digit display metadata is rejected");
throws(() => normalizePaymentCardMetadata({ ...paymentInput, cardNumber: ["4111", "1111", "1111", "1111"].join("") }), (error) => error.code === "SECRET_FIELD_REJECTED", "full payment card data is rejected before normalization");
throws(() => normalizeVerificationAction({ ...verificationInput, kind: VERIFICATION_ACTION_KINDS.MFA, challengeState: CAPTCHA_CHALLENGE_STATES.CHALLENGE_OPEN }), (error) => error.code === "CAPTCHA_STATE_MISMATCH", "non-CAPTCHA verification cannot claim a challenge state");
throws(() => normalizeWebhookIntegration({ ...webhookInput, enabled: true }), (error) => error.code === "LIVE_WEBHOOK_FORBIDDEN", "live webhooks are forbidden");
throws(() => normalizeCloudTemplate({ ...cloudInput, provisioningEnabled: true }), (error) => error.code === "PROVISIONING_FORBIDDEN", "cloud provisioning is forbidden");
throws(() => normalizeRemoteAccessRecord({ ...remoteInput, connectionEnabled: true }), (error) => error.code === "REMOTE_CONNECTION_FORBIDDEN", "remote connections are forbidden");
throws(() => normalizeBrowserWorkspace({ ...browserInput, antiDetectionEnabled: true }), (error) => error.code === "ANTI_DETECTION_FORBIDDEN", "anti-detection is forbidden");
throws(() => normalizePhoneResource({ ...phoneInput, unknownField: true }), (error) => error.code === "UNKNOWN_FIELD", "models use strict allowlists");

const operationsInput = {
  contractVersion: ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION,
  accountCreationPlans: [planInput], phoneResources: [phoneInput], paymentCards: [paymentInput], verificationActions: [verificationInput],
  proxyGroupViews: [proxyInput], exportReadiness: [exportInput], webhookIntegrations: [webhookInput], serverRecords: [serverInput],
  cloudTemplates: [cloudInput], remoteAccessRecords: [remoteInput], browserWorkspaces: [browserInput], orderViews: [orderInput],
  notificationPreferences: [notificationInput],
  workspaceReferences: [workspaceReferenceInput],
};
const operations = normalizeAccountOpsOperationsSnapshot(operationsInput);
equal(operations.persisted, false, "operations snapshot is not persisted");
equal(operations.authoritative, false, "operations snapshot is non-authoritative");
ok(Object.values(operations.boundaries).every((value) => value === false), "normalized snapshot keeps every live boundary false");
for (const collection of ACCOUNT_OPS_OPERATIONS_COLLECTIONS) equal(Array.isArray(operations[collection]), true, `${collection} is a bounded collection`);
deepFrozen(operations, "normalized operations snapshot");
equal(assertOperationsSnapshotIsEphemeral(operations), true, "normalized snapshot satisfies the ephemeral boundary");
const empty = createEmptyAccountOpsOperationsSnapshot();
equal(empty.cloudTemplates.length, 3, "empty snapshot includes only static cloud planning templates");
ok(ACCOUNT_OPS_OPERATIONS_COLLECTIONS.filter((name) => name !== "cloudTemplates").every((name) => empty[name].length === 0), "all non-template empty collections start empty");
throws(
  () => createAccountOpsOperationsViewModel({
    accountOpsSnapshot: {},
    operationsSnapshot: { persisted: false, authoritative: false, unsafeCollection: [] },
  }),
  (error) => error.code === "UNKNOWN_SNAPSHOT_FIELD",
  "a caller cannot bypass strict snapshot normalization by claiming an input is ephemeral",
);
const forgedFromDiscoverableProperties = { persisted: false, authoritative: false, unsafeCollection: [] };
for (const symbol of Object.getOwnPropertySymbols(empty)) forgedFromDiscoverableProperties[symbol] = true;
throws(
  () => createAccountOpsOperationsViewModel({ accountOpsSnapshot: {}, operationsSnapshot: forgedFromDiscoverableProperties }),
  (error) => error.code === "UNKNOWN_SNAPSHOT_FIELD",
  "discoverable object properties cannot forge normalized-snapshot identity",
);
deepFrozen(empty, "empty operations snapshot");
throws(() => normalizeAccountOpsOperationsSnapshot({ unexpectedCollection: [] }), (error) => error.code === "UNKNOWN_SNAPSHOT_FIELD", "unknown collections are rejected");
throws(() => normalizeAccountOpsOperationsSnapshot({ contractVersion: "future" }), (error) => error.code === "UNSUPPORTED_CONTRACT", "future contracts fail closed");
throws(() => normalizeAccountOpsOperationsSnapshot({ phoneResources: [phoneInput, phoneInput] }), (error) => error.code === "DUPLICATE_ID", "duplicate record IDs are rejected");
throws(() => assertOperationsSnapshotIsEphemeral({ ...operations, persisted: true }), (error) => error.code === "EPHEMERAL_BOUNDARY_REQUIRED", "persisted projections are rejected");
throws(() => assertOperationsSnapshotIsEphemeral({ ...operations, boundaries: { ...operations.boundaries, liveBotConnection: true } }), (error) => error.code === "LIVE_CAPABILITY_FORBIDDEN", "live capabilities fail closed");
equal(normalizeAttentionPriority("critical"), ATTENTION_PRIORITIES.CRITICAL, "attention priority normalization is case-safe");
throws(() => normalizeAttentionPriority("URGENT"), (error) => error.code === "INVALID_ENUM", "unknown attention priorities are rejected");

const healthyFixture = getPhase2a6aQaFixture("healthy-target-account");
const baseAccount = healthyFixture.accountOps.storeAccounts[0];
const baseSnapshot = JSON.parse(JSON.stringify(healthyFixture.accountOps));
const account = (id, overrides = {}) => ({
  ...baseAccount,
  id: `storeAccounts:${id}`,
  accountDisplayName: `Synthetic ${id}`,
  status: STORE_ACCOUNT_STATUSES.SETUP,
  setupStage: ACCOUNT_SETUP_STAGES.PREPARED,
  securityStatus: "HEALTHY",
  emailVerificationStatus: VERIFICATION_STATES.VERIFIED,
  phoneVerificationRequired: false,
  phoneVerificationStatus: VERIFICATION_STATES.NOT_REQUIRED,
  ownerConfirmedReadyAt: null,
  recordVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});
const lifecycleAccounts = [
  account("draft"),
  account("ready", { status: STORE_ACCOUNT_STATUSES.READY, setupStage: ACCOUNT_SETUP_STAGES.READY }),
  account("signup", { setupStage: ACCOUNT_SETUP_STAGES.SIGNUP_OPENED }),
  account("captcha", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, securityStatus: "CAPTCHA_REQUIRED" }),
  account("mfa", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, securityStatus: "MFA_REQUIRED" }),
  account("email", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, emailVerificationStatus: VERIFICATION_STATES.PENDING }),
  account("sms", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, phoneVerificationRequired: true, phoneVerificationStatus: VERIFICATION_STATES.PENDING }),
  account("verifying", { setupStage: ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION }),
  account("active", { status: STORE_ACCOUNT_STATUSES.READY, setupStage: ACCOUNT_SETUP_STAGES.READY, ownerConfirmedReadyAt: NOW }),
  account("attention", { status: STORE_ACCOUNT_STATUSES.NEEDS_ATTENTION }),
  account("failed", { status: STORE_ACCOUNT_STATUSES.LOCKED, securityStatus: "LOCKED" }),
  account("disabled", { status: STORE_ACCOUNT_STATUSES.DISABLED }),
  account("archived", { status: STORE_ACCOUNT_STATUSES.ARCHIVED }),
];
const lifecycleSnapshot = { ...baseSnapshot, storeAccounts: lifecycleAccounts };
const lifecyclePlans = deriveAccountCreationPlans(lifecycleSnapshot);
const lifecycleByAccount = new Map(lifecyclePlans.map((row) => [row.id.replace("creation-plan:storeAccounts:", ""), row]));
deepEqual([...lifecycleByAccount.values()].map((row) => row.creationState), [
  ACCOUNT_CREATION_STATES.DRAFT, ACCOUNT_CREATION_STATES.READY, ACCOUNT_CREATION_STATES.SIGNUP_OPEN,
  ACCOUNT_CREATION_STATES.WAITING_FOR_CAPTCHA, ACCOUNT_CREATION_STATES.WAITING_FOR_MFA,
  ACCOUNT_CREATION_STATES.WAITING_FOR_EMAIL, ACCOUNT_CREATION_STATES.WAITING_FOR_SMS,
  ACCOUNT_CREATION_STATES.VERIFYING, ACCOUNT_CREATION_STATES.ACTIVE, ACCOUNT_CREATION_STATES.NEEDS_ATTENTION,
  ACCOUNT_CREATION_STATES.FAILED, ACCOUNT_CREATION_STATES.DISABLED,
], "canonical account metadata derives every currently observable creation state");
equal(lifecyclePlans.length, 12, "archived accounts do not produce creation plans");
equal(lifecycleByAccount.get("captcha").verificationRequirements.includes("CAPTCHA"), true, "CAPTCHA requirement is explicit");
equal(lifecycleByAccount.get("mfa").verificationRequirements.includes("MFA"), true, "MFA requirement is explicit");
equal(lifecycleByAccount.get("email").verificationRequirements.includes("EMAIL"), true, "email requirement is explicit");
equal(lifecycleByAccount.get("sms").verificationRequirements.includes("SMS"), true, "SMS requirement is explicit");
equal(normalizedModels.plan.creationState, ACCOUNT_CREATION_STATES.WAITING_FOR_TERMS, "terms waiting remains an explicit review-only plan state");
deepFrozen(lifecyclePlans, "derived creation plans");

const healthAccounts = [
  account("health-healthy", { status: STORE_ACCOUNT_STATUSES.READY, setupStage: ACCOUNT_SETUP_STAGES.READY, ownerConfirmedReadyAt: NOW }),
  account("health-needs", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION }),
  account("health-reset", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, securityStatus: "PASSWORD_RESET_REQUIRED" }),
  account("health-email", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, emailVerificationStatus: VERIFICATION_STATES.PENDING }),
  account("health-phone", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, phoneVerificationRequired: true, phoneVerificationStatus: VERIFICATION_STATES.PENDING }),
  account("health-mfa", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, securityStatus: "MFA_REQUIRED" }),
  account("health-captcha", { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, securityStatus: "CAPTCHA_REQUIRED" }),
  account("health-locked", { status: STORE_ACCOUNT_STATUSES.LOCKED, securityStatus: "LOCKED" }),
  account("health-disabled", { status: STORE_ACCOUNT_STATUSES.DISABLED }),
  account("health-unknown"),
];
const healthSnapshot = { ...baseSnapshot, storeAccounts: healthAccounts };
const healthRows = deriveAccountHealthCenter(healthSnapshot, healthyFixture.accountOps.retailers, { asOf: NOW });
deepEqual(healthRows.map((row) => row.state), Object.values(ACCOUNT_HEALTH_CENTER_STATES), "Account Health Center derives every defined health state deterministically");
ok(healthRows.every((row) => row.networkChecked === false), "health is metadata-derived without retailer network checks");
deepFrozen(healthRows, "derived health rows");

const duplicateA = account("duplicate-a", { accountDisplayName: "Duplicate owner label" });
const duplicateB = account("duplicate-b", { accountDisplayName: " duplicate OWNER label " });
const duplicateSnapshot = { ...baseSnapshot, storeAccounts: [duplicateA, duplicateB] };
const duplicateOperations = normalizeAccountOpsOperationsSnapshot({ accountCreationPlans: [
  { ...planInput, id: `creation-plan:${duplicateA.id}`, accountLabel: duplicateA.accountDisplayName, phoneReference: "phone-resource:shared" },
  { ...planInput, id: `creation-plan:${duplicateB.id}`, accountLabel: duplicateB.accountDisplayName, phoneReference: "phone-resource:shared" },
] });
const conflicts = detectAccountConflicts(duplicateSnapshot, duplicateOperations);
deepEqual(conflicts.map((row) => row.category).sort(), ["EMAIL", "LABEL", "PHONE", "PROFILE"], "duplicate detection covers normalized email, label, phone, and profile metadata");
ok(conflicts.every((row) => row.limitEvasionAllowed === false), "duplicate warnings never authorize retailer-limit evasion");
deepFrozen(conflicts, "duplicate warnings");
const differentRetailerSnapshot = { ...duplicateSnapshot, storeAccounts: [duplicateA, { ...duplicateB, retailerId: "retailer-preset:walmart" }] };
equal(detectAccountConflicts(differentRetailerSnapshot, duplicateOperations).length, 0, "same metadata at different retailers is not conflated");

const captchaSnapshot = getPhase2a6aQaFixture("captcha-required").accountOps;
const verificationRows = deriveVerificationInbox(captchaSnapshot, createEmptyAccountOpsOperationsSnapshot(), { asOf: NOW });
const captchaAction = verificationRows.find((row) => row.kind === VERIFICATION_ACTION_KINDS.CAPTCHA);
ok(captchaAction, "CAPTCHA-required account produces a review action");
equal(captchaAction.challengeState, CAPTCHA_CHALLENGE_STATES.CAPTCHA_REQUIRED, "CAPTCHA state is explicit");
equal(captchaAction.humanCompletionRequired, true, "CAPTCHA action remains human controlled");
equal(captchaAction.verificationValueStored, false, "CAPTCHA solution is never stored");
equal(captchaAction.resumeAllowed, false, "no automatic challenge resume is enabled");
deepFrozen(verificationRows, "verification inbox");

const defaultExports = deriveDefaultExportReadiness(healthyFixture.accountOps, createEmptyAccountOpsOperationsSnapshot());
equal(defaultExports.length, 5, "default export center covers all named future providers");
ok(defaultExports.every((row) => row.liveConnection === false && row.directExportAllowed === false && row.providerCapabilityVerified === false), "export readiness never becomes provider capability or a send action");
equal(defaultExports.find((row) => row.provider === "STELLAR").readinessState, EXPORT_READINESS_STATES.NOT_READY, "Stellar remains not ready for outbound export");
const mergedExports = deriveDefaultExportReadiness(healthyFixture.accountOps, operations);
equal(mergedExports.length, 5, "a reviewed readiness row cannot hide the other required provider cards");
equal(mergedExports.find((row) => row.provider === "STELLAR").readinessState, EXPORT_READINESS_STATES.READY_FOR_PREVIEW, "reviewed local readiness replaces only its matching provider projection");
const profileCompatibility = deriveProfileCompatibilityViews(healthyFixture.accountOps, mergedExports);
equal(profileCompatibility.length, healthyFixture.accountOps.profiles.length, "Profile Builder exposes one compatibility review per canonical Profile");
ok(profileCompatibility.every((row) => row.botProviderCompatibility.length === 5), "each Profile shows every required provider readiness relationship");
ok(profileCompatibility.every((row) => row.botProviderCompatibility.every((provider) => provider.compatibilityVerified === false)), "Profile relationships never claim verified bot compatibility");
deepFrozen(profileCompatibility, "profile compatibility review");
deepFrozen(defaultExports, "default export readiness");
const callerOwnedAccountOps = JSON.parse(JSON.stringify(healthyFixture.accountOps));
equal(Object.isFrozen(callerOwnedAccountOps), false, "caller-owned Account Ops input begins mutable");
equal(Object.isFrozen(callerOwnedAccountOps.storeAccounts[0]), false, "caller-owned nested Account Ops input begins mutable");
const isolatedView = createAccountOpsOperationsViewModel({ accountOpsSnapshot: callerOwnedAccountOps, operationsSnapshot: empty, retailers: healthyFixture.accountOps.retailers, asOf: NOW });
ok(isolatedView.accountOps !== callerOwnedAccountOps, "the frozen view owns an isolated safe clone rather than the caller's canonical object");
equal(Object.isFrozen(callerOwnedAccountOps), false, "view derivation does not freeze the caller-owned root");
equal(Object.isFrozen(callerOwnedAccountOps.storeAccounts[0]), false, "view derivation does not freeze caller-owned canonical records");
deepFrozen(isolatedView.accountOps, "isolated Account Ops view copy");

const mixed = getPhase2a6aQaFixture("attention-center-mixed");
const accountOpsBefore = JSON.stringify(mixed.accountOps);
const operationsBefore = JSON.stringify(mixed.operations);
let networkCalls = 0;
let storageReads = 0;
let storageWrites = 0;
const originalFetch = globalThis.fetch;
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
globalThis.fetch = async () => { networkCalls += 1; throw new Error("Network access is forbidden in this test."); };
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem() { storageReads += 1; throw new Error("Storage reads are forbidden in this pure view."); },
  setItem() { storageWrites += 1; throw new Error("Storage writes are forbidden in this pure view."); },
} });
let mixedView;
try {
  mixedView = createAccountOpsOperationsViewModel({ accountOpsSnapshot: mixed.accountOps, operationsSnapshot: mixed.operations, retailers: mixed.accountOps.retailers, asOf: NOW });
  const directAttention = buildAttentionCenter(mixedView);
  equal(directAttention.length, mixedView.attention.length, "Attention Center selector is deterministic");
  ok(mixedView.attention.some((row) => row.category === "ACCOUNTS"), "Attention Center includes account health");
  ok(mixedView.attention.some((row) => row.category === "VERIFICATION"), "Attention Center includes human verification");
  ok(mixedView.attention.some((row) => row.category === "BOTS"), "Attention Center includes proxy readiness warnings");
  ok(mixedView.attention.some((row) => row.category === "SERVERS"), "Attention Center includes server metadata warnings");
  ok(mixedView.attention.some((row) => row.category === "ORDERS"), "Attention Center includes order relationship issues");
  ok(mixedView.attention.some((row) => row.category === "BUSINESS" && row.sourceId === "receiving-event:synthetic-review"), "Attention Center accepts a bounded Receiving discrepancy projection");
  ok(mixedView.attention.some((row) => row.category === "BUSINESS" && row.sourceId === "accountant-review:synthetic-review"), "Attention Center accepts a bounded Accountant Review projection");
  ok(mixedView.attention.every((row) => row.navigationOnly === true), "Attention Center is navigation-only");
  const attentionRank = { CRITICAL: 0, HIGH: 1, NORMAL: 2, INFO: 3 };
  deepEqual(
    [...mixedView.attention].map((row) => row.priority),
    [...mixedView.attention].map((row) => row.priority).sort((left, right) => attentionRank[left] - attentionRank[right]),
    "Attention Center is priority ordered",
  );
  const searchResults = searchAccountOpsOperations(mixedView, "synthetic");
  ok(searchResults.length > 0, "global Account Ops search finds local metadata");
  ok(searchResults.every((row) => row.navigationOnly === true && row.destructiveAction === false), "search results can navigate but cannot mutate");
  ok(mixedView.search("purchase:synthetic-01").some((row) => row.type === "ORDER"), "search includes canonical Purchase relationships without duplicating Purchase authority");
  ok(mixedView.search("inventory:synthetic-search").some((row) => row.type === "INVENTORY"), "search includes bounded canonical Inventory references");
  deepEqual(mixedView.search(""), [], "empty search stays empty");
  throws(() => mixedView.search("x".repeat(121)), /limited to 120 characters/, "search input is bounded");
} finally {
  globalThis.fetch = originalFetch;
  if (originalStorageDescriptor) Object.defineProperty(globalThis, "localStorage", originalStorageDescriptor);
  else delete globalThis.localStorage;
}

equal(mixedView.writesAllowed, false, "view model exposes no write authority");
equal(mixedView.networkAllowed, false, "view model exposes no network authority");
equal(mixedView.operations.persisted, false, "view operations remain ephemeral");
equal(mixedView.operations.authoritative, false, "view operations remain non-authoritative");
equal(networkCalls, 0, "domain/selectors perform no network calls");
equal(storageReads, 0, "domain/selectors do not read storage");
equal(storageWrites, 0, "domain/selectors do not write storage");
equal(JSON.stringify(mixed.accountOps), accountOpsBefore, "view derivation does not alter canonical Account Ops values");
equal(JSON.stringify(mixed.operations), operationsBefore, "view derivation does not alter operation projection values");
deepFrozen(mixedView, "operations view model");

for (const state of ["UNVERIFIED", "EMAIL_UNVERIFIED", "PHONE_UNVERIFIED", "PARTIALLY_VERIFIED", "NOT_READY", "NEEDS_VERIFICATION"]) {
  equal(accountOpsStatusTone(state), "warning", `${state} never presents incomplete verification as success`);
}
for (const state of ["DISABLED", "LOCKED", "FAILED", "EXPIRED", "UNSUPPORTED"]) {
  equal(accountOpsStatusTone(state), "danger", `${state} presents a blocked status`);
}
for (const state of ["VERIFIED", "HEALTHY", "READY", "READY_FOR_PREVIEW", "ACTIVE"]) {
  equal(accountOpsStatusTone(state), "success", `${state} retains its positive status`);
}
equal(accountOpsStatusTone("INACTIVE"), "neutral", "an unknown negative state cannot match ACTIVE by substring");
console.log(`Code 3 Account Ops foundation domain: ${assertions} assertions passed.`);
