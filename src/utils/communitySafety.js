import {
  OFFICIAL_ADMIN_USERNAMES,
  RESERVED_USERNAME_MESSAGE,
  normalizePublicUsername,
  usernameReservationKey,
} from "./publicIdentity.js";
import { detectTidepoolSafetyReviewReason } from "./tidepoolCommunity.js";

export const MARKETPLACE_CLOSED_STATUSES = new Set(["Sold", "Traded", "Removed", "Archived"]);

const OFFICIAL_CLAIM_PATTERNS = [
  "officialember",
  "officialtide",
  "officialadminember",
  "officialadmintide",
  "emberandtideofficial",
  "emberandtideadmin",
  "emberandtidesupport",
  "emberandtidesecurity",
  "emberandtideverified",
  "adminember",
  "admintide",
  "emberadmin",
  "tideadmin",
];

const UNSAFE_COMMUNITY_PATTERNS = [
  /no\s+parents/i,
  /private\s+(kid|child|minor)\s+(dm|message|chat)/i,
  /(dm|message|chat)\s+(kid|child|minor)\s+privately/i,
  /wire\s+transfer\s+only/i,
  /gift\s+card\s+only/i,
  /cashapp\s+only/i,
  /venmo\s+friends\s+and\s+family/i,
  /paypal\s+friends\s+and\s+family/i,
  /off[-\s]?platform\s+only/i,
];

export function isMarketplaceClosedStatus(status = "") {
  return MARKETPLACE_CLOSED_STATUSES.has(String(status || "").trim());
}

export function communitySafetyKey(value = "") {
  return usernameReservationKey(value);
}

export function containsOfficialImpersonation(value = "", { isOfficialAdmin = false } = {}) {
  if (isOfficialAdmin) return false;
  const key = communitySafetyKey(value);
  if (!key) return false;
  const normalizedOfficialNames = Object.values(OFFICIAL_ADMIN_USERNAMES).map(communitySafetyKey);
  if (normalizedOfficialNames.some((officialKey) => key.includes(officialKey))) return true;
  return OFFICIAL_CLAIM_PATTERNS.some((pattern) => key.includes(pattern));
}

export function containsUnsafeCommunityText(value = "") {
  const text = String(value || "");
  return UNSAFE_COMMUNITY_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateCommunityCopy(fields = [], options = {}) {
  const text = fields.filter(Boolean).join(" ");
  if (containsOfficialImpersonation(text, options)) return RESERVED_USERNAME_MESSAGE;
  if (containsUnsafeCommunityText(text)) {
    return "This public content needs safer wording before it can be posted.";
  }
  return "";
}

export function validateMarketplaceListingDraft(form = {}, options = {}) {
  const title = String(form.title || "").trim();
  const quantity = Number(form.quantity || 0);
  if (!title) return "Listing title is required.";
  if (quantity < 1) return "Quantity must be at least 1.";

  const safetyError = validateCommunityCopy([
    form.title,
    form.description,
    form.sellerNotes,
    form.tags,
  ], options);
  if (safetyError) return safetyError;

  if (options.requirePublicFields) {
    const listingType = String(form.listingType || "");
    const isFree = /free|donation/i.test(listingType);
    const isTrade = /trade/i.test(listingType);
    const price = Number(form.askingPrice || 0);
    const tradeValue = Number(form.tradeValue || 0);
    if (!String(form.condition || "").trim()) return "Choose an item condition before submitting.";
    if (!isFree && !isTrade && price <= 0) return "Add an asking price before submitting.";
    if (isTrade && tradeValue <= 0 && !String(form.description || "").trim()) {
      return "Add a trade value or clear trade details before submitting.";
    }
  }

  return "";
}

export function validateTidepoolPostDraft(form = {}, options = {}) {
  const title = String(form.title || "").trim();
  const body = String(form.body || "").trim();
  if (!title && !body) return "Add a title or message before posting.";
  const copyError = validateCommunityCopy([
    form.title,
    form.body,
    form.tags,
    form.locationName,
  ], options);
  if (copyError) return copyError;
  if (!options.allowSafetyReview && detectTidepoolSafetyReviewReason(form)) {
    return "This public content needs safer wording before it can be posted.";
  }
  return "";
}

export function validateTidepoolCommentDraft(body = "", options = {}) {
  const text = String(body || "").trim();
  if (!text) return "Add a comment before posting.";
  return validateCommunityCopy([text], options);
}

export function isOfficialCommunityUsername(username = "") {
  const normalized = normalizePublicUsername(username);
  return normalized === OFFICIAL_ADMIN_USERNAMES.ember || normalized === OFFICIAL_ADMIN_USERNAMES.tide;
}
