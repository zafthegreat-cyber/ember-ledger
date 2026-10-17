import assert from "node:assert/strict";
import { assertSafeAccountOpsInput } from "../src/features/accountOps/security.js";
import { secureRecordSuffix, secureUuid } from "../src/features/accountOps/secureRandom.js";
import { createAccountOpsService } from "../src/features/accountOps/service.js";
import { createAccountOpsPersistence } from "../src/features/accountOps/persistence.js";
import { createAccountOpsRepository, deserializeAccountOpsState } from "../src/features/accountOps/repository.js";
import { ACCOUNT_OPS_STORAGE_KEY } from "../src/features/accountOps/constants.js";
import { createVerifiedBackup } from "../src/features/backup/backupFormat.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { previewBackupRestore, RESTORE_PREVIEW_RESULTS } from "../src/features/backup/restorePreview.js";

const rejectedUuid = "60020646-0730-4467-bcf4-bfa6e7def9b8";
const oldRejectedId = `profileGroups:${rejectedUuid}`;
const now = () => "2026-09-23T12:00:00.000Z";
const cases = [];
function memory() {
  const rows = new Map(); let writes = 0;
  return { getItem: key => rows.get(key) ?? null, setItem(key, value) { writes++; rows.set(key, value); }, get writes() { return writes; } };
}
function fixedUuid(uuid) {
  return { getRandomValues() { throw new Error("The native UUID path must not draw fallback bytes."); }, randomUUID: () => uuid };
}
function uuidSequence() {
  let sequence = BigInt(`0x${rejectedUuid.slice(-12)}`);
  return { getRandomValues() { throw new Error("The native UUID path must not draw fallback bytes."); }, randomUUID: () => `${rejectedUuid.slice(0, -12)}${(sequence++).toString(16).padStart(12, "0")}` };
}
const decode = suffix => [...suffix.slice(1)].map(letter => "abcdefghijklmnop".indexOf(letter).toString(16)).join("");

assert.throws(() => assertSafeAccountOpsInput({ id: oldRejectedId }), { code: "CREDENTIAL_TEXT_REJECTED" });
assert.equal(secureUuid(fixedUuid(rejectedUuid)), rejectedUuid, "The existing UUID API is unchanged.");
const suffix = secureRecordSuffix(fixedUuid(rejectedUuid));
assert.match(suffix, /^r[a-p]{32}$/);
assert.equal(decode(suffix), rejectedUuid.replaceAll("-", ""), "Every UUID bit is preserved by the encoding.");
assert.doesNotThrow(() => assertSafeAccountOpsInput({ id: `profileGroups:${suffix}` }));
assert.notEqual(suffix, secureRecordSuffix(fixedUuid("60020646-0730-4467-bcf4-bfa6e7def9b9")));
cases.push("known rejected UUID retains all bits as a scanner-safe internal suffix; existing UUID API unchanged");

const fallbackBytes = Uint8Array.from(rejectedUuid.replaceAll("-", "").match(/../g).map(hex => Number.parseInt(hex, 16)));
let draws = 0;
assert.equal(secureRecordSuffix({ getRandomValues(bytes) { draws++; bytes.set(fallbackBytes); return bytes; } }), suffix);
assert.equal(draws, 1, "No random retry is used.");
for (const invalid of ["password=synthetic-secret", "60020646-0730-1467-bcf4-bfa6e7def9b8", "60020646-0730-4467-7cf4-bfa6e7def9b8", null]) {
  assert.throws(() => secureRecordSuffix(fixedUuid(invalid)), { code: "SECURE_RANDOM_FAILED" });
}
assert.throws(() => secureRecordSuffix({}), { code: "SECURE_RANDOM_UNAVAILABLE" });
cases.push("fallback draws once; invalid entropy and unavailable crypto fail closed");

const storage = memory();
const service = createAccountOpsService({ storage, now, randomSource: uuidSequence() });
const group = (await service.createProfileGroup({ displayName: "Synthetic generated group" })).record;
const profile = (await service.createProfile({ displayName: "Synthetic generated profile", profileGroupId: group.id })).record;
const task = (await service.createTask({ title: "Synthetic generated follow-up", profileId: profile.id })).record;
assert.equal(group.id, `profileGroups:${suffix}`);
for (const record of [group, profile, task, ...service.snapshot().activity]) assert.match(record.id, /^[A-Za-z]+:r[a-p]{32}$/);
assert.equal(new Set([group, profile, task, ...service.snapshot().activity].map(record => record.id)).size, 6);
assert.equal(service.snapshot().activity.length, 3); assert.equal(storage.writes, 3);
assert.equal(profile.profileGroupId, group.id); assert.equal(task.profileId, profile.id);
assert.equal(service.snapshot().activity.filter(record => record.profileId === profile.id).length, 2);
assert.equal(createAccountOpsRepository(storage, { now }).load().profiles[0].id, profile.id);
assert.deepEqual(service.exportSelectedMetadata("profiles", [profile.id]).records.map(record => record.id), [profile.id]);
const backup = await createVerifiedBackup({ localStorage: storage, sessionStorage: memory(), sourceRegistry: [getBackupSource("account-ops")], createdAt: now() });
assert.equal(backup.verified, true); assert.equal(backup.backup.sections.length, 1);
assert.equal(backup.backup.sections[0].data.profiles[0].profileGroupId, group.id);
assert.equal(backup.backup.sections[0].data.tasks[0].profileId, profile.id);
assert.equal((await previewBackupRestore(backup.json)).result, RESTORE_PREVIEW_RESULTS.READY_FOR_FUTURE_RESTORE);
cases.push("generated groups, profiles, linked tasks/activity, reload, metadata export and verified backup/preview retain exact IDs");

const legacyStorage = memory(); let legacyCounter = 0;
const oldService = createAccountOpsService({ storage: legacyStorage, now, idFactory: collection => `${collection}:aabbccdd-abcd-4abc-8abc-${(++legacyCounter).toString(16).padStart(12, "0")}` });
const oldGroup = (await oldService.createProfileGroup({ displayName: "Synthetic existing UUID group" })).record;
const mixedService = createAccountOpsService({ storage: legacyStorage, now, randomSource: uuidSequence() });
const mixedProfile = (await mixedService.createProfile({ displayName: "Synthetic mixed profile", profileGroupId: oldGroup.id })).record;
assert.equal(mixedService.snapshot().profileGroups.find(record => record.id === oldGroup.id).id, oldGroup.id);
assert.equal(mixedProfile.profileGroupId, oldGroup.id);
const mixedBackup = await createVerifiedBackup({ localStorage: legacyStorage, sessionStorage: memory(), sourceRegistry: [getBackupSource("account-ops")], createdAt: now() });
assert.equal(mixedBackup.verified, true); assert.equal((await previewBackupRestore(mixedBackup.json)).result, RESTORE_PREVIEW_RESULTS.READY_FOR_FUTURE_RESTORE);
cases.push("existing UUID IDs remain unchanged and valid new references/export work alongside them");

const before = storage.getItem(ACCOUNT_OPS_STORAGE_KEY), beforeWrites = storage.writes;
for (const notes of ["password=synthetic-secret", "Bearer syntheticTokenValue123", "card number: 4111111111111111", "https://user:secret@example.test"]) {
  await assert.rejects(service.createProfile({ displayName: "Synthetic rejected profile", notes }), error => error.name === "AccountOpsSecurityError");
}
await assert.rejects(service.createProfile({ id: oldRejectedId, displayName: "Synthetic supplied ID" }), error => ["AccountOpsSecurityError", "AccountOpsServiceError"].includes(error.name));
const suppliedFactory = createAccountOpsPersistence({ storage, now, idFactory: () => oldRejectedId });
await assert.rejects(suppliedFactory.collections.profileGroups.create({ displayName: "Synthetic rejected supplied factory" }), { code: "CREDENTIAL_TEXT_REJECTED" });
const imported = JSON.parse(before); imported.profileGroups.push({ ...group, id: oldRejectedId });
assert.equal(deserializeAccountOpsState(imported, { now }).error.code, "CREDENTIAL_TEXT_REJECTED");
assert.equal(storage.getItem(ACCOUNT_OPS_STORAGE_KEY), before); assert.equal(storage.writes, beforeWrites);
cases.push("caller factory/imported IDs and user credential text keep original rejection policy with zero writes");

const duplicateStore = memory();
const repeated = createAccountOpsService({ storage: duplicateStore, now, randomSource: fixedUuid(rejectedUuid) });
await repeated.createProfileGroup({ displayName: "Synthetic first same entropy" });
const duplicateBefore = duplicateStore.getItem(ACCOUNT_OPS_STORAGE_KEY);
await assert.rejects(repeated.createProfileGroup({ displayName: "Synthetic second same entropy" }), { code: "DUPLICATE_ID" });
assert.equal(duplicateStore.getItem(ACCOUNT_OPS_STORAGE_KEY), duplicateBefore); assert.equal(duplicateStore.writes, 1);
cases.push("repeated entropy triggers duplicate-ID rejection without overwriting or retrying");
for (const description of cases) console.log(`PASS ${description}`);
console.log(`Account Ops generated identifiers: ${cases.length} regression scenarios passed.`);
