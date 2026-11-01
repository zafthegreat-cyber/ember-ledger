export const SPARK_PROGRAM_STATUS_OPTIONS = [
  "interest_submitted",
  "waitlisted",
  "invited",
  "fulfilled",
  "not_available_yet",
  "denied",
];

const SPARK_STATUS_LABELS = {
  not_applied: "Not Applied",
  pending: "Interest Submitted",
  pending_review: "Interest Submitted",
  interest_submitted: "Interest Submitted",
  approved: "Invited",
  invited: "Invited",
  waitlist: "Waitlisted",
  waitlisted: "Waitlisted",
  fulfilled: "Fulfilled",
  not_available_yet: "Not Available Yet",
  denied: "Not Available Yet",
  suspended: "Restricted",
};

const AGE_RANGE_VALUES = new Set(["under_6", "6_8", "9_12", "13_17"]);
export const SPARK_AGE_RANGES = [
  { value: "under_6", label: "Under 6" },
  { value: "6_8", label: "6-8" },
  { value: "9_12", label: "9-12" },
  { value: "13_17", label: "13-17" },
];

// #24: accept the ways people actually type an age range ("6-8", "6 to 8",
// "ages 9–12", "under 6", "13+", or a single age like "7") and map them to the
// stored range value. Exact birthdates are still refused by the validator.
export function normalizeSparkAgeRange(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (AGE_RANGE_VALUES.has(raw)) return raw;
  const compact = raw.replace(/\s+/g, "").replace(/[–—]/g, "-").replace(/to|through|thru/g, "-").replace(/^ages?/, "");
  const direct = {
    "under6": "under_6", "<6": "under_6", "u6": "under_6", "0-5": "under_6", "under-6": "under_6",
    "6-8": "6_8", "6_8": "6_8", "9-12": "9_12", "9_12": "9_12", "13-17": "13_17", "13_17": "13_17", "13+": "13_17", "teen": "13_17", "teens": "13_17",
  };
  if (direct[compact]) return direct[compact];
  const single = compact.match(/^(\d{1,2})$/);
  if (single) {
    const age = Number(single[1]);
    if (age < 6) return "under_6";
    if (age <= 8) return "6_8";
    if (age <= 12) return "9_12";
    if (age <= 17) return "13_17";
    return "";
  }
  const range = compact.match(/^(\d{1,2})-(\d{1,2})$/);
  if (range) {
    const low = Number(range[1]);
    if (low < 6) return "under_6";
    if (low <= 8) return "6_8";
    if (low <= 12) return "9_12";
    if (low <= 17) return "13_17";
  }
  return "";
}

function looksLikeExactBirthdate(value = "") {
  const text = String(value || "");
  return /\b(?:dob|birthdate|birthday|born)\b/i.test(text) || /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text);
}

export function normalizeSparkProgramStatus(status = "interest_submitted") {
  const value = String(status || "").trim().toLowerCase();
  if (value === "pending" || value === "pending_review") return "interest_submitted";
  if (value === "approved") return "invited";
  if (value === "waitlist") return "waitlisted";
  if (value === "denied") return "not_available_yet";
  if (SPARK_PROGRAM_STATUS_OPTIONS.includes(value)) return value;
  return "interest_submitted";
}

export function sparkProgramStatusLabel(status = "") {
  return SPARK_STATUS_LABELS[String(status || "").trim().toLowerCase()] || SPARK_STATUS_LABELS[normalizeSparkProgramStatus(status)];
}

export function validateSparkApplication(form = {}, context = {}) {
  const parentName = String(form.parentName || context.parentName || "").trim();
  const email = String(form.email || context.email || "").trim();
  if (!parentName) return "Parent/guardian name is required.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "A valid parent/guardian email is required.";
  const ageRange = normalizeSparkAgeRange(form.childAgeRange);
  if (form.childAgeRange && !ageRange) return "Choose a child age range (Under 6, 6-8, 9-12, or 13-17), not an exact birthdate.";
  if (!ageRange) return "Choose a child age range.";
  if (!String(form.favoritePokemon || form.collectingInterest || "").trim()) {
    return "Tell us what Pokemon product, set, or collecting interest would help.";
  }
  if (!Array.isArray(form.requestedAccess) || form.requestedAccess.length === 0) {
    return "Choose at least one Spark access type.";
  }
  if (looksLikeExactBirthdate(`${form.childFirstName || ""} ${form.reason || ""} ${form.collectingInterest || ""}`)) {
    return "Use an age range only. Please remove exact birthdates or sensitive child details.";
  }
  if (!form.agreesNoResale || !form.consentContact) {
    return "Please agree to The Spark rules and parent contact consent before applying.";
  }
  return "";
}

// #25/#26: say up front what The Spark can do today so nobody fills in a form
// and then meets "coming soon". Update as pieces go live.
export const SPARK_FEATURE_STATUS = [
  { key: "request", label: "Request access for your family", status: "live", detail: "Parent-managed request, reviewed by a person. You get an in-app status update." },
  { key: "donation_plan", label: "Plan and log a donation", status: "live", detail: "Saved on this device and reviewed before it counts as impact. Nothing is shipped or charged." },
  { key: "kid_packs", label: "Kid pack planning", status: "live", detail: "Plan starter, event and birthday packs. Fulfilment is coordinated by admin, not automatic." },
  { key: "donation_fulfilment", label: "Donation pickup, shipping and matching", status: "coming_soon", detail: "Not built yet. Admin follows up by email after review." },
  { key: "giveaways", label: "Giveaways", status: "coming_soon", detail: "Not built yet. No entries, drawings or winners are run in the app." },
  { key: "events", label: "Event sign-ups and RSVPs", status: "coming_soon", detail: "Event planning notes are local only. Public sign-ups are not built yet." },
];

export function sparkFeatureStatusLabel(status = "") {
  return status === "live" ? "Live now" : status === "coming_soon" ? "Coming soon" : "Planned";
}
