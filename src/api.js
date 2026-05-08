import { sanitizeUserProfileUpdates } from "./constants/plans";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function getStores() {
  return request("/stores");
}

export function getStoresByRegion(region) {
  const params = new URLSearchParams({ region });
  return request(`/stores?${params.toString()}`);
}

export function getStoresByCity(city) {
  const params = new URLSearchParams({ city });
  return request(`/stores?${params.toString()}`);
}

export function getStoreById(id) {
  return request(`/stores/${id}`);
}

export function createStore(store) {
  return request("/stores", {
    method: "POST",
    body: JSON.stringify(store),
  });
}

export function updateStore(storeId, store) {
  return request(`/stores/${storeId}`, {
    method: "PATCH",
    body: JSON.stringify(store),
  });
}

export function deleteStore(storeId) {
  return request(`/stores/${storeId}`, {
    method: "DELETE",
  });
}

export function getReports(storeId) {
  return request(`/stores/${storeId}/reports`);
}

export function createReport(storeId, report) {
  return request(`/stores/${storeId}/reports`, {
    method: "POST",
    body: JSON.stringify(report),
  });
}

export function updateReport(storeId, reportId, report) {
  return request(`/stores/${storeId}/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify(report),
  });
}

export function deleteReport(storeId, reportId) {
  return request(`/stores/${storeId}/reports/${reportId}`, {
    method: "DELETE",
  });
}

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

export function getPokemonProducts() {
  return request("/pokemon-products");
}

export function searchPokemonProducts(query) {
  const params = new URLSearchParams({ q: query || "" });
  return request(`/pokemon-products/search?${params.toString()}`);
}

export function getProductById(id) {
  return request(`/pokemon-products/${id}`);
}

export function addInventoryItemFromCatalog(productId, quantity, costEach, location, notes = "") {
  return request("/user-inventory", {
    method: "POST",
    body: JSON.stringify({
      productId,
      quantity,
      costEach,
      location,
      notes,
    }),
  });
}

export function addStoreReport(storeId, productId, report) {
  return request(`/stores/${storeId}/reports`, {
    method: "POST",
    body: JSON.stringify({
      ...report,
      productId,
    }),
  });
}

export function updateUserProfileSettings(profileUpdates) {
  return request("/user-profile", {
    method: "PATCH",
    body: JSON.stringify(sanitizeUserProfileUpdates(profileUpdates)),
  });
}
