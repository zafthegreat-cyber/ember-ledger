import { createClient } from "@supabase/supabase-js";
import { isNativePlatform } from "./native/nativeRuntime.js";
import { nativeSessionStorage } from "./native/nativeSessionStorage.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Sign-in checks are tiny requests. On a phone that just woke up, a request can
// hang with no answer; give those a 10 s limit so they fail as a plain network
// error (retried quietly) instead of stalling the account check. Record syncs
// and uploads can be large, so they keep the browser's normal behaviour.
const QUICK_REQUEST = /\/auth\/v1\/|\/rpc\/code3_current_session_valid/;
export const QUICK_REQUEST_TIMEOUT_MS = 10000;
export function fetchWithQuickTimeout(input, init = {}, { fetchImpl = globalThis.fetch, timeoutMs = QUICK_REQUEST_TIMEOUT_MS } = {}) {
  const url = typeof input === "string" ? input : input?.url || String(input);
  if (!QUICK_REQUEST.test(url)) return fetchImpl(input, init);
  const controller = new AbortController();
  const outer = init.signal;
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener?.("abort", () => controller.abort(), { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.resolve(fetchImpl(input, { ...init, signal: controller.signal }))
    .catch((error) => {
      if (controller.signal.aborted && !outer?.aborted) throw new TypeError("Network request timed out");
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, isNativePlatform() ? {
    auth: { flowType: "pkce", detectSessionInUrl: false, storage: nativeSessionStorage, autoRefreshToken: true, persistSession: true },
    global: { fetch: (input, init) => fetchWithQuickTimeout(input, init) },
  } : {
    auth: { detectSessionInUrl: globalThis.location?.pathname !== "/auth/callback" },
    global: { fetch: (input, init) => fetchWithQuickTimeout(input, init) },
  })
  : null;

// A separate PKCE client preserves existing web email-confirmation/recovery
// links. Only a server-verified result is adopted by the primary session.
const socialStorageKey = isSupabaseConfigured ? `code3-oauth-${new URL(supabaseUrl).hostname.split(".")[0]}` : "";
const socialStorage = () => isNativePlatform() ? nativeSessionStorage : localStorage;
export function createSocialOAuthClient() {
  if (!isSupabaseConfigured) return null;
  return createClient(supabaseUrl, supabaseAnonKey, { auth: {
    flowType: "pkce", detectSessionInUrl: false, persistSession: true,
    autoRefreshToken: false, storageKey: socialStorageKey,
    ...(isNativePlatform() ? { storage: nativeSessionStorage } : {}),
  } });
}
export async function clearSocialOAuthStorage() {
  if (!socialStorageKey) return;
  // Do not sign out this temporary client: linked flows temporarily share the
  // original session, whose refresh token must stay valid for the main client.
  await socialStorage().removeItem(socialStorageKey);
  await socialStorage().removeItem(`${socialStorageKey}-code-verifier`);
}

// Password confirmation must never replace the app's signed-in session.
export function createIsolatedAuthClient() {
  if (!isSupabaseConfigured) throw new Error("Account sign-in is not configured.");
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `code3-confirmation-${crypto.randomUUID()}` },
  });
}
