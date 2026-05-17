import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { PLAN_TYPES, USER_ROLES, normalizeTier, normalizeUserRole } from "../constants/plans";
import { normalizeBetaStatus, normalizeLittleSparksStatus } from "../services/shorelineAccessService";

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

function metadataFlag(value) {
  return value === true || ["true", "1", "yes"].includes(String(value || "").toLowerCase());
}

export function getSupabaseAuthMetadata(user = null) {
  return user?.app_metadata || user?.raw_app_meta_data || user?.rawAppMetaData || {};
}

export function getAdminAccessFromAuthMetadata(user = null) {
  const metadata = getSupabaseAuthMetadata(user);
  const role = String(metadata.role || metadata.user_role || "").toLowerCase();
  const tier = String(metadata.tier || metadata.feature_tier || metadata.subscription_plan || "").toLowerCase();
  const admin = role === USER_ROLES.ADMIN || metadataFlag(metadata.is_admin) || metadataFlag(metadata.isAdmin) || tier === PLAN_TYPES.FOUNDER;
  return {
    admin,
    userRole: admin ? USER_ROLES.ADMIN : normalizeUserRole(role),
    tier: admin ? PLAN_TYPES.FOUNDER : normalizeTier(tier),
  };
}

export function makeFallbackUserProfile(user = null) {
  const email = user?.email || "";
  const metadata = user?.user_metadata || user?.raw_user_meta_data || {};
  const firstName = metadata.first_name || metadata.firstName || "";
  const lastName = metadata.last_name || metadata.lastName || "";
  const fullName = metadata.full_name || metadata.fullName || [firstName, lastName].filter(Boolean).join(" ");
  const metadataAccess = getAdminAccessFromAuthMetadata(user);
  const admin = metadataAccess.admin || isAdminEmail(email) || (isLocalhost() && LOCAL_DEV_ADMIN);
  const now = new Date().toISOString();
  return {
    userId: user?.id || "local-beta",
    email: email || "local beta mode",
    firstName,
    lastName,
    fullName,
    displayName: fullName || metadata.display_name || metadata.displayName || (email ? email.split("@")[0] : "Local Beta"),
    userRole: admin ? USER_ROLES.ADMIN : USER_ROLES.USER,
    tier: admin ? PLAN_TYPES.FOUNDER : PLAN_TYPES.FREE,
    planTier: metadata.plan_tier || metadata.planTier || (admin ? PLAN_TYPES.FOUNDER : PLAN_TYPES.FREE),
    trialTier: metadata.trial_tier || metadata.trialTier || "",
    trialStartedAt: metadata.trial_started_at || metadata.trialStartedAt || "",
    trialExpiresAt: metadata.trial_expires_at || metadata.trialExpiresAt || "",
    subscriptionStatus: metadata.subscription_status || metadata.subscriptionStatus || "none",
    subscriptionProvider: metadata.subscription_provider || metadata.subscriptionProvider || "",
    subscriptionProviderId: metadata.subscription_provider_id || metadata.subscriptionProviderId || "",
    preferredRegion: metadata.preferred_region || metadata.preferredRegion || "Hampton Roads / 757",
    betaStatus: admin || user?.id === "local-beta" ? "approved" : normalizeBetaStatus(metadata.beta_status || metadata.betaStatus || metadata.beta_access_status || metadata.betaAccessStatus),
    betaAccessStatus: admin || user?.id === "local-beta" ? "approved" : normalizeBetaStatus(metadata.beta_access_status || metadata.betaAccessStatus || metadata.beta_status || metadata.betaStatus),
    littleSparksStatus: normalizeLittleSparksStatus(metadata.little_sparks_status || metadata.littleSparksStatus),
    appAccess: Boolean(admin || user?.id === "local-beta" || metadata.app_access || metadata.appAccess),
    termsAcceptedAt: metadata.terms_accepted_at || metadata.termsAcceptedAt || "",
    privacyAcceptedAt: metadata.privacy_accepted_at || metadata.privacyAcceptedAt || "",
    betaAcknowledgedAt: metadata.beta_acknowledged_at || metadata.betaAcknowledgedAt || "",
    onboardingCompletedAt: "",
    onboardingPreferences: [],
    firstLoginSeen: false,
    isAdmin: admin,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: user ? now : "",
    source: metadataAccess.admin
      ? "supabase-app-metadata-fallback"
      : user?.id === "local-beta"
        ? "local-beta"
        : user
          ? "env-allowlist-fallback"
          : "local-beta",
  };
}

export function mapProfileRow(row = {}, user = null) {
  const email = row.email || user?.email || "";
  const allowlisted = isAdminEmail(email);
  const metadataAccess = getAdminAccessFromAuthMetadata(user);
  const admin = metadataAccess.admin || allowlisted;
  const userRole = admin ? USER_ROLES.ADMIN : normalizeUserRole(row.user_role || row.userRole);
  const tier = admin ? PLAN_TYPES.FOUNDER : normalizeTier(row.tier);
  const firstName = row.first_name || row.firstName || "";
  const lastName = row.last_name || row.lastName || "";
  const fullName = row.full_name || row.fullName || [firstName, lastName].filter(Boolean).join(" ");
  return {
    userId: row.id || row.userId || user?.id || "",
    email,
    firstName,
    lastName,
    fullName,
    displayName: row.display_name || row.displayName || fullName || email.split("@")[0] || "User",
    userRole,
    tier,
    planTier: row.plan_tier || row.planTier || row.tier || PLAN_TYPES.FREE,
    trialTier: row.trial_tier || row.trialTier || "",
    trialStartedAt: row.trial_started_at || row.trialStartedAt || "",
    trialExpiresAt: row.trial_expires_at || row.trialExpiresAt || "",
    subscriptionStatus: row.subscription_status || row.subscriptionStatus || "none",
    subscriptionProvider: row.subscription_provider || row.subscriptionProvider || "",
    subscriptionProviderId: row.subscription_provider_id || row.subscriptionProviderId || "",
    preferredRegion: row.preferred_region || row.preferredRegion || "Hampton Roads / 757",
    betaStatus: admin ? "approved" : normalizeBetaStatus(row.beta_status || row.betaStatus || row.beta_access_status || row.betaAccessStatus),
    betaAccessStatus: admin ? "approved" : normalizeBetaStatus(row.beta_access_status || row.betaAccessStatus || row.beta_status || row.betaStatus),
    littleSparksStatus: normalizeLittleSparksStatus(row.little_sparks_status || row.littleSparksStatus || row.kids_program_status || row.kidsProgramStatus),
    appAccess: Boolean(admin || row.app_access || row.appAccess),
    betaAccessRequestedAt: row.beta_access_requested_at || row.betaAccessRequestedAt || "",
    betaAccessApprovedAt: row.beta_access_approved_at || row.betaAccessApprovedAt || "",
    termsAcceptedAt: row.terms_accepted_at || row.termsAcceptedAt || "",
    privacyAcceptedAt: row.privacy_accepted_at || row.privacyAcceptedAt || "",
    betaAcknowledgedAt: row.beta_acknowledged_at || row.betaAcknowledgedAt || "",
    onboardingCompletedAt: row.onboarding_completed_at || row.onboardingCompletedAt || "",
    onboardingPreferences: row.onboarding_preferences || row.onboardingPreferences || [],
    firstLoginSeen: Boolean(row.first_login_seen || row.firstLoginSeen),
    isAdmin: userRole === USER_ROLES.ADMIN,
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
    lastLoginAt: row.last_login_at || row.lastLoginAt || "",
    source: metadataAccess.admin ? "supabase-app-metadata" : "supabase-profiles",
  };
}

export async function getCurrentUserProfile(user = null) {
  if (user?.id === "local-beta") return makeFallbackUserProfile(user);
  if (!user || !isSupabaseConfigured || !supabase) return makeFallbackUserProfile(user);
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) return makeFallbackUserProfile(user);
  if (!data) return createUserProfileIfMissing(user);
  return mapProfileRow(data, user);
}

export async function createUserProfileIfMissing(user = null) {
  if (user?.id === "local-beta") return makeFallbackUserProfile(user);
  if (!user || !isSupabaseConfigured || !supabase) return makeFallbackUserProfile(user);
  const now = new Date().toISOString();
  const metadata = user.user_metadata || {};
  const firstName = metadata.first_name || metadata.firstName || "";
  const lastName = metadata.last_name || metadata.lastName || "";
  const fullName = metadata.full_name || metadata.fullName || [firstName, lastName].filter(Boolean).join(" ");
  const row = {
    id: user.id,
    email: user.email || "",
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    display_name: metadata.display_name || metadata.displayName || fullName || user.email?.split("@")[0] || "User",
    preferred_region: metadata.preferred_region || metadata.preferredRegion || "Hampton Roads / 757",
    user_role: USER_ROLES.USER,
    tier: PLAN_TYPES.FREE,
    plan_tier: PLAN_TYPES.FREE,
    subscription_status: "none",
    beta_status: normalizeBetaStatus(metadata.beta_status || metadata.betaStatus || metadata.beta_access_status || metadata.betaAccessStatus),
    beta_access_status: normalizeBetaStatus(metadata.beta_access_status || metadata.betaAccessStatus || metadata.beta_status || metadata.betaStatus),
    little_sparks_status: normalizeLittleSparksStatus(metadata.little_sparks_status || metadata.littleSparksStatus),
    app_access: Boolean(metadata.app_access || metadata.appAccess),
    terms_accepted_at: metadata.terms_accepted_at || metadata.termsAcceptedAt || null,
    privacy_accepted_at: metadata.privacy_accepted_at || metadata.privacyAcceptedAt || null,
    beta_acknowledged_at: metadata.beta_acknowledged_at || metadata.betaAcknowledgedAt || null,
    consent_text: metadata.consent_text || metadata.consentText || null,
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
