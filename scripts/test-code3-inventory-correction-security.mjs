import assert from "node:assert/strict";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { validateBackupSourceData } from "../src/features/backup/backupValidation.js";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { soldQuantityForInventory } from "../src/features/flipScout/inventory.js";
import {
  MIGRATION_SOURCE_CLASSIFICATIONS,
  getMigrationSource,
} from "../src/features/persistence/migrationSourceRegistry.js";
import {
  inventoryAdjustmentSemanticDigest,
  validateInventoryCreationStateBundles,
} from "../src/features/purchaseReceiving/inventoryCreation/contracts.js";
import {
  assertManagedInventoryHasNoTransferUsage,
  createInventoryCorrectionGateway,
} from "../src/features/purchaseReceiving/inventoryCorrection/gateway.js";
import {
  INVENTORY_CORRECTION_CATEGORIES,
  INVENTORY_CORRECTION_SAFETY,
} from "../src/features/purchaseReceiving/inventoryCorrection/constants.js";
import { PURCHASE_EVENT_TYPES } from "../src/features/purchaseReceiving/constants.js";
import { createInventoryHarness } from "./inventory-creation-test-helpers.mjs";
import {
  confirmCorrection,
  correctionProposal,
  createManagedInventory,
  storedInventory,
} from "./inventory-correction-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };

{
  const harness = createInventoryHarness();
  const reads = harness.inventoryStorage.reads;
  harness.authority.allowed = false;
  assert.throws(() => harness.service.previewInventoryCorrection("inventory.hidden.test", correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "unauthorized", { targetCondition: "DAMAGED" })), (error) => error.code === "OWNER_REQUIRED"); assertions += 1;
  equal(harness.inventoryStorage.reads, reads, "OWNER authorization happens before Inventory storage access");
}

{
  assert.throws(
    () => createInventoryCorrectionGateway({ isOwnerAuthorized: () => true }),
    (error) => error.code === "TRANSFER_PROTECTION_UNAVAILABLE",
    "a direct correction gateway cannot silently assume zero transferred quantity",
  ); assertions += 1;
}

{
  const harness = await createManagedInventory({ id: "unsafe" });
  const before = JSON.stringify(storedInventory(harness.inventoryStorage));
  for (const malicious of [
    { role: "OWNER" },
    { ownerAuthorized: true },
    { password: "not-a-real-password" },
    { bearerToken: "synthetic-token.invalid" },
    { paymentCardNumber: "4111111111111111" },
    { proxyUrl: "https://user:pass@proxy.invalid" },
    { rawProviderPayload: "synthetic" },
  ]) {
    assert.throws(
      () => harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, {
        ...correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, `unsafe-${Object.keys(malicious)[0]}`, { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" }),
        ...malicious,
      }),
    ); assertions += 1;
  }
  const polluted = JSON.parse('{"category":"CONDITION_CORRECTION","idempotencyKey":"pollution.test","reason":"synthetic","targetCondition":"OPEN_BOX","__proto__":{"isOwner":true}}');
  assert.throws(() => harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, polluted)); assertions += 1;
  equal(JSON.stringify(storedInventory(harness.inventoryStorage)), before, "rejected correction payloads make zero canonical writes");
}

{
  const harness = await createManagedInventory({ id: "sold", quantity: 2 });
  const repository = createFlipScoutRepository(harness.inventoryStorage);
  const sale = repository.upsert("sales", {
    id: "sale.phase2cc-sold.test",
    inventoryItemId: harness.created.inventoryItem.id,
    quantitySold: 1,
    status: "Completed",
    allocatedCostOfGoodsSoldMinorUnits: harness.created.inventoryItem.unitAcquisitionCostsMinorUnits[0],
    allocatedCostOfGoodsSold: harness.created.inventoryItem.unitAcquisitionCostsMinorUnits[0] / 100,
    costAuthority: "INTEGER_MINOR_UNITS",
  });
  equal(sale.error, "", "synthetic managed sale is accepted through canonical repository");
  for (const [category, patch, blocker] of [
    [INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, { targetProductReference: "catalog.missing.test" }, "HISTORICAL_SALE_PRODUCT_RECONCILIATION_REQUIRED"],
    [INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" }, "HISTORICAL_SALE_CONDITION_RECONCILIATION_REQUIRED"],
    [INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, { targetTotalCostMinorUnits: 999 }, "REALIZED_COGS_REVIEW_REQUIRED"],
  ]) {
    const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(category, `sold-${category}`, patch));
    equal(candidate.eligible, false);
    ok(candidate.blockers.includes(blocker), `${category} blocks destructive sale-history rewrite`);
  }
  const returnCandidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, "sold-return", { quantity: 2 }));
  ok(returnCandidate.blockers.includes("DISPOSITION_EXCEEDS_AVAILABLE"), "return cannot consume a sold unit");
}

{
  const harness = await createManagedInventory({ id: "refunded", quantity: 2 });
  const repository = createFlipScoutRepository(harness.inventoryStorage);
  const refundedSale = repository.upsert("sales", {
    id: "sale.phase2cc-refunded.test",
    inventoryItemId: harness.created.inventoryItem.id,
    quantitySold: 1,
    status: "Refunded",
    allocatedCostOfGoodsSoldMinorUnits: harness.created.inventoryItem.unitAcquisitionCostsMinorUnits[0],
    allocatedCostOfGoodsSold: harness.created.inventoryItem.unitAcquisitionCostsMinorUnits[0] / 100,
    costAuthority: "INTEGER_MINOR_UNITS",
  });
  equal(refundedSale.error, "", "a synthetic refunded sale preserves its realized exact-cost record");
  const state = storedInventory(harness.inventoryStorage);
  equal(state.inventory.find((entry) => entry.id === harness.created.inventoryItem.id).quantity, 2, "refund status does not physically remove canonical Inventory");
  equal(soldQuantityForInventory(harness.created.inventoryItem.id, state.sales), 1, "refund alone does not restore physical availability");
  equal(INVENTORY_CORRECTION_SAFETY.refundRemovesInventory, false, "the correction contract keeps Refund distinct from Return");
}

{
  const harness = await createManagedInventory({ id: "transfer", quantity: 2, getTransferredQuantity: () => 1 });
  for (const [category, patch] of [
    [INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION, { targetProductReference: "catalog.other.test" }],
    [INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" }],
    [INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, { targetTotalCostMinorUnits: 999 }],
  ]) {
    const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(category, `transfer-${category}`, patch));
    ok(candidate.blockers.includes("TRANSFER_RECONCILIATION_REQUIRED"), `${category} fails closed around transferred units`);
  }
}

{
  const harness = await createManagedInventory({ id: "transfer-default-proof" });
  const state = storedInventory(harness.inventoryStorage);
  equal(assertManagedInventoryHasNoTransferUsage(harness.created.inventoryItem.id, state), 0, "schema-4 default proves managed transfers are unavailable from canonical state");
  assert.throws(
    () => assertManagedInventoryHasNoTransferUsage(harness.created.inventoryItem.id, { ...state, inventoryTransfers: [] }),
    (error) => error.code === "TRANSFER_RECONCILIATION_REQUIRED",
    "a future transfer authority fails closed even before it contains records",
  ); assertions += 1;

  const invalidTransferHarness = await createManagedInventory({ id: "transfer-invalid", getTransferredQuantity: () => -1 });
  assert.throws(
    () => invalidTransferHarness.service.previewInventoryCorrection(
      invalidTransferHarness.created.inventoryItem.id,
      correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, "transfer-invalid", { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" }),
    ),
    (error) => error.code === "INVALID_INTEGER",
    "invalid transfer-usage results fail closed",
  ); assertions += 1;
}

{
  const harness = await createManagedInventory({ id: "typed-metadata" });
  assert.throws(
    () => harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(
      INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION,
      "non-reversal-target",
      { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY", reversesAdjustmentId: "inventory-adjustment.forged.test" },
    )),
    (error) => error.code === "REVERSAL_TARGET_NOT_ALLOWED",
    "non-reversal correction cannot retain an invented reversal reference",
  ); assertions += 1;
  assert.throws(
    () => harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(
      INVENTORY_CORRECTION_CATEGORIES.REVERSAL_CORRECTION,
      "missing-reversal-target",
    )),
    (error) => error.code === "REVERSAL_TARGET_REQUIRED",
    "reversal correction requires an exact prior event reference",
  ); assertions += 1;
  assert.throws(
    () => harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(
      INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION,
      "foreign-quantity-reason",
      { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY", quantityReason: "LOSS" },
    )),
    (error) => error.code === "QUANTITY_REASON_NOT_ALLOWED",
    "quantity reason cannot be attached to another correction category",
  ); assertions += 1;
  assert.throws(
    () => harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(
      INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION,
      "missing-quantity-reason",
      { quantity: 1 },
    )),
    (error) => error.code === "QUANTITY_REASON_REQUIRED",
    "quantity correction cannot fall back to unstructured free text",
  ); assertions += 1;
}

{
  const harness = await createManagedInventory({ id: "replacement-security", quantity: 2 });
  const condition = await confirmCorrection(harness.service, harness.created.inventoryItem, correctionProposal(
    INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION,
    "replacement-non-return-source",
    { targetCondition: "OPEN_BOX", targetDisposition: "ADD_TO_INVENTORY" },
  ));
  await assert.rejects(
    () => harness.service.recordPurchaseEvent(harness.purchase.id, {
      type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
      idempotencyKey: "replacement.invalid-source.test",
      lineItemId: harness.purchase.lineItems[0].lineItemId,
      quantity: 1,
      relatedEventId: condition.result.adjustment.id,
      replacementReference: "replacement.invalid.test",
    }),
    (error) => error.code === "REPLACEMENT_RETURN_SOURCE_INVALID",
    "a metadata correction cannot authorize replacement Receiving",
  ); assertions += 1;
  await assert.rejects(
    () => harness.service.recordReceivingEvent(harness.purchase.id, {
      idempotencyKey: "replacement.forged-receiving.test",
      replacementEventId: "purchase-event.forged.test",
      entries: [{ lineItemId: harness.purchase.lineItems[0].lineItemId, quantityReceived: 1, quantityAffected: 1, condition: "OPEN_BOX", discrepancy: "NONE" }],
    }),
    (error) => error.code === "REPLACEMENT_AUTHORIZATION_REQUIRED",
    "a forged replacement event cannot bypass ordinary over-receipt bounds",
  ); assertions += 1;
  equal(storedInventory(harness.inventoryStorage).inventory.length, 1, "failed replacement authorization creates no additional Inventory");
}

{
  const harness = await createManagedInventory({ id: "zero-cost", quantity: 1 });
  const returned = await confirmCorrection(harness.service, harness.created.inventoryItem, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.RETURN_TO_RETAILER, "zero-cost-return"));
  const candidate = harness.service.previewInventoryCorrection(returned.result.inventoryItem.id, correctionProposal(INVENTORY_CORRECTION_CATEGORIES.ACQUISITION_COST_CORRECTION, "zero-cost-correction", { targetTotalCostMinorUnits: 100 }));
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("NO_REMAINING_QUANTITY_FOR_COST_CORRECTION"));
}

{
  const harness = await createManagedInventory({ id: "whole-lot", quantity: 3 });
  for (const category of [INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION]) {
    const candidate = harness.service.previewInventoryCorrection(harness.created.inventoryItem.id, correctionProposal(category, `whole-lot-${category}`, {
      quantity: 1,
      targetCondition: category === INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION ? "OPEN_BOX" : undefined,
      targetDisposition: category === INVENTORY_CORRECTION_CATEGORIES.CONDITION_CORRECTION ? "ADD_TO_INVENTORY" : undefined,
      targetProductReference: category === INVENTORY_CORRECTION_CATEGORIES.PRODUCT_RESOLUTION_CORRECTION ? "catalog.not-existing.test" : undefined,
    }));
    ok(candidate.blockers.includes("WHOLE_LOT_CORRECTION_ONLY"), "a one-unit metadata correction cannot silently rewrite a multi-unit lot");
  }
}

{
  const harness = await createManagedInventory({ id: "backup-contract", quantity: 4, totalMinorUnits: 1001 });
  const completed = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.PARTIAL_RETURN, "backup-contract", { quantity: 2 }),
  );
  const state = storedInventory(harness.inventoryStorage);
  const backupSource = getBackupSource("deal-finder");
  equal(backupSource.schemaVersion, 4, "Business Inventory backup declares the correction-ledger schema");
  ok(backupSource.supportedSchemaVersions.includes(3), "the prior acquisition schema remains explicitly supported");
  ok(backupSource.recordPaths.includes("inventoryAdjustments"), "safe append-only correction events remain under existing Inventory backup authority");
  ok(!backupSource.recordPaths.some((path) => /candidate|preview|journal/i.test(path)), "candidate, preview, and undo-journal state are not backup sources");
  equal(validateBackupSourceData(backupSource, state).valid, true, "schema-4 correction history passes the strict backup validator");
  ok(!JSON.stringify(state).includes('"recordType":"INVENTORY_CORRECTION_CANDIDATE"'), "the non-authoritative candidate is never persisted");
  ok(!JSON.stringify(state).includes(completed.candidate.expectedVersion), "the ephemeral review version is not retained in canonical business state");
  ok(![...harness.inventoryStorage.values.keys()].some((key) => /commit-journal/i.test(key)), "the private undo journal is cleared after verified success");

  const migration = getMigrationSource("deal-finder");
  for (const path of ["inventory", "inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments", "sales"]) {
    equal(
      migration.paths.find((entry) => entry.path === path)?.classification,
      MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING,
      `${path} stays fail-closed for future remote migration`,
    );
  }

  const tampered = JSON.parse(JSON.stringify(state));
  const adjustment = tampered.inventoryAdjustments.find((entry) => entry.id === completed.result.adjustment.id);
  adjustment.quantity = 999;
  adjustment.totalCostMinorUnits = 999_999;
  adjustment.unitCostsMinorUnits = [999_999];
  assert.throws(
    () => validateInventoryCreationStateBundles(tampered),
    (error) => error.code === "ADJUSTMENT_SUMMARY_MISMATCH",
    "typed correction summaries cannot contradict their signed before/after effects",
  ); assertions += 1;

  const tamperedVector = JSON.parse(JSON.stringify(state));
  const vectorAdjustment = tamperedVector.inventoryAdjustments.find((entry) => entry.id === completed.result.adjustment.id);
  vectorAdjustment.unitCostsMinorUnits = [0, vectorAdjustment.totalCostMinorUnits];
  assert.throws(
    () => validateInventoryCreationStateBundles(tamperedVector),
    (error) => error.code === "ADJUSTMENT_UNIT_SLICE_MISMATCH",
    "equal-sum correction vectors cannot falsify the deterministic affected-unit slice",
  ); assertions += 1;

  const tamperedKind = JSON.parse(JSON.stringify(state));
  tamperedKind.inventoryAdjustments.find((entry) => entry.id === completed.result.adjustment.id).eventKind = "INVENTORY_CORRECTION_EVENT";
  assert.throws(
    () => validateInventoryCreationStateBundles(tamperedKind),
    (error) => error.code === "CORRECTION_EVENT_KIND_MISMATCH",
    "a disposition category cannot be relabeled as a generic correction event",
  ); assertions += 1;

  const tamperedCandidate = JSON.parse(JSON.stringify(state));
  const candidateAdjustment = tamperedCandidate.inventoryAdjustments.find((entry) => entry.id === completed.result.adjustment.id);
  candidateAdjustment.candidateId = "inventory-correction-candidate:synthetic-mismatch.test";
  assert.throws(
    () => validateInventoryCreationStateBundles(tamperedCandidate),
    (error) => ["INVENTORY_BUNDLE_MISMATCH", "CORRECTION_CANDIDATE_ID_MISMATCH"].includes(error.code),
    "typed correction candidate identity cannot be detached from item, category, and idempotency key",
  ); assertions += 1;

  const tamperedReversalReference = JSON.parse(JSON.stringify(state));
  tamperedReversalReference.inventoryAdjustments.find((entry) => entry.id === completed.result.adjustment.id).reversesAdjustmentId = "inventory-adjustment.forged.test";
  assert.throws(
    () => validateInventoryCreationStateBundles(tamperedReversalReference),
    (error) => error.code === "REVERSAL_TARGET_NOT_ALLOWED",
    "non-reversal canonical history cannot retain an invented reversal link",
  ); assertions += 1;
}

{
  const harness = await createManagedInventory({ id: "dedicated-creation-reversal" });
  assert.throws(
    () => harness.service.previewInventoryCorrection(
      harness.created.inventoryItem.id,
      correctionProposal(INVENTORY_CORRECTION_CATEGORIES.CREATION_REVERSAL, "dedicated-creation-reversal"),
    ),
    (error) => error.code === "UNSUPPORTED_CORRECTION_CATEGORY",
    "creation reversal cannot masquerade as a generic correction preview",
  ); assertions += 1;
}

{
  const harness = await createManagedInventory({ id: "quantity-reason-integrity", quantity: 2 });
  const loss = await confirmCorrection(
    harness.service,
    harness.created.inventoryItem,
    correctionProposal(INVENTORY_CORRECTION_CATEGORIES.QUANTITY_CORRECTION, "quantity-reason-integrity-loss", {
      quantity: 1,
      quantityReason: "LOSS",
    }),
  );
  const tampered = structuredClone(storedInventory(harness.inventoryStorage));
  tampered.inventoryAdjustments.find((entry) => entry.id === loss.result.adjustment.id).quantityReason = "RETURN";
  assert.throws(
    () => validateInventoryCreationStateBundles(tampered),
    (error) => error.code === "CORRECTION_PROPOSAL_DIGEST_MISMATCH",
    "a loss disposition cannot be relabeled as a physical return after confirmation",
  ); assertions += 1;
  const redigested = structuredClone(tampered);
  const redigestedAdjustment = redigested.inventoryAdjustments.find((entry) => entry.id === loss.result.adjustment.id);
  redigestedAdjustment.semanticDigest = inventoryAdjustmentSemanticDigest(redigestedAdjustment);
  assert.throws(
    () => validateInventoryCreationStateBundles(redigested),
    (error) => error.code === "CORRECTION_PROPOSAL_DIGEST_MISMATCH",
    "recomputing a public semantic checksum cannot detach quantity reason from its original confirmed proposal",
  ); assertions += 1;
  harness.inventoryStorage.values.set("ember-and-tide.flip-scout.v1", JSON.stringify(redigested));
  await assert.rejects(
    () => harness.service.recordPurchaseEvent(harness.purchase.id, {
      type: PURCHASE_EVENT_TYPES.REPLACEMENT_NOTED,
      idempotencyKey: "purchase-event.quantity-reason-tamper.test",
      lineItemId: harness.purchase.lineItems[0].lineItemId,
      quantity: 1,
      relatedEventId: loss.result.adjustment.id,
      replacementReference: "quantity-reason-tamper.synthetic.test",
    }),
    (error) => error.code === "CORRECTION_PROPOSAL_DIGEST_MISMATCH",
    "tampered quantity-reason history cannot authorize replacement Inventory",
  ); assertions += 1;
}

console.log(`Code 3 Inventory Correction security: ${assertions} assertions passed.`);
