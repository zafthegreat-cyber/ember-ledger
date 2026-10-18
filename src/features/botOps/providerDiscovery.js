import {
  BOT_DISCOVERY_CAPABILITIES,
  BOT_DISCOVERY_INTEGRATION_MODES,
  BOT_EVIDENCE_STATUSES,
  BOT_PILOT_READINESS,
  BOT_PROVIDER_KEYS,
} from "./constants.js";
import { assertSafeBotOpsInput } from "./security.js";
import { BOT_PROVIDER_CATALOG, BOT_PROVIDER_REVIEWED_AT, BOT_REAL_PROVIDER_KEYS, isRegisteredBotProvider } from "./providerCatalog.js";

export const BOT_EVIDENCE_TYPES = Object.freeze({
  OFFICIAL_PUBLIC_SITE: "OFFICIAL_PUBLIC_SITE",
  OFFICIAL_DOCUMENTATION: "OFFICIAL_DOCUMENTATION",
  OFFICIAL_GUIDE: "OFFICIAL_GUIDE",
  OFFICIAL_TERMS: "OFFICIAL_TERMS",
  OFFICIAL_DOCUMENTATION_REVIEW: "OFFICIAL_DOCUMENTATION_REVIEW",
  PROVIDER_BRANDED_PUBLIC_GUIDE: "PROVIDER_BRANDED_PUBLIC_GUIDE",
});

export const BOT_DISCOVERY_RECOMMENDATION_STATUSES = Object.freeze({
  OFFLINE_CANDIDATE: "OFFLINE_CANDIDATE",
  PROVIDER_CONFIRMATION_REQUIRED: "PROVIDER_CONFIRMATION_REQUIRED",
  NOT_RECOMMENDED: "NOT_RECOMMENDED",
  DO_NOT_USE: "DO_NOT_USE",
});

const REVIEWED_AT = BOT_PROVIDER_REVIEWED_AT;
const EVIDENCE_FIELDS = new Set([
  "id", "provider", "capability", "integrationMode", "status", "evidenceType",
  "sourceTitle", "sourceUrl", "sourceDate", "sourceVersion", "verifiedAt",
  "summary", "notes", "requiresOwnerAction",
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,199}$/i;
const REAL_PROVIDER_ENUM = Object.freeze(Object.fromEntries(BOT_REAL_PROVIDER_KEYS.map((key) => [key, key])));

export class BotProviderDiscoveryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BotProviderDiscoveryError";
    this.code = code;
    this.details = details;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function requiredText(value, field, maximum = 500) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BotProviderDiscoveryError("REQUIRED_FIELD", `${field} is required.`, { field });
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new BotProviderDiscoveryError("TEXT_TOO_LONG", `${field} is too long.`, { field });
  }
  return normalized;
}

function optionalText(value, field, maximum = 500) {
  if (value == null || value === "") return null;
  return requiredText(value, field, maximum);
}

function enumValue(value, values, field, optional = false) {
  if (optional && (value == null || value === "")) return null;
  const normalized = String(value || "").toUpperCase();
  if (!Object.values(values).includes(normalized)) {
    throw new BotProviderDiscoveryError("INVALID_ENUM", `${field} has an unsupported value.`, { field });
  }
  return normalized;
}

function isoDate(value, field, optional = false) {
  if (optional && (value == null || value === "")) return null;
  const normalized = requiredText(value, field, 40);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?$/.test(normalized)
    || !Number.isFinite(Date.parse(normalized))) {
    throw new BotProviderDiscoveryError("INVALID_DATE", `${field} must be an ISO date or UTC timestamp.`, { field });
  }
  return normalized;
}

function officialSourceUrl(value, provider) {
  const text = requiredText(value, "sourceUrl", 1_000);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new BotProviderDiscoveryError("INVALID_SOURCE_URL", "sourceUrl must be a valid official HTTPS URL.");
  }
  const definition = BOT_PROVIDER_CATALOG[provider];
  const sourceHost = url.hostname.toLowerCase();
  const requiredPath = definition?.sourcePathPrefixes[sourceHost];
  if (url.protocol !== "https:" || url.username || url.password
    || !definition?.officialSourceHosts.includes(sourceHost)
    || (requiredPath && !url.pathname.startsWith(requiredPath))) {
    throw new BotProviderDiscoveryError("UNTRUSTED_SOURCE", "Discovery evidence must reference a reviewed official provider source.");
  }
  return url.toString();
}

/** Normalize a short, non-secret reference to public provider evidence. */
export function normalizeBotProviderEvidence(input) {
  assertSafeBotOpsInput(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BotProviderDiscoveryError("INVALID_EVIDENCE", "Provider evidence must be a plain object.");
  }
  const unknown = Object.keys(input).filter((field) => !EVIDENCE_FIELDS.has(field));
  if (unknown.length) {
    throw new BotProviderDiscoveryError("UNKNOWN_FIELD", `Unsupported provider evidence field: ${unknown[0]}.`, { field: unknown[0] });
  }
  const id = requiredText(input.id, "id", 200);
  if (!ID_PATTERN.test(id)) throw new BotProviderDiscoveryError("INVALID_ID", "id is invalid.");
  const provider = enumValue(input.provider, REAL_PROVIDER_ENUM, "provider");
  const capability = enumValue(input.capability, BOT_DISCOVERY_CAPABILITIES, "capability", true);
  const integrationMode = enumValue(input.integrationMode, BOT_DISCOVERY_INTEGRATION_MODES, "integrationMode", true);
  if (!capability && !integrationMode) {
    throw new BotProviderDiscoveryError("MISSING_SUBJECT", "Evidence must identify a capability or integration mode.");
  }
  if (input.requiresOwnerAction != null && typeof input.requiresOwnerAction !== "boolean") {
    throw new BotProviderDiscoveryError("INVALID_BOOLEAN", "requiresOwnerAction must be true or false.");
  }
  return deepFreeze({
    id,
    provider,
    capability,
    integrationMode,
    status: enumValue(input.status, BOT_EVIDENCE_STATUSES, "status"),
    evidenceType: enumValue(input.evidenceType, BOT_EVIDENCE_TYPES, "evidenceType"),
    sourceTitle: requiredText(input.sourceTitle, "sourceTitle", 200),
    sourceUrl: officialSourceUrl(input.sourceUrl, provider),
    sourceDate: isoDate(input.sourceDate, "sourceDate", true),
    sourceVersion: optionalText(input.sourceVersion, "sourceVersion", 200),
    verifiedAt: isoDate(input.verifiedAt, "verifiedAt"),
    summary: requiredText(input.summary, "summary", 500),
    notes: optionalText(input.notes, "notes", 500),
    requiresOwnerAction: input.requiresOwnerAction === true,
  });
}

function evidence(input) {
  return normalizeBotProviderEvidence({ verifiedAt: REVIEWED_AT, ...input });
}

const HAYHA_EVIDENCE = Object.freeze([
  evidence({
    id: "hayha.public-runtime",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    capability: BOT_DISCOVERY_CAPABILITIES.OBSERVE_RUNTIME,
    status: BOT_EVIDENCE_STATUSES.UNKNOWN,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_PUBLIC_SITE,
    sourceTitle: "Hayha public product site",
    sourceUrl: "https://www.hayhabots.com/",
    sourceVersion: "Public site reviewed 2026-10-17",
    summary: "The public product description identifies desktop and command-line experiences but does not document an external read/status API.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.public-api-review",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API,
    status: BOT_EVIDENCE_STATUSES.UNKNOWN,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_DOCUMENTATION_REVIEW,
    sourceTitle: "Hayha official documentation",
    sourceUrl: "https://docs.hayhabots.com/",
    sourceVersion: "Documentation reviewed 2026-10-17; guide indicates Discord announcements may be newer",
    summary: "No public integration API or SDK was located in the reviewed public documentation; provider confirmation is required.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.webhook-settings",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK,
    status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceType: BOT_EVIDENCE_TYPES.PROVIDER_BRANDED_PUBLIC_GUIDE,
    sourceTitle: "HayhaAIO public GitBook UI guide",
    sourceUrl: "https://hayha-bots.gitbook.io/hayhaaio/ui",
    sourceVersion: "Provider-branded public GitBook reviewed 2026-10-17; current official-domain confirmation unavailable",
    summary: "The public guide documents owner-configured webhook settings but no general task-status schema, signing, retries, or direct Code 3 delivery contract.",
    notes: "Treat as limited provider-branded evidence pending current provider confirmation.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.snipes-discord-event",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    capability: BOT_DISCOVERY_CAPABILITIES.READ_CHECKOUT_EVIDENCE,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK,
    status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceType: BOT_EVIDENCE_TYPES.PROVIDER_BRANDED_PUBLIC_GUIDE,
    sourceTitle: "Hayha Snipes USA public GitBook guide",
    sourceUrl: "https://hayha-bots.gitbook.io/guide-v2/sites/snipes-usa",
    sourceVersion: "Provider-branded public GitBook reviewed 2026-10-17; current official-domain confirmation unavailable",
    summary: "The guide describes sending queue-pass or checkout-link output to Discord, not a signed general-purpose event interface.",
    notes: "Credential-bearing links and Discord delivery make this unsuitable for a Code 3 pilot.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.session-export",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "Hayha Amazon guide",
    sourceUrl: "https://docs.hayhabots.com/site-guides/amazon/",
    sourceVersion: "Public guide reviewed 2026-10-17",
    summary: "The documented export concerns sensitive account-session material, not a safe task/status export.",
    notes: "Secret-bearing session exports are outside the Code 3 import boundary and must not be ingested.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.cli-interface",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE,
    status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "Hayha Footsites guide",
    sourceUrl: "https://docs.hayhabots.com/site-guides/footsites/",
    sourceVersion: "Public guide reviewed 2026-10-17",
    summary: "The guide describes owner-operated command-line controls, not a supported third-party integration interface.",
    notes: "Code 3 must not automate command-line input.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.private-interface-policy",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_TERMS,
    sourceTitle: "Hayha Terms of Use",
    sourceUrl: "https://www.hayhabots.com/tos.html",
    sourceDate: "2019-08-05",
    summary: "The published terms prohibit automated access and data-extraction techniques unless expressly authorized.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "hayha.reverse-engineering-policy",
    provider: BOT_PROVIDER_KEYS.HAYHA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_TERMS,
    sourceTitle: "Hayha Terms of Use",
    sourceUrl: "https://www.hayhabots.com/tos.html",
    sourceDate: "2019-08-05",
    summary: "The published terms prohibit decompilation, reverse engineering, disassembly, and code manipulation.",
    requiresOwnerAction: true,
  }),
]);

const STELLAR_EVIDENCE = Object.freeze([
  evidence({
    id: "stellar.public-runtime",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    capability: BOT_DISCOVERY_CAPABILITIES.OBSERVE_RUNTIME,
    status: BOT_EVIDENCE_STATUSES.UNKNOWN,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_PUBLIC_SITE,
    sourceTitle: "StellarAIO 4.0 getting started guide",
    sourceUrl: "https://guides.stellaraio.com/stellar/getting-started-with-stellaraio/getting-started-with-stellaraio",
    sourceVersion: "Stellar 4.0 public guide reviewed 2026-10-17",
    summary: "Stellar documents its desktop app and first-party mobile pairing, but no third-party read/status protocol.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.public-api-review",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API,
    status: BOT_EVIDENCE_STATUSES.UNKNOWN,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_DOCUMENTATION_REVIEW,
    sourceTitle: "StellarAIO official guides",
    sourceUrl: "https://guides.stellaraio.com/stellar",
    sourceVersion: "Official guides reviewed 2026-10-17",
    summary: "No public read/status API or SDK was located in the reviewed official guides; provider confirmation is required.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.discord-webhook",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    capability: BOT_DISCOVERY_CAPABILITIES.READ_CHECKOUT_EVIDENCE,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK,
    status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "StellarAIO Settings guide",
    sourceUrl: "https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-settings-tab",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "Stellar documents Discord webhook notifications, including checkout notification settings, but not a generic Code 3 event endpoint.",
    notes: "Code 3 must not use a Discord user token or scrape private messages; provider confirmation is needed for a direct owner-controlled endpoint.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.task-group-export",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    capability: BOT_DISCOVERY_CAPABILITIES.READ_TASK_GROUPS,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
    status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "StellarAIO Tasks guide",
    sourceUrl: "https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-tasks-tab",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "The Tasks guide documents task-group import and export, creating a possible owner-selected offline review path.",
    notes: "The current overview describes file transfer without a serialized schema or version marker. The older detailed JSON import/export page is no longer available; a sanitized sample still requires review.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.profile-export",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    capability: BOT_DISCOVERY_CAPABILITIES.READ_PROFILE_METADATA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "StellarAIO profile import and export guide",
    sourceUrl: "https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-profiles-tab/how-do-i-mass-import-and-export-profiles",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "Profile CSV export is documented, but profiles include personal and payment information.",
    notes: "Profile exports are not an acceptable Code 3 pilot input.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.account-session-import",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    capability: BOT_DISCOVERY_CAPABILITIES.READ_ACCOUNT_METADATA,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "StellarAIO session import guide",
    sourceUrl: "https://guides.stellaraio.com/stellar/navigating-stellaraio/what-is-the-identities-tab/how-do-i-add-a-session-or-mass-import-sessions",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "Documented account/session import formats contain credential and verification material.",
    notes: "Session/account files are prohibited Bot Operations inputs.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.websocket-input",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE,
    status: BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_DOCUMENTATION,
    sourceTitle: "Developing Software Compatible With Stellar: WebSocket Integration",
    sourceUrl: "https://guides.stellaraio.com/stellar/developing-software-compatible-with-stellar/websocket-integration",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "Stellar officially documents connecting to an owner-provided WebSocket server for external product-monitor input.",
    notes: "This interface sends monitor input into Stellar; it is not a read/status output and is unsuitable for the first observation-only pilot.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.mobile-companion",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE,
    status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
    sourceTitle: "StellarAIO 4.0 mobile companion setup",
    sourceUrl: "https://guides.stellaraio.com/stellar/getting-started-with-stellaraio/getting-started-with-stellaraio",
    sourceVersion: "Stellar 4.0 guide reviewed 2026-10-17",
    summary: "Stellar describes QR pairing for its own mobile app and task controls while the desktop remains running.",
    notes: "First-party mobile pairing does not document a Code 3 protocol. Pairing codes are not Code 3 inputs.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.private-interface-policy",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_DOCUMENTATION_REVIEW,
    sourceTitle: "StellarAIO official integration guides",
    sourceUrl: "https://guides.stellaraio.com/stellar/developing-software-compatible-with-stellar/websocket-integration",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "Only documented interfaces are eligible; hidden or private endpoints are excluded without explicit provider authorization.",
    requiresOwnerAction: true,
  }),
  evidence({
    id: "stellar.reverse-engineering-policy",
    provider: BOT_PROVIDER_KEYS.STELLAR,
    integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE,
    status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_DOCUMENTATION_REVIEW,
    sourceTitle: "StellarAIO official integration guides",
    sourceUrl: "https://guides.stellaraio.com/stellar/developing-software-compatible-with-stellar/websocket-integration",
    sourceVersion: "Official guide reviewed 2026-10-17",
    summary: "Code 3 will use only explicitly documented interfaces; reverse-engineered mechanisms are prohibited.",
    requiresOwnerAction: true,
  }),
]);

function modeReview(mode, overrides = {}) {
  return deepFreeze({
    mode,
    availability: BOT_EVIDENCE_STATUSES.UNKNOWN,
    evidenceIds: [],
    authenticationRequirement: "UNKNOWN",
    dataAvailable: [],
    secretsRequired: null,
    readOnlyPossible: null,
    statusHistoryAvailable: null,
    taskControlAvailable: null,
    checkoutEvidenceAvailable: null,
    providerPolicyConfidence: "INSUFFICIENT",
    securityRisks: [],
    implementationComplexity: "UNKNOWN",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.PROVIDER_CONFIRMATION_REQUIRED,
    notes: "Provider confirmation is required.",
    ...overrides,
  });
}

function allModeReviews(overrides = {}) {
  return Object.values(BOT_DISCOVERY_INTEGRATION_MODES).map((mode) => modeReview(mode, overrides[mode]));
}

function capabilityReview(overrides = {}) {
  return deepFreeze(Object.fromEntries(Object.values(BOT_DISCOVERY_CAPABILITIES).map((capability) => [capability, {
    enabled: false,
    evidenceStatus: overrides[capability]?.evidenceStatus || BOT_EVIDENCE_STATUSES.UNKNOWN,
    evidenceIds: overrides[capability]?.evidenceIds || [],
    notes: overrides[capability]?.notes || "No enabled live adapter capability.",
  }])));
}

const HAYHA_MODE_REVIEWS = allModeReviews({
  [BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API]: {
    evidenceIds: ["hayha.public-api-review"],
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["hayha.webhook-settings", "hayha.snipes-discord-event"],
    authenticationRequirement: "OWNER_CONFIGURED_DISCORD_WEBHOOK",
    dataAvailable: ["QUEUE_PASS_OR_CHECKOUT_LINK_NOTIFICATION"],
    secretsRequired: true,
    readOnlyPossible: false,
    statusHistoryAvailable: false,
    taskControlAvailable: false,
    checkoutEvidenceAvailable: true,
    providerPolicyConfidence: "LOW",
    securityRisks: ["DISCORD_WEBHOOK_SECRET", "CREDENTIAL_BEARING_LINK_EXPOSURE", "UNSIGNED_EVENT_CONTRACT"],
    implementationComplexity: "HIGH",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.NOT_RECOMMENDED,
    notes: "Provider-branded public guides show Discord output, but no safe current Code 3 ingestion contract is documented.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["hayha.session-export"],
    authenticationRequirement: "OWNER_ACCOUNT",
    dataAvailable: ["SENSITIVE_SESSION_MATERIAL"],
    secretsRequired: true,
    readOnlyPossible: false,
    providerPolicyConfidence: "MEDIUM",
    securityRisks: ["SESSION_CREDENTIAL_EXPOSURE"],
    implementationComplexity: "HIGH",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    notes: "The reviewed export is secret-bearing and is prohibited as a Code 3 input.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["hayha.cli-interface"],
    authenticationRequirement: "OWNER_OPERATED_CLIENT",
    dataAvailable: ["OWNER_CLI_CONTROL"],
    secretsRequired: null,
    readOnlyPossible: false,
    statusHistoryAvailable: false,
    taskControlAvailable: true,
    providerPolicyConfidence: "MEDIUM",
    securityRisks: ["UNSUPPORTED_CONTROL_AUTOMATION"],
    implementationComplexity: "HIGH",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    notes: "The CLI is for owner operation; automating its input is outside this integration design.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API]: {
    availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceIds: ["hayha.private-interface-policy"],
    providerPolicyConfidence: "HIGH",
    securityRisks: ["TERMS_VIOLATION", "AUTHORITY_BYPASS"],
    implementationComplexity: "PROHIBITED",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    notes: "Undocumented/private APIs must not be inspected or called.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE]: {
    availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceIds: ["hayha.reverse-engineering-policy"],
    providerPolicyConfidence: "HIGH",
    securityRisks: ["TERMS_VIOLATION", "BINARY_OR_TRAFFIC_REVERSE_ENGINEERING"],
    implementationComplexity: "PROHIBITED",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    notes: "Reverse engineering is prohibited.",
  },
});

const STELLAR_MODE_REVIEWS = allModeReviews({
  [BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API]: {
    evidenceIds: ["stellar.public-api-review"],
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["stellar.discord-webhook"],
    authenticationRequirement: "OWNER_CONFIGURED_DISCORD_WEBHOOK",
    dataAvailable: ["CHECKOUT_NOTIFICATIONS", "FAILED_CHECKOUT_NOTIFICATIONS"],
    secretsRequired: true,
    readOnlyPossible: true,
    statusHistoryAvailable: false,
    taskControlAvailable: false,
    checkoutEvidenceAvailable: true,
    providerPolicyConfidence: "MEDIUM",
    securityRisks: ["DISCORD_WEBHOOK_SECRET", "PRIVATE_MESSAGE_SCRAPING_PROHIBITED"],
    implementationComplexity: "MEDIUM",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.PROVIDER_CONFIRMATION_REQUIRED,
    notes: "The documented destination is Discord; direct Code 3 delivery requires provider confirmation.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["stellar.task-group-export", "stellar.profile-export", "stellar.account-session-import"],
    authenticationRequirement: "OWNER_SELECTED_FILE",
    dataAvailable: ["TASK_GROUP_EXPORT", "PROFILE_EXPORT", "ACCOUNT_SESSION_FORMAT"],
    secretsRequired: null,
    readOnlyPossible: true,
    statusHistoryAvailable: null,
    taskControlAvailable: false,
    checkoutEvidenceAvailable: null,
    providerPolicyConfidence: "MEDIUM",
    securityRisks: ["SECRET_OR_PII_BUNDLING", "SCHEMA_UNVERIFIED"],
    implementationComplexity: "MEDIUM",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.OFFLINE_CANDIDATE,
    notes: "Only a synthetic or sanitized task-group export may be evaluated; profile and account/session files are prohibited.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_LOCAL_INTERFACE]: {
    availability: BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED,
    evidenceIds: ["stellar.websocket-input"],
    authenticationRequirement: "OWNER_CONFIGURED_SHARED_KEY",
    dataAvailable: ["EXTERNAL_PRODUCT_MONITOR_INPUT"],
    secretsRequired: true,
    readOnlyPossible: false,
    statusHistoryAvailable: false,
    taskControlAvailable: null,
    checkoutEvidenceAvailable: false,
    providerPolicyConfidence: "HIGH",
    securityRisks: ["INPUT_CAN_TRIGGER_BOT_BEHAVIOR", "SHARED_KEY_HANDLING"],
    implementationComplexity: "MEDIUM",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.NOT_RECOMMENDED,
    notes: "This input interface does not satisfy an observation-only status pilot.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["stellar.task-group-export"],
    authenticationRequirement: "OWNER_SELECTED_FILE",
    dataAvailable: ["SANITIZED_TASK_GROUP_EXPORT_CANDIDATE"],
    secretsRequired: false,
    readOnlyPossible: true,
    statusHistoryAvailable: null,
    taskControlAvailable: false,
    checkoutEvidenceAvailable: null,
    providerPolicyConfidence: "MEDIUM",
    securityRisks: ["UNVERIFIED_EXPORT_SCHEMA", "SECRET_OR_PII_BUNDLING"],
    implementationComplexity: "LOW",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.OFFLINE_CANDIDATE,
    notes: "This is the only current candidate, and only for a sanitized preview with no live bot connection.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.MANUAL_IMPORT]: {
    availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    evidenceIds: ["stellar.task-group-export"],
    authenticationRequirement: "OWNER_SELECTED_FILE",
    dataAvailable: ["SANITIZED_TASK_GROUP_METADATA"],
    secretsRequired: false,
    readOnlyPossible: true,
    statusHistoryAvailable: null,
    taskControlAvailable: false,
    checkoutEvidenceAvailable: null,
    providerPolicyConfidence: "MEDIUM",
    securityRisks: ["UNVERIFIED_EXPORT_SCHEMA"],
    implementationComplexity: "LOW",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.OFFLINE_CANDIDATE,
    notes: "A dry-run sanitizer and owner review are prerequisites.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API]: {
    availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceIds: ["stellar.private-interface-policy"],
    providerPolicyConfidence: "INSUFFICIENT",
    securityRisks: ["UNDOCUMENTED_INTERFACE", "AUTHORITY_BYPASS"],
    implementationComplexity: "PROHIBITED",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    notes: "Undocumented/private APIs must not be inspected or called.",
  },
  [BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE]: {
    availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
    evidenceIds: ["stellar.reverse-engineering-policy"],
    providerPolicyConfidence: "INSUFFICIENT",
    securityRisks: ["REVERSE_ENGINEERING", "LICENSE_OR_SECURITY_BYPASS"],
    implementationComplexity: "PROHIBITED",
    recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    notes: "Reverse-engineered mechanisms are prohibited without explicit provider authorization.",
  },
});

function reviewedProvider(provider, { sourceTitle, sourceUrl, summary, additionalEvidence = [], modes = {}, capabilities = {}, webhookStatus, exportStatus } = {}) {
  const catalog = BOT_PROVIDER_CATALOG[provider];
  const publicReviewId = `${provider.toLowerCase()}.public-interface-review`;
  return {
    provider,
    reviewedAt: REVIEWED_AT,
    evidenceStatus: additionalEvidence.length ? BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED : BOT_EVIDENCE_STATUSES.UNKNOWN,
    pilotReadiness: BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET,
    liveCapabilitiesEnabled: false,
    providerNetworkAccess: false,
    officialApiStatus: BOT_EVIDENCE_STATUSES.UNKNOWN,
    webhookStatus: webhookStatus || BOT_EVIDENCE_STATUSES.UNKNOWN,
    exportStatus: exportStatus || BOT_EVIDENCE_STATUSES.UNKNOWN,
    localInterfaceStatus: BOT_EVIDENCE_STATUSES.UNKNOWN,
    recommendedMode: null,
    recommendation: catalog.setup.nextStep,
    capabilities: capabilityReview(capabilities),
    integrationModes: allModeReviews({
      [BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API]: { evidenceIds: [publicReviewId] },
      [BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API]: {
        availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
        recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
        implementationComplexity: "PROHIBITED",
        notes: "Code 3 does not inspect or call undocumented private provider endpoints.",
      },
      [BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE]: {
        availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
        recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
        implementationComplexity: "PROHIBITED",
        notes: "Code 3 does not reverse engineer provider software or network traffic.",
      },
      ...modes,
    }),
    evidence: [evidence({
      id: publicReviewId,
      provider,
      integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.OFFICIAL_API,
      status: BOT_EVIDENCE_STATUSES.UNKNOWN,
      evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_PUBLIC_SITE,
      sourceTitle,
      sourceUrl,
      sourceVersion: "Public provider source reviewed 2026-10-17",
      summary,
      requiresOwnerAction: true,
    }), ...additionalEvidence.map((item) => evidence({
      provider,
      evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_GUIDE,
      sourceVersion: "Public provider source reviewed 2026-10-17",
      requiresOwnerAction: true,
      ...item,
    }))],
  };
}

const DISCOVERY_REGISTRY = deepFreeze({
  [BOT_PROVIDER_KEYS.HAYHA]: {
    provider: BOT_PROVIDER_KEYS.HAYHA,
    reviewedAt: REVIEWED_AT,
    evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    pilotReadiness: BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET,
    liveCapabilitiesEnabled: false,
    providerNetworkAccess: false,
    officialApiStatus: BOT_EVIDENCE_STATUSES.UNKNOWN,
    webhookStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    exportStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    localInterfaceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    recommendedMode: null,
    recommendation: "No safe read/status pilot is supported by the reviewed public evidence.",
    capabilities: capabilityReview({
      [BOT_DISCOVERY_CAPABILITIES.READ_CHECKOUT_EVIDENCE]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["hayha.snipes-discord-event"],
        notes: "A provider-branded guide describes Discord output, but no live Code 3 read capability is enabled.",
      },
    }),
    integrationModes: HAYHA_MODE_REVIEWS,
    evidence: HAYHA_EVIDENCE,
  },
  [BOT_PROVIDER_KEYS.STELLAR]: {
    provider: BOT_PROVIDER_KEYS.STELLAR,
    reviewedAt: REVIEWED_AT,
    evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    pilotReadiness: BOT_PILOT_READINESS.OFFLINE_REVIEW_CANDIDATE,
    liveCapabilitiesEnabled: false,
    providerNetworkAccess: false,
    officialApiStatus: BOT_EVIDENCE_STATUSES.UNKNOWN,
    webhookStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    exportStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    localInterfaceStatus: BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED,
    recommendedMode: BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT,
    recommendation: "Review a synthetic or sanitized task-group export offline before considering any pilot.",
    capabilities: capabilityReview({
      [BOT_DISCOVERY_CAPABILITIES.READ_TASK_GROUPS]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["stellar.task-group-export"],
        notes: "A documented export exists, but its safe schema is not yet verified.",
      },
      [BOT_DISCOVERY_CAPABILITIES.READ_TASKS]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["stellar.task-group-export"],
        notes: "Task data may be present in owner exports; no live read capability is enabled.",
      },
      [BOT_DISCOVERY_CAPABILITIES.READ_CHECKOUT_EVIDENCE]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["stellar.discord-webhook"],
        notes: "Discord checkout notifications are documented, but no direct Code 3 endpoint is verified.",
      },
      [BOT_DISCOVERY_CAPABILITIES.READ_ACCOUNT_METADATA]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
        evidenceIds: ["stellar.account-session-import"],
        notes: "The reviewed account/session format is secret-bearing and prohibited.",
      },
      [BOT_DISCOVERY_CAPABILITIES.READ_PROFILE_METADATA]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
        evidenceIds: ["stellar.profile-export"],
        notes: "The documented profile export contains personal/payment data and is not a pilot input.",
      },
    }),
    integrationModes: STELLAR_MODE_REVIEWS,
    evidence: STELLAR_EVIDENCE,
  },
  [BOT_PROVIDER_KEYS.SHIKARI]: reviewedProvider(BOT_PROVIDER_KEYS.SHIKARI, {
    sourceTitle: "Shikari public support page",
    sourceUrl: "https://shikari.tech/support/",
    summary: "The public support page directs members to its Discord and support channels. No public status or order API contract was verified.",
  }),
  [BOT_PROVIDER_KEYS.VALOR]: reviewedProvider(BOT_PROVIDER_KEYS.VALOR, {
    sourceTitle: "Valor public Settings guide",
    sourceUrl: "https://docs.valoraio.com/initial-setup/settings",
    summary: "The Settings guide documents notification and backup controls, without a public third-party status or order API contract.",
    webhookStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    additionalEvidence: [{
      id: "valor.discord-notifications",
      integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK,
      status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
      sourceTitle: "Valor Settings notification destinations",
      sourceUrl: "https://docs.valoraio.com/initial-setup/settings",
      summary: "Valor documents Discord destinations for successful, failed, and miscellaneous notifications; a generic Code 3 endpoint and event schema are unverified.",
    }, {
      id: "valor.profile-export",
      integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
      status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
      sourceTitle: "Valor Profiles guide",
      sourceUrl: "https://docs.valoraio.com/initial-setup/profiles",
      summary: "The documented profile CSV contains personal and payment fields. It is not a safe status or order import.",
    }],
    modes: {
      [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_WEBHOOK]: {
        availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["valor.discord-notifications"],
        authenticationRequirement: "OWNER_CONFIGURED_DISCORD_WEBHOOK",
        dataAvailable: ["DISCORD_NOTIFICATIONS"],
        secretsRequired: true,
        taskControlAvailable: false,
        securityRisks: ["DIRECT_DESTINATION_UNVERIFIED", "EVENT_SCHEMA_UNVERIFIED"],
        notes: "Discord notification settings do not establish an authenticated Code 3 receiver.",
      },
      [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT]: {
        availability: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
        evidenceIds: ["valor.profile-export"],
        secretsRequired: true,
        recommendationStatus: BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
        notes: "Profile files and full app backups are outside the Code 3 metadata boundary.",
      },
    },
  }),
  [BOT_PROVIDER_KEYS.REFRACT]: reviewedProvider(BOT_PROVIDER_KEYS.REFRACT, {
    sourceTitle: "Refract dashboard Home guide",
    sourceUrl: "https://help.refractbot.com/online-dashboard/home",
    summary: "The guide documents a checkout-history CSV export but does not establish a status API or a stable CSV header, date, and currency contract.",
    exportStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    additionalEvidence: [{
      id: "refract.checkout-history-export",
      capability: BOT_DISCOVERY_CAPABILITIES.READ_HISTORY,
      integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
      status: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
      sourceTitle: "Refract checkout history CSV export",
      sourceUrl: "https://help.refractbot.com/online-dashboard/home",
      summary: "Checkout history includes product, price, account, profile, date, and order number. Export CSV is documented; Code 3 compatibility is not verified.",
      notes: "A sanitized sample and precise format review are needed. Full app backups are not order exports and are not accepted.",
    }],
    modes: {
      [BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT]: {
        availability: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["refract.checkout-history-export"],
        authenticationRequirement: "OWNER_SELECTED_FILE",
        dataAvailable: ["CHECKOUT_HISTORY_CSV"],
        readOnlyPossible: true,
        statusHistoryAvailable: true,
        taskControlAvailable: false,
        checkoutEvidenceAvailable: true,
        securityRisks: ["CSV_SCHEMA_UNVERIFIED", "ACCOUNT_AND_PROFILE_INFORMATION"],
        notes: "A documented export does not prove Code 3 compatibility. No CSV importer or live connection is enabled.",
      },
    },
    capabilities: {
      [BOT_DISCOVERY_CAPABILITIES.READ_HISTORY]: {
        evidenceStatus: BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
        evidenceIds: ["refract.checkout-history-export"],
        notes: "Manual CSV export is documented, but no Code 3 history adapter is enabled.",
      },
    },
  }),
  [BOT_PROVIDER_KEYS.POLAR]: reviewedProvider(BOT_PROVIDER_KEYS.POLAR, {
    sourceTitle: "Polar AIO creator storefront",
    sourceUrl: "https://whop.com/polar-aio/products/polar-aio/",
    summary: "The creator storefront describes a retail bot, without a published status, order, export, or task-control interface. Whop billing APIs are a separate product.",
  }),
  [BOT_PROVIDER_KEYS.SNIPED]: reviewedProvider(BOT_PROVIDER_KEYS.SNIPED, {
    sourceTitle: "Sniped retail bot public website",
    sourceUrl: "https://sniped.gg/",
    summary: "The public site identifies the retail bot. No public integration schema, authentication, status, or order interface was verified.",
  }),
  [BOT_PROVIDER_KEYS.SWOOPER]: reviewedProvider(BOT_PROVIDER_KEYS.SWOOPER, {
    sourceTitle: "Swooper AIO public alerts page",
    sourceUrl: "https://swooperhq.com/features/drop-alerts",
    summary: "Swooper describes alerts in its own members-only Discord and iOS app. No third-party status API or direct Code 3 event contract was verified.",
    additionalEvidence: [{
      id: "swooper.reverse-engineering-policy",
      integrationMode: BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE,
      status: BOT_EVIDENCE_STATUSES.DO_NOT_USE,
      evidenceType: BOT_EVIDENCE_TYPES.OFFICIAL_TERMS,
      sourceTitle: "Swooper Terms of Service",
      sourceUrl: "https://swooperhq.com/terms",
      sourceDate: "2026-08-06",
      summary: "The published terms prohibit reverse engineering and software redistribution. First-party app features do not establish an integration contract.",
    }],
  }),
});

export function listBotProviderDiscovery(providerKey = null) {
  if (providerKey == null || providerKey === "") return Object.values(DISCOVERY_REGISTRY).map(clone);
  const discovery = getBotProviderDiscovery(providerKey);
  return discovery ? [discovery] : [];
}

export function getBotProviderDiscovery(providerKey) {
  const discovery = DISCOVERY_REGISTRY[String(providerKey || "").toUpperCase()];
  return discovery ? clone(discovery) : null;
}

export function getBotProviderDiscoverySummary(providerKey) {
  const discovery = DISCOVERY_REGISTRY[String(providerKey || "").toUpperCase()];
  if (!discovery) return null;
  return clone({
    reviewedAt: discovery.reviewedAt,
    evidenceStatus: discovery.evidenceStatus,
    pilotReadiness: discovery.pilotReadiness,
    liveCapabilitiesEnabled: false,
    providerNetworkAccess: false,
    officialApiStatus: discovery.officialApiStatus,
    webhookStatus: discovery.webhookStatus,
    exportStatus: discovery.exportStatus,
    localInterfaceStatus: discovery.localInterfaceStatus,
    recommendedMode: discovery.recommendedMode,
    evidenceCount: discovery.evidence.length,
  });
}

/**
 * Evaluate discovery evidence without granting provider access. Even a fully
 * evidenced result only becomes eligible for a separately authorized pilot;
 * it never changes the live registry, adapter, network, or persistence state.
 */
export function calculateBotPilotReadiness(discoveryInput) {
  const provider = isRegisteredBotProvider(discoveryInput?.provider)
    ? String(discoveryInput.provider).toUpperCase()
    : null;
  const modes = Array.isArray(discoveryInput?.integrationModes) ? discoveryInput.integrationModes : [];
  const prohibited = new Set([
    BOT_DISCOVERY_INTEGRATION_MODES.UNSUPPORTED_PRIVATE_API,
    BOT_DISCOVERY_INTEGRATION_MODES.REVERSE_ENGINEERED_INTERFACE,
  ]);
  const liveCandidate = provider ? modes.find((review) => (
    review
    && Object.values(BOT_DISCOVERY_INTEGRATION_MODES).includes(review.mode)
    && !prohibited.has(review.mode)
    && review.availability === BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED
    && review.readOnlyPossible === true
    && review.statusHistoryAvailable === true
    && review.taskControlAvailable === false
    && review.secretsRequired === false
    && Array.isArray(review.securityRisks)
    && review.securityRisks.length === 0
    && ![
      BOT_DISCOVERY_RECOMMENDATION_STATUSES.NOT_RECOMMENDED,
      BOT_DISCOVERY_RECOMMENDATION_STATUSES.DO_NOT_USE,
    ].includes(review.recommendationStatus)
  )) : null;
  const offlineCandidate = provider ? modes.find((review) => (
    review
    && [
      BOT_DISCOVERY_INTEGRATION_MODES.OWNER_FILE_IMPORT,
      BOT_DISCOVERY_INTEGRATION_MODES.MANUAL_IMPORT,
      BOT_DISCOVERY_INTEGRATION_MODES.DOCUMENTED_EXPORT,
    ].includes(review.mode)
    && [
      BOT_EVIDENCE_STATUSES.VERIFIED_SUPPORTED,
      BOT_EVIDENCE_STATUSES.DOCUMENTED_BUT_LIMITED,
    ].includes(review.availability)
    && review.readOnlyPossible === true
    && review.taskControlAvailable === false
    && review.secretsRequired === false
    && review.recommendationStatus === BOT_DISCOVERY_RECOMMENDATION_STATUSES.OFFLINE_CANDIDATE
  )) : null;

  return deepFreeze({
    provider,
    readiness: liveCandidate
      ? BOT_PILOT_READINESS.ELIGIBLE_FOR_SEPARATE_AUTHORIZATION
      : offlineCandidate
        ? BOT_PILOT_READINESS.OFFLINE_REVIEW_CANDIDATE
        : BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET,
    eligibleForSeparateAuthorization: Boolean(liveCandidate),
    livePilotRecommended: false,
    liveCandidateMode: liveCandidate?.mode || null,
    offlineCandidateMode: offlineCandidate?.mode || null,
    requiresSeparateAuthorization: true,
    live: false,
    networkAccess: false,
  });
}

export function recommendFirstBotPilot() {
  const assessments = Object.values(DISCOVERY_REGISTRY).map(calculateBotPilotReadiness);
  const eligibleAssessment = assessments.find(({ eligibleForSeparateAuthorization }) => eligibleForSeparateAuthorization) || null;
  const offlineAssessment = assessments.find(({ offlineCandidateMode }) => offlineCandidateMode) || null;
  return clone({
    readiness: eligibleAssessment
      ? BOT_PILOT_READINESS.ELIGIBLE_FOR_SEPARATE_AUTHORIZATION
      : BOT_PILOT_READINESS.NO_LIVE_BOT_PILOT_YET,
    livePilotRecommended: false,
    provider: eligibleAssessment?.provider || null,
    integrationMode: eligibleAssessment?.liveCandidateMode || null,
    requiresSeparateAuthorization: true,
    live: false,
    networkAccess: false,
    offlineCandidate: offlineAssessment ? {
      provider: offlineAssessment.provider,
      integrationMode: offlineAssessment.offlineCandidateMode,
      scope: "SYNTHETIC_OR_SANITIZED_TASK_GROUP_EXPORT_PREVIEW",
    } : null,
    prerequisites: [
      "PROVIDER_CONFIRMATION_OR_SAFE_SYNTHETIC_EXPORT_SCHEMA",
      "SECRET_AND_PII_SANITIZER",
      "DRY_RUN_ONLY_IMPORT_PREVIEW",
      "OWNER_SELECTED_FILE_AND_REVIEW",
      "NO_BOT_NETWORK_OR_TASK_CONTROL",
    ],
    reasons: [
      "NO_DOCUMENTED_PUBLIC_READ_STATUS_API",
      "DISCORD_WEBHOOK_PATH_IS_LIMITED",
      "STELLAR_TASK_EXPORT_REQUIRES_CONTENT_REVIEW",
      "HAYHA_SAFE_STATUS_EXPORT_NOT_VERIFIED",
    ],
  });
}
