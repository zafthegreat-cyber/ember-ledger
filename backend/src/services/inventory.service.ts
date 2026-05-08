import { Expense, InventoryItem, Sale, VaultItem } from "../types/inventory.types";
import { createMemoryStore } from "./memoryStore";

export const inventoryService = createMemoryStore<InventoryItem>();
export const vaultService = createMemoryStore<VaultItem>();
export const salesService = createMemoryStore<Sale>();
export const expensesService = createMemoryStore<Expense>();

