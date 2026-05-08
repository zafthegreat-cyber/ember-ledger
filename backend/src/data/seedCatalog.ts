import { CatalogItem } from "../types/catalog.types";

const now = new Date().toISOString();

export const seedCatalog: CatalogItem[] = [
  {
    id: "catalog-prismatic-etb",
    name: "Prismatic Evolutions Elite Trainer Box",
    brand: "Pokemon",
    franchise: "Pokemon TCG",
    category: "Sealed Product",
    productType: "Elite Trainer Box",
    setName: "Prismatic Evolutions",
    msrp: null,
    marketValue: null,
    notes: "Starter backend seed. Price data should be refreshed through TideTradr market sources.",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "catalog-151-booster-bundle",
    name: "Scarlet & Violet 151 Booster Bundle",
    brand: "Pokemon",
    franchise: "Pokemon TCG",
    category: "Sealed Product",
    productType: "Booster Bundle",
    setName: "Scarlet & Violet 151",
    msrp: null,
    marketValue: null,
    notes: "Starter backend seed. UPC/SKU can be imported later.",
    createdAt: now,
    updatedAt: now,
  },
];

