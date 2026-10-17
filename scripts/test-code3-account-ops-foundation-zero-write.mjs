import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let assertions = 0;
const check = (value, message) => { assertions += 1; assert.ok(value, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };

const calls = { localReads: 0, localWrites: 0, sessionReads: 0, sessionWrites: 0, indexedDb: 0, fetch: 0 };
const memoryStorage = (readKey, writeKey) => Object.freeze({
  getItem() { calls[readKey] += 1; return null; },
  setItem() { calls[writeKey] += 1; throw new Error("Phase 2A.6-A attempted a persistence write."); },
  removeItem() { calls[writeKey] += 1; throw new Error("Phase 2A.6-A attempted a persistence write."); },
  clear() { calls[writeKey] += 1; throw new Error("Phase 2A.6-A attempted a persistence write."); },
  key() { calls[readKey] += 1; return null; },
  length: 0,
});

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage("localReads", "localWrites") });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: memoryStorage("sessionReads", "sessionWrites") });
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new Proxy({}, { get() { calls.indexedDb += 1; throw new Error("IndexedDB is outside this foundation."); } }) });
Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { calls.fetch += 1; throw new Error("Network access is outside this foundation."); } });

const foundation = await import("../src/features/accountOps/operationsFoundation/index.js");
const fixtures = await import("../src/features/accountOps/operationsFoundation/fixtures/index.js");
const backup = await import("../src/features/backup/backupSourceRegistry.js");
const migration = await import("../src/features/persistence/migrationSourceRegistry.js");

const fixture = fixtures.getPhase2a6aQaFixture("attention-center-mixed");
const beforeAccountOps = JSON.stringify(fixture.accountOps);
const beforeOperations = JSON.stringify(fixture.operations);
const backupIdsBefore = backup.BACKUP_SOURCE_REGISTRY.map((entry) => entry.sourceId);
const migrationIdsBefore = migration.MIGRATION_SOURCE_REGISTRY.map((entry) => entry.sourceId);

const view = foundation.createAccountOpsOperationsViewModel({
  accountOpsSnapshot: fixture.accountOps,
  operationsSnapshot: fixture.operations,
  asOf: fixtures.PHASE_2A6A_QA_NOW,
});
view.search("synthetic");
foundation.deriveAccountCreationPlans(fixture.accountOps);
foundation.deriveAccountHealthCenter(fixture.accountOps, [], { asOf: fixtures.PHASE_2A6A_QA_NOW });
foundation.deriveVerificationInbox(fixture.accountOps, fixture.operations, { asOf: fixtures.PHASE_2A6A_QA_NOW });
foundation.detectAccountConflicts(fixture.accountOps, fixture.operations);

equal(JSON.stringify(fixture.accountOps), beforeAccountOps, "canonical Account Ops input must remain byte-equivalent");
equal(JSON.stringify(fixture.operations), beforeOperations, "ephemeral operations input must remain byte-equivalent");
equal(view.writesAllowed, false, "the derived view must prohibit writes");
equal(view.networkAllowed, false, "the derived view must prohibit network access");
equal(view.operations.persisted, false, "operations data must remain non-persisted");
equal(view.operations.authoritative, false, "operations data must remain non-authoritative");
equal(calls.localReads, 0, "foundation derivation must not read localStorage");
equal(calls.localWrites, 0, "foundation derivation must not write localStorage");
equal(calls.sessionReads, 0, "foundation derivation must not read sessionStorage");
equal(calls.sessionWrites, 0, "foundation derivation must not write sessionStorage");
equal(calls.indexedDb, 0, "foundation derivation must not access IndexedDB");
equal(calls.fetch, 0, "foundation derivation must not make network requests");

equal(backup.BACKUP_SOURCE_REGISTRY.map((entry) => entry.sourceId).join("\n"), backupIdsBefore.join("\n"), "backup registry must remain unchanged during review");
equal(migration.MIGRATION_SOURCE_REGISTRY.map((entry) => entry.sourceId).join("\n"), migrationIdsBefore.join("\n"), "migration registry must remain unchanged during review");
check(!backupIdsBefore.some((id) => /operations-foundation|account-health|verification-center|phone-resource|payment-metadata|proxy-group|export-readiness|server-manager|browser-session/i.test(id)), "derived foundation collections must not become backup sources");
check(!migrationIdsBefore.some((id) => /operations-foundation|account-health|verification-center|phone-resource|payment-metadata|proxy-group|export-readiness|server-manager|browser-session/i.test(id)), "derived foundation collections must not become migration sources");

const implementationPaths = [
  "src/features/accountOps/operationsFoundation/constants.js",
  "src/features/accountOps/operationsFoundation/contracts.js",
  "src/features/accountOps/operationsFoundation/selectors.js",
  "src/features/accountOps/operationsFoundation/AccountOpsOperationsPanel.jsx",
];
for (const path of implementationPaths) {
  const text = source(path);
  assertions += 1;
  assert.doesNotMatch(text, /createAccountOps(?:Repository|Persistence|Service)|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/, `${path} must not depend on storage, repositories, services, or network clients`);
}

const contractsSource = source("src/features/accountOps/operationsFoundation/contracts.js");
const selectorsSource = source("src/features/accountOps/operationsFoundation/selectors.js");
check(/persisted:\s*false/.test(contractsSource) && /authoritative:\s*false/.test(contractsSource), "the contract must encode non-persistence and non-authority");
check(/writesAllowed\s*=\s*false/.test(selectorsSource) && /networkAllowed\s*=\s*false/.test(selectorsSource), "the view model must encode write/network prohibition");

console.log(`Code 3 Account Ops foundation zero-write: ${assertions} assertions passed.`);
