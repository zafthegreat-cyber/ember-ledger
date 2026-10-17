import assert from "node:assert/strict";
import {
  BOT_OPS_COLLECTIONS,
  BOT_PROVIDER_KEYS,
  PHASE_2D_QA_FIXTURES,
  assertSafeBotOpsInput,
  createBotOpsService,
  createTestOnlyMockBotAdapter,
  getPhase2dQaFixture,
  listPhase2dQaFixtures,
  normalizeBotOpsState,
} from "../src/features/botOps/index.js";

class MemoryStorage {
  constructor(initialState = null) { this.values = new Map(initialState ? [["code3.bot-ops.v1", JSON.stringify(initialState)]] : []); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }

const EXPECTED_KEYS = [
  "hayha-disconnected", "stellar-disconnected", "healthy-mock-bot", "degraded-mock-bot",
  "target-pokemon-task-group", "walmart-pokemon-task-group", "one-piece-task-group",
  "task-waiting", "task-monitoring", "carted-synthetic-task", "synthetic-checkout-success",
  "account-error", "proxy-error", "retailer-block", "payment-error", "rate-limit",
  "duplicate-provider-event", "conflicting-task-state", "checkout-evidence-review",
  "same-product-two-bots", "account-multiple-groups", "disabled-account", "disabled-proxy-group",
  "missing-profile", "malformed-provider-payload", "secret-bearing-provider-payload-rejected",
  "checkout-evidence-order-reconciled",
];

equal(PHASE_2D_QA_FIXTURES.length, 27);
deepEqual(PHASE_2D_QA_FIXTURES.map((fixture) => fixture.key), EXPECTED_KEYS);
deepEqual(listPhase2dQaFixtures().map((fixture) => fixture.key), EXPECTED_KEYS);

for (const fixture of PHASE_2D_QA_FIXTURES) {
  equal(fixture.description.includes("reserved synthetic metadata only"), true, `${fixture.key} declares synthetic data`);
  const normalized = normalizeBotOpsState(fixture.state);
  equal(normalized.schemaVersion, 1);
  assert.doesNotThrow(() => assertSafeBotOpsInput(normalized));
  assertions += 1;
  for (const collection of BOT_OPS_COLLECTIONS) {
    equal(Array.isArray(normalized[collection]), true, `${fixture.key}.${collection} is a collection`);
  }
  const clone = getPhase2dQaFixture(fixture.key);
  equal(clone.key, fixture.key);
  clone.state.updatedAt = "changed-only-in-clone";
  equal(getPhase2dQaFixture(fixture.key).state.updatedAt, fixture.state.updatedAt, `${fixture.key} is defensively cloned`);
  const stateText = JSON.stringify(fixture.state);
  equal(/(?:password|refreshToken|cookie|cvv|proxyUrl|proxyPassword)"\s*:/.test(stateText), false, `${fixture.key} state has no secret fields`);
  equal(/https?:\/\/[^\s"/@]+:[^\s"/@]+@/.test(stateText), false, `${fixture.key} state has no credential URL`);
}

assert.throws(() => getPhase2dQaFixture("not-a-fixture"), /Unknown Phase 2D-A QA fixture/);
assertions += 1;

{
  const hayha = getPhase2dQaFixture("hayha-disconnected").state.installations[0];
  equal(hayha.provider, BOT_PROVIDER_KEYS.HAYHA);
  equal(hayha.healthState, "DISCONNECTED");
  equal(hayha.enabled, false);
  ok(Object.values(hayha.capabilitySnapshot).every((value) => value === false));
  const stellar = getPhase2dQaFixture("stellar-disconnected").state.installations[0];
  equal(stellar.provider, BOT_PROVIDER_KEYS.STELLAR);
  equal(stellar.healthState, "DISCONNECTED");
  equal(stellar.enabled, false);
  ok(Object.values(stellar.capabilitySnapshot).every((value) => value === false));
}

{
  equal(getPhase2dQaFixture("healthy-mock-bot").state.installations[0].healthState, "HEALTHY");
  equal(getPhase2dQaFixture("degraded-mock-bot").state.installations[0].healthState, "DEGRADED");
  equal(getPhase2dQaFixture("task-waiting").state.tasks[0].runtimeStatus, "WAITING");
  equal(getPhase2dQaFixture("task-monitoring").state.tasks[0].runtimeStatus, "MONITORING");
  equal(getPhase2dQaFixture("carted-synthetic-task").state.tasks[0].runtimeStatus, "CARTED");
  equal(getPhase2dQaFixture("synthetic-checkout-success").state.tasks[0].runtimeStatus, "SUCCESS");
}

for (const [key, status, category] of [
  ["account-error", "ACCOUNT_ERROR", "ACCOUNT"],
  ["proxy-error", "PROXY_ERROR", "PROXY"],
  ["retailer-block", "RETAILER_BLOCK", "RETAILER_BLOCK"],
  ["payment-error", "PAYMENT_ERROR", "PAYMENT"],
  ["rate-limit", "RATE_LIMITED", "RATE_LIMIT"],
]) {
  const fixture = getPhase2dQaFixture(key).state;
  equal(fixture.tasks[0].runtimeStatus, status);
  equal(fixture.attempts[0].failureCategory, category);
  equal(fixture.attempts[0].success, false);
}

{
  const success = getPhase2dQaFixture("synthetic-checkout-success").state.checkoutEvidence[0];
  equal(success.requiresOwnerReview, true);
  equal(success.purchaseCreated, false);
  equal(success.automaticPurchaseCreationAllowed, false);
  equal(success.inventoryCreated, false);
  equal(success.automaticReceivingAllowed, false);
  const reconciled = getPhase2dQaFixture("checkout-evidence-order-reconciled").state.checkoutEvidence[0];
  equal(reconciled.orderCandidateLinks.length, 1);
  equal(reconciled.purchaseCreated, false);
  equal(reconciled.inventoryCreated, false);
}

{
  const twoBots = getPhase2dQaFixture("same-product-two-bots").state;
  equal(twoBots.installations.length, 2);
  equal(twoBots.tasks.length, 2);
  equal(new Set(twoBots.tasks.map((task) => task.productTargetId)).size, 1, "two bot projections share one product target ID");
  const multipleGroups = getPhase2dQaFixture("account-multiple-groups").state;
  equal(multipleGroups.retailerAccountLinks[0].taskGroupIds.length, 2);
  equal(multipleGroups.retailerAccountLinks.length, 1, "one Account Ops reference is shared rather than cloned");
  equal(getPhase2dQaFixture("disabled-account").state.retailerAccountLinks[0].status, "DISABLED");
  equal(getPhase2dQaFixture("disabled-proxy-group").state.proxyGroups[0].status, "DISABLED");
  ok(getPhase2dQaFixture("missing-profile").state.taskGroups[0].warnings.includes("BOT_PROFILE_MISSING"));
}

for (const key of ["duplicate-provider-event", "malformed-provider-payload", "secret-bearing-provider-payload-rejected"]) {
  const fixture = getPhase2dQaFixture(key);
  const storage = new MemoryStorage(fixture.state);
  const service = createBotOpsService({
    storage,
    testAdapter: createTestOnlyMockBotAdapter({ testMode: true, environment: "test" }),
    idFactory: (prefix) => `${prefix}:fixture-test`,
    now: () => "2026-08-28T18:00:00.000Z",
  });
  if (key === "duplicate-provider-event") {
    for (const providerEvent of fixture.providerEvents) await service.ingestProviderEvent(providerEvent);
    equal((await service.listAttempts()).length, 1);
    equal((await service.listActivity()).length, 1);
  } else {
    await assert.rejects(
      () => service.ingestProviderEvent(fixture.providerEventInput),
      (error) => error.code === fixture.expectedErrorCode,
    );
    assertions += 1;
    equal((await service.listAttempts()).length, 0);
  }
}

console.log(`Code 3 Bot Operations fixtures: 27/27 cases; ${assertions} assertions passed.`);
