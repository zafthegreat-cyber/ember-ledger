import assert from "node:assert/strict";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";
import { createInventoryHarness, confirmFixturePurchase, exactDraft, MemoryStorage, receive } from "./inventory-creation-test-helpers.mjs";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { validateBackupSourceData } from "../src/features/backup/backupValidation.js";
import { getMigrationSource, MIGRATION_SOURCE_CLASSIFICATIONS } from "../src/features/persistence/migrationSourceRegistry.js";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

const harness = createInventoryHarness();
const purchase = await confirmFixturePurchase(harness.service, exactDraft({ id: "security" }));
await receive(harness.service, purchase, { condition: "SEALED", id: "security" });
const candidate = harness.service.previewInventoryCreation(purchase.id)[0];

for (const payload of [
  { expectedVersion: candidate.expectedVersion, quantity: 99 },
  { expectedVersion: candidate.expectedVersion, totalCostMinorUnits: 1 },
  { expectedVersion: candidate.expectedVersion, role: "OWNER" },
  { expectedVersion: candidate.expectedVersion, ownerSubject: "synthetic-owner.test" },
  { expectedVersion: candidate.expectedVersion, review: { password: "synthetic-secret.invalid" } },
  { expectedVersion: candidate.expectedVersion, review: { rawProviderPayload: "synthetic" } },
  { expectedVersion: candidate.expectedVersion, review: { productReference: "https://user:pass@example.invalid" } },
]) {
  await assert.rejects(() => harness.service.confirmInventoryCreation(candidate.candidateId, payload)); assertions += 1;
}
equal(harness.inventoryStorage.writes, 0, "rejected browser authority/cost/secret input writes nothing");

const created = await harness.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion, review: {} });
equal(created.inventoryItem.provenanceManaged, true);
equal(created.inventoryItem.confirmationMethod, "VERIFIED_OWNER_SESSION");
equal("ownerId" in created.inventoryItem, false);
equal("rawPayload" in created.inventoryItem, false);
equal(JSON.stringify(created).includes("synthetic-secret.invalid"), false);

{
  const repository = createFlipScoutRepository(harness.inventoryStorage);
  assert.throws(() => repository.upsert("inventory", { ...created.inventoryItem, quantity: 500 }), /append-only correction workflow/); assertions += 1;
  assert.throws(() => repository.remove("inventory", created.inventoryItem.id), /cannot be deleted/); assertions += 1;
  const before = harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY);
  const imported = JSON.parse(before);
  imported.inventory[0].quantity = 500;
  const result = repository.importJson(JSON.stringify(imported));
  equal(Boolean(result.error), true);
  equal(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY), before, "generic import cannot replace managed Inventory");
  const reset = repository.replace({ schemaVersion: 3 });
  equal(Boolean(reset.error), true, "generic reset is blocked once managed acquisition history exists");
  equal(harness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY), before, "generic reset retains managed Inventory and provenance");
  const injectedEvent = repository.upsert("inventoryCreationEvents", { id: "inventory-event.untrusted.test" });
  equal(Boolean(injectedEvent.error), true, "generic upsert cannot create a managed provenance event");

  const currentManaged = repository.load();
  const managedRevision = repository.managedRevision(currentManaged);
  const deletedManaged = structuredClone(currentManaged);
  deletedManaged.inventory = deletedManaged.inventory.filter((record) => record.provenanceManaged !== true);
  deletedManaged.inventoryLots = [];
  deletedManaged.inventoryCreationApplications = [];
  deletedManaged.inventoryCreationEvents = [];
  const deletionAttempt = repository.commitOwnerConfirmedInventory(deletedManaged, { expectedManagedRevision: managedRevision });
  equal(Boolean(deletionAttempt.error), true, "specialized commit cannot erase append-only Inventory provenance");
  equal(repository.load().inventoryCreationApplications.length, 1, "failed deletion retains the Inventory creation application");

  const rewrittenManaged = structuredClone(currentManaged);
  rewrittenManaged.inventoryCreationApplications[0].productReference = "catalog.rewritten-product.test";
  rewrittenManaged.inventoryCreationEvents[0].productReference = "catalog.rewritten-product.test";
  rewrittenManaged.inventoryLots[0].productReference = "catalog.rewritten-product.test";
  rewrittenManaged.inventory[0].productReference = "catalog.rewritten-product.test";
  const rewriteAttempt = repository.commitOwnerConfirmedInventory(rewrittenManaged, { expectedManagedRevision: managedRevision });
  equal(Boolean(rewriteAttempt.error), true, "specialized commit cannot rewrite immutable managed product provenance");
  equal(repository.load().inventory[0].productReference, created.inventoryItem.productReference, "failed rewrite retains canonical product provenance");

  const activityInjection = structuredClone(currentManaged);
  activityInjection.activity[0].token = "synthetic-activity-secret.invalid";
  const activityAttempt = repository.commitOwnerConfirmedInventory(activityInjection, { expectedManagedRevision: managedRevision });
  equal(Boolean(activityAttempt.error), true, "specialized commit rejects secret-bearing managed activity");

  const unsupportedManagedField = structuredClone(currentManaged);
  unsupportedManagedField.inventoryCreationEvents[0].providerMetadata = { arbitrary: "synthetic-only.invalid" };
  const unsupportedManagedAttempt = repository.commitOwnerConfirmedInventory(unsupportedManagedField, { expectedManagedRevision: managedRevision });
  equal(Boolean(unsupportedManagedAttempt.error), true, "specialized commit rejects non-allowlisted managed provenance fields");
  equal("providerMetadata" in repository.load().inventoryCreationEvents[0], false, "rejected managed metadata is never persisted");

  const tampered = JSON.parse(before);
  tampered.inventory[0].acquisitionCostMinorUnits += 1;
  const validation = validateBackupSourceData(getBackupSource("deal-finder"), tampered);
  equal(validation.valid, false, "backup validation rejects tampered exact-cost Inventory");

  const brokenLink = JSON.parse(before);
  brokenLink.inventoryCreationEvents[0].applicationId = "inventory-application.broken-link.test";
  equal(
    validateBackupSourceData(getBackupSource("deal-finder"), brokenLink).valid,
    false,
    "backup validation rejects cross-record provenance link tampering",
  );

  const contradictoryDamageReview = JSON.parse(before);
  contradictoryDamageReview.inventoryCreationApplications[0].disposition = "ADD_AS_DAMAGED";
  equal(
    validateBackupSourceData(getBackupSource("deal-finder"), contradictoryDamageReview).valid,
    false,
    "backup validation rejects damaged disposition without damaged condition",
  );

  const duplicateSource = JSON.parse(before);
  duplicateSource.inventoryCreationApplications.push({
    ...duplicateSource.inventoryCreationApplications[0],
    id: "inventory-application.duplicate-source.test",
  });
  equal(
    validateBackupSourceData(getBackupSource("deal-finder"), duplicateSource).valid,
    false,
    "backup validation rejects duplicate source identity under a different record ID",
  );

  for (const [collection, field, value] of [
    ["inventoryCreationApplications", "status", "PREPARED"],
    ["inventoryCreationEvents", "eventType", "INVENTORY_REVERSED"],
    ["inventory", "ownedItemPurpose", "PERSONAL_COLLECTION"],
    ["inventory", "status", "Disposed"],
    ["inventoryLots", "status", "REVERSED"],
    ["inventory", "productTitle", "Tampered product title"],
    ["inventoryLots", "retailerId", "retailer-preset:tampered"],
  ]) {
    const semanticTamper = JSON.parse(before);
    semanticTamper[collection][0][field] = value;
    equal(
      validateBackupSourceData(getBackupSource("deal-finder"), semanticTamper).valid,
      false,
      `backup validation rejects semantic tampering of ${collection}.${field}`,
    );
  }

  for (const collection of ["inventoryCreationApplications", "inventoryCreationEvents", "inventoryLots", "inventory"]) {
    const unknownField = JSON.parse(before);
    unknownField[collection][0].providerMetadata = { arbitrary: "synthetic-only.invalid" };
    equal(
      validateBackupSourceData(getBackupSource("deal-finder"), unknownField).valid,
      false,
      `backup validation rejects unsupported managed fields in ${collection}`,
    );
  }
}

{
  const backup = getBackupSource("deal-finder");
  equal(backup.schemaVersion, 3);
  for (const path of ["inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments"]) {
    equal(backup.recordPaths.includes(path), true, `${path} is registered as safe Business metadata`);
  }
  equal(backup.recordPaths.includes("inventoryCreationCandidates"), false, "ephemeral candidates never become a backup source");
  const migration = getMigrationSource("deal-finder");
  equal(migration.paths.find((entry) => entry.path === "inventory")?.classification, MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING, "mixed exact-cost Inventory remains mapping-gated");
  for (const path of ["inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments"]) {
    equal(migration.paths.find((entry) => entry.path === path)?.classification, MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING, `${path} remains remote-inactive and requires mapping`);
  }
}

{
  const reversalHarness = createInventoryHarness();
  const reversalPurchase = await confirmFixturePurchase(reversalHarness.service, exactDraft({ id: "security-adjustment" }));
  await receive(reversalHarness.service, reversalPurchase, { condition: "SEALED", id: "security-adjustment" });
  const reversalCandidate = reversalHarness.service.previewInventoryCreation(reversalPurchase.id)[0];
  const reversalCreation = await reversalHarness.service.confirmInventoryCreation(reversalCandidate.candidateId, { expectedVersion: reversalCandidate.expectedVersion });
  const beforeReversal = JSON.parse(reversalHarness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));
  await reversalHarness.service.reverseInventoryCreation(reversalCreation.application.id, {
    expectedInventoryVersion: reversalCreation.inventoryItem.recordVersion,
    quantity: 1,
    reason: "Synthetic owner-confirmed reversal.",
    idempotencyKey: "reversal.security-adjustment.test",
  });
  const reversalState = JSON.parse(reversalHarness.inventoryStorage.values.get(FLIP_SCOUT_STORAGE_KEY));

  const staleVersionStorage = new MemoryStorage();
  staleVersionStorage.values.set(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(beforeReversal));
  const staleVersionRepository = createFlipScoutRepository(staleVersionStorage);
  const staleVersionMutation = structuredClone(reversalState);
  staleVersionMutation.inventory[0].recordVersion = beforeReversal.inventory[0].recordVersion;
  staleVersionMutation.inventoryLots[0].recordVersion = beforeReversal.inventoryLots[0].recordVersion;
  const staleVersionAttempt = staleVersionRepository.commitOwnerConfirmedInventory(staleVersionMutation, {
    expectedManagedRevision: staleVersionRepository.managedRevision(beforeReversal),
  });
  equal(Boolean(staleVersionAttempt.error), true, "managed quantity/cost changes require an exact record-version increment");

  for (const [field, value] of [
    ["id", "inventory-adjustment.tampered.test"],
    ["adjustmentType", "RETURN_DISPOSITION"],
    ["inventoryCreationEventId", "inventory-event.tampered.test"],
    ["receivingEventReferences", ["receiving.tampered.test"]],
    ["productReference", "catalog.tampered-product.test"],
    ["currency", "CAD"],
  ]) {
    const tampered = structuredClone(reversalState);
    tampered.inventoryAdjustments[0][field] = value;
    equal(
      validateBackupSourceData(getBackupSource("deal-finder"), tampered).valid,
      false,
      `backup validation rejects tampered Inventory adjustment ${field}`,
    );
  }


  const unsupportedAdjustmentField = structuredClone(reversalState);
  unsupportedAdjustmentField.inventoryAdjustments[0].providerMetadata = { arbitrary: "synthetic-only.invalid" };
  equal(
    validateBackupSourceData(getBackupSource("deal-finder"), unsupportedAdjustmentField).valid,
    false,
    "backup validation rejects unsupported Inventory adjustment fields",
  );
}

{
  const purchaseStorage = new MemoryStorage();
  const inventoryStorage = new MemoryStorage();
  const unauthorized = createInventoryHarness({ purchaseStorage, inventoryStorage, authority: { allowed: false } });
  assert.throws(() => unauthorized.service.previewInventoryCreation("purchase.synthetic.test"), (error) => error.code === "OWNER_REQUIRED"); assertions += 1;
  await assert.rejects(() => unauthorized.service.confirmInventoryCreation(candidate.candidateId, { expectedVersion: candidate.expectedVersion }), (error) => error.code === "OWNER_REQUIRED"); assertions += 1;
  equal(purchaseStorage.reads, 0);
  equal(inventoryStorage.reads, 0);
  equal(inventoryStorage.writes, 0);
}

console.log(`Code 3 Inventory Creation security: ${assertions} assertions passed.`);
