import { seedCatalog } from "../data/seedCatalog";
import { CatalogItem } from "../types/catalog.types";
import { createMemoryStore } from "./memoryStore";

const catalogStore = createMemoryStore<CatalogItem>(seedCatalog);

export const catalogService = {
  list: (query?: string) => catalogStore.list(query),
  search: (query?: string) => catalogStore.list(query),
  get: (id: string) => catalogStore.get(id),
  create: (item: Partial<CatalogItem>) =>
    catalogStore.create({
      name: item.name || "Unnamed catalog item",
      brand: item.brand || "Pokemon",
      franchise: item.franchise || "Pokemon TCG",
      category: item.category || "Unknown",
      ...item,
    }),
  update: (id: string, item: Partial<CatalogItem>) => catalogStore.update(id, item),
  remove: (id: string) => catalogStore.remove(id),
};

