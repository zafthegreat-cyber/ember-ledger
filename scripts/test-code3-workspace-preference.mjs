import assert from "node:assert/strict";
import { BACKUP_SOURCE_REGISTRY } from "../src/features/backup/backupSourceRegistry.js";
import { getAvailableWorkspaces, WORKSPACE_IDS } from "../src/config/workspaceRegistry.js";
import {
  DEFAULT_PRODUCT_WORKSPACE_ID,
  parseWorkspacePreference,
  PUBLIC_PRODUCT_WORKSPACE_IDS,
  readWorkspacePreference,
  resolvePublicProductWorkspace,
  resolveWorkspaceSelection,
  validateWorkspacePreference,
  WORKSPACE_PREFERENCE_SCHEMA_VERSION,
  WORKSPACE_PREFERENCE_STORAGE_KEY,
  writeWorkspacePreference,
} from "../src/features/workspaces/workspacePreference.js";

let assertionCount = 0;
function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}
function deepEqual(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}
function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

class MemoryStorage {
  constructor(values = {}, { failReads = false, failWrites = false } = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key, String(value)]));
    this.failReads = failReads;
    this.failWrites = failWrites;
    this.readKeys = [];
    this.writeKeys = [];
  }

  getItem(key) {
    this.readKeys.push(key);
    if (this.failReads) throw new Error("simulated read failure");
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.writeKeys.push(key);
    if (this.failWrites) throw new Error("simulated write failure");
    this.values.set(key, String(value));
  }
}

const NOW = "2026-08-26T14:15:16.000Z";
const validPreference = {
  schemaVersion: WORKSPACE_PREFERENCE_SCHEMA_VERSION,
  lastProductWorkspace: WORKSPACE_IDS.FIND,
  updatedAt: NOW,
};

equal(WORKSPACE_PREFERENCE_STORAGE_KEY, "code3.workspace-preference.v1");
equal(DEFAULT_PRODUCT_WORKSPACE_ID, WORKSPACE_IDS.COLLECT);
deepEqual(PUBLIC_PRODUCT_WORKSPACE_IDS, [
  WORKSPACE_IDS.COLLECT,
  WORKSPACE_IDS.FIND,
  WORKSPACE_IDS.SELL,
  WORKSPACE_IDS.BUSINESS,
]);
ok(!PUBLIC_PRODUCT_WORKSPACE_IDS.includes(WORKSPACE_IDS.BOT), "Bot must not be a persisted product preference");

const validated = validateWorkspacePreference(validPreference);
equal(validated.valid, true);
deepEqual(validated.preference, validPreference);
equal(Object.isFrozen(validated.preference), true);

for (const invalid of [
  null,
  [],
  { ...validPreference, schemaVersion: 2 },
  { ...validPreference, lastProductWorkspace: "find" },
  { ...validPreference, lastProductWorkspace: WORKSPACE_IDS.BOT },
  { ...validPreference, lastProductWorkspace: "OWNER" },
  { ...validPreference, lastSelectedWorkspace: "OWNER" },
  { ...validPreference, lastSelectedWorkspace: "owner-center" },
  { ...validPreference, updatedAt: "2026-08-26" },
  { ...validPreference, role: "OWNER" },
  { ...validPreference, ownerAuthorized: true },
  { ...validPreference, token: "not-authority" },
  JSON.parse(`{"schemaVersion":1,"lastProductWorkspace":"FIND","updatedAt":"${NOW}","__proto__":{}}`),
  Object.assign(Object.create({ inherited: true }), validPreference),
]) {
  equal(validateWorkspacePreference(invalid).valid, false, "invalid or authority-bearing preference must be rejected");
}

const accessorPreference = { ...validPreference };
Object.defineProperty(accessorPreference, "updatedAt", { enumerable: true, get: () => NOW });
equal(validateWorkspacePreference(accessorPreference).valid, false, "accessor fields must be rejected");

const symbolPreference = { ...validPreference, [Symbol("authority")]: "OWNER" };
equal(validateWorkspacePreference(symbolPreference).valid, false, "symbol keys must be rejected");
const hostilePreference = new Proxy(validPreference, {
  ownKeys() { throw new Error("hostile proxy"); },
});
equal(validateWorkspacePreference(hostilePreference).valid, false, "uninspectable values must fail closed without throwing");

equal(validateWorkspacePreference({ ...validPreference, lastSelectedWorkspace: WORKSPACE_IDS.BOT }).valid, true);

equal(parseWorkspacePreference(JSON.stringify(validPreference)).valid, true);
equal(parseWorkspacePreference("not json").code, "MALFORMED_JSON");
equal(parseWorkspacePreference("").code, "MISSING");
equal(parseWorkspacePreference(" ".repeat(1_025)).code, "TOO_LARGE");
equal(parseWorkspacePreference(validPreference).code, "INVALID_SERIALIZATION");

const missingStorage = new MemoryStorage();
deepEqual(readWorkspacePreference(missingStorage), {
  status: "MISSING",
  lastProductWorkspace: WORKSPACE_IDS.COLLECT,
  lastSelectedWorkspace: WORKSPACE_IDS.COLLECT,
  preference: null,
});
equal(missingStorage.writeKeys.length, 0, "a missing preference must not be auto-written");

const invalidStorage = new MemoryStorage({
  [WORKSPACE_PREFERENCE_STORAGE_KEY]: JSON.stringify({ ...validPreference, session: "forged" }),
});
const invalidRead = readWorkspacePreference(invalidStorage, { fallbackWorkspace: WORKSPACE_IDS.BUSINESS });
equal(invalidRead.status, "INVALID");
equal(invalidRead.lastProductWorkspace, WORKSPACE_IDS.BUSINESS);
equal(invalidRead.lastSelectedWorkspace, WORKSPACE_IDS.BUSINESS);
equal(invalidStorage.writeKeys.length, 0, "an invalid preference must not be rewritten while reading");

const unavailableRead = readWorkspacePreference(new MemoryStorage({}, { failReads: true }));
equal(unavailableRead.status, "UNAVAILABLE");
equal(unavailableRead.lastProductWorkspace, WORKSPACE_IDS.COLLECT);
equal(readWorkspacePreference(null).status, "UNAVAILABLE");

const businessKeys = [
  "ember-and-tide.flip-scout.v1",
  "private-business-hub.owner-center.v1",
  "code3.account-ops.v1",
  "et-tcg-beta-data",
];
const storage = new MemoryStorage(Object.fromEntries(businessKeys.map((key) => [key, `unchanged:${key}`])));
const beforeBusinessValues = Object.fromEntries(businessKeys.map((key) => [key, storage.values.get(key)]));
const saved = writeWorkspacePreference(storage, "sell", { now: () => NOW });
equal(saved.ok, true);
equal(saved.preference.lastProductWorkspace, WORKSPACE_IDS.SELL);
equal(saved.preference.lastSelectedWorkspace, WORKSPACE_IDS.SELL);
deepEqual(storage.writeKeys, [WORKSPACE_PREFERENCE_STORAGE_KEY], "workspace switching must write only its preference key");
deepEqual(
  Object.fromEntries(businessKeys.map((key) => [key, storage.values.get(key)])),
  beforeBusinessValues,
  "workspace switching must not alter business or private record stores",
);
const serialized = JSON.parse(storage.values.get(WORKSPACE_PREFERENCE_STORAGE_KEY));
deepEqual(Object.keys(serialized).sort(), ["lastProductWorkspace", "lastSelectedWorkspace", "schemaVersion", "updatedAt"]);
deepEqual(serialized, {
  schemaVersion: 1,
  lastProductWorkspace: WORKSPACE_IDS.SELL,
  lastSelectedWorkspace: WORKSPACE_IDS.SELL,
  updatedAt: NOW,
});
equal(readWorkspacePreference(storage).lastProductWorkspace, WORKSPACE_IDS.SELL);
equal(readWorkspacePreference(storage).lastSelectedWorkspace, WORKSPACE_IDS.SELL);

const writesBeforePrivateAttempts = storage.writeKeys.length;
equal(writeWorkspacePreference(storage, WORKSPACE_IDS.BOT, { now: () => NOW }).status, "OWNER_AUTHORIZATION_REQUIRED");
equal(writeWorkspacePreference(storage, "OWNER", { now: () => NOW }).status, "INVALID_WORKSPACE");
equal(storage.writeKeys.length, writesBeforePrivateAttempts, "private workspace attempts must perform zero writes");
const botSaved = writeWorkspacePreference(storage, WORKSPACE_IDS.BOT, {
  now: () => NOW,
  ownerAuthorized: true,
  lastProductWorkspace: WORKSPACE_IDS.BUSINESS,
});
equal(botSaved.ok, true);
equal(botSaved.preference.lastProductWorkspace, WORKSPACE_IDS.BUSINESS);
equal(botSaved.preference.lastSelectedWorkspace, WORKSPACE_IDS.BOT);
deepEqual(Object.keys(botSaved.preference).sort(), ["lastProductWorkspace", "lastSelectedWorkspace", "schemaVersion", "updatedAt"]);
ok(!Object.keys(botSaved.preference).some((key) => /owner|role|tier|session|token|author/i.test(key)), "persisted Bot selection must contain no authority fields");
const storedBotPreference = readWorkspacePreference(storage);
equal(storedBotPreference.lastSelectedWorkspace, WORKSPACE_IDS.BOT);
deepEqual(resolveWorkspaceSelection({
  lastSelectedWorkspace: storedBotPreference.lastSelectedWorkspace,
  rememberedWorkspace: storedBotPreference.lastProductWorkspace,
  ownerAuthorized: false,
}), {
  workspace: WORKSPACE_IDS.BUSINESS,
  source: "UNAUTHORIZED_FALLBACK",
}, "a stored Bot selection must be inert after logout or downgrade");
equal(writeWorkspacePreference(null, WORKSPACE_IDS.FIND, { now: () => NOW }).status, "UNAVAILABLE");
equal(writeWorkspacePreference(new MemoryStorage({}, { failWrites: true }), WORKSPACE_IDS.FIND, { now: () => NOW }).status, "WRITE_FAILED");
equal(writeWorkspacePreference(storage, WORKSPACE_IDS.FIND, { now: () => "invalid" }).status, "INVALID_TIMESTAMP");

deepEqual(resolvePublicProductWorkspace({
  directWorkspace: WORKSPACE_IDS.FIND,
  rememberedWorkspace: WORKSPACE_IDS.BUSINESS,
}), { workspace: WORKSPACE_IDS.FIND, source: "DIRECT_ROUTE" });
deepEqual(resolvePublicProductWorkspace({ rememberedWorkspace: WORKSPACE_IDS.SELL }), {
  workspace: WORKSPACE_IDS.SELL,
  source: "REMEMBERED",
});
deepEqual(resolvePublicProductWorkspace({
  rememberedWorkspace: WORKSPACE_IDS.BUSINESS,
  availableWorkspaces: getAvailableWorkspaces({ ownerAuthorized: false }),
}), { workspace: WORKSPACE_IDS.BUSINESS, source: "REMEMBERED" }, "registry workspace definitions are accepted as availability input");
deepEqual(resolvePublicProductWorkspace({
  rememberedWorkspace: WORKSPACE_IDS.SELL,
  availableWorkspaces: [WORKSPACE_IDS.COLLECT, WORKSPACE_IDS.BUSINESS],
  fallbackWorkspace: WORKSPACE_IDS.BUSINESS,
}), { workspace: WORKSPACE_IDS.BUSINESS, source: "FALLBACK" });
deepEqual(resolvePublicProductWorkspace({
  rememberedWorkspace: WORKSPACE_IDS.BOT,
  fallbackWorkspace: "OWNER",
}), { workspace: WORKSPACE_IDS.COLLECT, source: "FALLBACK" });

deepEqual(resolveWorkspaceSelection({
  directWorkspace: WORKSPACE_IDS.FIND,
  lastSelectedWorkspace: WORKSPACE_IDS.BOT,
  ownerAuthorized: true,
}), { workspace: WORKSPACE_IDS.FIND, source: "DIRECT_ROUTE" }, "a direct public route must override a prior Bot selection");
deepEqual(resolveWorkspaceSelection({
  lastSelectedWorkspace: WORKSPACE_IDS.BOT,
  rememberedWorkspace: WORKSPACE_IDS.BUSINESS,
  ownerAuthorized: true,
}), { workspace: WORKSPACE_IDS.BOT, source: "LAST_SELECTED", ownerRequired: true });
deepEqual(resolveWorkspaceSelection({
  lastSelectedWorkspace: WORKSPACE_IDS.BOT,
  rememberedWorkspace: WORKSPACE_IDS.BUSINESS,
  ownerAuthorized: false,
}), {
  workspace: WORKSPACE_IDS.BUSINESS,
  source: "UNAUTHORIZED_FALLBACK",
});
deepEqual(resolveWorkspaceSelection({
  lastSelectedWorkspace: WORKSPACE_IDS.BOT,
  rememberedWorkspace: WORKSPACE_IDS.SELL,
  ownerAuthorized: true,
  authorizationPending: true,
}), {
  workspace: WORKSPACE_IDS.SELL,
  source: "AUTHORIZATION_PENDING_FALLBACK",
});
deepEqual(resolveWorkspaceSelection({
  lastSelectedWorkspace: "OWNER",
  rememberedWorkspace: WORKSPACE_IDS.COLLECT,
  ownerAuthorized: false,
}), { workspace: WORKSPACE_IDS.COLLECT, source: "REMEMBERED" }, "Owner Center must never become a product workspace");
deepEqual(resolveWorkspaceSelection({
  directWorkspace: WORKSPACE_IDS.BOT,
  rememberedWorkspace: WORKSPACE_IDS.FIND,
  ownerAuthorized: true,
}), { workspace: WORKSPACE_IDS.BOT, source: "DIRECT_ROUTE", ownerRequired: true });
const unauthorizedDirectBot = resolveWorkspaceSelection({
  directWorkspace: WORKSPACE_IDS.BOT,
  rememberedWorkspace: WORKSPACE_IDS.FIND,
  ownerAuthorized: false,
});
deepEqual(unauthorizedDirectBot, { workspace: WORKSPACE_IDS.FIND, source: "UNAUTHORIZED_FALLBACK" });
ok(!JSON.stringify(unauthorizedDirectBot).includes(WORKSPACE_IDS.BOT), "unauthorized resolution must not return Bot metadata");
const pendingDirectBot = resolveWorkspaceSelection({
  directWorkspace: WORKSPACE_IDS.BOT,
  rememberedWorkspace: WORKSPACE_IDS.SELL,
  ownerAuthorized: true,
  authorizationPending: true,
});
deepEqual(pendingDirectBot, { workspace: WORKSPACE_IDS.SELL, source: "AUTHORIZATION_PENDING_FALLBACK" });
ok(!JSON.stringify(pendingDirectBot).includes(WORKSPACE_IDS.BOT), "pending authorization must not return Bot metadata");

const safePreferenceSource = BACKUP_SOURCE_REGISTRY.find((source) => source.sourceId === "safe-ui-preferences");
equal(BACKUP_SOURCE_REGISTRY.length, 23, "the Phase 2B1 inbox/order source is registered without adding a separate workspace-preference source");
ok(safePreferenceSource, "safe preference backup source must exist");
ok(safePreferenceSource.storageKeys.includes(WORKSPACE_PREFERENCE_STORAGE_KEY), "workspace preference must use the existing safe preference source");
equal(
  BACKUP_SOURCE_REGISTRY.filter((source) => source.storageKey === WORKSPACE_PREFERENCE_STORAGE_KEY || source.storageKeys?.includes(WORKSPACE_PREFERENCE_STORAGE_KEY)).length,
  1,
  "workspace preference must be registered exactly once",
);
equal(safePreferenceSource.affectsCoverage, false);
equal(safePreferenceSource.containsSecurityOrSessionState, false);

console.log(`Code 3 workspace preference tests passed (${assertionCount} assertions).`);
