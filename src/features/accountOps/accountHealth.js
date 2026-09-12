import {
  ACCOUNT_HEALTH_STATES,
  ACCOUNT_SETUP_STAGES,
  ACCOUNT_TASK_STATUSES,
  ALIAS_PROVISIONING_STATES,
  CREDENTIAL_REFERENCE_PROVIDERS,
  EMAIL_ALIAS_STATUSES,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
} from "./constants.js";

function reason(code, message, severity = "ATTENTION") { return { code, message, severity }; }
function byId(rows, id) { return (rows || []).find((row) => row.id === id) || null; }

export function deriveAccountHealth(account, context = {}) {
  if (!account) return { health: ACCOUNT_HEALTH_STATES.UNKNOWN, reasons: [reason("ACCOUNT_MISSING", "Account metadata is unavailable.", "UNKNOWN")], evaluatedAt: context.asOf || null };
  if (account.status === STORE_ACCOUNT_STATUSES.ARCHIVED) return { health: ACCOUNT_HEALTH_STATES.UNKNOWN, reasons: [reason("ACCOUNT_ARCHIVED", "This account is archived.", "UNKNOWN")], evaluatedAt: context.asOf || null };

  const reasons = [];
  const profile = byId(context.profiles, account.profileId);
  const retailer = byId(context.retailers, account.retailerId);
  const alias = account.aliasId ? byId(context.emailAliases, account.aliasId) : null;
  const openTasks = (context.tasks || []).filter((task) => task.accountId === account.id && task.status === ACCOUNT_TASK_STATUSES.OPEN);

  if (!profile || profile.status === "ARCHIVED") reasons.push(reason("PROFILE_MISSING", "The connected profile is missing or archived.", "PROBLEM"));
  if (!retailer || retailer.status === "ARCHIVED") reasons.push(reason("RETAILER_MISSING", "The connected retailer is missing or archived.", "PROBLEM"));
  if (account.aliasId && !alias) reasons.push(reason("ALIAS_MISSING", "The connected email alias is missing.", "PROBLEM"));
  if (alias) {
    const duplicates = (context.emailAliases || []).filter((candidate) => candidate.id !== alias.id
      && candidate.status !== EMAIL_ALIAS_STATUSES.ARCHIVED
      && String(candidate.aliasAddress || "").toLowerCase() === String(alias.aliasAddress || "").toLowerCase());
    if (duplicates.length) reasons.push(reason("DUPLICATE_ALIAS", "The connected email address conflicts with another alias record.", "PROBLEM"));
  }
  if (alias?.status === EMAIL_ALIAS_STATUSES.DISABLED || alias?.status === EMAIL_ALIAS_STATUSES.ARCHIVED) reasons.push(reason("ALIAS_DISABLED", "The connected email alias is disabled.", "PROBLEM"));
  if (alias?.status === EMAIL_ALIAS_STATUSES.ERROR || alias?.provisioningState === ALIAS_PROVISIONING_STATES.FAILED) reasons.push(reason("ALIAS_ERROR", "The connected email alias has a recorded error.", "PROBLEM"));
  if (account.status === STORE_ACCOUNT_STATUSES.LOCKED) reasons.push(reason("ACCOUNT_LOCKED", "The owner marked this account as locked.", "PROBLEM"));
  if (account.status === STORE_ACCOUNT_STATUSES.DISABLED) reasons.push(reason("ACCOUNT_DISABLED", "The owner marked this account as disabled.", "PROBLEM"));
  if (!["HEALTHY", "UNKNOWN"].includes(String(account.securityStatus || "UNKNOWN").toUpperCase())) {
    reasons.push(reason("SECURITY_REVIEW", `A recorded security state requires owner review: ${String(account.securityStatus).replaceAll("_", " ").toLowerCase()}.`, "PROBLEM"));
  }
  if (account.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED && account.emailVerificationStatus !== VERIFICATION_STATES.NOT_REQUIRED) {
    reasons.push(reason("EMAIL_NOT_VERIFIED", "Email verification is incomplete."));
  }
  if (account.phoneVerificationRequired && account.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED) {
    reasons.push(reason("PHONE_NOT_VERIFIED", "Phone verification is incomplete."));
  }
  if (!account.credentialReference || account.credentialReference.provider === CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE) {
    reasons.push(reason("CREDENTIAL_REFERENCE_MISSING", "No secure credential reference is recorded."));
  }
  if (account.setupStage !== ACCOUNT_SETUP_STAGES.READY || account.status !== STORE_ACCOUNT_STATUSES.READY || !account.ownerConfirmedReadyAt) {
    reasons.push(reason("SETUP_INCOMPLETE", "Account setup has not been fully confirmed by the owner."));
  }
  if (openTasks.length) reasons.push(reason("OPEN_TASKS", `${openTasks.length} open account task${openTasks.length === 1 ? "" : "s"} require review.`));

  const asOfTime = Date.parse(context.asOf || new Date().toISOString());
  const verifiedTime = Date.parse(account.lastVerifiedAt || "");
  const staleAfterDays = Number.isFinite(context.staleAfterDays) ? context.staleAfterDays : 180;
  if (Number.isFinite(asOfTime) && Number.isFinite(verifiedTime) && asOfTime - verifiedTime > staleAfterDays * 86_400_000) {
    reasons.push(reason("VERIFICATION_STALE", `Account verification is older than ${staleAfterDays} days.`));
  }

  const health = reasons.some((entry) => entry.severity === "PROBLEM")
    ? ACCOUNT_HEALTH_STATES.PROBLEM
    : reasons.length
      ? ACCOUNT_HEALTH_STATES.NEEDS_ATTENTION
      : ACCOUNT_HEALTH_STATES.HEALTHY;
  return { health, reasons, evaluatedAt: context.asOf || null };
}

export function summarizeAccountOps(snapshot, options = {}) {
  const retailers = options.retailers || snapshot.retailers || [];
  const activeAccounts = (snapshot.storeAccounts || []).filter((row) => row.status !== STORE_ACCOUNT_STATUSES.ARCHIVED);
  const health = activeAccounts.map((account) => ({ account, ...deriveAccountHealth(account, { ...snapshot, retailers, asOf: options.asOf }) }));
  return {
    storeAccounts: activeAccounts.length,
    ready: activeAccounts.filter((row) => row.status === STORE_ACCOUNT_STATUSES.READY).length,
    needsAttention: health.filter((row) => row.health === ACCOUNT_HEALTH_STATES.NEEDS_ATTENTION).length,
    problem: health.filter((row) => row.health === ACCOUNT_HEALTH_STATES.PROBLEM).length,
    emailAliases: (snapshot.emailAliases || []).filter((row) => ![EMAIL_ALIAS_STATUSES.ARCHIVED, EMAIL_ALIAS_STATUSES.DISABLED].includes(row.status)).length,
    tasks: (snapshot.tasks || []).filter((row) => row.status === ACCOUNT_TASK_STATUSES.OPEN).length,
  };
}

export function searchAccountOps(snapshot, query = "", filters = {}) {
  const needle = String(query || "").trim().toLowerCase();
  const matches = (values) => !needle || values.some((value) => String(value || "").toLowerCase().includes(needle));
  const archiveFilter = (row) => filters.archived == null
    || (filters.archived === true ? row.status === "ARCHIVED" : row.status !== "ARCHIVED");
  const profiles = (snapshot.profiles || []).filter((row) => archiveFilter(row) && (!filters.profileStatus || row.status === filters.profileStatus) && (!filters.profileGroupId || row.profileGroupId === filters.profileGroupId) && matches([row.displayName, row.businessName, row.fullName, row.notes]));
  const aliases = (snapshot.emailAliases || []).filter((row) => archiveFilter(row) && (!filters.aliasStatus || row.status === filters.aliasStatus) && (!filters.retailerId || row.retailerId === filters.retailerId) && (!filters.profileId || row.profileId === filters.profileId) && matches([row.aliasAddress, row.purpose, row.notes]));
  const retailers = filters.retailers || snapshot.retailers || [];
  const accounts = (snapshot.storeAccounts || []).filter((row) => {
    if (!archiveFilter(row) || (filters.accountStatus && row.status !== filters.accountStatus) || (filters.retailerId && row.retailerId !== filters.retailerId) || (filters.profileId && row.profileId !== filters.profileId)) return false;
    if (filters.verification && ![row.emailVerificationStatus, row.phoneVerificationStatus].includes(filters.verification)) return false;
    if (filters.health && deriveAccountHealth(row, { ...snapshot, retailers, asOf: filters.asOf }).health !== filters.health) return false;
    const profile = byId(snapshot.profiles, row.profileId);
    const retailer = byId(retailers, row.retailerId);
    const alias = byId(snapshot.emailAliases, row.aliasId);
    return matches([row.accountDisplayName, row.username, row.status, row.notes, profile?.displayName, retailer?.displayName, alias?.aliasAddress]);
  });
  const tasks = (snapshot.tasks || []).filter((row) => (!filters.taskStatus || row.status === filters.taskStatus) && matches([row.title, row.type, row.notes]));
  return { profiles, aliases, accounts, tasks };
}
