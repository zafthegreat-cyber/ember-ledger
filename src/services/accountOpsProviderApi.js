const VITE_ENV = import.meta.env || {};
const API_BASE = String(VITE_ENV.VITE_API_BASE_URL || "").replace(/\/$/, "");

export const ACCOUNT_OPS_PROVIDER_CONNECTIONS_PATH = "/api/account-ops/provider-connections";

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_CONNECTIONS = 50;
const PROVIDER_HEALTH_STATES = new Set([
  "DISCONNECTED",
  "CONNECTING",
  "HEALTHY",
  "NEEDS_REAUTH",
  "ERROR",
  "REVOKED",
]);
const CONFIGURATION_STATES = new Set([
  "AVAILABLE",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "BLOCKED",
]);
const TRUSTED_RUNTIME_ENVIRONMENTS = new Set([
  "PREVIEW",
  "PRODUCTION",
  "HOSTED_UNKNOWN",
  "LOCAL_DEVELOPMENT",
  "AUTOMATED_TEST",
  "UNKNOWN",
]);
const PROHIBITED_RESPONSE_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "token",
  "authorization",
  "authorizationheader",
  "authorizationcode",
  "password",
  "passcode",
  "otp",
  "secret",
  "clientsecret",
  "providersecret",
  "cookie",
  "oauthstate",
  "rawclaims",
]);
const PROHIBITED_RESPONSE_VALUE = /\bbearer\s+[a-z0-9._~-]+|(?:access|refresh|id)[_-]?token\s*[:=]|client[_-]?secret\s*[:=]|(?:password|passcode|otp)\s*[:=]|\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/i;

export class AccountOpsProviderApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = "AccountOpsProviderApiError";
    this.code = code;
    this.status = status;
  }
}

function safeText(value, maxLength = 160) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safePublicText(value, maxLength = 160, replacement = "") {
  const text = safeText(value, maxLength);
  return PROHIBITED_RESPONSE_VALUE.test(text) ? replacement : text;
}

function safeTimestamp(value) {
  const text = safeText(value, 64);
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : "";
}

function isProhibitedResponseKey(key) {
  const normalized = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PROHIBITED_RESPONSE_KEYS.has(normalized)
    || /(?:access|refresh|identity|bearer|session|provider|oauth)token$/.test(normalized)
    || /(?:password|passcode|privatekey|clientsecret|providersecret)$/.test(normalized);
}

function assertNoProviderSecrets(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value !== "object") return;
  if (depth > 8 || seen.has(value)) {
    throw new AccountOpsProviderApiError("UNSAFE_RESPONSE", "The provider runtime returned an unsafe response.");
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (isProhibitedResponseKey(key)) {
      throw new AccountOpsProviderApiError("UNSAFE_RESPONSE", "The provider runtime returned prohibited credential data.");
    }
    assertNoProviderSecrets(child, depth + 1, seen);
  }
}

function normalizeCapabilities(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, enabled]) => /^[a-z][a-zA-Z0-9]{0,47}$/.test(key) && typeof enabled === "boolean")
    .slice(0, 20));
}

function normalizeConnection(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const connectionId = safeText(record.connectionId || record.id, 128);
  const provider = safeText(record.provider, 48).toUpperCase();
  if (!connectionId || !provider) return null;
  const requestedStatus = safeText(record.status, 40).toUpperCase();
  const grantedScopes = Array.isArray(record.grantedScopesSummary)
    ? record.grantedScopesSummary
    : Array.isArray(record.grantedScopes)
      ? record.grantedScopes
      : [];
  return Object.freeze({
    connectionId,
    provider,
    accountLabel: safePublicText(record.accountLabel || record.connectedAccountLabel || record.displayLabel, 160),
    status: PROVIDER_HEALTH_STATES.has(requestedStatus) ? requestedStatus : "ERROR",
    connectedAt: safeTimestamp(record.connectedAt),
    lastHealthyAt: safeTimestamp(record.lastHealthyAt),
    revokedAt: safeTimestamp(record.revokedAt),
    grantedScopes: Object.freeze(grantedScopes.filter((scope) => typeof scope === "string").map((scope) => safePublicText(scope, 96)).filter(Boolean).slice(0, 20)),
    capabilities: Object.freeze(normalizeCapabilities(record.capabilities || record.capabilityFlags)),
  });
}

function normalizeTrustedRuntime(runtime) {
  const proof = runtime && typeof runtime === "object" && !Array.isArray(runtime)
    ? runtime.trustedRuntimeProof
    : null;
  const environment = safeText(proof?.environment, 32).toUpperCase();
  const verified = proof?.execution === "SERVER"
    && environment === "PREVIEW"
    && proof?.previewEnvironment === true
    && proof?.productionEnvironment === false
    && proof?.providerRuntimeLoaded === true
    && proof?.providerNetworkAccessEnabled === false
    && proof?.hostedRuntimeVerified === true
    && runtime?.hostedRuntimeVerified === true;
  return Object.freeze({
    proofVersion: safeText(proof?.proofVersion, 64),
    execution: proof?.execution === "SERVER" ? "SERVER" : "UNVERIFIED",
    environment: TRUSTED_RUNTIME_ENVIRONMENTS.has(environment) ? environment : "UNKNOWN",
    previewEnvironment: proof?.previewEnvironment === true,
    productionEnvironment: proof?.productionEnvironment === true,
    providerRuntimeLoaded: proof?.providerRuntimeLoaded === true,
    providerNetworkAccessEnabled: proof?.providerNetworkAccessEnabled === true,
    hostedRuntimeVerified: verified,
  });
}

function normalizeProviderStatus(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const providerId = safeText(record.providerId, 48).toLowerCase();
  const displayName = safePublicText(record.displayName, 80);
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(providerId) || !displayName) return null;
  const configurationStatus = safeText(record.configurationStatus, 32).toUpperCase();
  const authorizationStatus = safeText(record.authorizationStatus, 32).toUpperCase();
  return Object.freeze({
    providerId,
    displayName,
    configurationStatus: CONFIGURATION_STATES.has(configurationStatus) ? configurationStatus : "UNAVAILABLE",
    authorizationStatus: CONFIGURATION_STATES.has(authorizationStatus) ? authorizationStatus : "UNAVAILABLE",
    capabilities: Object.freeze(normalizeCapabilities(record.capabilities)),
  });
}

export function normalizeProviderConnectionsPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AccountOpsProviderApiError("INVALID_RESPONSE", "The provider runtime returned an invalid response.");
  }
  assertNoProviderSecrets(payload);
  const requestedConfiguration = safeText(payload.configurationState || payload.runtimeStatus, 40).toUpperCase();
  const connections = (Array.isArray(payload.connections) ? payload.connections : [])
    .slice(0, MAX_CONNECTIONS)
    .map(normalizeConnection)
    .filter(Boolean);
  const warnings = (Array.isArray(payload.warnings) ? payload.warnings : [])
    .filter((warning) => typeof warning === "string")
    .map((warning) => safePublicText(warning, 240, "Provider runtime reported a protected warning."))
    .filter(Boolean)
    .slice(0, 10);
  const providers = (Array.isArray(payload.providerCapabilities) ? payload.providerCapabilities : [])
    .slice(0, 10)
    .map(normalizeProviderStatus)
    .filter(Boolean);
  return Object.freeze({
    configurationState: CONFIGURATION_STATES.has(requestedConfiguration) ? requestedConfiguration : "UNAVAILABLE",
    trustedRuntime: normalizeTrustedRuntime(payload.runtime),
    providers: Object.freeze(providers),
    connections: Object.freeze(connections),
    warnings: Object.freeze(warnings),
  });
}

function assertAllowedPath(path) {
  const route = String(path || "");
  if (route !== ACCOUNT_OPS_PROVIDER_CONNECTIONS_PATH && !route.startsWith(`${ACCOUNT_OPS_PROVIDER_CONNECTIONS_PATH}/`)) {
    throw new AccountOpsProviderApiError("INVALID_ROUTE", "Account Ops provider requests must use the protected provider-connections API.");
  }
  if (route.includes("?") || route.includes("#") || route.includes("\\") || route.includes("..")) {
    throw new AccountOpsProviderApiError("INVALID_ROUTE", "Account Ops provider requests must use a canonical protected route.");
  }
  return route;
}

async function accountOpsProviderRequest(path, options = {}) {
  const route = assertAllowedPath(path);
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" || options.body !== undefined) {
    throw new AccountOpsProviderApiError("UNSUPPORTED_OPERATION", "Provider connections are read-only in this phase.");
  }
  if (options.headers !== undefined) {
    throw new AccountOpsProviderApiError("UNSAFE_HEADERS", "Caller-supplied provider request headers are not allowed.");
  }
  const getRequestHeaders = options.getRequestHeadersImpl
    || (await import("./ownerSession.js")).getOwnerRequestHeaders;
  const authorizationHeaders = await getRequestHeaders({ localDevelopment: options.localDevelopment === true });
  const headerEntries = Object.entries(authorizationHeaders || {});
  if (headerEntries.some(([key, value]) => !["authorization", "x-code3-local-dev"].includes(String(key).toLowerCase()) || typeof value !== "string")) {
    throw new AccountOpsProviderApiError("UNSAFE_HEADERS", "The owner session returned an unsupported request header.");
  }
  return (options.fetchImpl || globalThis.fetch)(`${API_BASE}${route}`, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      ...authorizationHeaders,
    },
  });
}

function errorForStatus(status) {
  if (status === 401) return new AccountOpsProviderApiError("SIGN_IN_REQUIRED", "The application session must be verified again.", status);
  if (status === 403) return new AccountOpsProviderApiError("OWNER_ACCESS_REQUIRED", "Verified owner access is required.", status);
  if (status === 404 || status === 501 || status === 503) return new AccountOpsProviderApiError("RUNTIME_UNAVAILABLE", "The trusted provider runtime is not available.", status);
  return new AccountOpsProviderApiError("REQUEST_FAILED", "Provider connection status could not be loaded.", status);
}

export async function fetchAccountOpsProviderConnections(options = {}) {
  const response = await accountOpsProviderRequest(ACCOUNT_OPS_PROVIDER_CONNECTIONS_PATH, options);
  if (!response?.ok) throw errorForStatus(Number(response?.status) || 0);
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AccountOpsProviderApiError("RUNTIME_UNAVAILABLE", "The trusted provider runtime did not return a protected API response.", Number(response.status) || 0);
  }
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new AccountOpsProviderApiError("RESPONSE_TOO_LARGE", "The provider runtime response exceeded the safe size limit.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new AccountOpsProviderApiError("RESPONSE_TOO_LARGE", "The provider runtime response exceeded the safe size limit.");
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new AccountOpsProviderApiError("INVALID_RESPONSE", "The provider runtime returned invalid JSON.");
  }
  return normalizeProviderConnectionsPayload(payload);
}
