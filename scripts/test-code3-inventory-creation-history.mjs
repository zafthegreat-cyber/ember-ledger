import assert from "node:assert/strict";
import { FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";
import { suggestedInventorySaleCogsMinorUnits } from "../src/features/flipScout/exactInventoryCost.js";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { createInventoryHarness, confirmFixturePurchase, createExclusiveTestLock, exactDraft, MemoryStorage, receive } from "./inventory-creation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const INVENTORY_COMMIT_JOURNAL_KEY = `${FLIP_SCOUT_STORAGE_KEY}.inventory-creation-commit-journal.v1`;

class HookedInventoryStorage extends MemoryStorage {
  constructor(options = {}) {
    super();
    this.afterMainWrite = options.afterMainWrite || null;
    this.failMainWriteAfterPersist = false;
    this.failNextMainWriteBeforePersist = false;
  }
  setItem(key, value) {
    const normalizedKey = String(key);
    if (normalizedKey === FLIP_SCOUT_STORAGE_KEY && this.failNextMainWriteBeforePersist) {
      this.failNextMainWriteBeforePersist = false;
      this.writes += 1;
      throw new Error("Synthetic rollback write failed before persistence.");
    }
    super.setItem(key, value);
    if (normalizedKey === FLIP_SCOUT_STORAGE_KEY) {
      this.afterMainWrite?.();
      if (this.failMainWriteAfterPersist) {
        this.failMainWriteAfterPersist = false;
        throw new Error("Synthetic response failed after the main state persisted.");
      }
    }
  }
}

function appendExactManagedSale(repository, item, { id, quantity = 1, status = "Completed" }) {
  const state = repository.load();
  const minorUnits = suggestedInventorySaleCogsMinorUnits(item, state.sales, quantity);
  const result = repository.upsert("sales", {
    id,
    inventoryItemId: item.id,
    quantitySold: quantity,
    status,
    allocatedCostOfGoodsSoldMinorUnits: minorUnits,
    allocatedCostOfGoodsSold: minorUnits / 100,
    costAuthority: "INTEGER_MINOR_UNITS",
  });
  if (result.error) throw new Error(result.error);
  return result.record;
}

async function readyHarness(options = {}) {
  const harness = createInventoryHarness(options);
  const purchase = await confirmFixturePurchase(harness.service, options.draft || exactDraft({ id: options.id || "history", quantity: options.quantity || 1, totalMinorUnits: options.totalMinorUnits || 1000 }));
  await receive(harness.service, purchase, { quantity: options.quantity || 1, condition: "SEALED", id: options.id || "history" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  return { ...harness, purchase, candidate };
}

{
  const harness = await readyHarness({ id: "idempotency" });
  const first = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const second = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  equal(first.wroteInventory, true);
  equal(second.deduplicated, true);
  equal(second.wroteInventory, false);
  equal(first.inventoryItem.id, second.inventoryItem.id);
  const state = JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  equal(state.inventory.length, 1);
  equal(state.inventoryLots.length, 1);
  equal(state.inventoryCreationApplications.length, 1);
  equal(state.inventoryCreationEvents.length, 1);
}

{
  const inventoryStorage = new MemoryStorage({ failBefore: 1 });
  const harness = await readyHarness({ id: "failure-before", inventoryStorage });
  await assert.rejects(() => harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion }), (error) => error.code === "INVENTORY_WRITE_FAILED"); assertions += 1;
  equal(inventoryStorage.values.has(FLIP_SCOUT_STORAGE_KEY), false);
  const repaired = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  equal(repaired.wroteInventory, true);
  equal(JSON.parse(inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY)).inventory.length, 1);
}

{
  const inventoryStorage = new HookedInventoryStorage();
  const harness = await readyHarness({ id: "ambiguous-after", inventoryStorage });
  inventoryStorage.failMainWriteAfterPersist = true;
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion }),
    (error) => error.code === "INVENTORY_WRITE_FAILED" && error.details?.rolledBack === true,
  ); assertions += 1;
  const result = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  equal(result.wroteInventory, true, "a journaled ambiguous write rolls back before a clean idempotent retry");
  equal(JSON.parse(inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY)).inventory.length, 1);
}

{
  const harness = await readyHarness({ id: "partial-repair" });
  await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const partial = JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  partial.inventory = [];
  partial.inventoryLots = [];
  partial.inventoryCreationEvents = [];
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(partial));
  const preview = harness.service.previewInventoryCreation(harness.purchase.id)[0];
  equal(preview.alreadyConfirmed, false, "incomplete read-back is repair-required, not fake success");
  equal(preview.application.status, "REPAIR_REQUIRED");
  const repaired = await harness.service.confirmInventoryCreation(preview.candidateId, { expectedVersion: preview.expectedVersion });
  equal(repaired.repaired, true);
  const repairedState = JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  equal(repairedState.inventory.length, 1);
  equal(repairedState.inventoryLots.length, 1);
  equal(repairedState.inventoryCreationEvents.length, 1);
}

{
  const harness = await readyHarness({ id: "conflicting-orphan" });
  await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const orphan = JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  orphan.inventoryCreationApplications = [];
  orphan.inventoryLots = [];
  orphan.inventory = [];
  orphan.inventoryCreationEvents[0].currency = "EUR";
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(orphan));
  const preview = harness.service.previewInventoryCreation(harness.purchase.id)[0];
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(preview.candidateId, { expectedVersion: preview.expectedVersion }),
    (error) => error.code === "INVENTORY_PROVENANCE_CONFLICT",
  ); assertions += 1;
}

{
  const harness = await readyHarness({ id: "tampered-complete" });
  await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const state = JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  state.inventoryCreationApplications[0].currency = "EUR";
  state.inventoryCreationEvents[0].currency = "EUR";
  state.inventoryLots[0].currency = "EUR";
  state.inventory[0].currency = "EUR";
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(state));
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion }),
    (error) => error.code === "INVENTORY_PROVENANCE_CONFLICT"
      || (error.code === "CANDIDATE_BLOCKED" && error.details?.blockers?.includes("EXISTING_INVENTORY_PROVENANCE_CONFLICT")),
  ); assertions += 1;
}

{
  const harness = await readyHarness({ id: "secret-tamper" });
  await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const state = JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  state.inventoryCreationEvents[0].rawProviderPayload = { token: "synthetic-secret.invalid" };
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(state));
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion }),
  ); assertions += 1;
}

{
  const sharedInventory = new MemoryStorage();
  const sharedPurchase = new MemoryStorage();
  const lock = createExclusiveTestLock();
  const first = createInventoryHarness({ purchaseStorage: sharedPurchase, inventoryStorage: sharedInventory, inventoryLockManager: lock });
  const purchase = await confirmFixturePurchase(first.service, exactDraft({ id: "concurrency" }));
  await receive(first.service, purchase, { condition: "SEALED", id: "concurrency" });
  const second = createInventoryHarness({ purchaseStorage: sharedPurchase, inventoryStorage: sharedInventory, inventoryLockManager: lock });
  const candidateA = first.service.previewInventoryCreation(purchase.id)[0];
  const candidateB = second.service.previewInventoryCreation(purchase.id)[0];
  const results = await Promise.all([
    first.service.confirmInventoryCreation(candidateA.candidateId, { expectedVersion: candidateA.expectedVersion }),
    second.service.confirmInventoryCreation(candidateB.candidateId, { expectedVersion: candidateB.expectedVersion }),
  ]);
  equal(results.filter((entry) => entry.wroteInventory).length, 1);
  equal(results.filter((entry) => entry.deduplicated).length, 1);
  equal(JSON.parse(sharedInventory.values.get(FLIP_SCOUT_STORAGE_KEY)).inventory.length, 1);
}

{
  const harness = await readyHarness({ id: "stale" });
  const state = harness.service.previewInventoryCreation(harness.purchase.id)[0];
  const otherPurchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "stale-other" }));
  await receive(harness.service, otherPurchase, { condition: "SEALED", id: "stale-other" });
  const otherCandidate = harness.service.previewInventoryCreation(otherPurchase.id)[0];
  await harness.service.confirmInventoryCreation(otherCandidate.candidateId, { expectedVersion: otherCandidate.expectedVersion });
  await assert.rejects(() => harness.service.confirmInventoryCreation(state.candidateId, { expectedVersion: state.expectedVersion }), (error) => error.code === "VERSION_CONFLICT"); assertions += 1;
}

{
  const harness = await readyHarness({ id: "reversal", quantity: 3, totalMinorUnits: 1000 });
  const created = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const reversed = await harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic owner-confirmed return.", idempotencyKey: "reversal.one.test" });
  equal(reversed.inventoryItem.quantity, 2);
  equal(reversed.inventoryItem.acquisitionCostMinorUnits, 667);
  equal(reversed.adjustment.totalCostMinorUnits, 333);
  const replay = await harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic owner-confirmed return.", idempotencyKey: "reversal.one.test" });
  equal(replay.deduplicated, true);
  await assert.rejects(
    () => harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 2, reason: "Conflicting retry.", idempotencyKey: "reversal.one.test" }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  ); assertions += 1;
  await assert.rejects(
    () => harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Different reason with the same key.", idempotencyKey: "reversal.one.test" }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT",
  ); assertions += 1;
  equal(JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY)).inventoryAdjustments.length, 1);
}

{
  const harness = await readyHarness({ id: "reversal-spaced-key", quantity: 2, totalMinorUnits: 1000 });
  const created = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const reversed = await harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic spaced-key reversal.", idempotencyKey: "  reversal.spacekey.test  " });
  const replay = await harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic spaced-key reversal.", idempotencyKey: "  reversal.spacekey.test  " });
  equal(reversed.adjustment.idempotencyKey, "reversal.spacekey.test", "reversal identity uses the normalized key");
  equal(replay.deduplicated, true, "the identical whitespace-bearing request replays cleanly");
  equal(JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY)).inventoryAdjustments.length, 1);
}

{
  const harness = await readyHarness({ id: "concurrent-unrelated", quantity: 1 });
  const created = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const repository = createFlipScoutRepository(harness.inventoryStorage);
  const stale = repository.load();
  const staleManagedRevision = repository.managedRevision(stale);
  const concurrent = structuredClone(stale);
  concurrent.sales.push({ id: "sale.concurrent-unrelated.test", inventoryItemId: "inventory.unrelated.test", quantitySold: 1, status: "Draft" });
  harness.inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(concurrent));
  const merged = repository.commitOwnerConfirmedInventory(stale, { expectedManagedRevision: staleManagedRevision });
  equal(merged.error, "", "a fresh unrelated Business write does not conflict with the managed revision");
  equal(repository.load().sales.some((sale) => sale.id === "sale.concurrent-unrelated.test"), true, "managed commit preserves the concurrent unrelated sale");

  await harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic managed change.", idempotencyKey: "reversal.concurrent-managed.test" });
  const conflict = repository.commitOwnerConfirmedInventory(stale, { expectedManagedRevision: staleManagedRevision });
  equal(Boolean(conflict.error), true, "a stale managed revision fails closed");
  equal(repository.load().inventory[0].quantity, 0, "a stale managed snapshot cannot restore reversed quantity");
}

{
  const purchaseStorage = new MemoryStorage();
  const inventoryStorage = new MemoryStorage();
  const baseRepository = createFlipScoutRepository(inventoryStorage);
  let beforeCommit = () => {};
  const inventoryRepository = {
    ...baseRepository,
    commitOwnerConfirmedInventory(next, options) {
      beforeCommit();
      return baseRepository.commitOwnerConfirmedInventory(next, options);
    },
  };
  const harness = createInventoryHarness({ purchaseStorage, inventoryStorage, inventoryRepository });
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "source-race" }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "source-race" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  beforeCommit = () => {
    const sourceState = JSON.parse(purchaseStorage.values.get("code3.purchase-receiving.v1"));
    const sourcePurchase = sourceState.purchases.find((record) => record.id === purchase.id);
    sourcePurchase.status = "RETURNED";
    sourcePurchase.returnState = "RETURNED";
    sourcePurchase.recordVersion += 1;
    purchaseStorage.values.set("code3.purchase-receiving.v1", JSON.stringify(sourceState));
    beforeCommit = () => {};
  };
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion }),
    (error) => error.code === "INVENTORY_WRITE_FAILED",
  ); assertions += 1;
  equal(baseRepository.load().inventoryCreationApplications.length, 0, "a Purchase/Receiving source race creates no Inventory application");
}

{
  const purchaseStorage = new MemoryStorage();
  const inventoryStorage = new MemoryStorage();
  const baseRepository = createFlipScoutRepository(inventoryStorage);
  let beforeCommit = () => {};
  const inventoryRepository = {
    ...baseRepository,
    commitOwnerConfirmedInventory(next, options) {
      beforeCommit();
      return baseRepository.commitOwnerConfirmedInventory(next, options);
    },
  };
  const harness = createInventoryHarness({ purchaseStorage, inventoryStorage, inventoryRepository });
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "sale-race" }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "sale-race" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  const created = await harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion });
  beforeCommit = () => {
    const current = baseRepository.load();
    appendExactManagedSale(baseRepository, created.inventoryItem, { id: "sale.race-completed.test" });
    beforeCommit = () => {};
  };
  await assert.rejects(
    () => harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic raced return.", idempotencyKey: "reversal.sale-race.test" }),
    (error) => error.code === "INVENTORY_REVERSAL_WRITE_FAILED",
  ); assertions += 1;
  equal(baseRepository.load().inventory[0].quantity, 1, "a completed-sale race cannot reduce Inventory below sold quantity");
}

{
  const purchaseStorage = new MemoryStorage();
  const inventoryStorage = new MemoryStorage();
  const baseRepository = createFlipScoutRepository(inventoryStorage);
  let beforeCommit = () => {};
  const inventoryRepository = {
    ...baseRepository,
    commitOwnerConfirmedInventory(next, options) {
      beforeCommit();
      return baseRepository.commitOwnerConfirmedInventory(next, options);
    },
  };
  const harness = createInventoryHarness({ purchaseStorage, inventoryStorage, inventoryRepository });
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "resolution-race", productMatchStatus: "UNRESOLVED", productReference: null }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "resolution-race" });
  const unresolved = harness.service.previewInventoryCreation(purchase.id)[0];
  baseRepository.save({
    ...baseRepository.load(),
    inventory: [{ id: "inventory.seed-resolution.test", productReference: "catalog.resolved-product.test", productClassification: "Sealed product", quantity: 1 }],
  });
  const review = { productReference: "catalog.resolved-product.test", productClassification: "Sealed product", condition: "SEALED", resolutionReason: "Owner selected an existing local product." };
  const candidate = harness.service.previewInventoryCreation(purchase.id, { [unresolved.candidateId]: review })[0];
  equal(candidate.eligible, true, "owner resolution is eligible only while its existing product anchor is present");
  beforeCommit = () => {
    const current = baseRepository.load();
    current.inventory = current.inventory.filter((record) => record.id !== "inventory.seed-resolution.test");
    inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(current));
    beforeCommit = () => {};
  };
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion, review }),
    (error) => error.code === "INVENTORY_WRITE_FAILED",
  ); assertions += 1;
  equal(baseRepository.load().inventoryCreationApplications.length, 0, "a vanished product-resolution anchor creates no Inventory application");
}

{
  const harness = await readyHarness({ id: "sold", quantity: 1 });
  const created = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  appendExactManagedSale(createFlipScoutRepository(harness.inventoryStorage), created.inventoryItem, { id: "sale.synthetic.test" });
  await assert.rejects(() => harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic return.", idempotencyKey: "reversal.sold.test" }), (error) => error.code === "REVERSAL_EXCEEDS_AVAILABLE"); assertions += 1;
  ok(JSON.parse(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY)).inventory[0].quantity === 1);
}

{
  const purchaseStorage = new MemoryStorage();
  const inventoryStorage = new HookedInventoryStorage();
  const harness = createInventoryHarness({ purchaseStorage, inventoryStorage });
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "post-write-source-change" }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "post-write-source-change" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  inventoryStorage.afterMainWrite = () => {
    inventoryStorage.afterMainWrite = null;
    const sourceState = JSON.parse(purchaseStorage.values.get("code3.purchase-receiving.v1"));
    const sourcePurchase = sourceState.purchases.find((record) => record.id === purchase.id);
    sourcePurchase.status = "RETURNED";
    sourcePurchase.returnState = "RETURNED";
    sourcePurchase.recordVersion += 1;
    purchaseStorage.values.set("code3.purchase-receiving.v1", JSON.stringify(sourceState));
  };
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion }),
    (error) => error.code === "INVENTORY_WRITE_FAILED" && error.details?.rolledBack === true,
  ); assertions += 1;
  const repository = createFlipScoutRepository(inventoryStorage);
  equal(repository.load().inventoryCreationApplications.length, 0, "a post-write source change rolls the tentative Inventory bundle back");
  equal(inventoryStorage.values.has(INVENTORY_COMMIT_JOURNAL_KEY), false, "successful rollback clears private recovery metadata");
}

{
  const purchaseStorage = new MemoryStorage();
  const inventoryStorage = new HookedInventoryStorage();
  const baseRepository = createFlipScoutRepository(inventoryStorage);
  baseRepository.upsert("deals", { id: "deal.recovery-preserved.test", title: "Synthetic unrelated record" });
  const harness = createInventoryHarness({ purchaseStorage, inventoryStorage });
  const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "rollback-failure" }));
  await receive(harness.service, purchase, { condition: "SEALED", id: "rollback-failure" });
  const candidate = harness.service.previewInventoryCreation(purchase.id)[0];
  inventoryStorage.afterMainWrite = () => {
    inventoryStorage.afterMainWrite = null;
    const sourceState = JSON.parse(purchaseStorage.values.get("code3.purchase-receiving.v1"));
    const sourcePurchase = sourceState.purchases.find((record) => record.id === purchase.id);
    sourcePurchase.status = "RETURNED";
    sourcePurchase.returnState = "RETURNED";
    sourcePurchase.recordVersion += 1;
    purchaseStorage.values.set("code3.purchase-receiving.v1", JSON.stringify(sourceState));
    inventoryStorage.failNextMainWriteBeforePersist = true;
  };
  await assert.rejects(
    () => harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion }),
    (error) => error.code === "INVENTORY_WRITE_FAILED" && error.details?.recoveryPending === true,
  ); assertions += 1;
  equal(inventoryStorage.values.has(INVENTORY_COMMIT_JOURNAL_KEY), true, "rollback failure retains private recovery metadata");
  equal(baseRepository.load().inventoryCreationApplications.length, 0, "public reads hide an unproven tentative bundle while recovery is pending");
  equal(baseRepository.load().deals.some((record) => record.id === "deal.recovery-preserved.test"), true, "recovery projection preserves unrelated Business records");
  const repaired = baseRepository.upsert("expenses", { id: "expense.recovery.test", merchant: "Synthetic merchant" });
  equal(repaired.error, "", "the next locked mutation repairs a stale journal before writing");
  equal(inventoryStorage.values.has(INVENTORY_COMMIT_JOURNAL_KEY), false, "successful stale-journal recovery removes private metadata");
  equal(repaired.state.deals.some((record) => record.id === "deal.recovery-preserved.test"), true, "stale-journal recovery keeps unrelated records intact");
}

{
  const initial = JSON.stringify({ ...createFlipScoutRepository(new MemoryStorage()).load(), deals: [{ id: "deal.before-malformed-journal.test", title: "Synthetic baseline" }] });
  const inventoryStorage = new MemoryStorage();
  inventoryStorage.values.set(FLIP_SCOUT_STORAGE_KEY, initial);
  inventoryStorage.values.set(INVENTORY_COMMIT_JOURNAL_KEY, JSON.stringify({ format: "code3.inventory-creation-commit-journal.v1", status: "PREPARED", createdAt: "invalid", originalManagedSnapshot: {} }));
  const repository = createFlipScoutRepository(inventoryStorage);
  const result = repository.upsert("expenses", { id: "expense.must-not-write.test", merchant: "Synthetic merchant" });
  equal(Boolean(result.error), true, "malformed recovery metadata fails closed");
  equal(inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY), initial, "malformed recovery metadata cannot overwrite the last stored Business state");
}

{
  const lock = createExclusiveTestLock();
  const harness = await readyHarness({ id: "shared-sale-reversal-lock", inventoryLockManager: lock });
  const created = await harness.service.confirmInventoryCreation(harness.candidate.candidateId, { expectedVersion: harness.candidate.expectedVersion });
  const repository = createFlipScoutRepository(harness.inventoryStorage, { lockManager: lock });
  const results = await Promise.allSettled([
    repository.runLocked(() => appendExactManagedSale(repository, created.inventoryItem, { id: "sale.shared-lock.test" })),
    harness.service.reverseInventoryCreation(created.application.id, { expectedInventoryVersion: created.inventoryItem.recordVersion, quantity: 1, reason: "Synthetic concurrent return.", idempotencyKey: "reversal.shared-lock.test" }),
  ]);
  equal(results[0].status, "fulfilled", "the first lock holder records one exact-cost sale");
  equal(results[1].status, "rejected", "a queued reversal revalidates after the sale and fails safely");
  equal(repository.load().sales.filter((sale) => sale.id === "sale.shared-lock.test").length, 1);
  equal(repository.load().inventory[0].quantity, 1, "serialized sale/reversal operations cannot create negative or duplicate Inventory");
}

console.log(`Code 3 Inventory Creation history/idempotency: ${assertions} assertions passed.`);
