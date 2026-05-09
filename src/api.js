import { sanitizeUserProfileUpdates } from "./constants/plans";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null
        ? payload.message || payload.error
        : payload;
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return payload;
}

const apiPath = (path) => `/api${path}`;

export function getApiHealth() {
  return request(apiPath("/health"));
}

// Catalog / TideTradr
export function getCatalogItems() {
  return request(apiPath("/catalog"));
}

export function searchCatalogItems(query = "") {
  const params = new URLSearchParams({ q: query });
  return request(apiPath(`/catalog/search?${params.toString()}`));
}

export function getCatalogItem(id) {
  return request(apiPath(`/catalog/${id}`));
}

export function createCatalogItem(item) {
  return request(apiPath("/catalog"), {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateCatalogItem(id, item) {
  return request(apiPath(`/catalog/${id}`), {
    method: "PUT",
    body: JSON.stringify(item),
  });
}

export function deleteCatalogItem(id) {
  return request(apiPath(`/catalog/${id}`), {
    method: "DELETE",
  });
}

// Inventory / Forge
export function getInventory() {
  return request(apiPath("/inventory"));
}

export function createInventoryItem(item) {
  return request(apiPath("/inventory"), {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateInventoryItem(id, item) {
  return request(apiPath(`/inventory/${id}`), {
    method: "PUT",
    body: JSON.stringify(item),
  });
}

export function deleteInventoryItem(id) {
  return request(apiPath(`/inventory/${id}`), {
    method: "DELETE",
  });
}

// Vault
export function getVaultItems() {
  return request(apiPath("/vault"));
}

export function createVaultItem(item) {
  return request(apiPath("/vault"), {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateVaultItem(id, item) {
  return request(apiPath(`/vault/${id}`), {
    method: "PUT",
    body: JSON.stringify(item),
  });
}

export function deleteVaultItem(id) {
  return request(apiPath(`/vault/${id}`), {
    method: "DELETE",
  });
}

// Forge sales and expenses
export function getSales() {
  return request(apiPath("/sales"));
}

export function createSale(sale) {
  return request(apiPath("/sales"), {
    method: "POST",
    body: JSON.stringify(sale),
  });
}

export function updateSale(id, sale) {
  return request(apiPath(`/sales/${id}`), {
    method: "PUT",
    body: JSON.stringify(sale),
  });
}

export function deleteSale(id) {
  return request(apiPath(`/sales/${id}`), {
    method: "DELETE",
  });
}

export function getExpenses() {
  return request(apiPath("/expenses"));
}

export function createExpense(expense) {
  return request(apiPath("/expenses"), {
    method: "POST",
    body: JSON.stringify(expense),
  });
}

export function updateExpense(id, expense) {
  return request(apiPath(`/expenses/${id}`), {
    method: "PUT",
    body: JSON.stringify(expense),
  });
}

export function deleteExpense(id) {
  return request(apiPath(`/expenses/${id}`), {
    method: "DELETE",
  });
}

// Stores / Scout
export function getStores() {
  return request(apiPath("/stores"));
}

export function searchStores(query = "") {
  const params = new URLSearchParams({ q: query });
  return request(apiPath(`/stores/search?${params.toString()}`));
}

export function getStoreById(id) {
  return request(apiPath(`/stores/${id}`));
}

export function getStoresByRegion(region) {
  return searchStores(region);
}

export function getStoresByCity(city) {
  return searchStores(city);
}

export function createStore(store) {
  return request(apiPath("/stores"), {
    method: "POST",
    body: JSON.stringify(store),
  });
}

export function updateStore(storeId, store) {
  return request(apiPath(`/stores/${storeId}`), {
    method: "PUT",
    body: JSON.stringify(store),
  });
}

export function deleteStore(storeId) {
  return request(apiPath(`/stores/${storeId}`), {
    method: "DELETE",
  });
}

// Store Reports / Tidepool
export function getStoreReports(storeId) {
  const params = storeId ? `?${new URLSearchParams({ storeId }).toString()}` : "";
  return request(apiPath(`/store-reports${params}`));
}

export function createStoreReport(report) {
  return request(apiPath("/store-reports"), {
    method: "POST",
    body: JSON.stringify(report),
  });
}

export function updateStoreReport(reportId, report) {
  return request(apiPath(`/store-reports/${reportId}`), {
    method: "PUT",
    body: JSON.stringify(report),
  });
}

export function deleteStoreReport(reportId) {
  return request(apiPath(`/store-reports/${reportId}`), {
    method: "DELETE",
  });
}

// Compatibility wrappers for older store-nested report callers.
export function getReports(storeId) {
  return getStoreReports(storeId);
}

export function createReport(storeId, report) {
  return createStoreReport({ ...report, storeId });
}

export function updateReport(_storeId, reportId, report) {
  return updateStoreReport(reportId, report);
}

export function deleteReport(_storeId, reportId) {
  return deleteStoreReport(reportId);
}

// Compatibility helpers for existing Scout tracked items. These continue to use
// the older nested backend endpoints until tracked items move into the new /api layer.
export function getTrackedItems(storeId) {
  return request(`/stores/${storeId}/items`);
}

export function createTrackedItem(storeId, item) {
  return request(`/stores/${storeId}/items`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function updateTrackedItem(storeId, itemId, item) {
  return request(`/stores/${storeId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(item),
  });
}

export function deleteTrackedItem(storeId, itemId) {
  return request(`/stores/${storeId}/items/${itemId}`, {
    method: "DELETE",
  });
}

// Scout Alerts
export function getScoutAlerts() {
  return request(apiPath("/scout/alerts"));
}

export function createScoutAlert(alert) {
  return request(apiPath("/scout/alerts"), {
    method: "POST",
    body: JSON.stringify(alert),
  });
}

export function updateScoutAlert(id, alert) {
  return request(apiPath(`/scout/alerts/${id}`), {
    method: "PUT",
    body: JSON.stringify(alert),
  });
}

export function deleteScoutAlert(id) {
  return request(apiPath(`/scout/alerts/${id}`), {
    method: "DELETE",
  });
}

// Market
export function searchMarketData(query = "") {
  const params = new URLSearchParams({ q: query });
  return request(apiPath(`/market/search?${params.toString()}`));
}

export function getMarketItem(id) {
  return request(apiPath(`/market/item/${id}`));
}

export function refreshMarketItem(id) {
  return request(apiPath(`/market/refresh/${id}`), {
    method: "POST",
  });
}

// Scan
export function scanUpc(upc) {
  return request(apiPath("/scan/upc"), {
    method: "POST",
    body: JSON.stringify({ upc }),
  });
}

export function scanCard(cardInput) {
  return request(apiPath("/scan/card"), {
    method: "POST",
    body: JSON.stringify({ input: cardInput }),
  });
}

export function scanReceipt(receiptInput) {
  return request(apiPath("/scan/receipt"), {
    method: "POST",
    body: JSON.stringify({ input: receiptInput }),
  });
}

// Best Buy
export function searchBestBuyProducts(query = "") {
  const params = new URLSearchParams({ q: query });
  return request(apiPath(`/bestbuy/search?${params.toString()}`));
}

export function getBestBuySku(sku) {
  return request(apiPath(`/bestbuy/sku/${sku}`));
}

export function getBestBuyAvailability(sku, zip = "") {
  const params = new URLSearchParams({ sku, zip });
  return request(apiPath(`/bestbuy/availability?${params.toString()}`));
}

export function matchBestBuyToCatalog(sku, productName = "") {
  return request(apiPath("/bestbuy/match-catalog"), {
    method: "POST",
    body: JSON.stringify({ sku, productName }),
  });
}

// Compatibility helpers for existing shared catalog/import work.
export function getPokemonProducts() {
  return getCatalogItems();
}

export function searchPokemonProducts(query) {
  return searchCatalogItems(query);
}

export function getProductById(id) {
  return getCatalogItem(id);
}

export function addInventoryItemFromCatalog(productId, quantity, costEach, location, notes = "") {
  return createInventoryItem({
    catalogItemId: productId,
    quantity,
    purchasePrice: costEach,
    location,
    notes,
  });
}

export function addStoreReport(storeId, productId, report) {
  return createStoreReport({
    ...report,
    storeId,
    catalogItemId: productId,
  });
}

export function updateUserProfileSettings(profileUpdates) {
  return request("/user-profile", {
    method: "PATCH",
    body: JSON.stringify(sanitizeUserProfileUpdates(profileUpdates)),
  });
}
