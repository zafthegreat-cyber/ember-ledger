import { createClient } from "@supabase/supabase-js";
import { isNativePlatform } from "./native/nativeRuntime.js";
import { nativeSessionStorage } from "./native/nativeSessionStorage.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, isNativePlatform() ? {
    auth: { flowType: "pkce", detectSessionInUrl: false, storage: nativeSessionStorage, autoRefreshToken: true, persistSession: true },
  } : undefined)
  : null;

// Password confirmation must never replace the app's signed-in session.
export function createIsolatedAuthClient() {
  if (!isSupabaseConfigured) throw new Error("Account sign-in is not configured.");
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `code3-confirmation-${crypto.randomUUID()}` },
  });
}
