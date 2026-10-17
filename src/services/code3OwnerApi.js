import { getOwnerRequestHeaders } from "./ownerSession.js";

const VITE_ENV = import.meta.env || {};
const API_BASE = String(VITE_ENV.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function code3OwnerRequest(path, init = {}, options = {}) {
  const route = String(path || "");
  if (!route.startsWith("/api/code3/")) {
    throw new Error("Code 3 owner requests must use the protected canonical API.");
  }
  const authorizationHeaders = await getOwnerRequestHeaders({ localDevelopment: options.localDevelopment === true });
  return (options.fetchImpl || globalThis.fetch)(`${API_BASE}${route}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers || {}),
      ...authorizationHeaders,
    },
  });
}
