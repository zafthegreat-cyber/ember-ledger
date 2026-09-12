import assert from "node:assert/strict";
import {
  BOT_PILOT_READINESS,
  BOT_CAPABILITIES,
  BOT_PROVIDER_CONNECTION_STATUS,
  BOT_PROVIDER_KEYS,
} from "../src/features/botOps/constants.js";
import {
  BOT_PROVIDER_FOUNDATION_STATUS,
  getBotProvider,
  listAvailableBotProviders,
  listBotProviders,
} from "../src/features/botOps/providerRegistry.js";
import {
  assertBotProviderAdapter,
  createTestOnlyMockBotAdapter,
  createUnavailableBotAdapter,
} from "../src/features/botOps/providerAdapters.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(callback, predicate, message) { assert.throws(callback, predicate, message); assertions += 1; }
async function rejects(callback, predicate, message) { await assert.rejects(callback, predicate, message); assertions += 1; }

const providers = listBotProviders();
deepEqual(providers.map((provider) => provider.providerKey), [BOT_PROVIDER_KEYS.HAYHA, BOT_PROVIDER_KEYS.STELLAR]);
equal(BOT_PROVIDER_FOUNDATION_STATUS.providerCount, 2);
equal(BOT_PROVIDER_FOUNDATION_STATUS.configuredProviderCount, 0);
equal(BOT_PROVIDER_FOUNDATION_STATUS.liveCapabilityCount, 0);
equal(BOT_PROVIDER_FOUNDATION_STATUS.liveTaskCount, 0);
equal(BOT_PROVIDER_FOUNDATION_STATUS.providerNetworkAccess, false);
deepEqual(listAvailableBotProviders(), []);
equal(getBotProvider("unknown"), null);

for (const provider of providers) {
  equal(provider.connectionStatus, BOT_PROVIDER_CONNECTION_STATUS.NOT_CONFIGURED, `${provider.displayName} stays not configured`);
  equal(provider.configurationReady, false);
  equal(provider.live, false);
  equal(provider.networkAccess, false);
  equal(provider.version, null);
  equal(provider.supportedRetailersVerified, false);
  deepEqual(provider.supportedRetailers, []);
  deepEqual(provider.supportedIntegrationModes, []);
  ok(provider.potentialIntegrationModes.length >= 4);
  ok(Object.values(BOT_CAPABILITIES).every((capability) => provider.capabilities[capability] === false));
  ok(provider.warnings.includes("PROVIDER_NOT_CONFIGURED"));
  ok(provider.warnings.includes("LIVE_ADAPTER_NOT_IMPLEMENTED"));
  equal(provider.discovery.liveCapabilitiesEnabled, false);
  equal(provider.discovery.providerNetworkAccess, false);
  ok(Object.values(BOT_PILOT_READINESS).includes(provider.discovery.pilotReadiness));
  ok(provider.discovery.evidenceCount > 0);
}

const mutableClone = getBotProvider(BOT_PROVIDER_KEYS.HAYHA);
mutableClone.displayName = "Changed only in test clone";
equal(getBotProvider(BOT_PROVIDER_KEYS.HAYHA).displayName, "Hayha", "registry projections are defensive clones");

for (const providerKey of [BOT_PROVIDER_KEYS.HAYHA, BOT_PROVIDER_KEYS.STELLAR]) {
  const adapter = createUnavailableBotAdapter(providerKey);
  equal(assertBotProviderAdapter(adapter), adapter);
  const description = adapter.describe();
  equal(description.provider, providerKey);
  equal(description.connectionStatus, BOT_PROVIDER_CONNECTION_STATUS.NOT_CONFIGURED);
  equal(description.live, false);
  equal(description.networkAccess, false);
  ok(Object.values(description.capabilities).every((supported) => supported === false));
  const health = await adapter.runtimeHealth();
  equal(health.state, "DISCONNECTED");
  equal(health.live, false);
  equal(health.networkAccess, false);
  deepEqual(await adapter.discoverTasks(), []);
  for (const method of ["normalizeEvent", "startTask", "stopTask", "restartTask"]) {
    await rejects(
      async () => adapter[method]("synthetic-task"),
      (error) => error.code === "CAPABILITY_UNAVAILABLE" && error.details.externalEffect === false,
      `${providerKey}.${method} must fail without external effects`,
    );
  }
}

throws(
  () => createUnavailableBotAdapter("UNREGISTERED"),
  (error) => error.code === "UNKNOWN_PROVIDER",
);
throws(
  () => assertBotProviderAdapter({}),
  (error) => error.code === "INVALID_ADAPTER",
);
throws(
  () => assertBotProviderAdapter({
    describe: () => ({ live: true, networkAccess: true }),
    runtimeHealth() {}, discoverTasks() {}, normalizeEvent() {}, startTask() {}, stopTask() {}, restartTask() {},
  }),
  (error) => error.code === "LIVE_ADAPTER_PROHIBITED",
);
throws(
  () => createTestOnlyMockBotAdapter(),
  (error) => error.code === "TEST_ADAPTER_RESTRICTED",
);
throws(
  () => createTestOnlyMockBotAdapter({ testMode: true, environment: "preview" }),
  (error) => error.code === "TEST_ADAPTER_RESTRICTED",
);

const mock = createTestOnlyMockBotAdapter({
  testMode: true,
  environment: "test",
  healthState: "DEGRADED",
  tasks: [{ id: "task:test-visible", status: "WAITING" }],
  capabilities: [BOT_CAPABILITIES.RUNTIME_HEALTH, BOT_CAPABILITIES.TASK_STATUS],
});
const mockDescription = mock.describe();
equal(mockDescription.provider, BOT_PROVIDER_KEYS.MOCK);
equal(mockDescription.live, false);
equal(mockDescription.networkAccess, false);
equal(mockDescription.testOnly, true);
equal(mockDescription.capabilities[BOT_CAPABILITIES.RUNTIME_HEALTH], true);
equal(mockDescription.capabilities[BOT_CAPABILITIES.TASK_STATUS], true);
equal(mockDescription.capabilities[BOT_CAPABILITIES.START_TASK], false);
equal((await mock.runtimeHealth()).state, "DEGRADED");
deepEqual(await mock.discoverTasks(), [{ id: "task:test-visible", status: "WAITING" }]);

for (const method of ["startTask", "stopTask", "restartTask"]) {
  const result = mock[method]("task:test-visible");
  equal(result.action, method);
  equal(result.taskId, "task:test-visible");
  equal(result.testOnly, true);
  equal(result.externalEffect, false);
}

const normalized = mock.normalizeEvent({
  providerEventId: "event:test-001",
  installationId: "installation:test-001",
  taskId: "task:test-001",
  retailerId: "retailer:test-target",
  occurredAt: "2026-08-28T12:00:00.000Z",
  normalizedEvent: "TASK_MONITORING",
  runtimeStatus: "MONITORING",
  success: false,
  failureCategory: "NONE",
  message: "Synthetic status only.",
});
equal(normalized.occurredAt, "2026-08-28T12:00:00.000Z");
equal(normalized.success, false);
equal(normalized.message, "Synthetic status only.");
throws(
  () => mock.normalizeEvent({ ...normalized, rawPayload: { token: "not-retained" } }),
  (error) => ["RAW_PROVIDER_DATA_REJECTED", "SECRET_FIELD_REJECTED"].includes(error.code),
);
throws(
  () => mock.normalizeEvent({ ...normalized, normalizedEvent: "NOT_REAL" }),
  (error) => error.code === "INVALID_EVENT_TYPE",
);

console.log(`Code 3 Bot Operations provider contract: ${assertions} assertions passed.`);
