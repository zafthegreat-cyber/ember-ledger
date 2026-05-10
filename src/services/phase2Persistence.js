const PHASE2_STORAGE_KEY = "et-tcg-phase2-data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALERT_KEY_TO_DB = {
  onlineRestock: "online_restock",
  inStoreReport: "in_store_report",
  storePrediction: "store_prediction",
  priceDrop: "price_drop",
  wishlistTarget: "wishlist_target",
  marketSpike: "market_spike",
  staleListing: "stale_listing",
  budgetWarning: "budget_warning",
  dealFound: "deal_found",
  newProductRelease: "new_product_release",
  localTidepoolPost: "local_tidepool_post",
};

const ALERT_DB_TO_KEY = Object.fromEntries(Object.entries(ALERT_KEY_TO_DB).map(([key, value]) => [value, key]));

export function createEmptyPhase2Data() {
  return {
    appPreferences: null,
    notificationPreferences: {},
    dealFinderSessions: [],
    dealFinderItems: [],
    scannerIntakeSessions: [],
    marketplaceListingChannels: [],
    receiptRecords: [],
    receiptLineItems: [],
    kidCommunityProjects: [],
    kidCommunityProjectItems: [],
    userTrustProfile: null,
    updatedAt: "",
  };
}

export function loadLocalPhase2Data() {
  if (typeof localStorage === "undefined") return createEmptyPhase2Data();
  try {
    const parsed = JSON.parse(localStorage.getItem(PHASE2_STORAGE_KEY) || "{}");
    return { ...createEmptyPhase2Data(), ...parsed };
  } catch {
    return createEmptyPhase2Data();
  }
}

export function saveLocalPhase2Data(updater) {
  const current = loadLocalPhase2Data();
  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  const payload = { ...createEmptyPhase2Data(), ...next, updatedAt: new Date().toISOString() };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PHASE2_STORAGE_KEY, JSON.stringify(payload));
  }
  return payload;
}

export function isPhase2TableMissing(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes("42p01") || text.includes("pgrst205") || text.includes("could not find the table") || text.includes("schema cache");
}

export function classifyPhase2SyncError(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  if (!error) return { kind: "local", label: "Local only mode", message: "Saved locally." };
  if (isPhase2TableMissing(error)) {
    return {
      kind: "missing_table",
      label: "Missing database table",
      message: "Missing database table. Saved locally until the Phase 2 migrations are applied.",
    };
  }
  if (
    text.includes("42501") ||
    text.includes("permission denied") ||
    text.includes("row-level security") ||
    text.includes("violates row-level security") ||
    text.includes("rls")
  ) {
    return {
      kind: "rls_blocked",
      label: "Permission/RLS blocked",
      message: "Permission/RLS blocked. Saved locally; check authenticated role policies before retrying sync.",
    };
  }
  return {
    kind: "sync_failed",
    label: "Sync failed",
    message: `Sync failed. Saved locally. ${error.message || "Unknown Supabase error."}`,
  };
}

function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}

function uuidOrNull(value) {
  return isUuid(value) ? value : null;
}

function canUseSupabase(ctx = {}) {
  return Boolean(ctx.supabase && ctx.isSupabaseConfigured && isUuid(ctx.user?.id));
}

function userId(ctx = {}) {
  return uuidOrNull(ctx.user?.id);
}

function workspaceId(ctx = {}) {
  return uuidOrNull(ctx.workspaceId);
}

function upsertLocal(list = [], record = {}, idKey = "id") {
  const key = record[idKey];
  if (!key) return [record, ...list];
  return list.some((entry) => entry[idKey] === key)
    ? list.map((entry) => (entry[idKey] === key ? { ...entry, ...record } : entry))
    : [record, ...list];
}

function mapNotificationRow(row = {}) {
  return {
    id: row.id,
    key: ALERT_DB_TO_KEY[row.alert_type] || row.alert_type,
    alertType: row.alert_type,
    enabled: row.enabled,
    channels: row.channels || {},
    filters: row.filters || {},
    quietHours: row.quiet_hours || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDealSession(row = {}) {
  return {
    id: row.id,
    title: row.title || "",
    sourceType: row.source_type || "manual",
    askingPrice: Number(row.asking_price || 0),
    marketTotal: Number(row.market_total || 0),
    msrpTotal: Number(row.msrp_total || 0),
    feeEstimate: Number(row.fee_estimate || 0),
    shippingEstimate: Number(row.shipping_estimate || 0),
    netProfit: Number(row.net_profit || 0),
    roiPercent: Number(row.roi_percent || 0),
    riskScore: Number(row.risk_score || 0),
    dealScore: Number(row.deal_score || 0),
    recommendation: row.recommendation || "",
    notes: row.notes || "",
    rawInput: row.raw_input || "",
    visibility: row.visibility || "private",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDealItem(row = {}) {
  return {
    id: row.id,
    sessionId: row.session_id,
    catalogItemId: row.catalog_item_id,
    productName: row.product_name || "",
    productType: row.product_type || "",
    quantity: Number(row.quantity || 1),
    askingPrice: Number(row.asking_price || 0),
    msrp: Number(row.msrp || 0),
    marketValue: Number(row.market_value || 0),
    estimatedSalePrice: Number(row.estimated_sale_price || 0),
    fees: Number(row.fees || 0),
    shipping: Number(row.shipping || 0),
    netProfit: Number(row.net_profit || 0),
    roiPercent: Number(row.roi_percent || 0),
    riskNote: row.risk_note || "",
    rawProductText: row.raw_product_text || "",
    matchedConfidence: row.matched_confidence || "",
    createdAt: row.created_at,
  };
}

function mapReceipt(row = {}) {
  return {
    id: row.id,
    merchant: row.merchant || "",
    purchasedAt: row.purchased_at || "",
    total: Number(row.total || 0),
    tax: Number(row.tax || 0),
    paymentMethod: row.payment_method || "",
    category: row.category || "",
    imageUrl: row.image_url || "",
    splitMode: row.split_mode || "expense_only",
    businessTotal: Number(row.business_total || 0),
    personalTotal: Number(row.personal_total || 0),
    notes: row.notes || "",
    rawOcrText: row.raw_ocr_text || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReceiptLine(row = {}) {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    catalogItemId: row.catalog_item_id,
    productName: row.product_name || "",
    quantity: Number(row.quantity || 1),
    unitPrice: Number(row.unit_price || 0),
    lineTotal: Number(row.line_total || 0),
    destination: row.destination || "expense_only",
    matchedConfidence: row.matched_confidence || "needs_review",
    createdAt: row.created_at,
  };
}

function mapKidProject(row = {}) {
  return {
    id: row.id,
    projectType: row.project_type || "kid_pack_builder",
    name: row.name || "",
    budget: Number(row.budget || 0),
    targetPackCount: Number(row.target_pack_count || 0),
    costPerPack: Number(row.cost_per_pack || 0),
    donationTotal: Number(row.donation_total || 0),
    eventDate: row.event_date || "",
    status: row.status || "planning",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKidProjectItem(row = {}) {
  return {
    id: row.id,
    projectId: row.project_id,
    catalogItemId: row.catalog_item_id,
    itemName: row.item_name || "",
    quantity: Number(row.quantity || 1),
    unitCost: Number(row.unit_cost || 0),
    msrp: Number(row.msrp || 0),
    marketValue: Number(row.market_value || 0),
    communityPrice: Number(row.community_price || 0),
    donationAmount: Number(row.donation_amount || 0),
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

function mapScannerSession(row = {}) {
  return {
    id: row.id,
    scanType: row.scan_type || "manual",
    rawValue: row.raw_value || "",
    matchedCatalogItemId: row.matched_catalog_item_id || "",
    matchConfidence: Number(row.match_confidence || 0),
    destination: row.destination || "",
    status: row.status || "review",
    extractedClues: row.extracted_clues || {},
    possibleMatches: row.possible_matches || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMarketplaceChannel(row = {}) {
  return {
    id: row.id,
    sourceInventoryId: row.source_inventory_id || "",
    catalogItemId: row.catalog_item_id || "",
    platform: row.platform || "other",
    listingTitle: row.listing_title || "",
    listingDescription: row.listing_description || "",
    listedPrice: Number(row.listed_price || 0),
    platformFees: Number(row.platform_fees || 0),
    shippingCost: Number(row.shipping_cost || 0),
    listingStatus: row.listing_status || "draft",
    externalUrl: row.external_url || "",
    skuLabel: row.sku_label || "",
    lastRefreshedAt: row.last_refreshed_at || "",
    soldAt: row.sold_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function selectMaybe(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data || [];
}

export async function loadPhase2Data(ctx = {}) {
  const localData = loadLocalPhase2Data();
  if (!canUseSupabase(ctx)) {
    const cloudRequired = Boolean(ctx.requireSupabase);
    const missingConfig = cloudRequired && (!ctx.supabase || !ctx.isSupabaseConfigured);
    const missingSession = cloudRequired && !missingConfig && !isUuid(ctx.user?.id);
    return {
      data: localData,
      status: missingConfig
        ? {
            source: "local",
            kind: "sync_unavailable",
            label: "Supabase unavailable",
            message: "Supabase mode is enabled, but the frontend URL/key is missing. Saved locally until configuration is fixed.",
          }
        : missingSession
          ? {
              source: "local",
              kind: "sync_unavailable",
              label: "Supabase sign-in required",
              message: "Supabase mode is enabled. Sign in to save Phase 2 workflows to Supabase.",
            }
          : { source: "local", kind: "local", label: "Local only mode", message: "Local only mode. Phase 2 saved locally until cloud sign-in and migrations are ready." },
    };
  }

  try {
    const uid = userId(ctx);
    const wid = workspaceId(ctx);
    const workspaceFilter = (query) => (wid ? query.eq("workspace_id", wid) : query.is("workspace_id", null));

    const preferencesQuery = workspaceFilter(ctx.supabase.from("app_user_preferences").select("*").eq("user_id", uid));
    const [
      preferences,
      notifications,
      dealSessions,
      scannerSessions,
      marketplaceChannels,
      receipts,
      kidProjects,
      trustProfile,
    ] = await Promise.all([
      selectMaybe(preferencesQuery.limit(1)),
      selectMaybe(workspaceFilter(ctx.supabase.from("notification_preferences").select("*").eq("user_id", uid)).order("alert_type")),
      selectMaybe(workspaceFilter(ctx.supabase.from("deal_finder_sessions").select("*").eq("user_id", uid)).order("created_at", { ascending: false }).limit(25)),
      selectMaybe(workspaceFilter(ctx.supabase.from("scanner_intake_sessions").select("*").eq("user_id", uid)).order("created_at", { ascending: false }).limit(25)),
      selectMaybe(workspaceFilter(ctx.supabase.from("marketplace_listing_channels").select("*").eq("user_id", uid)).order("created_at", { ascending: false }).limit(50)),
      selectMaybe(workspaceFilter(ctx.supabase.from("receipt_records").select("*").eq("user_id", uid)).order("created_at", { ascending: false }).limit(25)),
      selectMaybe(workspaceFilter(ctx.supabase.from("kid_community_projects").select("*").eq("user_id", uid)).order("created_at", { ascending: false }).limit(25)),
      selectMaybe(ctx.supabase.from("user_trust_profiles").select("*").eq("user_id", uid).limit(1)),
    ]);

    const dealSessionIds = dealSessions.map((session) => session.id);
    const receiptIds = receipts.map((receipt) => receipt.id);
    const kidProjectIds = kidProjects.map((project) => project.id);

    const [dealItems, receiptLines, kidItems] = await Promise.all([
      dealSessionIds.length
        ? selectMaybe(ctx.supabase.from("deal_finder_items").select("*").in("session_id", dealSessionIds))
        : Promise.resolve([]),
      receiptIds.length
        ? selectMaybe(ctx.supabase.from("receipt_line_items").select("*").in("receipt_id", receiptIds))
        : Promise.resolve([]),
      kidProjectIds.length
        ? selectMaybe(ctx.supabase.from("kid_community_project_items").select("*").in("project_id", kidProjectIds))
        : Promise.resolve([]),
    ]);

    const notificationPreferences = Object.fromEntries(
      notifications.map((row) => {
        const mapped = mapNotificationRow(row);
        return [mapped.key, mapped];
      })
    );

    return {
      data: {
        ...createEmptyPhase2Data(),
        appPreferences: preferences[0] || null,
        notificationPreferences,
        dealFinderSessions: dealSessions.map(mapDealSession),
        dealFinderItems: dealItems.map(mapDealItem),
        scannerIntakeSessions: scannerSessions.map(mapScannerSession),
        marketplaceListingChannels: marketplaceChannels.map(mapMarketplaceChannel),
        receiptRecords: receipts.map(mapReceipt),
        receiptLineItems: receiptLines.map(mapReceiptLine),
        kidCommunityProjects: kidProjects.map(mapKidProject),
        kidCommunityProjectItems: kidItems.map(mapKidProjectItem),
        userTrustProfile: trustProfile[0] || null,
        updatedAt: new Date().toISOString(),
      },
      status: { source: "supabase", kind: "connected", label: "Supabase connected", message: "Supabase connected. Phase 2 workflows are syncing to Supabase." },
    };
  } catch (error) {
    const classified = classifyPhase2SyncError(error);
    return {
      data: localData,
      status: {
        source: "local",
        kind: classified.kind,
        label: classified.label,
        message: classified.message,
      },
    };
  }
}

export async function saveAppPreferences(ctx = {}, preferences = {}) {
  const local = saveLocalPhase2Data((current) => ({ ...current, appPreferences: { ...(current.appPreferences || {}), ...preferences } }));
  if (!canUseSupabase(ctx)) return { source: "local", data: local.appPreferences };

  const row = {
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    dashboard_preset: preferences.dashboardPreset || preferences.dashboard_preset || "collector",
    enabled_home_cards: preferences.enabledHomeCards || preferences.enabled_home_cards || {},
    enabled_dashboard_sections: preferences.enabledDashboardSections || preferences.enabled_dashboard_sections || {},
    default_visibility: preferences.defaultVisibility || preferences.default_visibility || "private",
    quiet_hours: preferences.quietHours || preferences.quiet_hours || {},
    notification_channels: preferences.notificationChannels || preferences.notification_channels || { inApp: true },
    updated_at: new Date().toISOString(),
  };

  try {
    const { data: existing, error: selectError } = await (row.workspace_id
      ? ctx.supabase.from("app_user_preferences").select("id").eq("user_id", row.user_id).eq("workspace_id", row.workspace_id).limit(1)
      : ctx.supabase.from("app_user_preferences").select("id").eq("user_id", row.user_id).is("workspace_id", null).limit(1));
    if (selectError) throw selectError;
    const query = existing?.[0]?.id
      ? ctx.supabase.from("app_user_preferences").update(row).eq("id", existing[0].id).select().single()
      : ctx.supabase.from("app_user_preferences").insert(row).select().single();
    const { data, error } = await query;
    if (error) throw error;
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.appPreferences, error };
  }
}

export async function saveNotificationPreference(ctx = {}, preference = {}) {
  const key = preference.key || preference.alertKey || preference.alertType;
  const alertType = ALERT_KEY_TO_DB[key] || preference.alertType || key;
  const localPreference = {
    ...preference,
    key,
    alertType,
    updatedAt: new Date().toISOString(),
  };
  const local = saveLocalPhase2Data((current) => ({
    ...current,
    notificationPreferences: {
      ...(current.notificationPreferences || {}),
      [key]: localPreference,
    },
  }));
  if (!canUseSupabase(ctx)) return { source: "local", data: local.notificationPreferences[key] };

  const row = {
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    alert_type: alertType,
    enabled: preference.enabled !== false,
    channels: preference.channels || { inApp: true },
    filters: preference.filters || {},
    quiet_hours: preference.quietHours || {},
    updated_at: new Date().toISOString(),
  };

  try {
    const query = row.workspace_id
      ? ctx.supabase.from("notification_preferences").upsert(row, { onConflict: "user_id,workspace_id,alert_type" }).select().single()
      : ctx.supabase.from("notification_preferences").insert(row).select().single();
    const { data, error } = await query;
    if (error) throw error;
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.notificationPreferences[key], error };
  }
}

export async function saveDealFinderSession(ctx = {}, session = {}) {
  const now = new Date().toISOString();
  const localSession = { ...session, updatedAt: now, createdAt: session.createdAt || now };
  const localItems = (session.items || []).map((item) => ({
    ...item,
    sessionId: session.id,
    id: item.id || `${session.id}-item-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: item.createdAt || now,
  }));
  const local = saveLocalPhase2Data((current) => ({
    ...current,
    dealFinderSessions: upsertLocal(current.dealFinderSessions, localSession),
    dealFinderItems: [
      ...localItems,
      ...(current.dealFinderItems || []).filter((item) => item.sessionId !== session.id),
    ],
  }));
  if (!canUseSupabase(ctx)) return { source: "local", data: localSession };

  const row = {
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    source_type: session.sourceType || "manual",
    title: session.title || "",
    asking_price: Number(session.askingPrice || 0),
    market_total: Number(session.marketTotal || 0),
    msrp_total: Number(session.msrpTotal || 0),
    fee_estimate: Number(session.feeEstimate || 0),
    shipping_estimate: Number(session.shippingEstimate || 0),
    net_profit: Number(session.netProfit || 0),
    roi_percent: Number(session.roiPercent || 0),
    risk_score: Number(session.riskScore || 0),
    deal_score: Number(session.dealScore || 0),
    recommendation: session.recommendation || null,
    notes: session.notes || "",
    raw_input: session.rawInput || "",
    visibility: session.visibility || "private",
    updated_at: now,
  };
  if (isUuid(session.id)) row.id = session.id;

  try {
    const { data, error } = await ctx.supabase.from("deal_finder_sessions").insert(row).select().single();
    if (error) throw error;
    if (session.items?.length) {
      const itemRows = session.items.map((item) => ({
        session_id: data.id,
        catalog_item_id: uuidOrNull(item.catalogItemId),
        product_name: item.productName || session.title || "Deal item",
        product_type: item.productType || "",
        quantity: Number(item.quantity || 1),
        asking_price: Number(item.askingPrice || 0),
        msrp: Number(item.msrp || 0),
        market_value: Number(item.marketValue || 0),
        estimated_sale_price: Number(item.estimatedSalePrice || item.marketValue || 0),
        fees: Number(item.fees || 0),
        shipping: Number(item.shipping || 0),
        net_profit: Number(item.netProfit || 0),
        roi_percent: Number(item.roiPercent || 0),
        risk_note: item.riskNote || "",
        raw_product_text: item.rawProductText || item.productName || "",
        matched_confidence: item.matchedConfidence || null,
      }));
      const { error: itemError } = await ctx.supabase.from("deal_finder_items").insert(itemRows);
      if (itemError) throw itemError;
    }
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.dealFinderSessions[0], error };
  }
}

export async function saveScannerIntakeSession(ctx = {}, session = {}) {
  const now = new Date().toISOString();
  const localSession = { ...session, updatedAt: now, createdAt: session.createdAt || now };
  const local = saveLocalPhase2Data((current) => ({
    ...current,
    scannerIntakeSessions: upsertLocal(current.scannerIntakeSessions, localSession),
  }));
  if (!canUseSupabase(ctx)) return { source: "local", data: localSession };

  const row = {
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    scan_type: session.scanType || "manual",
    raw_value: session.rawValue || "",
    matched_catalog_item_id: uuidOrNull(session.matchedCatalogItemId),
    match_confidence: Number(session.matchConfidence || 0),
    destination: session.destination || null,
    status: session.status || "review",
    extracted_clues: session.extractedClues || {},
    possible_matches: session.possibleMatches || [],
    updated_at: now,
  };
  if (isUuid(session.id)) row.id = session.id;

  try {
    const { data, error } = await ctx.supabase.from("scanner_intake_sessions").insert(row).select().single();
    if (error) throw error;
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.scannerIntakeSessions[0], error };
  }
}

export async function saveMarketplaceListingChannels(ctx = {}, listing = {}, channels = []) {
  const now = new Date().toISOString();
  const localRows = channels.map((channel) => ({
    ...channel,
    id: channel.id || `${listing.id || "listing"}-${channel.platform}`,
    sourceInventoryId: listing.sourceItemId || listing.id || "",
    createdAt: channel.createdAt || now,
    updatedAt: now,
  }));
  const local = saveLocalPhase2Data((current) => ({
    ...current,
    marketplaceListingChannels: [
      ...localRows,
      ...(current.marketplaceListingChannels || []).filter((row) => row.sourceInventoryId !== (listing.sourceItemId || listing.id || "")),
    ],
  }));
  if (!canUseSupabase(ctx)) return { source: "local", data: localRows };

  const rows = localRows.map((channel) => ({
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    source_inventory_id: channel.sourceInventoryId,
    catalog_item_id: uuidOrNull(channel.catalogItemId || listing.catalogItemId),
    platform: channel.platform || "other",
    listing_title: channel.listingTitle || listing.title || "",
    listing_description: channel.listingDescription || listing.description || "",
    listed_price: Number(channel.listedPrice || listing.askingPrice || 0),
    platform_fees: Number(channel.platformFees || 0),
    shipping_cost: Number(channel.shippingCost || 0),
    listing_status: channel.listingStatus || "draft",
    external_url: channel.externalUrl || "",
    sku_label: channel.skuLabel || "",
    last_refreshed_at: channel.lastRefreshedAt || now,
    sold_at: channel.soldAt || null,
    updated_at: now,
  }));

  try {
    const { data, error } = await ctx.supabase.from("marketplace_listing_channels").insert(rows).select();
    if (error) throw error;
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.marketplaceListingChannels, error };
  }
}

export function parseReceiptText(rawText = "") {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .map((line) => {
      const match = line.match(/(.+?)\s+\$?(-?\d+(?:\.\d{2})?)$/);
      if (!match) return null;
      return {
        productName: match[1].replace(/\s{2,}/g, " ").trim(),
        quantity: 1,
        unitPrice: Number(match[2]),
        lineTotal: Number(match[2]),
        destination: "expense_only",
        matchedConfidence: "needs_review",
      };
    })
    .filter(Boolean);
}

export async function saveReceiptRecord(ctx = {}, receipt = {}) {
  const now = new Date().toISOString();
  const localReceipt = { ...receipt, updatedAt: now, createdAt: receipt.createdAt || now };
  const localLines = (receipt.lines || []).map((line) => ({
    ...line,
    id: line.id || `${receipt.id}-line-${Math.random().toString(36).slice(2, 8)}`,
    receiptId: receipt.id,
    createdAt: line.createdAt || now,
  }));
  const local = saveLocalPhase2Data((current) => ({
    ...current,
    receiptRecords: upsertLocal(current.receiptRecords, localReceipt),
    receiptLineItems: [
      ...localLines,
      ...(current.receiptLineItems || []).filter((line) => line.receiptId !== receipt.id),
    ],
  }));
  if (!canUseSupabase(ctx)) return { source: "local", data: localReceipt };

  const row = {
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    merchant: receipt.merchant || "",
    purchased_at: receipt.purchasedAt || null,
    total: Number(receipt.total || 0),
    tax: Number(receipt.tax || 0),
    payment_method: receipt.paymentMethod || "",
    category: receipt.category || "",
    image_url: receipt.imageUrl || "",
    split_mode: receipt.splitMode || "expense_only",
    business_total: Number(receipt.businessTotal || receipt.total || 0),
    personal_total: Number(receipt.personalTotal || 0),
    notes: receipt.notes || "",
    raw_ocr_text: receipt.rawOcrText || "",
    updated_at: now,
  };
  if (isUuid(receipt.id)) row.id = receipt.id;

  try {
    const { data, error } = await ctx.supabase.from("receipt_records").insert(row).select().single();
    if (error) throw error;
    if (receipt.lines?.length) {
      const lineRows = receipt.lines.map((line) => ({
        receipt_id: data.id,
        catalog_item_id: uuidOrNull(line.catalogItemId),
        product_name: line.productName || "",
        quantity: Number(line.quantity || 1),
        unit_price: Number(line.unitPrice || 0),
        line_total: Number(line.lineTotal || 0),
        destination: line.destination || "expense_only",
        matched_confidence: line.matchedConfidence || "needs_review",
      }));
      const { error: lineError } = await ctx.supabase.from("receipt_line_items").insert(lineRows);
      if (lineError) throw lineError;
    }
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.receiptRecords[0], error };
  }
}

export async function saveKidCommunityProject(ctx = {}, project = {}) {
  const now = new Date().toISOString();
  const localProject = { ...project, updatedAt: now, createdAt: project.createdAt || now };
  const localItems = (project.items || []).map((item) => ({
    ...item,
    id: item.id || `${project.id}-item-${Math.random().toString(36).slice(2, 8)}`,
    projectId: project.id,
    createdAt: item.createdAt || now,
  }));
  const local = saveLocalPhase2Data((current) => ({
    ...current,
    kidCommunityProjects: upsertLocal(current.kidCommunityProjects, localProject),
    kidCommunityProjectItems: [
      ...localItems,
      ...(current.kidCommunityProjectItems || []).filter((item) => item.projectId !== project.id),
    ],
  }));
  if (!canUseSupabase(ctx)) return { source: "local", data: localProject };

  const row = {
    user_id: userId(ctx),
    workspace_id: workspaceId(ctx),
    project_type: project.projectType || "kid_pack_builder",
    name: project.name || "Kid Pack Builder",
    budget: Number(project.budget || 0),
    target_pack_count: Number(project.targetPackCount || 0),
    cost_per_pack: Number(project.costPerPack || 0),
    donation_total: Number(project.donationTotal || 0),
    event_date: project.eventDate || null,
    status: project.status || "planning",
    notes: project.notes || "",
    updated_at: now,
  };
  if (isUuid(project.id)) row.id = project.id;

  try {
    const { data, error } = await ctx.supabase.from("kid_community_projects").insert(row).select().single();
    if (error) throw error;
    if (project.items?.length) {
      const itemRows = project.items.map((item) => ({
        project_id: data.id,
        catalog_item_id: uuidOrNull(item.catalogItemId),
        item_name: item.itemName || "",
        quantity: Number(item.quantity || 1),
        unit_cost: Number(item.unitCost || 0),
        msrp: Number(item.msrp || 0),
        market_value: Number(item.marketValue || 0),
        community_price: Number(item.communityPrice || 0),
        donation_amount: Number(item.donationAmount || 0),
        notes: item.notes || "",
      }));
      const { error: itemError } = await ctx.supabase.from("kid_community_project_items").insert(itemRows);
      if (itemError) throw itemError;
    }
    return { source: "supabase", data };
  } catch (error) {
    return { source: "local", data: local.kidCommunityProjects[0], error };
  }
}
