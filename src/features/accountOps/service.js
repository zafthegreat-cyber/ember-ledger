import {
  ACCOUNT_OPS_PROVENANCE,
  ACCOUNT_SETUP_STAGES,
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
} from "./constants.js";
import { deriveAccountHealth, searchAccountOps, summarizeAccountOps } from "./accountHealth.js";
import { generateEmailAlias } from "./aliasEngine.js";
import { generateStrongPassword } from "./passwordGenerator.js";
import { createAccountOpsPersistence } from "./persistence.js";
import { getRetailerById, isRetailerPresetId, retailerDirectory, retailerSetupUrl } from "./retailerDirectory.js";
import { assertSafeAccountOpsInput, safeAccountOpsClone } from "./security.js";
import {
  normalizeAccountTask,
  normalizeCredentialReference,
  validateDomainName,
  validateEmailAddress,
} from "./validators.js";

const EDITABLE_ACCOUNT_FIELDS = new Set([
  "retailerId", "profileId", "aliasId", "username", "accountDisplayName", "notes",
  "lastLoginAt", "lastOrderAt", "externalIdentity", "credentialReference", "securityStatus", "status",
]);
const ARCHIVABLE_COLLECTIONS = new Set(["profiles", "emailAliases", "retailers", "storeAccounts", "tasks"]);

function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
function clone(value) { return safeAccountOpsClone(value); }

export class AccountOpsServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsServiceError";
    this.code = code;
    this.details = details;
  }
}

function normalizedNow(now) {
  const value = now();
  if (!Number.isFinite(Date.parse(value))) throw new AccountOpsServiceError("INVALID_CLOCK", "Account Ops requires a valid timestamp.");
  return new Date(value).toISOString();
}

export function createAccountOpsService(options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const randomSource = options.randomSource || globalThis.crypto;
  const persistence = createAccountOpsPersistence(options);
  const { repository, collections } = persistence;

  function loadSnapshot() { return repository.load(); }
  function listRetailers(listOptions = {}) { return retailerDirectory(loadSnapshot().retailers, listOptions); }
  function getRetailer(retailerId) { return getRetailerById(retailerId, loadSnapshot().retailers); }
  function getRecord(collection, recordId) {
    return loadSnapshot()[collection]?.find((record) => record.id === recordId) || null;
  }
  function requireRecord(collection, recordId, label = "record") {
    const record = getRecord(collection, recordId);
    if (!record || record.status === RECORD_STATUS.ARCHIVED || record.status === EMAIL_ALIAS_STATUSES.ARCHIVED || record.status === STORE_ACCOUNT_STATUSES.ARCHIVED || record.status === ACCOUNT_TASK_STATUSES.ARCHIVED) {
      throw new AccountOpsServiceError("RELATED_RECORD_REQUIRED", `Choose an active ${label}.`, { collection, recordId });
    }
    return record;
  }
  function requireRetailer(retailerId) {
    const retailer = getRetailer(retailerId);
    if (!retailer || retailer.status === RECORD_STATUS.ARCHIVED) throw new AccountOpsServiceError("RETAILER_REQUIRED", "Choose an active retailer.", { retailerId });
    return retailer;
  }
  function requireExpected(record, expectedVersion) {
    if (expectedVersion == null) return record.recordVersion;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new AccountOpsServiceError("EXPECTED_VERSION_INVALID", "expectedVersion must be a positive integer.");
    return expectedVersion;
  }
  async function activity(input) {
    return collections.activity.create({
      type: input.type,
      title: input.title,
      summary: input.summary || "",
      profileId: input.profileId || null,
      accountId: input.accountId || null,
      retailerId: input.retailerId || null,
      aliasId: input.aliasId || null,
      occurredAt: normalizedNow(now),
      status: RECORD_STATUS.ACTIVE,
    });
  }
  async function response(record, activityInput, extras = {}) {
    if (activityInput) await activity(activityInput);
    return { record: clone(record), snapshot: loadSnapshot(), ...extras };
  }
  function assertReferences(input) {
    if (input.profileGroupId) requireRecord("profileGroups", input.profileGroupId, "profile group");
    if (input.profileId) requireRecord("profiles", input.profileId, "profile");
    if (input.domainId) requireRecord("emailDomains", input.domainId, "email domain");
    if (input.aliasId) requireRecord("emailAliases", input.aliasId, "email alias");
    if (input.accountId) requireRecord("storeAccounts", input.accountId, "store account");
    if (input.retailerId) requireRetailer(input.retailerId);
  }
  function assertNoCallerId(input) {
    if (hasOwn(input, "id")) throw new AccountOpsServiceError("CALLER_ID_REJECTED", "Stable Account Ops IDs are generated locally by Code 3.");
  }
  function assertNotDirectArchive(patch) {
    if (String(patch?.status || "").toUpperCase() === "ARCHIVED") {
      throw new AccountOpsServiceError("ARCHIVE_METHOD_REQUIRED", "Use the explicit archive action so dependency checks and archive metadata remain intact.");
    }
  }
  function assertAliasDomain(aliasInput) {
    const registered = requireRecord("emailDomains", aliasInput.domainId, "email domain");
    const supplied = String(aliasInput.domain || String(aliasInput.aliasAddress || "").split("@").at(-1) || "").replace(/^@/, "").toLowerCase();
    if (registered.domain.toLowerCase() !== supplied) throw new AccountOpsServiceError("ALIAS_DOMAIN_MISMATCH", "The alias address must use its registered email domain.");
    return registered;
  }
  function assertAccountAliasRelationship(accountInput) {
    if (!accountInput.aliasId) return;
    const alias = requireRecord("emailAliases", accountInput.aliasId, "email alias");
    if (alias.profileId && alias.profileId !== accountInput.profileId) throw new AccountOpsServiceError("ALIAS_PROFILE_MISMATCH", "The selected alias belongs to a different profile.");
    if (alias.retailerId && alias.retailerId !== accountInput.retailerId) throw new AccountOpsServiceError("ALIAS_RETAILER_MISMATCH", "The selected alias belongs to a different retailer.");
  }
  function taskInputWithAccountRelationships(input) {
    const next = { ...input };
    if (!next.accountId) return next;
    const account = requireRecord("storeAccounts", next.accountId, "store account");
    if (next.profileId && next.profileId !== account.profileId) {
      throw new AccountOpsServiceError("TASK_PROFILE_MISMATCH", "The selected task profile does not match its store account.", { accountId: account.id });
    }
    if (next.retailerId && next.retailerId !== account.retailerId) {
      throw new AccountOpsServiceError("TASK_RETAILER_MISMATCH", "The selected task retailer does not match its store account.", { accountId: account.id });
    }
    next.profileId = account.profileId;
    next.retailerId = account.retailerId;
    return next;
  }

  async function createProfileGroup(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input);
    const record = await collections.profileGroups.create({ ...input, status: RECORD_STATUS.ACTIVE });
    return response(record, { type: "PROFILE_GROUP_CREATED", title: `Profile group created: ${record.displayName}` });
  }
  async function updateProfileGroup(id, patch, expectedVersion) {
    assertNotDirectArchive(patch);
    const current = requireRecord("profileGroups", id, "profile group");
    const record = await collections.profileGroups.update(id, patch, requireExpected(current, expectedVersion));
    return response(record, { type: "PROFILE_GROUP_UPDATED", title: `Profile group updated: ${record.displayName}` });
  }
  async function archiveProfileGroup(id, expectedVersion) {
    const current = requireRecord("profileGroups", id, "profile group");
    if (loadSnapshot().profiles.some((profile) => profile.profileGroupId === id && profile.status !== RECORD_STATUS.ARCHIVED)) {
      throw new AccountOpsServiceError("PROFILE_GROUP_IN_USE", "Move active profiles before archiving this group.");
    }
    const record = await collections.profileGroups.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "PROFILE_GROUP_ARCHIVED", title: `Profile group archived: ${record.displayName}` });
  }

  async function createProfile(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input); assertReferences(input);
    const record = await collections.profiles.create({ ...input, status: RECORD_STATUS.ACTIVE });
    return response(record, { type: "PROFILE_CREATED", title: `Profile created: ${record.displayName}`, profileId: record.id });
  }
  async function updateProfile(id, patch, expectedVersion) {
    assertNotDirectArchive(patch);
    assertReferences(patch);
    const current = requireRecord("profiles", id, "profile");
    const record = await collections.profiles.update(id, patch, requireExpected(current, expectedVersion));
    return response(record, { type: "PROFILE_UPDATED", title: `Profile updated: ${record.displayName}`, profileId: id });
  }
  async function archiveProfile(id, expectedVersion) {
    const current = requireRecord("profiles", id, "profile");
    if (loadSnapshot().storeAccounts.some((account) => account.profileId === id && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED)) {
      throw new AccountOpsServiceError("PROFILE_IN_USE", "Archive connected store accounts before archiving this profile.");
    }
    const record = await collections.profiles.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "PROFILE_ARCHIVED", title: `Profile archived: ${record.displayName}`, profileId: id });
  }

  async function createEmailDomain(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input);
    const requestedMode = String(input.mode || EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY).toUpperCase();
    if (requestedMode === EMAIL_DOMAIN_MODES.PROVIDER_MANAGED) throw new AccountOpsServiceError("EMAIL_PROVIDER_NOT_CONFIGURED", "Provider-managed aliases are not available in Phase 2A.");
    const normalizedDomain = validateDomainName(input.domain);
    const duplicate = loadSnapshot().emailDomains.find((row) => row.status !== EMAIL_DOMAIN_STATUSES.ARCHIVED && row.domain?.toLowerCase() === normalizedDomain);
    if (duplicate) throw new AccountOpsServiceError("DUPLICATE_DOMAIN", "That email domain is already registered.");
    const record = await collections.emailDomains.create({
      ...input,
      domain: normalizedDomain,
      mode: requestedMode,
      status: requestedMode === EMAIL_DOMAIN_MODES.CATCH_ALL ? EMAIL_DOMAIN_STATUSES.CONFIGURED : EMAIL_DOMAIN_STATUSES.NOT_CONFIGURED,
      catchAllOwnerConfirmedAt: null,
    });
    return response(record, { type: "EMAIL_DOMAIN_CREATED", title: `Email domain added: ${record.domain}` });
  }
  async function updateEmailDomain(id, patch, expectedVersion) {
    const requestedMode = hasOwn(patch, "mode") ? String(patch.mode).toUpperCase() : null;
    if (requestedMode === EMAIL_DOMAIN_MODES.PROVIDER_MANAGED) throw new AccountOpsServiceError("EMAIL_PROVIDER_NOT_CONFIGURED", "Provider-managed aliases are not available in Phase 2A.");
    if (hasOwn(patch, "catchAllOwnerConfirmedAt") || hasOwn(patch, "status")) throw new AccountOpsServiceError("OWNER_CONFIRMATION_METHOD_REQUIRED", "Use the explicit catch-all confirmation action.");
    const current = requireRecord("emailDomains", id, "email domain");
    const normalizedDomain = hasOwn(patch, "domain") ? validateDomainName(patch.domain) : current.domain;
    const nextMode = requestedMode || current.mode;
    const nextProviderId = hasOwn(patch, "providerId") ? String(patch.providerId || "").trim() : current.providerId;
    const configurationChanged = normalizedDomain !== current.domain || nextMode !== current.mode || nextProviderId !== current.providerId;
    if (normalizedDomain !== current.domain) {
      const duplicate = loadSnapshot().emailDomains.find((row) => row.id !== id && row.status !== EMAIL_DOMAIN_STATUSES.ARCHIVED && row.domain?.toLowerCase() === normalizedDomain);
      if (duplicate) throw new AccountOpsServiceError("DUPLICATE_DOMAIN", "That email domain is already registered.");
    }
    if (configurationChanged && loadSnapshot().emailAliases.some((alias) => alias.domainId === id && alias.status !== EMAIL_ALIAS_STATUSES.ARCHIVED)) {
      throw new AccountOpsServiceError("EMAIL_DOMAIN_IN_USE", "Archive connected aliases before changing this domain or its delivery mode.");
    }
    const nextPatch = {
      ...patch,
      ...(hasOwn(patch, "domain") ? { domain: normalizedDomain } : {}),
      ...(hasOwn(patch, "mode") ? { mode: nextMode } : {}),
      ...(configurationChanged ? {
        catchAllOwnerConfirmedAt: null,
        status: nextMode === EMAIL_DOMAIN_MODES.CATCH_ALL ? EMAIL_DOMAIN_STATUSES.CONFIGURED : EMAIL_DOMAIN_STATUSES.NOT_CONFIGURED,
      } : {}),
    };
    const record = await collections.emailDomains.update(id, nextPatch, requireExpected(current, expectedVersion));
    return response(record, { type: "EMAIL_DOMAIN_UPDATED", title: `Email domain updated: ${record.domain}` });
  }
  async function confirmCatchAllDomain(id, expectedVersion) {
    const current = requireRecord("emailDomains", id, "email domain");
    if (current.mode !== EMAIL_DOMAIN_MODES.CATCH_ALL) throw new AccountOpsServiceError("CATCH_ALL_REQUIRED", "Only a catch-all domain can be owner-confirmed.");
    const timestamp = normalizedNow(now);
    const record = await collections.emailDomains.update(id, { catchAllOwnerConfirmedAt: timestamp, status: EMAIL_DOMAIN_STATUSES.OWNER_CONFIRMED }, requireExpected(current, expectedVersion));
    return response(record, { type: "CATCH_ALL_CONFIRMED", title: `Catch-all delivery confirmed: ${record.domain}` });
  }
  async function archiveEmailDomain(id, expectedVersion) {
    const current = requireRecord("emailDomains", id, "email domain");
    if (loadSnapshot().emailAliases.some((alias) => alias.domainId === id && alias.status !== EMAIL_ALIAS_STATUSES.ARCHIVED)) {
      throw new AccountOpsServiceError("EMAIL_DOMAIN_IN_USE", "Archive connected aliases before archiving this domain.");
    }
    const record = await collections.emailDomains.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "EMAIL_DOMAIN_ARCHIVED", title: `Email domain archived: ${record.domain}` });
  }

  function generateAliasDraft(input) {
    assertSafeAccountOpsInput(input);
    const domain = requireRecord("emailDomains", input.domainId, "email domain");
    const profile = input.profileId ? requireRecord("profiles", input.profileId, "profile") : null;
    const retailer = input.retailerId ? requireRetailer(input.retailerId) : null;
    return generateEmailAlias({ ...input, domainRecord: domain, domain: domain.domain, profile, retailer, existingAliases: loadSnapshot().emailAliases, randomSource });
  }
  async function createEmailAlias(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input); assertReferences(input);
    assertAliasDomain(input);
    const normalizedAddress = validateEmailAddress(input.aliasAddress).aliasAddress;
    const existing = loadSnapshot().emailAliases.find((row) => row.status !== EMAIL_ALIAS_STATUSES.ARCHIVED && row.aliasAddress.toLowerCase() === normalizedAddress);
    if (existing) throw new AccountOpsServiceError("DUPLICATE_ALIAS", "That email alias already exists.");
    const record = await collections.emailAliases.create({
      ...input,
      aliasAddress: normalizedAddress,
      status: EMAIL_ALIAS_STATUSES.PENDING,
      provisioningState: ALIAS_PROVISIONING_STATES.GENERATED_LOCAL,
      verificationState: VERIFICATION_STATES.UNKNOWN,
      providerExternalId: "",
      forwardingDestinationMetadata: {},
      provenance: ACCOUNT_OPS_PROVENANCE.GENERATED_LOCAL,
      disabledAt: null,
    });
    return response(record, { type: "EMAIL_ALIAS_CREATED", title: `Alias generated: ${record.aliasAddress}`, profileId: record.profileId, retailerId: record.retailerId, aliasId: record.id });
  }
  async function updateEmailAlias(id, patch, expectedVersion) {
    const prohibited = ["aliasAddress", "domain", "localPart", "domainId", "provider", "providerExternalId", "provisioningState", "verificationState", "status", "disabledAt", "provenance"].find((field) => hasOwn(patch, field));
    if (prohibited) throw new AccountOpsServiceError("ALIAS_STATE_METHOD_REQUIRED", `Use an explicit alias action to change ${prohibited}.`);
    assertReferences(patch);
    const current = requireRecord("emailAliases", id, "email alias");
    const next = { ...current, ...patch };
    const inconsistent = loadSnapshot().storeAccounts.find((account) => account.aliasId === id
      && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED
      && ((next.profileId && next.profileId !== account.profileId) || (next.retailerId && next.retailerId !== account.retailerId)));
    if (inconsistent) throw new AccountOpsServiceError("ALIAS_ACCOUNT_RELATION_CONFLICT", "Update or disconnect connected store accounts before changing this alias relationship.", { accountId: inconsistent.id });
    const record = await collections.emailAliases.update(id, patch, requireExpected(current, expectedVersion));
    return response(record, { type: "EMAIL_ALIAS_UPDATED", title: `Alias updated: ${record.aliasAddress}`, profileId: record.profileId, retailerId: record.retailerId, aliasId: id });
  }
  async function confirmCatchAllReceiving(id, expectedVersion) {
    const current = requireRecord("emailAliases", id, "email alias");
    const domain = requireRecord("emailDomains", current.domainId, "email domain");
    if (domain.mode !== EMAIL_DOMAIN_MODES.CATCH_ALL || !domain.catchAllOwnerConfirmedAt) {
      throw new AccountOpsServiceError("CATCH_ALL_NOT_CONFIRMED", "Confirm the catch-all domain before marking an alias as receiving mail.");
    }
    const record = await collections.emailAliases.update(id, {
      status: EMAIL_ALIAS_STATUSES.ACTIVE,
      provisioningState: ALIAS_PROVISIONING_STATES.RECEIVING_CONFIRMED,
      verificationState: VERIFICATION_STATES.VERIFIED,
      provenance: ACCOUNT_OPS_PROVENANCE.OWNER_ENTERED,
    }, requireExpected(current, expectedVersion));
    return response(record, { type: "EMAIL_ALIAS_RECEIVING_CONFIRMED", title: `Alias receiving confirmed: ${record.aliasAddress}`, aliasId: id, profileId: record.profileId, retailerId: record.retailerId });
  }
  async function disableEmailAlias(id, expectedVersion) {
    const current = requireRecord("emailAliases", id, "email alias");
    const record = await collections.emailAliases.update(id, { status: EMAIL_ALIAS_STATUSES.DISABLED, disabledAt: normalizedNow(now) }, requireExpected(current, expectedVersion));
    return response(record, { type: "EMAIL_ALIAS_DISABLED", title: `Alias disabled: ${record.aliasAddress}`, aliasId: id, profileId: record.profileId, retailerId: record.retailerId });
  }
  async function archiveEmailAlias(id, expectedVersion) {
    const current = requireRecord("emailAliases", id, "email alias");
    if (loadSnapshot().storeAccounts.some((account) => account.aliasId === id && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED)) {
      throw new AccountOpsServiceError("ALIAS_IN_USE", "Disconnect active store accounts before archiving this alias.");
    }
    const record = await collections.emailAliases.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "EMAIL_ALIAS_ARCHIVED", title: `Alias archived: ${record.aliasAddress}`, aliasId: id });
  }

  async function createRetailer(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input);
    if (input.automatedProvisioningSupported === true) throw new AccountOpsServiceError("AUTOMATION_NOT_SUPPORTED", "Phase 2A does not support automated retailer-account provisioning.");
    const record = await collections.retailers.create({ ...input, custom: true, automatedProvisioningSupported: false, status: RECORD_STATUS.ACTIVE });
    return response(record, { type: "RETAILER_CREATED", title: `Retailer added: ${record.displayName}`, retailerId: record.id });
  }
  async function updateRetailer(id, patch, expectedVersion) {
    assertNotDirectArchive(patch);
    if (isRetailerPresetId(id)) throw new AccountOpsServiceError("PRESET_RETAILER_READ_ONLY", "Code retailer presets are read-only.");
    const current = requireRecord("retailers", id, "retailer");
    const record = await collections.retailers.update(id, { ...patch, automatedProvisioningSupported: false, custom: true }, requireExpected(current, expectedVersion));
    return response(record, { type: "RETAILER_UPDATED", title: `Retailer updated: ${record.displayName}`, retailerId: id });
  }
  async function archiveRetailer(id, expectedVersion) {
    if (isRetailerPresetId(id)) throw new AccountOpsServiceError("PRESET_RETAILER_READ_ONLY", "Code retailer presets are read-only.");
    const current = requireRecord("retailers", id, "retailer");
    if (loadSnapshot().storeAccounts.some((account) => account.retailerId === id && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED)) {
      throw new AccountOpsServiceError("RETAILER_IN_USE", "Archive connected store accounts before archiving this retailer.");
    }
    const record = await collections.retailers.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "RETAILER_ARCHIVED", title: `Retailer archived: ${record.displayName}`, retailerId: id });
  }

  async function createStoreAccount(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input); assertReferences(input);
    assertAccountAliasRelationship(input);
    const record = await collections.storeAccounts.create({
      ...input,
      status: STORE_ACCOUNT_STATUSES.SETUP,
      setupStage: ACCOUNT_SETUP_STAGES.PREPARED,
      emailVerificationStatus: VERIFICATION_STATES.PENDING,
      phoneVerificationStatus: input.phoneVerificationRequired ? VERIFICATION_STATES.PENDING : VERIFICATION_STATES.NOT_REQUIRED,
      securityStatus: "UNKNOWN",
      credentialReference: normalizeCredentialReference(input.credentialReference),
      ownerConfirmedReadyAt: null,
      lastVerifiedAt: null,
    });
    return response(record, { type: "STORE_ACCOUNT_CREATED", title: `Store account prepared: ${record.accountDisplayName || record.username || "Account"}`, profileId: record.profileId, accountId: record.id, retailerId: record.retailerId });
  }
  async function updateStoreAccount(id, patch, expectedVersion) {
    assertSafeAccountOpsInput(patch);
    const unexpected = Object.keys(patch).find((field) => !EDITABLE_ACCOUNT_FIELDS.has(field));
    if (unexpected) throw new AccountOpsServiceError("ACCOUNT_STATE_METHOD_REQUIRED", `Use an explicit setup action to change ${unexpected}.`);
    if (patch.status === STORE_ACCOUNT_STATUSES.READY || patch.status === STORE_ACCOUNT_STATUSES.ARCHIVED) {
      throw new AccountOpsServiceError("ACCOUNT_STATE_METHOD_REQUIRED", "Ready and archived states require explicit owner actions.");
    }
    assertReferences(patch);
    const current = requireRecord("storeAccounts", id, "store account");
    assertAccountAliasRelationship({ ...current, ...patch });
    const identityChanged = ["retailerId", "profileId", "aliasId"].some((field) => hasOwn(patch, field) && (patch[field] || null) !== (current[field] || null));
    const nextPatch = current.status === STORE_ACCOUNT_STATUSES.READY && identityChanged
      ? {
        ...patch,
        status: patch.status && patch.status !== STORE_ACCOUNT_STATUSES.READY ? patch.status : STORE_ACCOUNT_STATUSES.SETUP,
        setupStage: ACCOUNT_SETUP_STAGES.PREPARED,
        emailVerificationStatus: VERIFICATION_STATES.PENDING,
        phoneVerificationStatus: current.phoneVerificationRequired ? VERIFICATION_STATES.PENDING : VERIFICATION_STATES.NOT_REQUIRED,
        securityStatus: "UNKNOWN",
        ownerConfirmedReadyAt: null,
        lastVerifiedAt: null,
      }
      : patch;
    const record = await collections.storeAccounts.update(id, nextPatch, requireExpected(current, expectedVersion));
    return response(record, { type: "STORE_ACCOUNT_UPDATED", title: `Store account updated: ${record.accountDisplayName || record.username || "Account"}`, profileId: record.profileId, accountId: id, retailerId: record.retailerId });
  }
  async function accountSetupUpdate(id, patch, event, expectedVersion, extras = {}) {
    const current = requireRecord("storeAccounts", id, "store account");
    const record = await collections.storeAccounts.update(id, patch, requireExpected(current, expectedVersion));
    return response(record, { type: event.type, title: event.title, profileId: record.profileId, accountId: id, retailerId: record.retailerId }, extras);
  }
  async function openStoreAccountSignup(id, expectedVersion) {
    const current = requireRecord("storeAccounts", id, "store account");
    const setupUrl = retailerSetupUrl(requireRetailer(current.retailerId));
    return accountSetupUpdate(id, { setupStage: ACCOUNT_SETUP_STAGES.SIGNUP_OPENED, status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION }, { type: "STORE_SIGNUP_OPENED", title: "Retailer signup opened by owner" }, expectedVersion, { setupUrl, ownerActionRequired: true, formSubmitted: false });
  }
  async function confirmAccountEmailVerified(id, expectedVersion) {
    const current = requireRecord("storeAccounts", id, "store account");
    const nextStage = current.phoneVerificationRequired ? ACCOUNT_SETUP_STAGES.PHONE_VERIFICATION : ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION;
    const result = await accountSetupUpdate(id, { emailVerificationStatus: VERIFICATION_STATES.VERIFIED, setupStage: nextStage, status: STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION }, { type: "ACCOUNT_EMAIL_VERIFIED", title: "Email verification confirmed by owner" }, expectedVersion);
    if (current.aliasId) {
      const alias = requireRecord("emailAliases", current.aliasId, "email alias");
      await collections.emailAliases.update(alias.id, { verificationState: VERIFICATION_STATES.VERIFIED }, alias.recordVersion);
      result.snapshot = loadSnapshot();
    }
    return result;
  }
  async function confirmAccountPhoneVerified(id, expectedVersion) {
    const current = requireRecord("storeAccounts", id, "store account");
    if (!current.phoneVerificationRequired) throw new AccountOpsServiceError("PHONE_VERIFICATION_NOT_REQUIRED", "This account does not require phone verification.");
    if (current.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED) throw new AccountOpsServiceError("EMAIL_VERIFICATION_REQUIRED", "Confirm email verification first.");
    return accountSetupUpdate(id, { phoneVerificationStatus: VERIFICATION_STATES.VERIFIED, setupStage: ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION }, { type: "ACCOUNT_PHONE_VERIFIED", title: "Phone verification confirmed by owner" }, expectedVersion);
  }
  async function confirmCredentialStored(id, credentialReference, expectedVersion) {
    const normalized = normalizeCredentialReference(credentialReference);
    if (!normalized || normalized.provider === CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE) throw new AccountOpsServiceError("SECURE_CREDENTIAL_REFERENCE_REQUIRED", "Select a supported external or operating-system secure store reference.");
    return accountSetupUpdate(id, { credentialReference: normalized }, { type: "CREDENTIAL_REFERENCE_RECORDED", title: "Secure credential reference recorded" }, expectedVersion);
  }
  async function confirmStoreAccountTested(id, expectedVersion) {
    return accountSetupUpdate(id, { securityStatus: "HEALTHY" }, { type: "STORE_ACCOUNT_TESTED", title: "Store account test confirmed by owner" }, expectedVersion);
  }
  async function confirmStoreAccountReady(id, expectedVersion) {
    const current = requireRecord("storeAccounts", id, "store account");
    const failures = [];
    if (current.aliasId) {
      const alias = getRecord("emailAliases", current.aliasId);
      if (!alias || alias.status === EMAIL_ALIAS_STATUSES.ARCHIVED) failures.push("connected email alias");
      else {
        if ([EMAIL_ALIAS_STATUSES.DISABLED, EMAIL_ALIAS_STATUSES.ERROR].includes(alias.status)
          || alias.provisioningState === ALIAS_PROVISIONING_STATES.FAILED) failures.push("usable email alias");
        if (alias.profileId && alias.profileId !== current.profileId) failures.push("email alias profile relationship");
        if (alias.retailerId && alias.retailerId !== current.retailerId) failures.push("email alias retailer relationship");
      }
    }
    if (current.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED && current.emailVerificationStatus !== VERIFICATION_STATES.NOT_REQUIRED) failures.push("email verification");
    if (current.phoneVerificationRequired && current.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED) failures.push("phone verification");
    if (!current.credentialReference || current.credentialReference.provider === CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE) failures.push("secure credential reference");
    if (current.securityStatus !== "HEALTHY") failures.push("owner account test");
    if (failures.length) throw new AccountOpsServiceError("ACCOUNT_NOT_READY", `Complete ${failures.join(", ")} before marking this account Ready.`, { failures });
    const timestamp = normalizedNow(now);
    return accountSetupUpdate(id, { status: STORE_ACCOUNT_STATUSES.READY, setupStage: ACCOUNT_SETUP_STAGES.READY, ownerConfirmedReadyAt: timestamp, lastVerifiedAt: timestamp }, { type: "STORE_ACCOUNT_READY", title: "Store account marked Ready by owner" }, expectedVersion);
  }
  async function archiveStoreAccount(id, expectedVersion) {
    const current = requireRecord("storeAccounts", id, "store account");
    const record = await collections.storeAccounts.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "STORE_ACCOUNT_ARCHIVED", title: "Store account archived", profileId: record.profileId, accountId: id, retailerId: record.retailerId });
  }

  async function createTask(input) {
    assertSafeAccountOpsInput(input); assertNoCallerId(input);
    const nextInput = taskInputWithAccountRelationships(input);
    assertReferences(nextInput);
    const record = await collections.tasks.create({ ...nextInput, status: ACCOUNT_TASK_STATUSES.OPEN, completedAt: null });
    return response(record, { type: "ACCOUNT_TASK_CREATED", title: `Task created: ${record.title}`, profileId: record.profileId, accountId: record.accountId, retailerId: record.retailerId });
  }
  async function updateTask(id, patch, expectedVersion) {
    if (hasOwn(patch, "status") || hasOwn(patch, "completedAt")) throw new AccountOpsServiceError("TASK_STATE_METHOD_REQUIRED", "Use Complete or Dismiss to change task state.");
    const current = requireRecord("tasks", id, "task");
    const nextInput = taskInputWithAccountRelationships({ ...current, ...patch });
    assertReferences(nextInput);
    const nextPatch = { ...patch, profileId: nextInput.profileId || null, retailerId: nextInput.retailerId || null };
    const record = await collections.tasks.update(id, nextPatch, requireExpected(current, expectedVersion));
    return response(record, { type: "ACCOUNT_TASK_UPDATED", title: `Task updated: ${record.title}`, profileId: record.profileId, accountId: record.accountId, retailerId: record.retailerId });
  }
  async function finishTask(id, status, expectedVersion) {
    const current = requireRecord("tasks", id, "task");
    const record = await collections.tasks.update(id, { status, completedAt: normalizedNow(now) }, requireExpected(current, expectedVersion));
    return response(record, { type: status === ACCOUNT_TASK_STATUSES.DONE ? "ACCOUNT_TASK_COMPLETED" : "ACCOUNT_TASK_DISMISSED", title: `${status === ACCOUNT_TASK_STATUSES.DONE ? "Task completed" : "Task dismissed"}: ${record.title}`, profileId: record.profileId, accountId: record.accountId, retailerId: record.retailerId });
  }
  const completeTask = (id, expectedVersion) => finishTask(id, ACCOUNT_TASK_STATUSES.DONE, expectedVersion);
  const dismissTask = (id, expectedVersion) => finishTask(id, ACCOUNT_TASK_STATUSES.DISMISSED, expectedVersion);
  async function archiveTask(id, expectedVersion) {
    const current = requireRecord("tasks", id, "task");
    const record = await collections.tasks.archive(id, requireExpected(current, expectedVersion));
    return response(record, { type: "ACCOUNT_TASK_ARCHIVED", title: `Task archived: ${record.title}` });
  }
  async function generateAccountHealthTasks(accountId) {
    const account = requireRecord("storeAccounts", accountId, "store account");
    const snapshot = loadSnapshot();
    const health = deriveAccountHealth(account, { ...snapshot, retailers: listRetailers(), asOf: normalizedNow(now) });
    const mapping = {
      EMAIL_NOT_VERIFIED: ACCOUNT_TASK_TYPES.VERIFY_EMAIL,
      PHONE_NOT_VERIFIED: ACCOUNT_TASK_TYPES.VERIFY_PHONE,
      CREDENTIAL_REFERENCE_MISSING: ACCOUNT_TASK_TYPES.SECURITY_REVIEW,
      SECURITY_REVIEW: ACCOUNT_TASK_TYPES.SECURITY_REVIEW,
      SETUP_INCOMPLETE: ACCOUNT_TASK_TYPES.COMPLETE_SETUP,
      ACCOUNT_LOCKED: ACCOUNT_TASK_TYPES.ACCOUNT_PROBLEM,
      ALIAS_DISABLED: ACCOUNT_TASK_TYPES.ACCOUNT_PROBLEM,
      DUPLICATE_ALIAS: ACCOUNT_TASK_TYPES.ACCOUNT_PROBLEM,
    };
    const created = [];
    for (const healthReason of health.reasons) {
      const type = mapping[healthReason.code];
      if (!type) continue;
      const exists = loadSnapshot().tasks.some((task) => task.accountId === accountId && task.type === type && task.status === ACCOUNT_TASK_STATUSES.OPEN);
      if (!exists) created.push((await createTask({ type, title: healthReason.message, accountId, profileId: account.profileId, retailerId: account.retailerId, source: "ACCOUNT_HEALTH" })).record);
    }
    return { records: created, health, snapshot: loadSnapshot() };
  }

  async function bulkAssignProfileGroup(profileIds, profileGroupId) {
    requireRecord("profileGroups", profileGroupId, "profile group");
    const ids = [...new Set(profileIds || [])];
    if (!ids.length || ids.length > 100) throw new AccountOpsServiceError("BULK_SELECTION_INVALID", "Select between 1 and 100 profiles.");
    ids.forEach((id) => requireRecord("profiles", id, "profile"));
    const records = [];
    for (const id of ids) records.push((await updateProfile(id, { profileGroupId })).record);
    return { records, snapshot: loadSnapshot() };
  }
  async function bulkAssignRetailer(accountIds, retailerId) {
    requireRetailer(retailerId);
    const ids = [...new Set(accountIds || [])];
    if (!ids.length || ids.length > 100) throw new AccountOpsServiceError("BULK_SELECTION_INVALID", "Select between 1 and 100 store accounts.");
    ids.forEach((id) => {
      const account = requireRecord("storeAccounts", id, "store account");
      assertAccountAliasRelationship({ ...account, retailerId });
    });
    const records = [];
    for (const id of ids) records.push((await updateStoreAccount(id, { retailerId })).record);
    return { records, snapshot: loadSnapshot() };
  }
  async function bulkArchive(collection, ids) {
    if (!ARCHIVABLE_COLLECTIONS.has(collection)) throw new AccountOpsServiceError("BULK_ARCHIVE_UNSUPPORTED", "This collection cannot be bulk archived.");
    const selected = [...new Set(ids || [])];
    if (!selected.length || selected.length > 100) throw new AccountOpsServiceError("BULK_SELECTION_INVALID", "Select between 1 and 100 records.");
    selected.forEach((id) => {
      const current = requireRecord(collection, id, collection);
      const snapshot = loadSnapshot();
      if (collection === "profiles" && snapshot.storeAccounts.some((account) => account.profileId === id && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED)) throw new AccountOpsServiceError("PROFILE_IN_USE", "Archive connected store accounts before archiving this profile.");
      if (collection === "emailAliases" && snapshot.storeAccounts.some((account) => account.aliasId === id && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED)) throw new AccountOpsServiceError("ALIAS_IN_USE", "Disconnect active store accounts before archiving this alias.");
      if (collection === "retailers" && (isRetailerPresetId(id) || snapshot.storeAccounts.some((account) => account.retailerId === id && account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED))) throw new AccountOpsServiceError("RETAILER_IN_USE", "Preset or connected retailers cannot be archived.");
      if (!current) throw new AccountOpsServiceError("RELATED_RECORD_REQUIRED", "The selected record is unavailable.");
    });
    const method = { profiles: archiveProfile, emailAliases: archiveEmailAlias, retailers: archiveRetailer, storeAccounts: archiveStoreAccount, tasks: archiveTask }[collection];
    const records = [];
    for (const id of selected) records.push((await method(id)).record);
    return { records, snapshot: loadSnapshot() };
  }
  async function bulkCreateTasks(input) {
    assertSafeAccountOpsInput(input);
    const targets = Array.isArray(input.targets) ? input.targets : [];
    if (!targets.length || targets.length > 100) throw new AccountOpsServiceError("BULK_SELECTION_INVALID", "Select between 1 and 100 task targets.");
    const candidates = targets.map((target) => {
      assertSafeAccountOpsInput(target);
      const candidate = taskInputWithAccountRelationships({ ...input.task, ...target });
      assertNoCallerId(candidate);
      assertReferences(candidate);
      normalizeAccountTask({ ...candidate, status: ACCOUNT_TASK_STATUSES.OPEN, completedAt: null });
      return candidate;
    });
    const records = [];
    for (const candidate of candidates) records.push((await createTask(candidate)).record);
    return { records, snapshot: loadSnapshot() };
  }
  function exportSelectedMetadata(collection, ids) {
    if (!ARCHIVABLE_COLLECTIONS.has(collection) && collection !== "profileGroups" && collection !== "emailDomains") {
      throw new AccountOpsServiceError("METADATA_EXPORT_UNSUPPORTED", "This Account Ops collection cannot be exported through the selection helper.");
    }
    const selected = [...new Set(ids || [])];
    if (!selected.length || selected.length > 100) throw new AccountOpsServiceError("BULK_SELECTION_INVALID", "Select between 1 and 100 records.");
    const records = selected.map((id) => {
      const record = loadSnapshot()[collection]?.find((row) => row.id === id);
      if (!record) throw new AccountOpsServiceError("RELATED_RECORD_REQUIRED", "A selected metadata record is unavailable.", { collection, id });
      return clone(record);
    });
    return Object.freeze({ format: "code3.account-ops.metadata-selection", formatVersion: 1, collection, records });
  }

  function summary(options = {}) { return summarizeAccountOps(loadSnapshot(), { ...options, retailers: listRetailers({ includeArchived: true }) }); }
  function search(query = "", filters = {}) { return searchAccountOps(loadSnapshot(), query, { ...filters, retailers: listRetailers({ includeArchived: true }) }); }
  function healthForAccount(accountId, options = {}) {
    return deriveAccountHealth(requireRecord("storeAccounts", accountId, "store account"), { ...loadSnapshot(), retailers: listRetailers({ includeArchived: true }), asOf: options.asOf || normalizedNow(now), staleAfterDays: options.staleAfterDays });
  }

  return Object.freeze({
    mode: "LOCAL_ONLY",
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    loadSnapshot,
    snapshot: loadSnapshot,
    listRetailers,
    getRetailer,
    summary,
    search,
    healthForAccount,
    generatePassword: (passwordOptions = {}) => generateStrongPassword({ ...passwordOptions, randomSource: passwordOptions.randomSource || randomSource }),
    createProfileGroup, updateProfileGroup, archiveProfileGroup,
    createProfile, updateProfile, archiveProfile,
    createEmailDomain, updateEmailDomain, confirmCatchAllDomain, archiveEmailDomain,
    generateAliasDraft, createEmailAlias, saveGeneratedAlias: createEmailAlias, updateEmailAlias, confirmCatchAllReceiving, disableEmailAlias, archiveEmailAlias,
    createRetailer, updateRetailer, archiveRetailer,
    createStoreAccount, updateStoreAccount, openStoreAccountSignup, confirmAccountEmailVerified, confirmAccountPhoneVerified,
    confirmCredentialStored, confirmStoreAccountTested, confirmStoreAccountReady, archiveStoreAccount,
    createTask, updateTask, completeTask, dismissTask, archiveTask, generateAccountHealthTasks,
    bulkAssignProfileGroup, bulkAssignRetailer, bulkArchive, bulkCreateTasks, exportSelectedMetadata,
  });
}
