import { numericDistance } from "./routeUtils";

export function normalizeStoreSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function storeMatchesSearch(store = {}, query = "") {
  const search = normalizeStoreSearch(query);
  if (!search) return true;
  return [
    store.name,
    store.nickname,
    store.chain,
    store.storeGroup,
    store.address,
    store.city,
    store.county,
    store.region,
    store.zip,
    store.notes,
  ].some((value) => normalizeStoreSearch(value).includes(search));
}

export function sortStores(stores = [], sortBy = "nickname") {
  return [...stores].sort((a, b) => {
    if (sortBy === "distance") return numericDistance(a) - numericDistance(b);
    if (sortBy === "city") return String(a.city || "").localeCompare(String(b.city || ""));
    if (sortBy === "last report") return new Date(b.lastReportDate || 0) - new Date(a.lastReportDate || 0);
    if (sortBy === "restock confidence") return Number(b.restockConfidence || 0) - Number(a.restockConfidence || 0);
    if (sortBy === "tidepool score") return Number(b.tidepoolScore || 0) - Number(a.tidepoolScore || 0);
    return String(a.nickname || a.name || "").localeCompare(String(b.nickname || b.name || ""));
  });
}
