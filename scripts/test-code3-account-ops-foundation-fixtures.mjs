import assert from "node:assert/strict";
import {
  ACCOUNT_HEALTH_CENTER_STATES,
  ACCOUNT_OPS_OPERATIONS_COLLECTIONS,
  ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION,
  ACCOUNT_OPS_RETAILER_PRESETS,
  CAPTCHA_CHALLENGE_STATES,
  EXPORT_READINESS_STATES,
  PHONE_RESOURCE_STATES,
  PROXY_GROUP_HEALTH_STATES,
  SERVER_STATES,
  UNIFIED_ORDER_STATES,
  VERIFICATION_ACTION_KINDS,
  VERIFICATION_ACTION_STATES,
  assertSafeAccountOpsInput,
  createAccountOpsOperationsViewModel,
  detectAccountConflicts,
  normalizeAccountOpsOperationsSnapshot,
} from "../src/features/accountOps/index.js";
import {
  PHASE_2A6A_QA_FIXTURES,
  PHASE_2A6A_QA_NOW,
  getPhase2a6aQaFixture,
} from "../src/features/accountOps/operationsFoundation/fixtures/index.js";

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
    assert.equal(Object.isFrozen(current), true, `${message}: nested projection must be frozen`);
    assertions += 1;
    stack.push(...Object.values(current));
  }
}

const EXPECTED_FIXTURE_IDS = [
  "healthy-target-account",
  "walmart-awaiting-mfa",
  "captcha-required",
  "locked-account",
  "disabled-account",
  "unverified-email",
  "unverified-phone",
  "expiring-sms-resource",
  "available-phone",
  "profile-missing-phone",
  "profile-missing-email",
  "virtual-card-metadata",
  "proxy-group-healthy",
  "proxy-group-degraded",
  "stellar-export-not-ready",
  "hayha-export-under-review",
  "server-offline",
  "server-degraded",
  "order-shipped",
  "order-partially-shipped",
  "order-return-pending",
  "verification-expired",
  "duplicate-account-warning",
  "attention-center-mixed",
  "webhook-hub-foundation",
  "cloud-template-foundation",
  "remote-session-closed",
  "browser-session-safe",
  "notification-preferences",
  "sms-waiting-for-verification",
  "captcha-challenge-open",
  "verification-cancelled",
  "unified-order-refunded",
  "secret-bearing-payload-rejection",
];

const CLOUD_TEMPLATE_IDS = [
  "cloud-template:bot-runner",
  "cloud-template:lightweight-monitor",
  "cloud-template:automation-worker",
];

const SPECIAL_RECORD_IDS = Object.freeze({
  "expiring-sms-resource": { phoneResources: ["phone-resource:synthetic-01"] },
  "available-phone": { phoneResources: ["phone-resource:synthetic-01"] },
  "profile-missing-phone": { accountCreationPlans: ["creation-plan:missing-phone"] },
  "profile-missing-email": { accountCreationPlans: ["creation-plan:missing-email"] },
  "virtual-card-metadata": { paymentCards: ["payment-metadata:synthetic-01"] },
  "proxy-group-healthy": { proxyGroupViews: ["proxy-view:synthetic-01"] },
  "proxy-group-degraded": { proxyGroupViews: ["proxy-view:synthetic-01"] },
  "stellar-export-not-ready": { exportReadiness: ["export-readiness:stellar"] },
  "hayha-export-under-review": { exportReadiness: ["export-readiness:hayha"] },
  "server-offline": { serverRecords: ["server:synthetic-01"] },
  "server-degraded": { serverRecords: ["server:synthetic-01"] },
  "order-shipped": { orderViews: ["order-view:synthetic-01"] },
  "order-partially-shipped": { orderViews: ["order-view:synthetic-01"] },
  "order-return-pending": { orderViews: ["order-view:synthetic-01"] },
  "verification-expired": { verificationActions: ["verification:synthetic-01"] },
  "attention-center-mixed": {
    verificationActions: ["verification:synthetic-01"],
    proxyGroupViews: ["proxy-view:synthetic-01"],
    serverRecords: ["server:synthetic-01"],
    orderViews: ["order-view:synthetic-01"],
    workspaceReferences: ["workspace-reference:receiving-review", "workspace-reference:accountant-review", "workspace-reference:inventory-search"],
  },
  "webhook-hub-foundation": { webhookIntegrations: ["webhook:synthetic-01"] },
  "remote-session-closed": { serverRecords: ["server:synthetic-01"], remoteAccessRecords: ["remote-access:synthetic-01"] },
  "browser-session-safe": { browserWorkspaces: ["browser-workspace:synthetic-01"] },
  "notification-preferences": { notificationPreferences: ["notification-preference:verification"] },
  "sms-waiting-for-verification": { phoneResources: ["phone-resource:synthetic-01"] },
  "captcha-challenge-open": { verificationActions: ["verification:synthetic-01"] },
  "verification-cancelled": { verificationActions: ["verification:synthetic-01"] },
  "unified-order-refunded": { orderViews: ["order-view:synthetic-01"] },
});

equal(PHASE_2A6A_QA_NOW, "2026-09-02T16:00:00.000Z", "fixture clock is deterministic");
equal(PHASE_2A6A_QA_FIXTURES.length, 34, "the exact Phase 2A.6-A fixture count is preserved");
deepEqual(PHASE_2A6A_QA_FIXTURES.map((fixture) => fixture.id), EXPECTED_FIXTURE_IDS, "fixture IDs and order are exact");
equal(new Set(EXPECTED_FIXTURE_IDS).size, 34, "fixture IDs are unique");
equal(Object.isFrozen(PHASE_2A6A_QA_FIXTURES), true, "fixture catalog is frozen");
ok(PHASE_2A6A_QA_FIXTURES.every((fixture) => Object.isFrozen(fixture)), "every fixture definition is frozen");
ok(PHASE_2A6A_QA_FIXTURES.every((fixture) => typeof fixture.title === "string" && fixture.title.trim().length > 0), "every fixture has a bounded owner-facing title");
equal(PHASE_2A6A_QA_FIXTURES.filter((fixture) => fixture.expectsRejection).length, 1, "exactly one fixture is intentionally unsafe");
equal(PHASE_2A6A_QA_FIXTURES.find((fixture) => fixture.expectsRejection).id, "secret-bearing-payload-rejection", "the unsafe fixture is explicitly identified");

let networkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls += 1; throw new Error("Fixture generation must not use the network."); };

try {
  for (const definition of PHASE_2A6A_QA_FIXTURES) {
    const fixture = getPhase2a6aQaFixture(definition.id);
    equal(fixture.id, definition.id, `${definition.id}: requested fixture ID is retained`);
    equal(fixture.title, definition.title, `${definition.id}: requested fixture title is retained`);
    equal(fixture.expectsRejection, definition.expectsRejection, `${definition.id}: rejection intent is retained`);
    equal(fixture.accountOps.schemaVersion, 1, `${definition.id}: canonical Account Ops fixture uses schema 1`);
    assertSafeAccountOpsInput(fixture.accountOps, { path: `fixture.${definition.id}.accountOps` });
    assertions += 1;

    const expectedAccountIds = definition.id === "duplicate-account-warning"
      ? ["storeAccounts:target-business-01", "storeAccounts:target-business-duplicate"]
      : ["storeAccounts:target-business-01"];
    deepEqual(fixture.accountOps.storeAccounts.map((row) => row.id), expectedAccountIds, `${definition.id}: canonical synthetic account IDs are exact`);

    if (definition.expectsRejection) {
      equal(fixture.operations, null, `${definition.id}: unsafe input never becomes a normalized projection`);
      ok(fixture.rejectionInput && typeof fixture.rejectionInput === "object", `${definition.id}: rejected source remains isolated for the test`);
      throws(
        () => normalizeAccountOpsOperationsSnapshot(fixture.rejectionInput),
        (error) => error.code === "SECRET_FIELD_REJECTED" && !error.message.includes("[synthetic-redacted]"),
        `${definition.id}: secret-bearing payload fails closed without echoing its value`,
      );
      continue;
    }

    equal(fixture.rejectionInput, null, `${definition.id}: safe fixture has no rejection payload`);
    equal(fixture.operations.contractVersion, ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION, `${definition.id}: operations contract is exact`);
    equal(fixture.operations.persisted, false, `${definition.id}: operations fixture is ephemeral`);
    equal(fixture.operations.authoritative, false, `${definition.id}: operations fixture is non-authoritative`);
    ok(Object.values(fixture.operations.boundaries).every((value) => value === false), `${definition.id}: every live capability remains false`);
    assertSafeAccountOpsInput(fixture.operations, { path: `fixture.${definition.id}.operations` });
    assertions += 1;
    deepFrozen(fixture.operations, `${definition.id} operations`);

    const expectedSpecial = SPECIAL_RECORD_IDS[definition.id] || {};
    for (const collection of ACCOUNT_OPS_OPERATIONS_COLLECTIONS) {
      const expectedIds = collection === "cloudTemplates" ? CLOUD_TEMPLATE_IDS : (expectedSpecial[collection] || []);
      deepEqual(fixture.operations[collection].map((row) => row.id), expectedIds, `${definition.id}: ${collection} record IDs are exact`);
      equal(new Set(fixture.operations[collection].map((row) => row.id)).size, fixture.operations[collection].length, `${definition.id}: ${collection} contains no duplicate IDs`);
    }

    const view = createAccountOpsOperationsViewModel({
      accountOpsSnapshot: fixture.accountOps,
      operationsSnapshot: fixture.operations,
      retailers: ACCOUNT_OPS_RETAILER_PRESETS,
      asOf: PHASE_2A6A_QA_NOW,
    });
    equal(view.writesAllowed, false, `${definition.id}: fixture view exposes no writes`);
    equal(view.networkAllowed, false, `${definition.id}: fixture view exposes no network operation`);
    equal(view.operations.persisted, false, `${definition.id}: fixture view remains ephemeral`);
    deepFrozen(view, `${definition.id} view`);

    switch (definition.id) {
      case "healthy-target-account":
        equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.HEALTHY, "healthy Target account is healthy");
        equal(view.accountHealth[0].retailerId, "retailer-preset:target", "healthy account keeps its Target relationship");
        break;
      case "walmart-awaiting-mfa":
        equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.MFA_REQUIRED, "Walmart fixture needs MFA");
        ok(view.verificationInbox.some((row) => row.kind === VERIFICATION_ACTION_KINDS.MFA), "Walmart fixture produces an MFA action");
        break;
      case "captcha-required": {
        equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.CAPTCHA_REQUIRED, "CAPTCHA fixture needs human verification");
        const action = view.verificationInbox.find((row) => row.kind === VERIFICATION_ACTION_KINDS.CAPTCHA);
        equal(action.challengeState, CAPTCHA_CHALLENGE_STATES.CAPTCHA_REQUIRED, "CAPTCHA fixture retains challenge state");
        equal(action.humanCompletionRequired, true, "CAPTCHA fixture remains human-only");
        equal(action.verificationValueStored, false, "CAPTCHA fixture stores no solution value");
        break;
      }
      case "locked-account": equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.LOCKED, "locked account remains locked"); break;
      case "disabled-account": equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.DISABLED, "disabled account remains disabled"); break;
      case "unverified-email": equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.EMAIL_UNVERIFIED, "unverified email remains explicit"); break;
      case "unverified-phone": equal(view.accountHealth[0].state, ACCOUNT_HEALTH_CENTER_STATES.PHONE_UNVERIFIED, "unverified phone remains explicit"); break;
      case "expiring-sms-resource": equal(view.operations.phoneResources[0].availability, PHONE_RESOURCE_STATES.NEEDS_ATTENTION, "expiring SMS metadata needs attention"); break;
      case "available-phone": {
        equal(view.operations.phoneResources[0].availability, PHONE_RESOURCE_STATES.AVAILABLE, "available phone metadata is unassigned");
        equal(view.operations.phoneResources[0].containsPhoneNumber, false, "phone fixture never contains a number");
        break;
      }
      case "profile-missing-phone": equal(view.operations.accountCreationPlans.find((row) => row.id === "creation-plan:missing-phone").phoneReference, null, "missing phone stays unresolved"); break;
      case "profile-missing-email": equal(view.operations.accountCreationPlans.find((row) => row.id === "creation-plan:missing-email").emailReference, null, "missing email stays unresolved"); break;
      case "virtual-card-metadata": {
        const card = view.operations.paymentCards[0];
        equal(card.last4, "0007", "virtual card fixture retains only last four");
        equal(card.containsFullCardNumber, false, "virtual card fixture excludes PAN");
        equal(card.containsSecurityCode, false, "virtual card fixture excludes security code");
        break;
      }
      case "proxy-group-healthy": equal(view.operations.proxyGroupViews[0].health, PROXY_GROUP_HEALTH_STATES.HEALTHY, "healthy proxy metadata stays healthy"); break;
      case "proxy-group-degraded": equal(view.operations.proxyGroupViews[0].health, PROXY_GROUP_HEALTH_STATES.DEGRADED, "degraded proxy metadata stays review-only"); break;
      case "stellar-export-not-ready": {
        const readiness = view.exportReadiness.find((row) => row.provider === "STELLAR");
        equal(readiness.readinessState, EXPORT_READINESS_STATES.NOT_READY, "Stellar remains not ready");
        equal(readiness.directExportAllowed, false, "Stellar fixture has no direct export");
        break;
      }
      case "hayha-export-under-review": {
        equal(view.exportReadiness.find((row) => row.provider === "HAYHA").readinessState, EXPORT_READINESS_STATES.REVIEW_REQUIRED, "Hayha remains review-only");
        ok(view.attention.some((row) => row.category === "BOTS" && row.area === "automation"), "Bot export review appears in the unified Attention Center");
        break;
      }
      case "server-offline": equal(view.operations.serverRecords[0].status, SERVER_STATES.OFFLINE, "offline server state is metadata only"); break;
      case "server-degraded": equal(view.operations.serverRecords[0].status, SERVER_STATES.DEGRADED, "degraded server state is metadata only"); break;
      case "order-shipped": equal(view.operations.orderViews[0].status, UNIFIED_ORDER_STATES.SHIPPED, "shipped order relationship is preserved"); break;
      case "order-partially-shipped": {
        equal(view.operations.orderViews[0].status, UNIFIED_ORDER_STATES.PARTIALLY_SHIPPED, "partial shipment is explicit");
        equal(view.operations.orderViews[0].shipmentReferences.length, 2, "split shipment references remain bounded metadata");
        break;
      }
      case "order-return-pending": equal(view.operations.orderViews[0].status, UNIFIED_ORDER_STATES.RETURN_STARTED, "return-pending relationship is explicit"); break;
      case "verification-expired": equal(view.operations.verificationActions[0].state, VERIFICATION_ACTION_STATES.EXPIRED, "expired verification stays expired"); break;
      case "duplicate-account-warning": {
        const warnings = detectAccountConflicts(fixture.accountOps, fixture.operations);
        ok(warnings.length >= 2, "duplicate fixture produces multiple safe metadata conflicts");
        ok(warnings.every((row) => row.limitEvasionAllowed === false), "duplicate fixture never authorizes limit evasion");
        break;
      }
      case "attention-center-mixed": {
        const categories = new Set(view.attention.map((row) => row.category));
        ok(["ACCOUNTS", "VERIFICATION", "BOTS", "SERVERS", "ORDERS", "BUSINESS"].every((category) => categories.has(category)), "mixed fixture unifies all expected attention categories");
        ok(view.attention.some((row) => row.sourceId === "receiving-event:synthetic-review"), "mixed fixture includes Receiving discrepancy attention");
        ok(view.attention.some((row) => row.sourceId === "accountant-review:synthetic-review"), "mixed fixture includes Accountant Review attention");
        ok(view.attention.every((row) => row.navigationOnly), "mixed attention remains navigation-only");
        break;
      }
      case "webhook-hub-foundation": {
        const webhook = view.operations.webhookIntegrations[0];
        equal(webhook.enabled, false, "webhook fixture remains disabled");
        equal(webhook.endpointConfigured, false, "webhook fixture contains no endpoint");
        equal(webhook.containsSecret, false, "webhook fixture contains no secret");
        break;
      }
      case "cloud-template-foundation": {
        equal(view.operations.cloudTemplates.length, 3, "cloud fixture exposes three static planning templates");
        ok(view.operations.cloudTemplates.every((row) => row.provisioningEnabled === false), "cloud fixture cannot provision resources");
        break;
      }
      case "remote-session-closed": equal(view.operations.remoteAccessRecords[0].connectionEnabled, false, "remote fixture cannot connect"); break;
      case "browser-session-safe": {
        const browser = view.operations.browserWorkspaces[0];
        equal(browser.antiDetectionEnabled, false, "browser fixture has no anti-detection behavior");
        equal(browser.cookieCaptureAllowed, false, "browser fixture cannot capture cookies");
        break;
      }
      case "notification-preferences": equal(view.operations.notificationPreferences[0].liveDeliveryEnabled, false, "notification fixture cannot send"); break;
      case "sms-waiting-for-verification": {
        const resource = view.operations.phoneResources[0];
        equal(resource.availability, PHONE_RESOURCE_STATES.WAITING_FOR_VERIFICATION, "SMS resource remains pending");
        equal(resource.containsVerificationValue, false, "SMS fixture stores no code");
        break;
      }
      case "captcha-challenge-open": {
        const action = view.operations.verificationActions[0];
        equal(action.challengeState, CAPTCHA_CHALLENGE_STATES.CHALLENGE_OPEN, "open challenge remains human-controlled");
        equal(action.resumeAllowed, false, "open challenge cannot auto-resume");
        break;
      }
      case "verification-cancelled": equal(view.operations.verificationActions[0].state, VERIFICATION_ACTION_STATES.CANCELLED, "cancelled verification remains terminal"); break;
      case "unified-order-refunded": {
        const order = view.operations.orderViews[0];
        equal(order.status, UNIFIED_ORDER_STATES.REFUNDED, "refund relationship is explicit");
        equal(order.inventoryStatus, "UNCHANGED", "refund does not remove Inventory");
        equal(order.inventoryMutationAllowed, false, "order fixture cannot mutate Inventory");
        break;
      }
      default:
        break;
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}

equal(networkCalls, 0, "fixture construction and review perform zero network calls");
throws(() => getPhase2a6aQaFixture("unknown-fixture"), /Unknown Phase 2A\.6-A fixture/, "unknown fixture IDs fail closed");

console.log(`Code 3 Account Ops foundation fixtures: ${PHASE_2A6A_QA_FIXTURES.length}/${PHASE_2A6A_QA_FIXTURES.length} fixtures; ${assertions} assertions passed.`);
