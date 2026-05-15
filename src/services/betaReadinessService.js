export const BETA_READINESS_STORAGE_KEY = "et-tcg-beta-readiness";

export const KIDS_PROGRAM_COPY =
  "Ember & Tide's Kids Program helps families and young collectors access Pokemon products more fairly through giveaways, kid-focused packs, events, and occasional near-retail product opportunities when inventory allows.";

export const KIDS_PROGRAM_ANTI_RESALE_COPY =
  "Kids Program items are intended for children and families, not resale. Abuse of the program may result in removal from Kids Program access.";

export const BETA_MODE_COPY = "Beta mode - some features are still being improved.";

export const SIGNUP_NAME_HELPER =
  "Please use your real name. This helps us keep Ember & Tide fair, especially for Kids Program access, giveaways, and community reports.";

export const UPLOAD_SAFETY_WARNING =
  "Do not upload photos containing personal, financial, medical, or sensitive information.";

export const SUPPORT_EMAIL = "support@emberandtide.app";
export const PRODUCTION_APP_URL = "https://emberandtide.app";
export const BRAND_LEGAL_NOTICE =
  "© 2026 Ember & Tide. All rights reserved. Ember & Tide, the Ember & Tide logo, and related marks are trademarks of Ember & Tide.";
export const POKEMON_AFFILIATION_NOTICE =
  "Pokémon is a trademark of its respective owner. Ember & Tide is not affiliated with or endorsed by The Pokémon Company, Nintendo, Game Freak, or Creatures.";

export const SIGNUP_TERMS_TEXT = "I agree to the Terms of Use and Privacy Policy.";
export const SIGNUP_BETA_ACK_TEXT = "I understand Ember & Tide is currently in beta and features may change.";

export const BETA_ACCESS_MODES = ["open_beta", "invite_only", "waitlist"];
export const BETA_ACCESS_STATUSES = ["pending", "approved", "paused", "denied"];
export const DATA_REQUEST_TYPES = ["data_export", "account_deletion", "profile_correction", "privacy_question", "other"];
export const DATA_REQUEST_STATUSES = ["new", "reviewing", "completed", "rejected", "archived"];
export const ERROR_LOG_SEVERITIES = ["low", "normal", "high", "blocking"];

export const KIDS_PROGRAM_STATUSES = [
  "not_applied",
  "pending_review",
  "approved",
  "waitlisted",
  "denied",
  "suspended",
];

export const KIDS_PROGRAM_ACCESS_OPTIONS = [
  "giveaways",
  "kids packs",
  "retail/near-retail product opportunities",
  "events",
  "learning/trading days",
];

export const SPONSOR_PARTNERSHIP_TYPES = [
  "Donate product",
  "Sponsor kids packs",
  "Sponsor giveaway",
  "Host an event",
  "Become a card shop partner",
  "Offer retail/fair-access product",
  "Other",
];

export const BETA_FEEDBACK_TYPES = [
  "Bug",
  "UI issue",
  "Missing product",
  "Wrong catalog info",
  "Scanner problem",
  "Receipt problem",
  "Store report issue",
  "Forecast/prediction issue",
  "Kids Program question",
  "Feature request",
  "Other",
];

export const BETA_REVIEW_SECTIONS = [
  "Store Reports",
  "Guesses / Planner Inputs",
  "Forecast Flags",
  "Catalog Corrections",
  "Missing Product Submissions",
  "Kids Program Applications",
  "Data Requests",
  "User Management",
  "App Error Logs",
  "Suspicious Activity / Abuse Flags",
  "Sponsor Interest",
  "Beta Feedback",
];

export const TRUST_PAGE_CONTENT = [
  {
    key: "privacy",
    title: "Privacy Policy",
    body: "Beta draft: Ember & Tide stores account, collection, receipt, workspace, feedback, and Scout data only to run the app and improve beta quality. Private collection, receipt, Kids Program, and workspace data should not be public by default.",
  },
  {
    key: "terms",
    title: "Terms of Use",
    body: "Beta draft: Use Ember & Tide honestly, do not abuse reports or Kids Program access, and do not use the app for scraping, botting, auto-buying, harassment, fraud, or unsafe marketplace behavior.",
  },
  {
    key: "kids_rules",
    title: "Kids Program Rules",
    body: `${KIDS_PROGRAM_COPY} ${KIDS_PROGRAM_ANTI_RESALE_COPY} We collect minimal child information and admins make all application decisions manually.`,
  },
  {
    key: "community",
    title: "Community Guidelines",
    body: "Beta draft: Keep reports honest, label guesses as guesses, meet safely, avoid price gouging, and report suspicious behavior for admin review.",
  },
  {
    key: "acceptable_use",
    title: "Acceptable Use / Anti-Scalping Rules",
    body: "Beta draft: Do not use Ember & Tide for auto-buying, checkout automation, unauthorized retailer scraping, shelf-clearing abuse, or resale abuse of family-focused programs.",
  },
  {
    key: "brand",
    title: "Brand / Trademark Notice",
    body: `${BRAND_LEGAL_NOTICE} ${POKEMON_AFFILIATION_NOTICE}`,
  },
  {
    key: "support",
    title: "Contact / Support",
    body: `Contact support at ${SUPPORT_EMAIL}.`,
  },
];

export const FOR_PARENTS_COPY = [
  "Ember & Tide's Kids Program is parent/guardian managed.",
  "We collect minimal child information.",
  "We do not require child birthdates.",
  "We do not create public child profiles.",
  "Kids Program opportunities are available only when inventory allows.",
  "Kids Program items are intended for children and families, not resale.",
  "Applications may be reviewed to help prevent resale abuse and keep access fair.",
];

export const KNOWN_LIMITATIONS = [
  "OCR is not fully wired yet.",
  "Photo lookup may be beta/placeholder.",
  "Market values may be incomplete or unavailable.",
  "Forecasts are estimates, not guarantees.",
  "Catalog may have missing products.",
  "Store data may be incomplete.",
  "Some reports/guesses may need admin review.",
  "Some features are still being tested.",
  "Receipt/photo upload features should not include sensitive information.",
];

export const AUTH_COPY_REVIEW = [
  {
    key: "confirmation",
    title: "Confirmation email",
    expected: "Account confirmation links should route to https://emberandtide.app.",
  },
  {
    key: "reset",
    title: "Reset password email",
    expected: "Password reset links should route to https://emberandtide.app/reset-password.",
  },
  {
    key: "signup_success",
    title: "Sign-up confirmation required",
    expected: "Check your email to confirm your account. After confirming, return here to log in.",
  },
  {
    key: "password_success",
    title: "Password reset success",
    expected: "Password updated. Please log in with your new password.",
  },
];

export const PRODUCTION_CONFIG_AUDIT = [
  "Supabase project ref: gxsfququorfczvhrkudl",
  "Production app URL: https://emberandtide.app",
  "Auth Site URL should be https://emberandtide.app",
  "Redirect URLs should include https://emberandtide.app, https://emberandtide.app/, and https://emberandtide.app/reset-password",
  "Local dev reset URLs may be included as secondary development redirects only.",
  "No localhost or old Vercel URL should be primary production auth redirect.",
  "Custom SMTP should send Ember & Tide branded emails.",
  "Frontend environment variables must not expose service-role keys or secrets.",
  "Guest preview must not expose private data.",
  "Admin tools must stay hidden from Regular Mode and guests.",
];

export const BETA_EMPTY_STATES = {
  vault: {
    title: "Your Vault is empty",
    body: "Add cards or sealed products you want to track in your personal collection.",
  },
  forge: {
    title: "Your Forge inventory is empty",
    body: "Add business inventory, receipt purchases, and items you plan to sell.",
  },
  wishlist: {
    title: "No wishlist items yet",
    body: "Save cards or sealed products you're hunting for and get alerts when they show up.",
  },
  scout: {
    title: "No local reports yet",
    body: "Submit a store report or add a guess to help build restock forecasts.",
  },
  market: {
    title: "Market tools are getting ready",
    body: "Track item values, compare deals, and watch market changes as pricing data becomes available.",
  },
  kids: {
    title: "Kids Program opportunities will appear here",
    body: "When inventory allows, Ember & Tide will post kid-focused packs, giveaways, and near-retail opportunities for families.",
  },
  admin: {
    title: "No pending reviews",
    body: "New reports, applications, and catalog corrections will appear here.",
  },
};

export const BETA_TOOLTIPS = {
  Vault: "Your personal collection.",
  Forge: "Your business inventory and selling tools.",
  Scout: "Store reports, guesses, and restock forecasts.",
  Guess: "A personal prediction or pattern note, not confirmed stock.",
  Report: "A real stock sighting or store update.",
  "Expense only": "Tracks the receipt expense without adding the item to inventory.",
};

export const DEFAULT_NOTIFICATION_SETTINGS = {
  stock_alerts: true,
  restock_predictions: true,
  wishlist_matches: true,
  kids_program_updates: true,
  giveaways: true,
  receipt_review_reminders: true,
  inventory_value_changes: false,
  catalog_updates: false,
  workspace_invites: true,
  admin_review_alerts: false,
  email_enabled: true,
  sms_enabled: false,
  phone: "",
  quiet_hours_enabled: false,
  quiet_hours_start: "",
  quiet_hours_end: "",
};

export const BETA_READINESS_SECTIONS = [
  "Auth Status",
  "Inventory Status",
  "Mobile UI Status",
  "Admin Tools Status",
  "Core Feature Status",
  "Beta Feedback Status",
  "Known Blockers",
  "Launch Decision",
];

export const BETA_LAUNCH_STATES = [
  "Not ready",
  "Internal testing",
  "Ready for limited beta",
  "Ready for public beta",
];

export const DEFAULT_BETA_BLOCKERS = [
  { title: "Live Supabase Phase 2 migrations", severity: "blocking", owner: "Admin", status: "open", notes: "Apply and verify pending database foundations before wider beta." },
  { title: "Provider integrations deferred", severity: "medium", owner: "Product", status: "planned", notes: "SMS, billing, OCR providers, and market providers require separate approval." },
];

export const DEFAULT_MARKETING_MATERIALS = [
  { title: "Beta announcement", contentType: "social", platform: "Facebook/Instagram", status: "drafted", caption: "Ember & Tide beta is opening soon for collectors, parents, sellers, and local restock scouts." },
  { title: "Parent-focused post", contentType: "social", platform: "Facebook", status: "drafted", caption: "Pokemon collecting should still be fun, fair, and family-friendly." },
  { title: "Card shop/sponsor post", contentType: "outreach", platform: "Email/DM", status: "idea", caption: "Partner with Ember & Tide to support kid-friendly Pokemon access and fair local collecting." },
  { title: "Kids Program post", contentType: "social", platform: "Facebook/Instagram", status: "drafted", caption: KIDS_PROGRAM_COPY },
  { title: "Printable flyer", contentType: "flyer", platform: "Print", status: "needs_image", caption: "Bring Pokemon Collecting Back to Kids | https://emberandtide.app | support@emberandtide.app | QR placeholder" },
];

export const DEFAULT_ROADMAP_ITEMS = [
  { section: "Now", title: "Beta readiness foundations", status: "in_progress" },
  { section: "Next", title: "Live persistence verification", status: "planned" },
  { section: "Later", title: "Provider integrations after approval", status: "planned" },
  { section: "Do Not Build Yet", title: "Auto-buying, checkout automation, unauthorized scraping, SMS blasting, public child profiles, exact child birthdates, full ecommerce, sponsor payments, bank sync, tax filing, heavy 3D pipeline, marketplace auto-posting", status: "deferred" },
];

export const BETA_REF_CODES = [
  "flyer-beta",
  "flyer-cardshop",
  "flyer-kids-program",
  "flyer-sponsor",
  "event-table",
  "instagram-bio",
  "facebook-bio",
  "tiktok-bio",
];

export function createEmptyBetaReadinessData() {
  return {
    kidsApplications: [],
    sponsorInterest: [],
    dataRequests: [],
    userAdminNotes: [],
    appErrorLogs: [],
    notifications: [],
    notificationPreferences: DEFAULT_NOTIFICATION_SETTINGS,
    betaFeedback: [],
    auditLogs: [],
    readiness: {
      launchState: "Not ready",
      betaAccessMode: "open_beta",
      authCopyReviewed: false,
      productionConfigReviewed: false,
      blockers: DEFAULT_BETA_BLOCKERS,
      checklist: {
        backupsVerified: false,
        exportPathPlanned: true,
        adminRecoveryNotes: false,
        importRollbackStrategy: false,
        softDeletePlanned: true,
      },
    },
    marketingMaterials: DEFAULT_MARKETING_MATERIALS,
    roadmapItems: DEFAULT_ROADMAP_ITEMS,
    onboarding: {
      completedAt: "",
      preferences: [],
      firstLoginSeen: false,
    },
  };
}

export function loadBetaReadinessData() {
  if (typeof localStorage === "undefined") return createEmptyBetaReadinessData();
  try {
    const parsed = JSON.parse(localStorage.getItem(BETA_READINESS_STORAGE_KEY) || "{}");
    return { ...createEmptyBetaReadinessData(), ...parsed };
  } catch {
    return createEmptyBetaReadinessData();
  }
}

export function saveBetaReadinessData(updater) {
  const current = loadBetaReadinessData();
  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  const payload = { ...createEmptyBetaReadinessData(), ...next, updatedAt: new Date().toISOString() };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(BETA_READINESS_STORAGE_KEY, JSON.stringify(payload));
  }
  return payload;
}

export function normalizePersonName(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function validateSignupName(value = "", fieldLabel = "Name") {
  const normalized = normalizePersonName(value);
  if (!normalized) return `${fieldLabel} is required.`;
  if (normalized.length < 2 || normalized.length > 50) return `${fieldLabel} must be 2-50 characters.`;
  if (!/^[A-Za-z][A-Za-z' -]*[A-Za-z]$/.test(normalized) && !/^[A-Za-z]{2}$/.test(normalized)) {
    return `${fieldLabel} can use letters, spaces, hyphens, and apostrophes only.`;
  }
  const suspicious = [
    "test user",
    "fake name",
    "john doe",
    "jane doe",
    "ash ketchum",
    "pikachu",
  ];
  if (suspicious.includes(normalized.toLowerCase())) return `Please use your real ${fieldLabel.toLowerCase()}.`;
  return "";
}

export function validateSignupFullName(firstName = "", lastName = "") {
  const firstError = validateSignupName(firstName, "First name");
  if (firstError) return firstError;
  const lastError = validateSignupName(lastName, "Last name");
  if (lastError) return lastError;
  const fullName = `${normalizePersonName(firstName)} ${normalizePersonName(lastName)}`.trim().toLowerCase();
  if (["test user", "fake name", "john doe", "ash ketchum"].includes(fullName)) return "Please use your real name.";
  return "";
}

export function getEffectivePlan(profile = {}) {
  if (isTrialActive(profile)) return profile.trialTier || profile.trial_tier || profile.planTier || profile.plan_tier || "free";
  return profile.planTier || profile.plan_tier || profile.tier || "free";
}

export function isTrialActive(profile = {}) {
  const expires = profile.trialExpiresAt || profile.trial_expires_at;
  return Boolean(profile.trialTier || profile.trial_tier) && expires && new Date(expires).getTime() > Date.now();
}

export function canAccessBetaFeature(featureKey, profile = {}, actualRole = "user") {
  if (actualRole === "admin") return true;
  const plan = getEffectivePlan(profile);
  const premiumOnly = new Set(["advanced_scout_alerts", "marketplace_exports", "business_reports"]);
  if (!premiumOnly.has(featureKey)) return true;
  return ["mid", "premium", "plus", "pro", "founder"].includes(plan);
}

export function getFeatureLimit(featureKey, profile = {}) {
  const plan = getEffectivePlan(profile);
  const premium = ["premium", "pro", "founder"].includes(plan);
  const mid = ["mid", "plus"].includes(plan);
  const limits = {
    scans_per_month: premium ? Infinity : mid ? 250 : 30,
    watched_stores: premium ? 100 : mid ? 25 : 5,
    kids_applications: 1,
  };
  return limits[featureKey] ?? Infinity;
}
