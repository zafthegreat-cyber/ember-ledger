import { randomUUID } from "crypto";

type Entity = {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export function nowIso() {
  return new Date().toISOString();
}

export function createMemoryStore<T extends Entity>(initialItems: T[] = []) {
  let items = [...initialItems];

  return {
    list(search?: string) {
      const q = (search || "").trim().toLowerCase();
      if (!q) return items;

      return items.filter((item) =>
        Object.values(item).some((value) =>
          String(value || "").toLowerCase().includes(q)
        )
      );
    },
    get(id: string) {
      return items.find((item) => item.id === id) || null;
    },
    create(input: Partial<T>) {
      const time = nowIso();
      const item = {
        id: String(input.id || randomUUID()),
        ...input,
        createdAt: String(input.createdAt || time),
        updatedAt: time,
      } as T;
      items.unshift(item);
      return item;
    },
    update(id: string, input: Partial<T>) {
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return null;
      items[index] = {
        ...items[index],
        ...input,
        id,
        updatedAt: nowIso(),
      };
      return items[index];
    },
    remove(id: string) {
      const item = this.get(id);
      if (!item) return null;
      items = items.filter((entry) => entry.id !== id);
      return item;
    },
  };
}

