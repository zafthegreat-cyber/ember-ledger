import { createClient } from "@supabase/supabase-js";
import { isNativePlatform } from "./native/nativeRuntime.js";
import { nativeSessionStorage } from "./native/nativeSessionStorage.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, isNativePlatform() ? {
    auth: { flowType: "pkce", detectSessionInUrl: false, storage: nativeSessionStorage, autoRefreshToken: true, persistSession: true },
  } : { auth: { detectSessionInUrl: globalThis.location?.pathname !== "/auth/callback" } })
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
