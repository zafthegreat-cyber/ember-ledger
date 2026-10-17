import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { suggestedInventorySaleCogsMinorUnits } from "../src/features/flipScout/exactInventoryCost.js";
import {
  INVENTORY_RECONCILIATION_CATEGORIES,
} from "../src/features/purchaseReceiving/inventoryReconciliation/constants.js";
import {
  createManagedInventory,
  storedInventory,
} from "./inventory-correction-test-helpers.mjs";

export { storedInventory };

export function reconciliationProposal(category, id, patch = {}) {
  return {
    category,
    idempotencyKey: `inventory-reconciliation.${id}.test`,
    reason: `Synthetic ${id} historical reconciliation review.`,
    ...patch,
  };
}

export function appendManagedSale(repository, item, {
  id,
  quantity = 1,
  status = "Completed",
  grossSalePrice = 20,
  netProceeds = 20,
  saleDate = "2026-08-15",
} = {}) {
  const state = repository.load();
  const minorUnits = suggestedInventorySaleCogsMinorUnits(item, state.sales, quantity);
  if (!Number.isSafeInteger(minorUnits)) throw new Error("Synthetic managed Sale could not derive exact COGS.");
  const result = repository.upsert("sales", {
    id: id || `sale.${item.id}.${state.sales.length + 1}.test`,
    inventoryItemId: item.id,
    lotId: item.inventoryLotId,
    quantitySold: quantity,
    status,
    saleDate,
    salesChannel: "Synthetic reconciliation channel",
    grossSalePrice,
    netProceeds,
    allocatedCostOfGoodsSoldMinorUnits: minorUnits,
    allocatedCostOfGoodsSold: minorUnits / 100,
    costAuthority: "INTEGER_MINOR_UNITS",
    realizedProfit: netProceeds - (minorUnits / 100),
    notes: "Synthetic Phase 2C-D Sale.",
  });
  if (result.error) throw new Error(result.error);
  return result.record;
}

export async function createSoldManagedInventory(options = {}) {
  const quantity = options.quantity || 3;
  const harness = await createManagedInventory({
    ...options,
    id: options.id || "reconciliation",
    quantity,
    totalMinorUnits: options.totalMinorUnits ?? 1000,
  });
  const repository = createFlipScoutRepository(harness.inventoryStorage, {
    lockManager: options.inventoryLockManager,
  });
  let item = repository.load().inventory.find((entry) => entry.id === harness.created.inventoryItem.id);
  const sales = [];
  for (const [index, sale] of (options.sales || [{ quantity: options.soldQuantity || 1 }]).entries()) {
    sales.push(appendManagedSale(repository, item, {
      id: sale.id || `sale.${options.id || "reconciliation"}.${index + 1}.test`,
      ...sale,
    }));
    item = repository.load().inventory.find((entry) => entry.id === item.id);
  }
  return {
    ...harness,
    repository,
    inventoryItem: item,
    sales,
    originalSaleJson: JSON.stringify(repository.load().sales),
    originalState: repository.load(),
  };
}

export async function confirmReconciliation(service, item, proposal) {
  const candidate = service.previewInventoryReconciliation(item.id, proposal);
  const result = await service.confirmInventoryReconciliation(item.id, candidate.candidateId, {
    expectedVersion: candidate.expectedVersion,
    proposal,
  });
  return { candidate, result };
}

export function costProposal(id, targetTotalCostMinorUnits, patch = {}) {
  return reconciliationProposal(
    INVENTORY_RECONCILIATION_CATEGORIES.COGS_RECONCILIATION,
    id,
    { targetTotalCostMinorUnits, ...patch },
  );
}
