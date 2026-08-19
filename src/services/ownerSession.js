import { isSupabaseConfigured, supabase } from "../supabaseClient.js";

const VITE_ENV = import.meta.env || {};
const API_BASE = VITE_ENV.VITE_API_BASE_URL || "";

export const OWNER_SESSION_STATES = Object.freeze({
  LOADING: "loading",
  SIGN_IN_REQUIRED: "sign_in_required",
  OWNER_ACCESS_REQUIRED: "owner_access_required",
  AUTHORIZED: "authorized",
  UNAVAILABLE: "unavailable",
});

export function isLoopbackHostname(hostname = globalThis.location?.hostname || "") {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

export function isLocalDevelopmentIdentityEnabled({
  hostname = globalThis.location?.hostname,
  queryEnabled = false,
  environmentEnabled = VITE_ENV.VITE_CODE3_LOCAL_AUTH_ENABLED === "true" || VITE_ENV.VITE_BETA_LOCAL_MODE === "true",
  development = VITE_ENV.DEV,
} = {}) {
  return Boolean(development && isLoopbackHostname(hostname) && (queryEnabled || environmentEnabled));
}

function safeSessionState(overrides = {}) {
  return {
    status: OWNER_SESSION_STATES.UNAVAILABLE,
    authenticated: false,
    ownerAuthorized: false,
    provider: "",
    displayIdentity: "",
    expiresAt: "",
    configurationState: "unavailable",
    localDevelopment: false,
    ...overrides,
  };
}

export async function getOwnerRequestHeaders({ localDevelopment = false } = {}) {
  if (localDevelopment && isLocalDevelopmentIdentityEnabled({ queryEnabled: true })) {
    return { "X-Code3-Local-Dev": "1" };
  }
  if (!isSupabaseConfigured || !supabase) return {};
  const { data, error } = await supabase.auth.getSession();
  const accessToken = error ? "" : data?.session?.access_token;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function resolveOwnerSession({
  user = null,
  localDevelopment = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (localDevelopment && isLocalDevelopmentIdentityEnabled({ queryEnabled: true })) {
    return safeSessionState({
      status: OWNER_SESSION_STATES.AUTHORIZED,
      authenticated: true,
      ownerAuthorized: true,
      provider: "local-development",
      displayIdentity: "Local development identity",
      configurationState: "local-development",
      localDevelopment: true,
    });
  }

  if (!user) {
    return safeSessionState({
      status: OWNER_SESSION_STATES.SIGN_IN_REQUIRED,
      configurationState: isSupabaseConfigured ? "configured" : "not_configured",
    });
  }

  const headers = await getOwnerRequestHeaders();
  if (!headers.Authorization) {
    return safeSessionState({ status: OWNER_SESSION_STATES.SIGN_IN_REQUIRED, configurationState: "configured" });
  }

  try {
    const response = await fetchImpl(`${API_BASE}/api/auth/session`, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      cache: "no-store",
    });
    const payload = (response.headers?.get?.("content-type") || "").includes("application/json")
      ? await response.json()
      : {};

    if (response.status === 401) {
      return safeSessionState({ status: OWNER_SESSION_STATES.SIGN_IN_REQUIRED, configurationState: payload.configurationState || "configured" });
    }
    if (response.status === 403) {
      return safeSessionState({
        status: OWNER_SESSION_STATES.OWNER_ACCESS_REQUIRED,
        authenticated: true,
        provider: payload.provider || "supabase",
        displayIdentity: payload.displayIdentity || "Signed-in account",
        expiresAt: payload.expiresAt || "",
        configurationState: payload.configurationState || "configured",
      });
    }
    if (response.ok && payload.authenticated === true && payload.ownerAuthorized !== true) {
      return safeSessionState({
        status: OWNER_SESSION_STATES.OWNER_ACCESS_REQUIRED,
        authenticated: true,
        provider: payload.provider || "supabase",
        displayIdentity: payload.displayIdentity || "Signed-in account",
        expiresAt: payload.expiresAt || "",
        configurationState: payload.configurationState || "configured",
      });
    }
    if (!response.ok || payload.ownerAuthorized !== true) {
      return safeSessionState({ status: OWNER_SESSION_STATES.UNAVAILABLE, authenticated: Boolean(payload.authenticated), configurationState: payload.configurationState || "unavailable" });
    }
    return safeSessionState({
      status: OWNER_SESSION_STATES.AUTHORIZED,
      authenticated: true,
      ownerAuthorized: true,
      provider: payload.provider || "supabase",
      displayIdentity: payload.displayIdentity || "Owner",
      expiresAt: payload.expiresAt || "",
      configurationState: payload.configurationState || "configured",
    });
  } catch {
    return safeSessionState({
      status: OWNER_SESSION_STATES.UNAVAILABLE,
      authenticated: true,
      configurationState: "unavailable",
    });
  }
}
