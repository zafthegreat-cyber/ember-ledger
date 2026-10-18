import { getOwnerRequestHeaders } from "./ownerSession.js";

import { getApiBase } from "../native/nativeRuntime.js";
const API_BASE = getApiBase();

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
