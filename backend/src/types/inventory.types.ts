export type InventoryItem = {
  id: string;
  catalogItemId?: string;
  name: string;
  productType?: string;
  quantity: number;
  purchasePrice?: number | null;
  msrp?: number | null;
  marketValue?: number | null;
  plannedSalePrice?: number | null;
  location?: string;
  owner?: string;
  condition?: string;
  purchaseDate?: string;
  source?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type VaultItem = InventoryItem & {
  category?: string;
  personalCollection?: boolean;
};

export type Sale = {
  id: string;
  inventoryItemId?: string;
  name: string;
  salePrice?: number | null;
  fees?: number | null;
  shipping?: number | null;
  platform?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  date?: string;
  category: string;
  subcategory?: string;
  amount: number;
  vendor?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

