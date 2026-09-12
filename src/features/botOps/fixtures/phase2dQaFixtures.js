import {
  BOT_ATTEMPT_EVENTS,
  BOT_CAPABILITIES,
  BOT_EVIDENCE_REVIEW_STATES,
  BOT_FAILURE_CATEGORIES,
  BOT_INSTALLATION_HEALTH,
  BOT_INTEGRATION_MODES,
  BOT_OPS_FORMAT,
  BOT_PROVENANCE,
  BOT_PROVIDER_KEYS,
  BOT_PROXY_HEALTH,
  BOT_PROXY_TYPES,
  BOT_RECORD_STATUS,
  BOT_SCHEDULE_MODES,
  BOT_TASK_MODES,
  BOT_TASK_STATUSES,
} from "../constants.js";
import { createEmptyBotOpsState } from "../repository.js";

const FIXED_AT = "2026-08-28T12:00:00.000Z";
const LATER_AT = "2026-08-28T12:05:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const allCapabilities = (enabled = false) => Object.fromEntries(Object.values(BOT_CAPABILITIES).map((key) => [key, enabled]));
const mockCapabilities = () => ({
  ...allCapabilities(false),
  [BOT_CAPABILITIES.RUNTIME_HEALTH]: true,
  [BOT_CAPABILITIES.TASK_STATUS]: true,
  [BOT_CAPABILITIES.CHECKOUT_EVIDENCE]: true,
  [BOT_CAPABILITIES.EVENT_HISTORY]: true,
});

function stamped(id, recordType, record = {}) {
  return {
    id,
    format: BOT_OPS_FORMAT,
    recordType,
    status: BOT_RECORD_STATUS.ACTIVE,
    recordVersion: 1,
    createdAt: FIXED_AT,
    updatedAt: FIXED_AT,
    ...record,
  };
}

function installation(overrides = {}) {
  return stamped("installation.mock.test", "BOT_INSTALLATION", {
    provider: BOT_PROVIDER_KEYS.MOCK,
    friendlyName: "Synthetic bot runtime",
    runtimeLabel: "fixture-runtime.test",
    connectionMode: BOT_INTEGRATION_MODES.TEST_ONLY_MOCK,
    version: "fixture-1.0",
    healthState: BOT_INSTALLATION_HEALTH.HEALTHY,
    lastSeenAt: FIXED_AT,
    capabilitySnapshot: mockCapabilities(),
    warnings: ["SYNTHETIC_TEST_FIXTURE"],
    enabled: true,
    ...overrides,
  });
}

function accountLink(overrides = {}) {
  return stamped("account-link.target.test", "RETAILER_ACCOUNT_LINK", {
    retailerId: "retailer.target.test",
    accountOpsStoreAccountId: "account-ops.store-account.test",
    accountOpsProfileId: "account-ops.profile.test",
    accountLabel: "Synthetic Target account",
    aliasLabel: "bot-account@retailer.test",
    installationIds: ["installation.mock.test"],
    taskGroupIds: ["task-group.target-pokemon.test"],
    shippingProfileReference: "shipping-profile.test",
    billingProfileReference: "billing-profile.test",
    phoneProfileReference: "phone-profile.test",
    warnings: [],
    lastActivityAt: FIXED_AT,
    ...overrides,
  });
}

function botProfile(overrides = {}) {
  return stamped("bot-profile.test", "BOT_PROFILE", {
    displayName: "Synthetic checkout profile",
    accountOpsProfileId: "account-ops.profile.test",
    shippingProfileReference: "shipping-profile.test",
    billingProfileReference: "billing-profile.test",
    retailerCompatibility: ["retailer.target.test", "retailer.walmart.test"],
    installationIds: ["installation.mock.test"],
    notes: "Reserved synthetic metadata only.",
    ...overrides,
  });
}

function proxyGroup(overrides = {}) {
  return stamped("proxy-group.test", "PROXY_GROUP", {
    displayName: "Synthetic proxy metadata",
    proxyType: BOT_PROXY_TYPES.UNKNOWN,
    providerLabel: "Reserved test provider",
    region: "us-east-test",
    installationIds: ["installation.mock.test"],
    retailerIds: ["retailer.target.test"],
    taskGroupIds: ["task-group.target-pokemon.test"],
    healthState: BOT_PROXY_HEALTH.HEALTHY,
    latencyMs: 42,
    lastCheckedAt: FIXED_AT,
    warnings: ["NO_PROXY_ENDPOINTS_OR_CREDENTIALS_STORED"],
    proxyCount: 2,
    ...overrides,
  });
}

function productTarget(overrides = {}) {
  return stamped("product-target.pokemon.test", "PRODUCT_TARGET", {
    retailerId: "retailer.target.test",
    canonicalProductId: "catalog.pokemon.synthetic.test",
    sku: "SKU-TEST-001",
    tcin: "TCIN-TEST-001",
    upc: "000000000001",
    title: "Synthetic Pokémon product",
    category: "Pokémon",
    maxPrice: { minorUnits: 5499, currency: "USD" },
    referencePrice: { minorUnits: 4999, currency: "USD" },
    quantityLimit: 1,
    availabilityMode: "RESTOCK",
    notes: "Reserved synthetic product data.",
    reviewState: BOT_EVIDENCE_REVIEW_STATES.CONFIRMED,
    provenance: BOT_PROVENANCE.TEST_FIXTURE,
    ...overrides,
  });
}

function taskGroup(overrides = {}) {
  return stamped("task-group.target-pokemon.test", "BOT_TASK_GROUP", {
    name: "Target Pokémon synthetic",
    retailerId: "retailer.target.test",
    productCategory: "Pokémon",
    provider: BOT_PROVIDER_KEYS.MOCK,
    installationId: "installation.mock.test",
    retailerAccountLinkId: "account-link.target.test",
    botProfileId: "bot-profile.test",
    proxyGroupId: "proxy-group.test",
    scheduleMode: BOT_SCHEDULE_MODES.MANUAL,
    taskMode: BOT_TASK_MODES.MANUAL_DRAFT,
    quantityLimit: 1,
    maxPrice: { minorUnits: 5499, currency: "USD" },
    enabled: true,
    warnings: ["TEST_ONLY_NO_EXTERNAL_EFFECT"],
    ...overrides,
  });
}

function task(overrides = {}) {
  return stamped("task.target-pokemon.test", "BOT_TASK", {
    taskGroupId: "task-group.target-pokemon.test",
    productTargetId: "product-target.pokemon.test",
    retailerId: "retailer.target.test",
    provider: BOT_PROVIDER_KEYS.MOCK,
    installationId: "installation.mock.test",
    maxPrice: { minorUnits: 5499, currency: "USD" },
    quantityTarget: 1,
    taskMode: BOT_TASK_MODES.MANUAL_DRAFT,
    retailerAccountLinkId: "account-link.target.test",
    botProfileId: "bot-profile.test",
    proxyGroupId: "proxy-group.test",
    runtimeStatus: BOT_TASK_STATUSES.WAITING,
    lastAttemptAt: null,
    lastResult: "Synthetic task waiting.",
    warnings: ["TEST_ONLY_NO_EXTERNAL_EFFECT"],
    providerReferenceId: "provider-task.test",
    provenance: BOT_PROVENANCE.TEST_FIXTURE,
    ...overrides,
  });
}

function attempt(overrides = {}) {
  return stamped("attempt.test", "BOT_ATTEMPT", {
    providerEventKey: "MOCK:installation.mock.test:event.test",
    providerEventId: "event.test",
    sourceHash: HASH_A,
    provider: BOT_PROVIDER_KEYS.MOCK,
    installationId: "installation.mock.test",
    taskId: "task.target-pokemon.test",
    retailerId: "retailer.target.test",
    occurredAt: FIXED_AT,
    normalizedEvent: BOT_ATTEMPT_EVENTS.STATUS_OBSERVED,
    runtimeStatus: BOT_TASK_STATUSES.WAITING,
    success: false,
    failureCategory: BOT_FAILURE_CATEGORIES.NONE,
    message: "Synthetic normalized event.",
    productTargetId: "product-target.pokemon.test",
    retailerAccountLinkId: "account-link.target.test",
    botProfileId: "bot-profile.test",
    proxyGroupId: "proxy-group.test",
    checkoutEvidenceId: null,
    provenance: BOT_PROVENANCE.TEST_FIXTURE,
    eventRevision: 1,
    warnings: ["SYNTHETIC_TEST_FIXTURE"],
    ...overrides,
  });
}

function evidence(overrides = {}) {
  return stamped("checkout-evidence.test", "BOT_CHECKOUT_EVIDENCE", {
    evidenceKey: "MOCK:installation.mock.test:task.target-pokemon.test:order.test",
    sourceHash: HASH_A,
    provider: BOT_PROVIDER_KEYS.MOCK,
    installationId: "installation.mock.test",
    taskId: "task.target-pokemon.test",
    attemptId: "attempt.test",
    retailerId: "retailer.target.test",
    productTargetId: "product-target.pokemon.test",
    quantity: 1,
    expectedAmount: { minorUnits: 5499, currency: "USD" },
    externalOrderReference: "ORDER-TEST-001",
    retailerAccountLinkId: "account-link.target.test",
    botProfileId: "bot-profile.test",
    occurredAt: FIXED_AT,
    confidence: "LOW",
    warnings: ["SYNTHETIC_CHECKOUT_EVIDENCE_REQUIRES_REVIEW"],
    provenance: BOT_PROVENANCE.TEST_FIXTURE,
    reviewState: BOT_EVIDENCE_REVIEW_STATES.NEEDS_REVIEW,
    corrections: [],
    reviewedAt: null,
    orderCandidateLinks: [],
    requiresOwnerReview: true,
    purchaseCreated: false,
    automaticPurchaseCreationAllowed: false,
    inventoryCreated: false,
    automaticReceivingAllowed: false,
    ...overrides,
  });
}

function baseState(overrides = {}) {
  return {
    ...createEmptyBotOpsState(() => FIXED_AT),
    installations: [installation()],
    retailerAccountLinks: [accountLink()],
    botProfiles: [botProfile()],
    proxyGroups: [proxyGroup()],
    productTargets: [productTarget()],
    taskGroups: [taskGroup()],
    tasks: [task()],
    ...overrides,
  };
}

function fixture(key, label, state, extra = {}) {
  return Object.freeze({ key, label, description: `${label} uses reserved synthetic metadata only.`, state, ...extra });
}

function providerEvent(overrides = {}) {
  return {
    providerEventId: "event.test",
    installationId: "installation.mock.test",
    taskId: "task.target-pokemon.test",
    retailerId: "retailer.target.test",
    occurredAt: FIXED_AT,
    normalizedEvent: BOT_ATTEMPT_EVENTS.TASK_WAITING,
    runtimeStatus: BOT_TASK_STATUSES.WAITING,
    success: false,
    failureCategory: BOT_FAILURE_CATEGORIES.NONE,
    message: "Synthetic provider event.",
    productTargetId: "product-target.pokemon.test",
    retailerAccountLinkId: "account-link.target.test",
    botProfileId: "bot-profile.test",
    proxyGroupId: "proxy-group.test",
    warnings: ["SYNTHETIC_TEST_FIXTURE"],
    ...overrides,
  };
}

const errorFixture = (key, label, runtimeStatus, normalizedEvent, failureCategory) => fixture(
  key,
  label,
  baseState({
    tasks: [task({ runtimeStatus, lastAttemptAt: FIXED_AT, lastResult: label })],
    attempts: [attempt({ runtimeStatus, normalizedEvent, failureCategory, message: label })],
  }),
);

const secretFieldName = ["access", "Token"].join("");

export const PHASE_2D_QA_FIXTURES = Object.freeze([
  fixture("hayha-disconnected", "Hayha disconnected", baseState({ installations: [installation({ id: "installation.hayha.test", provider: BOT_PROVIDER_KEYS.HAYHA, friendlyName: "Hayha foundation", connectionMode: BOT_INTEGRATION_MODES.LOCAL_COMPANION, healthState: BOT_INSTALLATION_HEALTH.DISCONNECTED, lastSeenAt: null, capabilitySnapshot: allCapabilities(false), enabled: false })], retailerAccountLinks: [], botProfiles: [], proxyGroups: [], productTargets: [], taskGroups: [], tasks: [] })),
  fixture("stellar-disconnected", "Stellar disconnected", baseState({ installations: [installation({ id: "installation.stellar.test", provider: BOT_PROVIDER_KEYS.STELLAR, friendlyName: "Stellar foundation", connectionMode: BOT_INTEGRATION_MODES.LOCAL_COMPANION, healthState: BOT_INSTALLATION_HEALTH.DISCONNECTED, lastSeenAt: null, capabilitySnapshot: allCapabilities(false), enabled: false })], retailerAccountLinks: [], botProfiles: [], proxyGroups: [], productTargets: [], taskGroups: [], tasks: [] })),
  fixture("healthy-mock-bot", "Healthy mock bot", baseState()),
  fixture("degraded-mock-bot", "Degraded mock bot", baseState({ installations: [installation({ healthState: BOT_INSTALLATION_HEALTH.DEGRADED, warnings: ["SYNTHETIC_DEGRADED_RUNTIME"] })] })),
  fixture("target-pokemon-task-group", "Target Pokémon Task Group", baseState()),
  fixture("walmart-pokemon-task-group", "Walmart Pokémon Task Group", baseState({ taskGroups: [taskGroup({ id: "task-group.walmart-pokemon.test", name: "Walmart Pokémon synthetic", retailerId: "retailer.walmart.test", retailerAccountLinkId: null })], tasks: [], proxyGroups: [] })),
  fixture("one-piece-task-group", "One Piece Task Group", baseState({ taskGroups: [taskGroup({ id: "task-group.one-piece.test", name: "Target One Piece synthetic", productCategory: "One Piece" })], tasks: [] })),
  fixture("task-waiting", "Task waiting", baseState()),
  fixture("task-monitoring", "Task monitoring", baseState({ tasks: [task({ runtimeStatus: BOT_TASK_STATUSES.MONITORING, lastAttemptAt: FIXED_AT })] })),
  fixture("carted-synthetic-task", "Synthetic carted task", baseState({ tasks: [task({ runtimeStatus: BOT_TASK_STATUSES.CARTED, lastAttemptAt: FIXED_AT })], attempts: [attempt({ normalizedEvent: BOT_ATTEMPT_EVENTS.CARTED, runtimeStatus: BOT_TASK_STATUSES.CARTED })] })),
  fixture("synthetic-checkout-success", "Synthetic checkout success", baseState({ tasks: [task({ runtimeStatus: BOT_TASK_STATUSES.SUCCESS, lastAttemptAt: FIXED_AT })], attempts: [attempt({ normalizedEvent: BOT_ATTEMPT_EVENTS.CHECKOUT_SUCCEEDED, runtimeStatus: BOT_TASK_STATUSES.SUCCESS, success: true, checkoutEvidenceId: "checkout-evidence.test" })], checkoutEvidence: [evidence()] })),
  errorFixture("account-error", "Synthetic account error", BOT_TASK_STATUSES.ACCOUNT_ERROR, BOT_ATTEMPT_EVENTS.ACCOUNT_ERROR, BOT_FAILURE_CATEGORIES.ACCOUNT),
  errorFixture("proxy-error", "Synthetic proxy error", BOT_TASK_STATUSES.PROXY_ERROR, BOT_ATTEMPT_EVENTS.PROXY_ERROR, BOT_FAILURE_CATEGORIES.PROXY),
  errorFixture("retailer-block", "Synthetic retailer block", BOT_TASK_STATUSES.RETAILER_BLOCK, BOT_ATTEMPT_EVENTS.RETAILER_BLOCK, BOT_FAILURE_CATEGORIES.RETAILER_BLOCK),
  errorFixture("payment-error", "Synthetic payment error", BOT_TASK_STATUSES.PAYMENT_ERROR, BOT_ATTEMPT_EVENTS.PAYMENT_ERROR, BOT_FAILURE_CATEGORIES.PAYMENT),
  errorFixture("rate-limit", "Synthetic rate limit", BOT_TASK_STATUSES.RATE_LIMITED, BOT_ATTEMPT_EVENTS.RATE_LIMITED, BOT_FAILURE_CATEGORIES.RATE_LIMIT),
  fixture("duplicate-provider-event", "Duplicate provider event", baseState(), { providerEvents: [providerEvent(), providerEvent()] }),
  fixture("conflicting-task-state", "Conflicting task state", baseState({ tasks: [task({ runtimeStatus: BOT_TASK_STATUSES.SUCCESS, lastAttemptAt: FIXED_AT })] }), { providerEvents: [providerEvent({ providerEventId: "event.success.test", normalizedEvent: BOT_ATTEMPT_EVENTS.CHECKOUT_SUCCEEDED, runtimeStatus: BOT_TASK_STATUSES.SUCCESS, success: true }), providerEvent({ providerEventId: "event.failure.test", occurredAt: LATER_AT, normalizedEvent: BOT_ATTEMPT_EVENTS.CHECKOUT_FAILED, runtimeStatus: BOT_TASK_STATUSES.FAILED, failureCategory: BOT_FAILURE_CATEGORIES.PROVIDER })] }),
  fixture("checkout-evidence-review", "Checkout Evidence requires review", baseState({ attempts: [attempt({ normalizedEvent: BOT_ATTEMPT_EVENTS.CHECKOUT_SUCCEEDED, runtimeStatus: BOT_TASK_STATUSES.SUCCESS, success: true, checkoutEvidenceId: "checkout-evidence.test" })], checkoutEvidence: [evidence()] })),
  fixture("same-product-two-bots", "Same product targeted by two bots", baseState({ installations: [installation(), installation({ id: "installation.mock-two.test", friendlyName: "Second synthetic runtime" })], tasks: [task(), task({ id: "task.target-pokemon-two.test", installationId: "installation.mock-two.test", providerReferenceId: "provider-task-two.test" })] })),
  fixture("account-multiple-groups", "Account assigned to multiple Task Groups", baseState({ retailerAccountLinks: [accountLink({ taskGroupIds: ["task-group.target-pokemon.test", "task-group.one-piece.test"] })], taskGroups: [taskGroup(), taskGroup({ id: "task-group.one-piece.test", name: "One Piece synthetic", productCategory: "One Piece" })] })),
  fixture("disabled-account", "Disabled retailer account reference", baseState({ retailerAccountLinks: [accountLink({ status: BOT_RECORD_STATUS.DISABLED, warnings: ["ACCOUNT_DISABLED"] })] })),
  fixture("disabled-proxy-group", "Disabled proxy group", baseState({ proxyGroups: [proxyGroup({ status: BOT_RECORD_STATUS.DISABLED, healthState: BOT_PROXY_HEALTH.DISABLED })] })),
  fixture("missing-profile", "Missing profile relationship", baseState({ botProfiles: [], taskGroups: [taskGroup({ botProfileId: "missing-profile.invalid", warnings: ["BOT_PROFILE_MISSING"] })] })),
  fixture("malformed-provider-payload", "Malformed provider payload rejected", baseState(), { providerEventInput: { providerEventId: "malformed-event.invalid", installationId: "installation.mock.test" }, expectedErrorCode: "MISSING_PROVIDER_FIELD" }),
  fixture("secret-bearing-provider-payload-rejected", "Secret-bearing provider payload rejected", baseState(), { providerEventInput: { ...providerEvent(), [secretFieldName]: "synthetic-value-must-be-rejected" }, expectedErrorCode: "SECRET_FIELD_REJECTED" }),
  fixture("checkout-evidence-order-reconciled", "Checkout Evidence linked without Purchase mutation", baseState({ attempts: [attempt({ normalizedEvent: BOT_ATTEMPT_EVENTS.CHECKOUT_SUCCEEDED, runtimeStatus: BOT_TASK_STATUSES.SUCCESS, success: true, checkoutEvidenceId: "checkout-evidence.test" })], checkoutEvidence: [evidence({ reviewState: BOT_EVIDENCE_REVIEW_STATES.RECONCILED, orderCandidateLinks: [{ orderCandidateId: "order-candidate.test", observedAt: LATER_AT, confidence: "HIGH", sourceHash: HASH_B, provenance: BOT_PROVENANCE.SYSTEM_DERIVED }], requiresOwnerReview: true })] })),
]);

const FIXTURE_MAP = new Map(PHASE_2D_QA_FIXTURES.map((entry) => [entry.key, entry]));

export function listPhase2dQaFixtures() {
  return PHASE_2D_QA_FIXTURES.map((entry) => ({ key: entry.key, label: entry.label, description: entry.description }));
}

export function getPhase2dQaFixture(key) {
  const fixtureValue = FIXTURE_MAP.get(String(key || ""));
  if (!fixtureValue) throw new Error(`Unknown Phase 2D-A QA fixture: ${String(key)}.`);
  return JSON.parse(JSON.stringify(fixtureValue));
}
