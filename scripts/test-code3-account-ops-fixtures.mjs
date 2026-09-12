import assert from "node:assert/strict";
import {
  ACCOUNT_HEALTH_STATES,
  ACCOUNT_OPS_COLLECTIONS,
  ACCOUNT_TASK_STATUSES,
  ALIAS_PROVISIONING_STATES,
  EMAIL_ALIAS_STATUSES,
  PHASE_2A_QA_FIXTURES,
  PHASE_2A_QA_NOW,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
  evaluatePhase2aQaFixture,
  getPhase2aQaFixture,
  normalizeAccountOpsState,
  validateEmailAddress,
} from "../src/features/accountOps/index.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(fn, predicate, message) { assert.throws(fn, predicate, message); assertions += 1; }

equal(PHASE_2A_QA_FIXTURES.length, 20, "the deterministic QA set must contain all twenty required scenarios");
equal(new Set(PHASE_2A_QA_FIXTURES.map((fixture) => fixture.id)).size, 20, "fixture IDs must be unique");
equal(PHASE_2A_QA_NOW, "2026-08-26T14:00:00.000Z");

for (const definition of PHASE_2A_QA_FIXTURES) {
  const first = getPhase2aQaFixture(definition.id);
  const second = getPhase2aQaFixture(definition.id);
  equal(first.id, definition.id);
  equal(first.title, definition.title);
  deepEqual(first.state, second.state, `${definition.id} must be deterministic`);
  equal(first.state.schemaVersion, 1);
  equal(first.state.updatedAt, PHASE_2A_QA_NOW);
  for (const collection of ACCOUNT_OPS_COLLECTIONS) ok(Array.isArray(first.state[collection]), `${definition.id}.${collection} must be an array`);
  deepEqual(normalizeAccountOpsState(first.state, { now: () => PHASE_2A_QA_NOW }), first.state, `${definition.id} must satisfy the versioned persistence contract`);
  ok(first.state.retailers.every((retailer) => !retailer.id.startsWith("retailer-preset:")), `${definition.id} must not persist static retailer code metadata`);
  const serialized = JSON.stringify(first.state);
  ok(!/"(?:password|plaintextPassword|accessToken|refreshToken|idToken|otp|cvv|session|ownerId|ownerSubject|role)"\s*:/i.test(serialized), `${definition.id} must not contain secrets or authoritative identity fields`);
  ok(!/Math\.random|captcha bypass|otp bypass|automatic signup/i.test(serialized), `${definition.id} must not describe bypass automation`);
  for (const alias of first.state.emailAliases) {
    const parsed = validateEmailAddress(alias.aliasAddress);
    equal(parsed.domain, alias.domain);
    equal(parsed.localPart, alias.localPart);
    ok(first.state.emailDomains.some((domain) => domain.id === alias.domainId), `${definition.id} alias domain relation must exist`);
  }
  for (const account of first.state.storeAccounts) {
    ok(first.state.profiles.some((profile) => profile.id === account.profileId), `${definition.id} account profile relation must exist`);
    ok(account.retailerId.startsWith("retailer-preset:") || first.state.retailers.some((retailer) => retailer.id === account.retailerId), `${definition.id} account retailer relation must exist`);
    ok(!account.aliasId || first.state.emailAliases.some((alias) => alias.id === account.aliasId), `${definition.id} account alias relation must exist when supplied`);
  }
}

throws(() => getPhase2aQaFixture("missing"), /Unknown Phase 2A QA fixture/);

{
  const result = evaluatePhase2aQaFixture("empty-account-ops");
  equal(result.summary.storeAccounts, 0);
  equal(result.summary.ready, 0);
  equal(result.summary.needsAttention, 0);
  equal(result.summary.problem, 0);
  equal(result.summary.emailAliases, 0);
  equal(result.summary.tasks, 0);
}

{
  const result = evaluatePhase2aQaFixture("healthy-profile-account");
  equal(result.summary.storeAccounts, 1);
  equal(result.summary.ready, 1);
  equal(result.accountHealth[0].health, ACCOUNT_HEALTH_STATES.HEALTHY);
  equal(result.accountHealth[0].reasons.length, 0);
}

{
  const generated = getPhase2aQaFixture("alias-generated-not-provisioned").state.emailAliases[0];
  equal(generated.provisioningState, ALIAS_PROVISIONING_STATES.GENERATED_LOCAL);
  equal(generated.status, EMAIL_ALIAS_STATUSES.PENDING);
  equal(generated.verificationState, VERIFICATION_STATES.UNKNOWN);
  equal(generated.providerExternalId, "");
  const provisioned = getPhase2aQaFixture("alias-provisioned-metadata").state.emailAliases[0];
  equal(provisioned.provisioningState, ALIAS_PROVISIONING_STATES.PROVIDER_PROVISIONED);
  equal(provisioned.status, EMAIL_ALIAS_STATUSES.PENDING, "provider metadata does not claim that mail is live");
  equal(provisioned.verificationState, VERIFICATION_STATES.PENDING);
}

{
  const result = evaluatePhase2aQaFixture("awaiting-email-verification");
  equal(result.accountHealth[0].health, ACCOUNT_HEALTH_STATES.NEEDS_ATTENTION);
  ok(result.accountHealth[0].reasons.some((reason) => reason.code === "EMAIL_NOT_VERIFIED"));
  const phone = evaluatePhase2aQaFixture("awaiting-phone-verification");
  equal(phone.accountHealth[0].health, ACCOUNT_HEALTH_STATES.NEEDS_ATTENTION);
  ok(phone.accountHealth[0].reasons.some((reason) => reason.code === "PHONE_NOT_VERIFIED"));
}

{
  const result = evaluatePhase2aQaFixture("problem-account");
  equal(result.accountHealth[0].health, ACCOUNT_HEALTH_STATES.PROBLEM);
  ok(result.accountHealth[0].reasons.some((reason) => reason.code === "ACCOUNT_LOCKED"));
  ok(result.accountHealth[0].reasons.some((reason) => reason.code === "SECURITY_REVIEW"));
  ok(!result.accountHealth[0].reasons.some((reason) => /ban/i.test(reason.message)), "health must not infer retailer bans");
}

{
  const missing = evaluatePhase2aQaFixture("missing-credential-reference");
  ok(missing.accountHealth[0].reasons.some((reason) => reason.code === "CREDENTIAL_REFERENCE_MISSING"));
  const disabled = evaluatePhase2aQaFixture("disabled-alias");
  equal(disabled.accountHealth[0].health, ACCOUNT_HEALTH_STATES.PROBLEM);
  ok(disabled.accountHealth[0].reasons.some((reason) => reason.code === "ALIAS_DISABLED"));
  const duplicate = evaluatePhase2aQaFixture("duplicate-conflict-warning");
  equal(duplicate.accountHealth[0].health, ACCOUNT_HEALTH_STATES.PROBLEM);
  ok(duplicate.accountHealth[0].reasons.some((reason) => reason.code === "DUPLICATE_ALIAS"));
}

{
  const tasks = evaluatePhase2aQaFixture("several-open-tasks");
  equal(tasks.summary.tasks, 3);
  equal(tasks.state.tasks.filter((task) => task.status === ACCOUNT_TASK_STATUSES.OPEN).length, 3);
  ok(tasks.accountHealth[0].reasons.some((reason) => reason.code === "OPEN_TASKS"));
  const archived = evaluatePhase2aQaFixture("archived-account");
  equal(archived.summary.storeAccounts, 0);
  equal(archived.state.storeAccounts[0].status, STORE_ACCOUNT_STATUSES.ARCHIVED);
}

{
  const longAlias = getPhase2aQaFixture("long-alias-mobile").state.emailAliases[0].aliasAddress;
  ok(longAlias.length <= 254);
  ok(longAlias.length > 60, "mobile overflow fixture needs a realistically long alias");
  ok(!/\s/.test(longAlias));
}

{
  const passwordWorkflow = getPhase2aQaFixture("password-generation-workflow").state;
  equal(passwordWorkflow.storeAccounts[0].credentialReference, null);
  equal(passwordWorkflow.storeAccounts[0].setupStage, "PREPARED");
  ok(!JSON.stringify(passwordWorkflow).match(/"password"\s*:/i));
  const setupWorkflow = getPhase2aQaFixture("account-setup-workflow").state.storeAccounts[0];
  equal(setupWorkflow.setupStage, "SIGNUP_OPENED");
  equal(setupWorkflow.emailVerificationStatus, VERIFICATION_STATES.PENDING);
}

{
  const manyAccounts = getPhase2aQaFixture("profile-many-accounts").state;
  equal(manyAccounts.profiles.length, 1);
  equal(manyAccounts.storeAccounts.length, 12);
  equal(new Set(manyAccounts.storeAccounts.map((account) => account.profileId)).size, 1);
  const manyProfiles = getPhase2aQaFixture("retailer-many-profiles").state;
  equal(manyProfiles.profiles.length, 12);
  equal(manyProfiles.storeAccounts.length, 12);
  equal(new Set(manyProfiles.storeAccounts.map((account) => account.retailerId)).size, 1);
}

console.log(`Code 3 Account Ops fixture tests passed (20/20 cases; ${assertions} assertions).`);
