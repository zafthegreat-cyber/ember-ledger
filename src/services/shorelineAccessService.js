import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import {
  accessStateFromAreaAnswer,
  accountSetupTierLabel,
  formatBetaAccessAreaAnswer,
  isVirginiaAccessState,
  normalizeAccessState,
} from "../utils/onboardingGuidance.js";
import {
  BETA_REQUEST_STATUSES,
  LITTLE_SPARKS_STATUSES,
  betaAccessAllowedForProfile,
  betaAccessStatusForProfile,
  normalizeBetaStatus,
  normalizeLittleSparksStatus,
  statusLabel,
} from "../utils/betaAccessUtils.js";
import { APP_ROLES, normalizeAppRole } from "../utils/rolePermissions.js";

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
    state: row.state || row.stateCode || accessStateFromAreaAnswer(row.local_area_answer || row.localAreaAnswer || ""),
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
  const appRole = normalizeAppRole(row.app_role || row.appRole || row.role || userRole);
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
    username: row.username || row.public_username || row.publicUsername || "",
    publicUsername: row.public_username || row.publicUsername || row.username || "",
    public_username: row.public_username || row.publicUsername || row.username || "",
    appRole,
    app_role: appRole,
    userRole,
    isAdmin: [APP_ROLES.OWNER, APP_ROLES.ADMIN].includes(appRole) || ["admin"].includes(String(userRole).toLowerCase()),
    isModerator: appRole === APP_ROLES.MODERATOR || String(userRole).toLowerCase() === "moderator",
    is_moderator: appRole === APP_ROLES.MODERATOR || String(userRole).toLowerCase() === "moderator",
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

function mapRoleManagementUser(row = {}) {
  if (!row) return null;
  const base = mapAdminBetaAccessProfile(row) || {};
  const appRole = normalizeAppRole(row.app_role || row.appRole || base.appRole || base.userRole);
  return {
    ...base,
    appRole,
    app_role: appRole,
    role: appRole,
    protectedOfficialAdmin: Boolean(row.protected_official_admin ?? row.protectedOfficialAdmin),
    protected_official_admin: Boolean(row.protected_official_admin ?? row.protectedOfficialAdmin),
    lastActiveAt: row.last_active_at || row.lastActiveAt || base.lastSeenAt || "",
  };
}

function mapRoleAuditLog(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    targetUserId: row.target_user_id || row.targetUserId || "",
    targetEmail: row.target_email || row.targetEmail || "",
    changedBy: row.changed_by || row.changedBy || "",
    changedByEmail: row.changed_by_email || row.changedByEmail || "",
    oldRole: normalizeAppRole(row.old_role || row.oldRole),
    newRole: normalizeAppRole(row.new_role || row.newRole),
    reason: row.reason || "",
    createdAt: row.created_at || row.createdAt || "",
  };
}

function mapAdminBetaInvite(row = {}) {
  if (!row) return null;
  const status = String(row.status || "").trim().toLowerCase() || "active";
  return {
    id: row.id || "",
    inviteToken: row.invite_token || row.inviteToken || "",
    invitePath: row.invite_path || row.invitePath || "",
    recipientName: row.recipient_name || row.recipientName || "",
    recipientEmail: row.recipient_email || row.recipientEmail || "",
    note: row.note || "",
    createdBy: row.created_by || row.createdBy || "",
    createdByEmail: row.created_by_email || row.createdByEmail || "",
    createdAt: row.created_at || row.createdAt || "",
    expiresAt: row.expires_at || row.expiresAt || "",
    claimedBy: row.claimed_by || row.claimedBy || "",
    claimedEmail: row.claimed_email || row.claimedEmail || "",
    claimedAt: row.claimed_at || row.claimedAt || "",
    revokedAt: row.revoked_at || row.revokedAt || "",
    audience: row.audience || "beta",
    grantsBetaAccess: Boolean(row.grants_beta_access ?? row.grantsBetaAccess ?? true),
    status,
  };
}

function mapBetaInviteClaim(row = {}) {
  if (!row) return null;
  return {
    inviteId: row.invite_id || row.inviteId || "",
    status: row.status || "",
    recipientName: row.recipient_name || row.recipientName || "",
    recipientEmail: row.recipient_email || row.recipientEmail || "",
    claimedBy: row.claimed_by || row.claimedBy || "",
    claimedEmail: row.claimed_email || row.claimedEmail || "",
    claimedAt: row.claimed_at || row.claimedAt || "",
    appAccess: Boolean(row.app_access ?? row.appAccess),
    betaStatus: normalizeBetaStatus(row.beta_status || row.betaStatus),
    betaAccessStatus: normalizeBetaStatus(row.beta_access_status || row.betaAccessStatus),
    userRole: row.user_role || row.userRole || "user",
    tier: row.tier || "free",
    planTier: row.plan_tier || row.planTier || row.tier || "free",
  };
}

function mapAppActivityEvent(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    userId: row.user_id || row.userId || "",
    eventType: row.event_type || row.eventType || "",
    eventContext: row.event_context || row.eventContext || "",
    entityType: row.entity_type || row.entityType || "",
    entityId: row.entity_id || row.entityId || "",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || row.createdAt || "",
  };
}

function mapBetaAdminNote(row = {}) {
  if (!row) return null;
  return {
    id: row.id || "",
    targetUserId: row.target_user_id || row.targetUserId || "",
    betaRequestId: row.beta_request_id || row.betaRequestId || "",
    note: row.note || "",
    createdBy: row.created_by || row.createdBy || "",
    createdAt: row.created_at || row.createdAt || "",
  };
}

export function isMissingBetaInviteBackend(error) {
  const message = String(error?.message || error?.details || error || "");
  return Boolean(
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    /admin_create_beta_invite|admin_list_beta_invites|admin_revoke_beta_invite|claim_beta_invite|function.*does not exist|could not find/i.test(message)
  );
}

export function isMissingBetaUsersBackend(error) {
  const message = String(error?.message || error?.details || error || "");
  return Boolean(
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST205" ||
    /app_activity_events|beta_admin_notes|schema cache|could not find.*table|relation .* does not exist|does not exist/i.test(message)
  );
}

export function isMissingRoleManagementBackend(error) {
  const message = String(error?.message || error?.details || error || "");
  return Boolean(
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "42883" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST205" ||
    /app_role|role_audit_log|admin_list_users_for_roles|admin_update_user_role|schema cache|could not find|relation .* does not exist|does not exist/i.test(message)
  );
}

export function betaInviteClaimErrorMessage(error) {
  const message = String(error?.message || error?.details || error || "").trim();
  if (!message) return "This invite could not be claimed. Request beta access and we will review it.";
  if (/different email|email does not match|mismatch/i.test(message)) return "This invite was made for a different email. Log in with the email this invite was sent to, or request beta access.";
  if (/already.*claimed/i.test(message)) return "This invite has already been claimed. Ask the sender for a new invite or request beta access.";
  if (/expired/i.test(message)) return "This invite link has expired. You can still request beta access and we will review it.";
  if (/no longer active|revoked/i.test(message)) return "This invite link is no longer active. You can still request beta access and we will review it.";
  if (/not valid|invalid|missing/i.test(message)) return "This invite link is not valid. Check the link or request beta access.";
  if (/sign in|required|auth/i.test(message)) return "Create or log into your account to claim beta access.";
  return message;
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

  const state = normalizeAccessState(payload.state || payload.stateCode || "VA") || "VA";
  const tierLabel = accountSetupTierLabel(payload.tierInterest);
  const reason = String(payload.reason || "").trim();
  const row = {
    user_id: user.id,
    full_name: String(payload.fullName || "").trim(),
    email: String(payload.email || user.email || "").trim(),
    city_area: [String(payload.cityArea || "").trim(), state].filter(Boolean).join(", "),
    collector_type: String(payload.collectorType || "other").trim(),
    reason: tierLabel ? `${reason}\n\nStarting path: ${tierLabel}` : reason,
    local_area_answer: formatBetaAccessAreaAnswer({
      state,
      localAreaAnswer: isVirginiaAccessState(state) ? String(payload.localAreaAnswer || "").trim() : "not_local",
      tierInterest: payload.tierInterest,
    }),
    social_handle: String(payload.socialHandle || "").trim(),
    rules_agreed: Boolean(payload.rulesAgreed),
    status: isVirginiaAccessState(state) ? "pending" : "waitlist",
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

export async function createAdminBetaInvite(payload = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase is not configured.");
  const recipientName = String(payload.recipientName || payload.recipient_name || "").trim();
  if (!recipientName) throw new Error("Recipient name is required.");
  const recipientEmail = String(payload.recipientEmail || payload.recipient_email || "").trim().toLowerCase();
  const note = String(payload.note || "").trim();
  const expiresAt = payload.expiresAt || payload.expires_at || null;
  const { data, error } = await supabase.rpc("admin_create_beta_invite", {
    recipient_name: recipientName,
    recipient_email: recipientEmail || null,
    note: note || null,
    expires_at: expiresAt || null,
  });
  if (error) throw error;
  return mapAdminBetaInvite(Array.isArray(data) ? data[0] : data);
}

export async function loadAdminBetaInvites(searchText = "") {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_beta_invites", {
    search_text: String(searchText || "").trim() || null,
  });
  if (error) throw error;
  return (data || []).map(mapAdminBetaInvite);
}

export async function revokeAdminBetaInvite(inviteId) {
  if (!inviteId || !isSupabaseConfigured || !supabase) throw new Error("Invite id is required.");
  const { data, error } = await supabase.rpc("admin_revoke_beta_invite", {
    invite_id: inviteId,
  });
  if (error) throw error;
  return mapAdminBetaInvite(Array.isArray(data) ? data[0] : data);
}

export async function claimBetaInvite(inviteToken = "") {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase is not configured.");
  const token = String(inviteToken || "").trim();
  if (!token) throw new Error("Invite link is not valid.");
  const { data, error } = await supabase.rpc("claim_beta_invite", {
    invite_token: token,
  });
  if (error) throw error;
  return mapBetaInviteClaim(Array.isArray(data) ? data[0] : data);
}

export async function recordAppActivityEvent(user, payload = {}) {
  if (!user?.id || !isSupabaseConfigured || !supabase) return null;
  const eventType = String(payload.eventType || payload.event_type || "").trim();
  if (!eventType) return null;
  const row = {
    user_id: user.id,
    event_type: eventType,
    event_context: String(payload.eventContext || payload.event_context || "").trim() || null,
    entity_type: String(payload.entityType || payload.entity_type || "").trim() || null,
    entity_id: String(payload.entityId || payload.entity_id || "").trim() || null,
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };
  const { data, error } = await supabase
    .from("app_activity_events")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return mapAppActivityEvent(data);
}

export async function loadAdminBetaActivityEvents() {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("app_activity_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map(mapAppActivityEvent);
}

export async function loadAdminBetaAdminNotes() {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("beta_admin_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map(mapBetaAdminNote);
}

export async function createBetaAdminNote(payload = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase is not configured.");
  const targetUserId = String(payload.targetUserId || payload.target_user_id || "").trim();
  const note = String(payload.note || "").trim();
  if (!targetUserId) throw new Error("Target user is required.");
  if (!note) throw new Error("Admin note is required.");
  const row = {
    target_user_id: targetUserId,
    beta_request_id: payload.betaRequestId || payload.beta_request_id || null,
    note,
  };
  const { data, error } = await supabase
    .from("beta_admin_notes")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return mapBetaAdminNote(data);
}

export async function loadAdminRoleUsers(searchText = "") {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase.rpc("admin_list_users_for_roles", {
    search_text: String(searchText || "").trim() || null,
  });
  if (error) throw error;
  return (data || []).map(mapRoleManagementUser);
}

export async function updateAdminUserRole(targetUserId, newRole, reason = "") {
  if (!targetUserId || !isSupabaseConfigured || !supabase) throw new Error("Target user is required.");
  const { data, error } = await supabase.rpc("admin_update_user_role", {
    target_user_id: targetUserId,
    new_role: normalizeAppRole(newRole),
    reason: String(reason || "").trim() || null,
  });
  if (error) throw error;
  return mapRoleManagementUser(Array.isArray(data) ? data[0] : data);
}

export async function loadRoleAuditLog() {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from("role_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map(mapRoleAuditLog);
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
