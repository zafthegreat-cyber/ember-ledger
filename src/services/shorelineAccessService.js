import { isSupabaseConfigured, supabase } from "../supabaseClient";

export const BETA_REQUEST_STATUSES = ["not_requested", "pending", "approved", "waitlist", "denied"];
export const LITTLE_SPARKS_STATUSES = ["not_applied", "pending", "approved", "waitlist", "denied"];

export const STATUS_LABELS = {
  not_requested: "Not Requested",
  not_applied: "Not Applied",
  pending: "Pending",
  approved: "Approved",
  waitlist: "Waitlist",
  waitlisted: "Waitlist",
  denied: "Denied",
  paused: "Waitlist",
  pending_review: "Pending",
  suspended: "Denied",
};

export function normalizeBetaStatus(status = "not_requested") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "paused" || normalized === "waitlisted") return "waitlist";
  if (BETA_REQUEST_STATUSES.includes(normalized)) return normalized;
  return "not_requested";
}

export function normalizeLittleSparksStatus(status = "not_applied") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending_review") return "pending";
  if (normalized === "waitlisted") return "waitlist";
  if (normalized === "suspended") return "denied";
  if (LITTLE_SPARKS_STATUSES.includes(normalized)) return normalized;
  return "not_applied";
}

export function statusLabel(status) {
  return STATUS_LABELS[String(status || "").toLowerCase()] || "Not Requested";
}

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

export async function loadShorelineAdminRequests() {
  if (!isSupabaseConfigured || !supabase) return { betaRequests: [], littleSparksApplications: [] };
  const [betaResult, sparksResult] = await Promise.all([
    supabase.from("beta_access_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("little_sparks_applications").select("*").order("created_at", { ascending: false }),
  ]);
  if (betaResult.error) throw betaResult.error;
  if (sparksResult.error) throw sparksResult.error;
  return {
    betaRequests: (betaResult.data || []).map(mapBetaRequest),
    littleSparksApplications: (sparksResult.data || []).map(mapLittleSparksApplication),
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
