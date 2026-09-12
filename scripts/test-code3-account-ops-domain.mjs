import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ACCOUNT_HEALTH_STATES,
  ACCOUNT_OPS_COLLECTIONS,
  ACCOUNT_OPS_PERSISTENCE_CONTRACT,
  ACCOUNT_OPS_RETAILER_PRESETS,
  ACCOUNT_OPS_SCHEMA_VERSION,
  ACCOUNT_OPS_STORAGE_KEY,
  ACCOUNT_SETUP_STAGES,
  ACCOUNT_TASK_STATUSES,
  ACCOUNT_TASK_TYPES,
  ALIAS_PROVISIONING_STATES,
  CREDENTIAL_REFERENCE_PROVIDERS,
  EMAIL_ALIAS_STATUSES,
  EMAIL_DOMAIN_MODES,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
  assertSafeAccountOpsInput,
  createAccountOpsService,
  createEmailProviderAdapter,
  createFutureOrderCandidate,
  generateEmailAlias,
  generateStrongPassword,
  normalizeFutureInboxMessageMetadata,
  passwordMeetsPolicy,
  validateDomainName,
  validateEmailLocalPart,
} from "../src/features/accountOps/index.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function match(value, expression, message) { assert.match(value, expression, message); assertions += 1; }
function throws(fn, predicate, message) { assert.throws(fn, predicate, message); assertions += 1; }
function doesNotThrow(fn, message) { assert.doesNotThrow(fn, message); assertions += 1; }
async function rejects(fn, predicate, message) { await assert.rejects(fn, predicate, message); assertions += 1; }

class MemoryStorage {
  constructor() { this.values = new Map(); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort()); }
}

function deterministicRandom(seed = 0) {
  let value = seed;
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) { bytes[index] = value % 256; value = (value + 37) % 256; }
      return bytes;
    },
  };
}

function harness() {
  const storage = new MemoryStorage();
  let id = 0;
  let tick = 0;
  const service = createAccountOpsService({
    storage,
    idFactory: (collection) => `${collection}:test-${++id}`,
    randomSource: deterministicRandom(5),
    now: () => new Date(Date.UTC(2026, 7, 26, 14, tick++, 0)).toISOString(),
  });
  return { storage, service };
}

async function basicRecords(service, options = {}) {
  const profile = (await service.createProfile({ displayName: options.profileName || "Business 01", aliasLabel: "business01", profileGroupId: "profile-group-preset:business" })).record;
  const emailDomain = (await service.createEmailDomain({ domain: options.domain || "example.test", mode: options.mode || EMAIL_DOMAIN_MODES.CATCH_ALL })).record;
  const draft = service.generateAliasDraft({ domainId: emailDomain.id, profileId: profile.id, retailerId: options.retailerId || "retailer-preset:target", template: options.template });
  const alias = (await service.createEmailAlias(draft)).record;
  return { profile, emailDomain, alias };
}

equal(ACCOUNT_OPS_STORAGE_KEY, "code3.account-ops.v1");
equal(ACCOUNT_OPS_SCHEMA_VERSION, 1);
deepEqual(ACCOUNT_OPS_COLLECTIONS, ["profileGroups", "profiles", "emailDomains", "emailAliases", "retailers", "storeAccounts", "tasks", "activity"]);
equal(ACCOUNT_OPS_PERSISTENCE_CONTRACT.authoritativeMode, "LOCAL_ONLY");
equal(ACCOUNT_OPS_PERSISTENCE_CONTRACT.remoteActive, false);
equal(ACCOUNT_OPS_PERSISTENCE_CONTRACT.automaticSignup, false);
equal(ACCOUNT_OPS_PERSISTENCE_CONTRACT.automaticVerification, false);
equal(ACCOUNT_OPS_PERSISTENCE_CONTRACT.automaticPurchasing, false);
equal(ACCOUNT_OPS_PERSISTENCE_CONTRACT.plaintextCredentialStorage, false);

for (const option of ["mode", "persistenceMode", "remoteDataSource", "request", "explicitRemoteActivation", "syncEngine", "migrationApply", "rollbackExecutor"]) {
  throws(() => createAccountOpsService({ [option]: option === "mode" ? "REMOTE_ACTIVE" : {} }), (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE", `${option} must not be caller-selectable`);
}

{
  const { service } = harness();
  equal(service.mode, "LOCAL_ONLY");
  equal(service.authoritative, "LOCAL_ONLY");
  equal(service.remoteActive, false);
  equal(service.loadSnapshot().schemaVersion, 1);
  equal(service.loadSnapshot().profileGroups.length, 4);
  equal(service.loadSnapshot().retailers.length, 0, "static retailers are not persisted");
  equal(service.listRetailers().length, ACCOUNT_OPS_RETAILER_PRESETS.length);
  ok(service.listRetailers().every((retailer) => retailer.id.startsWith("retailer-preset:")));
  ok(!Object.keys(service).some((key) => /delete|remove/i.test(key)), "no destructive delete API is exposed");
  equal(typeof service.loadSnapshot, "function");
  equal(typeof service.summary, "function");
  equal(typeof service.search, "function");
}

for (const payload of [
  { nested: { ownerId: "forged" } },
  { nested: { ownerSubject: "forged" } },
  { nested: { role: "OWNER" } },
  { nested: { session: "forged" } },
  { nested: { accessToken: "forged" } },
  { nested: { password: "forged" } },
  { nested: { otp: "123456" } },
  { nested: { cvv: "123" } },
  { nested: { retailerPassword: "forged" } },
  { nested: { accountOtp: "123456" } },
  { nested: { setupPassphrase: "forged" } },
  { nested: { retailerCredentials: { value: "forged" } } },
  { nested: { ownerAuthority: "forged" } },
  { nested: { nestedOwnerSubject: "forged" } },
  { externalIdentity: { isOwner: true } },
  { externalIdentity: { userRole: "OWNER" } },
  { externalIdentity: { browserRole: "OWNER" } },
  { externalIdentity: { ownerPermission: "ALL" } },
  { externalIdentity: { authorizedOwner: true } },
  { externalIdentity: { oneTimeCode: "123456" } },
  { externalIdentity: { oneTimePin: "123456" } },
  { externalIdentity: { smsCode: "123456" } },
  { externalIdentity: { securityCode: "123456" } },
  { externalIdentity: { passcode: "123456" } },
]) {
  throws(() => assertSafeAccountOpsInput(payload), (error) => ["AUTHORITY_FIELD_REJECTED", "SECRET_FIELD_REJECTED"].includes(error.code));
}
throws(() => assertSafeAccountOpsInput(JSON.parse('{"safe":{"__proto__":{"polluted":true}}}')), (error) => error.code === "PROTOTYPE_KEY_REJECTED");
throws(() => assertSafeAccountOpsInput({ nested: Object.create({ unsafe: true }) }), (error) => error.code === "UNSAFE_OBJECT");
throws(() => validateDomainName("not a domain"), (error) => error.code === "INVALID_DOMAIN");
equal(validateDomainName("@Example.Test"), "example.test");
throws(() => validateEmailLocalPart("bad..dots"), (error) => error.code === "INVALID_LOCAL_PART");
equal(validateEmailLocalPart("valid.alias-1"), "valid.alias-1");

{
  const { storage, service } = harness();
  const group = (await service.createProfileGroup({ displayName: "Wholesale partners" })).record;
  equal(group.recordVersion, 1);
  const profile = (await service.createProfile({ displayName: "Business 02", profileGroupId: group.id, notes: "Owner-managed metadata" })).record;
  equal(profile.profileGroupId, group.id);
  const updated = (await service.updateProfile(profile.id, { displayName: "Business 02 updated" }, profile.recordVersion)).record;
  equal(updated.recordVersion, 2);
  equal(updated.displayName, "Business 02 updated");
  await rejects(() => service.updateProfile(profile.id, { status: "NOT_A_STATUS" }), (error) => error.code === "INVALID_ENUM", "profile status is enum-validated");
  await rejects(() => service.updateProfile(profile.id, { status: "ARCHIVED" }), (error) => error.code === "ARCHIVE_METHOD_REQUIRED");
  await rejects(() => service.archiveProfileGroup(group.id), (error) => error.code === "PROFILE_GROUP_IN_USE");
  const archivedProfile = (await service.archiveProfile(profile.id, updated.recordVersion)).record;
  equal(archivedProfile.status, "ARCHIVED");
  ok(archivedProfile.archivedAt);
  const archivedGroup = (await service.archiveProfileGroup(group.id)).record;
  equal(archivedGroup.status, "ARCHIVED");
  ok(storage.getItem(ACCOUNT_OPS_STORAGE_KEY));
}

{
  const { service } = harness();
  const emailDomain = (await service.createEmailDomain({ domain: "aliases.example", mode: EMAIL_DOMAIN_MODES.CATCH_ALL })).record;
  equal(emailDomain.status, "CONFIGURED");
  equal(emailDomain.catchAllOwnerConfirmedAt, null);
  const confirmed = (await service.confirmCatchAllDomain(emailDomain.id, emailDomain.recordVersion)).record;
  equal(confirmed.status, "OWNER_CONFIRMED");
  ok(confirmed.catchAllOwnerConfirmedAt);
  await rejects(() => service.createEmailDomain({ domain: "aliases.example" }), (error) => error.code === "DUPLICATE_DOMAIN");
  await rejects(() => service.createEmailDomain({ domain: " ALIASES.EXAMPLE " }), (error) => error.code === "DUPLICATE_DOMAIN", "domain uniqueness uses the normalized value");
  await rejects(() => service.createEmailDomain({ domain: "provider.example", mode: EMAIL_DOMAIN_MODES.PROVIDER_MANAGED }), (error) => error.code === "EMAIL_PROVIDER_NOT_CONFIGURED");
  await rejects(() => service.createEmailDomain({ domain: "provider-lower.example", mode: "provider_managed" }), (error) => error.code === "EMAIL_PROVIDER_NOT_CONFIGURED", "provider-managed mode cannot bypass the Phase 2A gate through casing");

  const mutableDomain = (await service.createEmailDomain({ domain: "mutable.example", mode: EMAIL_DOMAIN_MODES.CATCH_ALL })).record;
  const mutableProfile = (await service.createProfile({ displayName: "Mutable domain profile" })).record;
  const mutableAlias = service.generateAliasDraft({ domainId: mutableDomain.id, profileId: mutableProfile.id });
  await service.createEmailAlias(mutableAlias);
  await rejects(() => service.updateEmailDomain(mutableDomain.id, { domain: "changed.example" }), (error) => error.code === "EMAIL_DOMAIN_IN_USE", "connected aliases make their domain configuration immutable");
  await rejects(() => service.updateEmailDomain(mutableDomain.id, { mode: EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY }), (error) => error.code === "EMAIL_DOMAIN_IN_USE", "connected aliases protect their delivery-mode contract");

  const resetDomain = (await service.createEmailDomain({ domain: "reset.example", mode: EMAIL_DOMAIN_MODES.CATCH_ALL })).record;
  const resetConfirmed = (await service.confirmCatchAllDomain(resetDomain.id)).record;
  ok(resetConfirmed.catchAllOwnerConfirmedAt);
  const reset = (await service.updateEmailDomain(resetDomain.id, { domain: "reset-new.example", mode: EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY })).record;
  equal(reset.status, "NOT_CONFIGURED", "changing an unused domain resets its configuration state");
  equal(reset.catchAllOwnerConfirmedAt, null, "catch-all confirmation does not carry to a changed domain");
}

{
  const { service } = harness();
  const { profile, emailDomain, alias } = await basicRecords(service, { template: "{profile}.{store}.{sequence}" });
  match(alias.aliasAddress, /^business01\.target\.\d+@example\.test$/);
  equal(alias.provisioningState, ALIAS_PROVISIONING_STATES.GENERATED_LOCAL);
  equal(alias.status, EMAIL_ALIAS_STATUSES.PENDING);
  equal(alias.verificationState, VERIFICATION_STATES.UNKNOWN);
  equal(alias.providerExternalId, "");
  const confirmedDomain = (await service.confirmCatchAllDomain(emailDomain.id)).record;
  const receiving = (await service.confirmCatchAllReceiving(alias.id, alias.recordVersion)).record;
  equal(receiving.provisioningState, ALIAS_PROVISIONING_STATES.RECEIVING_CONFIRMED);
  equal(receiving.status, EMAIL_ALIAS_STATUSES.ACTIVE);
  equal(receiving.verificationState, VERIFICATION_STATES.VERIFIED);
  ok(confirmedDomain.catchAllOwnerConfirmedAt);
  await rejects(() => service.createEmailAlias({ ...service.generateAliasDraft({ domainId: emailDomain.id, profileId: profile.id }), aliasAddress: `x@other.example`, domain: "other.example", localPart: "x" }), (error) => error.code === "ALIAS_DOMAIN_MISMATCH");
  await rejects(() => service.createEmailAlias({ ...alias, id: undefined }), (error) => ["DUPLICATE_ALIAS", "CALLER_ID_REJECTED", "UNKNOWN_FIELD"].includes(error.code));
  await rejects(
    () => service.createEmailAlias({ ...service.generateAliasDraft({ domainId: emailDomain.id, profileId: profile.id }), aliasAddress: ` ${alias.aliasAddress.toUpperCase()} `, localPart: alias.localPart, domain: alias.domain }),
    (error) => error.code === "DUPLICATE_ALIAS",
    "alias uniqueness uses the normalized address",
  );
}

{
  const random = deterministicRandom(0);
  const first = generateEmailAlias({ domain: "example.test", template: "{store}-{profile}-{sequence}", retailer: { displayName: "Very Long Store" }, profile: { displayName: "Business 1" }, existingAliases: [], randomSource: random, sequence: 1 });
  const second = generateEmailAlias({ domain: "example.test", template: "{store}-{profile}-{sequence}", retailer: { displayName: "Very Long Store" }, profile: { displayName: "Business 1" }, existingAliases: [first], randomSource: random, sequence: 1 });
  equal(first.aliasAddress, "very-long-store-business-1-1@example.test");
  equal(second.aliasAddress, "very-long-store-business-1-2@example.test");
  throws(() => generateEmailAlias({ domain: "example.test", template: "{unknown}", randomSource: random }), (error) => error.code === "UNKNOWN_ALIAS_TOKEN");
}

{
  const random = deterministicRandom(12);
  const generated = generateStrongPassword({ length: 24, randomSource: random });
  equal(generated.length, 24);
  equal(passwordMeetsPolicy(generated), true);
  ok(/[A-Z]/.test(generated));
  ok(/[a-z]/.test(generated));
  ok(/[0-9]/.test(generated));
  ok(/[^A-Za-z0-9]/.test(generated));
  throws(() => generateStrongPassword({ length: 12, randomSource: random }), RangeError);
  throws(() => generateStrongPassword({ length: 20, randomSource: {} }), (error) => error.code === "SECURE_RANDOM_UNAVAILABLE");
  const { storage, service } = harness();
  const ephemeral = service.generatePassword({ length: 20 });
  equal(passwordMeetsPolicy(ephemeral), true);
  ok(!storage.snapshot().includes(ephemeral), "generated password is never persisted");
  doesNotThrow(() => assertSafeAccountOpsInput({ credentialReference: { provider: "EXTERNAL_PASSWORD_MANAGER", referenceId: "safe-reference" } }), "credential reference metadata is allowed");
  doesNotThrow(() => assertSafeAccountOpsInput({ credentialProvider: "EXTERNAL_PASSWORD_MANAGER", credentialReferenceId: "safe-reference" }), "flattened credential-reference metadata is allowed");
}

{
  const provider = createEmailProviderAdapter({ providerId: "local", mode: EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY });
  equal(provider.provisioned, false);
  equal(provider.receivingMail, false);
  equal((await provider.createAlias()).ok, false);
  equal((await provider.listMessages()).ok, false);
}

{
  const { service } = harness();
  const custom = (await service.createRetailer({ displayName: "Local Card Shop", website: "https://retailer.example/", capabilities: ["MANUAL_OWNER_ASSISTED_SETUP"] })).record;
  equal(custom.custom, true);
  equal(custom.automatedProvisioningSupported, false);
  equal(service.loadSnapshot().retailers.length, 1);
  equal(service.getRetailer("retailer-preset:walmart").custom, false);
  await rejects(() => service.updateRetailer(custom.id, { status: "ARCHIVED" }), (error) => error.code === "ARCHIVE_METHOD_REQUIRED");
  await rejects(() => service.updateRetailer("retailer-preset:walmart", { notes: "change" }), (error) => error.code === "PRESET_RETAILER_READ_ONLY");
  await rejects(() => service.createRetailer({ displayName: "Automation claim", automatedProvisioningSupported: true }), (error) => error.code === "AUTOMATION_NOT_SUPPORTED");
  for (const credentialUrl of [
    "https://user:pass@retailer.example/signup",
    "https://retailer.example/signup?access_token=secret",
    "https://retailer.example/signup#token=secret",
  ]) {
    await rejects(() => service.createRetailer({ displayName: "Credential URL", signupUrl: credentialUrl }), (error) => error.code === "INVALID_URL", "credential-bearing retailer URLs are rejected");
  }
}

{
  const { storage, service } = harness();
  const { profile, emailDomain, alias } = await basicRecords(service);
  await service.confirmCatchAllDomain(emailDomain.id);
  await service.confirmCatchAllReceiving(alias.id);
  const account = (await service.createStoreAccount({ retailerId: "retailer-preset:target", profileId: profile.id, aliasId: alias.id, accountDisplayName: "Target Business 01", phoneVerificationRequired: false })).record;
  equal(account.status, STORE_ACCOUNT_STATUSES.SETUP);
  equal(account.setupStage, ACCOUNT_SETUP_STAGES.PREPARED);
  equal(account.emailVerificationStatus, VERIFICATION_STATES.PENDING);
  equal(account.phoneVerificationStatus, VERIFICATION_STATES.NOT_REQUIRED);
  await rejects(() => service.updateStoreAccount(account.id, { status: STORE_ACCOUNT_STATUSES.READY }), (error) => error.code === "ACCOUNT_STATE_METHOD_REQUIRED");
  await rejects(() => service.confirmStoreAccountReady(account.id), (error) => error.code === "ACCOUNT_NOT_READY");
  const opened = await service.openStoreAccountSignup(account.id);
  equal(opened.ownerActionRequired, true);
  equal(opened.formSubmitted, false);
  match(opened.setupUrl, /^https:\/\//);
  equal(opened.record.setupStage, ACCOUNT_SETUP_STAGES.SIGNUP_OPENED);
  const emailVerified = (await service.confirmAccountEmailVerified(account.id)).record;
  equal(emailVerified.setupStage, ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION);
  equal(emailVerified.emailVerificationStatus, VERIFICATION_STATES.VERIFIED);
  const credential = (await service.confirmCredentialStored(account.id, { provider: CREDENTIAL_REFERENCE_PROVIDERS.EXTERNAL_PASSWORD_MANAGER, referenceId: "vault:item-1", label: "Vault item" })).record;
  equal(credential.credentialReference.referenceId, "vault:item-1");
  const tested = (await service.confirmStoreAccountTested(account.id)).record;
  equal(tested.securityStatus, "HEALTHY");
  const ready = (await service.confirmStoreAccountReady(account.id)).record;
  equal(ready.status, STORE_ACCOUNT_STATUSES.READY);
  equal(ready.setupStage, ACCOUNT_SETUP_STAGES.READY);
  ok(ready.ownerConfirmedReadyAt);
  equal(service.healthForAccount(account.id).health, ACCOUNT_HEALTH_STATES.HEALTHY);
  equal(service.summary().ready, 1);
  ok(!storage.snapshot().match(/"(?:password|plaintextPassword|otp|captcha|accessToken|refreshToken)"\s*:/i), "setup persistence contains no password, OTP, CAPTCHA, or token fields");
  equal(service.completeCaptcha, undefined);
  equal(service.completeOtp, undefined);
  equal(service.submitSignup, undefined);
}

{
  const { service } = harness();
  const firstProfile = (await service.createProfile({ displayName: "Ready identity 01" })).record;
  const secondProfile = (await service.createProfile({ displayName: "Ready identity 02" })).record;
  const account = (await service.createStoreAccount({ retailerId: "retailer-preset:target", profileId: firstProfile.id, accountDisplayName: "Ready identity test" })).record;
  await service.confirmAccountEmailVerified(account.id);
  await service.confirmCredentialStored(account.id, { provider: CREDENTIAL_REFERENCE_PROVIDERS.EXTERNAL_PASSWORD_MANAGER, referenceId: "vault:identity-test" });
  await service.confirmStoreAccountTested(account.id);
  const ready = (await service.confirmStoreAccountReady(account.id)).record;
  equal(ready.status, STORE_ACCOUNT_STATUSES.READY);
  const changed = (await service.updateStoreAccount(account.id, { profileId: secondProfile.id, retailerId: "retailer-preset:walmart" })).record;
  equal(changed.status, STORE_ACCOUNT_STATUSES.SETUP, "identity changes demote a Ready account");
  equal(changed.setupStage, ACCOUNT_SETUP_STAGES.PREPARED, "identity changes restart owner-assisted setup");
  equal(changed.emailVerificationStatus, VERIFICATION_STATES.PENDING, "identity changes require email reverification");
  equal(changed.securityStatus, "UNKNOWN", "identity changes require another owner account test");
  equal(changed.ownerConfirmedReadyAt, null, "identity changes clear prior Ready confirmation");
  equal(changed.lastVerifiedAt, null, "identity changes clear the stale verification timestamp");
  await rejects(() => service.confirmStoreAccountReady(account.id), (error) => error.code === "ACCOUNT_NOT_READY", "the changed identity cannot remain Ready without reconfirmation");
}

{
  const { service } = harness();
  const { profile, alias } = await basicRecords(service);
  const account = (await service.createStoreAccount({ retailerId: "retailer-preset:target", profileId: profile.id, aliasId: alias.id, accountDisplayName: "Phone required", phoneVerificationRequired: true })).record;
  await service.openStoreAccountSignup(account.id);
  await rejects(() => service.confirmAccountPhoneVerified(account.id), (error) => error.code === "EMAIL_VERIFICATION_REQUIRED");
  await service.confirmAccountEmailVerified(account.id);
  const phone = (await service.confirmAccountPhoneVerified(account.id)).record;
  equal(phone.phoneVerificationStatus, VERIFICATION_STATES.VERIFIED);
  equal(phone.setupStage, ACCOUNT_SETUP_STAGES.OWNER_CONFIRMATION);
}

{
  const { storage, service } = harness();
  const { profile, alias } = await basicRecords(service);
  const account = (await service.createStoreAccount({ retailerId: "retailer-preset:target", profileId: profile.id, aliasId: alias.id, accountDisplayName: "Alias gate" })).record;
  await service.confirmAccountEmailVerified(account.id);
  await service.confirmCredentialStored(account.id, { provider: CREDENTIAL_REFERENCE_PROVIDERS.EXTERNAL_PASSWORD_MANAGER, referenceId: "vault:alias-gate" });
  await service.confirmStoreAccountTested(account.id);
  const readyCandidate = JSON.parse(storage.getItem(ACCOUNT_OPS_STORAGE_KEY));
  const cases = [
    ["missing", (state) => { state.emailAliases = []; }],
    ["archived", (state) => { state.emailAliases[0].status = EMAIL_ALIAS_STATUSES.ARCHIVED; state.emailAliases[0].archivedAt = state.updatedAt; }],
    ["disabled", (state) => { state.emailAliases[0].status = EMAIL_ALIAS_STATUSES.DISABLED; }],
    ["error", (state) => { state.emailAliases[0].status = EMAIL_ALIAS_STATUSES.ERROR; }],
    ["failed provisioning", (state) => { state.emailAliases[0].provisioningState = ALIAS_PROVISIONING_STATES.FAILED; }],
  ];
  for (const [label, mutate] of cases) {
    const state = structuredClone(readyCandidate);
    mutate(state);
    storage.values.set(ACCOUNT_OPS_STORAGE_KEY, JSON.stringify(state));
    await rejects(
      () => service.confirmStoreAccountReady(account.id),
      (error) => error.code === "ACCOUNT_NOT_READY" && error.details.failures.some((failure) => /alias/i.test(failure)),
      `a ${label} linked alias must block READY`,
    );
  }
}

{
  const { storage, service } = harness();
  const first = await basicRecords(service);
  const secondProfile = (await service.createProfile({ displayName: "Business 02", profileGroupId: "profile-group-preset:business" })).record;
  const account = (await service.createStoreAccount({ retailerId: "retailer-preset:target", profileId: first.profile.id, aliasId: first.alias.id, accountDisplayName: "Relation test" })).record;
  await rejects(() => service.updateStoreAccount(account.id, { profileId: secondProfile.id }), (error) => error.code === "ALIAS_PROFILE_MISMATCH");
  await rejects(() => service.updateStoreAccount(account.id, { retailerId: "retailer-preset:walmart" }), (error) => error.code === "ALIAS_RETAILER_MISMATCH");
  await rejects(() => service.updateEmailAlias(first.alias.id, { profileId: secondProfile.id }), (error) => error.code === "ALIAS_ACCOUNT_RELATION_CONFLICT");
  const writesBefore = storage.writes;
  await rejects(() => service.bulkAssignRetailer([account.id, "storeAccounts:missing"], "retailer-preset:walmart"), (error) => ["ALIAS_RETAILER_MISMATCH", "RELATED_RECORD_REQUIRED"].includes(error.code));
  equal(storage.writes, writesBefore, "bulk assignment preflights before its first write");
}

{
  const { service } = harness();
  const { profile, alias } = await basicRecords(service);
  const account = (await service.createStoreAccount({ retailerId: "retailer-preset:target", profileId: profile.id, aliasId: alias.id, accountDisplayName: "Tasks" })).record;
  const task = (await service.createTask({ type: ACCOUNT_TASK_TYPES.VERIFY_EMAIL, title: "Verify retailer email", accountId: account.id, profileId: profile.id, retailerId: account.retailerId, dueAt: "2026-08-30T12:00:00.000Z" })).record;
  equal(task.status, ACCOUNT_TASK_STATUSES.OPEN);
  equal(service.summary().tasks, 1);
  const complete = (await service.completeTask(task.id)).record;
  equal(complete.status, ACCOUNT_TASK_STATUSES.DONE);
  ok(complete.completedAt);
  const dismissed = (await service.createTask({ type: ACCOUNT_TASK_TYPES.CUSTOM, title: "Optional follow-up", accountId: account.id })).record;
  equal((await service.dismissTask(dismissed.id)).record.status, ACCOUNT_TASK_STATUSES.DISMISSED);
  const generated = await service.generateAccountHealthTasks(account.id);
  ok(generated.records.some((row) => row.type === ACCOUNT_TASK_TYPES.VERIFY_EMAIL));
  equal(service.search("verify").tasks.length >= 1, true);
  equal(service.search("", { accountStatus: STORE_ACCOUNT_STATUSES.SETUP }).accounts.length, 1);
  equal(service.search("", { verification: VERIFICATION_STATES.PENDING }).accounts.length, 1);
  equal(service.search("", { health: ACCOUNT_HEALTH_STATES.NEEDS_ATTENTION }).accounts.length, 1);
  const metadataExport = service.exportSelectedMetadata("storeAccounts", [account.id]);
  equal(metadataExport.format, "code3.account-ops.metadata-selection");
  equal(metadataExport.records[0].id, account.id);

  await rejects(
    () => service.createTask({ title: "Mismatched profile", accountId: account.id, profileId: "profiles:missing" }),
    (error) => error.code === "TASK_PROFILE_MISMATCH",
    "task profile must match its related account",
  );
  await rejects(
    () => service.createTask({ title: "Mismatched retailer", accountId: account.id, retailerId: "retailer-preset:walmart" }),
    (error) => error.code === "TASK_RETAILER_MISMATCH",
    "task retailer must match its related account",
  );
  const inferredTask = (await service.createTask({ title: "Relationship inferred", accountId: account.id })).record;
  equal(inferredTask.profileId, account.profileId, "account tasks inherit their profile relationship");
  equal(inferredTask.retailerId, account.retailerId, "account tasks inherit their retailer relationship");
}

{
  const { service } = harness();
  const { profile, emailDomain, alias } = await basicRecords(service);
  const duplicate = service.generateAliasDraft({ domainId: emailDomain.id, profileId: profile.id, retailerId: "retailer-preset:target", template: "{profile}-{random}" });
  await rejects(
    () => service.createEmailAlias({ ...duplicate, aliasAddress: alias.aliasAddress.toUpperCase(), localPart: alias.localPart, domain: alias.domain }),
    (error) => error.code === "DUPLICATE_ALIAS",
    "duplicate aliases are case-insensitive",
  );
}

{
  const inbox = normalizeFutureInboxMessageMetadata({ messageId: "message:1", category: "ORDER_CONFIRMATION", subject: "Order received", source: "FUTURE_PROVIDER" });
  equal(inbox.parsingImplemented, false);
  equal(inbox.category, "ORDER_CONFIRMATION");
  throws(() => normalizeFutureInboxMessageMetadata({ messageId: "message:2", body: "not retained" }), (error) => error.code === "MESSAGE_BODY_NOT_ALLOWED");
  const order = createFutureOrderCandidate({ candidateId: "candidate:1", messageId: "message:1", externalOrderId: "external:1" });
  equal(order.ownerReviewRequired, true);
  equal(order.automaticImportAllowed, false);
  equal(order.purchaseCreated, false);
  equal(order.inventoryCreated, false);
}

{
  const serviceSource = await readFile(new URL("../src/features/accountOps/service.js", import.meta.url), "utf8");
  const randomSource = await readFile(new URL("../src/features/accountOps/secureRandom.js", import.meta.url), "utf8");
  const passwordSource = await readFile(new URL("../src/features/accountOps/passwordGenerator.js", import.meta.url), "utf8");
  ok(!/Math\.random/.test(randomSource + passwordSource), "security-sensitive randomness has no Math.random fallback");
  ok(!/console\.(?:log|info|warn|error)/.test(serviceSource + passwordSource), "service and password generator do not log secrets");
  ok(!/\bDELETE\b/.test(serviceSource), "Account Ops has no DELETE contract");
  ok(!/(?:auto(?:matic)?Signup|submitSignup|completeCaptcha|completeOtp)\s*[:=(]/i.test(serviceSource), "no automated signup or verification implementation exists");
}

console.log(`Code 3 Account Ops domain tests passed (${assertions} assertions; LOCAL_ONLY, owner-scoped metadata, assisted setup, and no-secret boundaries).`);
