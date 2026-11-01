import {
  OFFICIAL_ADMIN_USERNAMES,
  RESERVED_USERNAME_MESSAGE,
  normalizePublicUsername,
  usernameReservationKey,
} from "./publicIdentity.js";
import { detectTidepoolSafetyReviewReason } from "./tidepoolCommunity.js";

export const MARKETPLACE_CLOSED_STATUSES = new Set(["Sold", "Traded", "Removed", "Archived", "Rejected"]);

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

// #31/#32: replica/counterfeit wording and off-platform "friends and family"
// payment pushes, in the spellings people actually use (F&F, FF, f/f, "no
// goods and services", Zelle/Cash App/Venmo "only"), not just one phrasing.
const UNSAFE_COMMUNITY_PATTERNS = [
  /no\s+parents/i,
  /private\s+(kid|child|minor)\s+(dm|message|chat)/i,
  /(dm|message|chat)\s+(kid|child|minor)\s+privately/i,
  /wire\s+transfer\s+only/i,
  /gift\s+cards?\s+only/i,
  /\b(cash\s*app|cashapp|zelle|venmo|paypal|apple\s*cash|chime)\b[^.\n]{0,24}\bonly\b/i,
  /\bonly\b[^.\n]{0,16}\b(cash\s*app|cashapp|zelle|venmo|paypal|apple\s*cash|chime)\b/i,
  /\b(venmo|paypal|pay\s*pal|pp)\b[^.\n]{0,20}\b(friends?\s*(and|&|\+|n)\s*family|f\s*&\s*f|f\s*\/\s*f|\bff\b|fnf)\b/i,
  /\b(friends?\s*(and|&|\+|n)\s*family|f\s*&\s*f|fnf)\b[^.\n]{0,20}\b(only|please|pls|preferred|or\s+no\s+deal)\b/i,
  /\bno\s+(goods?\s*(and|&)\s*services?|g\s*&\s*s|gns)\b/i,
  /\b(goods?\s*(and|&)\s*services?|g\s*&\s*s)\b[^.\n]{0,12}\b(not accepted|adds? fee|extra\s+\d)/i,
  /off[-\s]?platform\s+only/i,
  /\b(replica|replicas|counterfeit|counterfeits|fake|fakes|proxy|proxies|bootleg|knock[-\s]?off|unofficial print|custom print)\b[^.\n]{0,40}\b(cards?|packs?|box(es)?|etb|booster|slabs?|psa|cgc|bgs)\b/i,
  /\b(cards?|packs?|box(es)?|etb|booster|slabs?)\b[^.\n]{0,40}\b(replica|replicas|counterfeit|counterfeits|fake|fakes|proxy|proxies|bootleg|knock[-\s]?off)\b/i,
  /\b(resealed|reseal|re-sealed|weighed\s+packs?|light\s+packs?)\b/i,
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
  // #30/#31: listings run the same contact/address/counterfeit detector as posts.
  if (!options.allowSafetyReview) {
    const reviewReason = detectTidepoolSafetyReviewReason({
      title: form.title,
      body: [form.description, form.sellerNotes, form.tags].filter(Boolean).join(" "),
      locationName: form.meetupLocation || form.locationName || form.pickupArea,
    });
    if (reviewReason) return `${reviewReason} Public listings cannot include private contact details, exact addresses, or replica/counterfeit items.`;
  }

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
  const copyError = validateCommunityCopy([text], options);
  if (copyError) return copyError;
  // #29: comments run the same contact/address/child-safety detector as posts.
  if (!options.allowSafetyReview && detectTidepoolSafetyReviewReason({ body: text })) {
    return "Comments cannot include phone numbers, emails, exact addresses, or private family details. Keep it in the app so everyone stays safe.";
  }
  return "";
}

/** One place to ask "would this public text be blocked, and why" for UI hints. */
export function describeCommunitySafetyIssue(text = "", options = {}) {
  const value = String(text || "");
  if (!value.trim()) return "";
  const copyError = validateCommunityCopy([value], options);
  if (copyError) return copyError;
  return detectTidepoolSafetyReviewReason({ body: value }) || "";
}

export function isOfficialCommunityUsername(username = "") {
  const normalized = normalizePublicUsername(username);
  return normalized === OFFICIAL_ADMIN_USERNAMES.ember || normalized === OFFICIAL_ADMIN_USERNAMES.tide;
}
