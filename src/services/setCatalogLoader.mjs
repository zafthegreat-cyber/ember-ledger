export function createSetCatalogLoader({ manifest = () => import("virtual:code3-set-catalog").then(module => module.default), fetcher = (...args) => fetch(...args), maxCachedSets = 8 } = {}) {
  const cache = new Map();
  return async function loadSetCatalog(key, { signal } = {}) {
    const directory = await manifest();
    if (signal?.aborted) throw new DOMException("Catalog load cancelled", "AbortError");
    const entry = Object.hasOwn(directory, key) ? directory[key] : null;
    if (!entry) return { available: false, products: [] };
    if (cache.has(entry.url)) { const value = cache.get(entry.url); cache.delete(entry.url); cache.set(entry.url, value); return value; }
    const response = await fetcher(entry.url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("The set catalog could not be loaded. Please try again.");
    const result = await response.json();
    if (result.schemaVersion !== 1 || result.key !== key || !Array.isArray(result.products) || result.products.some(product => !product || typeof product !== "object")) throw new Error("The set catalog could not be verified. Please try again.");
    if (signal?.aborted) throw new DOMException("Catalog load cancelled", "AbortError");
    const value = { available: true, products: result.products, cards: entry.cards, sealed: entry.sealed };
    cache.set(entry.url, value); while (cache.size > Math.max(1, maxCachedSets)) cache.delete(cache.keys().next().value);
    return value;
  };
}
export const loadSetCatalog = createSetCatalogLoader();
