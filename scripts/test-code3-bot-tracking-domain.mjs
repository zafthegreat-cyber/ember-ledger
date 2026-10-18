import assert from "node:assert/strict";
import {
  BOT_OPS_COLLECTIONS, BOT_OPS_MUTATION_NAMES, BOT_OPS_STORAGE_KEY,
  createBotOpsService, createBotOpsRepository, createTestOnlyMockBotAdapter,
} from "../src/features/botOps/index.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
async function rejects(callback, predicate, message) { await assert.rejects(callback, predicate, message); assertions += 1; }
const code = (expected) => (error) => error.code === expected;

class MemoryStorage {
  constructor() { this.values = new Map(); this.writes = 0; this.fail = false; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw new Error("Synthetic quota failure"); this.writes += 1; this.values.set(key, String(value)); }
}

function makeHarness(options = {}) {
  const storage = options.storage || new MemoryStorage();
  let sequence = 0;
  const service = createBotOpsService({ storage, now: () => "2026-10-17T16:00:00.000Z", idFactory: (prefix) => `${prefix}:manual-test-${++sequence}`, ...options });
  return { storage, service };
}

const installationInput = (provider = "POLAR") => ({ provider, friendlyName: `${provider} synthetic installation`, connectionMode: "MANUAL_RECORD", enabled: false, healthState: "DISCONNECTED" });
const planInput = (installationId, overrides = {}) => ({ installationId, retailerId: "retailer-preset:target", title: "Synthetic collector box", identifierType: "sku", identifierValue: "TEST-BOX-001", quantityTarget: 2, maxPrice: { minorUnits: 4999, currency: "USD" }, notes: "Review this plan before shopping.", ...overrides });

async function seeded(options = {}) {
  const harness = makeHarness(options);
  const installation = await harness.service.createInstallation(installationInput());
  const plan = await harness.service.createManualPlan(planInput(installation.id));
  return { ...harness, installation, ...plan };
}

async function unchangedOnReject(harness, action, predicate, message) {
  const before = harness.storage.getItem(BOT_OPS_STORAGE_KEY);
  const writes = harness.storage.writes;
  await rejects(action, predicate, message);
  equal(harness.storage.getItem(BOT_OPS_STORAGE_KEY), before, `${message}: preserve exact bytes`);
  equal(harness.storage.writes, writes, `${message}: no writes`);
}

ok(BOT_OPS_MUTATION_NAMES.includes("createManualPlan"));
ok(BOT_OPS_MUTATION_NAMES.includes("updateManualPlan"));

for (const provider of ["HAYHA", "STELLAR", "SHIKARI", "VALOR", "REFRACT", "POLAR", "SNIPED", "SWOOPER"]) {
  const { storage, service } = makeHarness();
  const installation = await service.createInstallation(installationInput(provider));
  const collateral = '{"synthetic":"existing collection and latest prices"}';
  storage.values.set("unrelated.synthetic.records", collateral);
  const writesBefore = storage.writes;
  const result = await service.createManualPlan(planInput(installation.id));
  equal(storage.writes, writesBefore + 1, `${provider}: all plan records commit together`);
  deepEqual(Object.keys(result).sort(), ["group", "target", "task"]);
  equal(result.task.provider, provider);
  equal(result.group.provider, provider);
  equal(result.task.installationId, installation.id);
  equal(result.task.taskGroupId, result.group.id);
  equal(result.task.productTargetId, result.target.id);
  equal(result.task.retailerId, result.target.retailerId);
  equal(result.task.runtimeStatus, "DRAFT");
  equal(result.task.taskMode, "MANUAL_DRAFT");
  equal(result.task.provenance, "OWNER_ENTERED");
  equal(result.task.lastAttemptAt, null);
  equal(result.task.lastResult, "");
  equal(result.group.enabled, false);
  equal(result.group.scheduleMode, "MANUAL");
  equal(result.group.taskMode, "MANUAL_DRAFT");
  equal(result.target.quantityLimit, 2);
  equal(result.task.quantityTarget, 2);
  deepEqual(result.task.maxPrice, { minorUnits: 4999, currency: "USD" });
  equal(result.target.notes, "Review this plan before shopping.");
  for (const record of Object.values(result)) { equal(record.recordVersion, 1); ok(record.id); }
  const snapshot = service.loadSnapshot();
  deepEqual(snapshot.installations, [installation], "installation is unchanged");
  equal(snapshot.activity.length, 1);
  equal(snapshot.activity[0].type, "MANUAL_PLAN_CREATED");
  equal(snapshot.activity[0].taskId, result.task.id);
  equal(snapshot.activity[0].taskGroupId, result.group.id);
  equal(snapshot.activity[0].installationId, installation.id);
  equal(snapshot.activity[0].attemptId, null);
  equal(snapshot.attempts.length, 0);
  equal(snapshot.checkoutEvidence.length, 0);
  equal(storage.getItem("unrelated.synthetic.records"), collateral);
}

{
  const { service, storage } = makeHarness();
  const installation = await service.createInstallation(installationInput());
  for (const identifierType of ["sku", "tcin", "upc", "canonicalProductId"]) {
    const plan = await service.createManualPlan(planInput(installation.id, { identifierType, identifierValue: "synthetic-product-123", maxPrice: null, quantityTarget: 1, notes: undefined }));
    equal(plan.target[identifierType], "synthetic-product-123");
    equal(plan.task.maxPrice, null);
    equal(plan.target.notes, "");
  }
  equal(service.loadSnapshot().tasks.length, 4);
  equal(storage.writes, 5, "each plan uses a single local commit");
}

{
  const harness = await seeded();
  const { service, task, target, group, storage } = harness;
  const sibling = await service.createTask({ provider: task.provider, installationId: task.installationId, retailerId: task.retailerId, taskGroupId: group.id, productTargetId: target.id, quantityTarget: 7, maxPrice: { minorUnits: 9000, currency: "USD" } });
  const before = service.loadSnapshot();
  let current = task;
  for (const runtimeStatus of ["READY", "PAUSED", "STOPPED", "UNKNOWN", "DRAFT"]) {
    const writesBefore = storage.writes;
    current = await service.updateManualPlan(current.id, { runtimeStatus, quantityTarget: 3, maxPrice: null }, current.recordVersion);
    equal(current.runtimeStatus, runtimeStatus);
    equal(current.quantityTarget, 3);
    equal(current.maxPrice, null);
    equal(storage.writes, writesBefore + 1, "task edit and activity commit atomically");
  }
  equal(current.recordVersion, task.recordVersion + 5);
  const after = service.loadSnapshot();
  deepEqual(after.tasks.find((row) => row.id === sibling.id), sibling, "shared-target sibling task is untouched");
  for (const collection of BOT_OPS_COLLECTIONS.filter((name) => !["tasks", "activity"].includes(name))) deepEqual(after[collection], before[collection], `${collection} unchanged by plan edits`);
  deepEqual(after.productTargets, [target]);
  deepEqual(after.taskGroups, [group]);
  equal(after.activity.length, 6);
  equal(after.activity.at(-1).type, "MANUAL_PLAN_UPDATED");
  equal(after.activity.at(-1).taskId, task.id);
  equal(after.activity[1].summary, "Planning stage: Planning → Plan ready. Quantity: 2 → 3. Price cap: 49.99 USD → Not set. Manual record only; no bot task was controlled.");
  equal(after.activity.at(-1).summary, "Planning stage: Unknown → Planning. Manual record only; no bot task was controlled.");
  equal(current.lastAttemptAt, null);
  equal(current.lastResult, "");
  const beforeNoOp = storage.getItem(BOT_OPS_STORAGE_KEY);
  const writesBeforeNoOp = storage.writes;
  const noOp = await service.updateManualPlan(current.id, { runtimeStatus: current.runtimeStatus, quantityTarget: current.quantityTarget, maxPrice: current.maxPrice }, current.recordVersion);
  deepEqual(noOp, current, "unchanged planning details keep the same record version");
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), beforeNoOp, "no-op updates retain exact bytes and activity history");
  equal(storage.writes, writesBeforeNoOp, "no-op updates do not write");
  await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { quantityTarget: 9 }, task.recordVersion), code("VERSION_CONFLICT"), "stale edit");
  await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { quantityTarget: current.quantityTarget }, task.recordVersion), code("VERSION_CONFLICT"), "stale no-op still checks expected version");
  for (const expectedVersion of [undefined, null, 0, -1, 1.1, "6"]) {
    await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { quantityTarget: 9 }, expectedVersion), code("EXPECTED_VERSION_REQUIRED"), "invalid expected version");
  }
}

{
  const { service, task } = await seeded();
  let current = await service.updateManualPlan(task.id, { maxPrice: { minorUnits: 10000, currency: "USD" } }, task.recordVersion);
  equal(service.loadSnapshot().activity.at(-1).summary, "Price cap: 49.99 USD → 100.00 USD. Manual record only; no bot task was controlled.");
  current = await service.updateManualPlan(task.id, { maxPrice: { minorUnits: 10000, currency: "CAD" } }, current.recordVersion);
  equal(service.loadSnapshot().activity.at(-1).summary, "Price cap: 100.00 USD → 100.00 CAD. Manual record only; no bot task was controlled.");
  await service.updateManualPlan(task.id, { maxPrice: { minorUnits: 0, currency: "CAD" } }, current.recordVersion);
  equal(service.loadSnapshot().activity.at(-1).summary, "Price cap: 100.00 CAD → 0.00 CAD. Manual record only; no bot task was controlled.");
}

{
  const harness = await seeded();
  const { service, task, installation } = harness;
  const valid = planInput(installation.id);
  for (const [patch, errorCode] of [
    [{ provider: "STELLAR" }, "UNKNOWN_FIELD"], [{ runtimeStatus: "RUNNING" }, "UNKNOWN_FIELD"],
    [{ enabled: true }, "UNKNOWN_FIELD"], [{ taskGroupId: "other" }, "UNKNOWN_FIELD"],
    [{ identifierType: "url" }, "INVALID_IDENTIFIER_TYPE"], [{ identifierType: "SKU" }, "INVALID_IDENTIFIER_TYPE"],
    [{ identifierValue: " " }, "PRODUCT_ID_REQUIRED"], [{ identifierValue: {} }, "PRODUCT_ID_REQUIRED"],
    [{ title: "" }, "REQUIRED_FIELD"], [{ retailerId: "invalid retailer name" }, "INVALID_ID"],
    [{ quantityTarget: 0 }, "INVALID_INTEGER"], [{ quantityTarget: 1.5 }, "INVALID_INTEGER"], [{ quantityTarget: 1001 }, "INVALID_INTEGER"],
    [{ maxPrice: { minorUnits: -1, currency: "USD" } }, "NEGATIVE_MONEY"],
    [{ maxPrice: { minorUnits: 49.99, currency: "USD" } }, "INVALID_MINOR_UNITS"],
    [{ notes: "password=synthetic-secret" }, "CREDENTIAL_TEXT_REJECTED"],
    [{ notes: "license key: synthetic-secret" }, "CREDENTIAL_TEXT_REJECTED"],
    [{ ownerId: "synthetic-owner" }, "AUTHORITY_FIELD_REJECTED"],
    [{ password: "synthetic-secret" }, "SECRET_FIELD_REJECTED"], [{ raw: {} }, "RAW_PROVIDER_DATA_REJECTED"],
  ]) await unchangedOnReject(harness, () => service.createManualPlan({ ...valid, ...patch }), code(errorCode), `invalid create ${Object.keys(patch)[0]}`);
  const missingQuantity = { ...valid }; delete missingQuantity.quantityTarget;
  await unchangedOnReject(harness, () => service.createManualPlan(missingQuantity), code("REQUIRED_FIELD"), "missing plan quantity");
  for (const [patch, errorCode] of [
    [{}, "EMPTY_PATCH"], [{ title: "Changed product" }, "UNKNOWN_FIELD"], [{ notes: "Changed shared notes" }, "UNKNOWN_FIELD"],
    [{ provider: "STELLAR" }, "UNKNOWN_FIELD"], [{ installationId: installation.id }, "UNKNOWN_FIELD"],
    [{ quantityTarget: null }, "INVALID_INTEGER"], [{ quantityTarget: 1001 }, "INVALID_INTEGER"],
    [{ maxPrice: { minorUnits: -1, currency: "USD" } }, "NEGATIVE_MONEY"],
    [{ runtimeStatus: "SUCCESS" }, "MANUAL_STAGE_REQUIRED"], [{ runtimeStatus: "RUNNING" }, "MANUAL_STAGE_REQUIRED"],
    [{ runtimeStatus: "MONITORING" }, "MANUAL_STAGE_REQUIRED"], [{ runtimeStatus: "WAITING" }, "MANUAL_STAGE_REQUIRED"],
    [{ runtimeStatus: "FAILED" }, "MANUAL_STAGE_REQUIRED"], [{ runtimeStatus: null }, "MANUAL_STAGE_REQUIRED"],
    [{ runtimeStatus: "ready" }, "MANUAL_STAGE_REQUIRED"], [{ ownerId: "other" }, "AUTHORITY_FIELD_REJECTED"],
  ]) await unchangedOnReject(harness, () => service.updateManualPlan(task.id, patch, task.recordVersion), code(errorCode), `invalid edit ${Object.keys(patch)[0] || "empty"}`);
}

for (const collection of ["installations", "taskGroups", "productTargets"]) {
  for (const disposition of ["archived", "missing"]) {
    const harness = await seeded();
    const { storage, service, task, target, group, installation } = harness;
    const record = { installations: installation, taskGroups: group, productTargets: target }[collection];
    if (disposition === "archived") await service.archiveRecord(collection, record.id, record.recordVersion);
    else {
      const state = JSON.parse(storage.getItem(BOT_OPS_STORAGE_KEY));
      state[collection] = state[collection].filter((row) => row.id !== record.id);
      storage.values.set(BOT_OPS_STORAGE_KEY, JSON.stringify(state));
    }
    await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { quantityTarget: 3 }, task.recordVersion), code("ACTIVE_REFERENCE_REQUIRED"), `${disposition} ${collection} blocks edits`);
    if (collection === "installations") await unchangedOnReject(harness, () => service.createManualPlan(planInput(installation.id)), code("ACTIVE_REFERENCE_REQUIRED"), `${disposition} installation blocks create`);
  }
}

{
  const harness = await seeded();
  const { service, task } = harness;
  await service.archiveRecord("tasks", task.id, task.recordVersion);
  await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { runtimeStatus: "DRAFT" }, task.recordVersion + 1), code("MANUAL_PLAN_ARCHIVED"), "archived task");
  await unchangedOnReject(harness, () => service.updateManualPlan("tasks:missing", { runtimeStatus: "DRAFT" }, 1), /was not found/, "missing task");
}

{
  const harness = await seeded();
  const { service, storage, task } = harness;
  const state = JSON.parse(storage.getItem(BOT_OPS_STORAGE_KEY));
  state.taskGroups[0].retailerId = "retailer-preset:walmart";
  storage.values.set(BOT_OPS_STORAGE_KEY, JSON.stringify(state));
  await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { quantityTarget: 3 }, task.recordVersion), /retailer must match/, "mismatched references");
}

{
  const harness = await seeded();
  const { service, storage, installation, task } = harness;
  storage.fail = true;
  await unchangedOnReject(harness, () => service.createManualPlan(planInput(installation.id)), code("LOCAL_SAVE_FAILED"), "failed create commit leaves no orphan target/group/task/activity");
  await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { quantityTarget: 5 }, task.recordVersion), code("LOCAL_SAVE_FAILED"), "failed edit commit leaves task/history together");
  storage.fail = false;
  const retried = await service.createManualPlan(planInput(installation.id));
  equal(service.loadSnapshot().tasks.length, 2);
  equal(service.loadSnapshot().activity.length, 2);
  ok(retried.task.id !== task.id);
}

for (const failingCollection of ["taskGroups", "tasks", "bot-activity"]) {
  const harness = makeHarness({ idFactory: (collection) => collection === failingCollection ? "invalid synthetic id" : `${collection}:valid-synthetic-id` });
  const installation = await harness.service.createInstallation(installationInput());
  await unchangedOnReject(harness, () => harness.service.createManualPlan(planInput(installation.id)), code("INVALID_ID"), `validation failure while staging ${failingCollection}`);
  const snapshot = harness.service.loadSnapshot();
  for (const collection of ["productTargets", "taskGroups", "tasks", "activity"]) equal(snapshot[collection].length, 0, `${failingCollection} failure leaves no partial ${collection}`);
}

{
  const harness = await seeded();
  const repository = createBotOpsRepository(harness.storage);
  const uncoordinated = createBotOpsService({ repository: { load: repository.load, save: repository.save, getLastError: repository.getLastError } });
  await unchangedOnReject(harness, () => uncoordinated.createManualPlan(planInput(harness.installation.id)), code("ATOMIC_OPERATION_REQUIRED"), "uncoordinated create cannot leave partial plans");
  await unchangedOnReject(harness, () => uncoordinated.updateManualPlan(harness.task.id, { quantityTarget: 3 }, harness.task.recordVersion), code("ATOMIC_OPERATION_REQUIRED"), "uncoordinated edit cannot leave partial history");
}

{
  const harness = makeHarness({ testAdapter: createTestOnlyMockBotAdapter({ testMode: true, environment: "test" }) });
  const { service } = harness;
  const installation = await service.createInstallation({ provider: "MOCK", friendlyName: "Synthetic test adapter" });
  await unchangedOnReject(harness, () => service.createManualPlan(planInput(installation.id)), code("MANUAL_PROVIDER_REQUIRED"), "mock cannot become a manual real-provider plan");
  const target = await service.createProductTarget({ retailerId: "retailer-preset:target", sku: "TEST-MOCK", title: "Synthetic mock target" });
  const group = await service.createTaskGroup({ provider: "MOCK", installationId: installation.id, retailerId: target.retailerId, name: "Synthetic mock group" });
  const task = await service.createTask({ provider: "MOCK", installationId: installation.id, retailerId: target.retailerId, taskGroupId: group.id, productTargetId: target.id, provenance: "TEST_FIXTURE" });
  await unchangedOnReject(harness, () => service.updateManualPlan(task.id, { runtimeStatus: "READY" }, task.recordVersion), code("MANUAL_PROVIDER_REQUIRED"), "mock tasks remain test-only");
}

{
  const harness = await seeded();
  const { storage, installation, service } = harness;
  const second = createBotOpsService({ storage });
  const beforeCount = service.loadSnapshot().tasks.length;
  await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? service : second).createManualPlan(planInput(installation.id, { title: `Concurrent synthetic plan ${index}` }))));
  const after = service.loadSnapshot();
  for (const collection of ["tasks", "taskGroups", "productTargets", "activity"]) equal(after[collection].length, beforeCount + 12, `concurrent plans preserve ${collection}`);
  const repository = createBotOpsRepository(storage);
  const before = storage.getItem(BOT_OPS_STORAGE_KEY);
  let release; let entered;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  const holding = repository.transact(async () => { entered(); await held; });
  await enteredPromise;
  let active = true;
  const queuedService = createBotOpsService({ storage, isOperationActive: () => active });
  const queued = queuedService.createManualPlan(planInput(installation.id));
  const cancelled = rejects(() => queued, code("OPERATION_CANCELLED"));
  active = false; release(); await holding; await cancelled;
  equal(storage.getItem(BOT_OPS_STORAGE_KEY), before, "queued plan cannot cross owner lifetime");
}

console.log(`Code 3 Bot manual tracking domain: ${assertions} assertions passed.`);
