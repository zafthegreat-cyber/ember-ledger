import { Store } from "../types/store.types";

const now = new Date().toISOString();

export const seedStores: Store[] = [
  {
    id: "store-target-greenbrier",
    name: "Target Greenbrier",
    country: "United States",
    retailer: "Target",
    storeName: "Target Greenbrier",
    chain: "Target",
    nickname: "Greenbrier Target",
    address: "1401 Greenbrier Pkwy",
    city: "Chesapeake",
    state: "Virginia",
    zip: "23320",
    zipCode: "23320",
    region: "Hampton Roads / 757",
    storeType: "Big Box",
    active: true,
    pokemonStockLikelihood: "high",
    notes: "Starter backend seed. Restock details should come from user reports or verified sources.",
    createdAt: now,
    updatedAt: now,
  },
];
