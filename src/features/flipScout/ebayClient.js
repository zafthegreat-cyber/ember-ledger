import { getOwnerRequestHeaders, isLocalDevelopmentIdentityEnabled } from "../../services/ownerSession.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const CLIENT_TIMEOUT_MS = 20_000;

export class EbayClientError extends Error {
  constructor(message, { code = "request_failed", status = 0, retryAfterSeconds = 0, payload = null } = {}) {
    super(message);
    this.name = "EbayClientError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.payload = payload;
  }
}

async function requestEbay(path, { allowErrorPayload = false, ...options } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const queryEnabled = new URLSearchParams(window.location.search).get("betaLocalMode") === "true";
    const ownerHeaders = await getOwnerRequestHeaders({
      localDevelopment: isLocalDevelopmentIdentityEnabled({ queryEnabled }),
    });
    const response = await fetch(`${API_BASE}/api/ebay${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...ownerHeaders,
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok && (!allowErrorPayload || response.status === 401 || response.status === 403)) {
      const detail = payload?.error || {};
      const accessMessage = response.status === 401
        ? "Sign in is required to use the eBay connector."
        : response.status === 403
          ? "Owner access is required to use the eBay connector."
          : "";
      throw new EbayClientError(accessMessage || detail.message || `The eBay connector returned HTTP ${response.status}.`, {
        code: detail.code || "request_failed",
        status: response.status,
        retryAfterSeconds: Number(detail.retryAfterSeconds || response.headers.get("retry-after") || 0),
        payload,
      });
    }
    if (!payload) throw new EbayClientError("The eBay connector returned an unreadable response.", { status: response.status });
    return payload;
  } catch (error) {
    if (error instanceof EbayClientError) throw error;
    if (error?.name === "AbortError") {
      throw new EbayClientError("The eBay connector request timed out. Try a manual refresh.", { code: "timeout", status: 504 });
    }
    throw new EbayClientError("The eBay connector could not reach the application server.", { code: "network_error" });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getEbayHealth({ verify = false } = {}) {
  return requestEbay(`/health?verify=${verify ? "true" : "false"}`, { allowErrorPayload: true });
}

export function searchEbayListings(search) {
  return requestEbay("/search", { method: "POST", body: JSON.stringify(search || {}) });
}
