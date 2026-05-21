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
  if (form.childAgeRange && !AGE_RANGE_VALUES.has(String(form.childAgeRange))) return "Choose a child age range, not an exact birthdate.";
  if (!form.childAgeRange) return "Choose a child age range.";
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
