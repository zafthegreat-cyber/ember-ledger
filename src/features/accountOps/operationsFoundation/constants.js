import { BOT_PROVIDER_CATALOG } from "../../botOps/providerCatalog.js";

export const ACCOUNT_OPS_OPERATIONS_CONTRACT_VERSION = "code3.account-ops.operations-foundation.v1";

export const ACCOUNT_OPS_OPERATING_AREAS = Object.freeze([
  Object.freeze({ key: "overview", label: "Overview", description: "Readiness, attention, and recent local activity." }),
  Object.freeze({ key: "accounts", label: "Accounts", description: "Retailer account drafts, health, and duplicate warnings." }),
  Object.freeze({ key: "identity", label: "Identity", description: "Email aliases, phone references, and reusable profiles." }),
  Object.freeze({ key: "payment", label: "Payment Metadata", description: "Nonsecret virtual-card and billing references only." }),
  Object.freeze({ key: "network", label: "Network", description: "Credential-free proxy-group readiness metadata." }),
  Object.freeze({ key: "verification", label: "Verification", description: "Human-controlled CAPTCHA, MFA, email, and SMS actions." }),
  Object.freeze({ key: "automation", label: "Automation", description: "Provider readiness and webhook metadata without live control." }),
  Object.freeze({ key: "orders", label: "Orders", description: "Read-only relationships from order evidence through Inventory." }),
  Object.freeze({ key: "infrastructure", label: "Infrastructure", description: "Server, cloud-template, and remote-workspace metadata." }),
  Object.freeze({ key: "activity", label: "Activity", description: "Attention, history, notifications, and private search." }),
]);

export const ACCOUNT_CREATION_STATES = Object.freeze({
  DRAFT: "DRAFT",
  READY: "READY",
  SIGNUP_OPEN: "SIGNUP_OPEN",
  WAITING_FOR_CAPTCHA: "WAITING_FOR_CAPTCHA",
  WAITING_FOR_MFA: "WAITING_FOR_MFA",
  WAITING_FOR_EMAIL: "WAITING_FOR_EMAIL",
  WAITING_FOR_SMS: "WAITING_FOR_SMS",
  WAITING_FOR_TERMS: "WAITING_FOR_TERMS",
  VERIFYING: "VERIFYING",
  ACTIVE: "ACTIVE",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
  FAILED: "FAILED",
  DISABLED: "DISABLED",
});

export const ACCOUNT_HEALTH_CENTER_STATES = Object.freeze({
  HEALTHY: "HEALTHY",
  NEEDS_VERIFICATION: "NEEDS_VERIFICATION",
  PASSWORD_RESET_REQUIRED: "PASSWORD_RESET_REQUIRED",
  EMAIL_UNVERIFIED: "EMAIL_UNVERIFIED",
  PHONE_UNVERIFIED: "PHONE_UNVERIFIED",
  MFA_REQUIRED: "MFA_REQUIRED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  LOCKED: "LOCKED",
  DISABLED: "DISABLED",
  UNKNOWN: "UNKNOWN",
});

export const VERIFICATION_ACTION_KINDS = Object.freeze({
  CAPTCHA: "CAPTCHA",
  MFA: "MFA",
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  SMS_VERIFICATION: "SMS_VERIFICATION",
  SECURITY_PROMPT: "SECURITY_PROMPT",
  TERMS: "TERMS",
  PASSWORD_RESET: "PASSWORD_RESET",
});

export const VERIFICATION_ACTION_STATES = Object.freeze({
  ACTION_REQUIRED: "ACTION_REQUIRED",
  WAITING: "WAITING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

export const CAPTCHA_CHALLENGE_STATES = Object.freeze({
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  WAITING_FOR_USER: "WAITING_FOR_USER",
  CHALLENGE_OPEN: "CHALLENGE_OPEN",
  SOLVED: "SOLVED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});

export const PHONE_RESOURCE_STATES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  ASSIGNED: "ASSIGNED",
  WAITING_FOR_VERIFICATION: "WAITING_FOR_VERIFICATION",
  VERIFIED: "VERIFIED",
  EXPIRED: "EXPIRED",
  RELEASED: "RELEASED",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
});

export const PAYMENT_METADATA_STATES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  ASSIGNED: "ASSIGNED",
  PAUSED: "PAUSED",
  EXPIRED: "EXPIRED",
  CLOSED: "CLOSED",
  UNKNOWN: "UNKNOWN",
});

export const PROXY_GROUP_HEALTH_STATES = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  EXPIRED: "EXPIRED",
  UNKNOWN: "UNKNOWN",
});

export const EXPORT_READINESS_STATES = Object.freeze({
  NOT_READY: "NOT_READY",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  PARTIALLY_SUPPORTED: "PARTIALLY_SUPPORTED",
  READY_FOR_PREVIEW: "READY_FOR_PREVIEW",
  UNSUPPORTED: "UNSUPPORTED",
});

export const EXPORT_SCHEMA_STATES = Object.freeze({
  UNVERIFIED: "UNVERIFIED",
  PARTIALLY_VERIFIED: "PARTIALLY_VERIFIED",
  VERIFIED: "VERIFIED",
  UNSUPPORTED: "UNSUPPORTED",
});

export const UNIFIED_ORDER_STATES = Object.freeze({
  ORDERED: "ORDERED",
  PROCESSING: "PROCESSING",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  SHIPPED: "SHIPPED",
  PARTIALLY_SHIPPED: "PARTIALLY_SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  RETURN_STARTED: "RETURN_STARTED",
  RETURNED: "RETURNED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  UNKNOWN: "UNKNOWN",
});

export const WEBHOOK_DIRECTIONS = Object.freeze({ INBOUND: "INBOUND", OUTBOUND: "OUTBOUND", BIDIRECTIONAL: "BIDIRECTIONAL" });
export const WEBHOOK_HEALTH_STATES = Object.freeze({ NOT_CONFIGURED: "NOT_CONFIGURED", HEALTHY: "HEALTHY", DEGRADED: "DEGRADED", DISABLED: "DISABLED", UNKNOWN: "UNKNOWN" });

export const SERVER_STATES = Object.freeze({
  OFFLINE: "OFFLINE",
  ONLINE: "ONLINE",
  DEGRADED: "DEGRADED",
  STARTING: "STARTING",
  STOPPING: "STOPPING",
  UNKNOWN: "UNKNOWN",
});

export const REMOTE_ACCESS_STATES = Object.freeze({ CLOSED: "CLOSED", AVAILABLE: "AVAILABLE", CONNECTING: "CONNECTING", ACTIVE: "ACTIVE", DEGRADED: "DEGRADED", UNKNOWN: "UNKNOWN" });
export const BROWSER_WORKSPACE_STATES = Object.freeze({ CLOSED: "CLOSED", OPEN: "OPEN", PAUSED: "PAUSED", NEEDS_ATTENTION: "NEEDS_ATTENTION", UNKNOWN: "UNKNOWN" });

export const ATTENTION_PRIORITIES = Object.freeze({ CRITICAL: "CRITICAL", HIGH: "HIGH", NORMAL: "NORMAL", INFO: "INFO" });
export const NOTIFICATION_CATEGORIES = Object.freeze(["VERIFICATION", "ACCOUNTS", "BOTS", "ORDERS", "SERVERS", "BUSINESS"]);
export const NOTIFICATION_CHANNELS = Object.freeze(["IN_APP", "PUSH", "EMAIL", "WEBHOOK"]);

export const WORKSPACE_REFERENCE_TYPES = Object.freeze({
  BOT: "BOT",
  BOT_TASK: "BOT_TASK",
  PURCHASE: "PURCHASE",
  INVENTORY: "INVENTORY",
  RECEIVING_DISCREPANCY: "RECEIVING_DISCREPANCY",
  ACCOUNTANT_REVIEW: "ACCOUNTANT_REVIEW",
});

export const ACCOUNT_OPS_PROVIDER_EXPORTS = Object.freeze(
  Object.values(BOT_PROVIDER_CATALOG).map(({ providerKey, setup }) => Object.freeze({
    provider: providerKey,
    readinessState: EXPORT_READINESS_STATES.NOT_READY,
    schemaState: EXPORT_SCHEMA_STATES.UNVERIFIED,
    note: `No verified Code 3 outbound export format. ${setup.nextStep}`,
  })),
);

export const ACCOUNT_OPS_CLOUD_TEMPLATES = Object.freeze([
  Object.freeze({ id: "cloud-template:bot-runner", templateLabel: "Bot runner", purpose: "Future owner-managed bot runner", sizeClass: "TO_BE_SELECTED", diskGb: null, recommendedBotCapacity: null }),
  Object.freeze({ id: "cloud-template:lightweight-monitor", templateLabel: "Lightweight monitor", purpose: "Future status and alert monitor", sizeClass: "TO_BE_SELECTED", diskGb: null, recommendedBotCapacity: null }),
  Object.freeze({ id: "cloud-template:automation-worker", templateLabel: "Automation worker", purpose: "Future reviewed automation worker", sizeClass: "TO_BE_SELECTED", diskGb: null, recommendedBotCapacity: null }),
]);

export const ACCOUNT_OPS_AUTOMATION_BOUNDARIES = Object.freeze({
  liveRetailerAccountCreation: false,
  automaticCaptchaSolving: false,
  automaticMfa: false,
  liveMailboxConnection: false,
  liveBotConnection: false,
  providerExportWrite: false,
  webhookEndpointConfiguration: false,
  serverProvisioning: false,
  remoteAccessConnection: false,
  browserFingerprintEvasion: false,
  secretStorage: false,
  remotePersistence: false,
  productionMutation: false,
});
