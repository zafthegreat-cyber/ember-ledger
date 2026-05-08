import { seedStores } from "../data/seedStores";
import { ScoutAlert, Store, StoreReport } from "../types/store.types";
import { createMemoryStore } from "./memoryStore";

const storeDirectory = createMemoryStore<Store>(seedStores);
const storeReports = createMemoryStore<StoreReport>();
const scoutAlerts = createMemoryStore<ScoutAlert>();

export const storesService = {
  list: (query?: string) => storeDirectory.list(query),
  search: (query?: string) => storeDirectory.list(query),
  get: (id: string) => storeDirectory.get(id),
  create: (store: Partial<Store>) =>
    storeDirectory.create({
      name: store.name || "Unnamed store",
      state: store.state || "VA",
      ...store,
    }),
  update: (id: string, store: Partial<Store>) => storeDirectory.update(id, store),
  remove: (id: string) => storeDirectory.remove(id),
};

export const storeReportsService = {
  list: (storeId?: string) =>
    storeId
      ? storeReports.list().filter((report) => report.storeId === storeId)
      : storeReports.list(),
  create: (report: Partial<StoreReport>) =>
    storeReports.create({
      storeName: report.storeName || "Unknown store",
      reportDate: report.reportDate || new Date().toISOString().slice(0, 10),
      confidenceLevel: report.confidenceLevel || "Unknown",
      verified: !!report.verified,
      ...report,
    }),
  update: (id: string, report: Partial<StoreReport>) => storeReports.update(id, report),
  remove: (id: string) => storeReports.remove(id),
};

export const scoutAlertsService = {
  list: () => scoutAlerts.list(),
  create: (alert: Partial<ScoutAlert>) =>
    scoutAlerts.create({
      title: alert.title || "Scout alert",
      enabled: alert.enabled ?? true,
      ...alert,
    }),
  update: (id: string, alert: Partial<ScoutAlert>) => scoutAlerts.update(id, alert),
  remove: (id: string) => scoutAlerts.remove(id),
};

