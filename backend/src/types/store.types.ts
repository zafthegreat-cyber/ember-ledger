export type Store = {
  id: string;
  name: string;
  chain?: string;
  nickname?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  region?: string;
  phone?: string;
  website?: string;
  storeType?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoreReport = {
  id: string;
  storeId?: string;
  storeName?: string;
  chain?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  reportDate?: string;
  reportTime?: string;
  reportedBy?: string;
  productName?: string;
  productType?: string;
  quantitySeen?: number | null;
  price?: number | null;
  shelfLocation?: string;
  limits?: string;
  notes?: string;
  photoUrl?: string;
  confidenceLevel?: string;
  verified?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScoutAlert = {
  id: string;
  title: string;
  message?: string;
  type?: string;
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

