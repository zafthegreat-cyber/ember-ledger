import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { PLAN_TYPES, USER_ROLES, normalizeTier, normalizeUserRole } from "../constants/plans";

const ADMIN_EMAILS = String(import.meta.env.VITE_ADMIN_EMAILS || import.meta.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const DEV_ADMIN_EMAIL = String(import.meta.env.VITE_DEV_ADMIN_EMAIL || "").trim().toLowerCase();
const LOCAL_DEV_ADMIN = String(import.meta.env.VITE_LOCAL_DEV_ADMIN || "").toLowerCase() === "true";

export function isLocalhost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function isAdminEmail(email = "") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  if (ADMIN_EMAILS.includes(normalized)) return true;
  return isLocalhost() && DEV_ADMIN_EMAIL && DEV_ADMIN_EMAIL === normalized;
}

export function makeFallbackUserProfile(user = null) {
  const email = user?.email || "";
  const admin = isAdminEmail(email) || (isLocalhost() && LOCAL_DEV_ADMIN);
  const now = new Date().toISOString();
  return {
    userId: user?.id || "local-beta",
    email: email || "local beta mode",
    displayName: email ? email.split("@")[0] : "Local Beta",
    userRole: admin ? USER_ROLES.ADMIN : USER_ROLES.USER,
    tier: admin ? PLAN_TYPES.FOUNDER : PLAN_TYPES.FREE,
    isAdmin: admin,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: user ? now : "",
    source: user ? "env-allowlist-fallback" : "local-beta",
  };
}

export function mapProfileRow(row = {}, user = null) {
  const email = row.email || user?.email || "";
  const allowlisted = isAdminEmail(email);
  const userRole = allowlisted ? USER_ROLES.ADMIN : normalizeUserRole(row.user_role || row.userRole);
  const tier = allowlisted ? PLAN_TYPES.FOUNDER : normalizeTier(row.tier);
  return {
    userId: row.id || row.userId || user?.id || "",
    email,
    displayName: row.display_name || row.displayName || email.split("@")[0] || "User",
    userRole,
    tier,
    isAdmin: userRole === USER_ROLES.ADMIN,
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
    lastLoginAt: row.last_login_at || row.lastLoginAt || "",
    source: "supabase-profiles",
  };
}

export async function getCurrentUserProfile(user = null) {
  if (!user || !isSupabaseConfigured || !supabase) return makeFallbackUserProfile(user);
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) return makeFallbackUserProfile(user);
  if (!data) return createUserProfileIfMissing(user);
  return mapProfileRow(data, user);
}

export async function createUserProfileIfMissing(user = null) {
  if (!user || !isSupabaseConfigured || !supabase) return makeFallbackUserProfile(user);
  const admin = isAdminEmail(user.email);
  const now = new Date().toISOString();
  const row = {
    id: user.id,
    email: user.email || "",
    display_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "User",
    user_role: admin ? USER_ROLES.ADMIN : USER_ROLES.USER,
    tier: admin ? PLAN_TYPES.FOUNDER : PLAN_TYPES.FREE,
    last_login_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) return makeFallbackUserProfile(user);
  return mapProfileRow(data, user);
}

export async function updateUserTier(userId, tier) {
  if (!isSupabaseConfigured || !supabase) return { error: true, message: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("profiles")
    .update({ tier: normalizeTier(tier), updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  return error ? { error: true, message: error.message } : { data };
}

export async function updateUserRoleAdminOnly(userId, userRole) {
  if (!isSupabaseConfigured || !supabase) return { error: true, message: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("profiles")
    .update({ user_role: normalizeUserRole(userRole), updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();
  return error ? { error: true, message: error.message } : { data };
}
