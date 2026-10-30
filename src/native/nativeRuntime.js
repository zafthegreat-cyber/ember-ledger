// Keep this module independent of React/auth so all API clients share one policy.
const env = import.meta.env || {};
export const NATIVE_API_ORIGIN = "https://code3tcg.app";
export const NATIVE_AUTH_CALLBACK = "code3tcg://auth/callback";

export function isNativePlatform() {
  return globalThis.Capacitor?.isNativePlatform?.() === true;
}

export function isTrustedNativeOrigin(pageUrl = globalThis.location?.href, native = isNativePlatform()) {
  if (!native) return false;
  try {
    const url = new URL(pageUrl);
    return !url.username && !url.password && !url.port && url.hostname === "localhost"
      && (url.protocol === "capacitor:" || url.protocol === "https:");
  } catch { return false; }
}

export function resolveApiBase({ native = isNativePlatform(), configured = env.VITE_API_BASE_URL || "" } = {}) {
  const value = String(configured).replace(/\/$/, "");
  if (!native) return value;
  // Native builds must never send account credentials to a bundled/relative URL
  // or to a different host accidentally inherited from a development env file.
  if (value && value !== NATIVE_API_ORIGIN) throw new Error("Native API destination must be https://code3tcg.app.");
  return NATIVE_API_ORIGIN;
}

export const getApiBase = () => resolveApiBase();

export function getNativeAuthRedirect(kind = "signin") {
  if (!["signin", "recovery", "oauth"].includes(kind)) throw new Error("Unsupported account link.");
  return `${NATIVE_AUTH_CALLBACK}?flow=${kind}`;
}

export function parseNativeAuthCallback(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "code3tcg:" || url.hostname !== "auth" || url.pathname !== "/callback"
    || url.username || url.password || url.port || url.hash) return null;
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some(key => !["code", "flow", "error", "error_code", "error_description"].includes(key))) return null;
  const flow = url.searchParams.get("flow") || "signin";
  if (!["signin", "recovery", "oauth"].includes(flow)) return null;
  if (url.searchParams.has("error")) return { error: true, flow };
  const code = url.searchParams.get("code") || "";
  // Only PKCE codes are accepted. Never accept bearer/refresh tokens in a link.
  if (!/^[a-zA-Z0-9_-]{20,256}$/.test(code)) return null;
  return { code, flow, error: false };
}
