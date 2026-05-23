import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import {
  BETA_REQUEST_STATUSES,
  LITTLE_SPARKS_STATUSES,
  betaAccessAllowedForProfile,
  betaAccessStatusForProfile,
  normalizeBetaStatus,
  normalizeLittleSparksStatus,
  statusLabel,
} from "../utils/betaAccessUtils.js";

export {
  BETA_REQUEST_STATUSES,
  LITTLE_SPARKS_STATUSES,
  betaAccessAllowedForProfile,
  betaAccessStatusForProfile,
  normalizeBetaStatus,
  normalizeLittleSparksStatus,
  statusLabel,
};

function mapBetaRequest(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    userId: row.user_id || row.userId || "",
    fullName: row.full_name || row.fullName || "",
    email: row.email || "",
    cityArea: row.city_area || row.cityArea || "",
    collectorType: row.collector_type || row.collectorType || "",
    reason: row.reason || "",
    localAreaAnswer: row.local_area_answer || row.localAreaAnswer || "",
    socialHandle: row.social_handle || row.socialHandle || "",
    rulesAgreed: Boolean(row.rules_agreed ?? row.rulesAgreed),
    status: normalizeBetaStatus(row.status),
    adminNotes: row.admin_notes || row.adminNotes || "",
    reviewedBy: row.reviewed_by || row.reviewedBy || "",
    reviewedAt: row.reviewed_at || row.reviewedAt || "",
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

function mapLittleSparksApplication(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    userId: row.user_id || row.userId || "",
    guardianName: row.guardian_name || row.guardianName || row.parent_name || row.parentName || "",
    email: row.email || "",
    childNickname: row.child_nickname || row.childNickname || row.child_first_name || row.childFirstName || "",
    childAge: row.child_age ?? row.childAge ?? row.child_age_range ?? row.childAgeRange ?? "",
    cityArea: row.city_area || row.cityArea || row.zip_code || row.zipCode || "",
    hopedProducts: row.hoped_products || row.hopedProducts || row.favorite_pokemon || row.favoritePokemon || "",
    applicationNote: row.application_note || row.applicationNote || row.reason || "",
    guardianConfirmed: Boolean(row.guardian_confirmed ?? row.guardianConfirmed),
    inventoryLimitedAck: Boolean(row.inventory_limited_ack ?? row.inventoryLimitedAck),
    quantityLimitAck: Boolean(row.quantity_limit_ack ?? row.quantityLimitAck),
    antiResaleAck: Boolean(row.anti_resale_ack ?? row.antiResaleAck ?? row.agrees_no_resale),
    status: normalizeLittleSparksStatus(row.status),
    adminNotes: row.admin_notes || row.adminNotes || "",
    reviewedBy: row.reviewed_by || row.reviewedBy || "",
    reviewedAt: row.reviewed_at || row.reviewedAt || "",
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

function mapAdminBetaAccessProfile(row = {}) {
  if (!row) return null;
  const userId = row.user_id || row.userId || row.id || "";
  const userRole = row.user_role || row.userRole || "user";
  const fullName = row.full_name || row.fullName || [row.first_name || row.firstName, row.last_name || row.lastName].filter(Boolean).join(" ");
  const displayName = row.display_name || row.displayName || fullName || row.email || "Beta user";
  const betaStatus = normalizeBetaStatus(row.beta_status || row.betaStatus || row.beta_access_status || row.betaAccessStatus);
  const betaAccessStatus = normalizeBetaStatus(row.beta_access_status || row.betaAccessStatus || betaStatus);
  return {
    id: userId,
    userId,
    email: row.email || "",
    firstName: row.first_name || row.firstName || "",
    lastName: row.last_name || row.lastName || "",
    fullName,
    displayName,
    userRole,
    isAdmin: ["admin", "moderator"].includes(String(userRole).toLowerCase()),
    tier: row.tier || "free",
    planTier: row.plan_tier || row.planTier || row.tier || "free",
    betaStatus,
    beta_status: betaStatus,
    betaAccessStatus,
    beta_access_status: betaAccessStatus,
    status: betaAccessStatus,
    appAccess: Boolean(row.app_access ?? row.appAccess),
    app_access: Boolean(row.app_access ?? row.appAccess),
    betaAccessRequestedAt: row.beta_access_requested_at || row.betaAccessRequestedAt || "",
    betaAccessApprovedAt: row.beta_access_approved_at || row.betaAccessApprovedAt || "",
    betaAccessApprovedBy: row.beta_access_approved_by || row.betaAccessApprovedBy || "",
    betaAccessNotes: row.beta_access_notes || row.betaAccessNotes || "",
    littleSparksStatus: normalizeLittleSparksStatus(row.little_sparks_status || row.littleSparksStatus),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
    lastSeenAt: row.last_seen_at || row.lastSeenAt || row.last_login_at || row.lastLoginAt || row.updated_at || "",
    source: "Supabase profile",
  };
}

export async function loadShorelineAccessState(user) {
  if (!user?.id || !isSupabaseConfigured || !supabase) {
    return { betaRequest: null, littleSparksApplication: null };
  }

  const [betaResult, sparksResult] = await Promise.all([
    supabase.from("beta_access_requests").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("little_sparks_applications").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const missingBetaTable = betaResult.error?.code === "42P01" || /does not exist/i.test(betaResult.error?.message || "");
  const missingSparksTable = sparksResult.error?.code === "42P01" || /does not exist/i.test(sparksResult.error?.message || "");

  if (betaResult.error && !missingBetaTable) throw betaResult.error;
  if (sparksResult.error && !missingSparksTable) throw sparksResult.error;

  return {
    betaRequest: mapBetaRequest(betaResult.data),
    littleSparksApplication: mapLittleSparksApplication(sparksResult.data),
    schemaReady: !missingBetaTable && !missingSparksTable,
  };
}

export async function submitBetaAccessRequest(user, payload) {
  if (!user?.id || !isSupabaseConfigured || !supabase) {
    throw new Error("Sign in is required before requesting beta access.");
  }

  const row = {
    user_id: user.id,
    full_name: String(payload.fullName || "").trim(),
    email: String(payload.email || user.email || "").trim(),
    city_area: String(payload.cityArea || "").trim(),
    collector_type: String(payload.collectorType || "other").trim(),
    reason: String(payload.reason || "").trim(),
    local_area_answer: String(payload.localAreaAnswer || "").trim(),
    social_handle: String(payload.socialHandle || "").trim(),
    rules_agreed: Boolean(payload.rulesAgreed),
    status: "pending",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("beta_access_requests")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return mapBetaRequest(data);
}

export async function submitLittleSparksApplication(user, payload) {
  if (!user?.id || !isSupabaseConfigured || !supabase) {
    throw new Error("Sign in is required before applying for Little Sparks.");
  }

  const row = {
    user_id: user.id,
    guardian_name: String(payload.guardianName || "").trim(),
    email: String(payload.email || user.email || "").trim(),
    child_nickname: String(payload.childNickname || "").trim(),
    child_age: payload.childAge === "" || payload.childAge == null ? null : Number(payload.childAge),
    city_area: String(payload.cityArea || "").trim(),
    hoped_products: String(payload.hopedProducts || "").trim(),
    application_note: String(payload.applicationNote || "").trim(),
    guardian_confirmed: Boolean(payload.guardianConfirmed),
    inventory_limited_ack: Boolean(payload.inventoryLimitedAck),
    quantity_limit_ack: Boolean(payload.quantityLimitAck),
    anti_resale_ack: Boolean(payload.antiResaleAck),
    status: "pending",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("little_sparks_applications")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return mapLittleSparksApplication(data);
}

export async function loadAdminBetaAccessProfiles(searchText = "") {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_beta_access_profiles", {
    search_text: String(searchText || "").trim() || null,
  });
  if (error) throw error;
  return (data || []).map(mapAdminBetaAccessProfile);
}

export async function updateAdminBetaAccessProfile(userId, status, adminNotes = "") {
  if (!userId || !isSupabaseConfigured || !supabase) throw new Error("User id is required.");
  const { data, error } = await supabase.rpc("admin_update_profile_beta_access", {
    target_user_id: userId,
    next_status: normalizeBetaStatus(status),
    admin_notes: String(adminNotes || "").trim() || null,
  });
  if (error) throw error;
  return mapAdminBetaAccessProfile(Array.isArray(data) ? data[0] : data);
}

export async function loadShorelineAdminRequests() {
  if (!isSupabaseConfigured || !supabase) return { betaRequests: [], littleSparksApplications: [], profileUsers: [], profileUsersReady: false };
  const [betaResult, sparksResult, profileResult] = await Promise.all([
    supabase.from("beta_access_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("little_sparks_applications").select("*").order("created_at", { ascending: false }),
    supabase.rpc("admin_list_beta_access_profiles", { search_text: null }),
  ]);
  if (betaResult.error) throw betaResult.error;
  if (sparksResult.error) throw sparksResult.error;
  const missingProfileRpc = profileResult.error && (
    profileResult.error.code === "42883" ||
    profileResult.error.code === "PGRST202" ||
    /admin_list_beta_access_profiles|function.*does not exist|could not find/i.test(profileResult.error.message || "")
  );
  if (profileResult.error && !missingProfileRpc) throw profileResult.error;
  return {
    betaRequests: (betaResult.data || []).map(mapBetaRequest),
    littleSparksApplications: (sparksResult.data || []).map(mapLittleSparksApplication),
    profileUsers: missingProfileRpc ? [] : (profileResult.data || []).map(mapAdminBetaAccessProfile),
    profileUsersReady: !missingProfileRpc,
  };
}

export async function updateBetaAccessRequestStatus(id, status, adminNotes = "") {
  if (!id || !isSupabaseConfigured || !supabase) throw new Error("Request id is required.");
  const { data, error } = await supabase
    .from("beta_access_requests")
    .update({ status: normalizeBetaStatus(status), admin_notes: adminNotes, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapBetaRequest(data);
}

export async function updateLittleSparksApplicationStatus(id, status, adminNotes = "") {
  if (!id || !isSupabaseConfigured || !supabase) throw new Error("Application id is required.");
  const { data, error } = await supabase
    .from("little_sparks_applications")
    .update({ status: normalizeLittleSparksStatus(status), admin_notes: adminNotes, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapLittleSparksApplication(data);
}
