import {
  ACCOUNT_SETUP_STAGES,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
} from "../constants.js";
import { deriveAccountHealth } from "../accountHealth.js";
import { assertSafeAccountOpsInput, safeAccountOpsClone } from "../security.js";
import {
  ACCOUNT_CREATION_STATES,
  ACCOUNT_HEALTH_CENTER_STATES,
  ACCOUNT_OPS_OPERATING_AREAS,
  ACCOUNT_OPS_PROVIDER_EXPORTS,
  ATTENTION_PRIORITIES,
  CAPTCHA_CHALLENGE_STATES,
  EXPORT_READINESS_STATES,
  SERVER_STATES,
  UNIFIED_ORDER_STATES,
  VERIFICATION_ACTION_KINDS,
  VERIFICATION_ACTION_STATES,
} from "./constants.js";
import {
  assertOperationsSnapshotIsEphemeral,
  createEmptyAccountOpsOperationsSnapshot,
  normalizeAccountCreationPlan,
  normalizeAccountOpsOperationsSnapshot,
  normalizeExportReadiness,
  normalizeVerificationAction,
} from "./contracts.js";

const ACTIVE_VERIFICATION_STATES = new Set([
  VERIFICATION_ACTION_STATES.ACTION_REQUIRED,
  VERIFICATION_ACTION_STATES.WAITING,
]);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function byId(rows = []) {
  return new Map(rows.map((row) => [row.id, row]));
}

function words(value) {
  return String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function normalizedIdentity(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function creationStateForAccount(account) {
  const security = String(account.securityStatus || "").toUpperCase();
  if (account.status === STORE_ACCOUNT_STATUSES.DISABLED) return ACCOUNT_CREATION_STATES.DISABLED;
  if (account.status === STORE_ACCOUNT_STATUSES.LOCKED || security === "LOCKED") return ACCOUNT_CREATION_STATES.FAILED;
  if (security === "CAPTCHA_REQUIRED") return ACCOUNT_CREATION_STATES.WAITING_FOR_CAPTCHA;
  if (security === "MFA_REQUIRED") return ACCOUNT_CREATION_STATES.WAITING_FOR_MFA;
  if (account.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED && account.emailVerificationStatus !== VERIFICATION_STATES.NOT_REQUIRED) return ACCOUNT_CREATION_STATES.WAITING_FOR_EMAIL;
  if (account.phoneVerificationRequired && account.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED) return ACCOUNT_CREATION_STATES.WAITING_FOR_SMS;
  if (account.setupStage === ACCOUNT_SETUP_STAGES.SIGNUP_OPENED) return ACCOUNT_CREATION_STATES.SIGNUP_OPEN;
  if (account.setupStage === ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION) return ACCOUNT_CREATION_STATES.VERIFYING;
  if (account.status === STORE_ACCOUNT_STATUSES.READY && account.ownerConfirmedReadyAt) return ACCOUNT_CREATION_STATES.ACTIVE;
  if (account.status === STORE_ACCOUNT_STATUSES.NEEDS_ATTENTION) return ACCOUNT_CREATION_STATES.NEEDS_ATTENTION;
  if (account.setupStage === ACCOUNT_SETUP_STAGES.READY) return ACCOUNT_CREATION_STATES.READY;
  return ACCOUNT_CREATION_STATES.DRAFT;
}

export function deriveAccountCreationPlans(accountOpsSnapshot = {}) {
  assertSafeAccountOpsInput(accountOpsSnapshot, { path: "accountOpsSnapshot" });
  return freeze((accountOpsSnapshot.storeAccounts || []).filter((account) => account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED).map((account) => normalizeAccountCreationPlan({
    id: `creation-plan:${account.id}`,
    recordVersion: account.recordVersion || 1,
    updatedAt: account.updatedAt || null,
    retailerId: account.retailerId,
    accountLabel: account.accountDisplayName || account.username || "Retailer account",
    emailReference: account.aliasId || null,
    phoneReference: null,
    shippingProfileId: account.profileId || null,
    billingProfileId: account.profileId || null,
    credentialReference: account.credentialReference || null,
    creationState: creationStateForAccount(account),
    verificationRequirements: [
      account.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED && account.emailVerificationStatus !== VERIFICATION_STATES.NOT_REQUIRED ? "EMAIL" : null,
      account.phoneVerificationRequired && account.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED ? "SMS" : null,
      String(account.securityStatus || "").toUpperCase() === "MFA_REQUIRED" ? "MFA" : null,
      String(account.securityStatus || "").toUpperCase() === "CAPTCHA_REQUIRED" ? "CAPTCHA" : null,
    ].filter(Boolean),
    warnings: account.status === STORE_ACCOUNT_STATUSES.LOCKED ? ["The owner marked this account as locked."] : [],
    provenance: "LOCAL_ACCOUNT_METADATA",
  })));
}

function healthStateForAccount(account) {
  const security = String(account.securityStatus || "").toUpperCase();
  if (account.status === STORE_ACCOUNT_STATUSES.DISABLED) return ACCOUNT_HEALTH_CENTER_STATES.DISABLED;
  if (account.status === STORE_ACCOUNT_STATUSES.LOCKED || security === "LOCKED") return ACCOUNT_HEALTH_CENTER_STATES.LOCKED;
  if (security === "PASSWORD_RESET_REQUIRED") return ACCOUNT_HEALTH_CENTER_STATES.PASSWORD_RESET_REQUIRED;
  if (security === "MFA_REQUIRED") return ACCOUNT_HEALTH_CENTER_STATES.MFA_REQUIRED;
  if (security === "CAPTCHA_REQUIRED") return ACCOUNT_HEALTH_CENTER_STATES.CAPTCHA_REQUIRED;
  if (account.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED && account.emailVerificationStatus !== VERIFICATION_STATES.NOT_REQUIRED) return ACCOUNT_HEALTH_CENTER_STATES.EMAIL_UNVERIFIED;
  if (account.phoneVerificationRequired && account.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED) return ACCOUNT_HEALTH_CENTER_STATES.PHONE_UNVERIFIED;
  if (account.status === STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION) return ACCOUNT_HEALTH_CENTER_STATES.NEEDS_VERIFICATION;
  if (account.status === STORE_ACCOUNT_STATUSES.READY && account.ownerConfirmedReadyAt) return ACCOUNT_HEALTH_CENTER_STATES.HEALTHY;
  return ACCOUNT_HEALTH_CENTER_STATES.UNKNOWN;
}

export function deriveAccountHealthCenter(accountOpsSnapshot = {}, retailers = [], options = {}) {
  const profileMap = byId(accountOpsSnapshot.profiles || []);
  const aliasMap = byId(accountOpsSnapshot.emailAliases || []);
  return freeze((accountOpsSnapshot.storeAccounts || []).filter((account) => account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED).map((account) => {
    const legacy = deriveAccountHealth(account, { ...accountOpsSnapshot, retailers, asOf: options.asOf });
    const state = healthStateForAccount(account);
    return {
      id: `health:${account.id}`,
      accountId: account.id,
      retailerId: account.retailerId,
      accountLabel: account.accountDisplayName || account.username || "Retailer account",
      state,
      lastSuccessfulCheckAt: account.lastVerifiedAt || null,
      pendingOwnerAction: legacy.reasons[0]?.message || "No owner action recorded.",
      profileId: account.profileId || null,
      profileLabel: profileMap.get(account.profileId)?.displayName || "Profile unavailable",
      emailState: account.emailVerificationStatus,
      emailLabel: aliasMap.get(account.aliasId)?.aliasAddress || account.username || "No email reference",
      phoneState: account.phoneVerificationStatus,
      warnings: legacy.reasons.map((reason) => reason.message),
      networkChecked: false,
    };
  }));
}

function pushGroup(map, key, accountId) {
  if (!key) return;
  const rows = map.get(key) || [];
  rows.push(accountId);
  map.set(key, rows);
}

export function detectAccountConflicts(accountOpsSnapshot = {}, operationsSnapshot = createEmptyAccountOpsOperationsSnapshot()) {
  const aliases = byId(accountOpsSnapshot.emailAliases || []);
  const plans = byId((operationsSnapshot.accountCreationPlans || []).map((plan) => ({ ...plan, id: plan.id })));
  const maps = { email: new Map(), phone: new Map(), profile: new Map(), label: new Map() };
  const accounts = (accountOpsSnapshot.storeAccounts || []).filter((account) => account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED);
  for (const account of accounts) {
    const plan = [...plans.values()].find((candidate) => candidate.id === `creation-plan:${account.id}` || candidate.accountId === account.id);
    const retailer = normalizedIdentity(account.retailerId);
    pushGroup(maps.email, `${retailer}|${normalizedIdentity(aliases.get(account.aliasId)?.aliasAddress || account.username)}`, account.id);
    pushGroup(maps.phone, `${retailer}|${normalizedIdentity(plan?.phoneReference)}`, account.id);
    pushGroup(maps.profile, `${retailer}|${normalizedIdentity(account.profileId)}`, account.id);
    pushGroup(maps.label, `${retailer}|${normalizedIdentity(account.accountDisplayName)}`, account.id);
  }
  const warnings = [];
  for (const [kind, map] of Object.entries(maps)) {
    for (const [key, accountIds] of map.entries()) {
      if (key.endsWith("|") || accountIds.length < 2) continue;
      warnings.push(freeze({ id: `duplicate:${kind}:${accountIds.slice().sort().join(":")}`, category: kind.toUpperCase(), accountIds: accountIds.slice().sort(), message: `Possible duplicate retailer account ${kind} metadata requires owner review.`, limitEvasionAllowed: false }));
    }
  }
  return freeze(warnings.sort((left, right) => left.id.localeCompare(right.id)));
}

export function deriveVerificationInbox(accountOpsSnapshot = {}, operationsSnapshot = createEmptyAccountOpsOperationsSnapshot(), options = {}) {
  const derived = [];
  const createdAtFallback = options.asOf || "2000-01-01T00:00:00.000Z";
  for (const account of accountOpsSnapshot.storeAccounts || []) {
    if (account.status === STORE_ACCOUNT_STATUSES.ARCHIVED) continue;
    const createdAt = account.updatedAt || account.createdAt || createdAtFallback;
    const common = { recordVersion: account.recordVersion || 1, updatedAt: account.updatedAt || null, retailerId: account.retailerId, accountId: account.id, createdAt, expiresAt: null, resumeAllowed: false, warnings: [] };
    if (account.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED && account.emailVerificationStatus !== VERIFICATION_STATES.NOT_REQUIRED) derived.push(normalizeVerificationAction({ ...common, id: `verification:email:${account.id}`, kind: VERIFICATION_ACTION_KINDS.EMAIL_VERIFICATION, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED, challengeState: CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE, workflowLabel: "Email verification", safeInstruction: "Complete the retailer email verification yourself, then return to review status." }));
    if (account.phoneVerificationRequired && account.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED) derived.push(normalizeVerificationAction({ ...common, id: `verification:sms:${account.id}`, kind: VERIFICATION_ACTION_KINDS.SMS_VERIFICATION, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED, challengeState: CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE, workflowLabel: "SMS verification", safeInstruction: "Enter the code only in the retailer's own verification screen. Code 3 does not retain it." }));
    const security = String(account.securityStatus || "").toUpperCase();
    if (security === "MFA_REQUIRED") derived.push(normalizeVerificationAction({ ...common, id: `verification:mfa:${account.id}`, kind: VERIFICATION_ACTION_KINDS.MFA, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED, challengeState: CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE, workflowLabel: "Multi-factor verification", safeInstruction: "Complete the retailer prompt directly. No MFA value belongs in Code 3." }));
    if (security === "CAPTCHA_REQUIRED") derived.push(normalizeVerificationAction({ ...common, id: `verification:captcha:${account.id}`, kind: VERIFICATION_ACTION_KINDS.CAPTCHA, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED, challengeState: CAPTCHA_CHALLENGE_STATES.CAPTCHA_REQUIRED, workflowLabel: "Human verification challenge", safeInstruction: "Complete the challenge yourself in the retailer interface; automation remains paused." }));
    if (security === "PASSWORD_RESET_REQUIRED") derived.push(normalizeVerificationAction({ ...common, id: `verification:reset:${account.id}`, kind: VERIFICATION_ACTION_KINDS.PASSWORD_RESET, state: VERIFICATION_ACTION_STATES.ACTION_REQUIRED, challengeState: CAPTCHA_CHALLENGE_STATES.NOT_APPLICABLE, workflowLabel: "Password reset", safeInstruction: "Use the retailer and your approved password manager. Do not place the password in Code 3." }));
  }
  const combined = [...(operationsSnapshot.verificationActions || []), ...derived];
  const unique = new Map(combined.map((item) => [item.id, item]));
  return freeze([...unique.values()].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))));
}

export function deriveDefaultExportReadiness(accountOpsSnapshot = {}, operationsSnapshot = createEmptyAccountOpsOperationsSnapshot()) {
  const readyAccounts = (accountOpsSnapshot.storeAccounts || []).filter((account) => account.status === STORE_ACCOUNT_STATUSES.READY).length;
  const profilesReady = (accountOpsSnapshot.profiles || []).filter((profile) => profile.status !== "ARCHIVED").length;
  const supplied = new Map((operationsSnapshot.exportReadiness || []).map((row) => [row.provider, row]));
  const defaults = ACCOUNT_OPS_PROVIDER_EXPORTS.map((definition) => supplied.get(definition.provider) || normalizeExportReadiness({
    id: `export-readiness:${definition.provider.toLowerCase()}`,
    recordVersion: 1,
    updatedAt: null,
    provider: definition.provider,
    readinessState: definition.readinessState,
    supportedExportTypes: [],
    schemaState: definition.schemaState,
    profilesReady,
    accountsReady: readyAccounts,
    proxiesReady: 0,
    productReadiness: "NOT_REVIEWED",
    warnings: [definition.note],
    compatibilityNote: definition.note,
  }));
  const lockedProviders = new Set(ACCOUNT_OPS_PROVIDER_EXPORTS.map((definition) => definition.provider));
  const additional = (operationsSnapshot.exportReadiness || []).filter((row) => !lockedProviders.has(row.provider));
  return freeze([...defaults, ...additional]);
}

export function deriveProfileCompatibilityViews(accountOpsSnapshot = {}, exportReadiness = []) {
  assertSafeAccountOpsInput(accountOpsSnapshot, { path: "accountOpsSnapshot" });
  const accountsByProfile = new Map();
  for (const account of accountOpsSnapshot.storeAccounts || []) {
    if (!account.profileId || account.status === STORE_ACCOUNT_STATUSES.ARCHIVED) continue;
    const retailerIds = accountsByProfile.get(account.profileId) || new Set();
    if (account.retailerId) retailerIds.add(account.retailerId);
    accountsByProfile.set(account.profileId, retailerIds);
  }
  return freeze((accountOpsSnapshot.profiles || []).map((profile) => ({
    id: `profile-compatibility:${profile.id}`,
    profileId: profile.id,
    profileLabel: profile.displayName || profile.businessName || "Profile",
    enabled: profile.status !== "ARCHIVED",
    archived: profile.status === "ARCHIVED",
    retailerRelationships: [...(accountsByProfile.get(profile.id) || [])].sort(),
    retailerCompatibilityState: accountsByProfile.get(profile.id)?.size ? "REVIEW_REQUIRED" : "NOT_REVIEWED",
    botProviderCompatibility: exportReadiness.map((row) => ({ provider: row.provider, readinessState: row.readinessState, schemaState: row.schemaState, compatibilityVerified: false })),
    authoritative: false,
  })));
}

function attentionPriorityForHealth(state) {
  if ([ACCOUNT_HEALTH_CENTER_STATES.LOCKED, ACCOUNT_HEALTH_CENTER_STATES.DISABLED].includes(state)) return ATTENTION_PRIORITIES.CRITICAL;
  if ([ACCOUNT_HEALTH_CENTER_STATES.PASSWORD_RESET_REQUIRED, ACCOUNT_HEALTH_CENTER_STATES.MFA_REQUIRED, ACCOUNT_HEALTH_CENTER_STATES.CAPTCHA_REQUIRED].includes(state)) return ATTENTION_PRIORITIES.HIGH;
  return ATTENTION_PRIORITIES.NORMAL;
}

export function buildAttentionCenter(view) {
  const rows = [];
  for (const health of view.accountHealth || []) {
    if ([ACCOUNT_HEALTH_CENTER_STATES.HEALTHY, ACCOUNT_HEALTH_CENTER_STATES.UNKNOWN].includes(health.state)) continue;
    rows.push({ id: `attention:${health.id}`, priority: attentionPriorityForHealth(health.state), category: "ACCOUNTS", title: health.accountLabel, detail: health.pendingOwnerAction, area: "accounts", sourceId: health.accountId });
  }
  for (const action of view.verificationInbox || []) {
    if (!ACTIVE_VERIFICATION_STATES.has(action.state)) continue;
    rows.push({ id: `attention:${action.id}`, priority: action.kind === VERIFICATION_ACTION_KINDS.CAPTCHA || action.kind === VERIFICATION_ACTION_KINDS.MFA ? ATTENTION_PRIORITIES.HIGH : ATTENTION_PRIORITIES.NORMAL, category: "VERIFICATION", title: action.workflowLabel, detail: "Human action is required; no code or challenge response is stored.", area: "verification", sourceId: action.id });
  }
  for (const warning of view.duplicateWarnings || []) rows.push({ id: `attention:${warning.id}`, priority: ATTENTION_PRIORITIES.HIGH, category: "ACCOUNTS", title: "Possible duplicate account", detail: warning.message, area: "accounts", sourceId: warning.id });
  for (const proxy of view.operations.proxyGroupViews || []) {
    if (!["DEGRADED", "EXPIRED"].includes(proxy.health)) continue;
    rows.push({ id: `attention:proxy:${proxy.id}`, priority: proxy.health === "EXPIRED" ? ATTENTION_PRIORITIES.HIGH : ATTENTION_PRIORITIES.NORMAL, category: "BOTS", title: proxy.groupLabel, detail: `Proxy metadata is ${words(proxy.health)}.`, area: "network", sourceId: proxy.id });
  }
  for (const readiness of view.exportReadiness || []) {
    if (![EXPORT_READINESS_STATES.REVIEW_REQUIRED, EXPORT_READINESS_STATES.PARTIALLY_SUPPORTED].includes(readiness.readinessState)) continue;
    rows.push({ id: `attention:export:${readiness.id}`, priority: ATTENTION_PRIORITIES.NORMAL, category: "BOTS", title: `${words(readiness.provider)} export review`, detail: readiness.compatibilityNote || "Provider export compatibility needs owner review.", area: "automation", sourceId: readiness.id });
  }
  for (const server of view.operations.serverRecords || []) {
    if (![SERVER_STATES.OFFLINE, SERVER_STATES.DEGRADED].includes(server.status)) continue;
    rows.push({ id: `attention:server:${server.id}`, priority: server.status === SERVER_STATES.OFFLINE ? ATTENTION_PRIORITIES.HIGH : ATTENTION_PRIORITIES.NORMAL, category: "SERVERS", title: server.friendlyName, detail: `Server metadata is ${words(server.status)}; no live health check occurred.`, area: "infrastructure", sourceId: server.id });
  }
  for (const order of view.operations.orderViews || []) {
    if (![UNIFIED_ORDER_STATES.RETURN_STARTED, UNIFIED_ORDER_STATES.CANCELLED, UNIFIED_ORDER_STATES.UNKNOWN].includes(order.status)) continue;
    rows.push({ id: `attention:order:${order.id}`, priority: order.status === UNIFIED_ORDER_STATES.UNKNOWN ? ATTENTION_PRIORITIES.NORMAL : ATTENTION_PRIORITIES.HIGH, category: "ORDERS", title: order.externalOrderReference || "Order review", detail: `Order relationship is ${words(order.status)}.`, area: "orders", sourceId: order.id });
  }
  for (const reference of view.operations.workspaceReferences || []) {
    if (!reference.attentionPriority) continue;
    const category = ["BOT", "BOT_TASK"].includes(reference.referenceType) ? "BOTS" : "BUSINESS";
    rows.push({ id: `attention:workspace:${reference.id}`, priority: reference.attentionPriority, category, title: reference.label, detail: reference.detail || "A linked owner workspace record needs review.", area: reference.area, sourceId: reference.sourceReference });
  }
  const rank = { CRITICAL: 0, HIGH: 1, NORMAL: 2, INFO: 3 };
  return freeze(rows.sort((left, right) => rank[left.priority] - rank[right.priority] || left.id.localeCompare(right.id)).map((row) => ({ ...row, navigationOnly: true })));
}

function searchResult(type, recordId, label, detail, area) {
  return { id: `search:${type}:${recordId}`, type, recordId, label, detail, area, navigationOnly: true, destructiveAction: false };
}

export function searchAccountOpsOperations(view, query = "") {
  assertSafeAccountOpsInput({ query }, { path: "AccountOpsOperationsSearch" });
  const needle = normalizedIdentity(query);
  if (!needle) return freeze([]);
  if (needle.length > 120) throw new Error("Account Ops search is limited to 120 characters.");
  const matches = (...values) => values.some((value) => normalizedIdentity(value).includes(needle));
  const results = [];
  for (const row of view.accountHealth || []) if (matches(row.accountLabel, row.profileLabel, row.emailLabel, row.state, row.accountId)) results.push(searchResult("ACCOUNT", row.accountId, row.accountLabel, words(row.state), "accounts"));
  for (const row of view.accountOps.profiles || []) if (matches(row.displayName, row.businessName, row.id)) results.push(searchResult("PROFILE", row.id, row.displayName, row.businessName || "Identity profile", "identity"));
  for (const row of view.accountOps.emailAliases || []) if (matches(row.aliasAddress, row.purpose, row.id)) results.push(searchResult("EMAIL_ALIAS", row.id, row.aliasAddress, row.purpose || "Email alias metadata", "identity"));
  for (const row of view.accountOps.tasks || []) if (matches(row.title, row.label, row.retailerLabel, row.status, row.id)) results.push(searchResult("ACCOUNT_TASK", row.id, row.title || row.label || "Account task", words(row.status || "Account task"), "activity"));
  for (const row of view.operations.phoneResources || []) if (matches(row.label, row.providerLabel, row.region, row.id)) results.push(searchResult("PHONE_RESOURCE", row.id, row.label, row.region || "Phone/SMS metadata", "identity"));
  for (const row of view.operations.paymentCards || []) if (matches(row.cardAlias, row.providerLabel, row.last4, row.id)) results.push(searchResult("PAYMENT_METADATA", row.id, row.cardAlias, row.last4 ? `Ending in ${row.last4}` : "Reference only", "payment"));
  for (const row of view.operations.proxyGroupViews || []) if (matches(row.groupLabel, row.providerLabel, row.region, row.id)) results.push(searchResult("PROXY_GROUP", row.id, row.groupLabel, words(row.health), "network"));
  for (const row of view.exportReadiness || []) if (matches(row.provider, row.readinessState, row.id)) results.push(searchResult("BOT_EXPORT", row.id, words(row.provider), words(row.readinessState), "automation"));
  for (const row of view.operations.orderViews || []) if (matches(row.externalOrderReference, row.orderCandidateId, row.purchaseId, row.accountId, row.status, row.id)) results.push(searchResult("ORDER", row.id, row.externalOrderReference || "Order relationship", words(row.status), "orders"));
  for (const row of view.operations.serverRecords || []) if (matches(row.friendlyName, row.providerLabel, row.region, row.purpose, row.id)) results.push(searchResult("SERVER", row.id, row.friendlyName, words(row.status), "infrastructure"));
  for (const row of view.operations.workspaceReferences || []) if (matches(row.label, row.detail, row.sourceReference, row.referenceType, row.id)) results.push(searchResult(row.referenceType, row.sourceReference, row.label, row.detail || words(row.referenceType), row.area));
  return freeze(results.slice(0, 50));
}

export function createAccountOpsOperationsViewModel({ accountOpsSnapshot = {}, operationsSnapshot, retailers = [], asOf } = {}) {
  const accountOps = safeAccountOpsClone(accountOpsSnapshot);
  const operations = normalizeAccountOpsOperationsSnapshot(operationsSnapshot || {});
  assertOperationsSnapshotIsEphemeral(operations);
  const derivedPlans = deriveAccountCreationPlans(accountOps);
  const mergedPlanMap = new Map([...derivedPlans, ...(operations.accountCreationPlans || [])].map((row) => [row.id, row]));
  const mergedOperations = freeze({ ...operations, accountCreationPlans: freeze([...mergedPlanMap.values()]) });
  const view = {
    contractVersion: operations.contractVersion,
    areas: ACCOUNT_OPS_OPERATING_AREAS,
    accountOps,
    operations: mergedOperations,
    accountCreationPlans: mergedOperations.accountCreationPlans,
    accountHealth: deriveAccountHealthCenter(accountOps, retailers, { asOf }),
    verificationInbox: deriveVerificationInbox(accountOps, mergedOperations, { asOf }),
    exportReadiness: deriveDefaultExportReadiness(accountOps, mergedOperations),
  };
  view.profileCompatibility = deriveProfileCompatibilityViews(accountOps, view.exportReadiness);
  view.duplicateWarnings = detectAccountConflicts(accountOpsSnapshot, mergedOperations);
  view.attention = buildAttentionCenter(view);
  view.summary = freeze({
    accounts: view.accountHealth.length,
    healthyAccounts: view.accountHealth.filter((row) => row.state === ACCOUNT_HEALTH_CENTER_STATES.HEALTHY).length,
    attentionItems: view.attention.length,
    verificationActions: view.verificationInbox.filter((row) => ACTIVE_VERIFICATION_STATES.has(row.state)).length,
    phoneResources: mergedOperations.phoneResources.length,
    paymentReferences: mergedOperations.paymentCards.length,
    proxyGroups: mergedOperations.proxyGroupViews.length,
    orderRelationships: mergedOperations.orderViews.length,
    servers: mergedOperations.serverRecords.length,
  });
  view.search = (query) => searchAccountOpsOperations(view, query);
  view.writesAllowed = false;
  view.networkAllowed = false;
  return freeze(view);
}
