import {
  ACCOUNT_SETUP_STAGES,
  ACCOUNT_TASK_PRIORITIES,
  ACCOUNT_TASK_STATUSES,
  ACCOUNT_TASK_TYPES,
  ALIAS_PROVISIONING_STATES,
  CREDENTIAL_REFERENCE_PROVIDERS,
  EMAIL_ALIAS_STATUSES,
  EMAIL_DOMAIN_MODES,
  EMAIL_DOMAIN_STATUSES,
  RECORD_STATUS,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
} from "../constants.js";
import { deriveAccountHealth, summarizeAccountOps } from "../accountHealth.js";
import { createEmptyAccountOpsState, normalizeAccountOpsState } from "../repository.js";
import { retailerDirectory } from "../retailerDirectory.js";

export const PHASE_2A_QA_NOW = "2026-08-26T14:00:00.000Z";
const DAY = 86_400_000;
const ago = (days) => new Date(Date.parse(PHASE_2A_QA_NOW) - days * DAY).toISOString();
const metadata = (id, overrides = {}) => ({
  id,
  recordVersion: 1,
  createdAt: ago(10),
  updatedAt: ago(1),
  archivedAt: null,
  ...overrides,
});
const profile = (id = "profile:business-01", overrides = {}) => ({
  ...metadata(id),
  displayName: "Business 01",
  aliasLabel: "business01",
  profileGroupId: "profile-group-preset:business",
  fullName: "",
  businessName: "Example business profile",
  emailPreference: "Use the connected alias",
  phone: "",
  shippingAddress: null,
  billingAddress: null,
  notes: "",
  status: RECORD_STATUS.ACTIVE,
  ...overrides,
});
const domain = (overrides = {}) => ({
  ...metadata("emailDomains:example"),
  domain: "example.test",
  mode: EMAIL_DOMAIN_MODES.CATCH_ALL,
  providerId: "owner-catch-all",
  status: EMAIL_DOMAIN_STATUSES.OWNER_CONFIRMED,
  catchAllOwnerConfirmedAt: ago(9),
  notes: "Deterministic QA metadata only.",
  ...overrides,
});
const alias = (id = "emailAliases:business-01", overrides = {}) => ({
  ...metadata(id),
  aliasAddress: "target-business01-x7k2@example.test",
  domain: "example.test",
  localPart: "target-business01-x7k2",
  domainId: "emailDomains:example",
  profileId: "profile:business-01",
  retailerId: "retailer-preset:target",
  purpose: "Retailer account",
  status: EMAIL_ALIAS_STATUSES.ACTIVE,
  disabledAt: null,
  provider: "owner-catch-all",
  providerExternalId: "",
  forwardingDestinationMetadata: {},
  verificationState: VERIFICATION_STATES.VERIFIED,
  provisioningState: ALIAS_PROVISIONING_STATES.RECEIVING_CONFIRMED,
  provenance: "OWNER_ENTERED",
  notes: "",
  ...overrides,
});
const credentialReference = () => ({
  provider: CREDENTIAL_REFERENCE_PROVIDERS.EXTERNAL_PASSWORD_MANAGER,
  referenceId: "vault-item:qa-reference",
  label: "External vault item",
  lastUpdatedAt: ago(2),
});
const account = (id = "storeAccounts:target-business-01", overrides = {}) => ({
  ...metadata(id),
  retailerId: "retailer-preset:target",
  profileId: "profile:business-01",
  aliasId: "emailAliases:business-01",
  username: "target-business01-x7k2@example.test",
  accountDisplayName: "Business 01",
  status: STORE_ACCOUNT_STATUSES.READY,
  emailVerificationStatus: VERIFICATION_STATES.VERIFIED,
  phoneVerificationStatus: VERIFICATION_STATES.NOT_REQUIRED,
  securityStatus: "HEALTHY",
  setupStage: ACCOUNT_SETUP_STAGES.READY,
  phoneVerificationRequired: false,
  lastVerifiedAt: ago(1),
  lastLoginAt: null,
  lastOrderAt: null,
  notes: "",
  credentialReference: credentialReference(),
  externalIdentity: {},
  ownerConfirmedReadyAt: ago(1),
  ...overrides,
});
const task = (id, overrides = {}) => ({
  ...metadata(id),
  type: ACCOUNT_TASK_TYPES.COMPLETE_SETUP,
  title: "Complete retailer setup",
  status: ACCOUNT_TASK_STATUSES.OPEN,
  priority: ACCOUNT_TASK_PRIORITIES.NORMAL,
  dueAt: ago(-2),
  profileId: "profile:business-01",
  accountId: "storeAccounts:target-business-01",
  retailerId: "retailer-preset:target",
  source: "OWNER",
  notes: "",
  completedAt: null,
  ...overrides,
});
const customRetailer = (id = "retailers:local-shop", overrides = {}) => ({
  ...metadata(id),
  displayName: "Local Card Shop With A Deliberately Long Name",
  website: "https://retailer.example/",
  signupUrl: null,
  accountUrl: null,
  orderHistoryUrl: null,
  notes: "Custom QA retailer.",
  iconMetadata: {},
  capabilities: ["MANUAL_OWNER_ASSISTED_SETUP"],
  accountRulesMetadata: {},
  automatedProvisioningSupported: false,
  custom: true,
  status: RECORD_STATUS.ACTIVE,
  ...overrides,
});

function baseWithHealthyAccount() {
  const state = createEmptyAccountOpsState(() => PHASE_2A_QA_NOW);
  state.profiles.push(profile());
  state.emailDomains.push(domain());
  state.emailAliases.push(alias());
  state.storeAccounts.push(account());
  return state;
}

function buildState(id) {
  const state = id === "empty-account-ops" ? createEmptyAccountOpsState(() => PHASE_2A_QA_NOW) : baseWithHealthyAccount();
  switch (id) {
    case "empty-account-ops": break;
    case "healthy-profile-account": break;
    case "multiple-retailers": {
      state.retailers.push(customRetailer());
      state.storeAccounts.push(account("storeAccounts:local-business-01", { retailerId: "retailers:local-shop", aliasId: null, username: "business01", accountDisplayName: "Local shop account" }));
      break;
    }
    case "alias-generated-not-provisioned":
      state.emailAliases[0] = alias("emailAliases:generated", { status: EMAIL_ALIAS_STATUSES.PENDING, verificationState: VERIFICATION_STATES.UNKNOWN, provisioningState: ALIAS_PROVISIONING_STATES.GENERATED_LOCAL, provenance: "GENERATED_LOCAL" });
      state.storeAccounts = [];
      break;
    case "alias-provisioned-metadata":
      state.emailAliases[0] = alias("emailAliases:provisioned", { provider: "future-provider-metadata", providerExternalId: "alias-ref:metadata-only", provisioningState: ALIAS_PROVISIONING_STATES.PROVIDER_PROVISIONED, verificationState: VERIFICATION_STATES.PENDING, status: EMAIL_ALIAS_STATUSES.PENDING, provenance: "PROVIDER_SUPPLIED" });
      state.storeAccounts = [];
      break;
    case "awaiting-email-verification":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, setupStage: ACCOUNT_SETUP_STAGES.EMAIL_VERIFICATION, emailVerificationStatus: VERIFICATION_STATES.PENDING, securityStatus: "UNKNOWN", ownerConfirmedReadyAt: null, lastVerifiedAt: null });
      break;
    case "awaiting-phone-verification":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, setupStage: ACCOUNT_SETUP_STAGES.PHONE_VERIFICATION, phoneVerificationRequired: true, phoneVerificationStatus: VERIFICATION_STATES.PENDING, securityStatus: "UNKNOWN", ownerConfirmedReadyAt: null, lastVerifiedAt: null });
      break;
    case "ready-account": break;
    case "problem-account":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.LOCKED, securityStatus: "PASSWORD_RESET_REQUIRED", setupStage: ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION, ownerConfirmedReadyAt: null });
      break;
    case "missing-credential-reference":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.NEEDS_ATTENTION, setupStage: ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION, credentialReference: null, ownerConfirmedReadyAt: null });
      break;
    case "disabled-alias":
      state.emailAliases[0] = alias(undefined, { status: EMAIL_ALIAS_STATUSES.DISABLED, disabledAt: ago(1), verificationState: VERIFICATION_STATES.FAILED });
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.NEEDS_ATTENTION, setupStage: ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION, ownerConfirmedReadyAt: null });
      break;
    case "duplicate-conflict-warning":
      state.emailAliases.push(alias("emailAliases:duplicate", { notes: "Duplicate QA conflict." }));
      break;
    case "several-open-tasks":
      state.tasks.push(task("tasks:verify"), task("tasks:security", { type: ACCOUNT_TASK_TYPES.SECURITY_REVIEW, title: "Review account security", priority: ACCOUNT_TASK_PRIORITIES.HIGH }), task("tasks:custom", { type: ACCOUNT_TASK_TYPES.CUSTOM, title: "Check account details" }));
      break;
    case "archived-account":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.ARCHIVED, archivedAt: ago(1) });
      break;
    case "long-alias-mobile": {
      const localPart = "very-long-retailer-business-profile-reference-abcdefghijklmnop";
      state.emailAliases[0] = alias(undefined, { aliasAddress: `${localPart}@example.test`, localPart });
      state.storeAccounts[0] = account(undefined, { username: `${localPart}@example.test` });
      break;
    }
    case "password-generation-workflow":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.SETUP, setupStage: ACCOUNT_SETUP_STAGES.PREPARED, emailVerificationStatus: VERIFICATION_STATES.PENDING, securityStatus: "UNKNOWN", credentialReference: null, ownerConfirmedReadyAt: null, lastVerifiedAt: null });
      break;
    case "account-setup-workflow":
      state.storeAccounts[0] = account(undefined, { status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, setupStage: ACCOUNT_SETUP_STAGES.SIGNUP_OPENED, emailVerificationStatus: VERIFICATION_STATES.PENDING, securityStatus: "UNKNOWN", credentialReference: null, ownerConfirmedReadyAt: null, lastVerifiedAt: null });
      break;
    case "search-filter-result":
      state.retailers.push(customRetailer());
      state.profiles.push(profile("profile:personal-01", { displayName: "Personal Search Match", aliasLabel: "personal01", profileGroupId: "profile-group-preset:personal", businessName: "" }));
      break;
    case "profile-many-accounts":
      for (let index = 2; index <= 12; index += 1) state.storeAccounts.push(account(`storeAccounts:many-${index}`, { retailerId: index % 2 ? "retailer-preset:walmart" : "retailer-preset:best-buy", aliasId: null, username: `business01-${index}`, accountDisplayName: `Business 01 account ${index}` }));
      break;
    case "retailer-many-profiles":
      for (let index = 2; index <= 12; index += 1) {
        const profileId = `profile:retailer-${index}`;
        state.profiles.push(profile(profileId, { displayName: `Business ${String(index).padStart(2, "0")}`, aliasLabel: `business${index}` }));
        state.storeAccounts.push(account(`storeAccounts:retailer-${index}`, { profileId, aliasId: null, username: `business-${index}`, accountDisplayName: `Business ${index}` }));
      }
      break;
    default: throw new Error(`Unknown Phase 2A QA fixture: ${id}`);
  }
  return normalizeAccountOpsState(state, { now: () => PHASE_2A_QA_NOW });
}

const DEFINITIONS = [
  ["empty-account-ops", "Empty Account Ops"],
  ["healthy-profile-account", "One healthy profile and account"],
  ["multiple-retailers", "Multiple retailers"],
  ["alias-generated-not-provisioned", "Generated alias that is not provisioned"],
  ["alias-provisioned-metadata", "Provisioned alias metadata"],
  ["awaiting-email-verification", "Account awaiting email verification"],
  ["awaiting-phone-verification", "Account awaiting phone verification"],
  ["ready-account", "Ready account"],
  ["problem-account", "Problem account"],
  ["missing-credential-reference", "Missing credential reference"],
  ["disabled-alias", "Disabled alias"],
  ["duplicate-conflict-warning", "Duplicate alias conflict warning"],
  ["several-open-tasks", "Several open tasks"],
  ["archived-account", "Archived account"],
  ["long-alias-mobile", "Long alias at mobile width"],
  ["password-generation-workflow", "Ephemeral password generation workflow"],
  ["account-setup-workflow", "Owner-assisted account setup workflow"],
  ["search-filter-result", "Search and filter result"],
  ["profile-many-accounts", "Profile with many accounts"],
  ["retailer-many-profiles", "Retailer with many profiles"],
];

export const PHASE_2A_QA_FIXTURES = Object.freeze(DEFINITIONS.map(([id, title]) => Object.freeze({ id, title })));

export function getPhase2aQaFixture(id) {
  const definition = PHASE_2A_QA_FIXTURES.find((fixture) => fixture.id === id);
  if (!definition) throw new Error(`Unknown Phase 2A QA fixture: ${String(id)}.`);
  return { ...definition, state: buildState(id) };
}

export function evaluatePhase2aQaFixture(id) {
  const fixture = getPhase2aQaFixture(id);
  const retailers = retailerDirectory(fixture.state.retailers, { includeArchived: true });
  return {
    ...fixture,
    summary: summarizeAccountOps(fixture.state, { retailers, asOf: PHASE_2A_QA_NOW }),
    accountHealth: fixture.state.storeAccounts.map((record) => ({ id: record.id, ...deriveAccountHealth(record, { ...fixture.state, retailers, asOf: PHASE_2A_QA_NOW }) })),
  };
}
