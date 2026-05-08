import { Store } from "../types/store.types";

const now = new Date().toISOString();

export const seedStores: Store[] = [
  {
    id: "store-target-greenbrier",
    name: "Target Greenbrier",
    chain: "Target",
    nickname: "Greenbrier Target",
    address: "1401 Greenbrier Pkwy",
    city: "Chesapeake",
    state: "VA",
    zip: "23320",
    region: "Hampton Roads",
    storeType: "Big Box",
    notes: "Starter backend seed. Restock details should come from user reports or verified sources.",
    createdAt: now,
    updatedAt: now,
  },
];

