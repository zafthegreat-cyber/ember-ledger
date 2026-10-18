const API_BASE = String((import.meta.env || {}).VITE_API_BASE_URL || "").replace(/\/$/, "");
const BASE_PATH = "/api/account-ops/mailbox-import";
const PROVIDERS = new Set(["aol", "gmail", "yahoo"]);
const DAYS = new Set([7, 30, 90]);
const CURRENCIES = new Set(["USD", "CAD", "GBP", "EUR", "AUD", "NZD"]);
const MAX_RESPONSE_BYTES = 512 * 1024;

export class PurchaseEmailApiError extends Error {
  constructor(code, message) { super(message); this.name = "PurchaseEmailApiError"; this.code = code; }
}

function fail(code, message) { throw new PurchaseEmailApiError(code, message); }
function plain(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function text(value, maximum, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || value.length > maximum) fail("INVALID_RESPONSE", "The mailbox returned an invalid review response.");
  return value;
}
function integer(value, nullable = false) {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_RESPONSE", "The mailbox returned an invalid amount or count.");
  return value;
}
function timestamp(value, nullable = false) {
  if (nullable && value == null) return null;
  const result = text(value, 64);
  if (!Number.isFinite(Date.parse(result))) fail("INVALID_RESPONSE", "The mailbox returned an invalid date.");
  return result;
}
function exactFields(value, fields) {
  if (!plain(value) || Object.keys(value).some((key) => !fields.includes(key))) fail("INVALID_RESPONSE", "The mailbox returned unexpected review data.");
}

export function normalizePurchaseEmailPreview(payload) {
  exactFields(payload, ["ok", "format", "candidates", "scannedMessages", "skippedMessages", "truncated", "days"]);
  if (payload.format !== "code3.purchase-email-preview.v1" || !Array.isArray(payload.candidates) || payload.candidates.length > 25 || !DAYS.has(payload.days) || typeof payload.truncated !== "boolean") fail("INVALID_RESPONSE", "The mailbox returned an invalid review response.");
  const sourceIds = new Set();
  const candidates = payload.candidates.map((row) => {
    exactFields(row, ["sourceId", "provider", "accountReference", "retailerId", "retailerLabel", "orderId", "receivedAt", "orderedAt", "currency", "totalMinorUnits", "items", "warnings"]);
    if (!PROVIDERS.has(row.provider) || !Array.isArray(row.items) || row.items.length > 100 || !Array.isArray(row.warnings) || row.warnings.length > 100) fail("INVALID_RESPONSE", "The mailbox returned an invalid receipt.");
    const sourceId = text(row.sourceId, 256);
    if (!/^email:[a-f0-9]{64}$/.test(sourceId) || sourceIds.has(sourceId)) fail("INVALID_RESPONSE", "The mailbox returned duplicate or missing receipt references.");
    sourceIds.add(sourceId);
    const accountReference = text(row.accountReference, 500);
    if (!/^mailbox:[a-f0-9]{64}$/.test(accountReference)) fail("INVALID_RESPONSE", "The mailbox returned an invalid account reference.");
    const currency = text(row.currency, 3, true);
    if (currency !== null && !CURRENCIES.has(currency)) fail("INVALID_RESPONSE", "The mailbox returned an unsupported currency.");
    return {
      sourceId, provider: row.provider, accountReference,
      retailerId: text(row.retailerId, 256), retailerLabel: text(row.retailerLabel, 500), orderId: text(row.orderId, 500, true),
      receivedAt: timestamp(row.receivedAt), orderedAt: timestamp(row.orderedAt, true), currency,
      totalMinorUnits: integer(row.totalMinorUnits, true),
      items: row.items.map((item) => {
        exactFields(item, ["description", "quantity", "unitPriceMinorUnits", "lineTotalMinorUnits"]);
        return { description: text(item.description, 500), quantity: integer(item.quantity, true), unitPriceMinorUnits: integer(item.unitPriceMinorUnits, true), lineTotalMinorUnits: integer(item.lineTotalMinorUnits, true) };
      }),
      warnings: row.warnings.map((warning) => text(warning, 500)),
    };
  });
  const scannedMessages = integer(payload.scannedMessages);
  const skippedMessages = integer(payload.skippedMessages);
  if (scannedMessages > 500 || skippedMessages > scannedMessages || skippedMessages + candidates.length !== scannedMessages) fail("INVALID_RESPONSE", "The mailbox returned inconsistent review counts.");
  return { format: payload.format, candidates, scannedMessages, skippedMessages, truncated: payload.truncated, days: payload.days };
}

function errorForResponse(status, code) {
  const normalizedCode = String(code || "").toUpperCase();
  if (["MAILBOX_AUTH_FAILED", "AUTHENTICATION_FAILED", "APP_PASSWORD_REJECTED", "MAILBOX_AUTH_REJECTED", "MAILBOX_AUTHENTICATION_FAILED"].includes(normalizedCode)) return new PurchaseEmailApiError("MAILBOX_AUTH_FAILED", "The mailbox did not accept these details. Check your email address and use an app password from your email provider.");
  if (normalizedCode === "MAILBOX_TIMEOUT" || status === 504) return new PurchaseEmailApiError("MAILBOX_TIMEOUT", "The mailbox took too long to respond. Try a shorter date range or try again later.");
  if (normalizedCode === "MAILBOX_UNAVAILABLE") return new PurchaseEmailApiError("MAILBOX_UNAVAILABLE", "The mailbox could not be reached. No saved records were changed. Try again later.");
  if (normalizedCode === "MAILBOX_PREVIEW_ACTIVE") return new PurchaseEmailApiError("MAILBOX_PREVIEW_ACTIVE", "A mailbox pull is already running. Wait for it to finish before trying again.");
  if (normalizedCode === "MAILBOX_SECURE_TRANSPORT_REQUIRED") return new PurchaseEmailApiError("SECURE_TRANSPORT_REQUIRED", "Open the secure Code 3 TCG app before entering mailbox details.");
  if (status === 401) return new PurchaseEmailApiError("SIGN_IN_REQUIRED", "Sign in again before pulling purchase emails.");
  if (status === 403) return new PurchaseEmailApiError("OWNER_ACCESS_REQUIRED", "A verified owner account is required to pull purchase emails.");
  if (status === 429) return new PurchaseEmailApiError("RATE_LIMITED", "Please wait a moment before pulling more emails.");
  if (status === 503 || status === 404) return new PurchaseEmailApiError("UNAVAILABLE", "Purchase email import is not available on this server yet.");
  if (status === 400) return new PurchaseEmailApiError("INVALID_REQUEST", "Check the provider, email address, app password, and date range.");
  return new PurchaseEmailApiError("REQUEST_FAILED", "The mailbox could not be read. No purchase was created. Try again when your connection is ready.");
}

export function resolvePurchaseEmailApiUrl(suffix, apiBase = API_BASE, pageUrl = globalThis.location?.href) {
  if (!["status", "preview"].includes(suffix)) fail("INVALID_ROUTE", "The mailbox operation is unavailable.");
  const loopback = (hostname) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
  let page;
  let endpoint;
  try {
    page = new URL(pageUrl);
    endpoint = new URL(`${apiBase}${BASE_PATH}/${suffix}`, page);
  } catch { fail("SECURE_TRANSPORT_REQUIRED", "Open the secure Code 3 TCG app before entering mailbox details."); }
  const safePage = page.protocol === "https:" || (page.protocol === "http:" && loopback(page.hostname));
  const safeEndpoint = endpoint.protocol === "https:" || (endpoint.protocol === "http:" && loopback(endpoint.hostname) && loopback(page.hostname));
  if (!safePage || !safeEndpoint || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail("SECURE_TRANSPORT_REQUIRED", "Open the secure Code 3 TCG app before entering mailbox details.");
  return endpoint.href;
}

async function request(suffix, body, options = {}) {
  const endpoint = resolvePurchaseEmailApiUrl(suffix);
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const getHeaders = options.getRequestHeadersImpl || (await import("./ownerSession.js")).getOwnerRequestHeaders;
  let authorizationHeaders;
  try { authorizationHeaders = await getHeaders(); } catch { fail("SIGN_IN_REQUIRED", "Sign in again before pulling purchase emails."); }
  const entries = Object.entries(authorizationHeaders || {});
  if (entries.length !== 1 || entries.some(([key, value]) => key.toLowerCase() !== "authorization" || typeof value !== "string" || !/^Bearer [^\s]+$/i.test(value))) fail("OWNER_ACCESS_REQUIRED", "A verified signed-in owner is required for mailbox access.");
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  let response;
  try { response = await (options.fetchImpl || globalThis.fetch)(endpoint, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", redirect: "error", cache: "no-store", signal: options.signal,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...authorizationHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }); } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw errorForResponse(0);
  }
  if (!response?.headers?.get?.("content-type")?.toLowerCase().includes("application/json")) throw errorForResponse(response?.status);
  if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) fail("RESPONSE_TOO_LARGE", "The mailbox review exceeded the safe response limit.");
  let raw;
  try { raw = await response.text(); } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw errorForResponse(0);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) fail("RESPONSE_TOO_LARGE", "The mailbox review exceeded the safe response limit.");
  let payload;
  try { payload = JSON.parse(raw); } catch { fail("INVALID_RESPONSE", "The mailbox returned an unreadable review response."); }
  if (!plain(payload)) fail("INVALID_RESPONSE", "The mailbox returned an invalid review response.");
  if (!response.ok || payload.ok === false) throw errorForResponse(response.status, payload.code || payload.error?.code);
  return payload;
}

export async function fetchPurchaseEmailImportStatus(options = {}) {
  const payload = await request("status", undefined, options);
  if (!plain(payload) || typeof payload.available !== "boolean" || !Array.isArray(payload.providers) || new Set(payload.providers).size !== payload.providers.length || payload.providers.some((provider) => !PROVIDERS.has(provider)) || (payload.available && !payload.providers.length)) fail("INVALID_RESPONSE", "Mailbox availability could not be verified.");
  if (payload.available && (payload.mode !== "ONE_TIME_READ" || payload.credentialStored !== false || payload.mailboxReadOnly !== true)) fail("INVALID_RESPONSE", "The mailbox runtime could not verify one-time, read-only access.");
  return { available: payload.available, providers: payload.providers, mode: payload.mode, credentialStored: false, mailboxReadOnly: true };
}

export async function previewPurchaseEmails(input, options = {}) {
  if (!plain(input) || Object.keys(input).some((key) => !["provider", "mailboxAddress", "appPassword", "days"].includes(key)) || !PROVIDERS.has(input.provider) || !DAYS.has(input.days) || typeof input.mailboxAddress !== "string" || !input.mailboxAddress.trim() || input.mailboxAddress.length > 320 || typeof input.appPassword !== "string" || input.appPassword.length < 8 || !input.appPassword.trim() || input.appPassword.length > 256) fail("INVALID_REQUEST", "Choose a provider and enter your mailbox address and app password.");
  return normalizePurchaseEmailPreview(await request("preview", { provider: input.provider, mailboxAddress: input.mailboxAddress.trim(), appPassword: input.appPassword, days: input.days }, options));
}
