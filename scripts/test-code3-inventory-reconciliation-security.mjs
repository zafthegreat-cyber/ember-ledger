import assert from "node:assert/strict";
import { validateInventoryReconciliationState } from "../src/features/purchaseReceiving/inventoryReconciliation/contracts.js";
import {
  INVENTORY_RECONCILIATION_CATEGORIES,
  INVENTORY_RECONCILIATION_SAFETY,
} from "../src/features/purchaseReceiving/inventoryReconciliation/constants.js";
import {
  confirmReconciliation,
  costProposal,
  createSoldManagedInventory,
  reconciliationProposal,
  storedInventory,
} from "./inventory-reconciliation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };

{
  const harness = await createSoldManagedInventory({ id: "owner-before-read" });
  const reads = harness.inventoryStorage.reads;
  harness.authority.allowed = false;
  assert.throws(
    () => harness.service.previewInventoryReconciliation(harness.inventoryItem.id, costProposal("unauthorized", 1200)),
    (error) => error.code === "OWNER_REQUIRED",
  ); assertions += 1;
  equal(harness.inventoryStorage.reads, reads, "verified OWNER authorization occurs before reconciliation storage access");
}

{
  const harness = await createSoldManagedInventory({ id: "unsafe-payload" });
  const before = JSON.stringify(storedInventory(harness.inventoryStorage));
  for (const malicious of [
    { role: "OWNER" },
    { ownerAuthorized: true },
    { sessionToken: "synthetic-session.invalid" },
    { password: "synthetic-password.invalid" },
    { bearerToken: "synthetic-bearer.invalid" },
    { paymentCardNumber: "4111111111111111" },
    { cvv: "123" },
    { retailerCookie: "synthetic-cookie.invalid" },
    { proxyUrl: "https://user:pass@proxy.invalid" },
    { rawProviderPayload: { event: "synthetic" } },
  ]) {
    assert.throws(() => harness.service.previewInventoryReconciliation(harness.inventoryItem.id, {
      ...costProposal(`unsafe-${Object.keys(malicious)[0]}`, 1200),
      ...malicious,
    })); assertions += 1;
  }
  const polluted = JSON.parse('{"category":"COGS_RECONCILIATION","idempotencyKey":"polluted.test","reason":"Synthetic.","targetTotalCostMinorUnits":1200,"__proto__":{"isOwner":true}}');
  assert.throws(() => harness.service.previewInventoryReconciliation(harness.inventoryItem.id, polluted)); assertions += 1;
  equal(JSON.stringify(storedInventory(harness.inventoryStorage)), before, "rejected payloads produce zero canonical writes");
}

{
  const harness = await createSoldManagedInventory({ id: "ephemeral" });
  const before = JSON.stringify(storedInventory(harness.inventoryStorage));
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, costProposal("ephemeral", 1200));
  equal(candidate.authoritative, false);
  equal(candidate.persisted, false);
  equal(JSON.stringify(storedInventory(harness.inventoryStorage)), before, "candidate/impact preview remains zero-write");
}

{
  const harness = await createSoldManagedInventory({ id: "tamper", quantity: 3, soldQuantity: 1 });
  await confirmReconciliation(harness.service, harness.inventoryItem, costProposal("tamper", 1200));
  const state = storedInventory(harness.inventoryStorage);
  const event = state.inventoryReconciliationEvents[0];
  for (const tamper of [
    { ...event, saleCogsEffectMinorUnits: event.saleCogsEffectMinorUnits + 1 },
    { ...event, costEffectMinorUnits: event.costEffectMinorUnits + 1 },
    { ...event, affectedSales: event.affectedSales.map((sale) => ({ ...sale, cogsDeltaMinorUnits: sale.cogsDeltaMinorUnits + 1 })) },
    { ...event, affectedTransfers: [{ transferId: "transfer.synthetic.invalid" }] },
  ]) {
    assert.throws(() => validateInventoryReconciliationState({
      ...state,
      inventoryReconciliationEvents: [tamper],
    })); assertions += 1;
  }
  equal(JSON.stringify(state.sales), harness.originalSaleJson, "tamper probes retain immutable Sale bytes");
}

{
  const harness = await createSoldManagedInventory({ id: "return-bound", quantity: 2, soldQuantity: 1 });
  const candidate = harness.service.previewInventoryReconciliation(harness.inventoryItem.id, reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.RETURN_AFTER_SALE_RECONCILIATION,
    "return-bound",
    { quantity: 2 },
  ));
  equal(candidate.eligible, false);
  ok(candidate.blockers.includes("RETURN_EXCEEDS_PHYSICALLY_AVAILABLE_QUANTITY"));
  equal(storedInventory(harness.inventoryStorage).inventory[0].quantity, 2, "failed return cannot create negative Inventory");
}

equal(INVENTORY_RECONCILIATION_SAFETY.authoritative, "LOCAL_ONLY");
equal(INVENTORY_RECONCILIATION_SAFETY.remoteActive, false);
equal(INVENTORY_RECONCILIATION_SAFETY.ownerConfirmationRequired, true);
equal(INVENTORY_RECONCILIATION_SAFETY.originalSalesMutable, false);
equal(INVENTORY_RECONCILIATION_SAFETY.originalTransfersMutable, false);
equal(INVENTORY_RECONCILIATION_SAFETY.realizedCogsDestructivelyRewritten, false);

console.log(`Code 3 Inventory Reconciliation security: ${assertions} assertions passed.`);
