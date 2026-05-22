import {
  STORE_LOCATION_TYPES,
  getStoreFamilyFriendlyBadges,
  isStoreActiveForViewer,
  normalizeStoreBooleanField,
  normalizeStoreExpansionFields,
  normalizeStoreLocationType,
} from "./storeExpansionUtils.js";
import { normalizeStoreAreaFields } from "./regionalBrowsingUtils.js";
import {
  OPEN_SUGGESTION_STATUSES,
  SUGGESTION_TYPES,
  makeSuggestion,
} from "./suggestionReviewUtils.js";

export const ADMIN_STORE_PERSISTENCE_NOTE =
  "Store admin changes use the existing local Scout/shared store data in this beta build. Cloud-backed creation would need a shared stores table with name, chain, type, city, state, region, active, reportable, partner, and review-status columns.";

export const STORE_SUGGESTION_REVIEW_COPY =
  "Store suggestions are queued for admin review and do not become public automatically.";

export const STORE_PARTNER_NO_GUARANTEE_COPY =
  "Family-friendly and partner status means the shop supports the Ember & Tide mission. It is not a guarantee of MSRP, inventory, price, or availability.";

export const ADMIN_STORE_DRAFT_DEFAULTS = {
  id: "",
  displayName: "",
  chain: "",
  storeType: "Local Card Shop",
  nickname: "",
  city: "",
  state: "Virginia",
  region: "",
  active: true,
  reportable: true,
  familyFriendlyApproved: false,
  supportsKidsAccess: false,
  supportsMsrpOrReasonablePricing: false,
  agreedToCommunityMotto: false,
  offersKidEvents: false,
  offersTradeNights: false,
  featuredPartner: false,
  advertisingPartner: false,
  publicNotes: "",
  kidsFairAccessNotes: "",
  partnerNotes: "",
};

const STORE_APPROVED_STATUSES = new Set(["approved", "active", "published"]);

function normalizeKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value = "") {
  return normalizeKey(value).replace(/\s+/g, "-") || "store";
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function nowIso(options = {}) {
  return options.now || new Date().toISOString();
}

function normalizeStoreId(input = {}) {
  return String(firstValue(
    input.id,
    input.storeId,
    input.store_id,
    input.locationId,
    input.location_id,
    `${input.chain || input.retailer || "store"}-${input.displayName || input.storeName || input.name || input.nickname || "location"}-${input.city || input.region || "area"}`
  )).toLowerCase();
}

export function normalizeAdminStoreDraft(input = {}, options = {}) {
  const base = normalizeStoreExpansionFields(input);
  const displayName = firstValue(input.displayName, input.storeName, input.store_name, input.name, input.locationName, input.nickname);
  const chain = firstValue(input.chain, input.retailer, input.storeGroup, input.store_group, input.banner, displayName);
  const storeType = normalizeStoreLocationType(input.storeType || input.store_type || input.type || base.storeType);
  const area = normalizeStoreAreaFields({
    ...base,
    city: input.city,
    state: input.state,
    region: input.region || input.area,
    storeType,
  });
  const statusText = normalizeKey([input.status, input.reviewStatus, input.review_status].filter(Boolean).join(" "));
  const activeInput = input.active ?? input.isActive ?? input.is_active;
  const active = activeInput === undefined
    ? !/\b(inactive|closed|archived|removed|rejected)\b/.test(statusText)
    : normalizeStoreBooleanField(activeInput);
  const reportableInput = input.reportable ?? input.isReportable ?? input.is_reportable;
  const reportable = active && (reportableInput === undefined ? true : normalizeStoreBooleanField(reportableInput));
  const id = normalizeStoreId({ ...input, displayName, chain, city: area.city, region: area.region });
  const reviewStatus = active
    ? firstValue(input.reviewStatus, input.review_status, input.familyFriendlyApproved || input.family_friendly_approved ? "Approved" : "Needs Review")
    : "Inactive";
  const publicNotes = firstValue(input.publicNotes, input.public_notes, input.description, input.notes);
  const kidsFairAccessNotes = firstValue(input.kidsFairAccessNotes, input.kids_fair_access_notes, input.fairAccessNotes, input.fair_access_notes);
  const partnerNotes = firstValue(input.partnerNotes, input.partner_notes, kidsFairAccessNotes);

  return normalizeStoreExpansionFields({
    ...base,
    id,
    storeId: id,
    store_id: id,
    displayName,
    name: displayName,
    storeName: displayName,
    store_name: displayName,
    nickname: firstValue(input.nickname, input.storeNickname, input.store_nickname, displayName),
    chain,
    retailer: chain,
    storeGroup: firstValue(input.storeGroup, input.store_group, chain),
    type: storeType,
    storeType,
    store_type: storeType,
    locationType: storeType,
    city: area.city,
    state: area.state,
    region: area.region,
    area: area.region,
    active,
    isActive: active,
    is_active: active,
    reportable,
    isReportable: reportable,
    is_reportable: reportable,
    familyFriendlyApproved: normalizeStoreBooleanField(input.familyFriendlyApproved ?? input.family_friendly_approved),
    family_friendly_approved: normalizeStoreBooleanField(input.familyFriendlyApproved ?? input.family_friendly_approved),
    supportsKidsAccess: normalizeStoreBooleanField(input.supportsKidsAccess ?? input.supports_kids_access),
    supports_kids_access: normalizeStoreBooleanField(input.supportsKidsAccess ?? input.supports_kids_access),
    supportsMsrpOrReasonablePricing: normalizeStoreBooleanField(input.supportsMsrpOrReasonablePricing ?? input.supports_msrp_or_reasonable_pricing),
    supports_msrp_or_reasonable_pricing: normalizeStoreBooleanField(input.supportsMsrpOrReasonablePricing ?? input.supports_msrp_or_reasonable_pricing),
    agreedToCommunityMotto: normalizeStoreBooleanField(input.agreedToCommunityMotto ?? input.agreed_to_community_motto),
    agreed_to_community_motto: normalizeStoreBooleanField(input.agreedToCommunityMotto ?? input.agreed_to_community_motto),
    offersKidEvents: normalizeStoreBooleanField(input.offersKidEvents ?? input.offers_kid_events),
    offers_kid_events: normalizeStoreBooleanField(input.offersKidEvents ?? input.offers_kid_events),
    offersTradeNights: normalizeStoreBooleanField(input.offersTradeNights ?? input.offers_trade_nights),
    offers_trade_nights: normalizeStoreBooleanField(input.offersTradeNights ?? input.offers_trade_nights),
    featuredPartner: normalizeStoreBooleanField(input.featuredPartner ?? input.featured_partner),
    featured_partner: normalizeStoreBooleanField(input.featuredPartner ?? input.featured_partner),
    advertisingPartner: normalizeStoreBooleanField(input.advertisingPartner ?? input.advertising_partner),
    advertising_partner: normalizeStoreBooleanField(input.advertisingPartner ?? input.advertising_partner),
    publicNotes,
    public_notes: publicNotes,
    description: publicNotes,
    kidsFairAccessNotes,
    kids_fair_access_notes: kidsFairAccessNotes,
    partnerNotes,
    partner_notes: partnerNotes,
    reviewStatus,
    review_status: reviewStatus,
    status: active ? "Active" : "Inactive",
    sourceType: input.sourceType || input.source_type || "admin_store_management",
    source_type: input.sourceType || input.source_type || "admin_store_management",
    source: input.source || "admin-store-tools",
    adminManaged: input.adminManaged ?? input.admin_managed ?? true,
    admin_managed: input.admin_managed ?? input.adminManaged ?? true,
    lastUpdated: options.now || input.lastUpdated || input.updatedAt || "",
    updatedAt: options.now || input.updatedAt || "",
  });
}

export function validateAdminStoreDraft(input = {}) {
  const draft = normalizeAdminStoreDraft(input);
  const errors = [];
  if (!draft.displayName || draft.displayName.length < 2) errors.push("Store display name is required.");
  if (!draft.chain || draft.chain.length < 2) errors.push("Chain or shop name is required.");
  if (!STORE_LOCATION_TYPES.includes(draft.storeType)) errors.push("Choose a supported store type.");
  if (!draft.city || draft.city.length < 2) errors.push("City is required.");
  if (!draft.state || draft.state.length < 2) errors.push("State is required.");
  return { ok: errors.length === 0, errors, draft };
}

export function adminStoreDraftToApprovedStore(input = {}, options = {}) {
  const normalized = normalizeAdminStoreDraft({
    ...input,
    active: input.active ?? input.isActive ?? true,
    reportable: input.reportable ?? input.isReportable ?? true,
    reviewStatus: input.reviewStatus || input.review_status || (input.familyFriendlyApproved || input.family_friendly_approved ? "Approved" : "Needs Review"),
    sourceType: options.sourceType || input.sourceType || input.source_type || "admin_store_management",
    source: options.source || input.source || "admin-store-tools",
  }, options);
  const now = nowIso(options);
  return {
    ...normalized,
    active: normalized.reviewStatus === "Inactive" ? false : normalized.active,
    isActive: normalized.reviewStatus === "Inactive" ? false : normalized.isActive,
    is_active: normalized.reviewStatus === "Inactive" ? false : normalized.is_active,
    reportable: normalized.reviewStatus === "Inactive" ? false : normalized.reportable,
    isReportable: normalized.reviewStatus === "Inactive" ? false : normalized.isReportable,
    is_reportable: normalized.reviewStatus === "Inactive" ? false : normalized.is_reportable,
    lastUpdated: now,
    updatedAt: now,
    updated_at: now,
    adminReviewedBy: options.reviewer || normalized.adminReviewedBy || "",
    admin_reviewed_by: options.reviewer || normalized.admin_reviewed_by || "",
    adminReviewedAt: options.reviewer ? now : normalized.adminReviewedAt || "",
    admin_reviewed_at: options.reviewer ? now : normalized.admin_reviewed_at || "",
  };
}

export function applyAdminStoreDraftToStores(stores = [], input = {}, options = {}) {
  if (!options.admin) {
    return { ok: false, reason: "admin_required", stores, errors: ["Admin access is required."] };
  }
  const validation = validateAdminStoreDraft(input);
  if (!validation.ok) return { ok: false, reason: "invalid", stores, errors: validation.errors, draft: validation.draft };
  const store = adminStoreDraftToApprovedStore(validation.draft, options);
  const targetKey = normalizeStoreId(store);
  const targetNameKey = normalizeKey(`${store.displayName}|${store.chain}|${store.city}`);
  let updated = false;
  const nextStores = stores.map((candidate) => {
    const candidateKey = normalizeStoreId(candidate);
    const candidateNameKey = normalizeKey(`${candidate.displayName || candidate.storeName || candidate.name || candidate.nickname}|${candidate.chain || candidate.retailer}|${candidate.city}`);
    if (candidateKey === targetKey || candidateNameKey === targetNameKey) {
      updated = true;
      return { ...candidate, ...store };
    }
    return candidate;
  });
  return {
    ok: true,
    mode: updated ? "updated" : "created",
    store,
    stores: updated ? nextStores : [store, ...nextStores],
    errors: [],
  };
}

export function buildStoreSuggestionRecord(input = {}, options = {}) {
  const now = nowIso(options);
  const submitted = normalizeAdminStoreDraft({
    ...input,
    active: false,
    reportable: false,
    reviewStatus: "Needs Review",
    status: "Pending Review",
    sourceType: "user_store_suggestion",
    source: options.source || "store-suggestion",
  }, { now });
  return makeSuggestion({
    suggestionType: options.targetRecordId ? SUGGESTION_TYPES.EDIT_STORE_DETAILS : SUGGESTION_TYPES.ADD_MISSING_STORE,
    targetTable: "stores",
    targetRecordId: options.targetRecordId || input.targetRecordId || "",
    userId: options.userId || input.userId || "local-beta-user",
    displayName: options.displayName || input.displayName || input.userDisplayName || "Beta User",
    submittedData: {
      ...submitted,
      active: false,
      isActive: false,
      is_active: false,
      reportable: false,
      isReportable: false,
      is_reportable: false,
      reviewStatus: "Needs Review",
      review_status: "Needs Review",
      status: "Pending Review",
      publicVisibility: "admin_review_only",
      public_visibility: "admin_review_only",
      suggestionReviewCopy: STORE_SUGGESTION_REVIEW_COPY,
      partnerNoGuaranteeCopy: STORE_PARTNER_NO_GUARANTEE_COPY,
    },
    currentDataSnapshot: options.currentDataSnapshot || null,
    notes: input.suggestionNotes || input.notes || input.partnerNotes || "",
    source: options.source || "store-suggestion",
    status: "Submitted",
    visibility: "admin_review",
    adminReviewVisible: true,
    createdAt: now,
    updatedAt: now,
  });
}

export function filterStoresForScoutPicker(stores = [], options = {}) {
  const admin = Boolean(options.admin);
  return stores.filter((store) => {
    if (!isStoreActiveForViewer(store, { admin })) return false;
    if (!admin && store.reportable === false) return false;
    if (!admin && store.isReportable === false) return false;
    if (!admin && store.is_reportable === false) return false;
    return true;
  });
}

export function canShowAdminStoreControls(options = {}) {
  return Boolean(options.isAdmin || options.adminToolsVisible);
}

export function publicStorePartnerBadges(store = {}) {
  const normalized = normalizeStoreExpansionFields(store);
  const statusText = normalizeKey([normalized.reviewStatus, normalized.review_status, normalized.status].filter(Boolean).join(" "));
  const approvedStatus = STORE_APPROVED_STATUSES.has(statusText) || /\b(approved|active|published|family friendly)\b/.test(statusText);
  if (statusText && !approvedStatus) return [];
  return getStoreFamilyFriendlyBadges(normalized);
}

export function getAdminStoreManagementSummary(stores = [], suggestions = []) {
  const normalizedStores = stores.map(normalizeAdminStoreDraft);
  const activeStores = normalizedStores.filter((store) => isStoreActiveForViewer(store));
  const openStoreSuggestions = suggestions.filter((suggestion) => (
    suggestion.targetTable === "stores" &&
    OPEN_SUGGESTION_STATUSES.has(suggestion.status)
  ));
  return {
    totalStores: normalizedStores.length,
    activeStores: activeStores.length,
    inactiveStores: normalizedStores.filter((store) => !isStoreActiveForViewer(store)).length,
    familyFriendlyStores: activeStores.filter((store) => store.familyFriendlyApproved).length,
    featuredPartners: activeStores.filter((store) => store.featuredPartner).length,
    advertisingPartners: activeStores.filter((store) => store.advertisingPartner).length,
    openStoreSuggestions: openStoreSuggestions.length,
  };
}

export function storeSchemaNeededForCloudPersistence() {
  return [
    "id",
    "display_name/name",
    "chain/retailer",
    "store_type",
    "nickname",
    "city",
    "state",
    "region/area",
    "active",
    "reportable",
    "family_friendly_approved",
    "supports_kids_access",
    "supports_msrp_or_reasonable_pricing",
    "featured_partner",
    "advertising_partner",
    "public_notes",
    "kids_fair_access_notes",
    "partner_notes",
    "review_status",
    "updated_at",
  ];
}

export function makeAdminStoreId(input = {}) {
  const draft = normalizeAdminStoreDraft(input);
  return `${slug(draft.chain)}-${slug(draft.displayName)}-${slug(draft.city || draft.region || draft.state)}`;
}
