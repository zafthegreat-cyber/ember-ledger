import assert from "node:assert/strict";
import { BOT_OPS_WRITE_LOCK } from "../src/features/botOps/operationCoordinator.js";
import {
  BOT_CAPABILITIES,
  BOT_OPS_COLLECTIONS,
  BOT_OPS_SCHEMA_VERSION,
  BOT_OPS_STORAGE_KEY,
  BOT_PROVIDER_KEYS,
  BOT_OPS_MUTATION_NAMES,
  createBotOpsPersistence,
  createBotOpsRepository,
  createBotOpsService,
  createEmptyBotOpsState,
  createTestOnlyMockBotAdapter,
  deserializeBotOpsState,
  normalizeBotOpsState,
  normalizeBotAttempt,
  normalizeBotInstallation,
  normalizeBotTask,
  normalizeTaskGroup,
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
  equal(state.providers.length, 8);
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
  for (const provider of ["MOCK", "mock", "Mock", "mOcK"]) {
    for (const method of ["createInstallation", "createTaskGroup", "createTask"]) {
      await rejects(() => service[method]({ provider }), /restricted to explicit test execution/, `${method} rejects ${provider} without a test adapter`);
    }
  }
}

{
  const { service, storage } = harness({ withAdapter: false });
  const providers = ["HAYHA", "STELLAR", "SHIKARI", "VALOR", "REFRACT", "POLAR", "SNIPED", "SWOOPER"];
  const savedGraphs = [];
  for (const provider of providers) {
    const installationInput = {
      provider,
      friendlyName: `${provider} test setup`,
      runtimeLabel: "Test computer",
      version: "test-version",
      connectionMode: "MANUAL_RECORD",
      healthState: "DISCONNECTED",
      enabled: false,
    };
    const installation = await service.createInstallation(installationInput);
    equal(installation.connectionMode, "MANUAL_RECORD", `${provider} supports an explicit local record`);
    equal(installation.provider, provider);
    equal(installation.enabled, false);
    equal(installation.healthState, "DISCONNECTED");
    ok(Object.values(installation.capabilitySnapshot).every((value) => value === false));
    equal(normalizeBotInstallation({ provider, friendlyName: "Existing default" }).connectionMode, "LOCAL_COMPANION", "existing default does not change");
    const target = await service.createProductTarget({
      retailerId: "retailer.synthetic.test",
      sku: `TEST-${provider}`,
      title: `Synthetic ${provider} product`,
      maxPrice: { minorUnits: 4999, currency: "USD" },
      provenance: "OWNER_ENTERED",
    });
    const groupInput = { provider, installationId: installation.id, retailerId: target.retailerId, name: `${provider} local plan`, enabled: false };
    const group = await service.createTaskGroup(groupInput);
    const taskInput = {
      provider,
      installationId: installation.id,
      taskGroupId: group.id,
      productTargetId: target.id,
      retailerId: target.retailerId,
      taskMode: "MANUAL_DRAFT",
      runtimeStatus: "DRAFT",
      provenance: "OWNER_ENTERED",
      quantityTarget: 1,
    };
    const task = await service.createTask(taskInput);
    equal(group.enabled, false);
    equal(task.provenance, "OWNER_ENTERED");
    equal(task.runtimeStatus, "DRAFT");
    const editedInstallation = await service.updateRecord("installations", installation.id, { friendlyName: `${provider} edited setup` }, installation.recordVersion);
    equal(editedInstallation.recordVersion, 2);
    equal(editedInstallation.connectionMode, "MANUAL_RECORD");
    equal(editedInstallation.enabled, false);
    savedGraphs.push({ installation: editedInstallation, target, group, task });

    for (const input of [{ enabled: true }, { healthState: "HEALTHY" }]) {
      throws(() => normalizeBotInstallation({ ...installationInput, ...input }), (error) => error.code === "LIVE_INSTALLATION_STATE_PROHIBITED");
    }
    throws(() => normalizeBotInstallation({ ...installationInput, capabilitySnapshot: { TASK_STATUS: true } }), (error) => error.code === "LIVE_CAPABILITY_NOT_AVAILABLE");
    throws(() => normalizeTaskGroup({ ...groupInput, enabled: true }), (error) => error.code === "LIVE_TASK_GROUP_PROHIBITED");
    throws(() => normalizeBotTask({ ...taskInput, runtimeStatus: "RUNNING" }), (error) => error.code === "LIVE_TASK_STATUS_PROHIBITED");
    throws(() => normalizeBotAttempt({
      provider,
      providerEventKey: `${provider}:synthetic-event`,
      providerEventId: "synthetic-event",
      sourceHash: "a".repeat(64),
      installationId: installation.id,
      taskId: task.id,
      retailerId: target.retailerId,
      occurredAt: "2026-10-17T12:00:00.000Z",
    }), (error) => error.code === "LIVE_PROVIDER_EVENT_PROHIBITED");
    await rejects(() => service.updateRecord("installations", installation.id, { enabled: true }, editedInstallation.recordVersion), (error) => error.code === "LIVE_INSTALLATION_STATE_PROHIBITED");
  }
  const beforeReload = storage.getItem(BOT_OPS_STORAGE_KEY);
  const persisted = deserializeBotOpsState(beforeReload).state;
  deepEqual(deserializeBotOpsState(serializeBotOpsState(persisted)).state, persisted, "all provider metadata round trips without a schema change");
  const reloaded = createBotOpsService({ storage });
  deepEqual(await reloaded.listInstallations(), savedGraphs.map(({ installation }) => installation));
  deepEqual(await reloaded.listTaskGroups(), savedGraphs.map(({ group }) => group));
  deepEqual(await reloaded.listTasks(), savedGraphs.map(({ task }) => task));
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), beforeReload, "loading never rewrites or clears existing records");
  equal(reloaded.snapshot().schemaVersion, 1);
  equal(reloaded.snapshot().attempts.length, 0);
  equal(reloaded.snapshot().checkoutEvidence.length, 0);
  for (const provider of ["UNKNOWN", "SNIPED.GG", "POLAR.SH"]) {
    throws(() => normalizeBotInstallation({ provider, friendlyName: "Invalid provider" }), (error) => error.code === "INVALID_ENUM");
  }
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

const localInstallation = (friendlyName) => ({
  provider: "POLAR", friendlyName, connectionMode: "MANUAL_RECORD", enabled: false, healthState: "DISCONNECTED",
});
const readFailed = (error) => error.code === "LOCAL_READ_FAILED";

for (const [label, corrupt] of [
  ["malformed JSON", () => "{unfinished-json"],
  ["empty stored string", () => ""],
  ["future schema", (state) => JSON.stringify({ ...state, schemaVersion: 999 })],
  ["unknown persisted provider", (state) => JSON.stringify({ ...state, installations: state.installations.map((row) => ({ ...row, provider: "FUTURE_PROVIDER" })) })],
]) {
  const { storage, service } = harness({ withAdapter: false });
  const saved = await service.createInstallation(localInstallation("Existing preserved installation"));
  const originalRaw = storage.getItem(BOT_OPS_STORAGE_KEY);
  const originalState = JSON.parse(originalRaw);
  const unsafeRaw = corrupt(originalState);
  storage.values.set(BOT_OPS_STORAGE_KEY, unsafeRaw);
  const writesBefore = storage.writes;
  const repository = createBotOpsRepository(storage);
  const reopened = createBotOpsService({ repository });
  throws(() => repository.load(), readFailed, `${label}: repository read must fail closed`);
  ok(repository.getLastError(), `${label}: preserve the read error for diagnosis`);
  throws(() => reopened.loadSnapshot(), readFailed, `${label}: page load must show an error instead of an empty form`);
  await rejects(() => reopened.listInstallations(), readFailed, `${label}: no empty list fallback`);
  await rejects(() => reopened.createInstallation(localInstallation("Must not replace existing records")), readFailed);
  await rejects(() => reopened.updateRecord("installations", saved.id, { friendlyName: "Must not update" }, saved.recordVersion), readFailed);
  await rejects(() => reopened.archiveRecord("installations", saved.id, saved.recordVersion), readFailed);
  throws(() => repository.save(originalState), readFailed, `${label}: direct save cannot bypass the read gate`);
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), unsafeRaw, `${label}: preserve the original bytes exactly`);
  equal(storage.writes, writesBefore, `${label}: no repair, clear, salvage, or replacement write`);

  // A separate recovery flow can restore known-good bytes; this module never does it itself.
  storage.values.set(BOT_OPS_STORAGE_KEY, originalRaw);
  deepEqual(reopened.loadSnapshot().installations, [saved], `${label}: retry can read restored data`);
  equal(repository.getLastError(), null, `${label}: successful retry clears the read error`);
  equal(storage.writes, writesBefore, `${label}: retry remains read-only`);
}

{
  const { storage, service } = harness({ withAdapter: false });
  const saved = await service.createInstallation(localInstallation("Existing before read failure"));
  const originalRaw = storage.getItem(BOT_OPS_STORAGE_KEY);
  const originalState = JSON.parse(originalRaw);
  const writesBefore = storage.writes;
  let unavailable = false;
  const intermittentStorage = {
    getItem(key) { if (unavailable) throw new Error("Synthetic read failure"); return storage.getItem(key); },
    setItem(key, value) { storage.setItem(key, value); },
  };
  const repository = createBotOpsRepository(intermittentStorage);
  const reopened = createBotOpsService({ repository });
  deepEqual(reopened.loadSnapshot().installations, [saved]);
  unavailable = true;
  throws(() => reopened.loadSnapshot(), readFailed, "a failed reread cannot return a stale cached snapshot");
  await rejects(() => reopened.createInstallation(localInstallation("Blocked during read failure")), readFailed);
  await rejects(() => reopened.updateRecord("installations", saved.id, { friendlyName: "Blocked edit" }, saved.recordVersion), readFailed);
  throws(() => repository.save(originalState), readFailed, "save must recheck storage even after an earlier successful read");
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), originalRaw);
  equal(storage.writes, writesBefore, "a read failure causes no writes");
  unavailable = false;
  deepEqual(reopened.loadSnapshot().installations, [saved], "transient read failure can be retried without clearing anything");
  equal(repository.getLastError(), null);
  const added = await reopened.createInstallation(localInstallation("Added after storage recovers"));
  deepEqual(reopened.loadSnapshot().installations, [saved, added], "successful retry preserves existing records");
}

{
  const { storage, service } = harness({ withAdapter: false });
  await service.createInstallation(localInstallation("Removed by an explicit account-boundary switch"));
  service.loadSnapshot();
  storage.values.delete(BOT_OPS_STORAGE_KEY);
  equal(service.loadSnapshot().installations.length, 0, "a missing storage key cannot resurrect cached records from a previous workspace");
  const added = await service.createInstallation(localInstallation("New workspace installation"));
  deepEqual(service.loadSnapshot().installations, [added]);
}

{
  const repository = createBotOpsRepository({});
  throws(() => repository.load(), readFailed, "unavailable storage cannot open an apparently empty writable workspace");
  throws(() => repository.save(createEmptyBotOpsState()), readFailed);
  const staleRepository = { load: () => createEmptyBotOpsState(), getLastError: () => new Error("Read failed"), save() { throw new Error("Must not save"); } };
  throws(() => createBotOpsService({ repository: staleRepository }).loadSnapshot(), readFailed, "service also honors repositories which report a failed read");
}

{
  const storage = new MemoryStorage();
  const first = createBotOpsService({ storage });
  const second = createBotOpsService({ storage });
  equal(BOT_OPS_MUTATION_NAMES.length, 15, "every service mutation participates in a transaction");
  const saved = await Promise.all(Array.from({ length: 24 }, (_, index) =>
    (index % 2 ? first : second).createInstallation(localInstallation(`Concurrent installation ${index}`))));
  equal(first.loadSnapshot().installations.length, 24, "independent services retain every concurrent create");
  equal(new Set(first.loadSnapshot().installations.map((row) => row.id)).size, 24);
  equal(storage.writes, 24, "each service operation commits one snapshot");
  await Promise.all([
    first.updateRecord("installations", saved[0].id, { friendlyName: "First edited installation" }, saved[0].recordVersion),
    second.updateRecord("installations", saved[1].id, { friendlyName: "Second edited installation" }, saved[1].recordVersion),
  ]);
  equal(first.loadSnapshot().installations.find((row) => row.id === saved[0].id).friendlyName, "First edited installation");
  equal(first.loadSnapshot().installations.find((row) => row.id === saved[1].id).friendlyName, "Second edited installation");
  const staleEdits = await Promise.allSettled([
    first.updateRecord("installations", saved[2].id, { friendlyName: "First version wins" }, saved[2].recordVersion),
    second.updateRecord("installations", saved[2].id, { friendlyName: "Stale version loses" }, saved[2].recordVersion),
  ]);
  equal(staleEdits.filter((result) => result.status === "fulfilled").length, 1);
  equal(staleEdits.find((result) => result.status === "rejected").reason.code, "VERSION_CONFLICT");
  const direct = createBotOpsPersistence({ storage }).collections.installations;
  await Promise.all([direct.create(localInstallation("Direct first")), direct.create(localInstallation("Direct second"))]);
  equal(first.loadSnapshot().installations.length, 26, "direct collection writers use the same lock");

  const repository = createBotOpsRepository(storage);
  const original = storage.getItem(BOT_OPS_STORAGE_KEY);
  let leaked;
  await rejects(() => repository.transact(async (scoped) => {
    leaked = scoped;
    scoped.save({ ...scoped.load(), installations: [] });
    equal(storage.getItem(BOT_OPS_STORAGE_KEY), original, "uncommitted changes are invisible to other services");
    throw new Error("Synthetic validation failure after staging");
  }), /Synthetic validation failure/);
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), original, "failed operation leaves exact original bytes");
  throws(() => leaked.load(), (error) => error.code === "OPERATION_CLOSED");
  await rejects(() => repository.transact(async (scoped) => {
    scoped.save({ ...scoped.load(), installations: [] });
    storage.values.set(BOT_OPS_STORAGE_KEY, `${original} `);
  }), (error) => error.code === "VERSION_CONFLICT");
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), `${original} `, "an uncoordinated writer is never overwritten");
}

{
  const storage = new MemoryStorage();
  const originalService = createBotOpsService({ storage });
  await originalService.createInstallation(localInstallation("Before queued owner change"));
  const before = storage.getItem(BOT_OPS_STORAGE_KEY);
  const writesBefore = storage.writes;
  const repository = createBotOpsRepository(storage);
  let release;
  let entered;
  const acquired = new Promise((resolve) => { entered = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  const holding = repository.transact(async () => { entered(); await held; });
  await acquired;
  let active = true;
  const queuedService = createBotOpsService({ storage, isOperationActive: () => active });
  const queued = queuedService.createInstallation(localInstallation("Must not save after sign out"));
  const cancelled = rejects(() => queued, (error) => error.code === "OPERATION_CANCELLED");
  active = false;
  release();
  await holding;
  await cancelled;
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), before, "queued writes cannot cross the owner session lifetime");
  equal(storage.writes, writesBefore);

  active = true;
  const changingRepository = createBotOpsRepository(storage, { isOperationActive: () => active });
  await rejects(() => changingRepository.transact(async (scoped) => {
    scoped.save({ ...scoped.load(), installations: [] });
    active = false;
  }), (error) => error.code === "OPERATION_CANCELLED");
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), before, "session validity is rechecked immediately before commit");
  equal(storage.writes, writesBefore);
}

{
  const storage = new MemoryStorage();
  const strictRepository = createBotOpsRepository(storage, { requireCrossTabLock: true });
  throws(() => strictRepository.save(createEmptyBotOpsState()), (error) => error.code === "COORDINATED_WRITE_REQUIRED");
  await rejects(() => createBotOpsService({ repository: strictRepository }).createInstallation(localInstallation("Blocked without Web Locks")), (error) => error.code === "LOCK_UNAVAILABLE");
  equal(storage.writes, 0, "unsupported browser coordination never falls back to an unsafe write");
  const requests = [];
  const locks = { async request(name, options, callback) { requests.push({ name, options }); return callback({ name }); } };
  await createBotOpsService({ storage, locks, requireCrossTabLock: true }).createInstallation(localInstallation("Coordinated write"));
  deepEqual(requests, [{ name: BOT_OPS_WRITE_LOCK, options: { mode: "exclusive" } }]);
}

console.log(`Code 3 Bot Operations domain: ${assertions} assertions passed.`);
