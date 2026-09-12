import assert from "node:assert/strict";
import {
  BOT_CAPABILITIES,
  BOT_OPS_COLLECTIONS,
  BOT_OPS_SCHEMA_VERSION,
  BOT_OPS_STORAGE_KEY,
  BOT_PROVIDER_KEYS,
  createBotOpsPersistence,
  createBotOpsRepository,
  createBotOpsService,
  createEmptyBotOpsState,
  createTestOnlyMockBotAdapter,
  deserializeBotOpsState,
  normalizeBotOpsState,
  serializeBotOpsState,
} from "../src/features/botOps/index.js";

class MemoryStorage {
  constructor() { this.values = new Map(); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
}

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(callback, predicate, message) { assert.throws(callback, predicate, message); assertions += 1; }
async function rejects(callback, predicate, message) { await assert.rejects(callback, predicate, message); assertions += 1; }

function harness(options = {}) {
  const storage = options.storage || new MemoryStorage();
  let id = 0;
  let tick = 0;
  const adapter = options.withAdapter === false ? null : createTestOnlyMockBotAdapter({ testMode: true, environment: "test" });
  const service = createBotOpsService({
    storage,
    ...(adapter ? { testAdapter: adapter } : {}),
    idFactory: (prefix) => `${prefix}:test-${id += 1}`,
    now: () => new Date(Date.UTC(2026, 7, 28, 12, 0, tick++)).toISOString(),
  });
  return { adapter, service, storage };
}

async function createGraph(service, suffix = "one") {
  const installation = await service.createInstallation({
    provider: BOT_PROVIDER_KEYS.MOCK,
    friendlyName: `Synthetic runtime ${suffix}`,
    runtimeLabel: `runtime-${suffix}.test`,
    connectionMode: "TEST_ONLY_MOCK",
    healthState: "HEALTHY",
    capabilitySnapshot: {
      [BOT_CAPABILITIES.RUNTIME_HEALTH]: true,
      [BOT_CAPABILITIES.TASK_STATUS]: true,
      [BOT_CAPABILITIES.CHECKOUT_EVIDENCE]: true,
      [BOT_CAPABILITIES.EVENT_HISTORY]: true,
    },
    warnings: ["SYNTHETIC_TEST_ONLY"],
    enabled: true,
  });
  const account = await service.createRetailerAccountLink({
    retailerId: `retailer.${suffix}.test`,
    accountOpsStoreAccountId: `account-ops.store-account.${suffix}.test`,
    accountOpsProfileId: `account-ops.profile.${suffix}.test`,
    accountLabel: `Synthetic account ${suffix}`,
    aliasLabel: `bot-${suffix}@retailer.test`,
    installationIds: [installation.id],
  });
  const profile = await service.createBotProfile({
    displayName: `Synthetic profile ${suffix}`,
    accountOpsProfileId: `account-ops.profile.${suffix}.test`,
    shippingProfileReference: `shipping.${suffix}.test`,
    billingProfileReference: `billing.${suffix}.test`,
    retailerCompatibility: [account.retailerId],
    installationIds: [installation.id],
  });
  const proxy = await service.createProxyGroup({
    displayName: `Synthetic proxy metadata ${suffix}`,
    proxyType: "UNKNOWN",
    providerLabel: "Reserved test metadata",
    region: "us-east-test",
    installationIds: [installation.id],
    retailerIds: [account.retailerId],
    healthState: "HEALTHY",
    latencyMs: 42,
    proxyCount: 2,
    warnings: ["NO_PROXY_CREDENTIALS_STORED"],
  });
  const target = await service.createProductTarget({
    retailerId: account.retailerId,
    canonicalProductId: `catalog.product.${suffix}.test`,
    sku: `SKU-TEST-${suffix.toUpperCase()}`,
    title: `Synthetic product ${suffix}`,
    category: "TCG",
    maxPrice: { minorUnits: 5499, currency: "USD" },
    referencePrice: { minorUnits: 4999, currency: "USD" },
    quantityLimit: 1,
    availabilityMode: "RESTOCK",
    reviewState: "CONFIRMED",
    provenance: "TEST_FIXTURE",
  });
  const group = await service.createTaskGroup({
    name: `Synthetic Task Group ${suffix}`,
    retailerId: account.retailerId,
    productCategory: "TCG",
    provider: BOT_PROVIDER_KEYS.MOCK,
    installationId: installation.id,
    retailerAccountLinkId: account.id,
    botProfileId: profile.id,
    proxyGroupId: proxy.id,
    scheduleMode: "MANUAL",
    taskMode: "MANUAL_DRAFT",
    quantityLimit: 1,
    maxPrice: { minorUnits: 5499, currency: "USD" },
    enabled: true,
    warnings: ["TEST_ONLY_NO_EXTERNAL_EFFECT"],
  });
  const task = await service.createTask({
    taskGroupId: group.id,
    productTargetId: target.id,
    retailerId: account.retailerId,
    provider: BOT_PROVIDER_KEYS.MOCK,
    installationId: installation.id,
    maxPrice: { minorUnits: 5499, currency: "USD" },
    quantityTarget: 1,
    taskMode: "MANUAL_DRAFT",
    retailerAccountLinkId: account.id,
    botProfileId: profile.id,
    proxyGroupId: proxy.id,
    runtimeStatus: "WAITING",
    provenance: "TEST_FIXTURE",
  });
  return { installation, account, profile, proxy, target, group, task };
}

equal(BOT_OPS_STORAGE_KEY, "code3.bot-ops.v1");
equal(BOT_OPS_SCHEMA_VERSION, 1);
deepEqual(BOT_OPS_COLLECTIONS, [
  "installations", "retailerAccountLinks", "botProfiles", "proxyGroups", "productTargets",
  "taskGroups", "tasks", "attempts", "checkoutEvidence", "activity",
]);

for (const option of ["mode", "persistenceMode", "remoteDataSource", "request", "remoteActive", "sync", "migrationApply", "rollbackExecutor", "providerNetworkAccess", "liveAdapter"]) {
  throws(
    () => createBotOpsService({ [option]: option === "mode" ? "REMOTE_ACTIVE" : {} }),
    /LOCAL_ONLY is fixed|does not accept/,
    `${option} cannot select runtime authority`,
  );
}

{
  const { service } = harness();
  equal(service.mode, "LOCAL_ONLY");
  equal(service.authoritative, "LOCAL_ONLY");
  equal(service.remoteActive, false);
  equal(service.providerNetworkAccess, false);
  equal(service.automaticPurchaseCreation, false);
  equal(service.storageKey, BOT_OPS_STORAGE_KEY);
  const state = service.snapshot();
  equal(state.schemaVersion, 1);
  equal(state.providers.length, 2);
  ok(state.providers.every((provider) => provider.connectionStatus === "NOT_CONFIGURED"));
  ok(state.providers.every((provider) => provider.networkAccess === false));
  for (const collection of BOT_OPS_COLLECTIONS) equal(state[collection].length, 0);
  equal("createPurchase" in service, false);
  equal("importPurchase" in service, false);
  equal("receiveInventory" in service, false);
  equal("createInventory" in service, false);
  equal("delete" in service, false);
}

{
  const { service, storage } = harness();
  const graph = await createGraph(service);
  for (const record of Object.values(graph)) {
    equal(record.recordVersion, 1);
    ok(record.id);
    ok(record.createdAt);
    ok(record.updatedAt);
  }
  equal(graph.account.accountOpsStoreAccountId, "account-ops.store-account.one.test");
  equal(graph.account.accountOpsProfileId, "account-ops.profile.one.test");
  equal(graph.profile.accountOpsProfileId, "account-ops.profile.one.test");
  equal(graph.proxy.proxyCount, 2);
  equal(graph.target.maxPrice.minorUnits, 5499);
  equal(graph.target.maxPrice.currency, "USD");
  equal(graph.group.installationId, graph.installation.id);
  equal(graph.task.taskGroupId, graph.group.id);
  equal(graph.task.productTargetId, graph.target.id);
  equal((await service.listInstallations()).length, 1);
  equal((await service.listRetailerAccountLinks()).length, 1);
  equal((await service.listBotProfiles()).length, 1);
  equal((await service.listProxyGroups()).length, 1);
  equal((await service.listProductTargets()).length, 1);
  equal((await service.listTaskGroups()).length, 1);
  equal((await service.listTasks()).length, 1);
  ok(storage.getItem(BOT_OPS_STORAGE_KEY));
  const hashBefore = await service.stateHash();
  const targetUpdated = await service.updateRecord("productTargets", graph.target.id, { title: "Synthetic product updated" }, graph.target.recordVersion);
  equal(targetUpdated.recordVersion, 2);
  equal(targetUpdated.title, "Synthetic product updated");
  const hashAfter = await service.stateHash();
  ok(hashAfter !== hashBefore, "state hashing changes with normalized state");
  await rejects(
    () => service.updateRecord("productTargets", graph.target.id, { title: "Stale update" }, graph.target.recordVersion),
    (error) => error.code === "VERSION_CONFLICT",
  );
  const archived = await service.archiveRecord("proxyGroups", graph.proxy.id, graph.proxy.recordVersion);
  equal(archived.status, "ARCHIVED");
  ok(archived.archivedAt);

  await rejects(
    () => service.createTaskGroup({
      name: "Mismatched retailer",
      retailerId: "retailer.other.test",
      provider: BOT_PROVIDER_KEYS.MOCK,
      installationId: graph.installation.id,
      retailerAccountLinkId: graph.account.id,
    }),
    /retailer must match/,
  );
  await rejects(
    () => service.createTask({
      taskGroupId: graph.group.id,
      productTargetId: graph.target.id,
      retailerId: "retailer.other.test",
      provider: BOT_PROVIDER_KEYS.MOCK,
      installationId: graph.installation.id,
    }),
    /retailer must match/,
  );
}

{
  const { service } = harness({ withAdapter: false });
  await rejects(
    () => service.ingestProviderEvent({ taskId: "task.synthetic.test" }),
    /No bot provider adapter is configured/,
  );
}

{
  const empty = createEmptyBotOpsState(() => "2026-08-28T12:00:00.000Z");
  equal(empty.schemaVersion, 1);
  equal(empty.updatedAt, "2026-08-28T12:00:00.000Z");
  const serialized = serializeBotOpsState(empty);
  deepEqual(deserializeBotOpsState(serialized).state, empty);
  const corrupt = deserializeBotOpsState("{not-json", { now: () => "2026-08-28T12:00:00.000Z" });
  ok(corrupt.error);
  equal(corrupt.state.schemaVersion, 1);
  throws(() => normalizeBotOpsState({ ...empty, unexpected: [] }), (error) => error.code === "UNKNOWN_STATE_FIELD");
  throws(() => normalizeBotOpsState({ ...empty, schemaVersion: 99 }), (error) => error.code === "UNSUPPORTED_SCHEMA_VERSION");
}

{
  const { storage, service } = harness();
  const graph = await createGraph(service);
  const event = {
    providerEventId: "event.append-only.test",
    installationId: graph.installation.id,
    taskId: graph.task.id,
    retailerId: graph.account.retailerId,
    occurredAt: "2026-08-28T13:00:00.000Z",
    normalizedEvent: "TASK_MONITORING",
    runtimeStatus: "MONITORING",
    success: false,
    failureCategory: "NONE",
    message: "Synthetic monitoring event.",
    productTargetId: graph.target.id,
    retailerAccountLinkId: graph.account.id,
    botProfileId: graph.profile.id,
    proxyGroupId: graph.proxy.id,
  };
  await service.ingestProviderEvent(event);
  const persistence = createBotOpsPersistence({ storage, now: () => "2026-08-28T14:00:00.000Z" });
  const attempt = (await persistence.collections.attempts.list({ includeArchived: true })).records[0];
  const activity = (await persistence.collections.activity.list({ includeArchived: true })).records[0];
  throws(() => persistence.collections.attempts.update(attempt.id, {}, attempt.recordVersion), (error) => error.code === "APPEND_ONLY_COLLECTION");
  throws(() => persistence.collections.attempts.archive(attempt.id, attempt.recordVersion), (error) => error.code === "APPEND_ONLY_COLLECTION");
  throws(() => persistence.collections.activity.update(activity.id, {}, activity.recordVersion), (error) => error.code === "APPEND_ONLY_COLLECTION");
  throws(() => persistence.collections.activity.archive(activity.id, activity.recordVersion), (error) => error.code === "APPEND_ONLY_COLLECTION");
}

{
  const repository = createBotOpsRepository(new MemoryStorage(), { now: () => "2026-08-28T12:00:00.000Z" });
  const first = repository.load();
  first.updatedAt = "changed-only-in-clone";
  equal(repository.load().updatedAt, "2026-08-28T12:00:00.000Z", "repository loads return defensive clones");
}

console.log(`Code 3 Bot Operations domain: ${assertions} assertions passed.`);
