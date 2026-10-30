import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticHistory, syntheticOwner, syntheticScout, syntheticStorage, MemoryStorage } from "./restock-history-test-fixtures.mjs";
import { HISTORY_FIELD, prepareHistoricalRestockImport, readHistoricalRestockHistory } from "../src/features/restockHistory/historyArchive.mjs";
import { countSourceRecords, createVerifiedBackup, verifyBackupJson } from "../src/features/backup/backupFormat.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";
import { applyWorkspaceSources, captureRecoverySources } from "../src/features/backup/workspaceRecovery.js";
import { captureWorkspaceSources, WORKSPACE_CLOUD_FORMAT } from "../src/features/persistence/cloudWorkspaceSources.js";
import { createCloudWorkspaceSync } from "../src/features/persistence/cloudWorkspaceSync.js";

const locks = { request: async (_name, _options, run) => run({ name: "synthetic-test-lock" }) };
const clone = value => JSON.parse(JSON.stringify(value));
const unchangedKeys = ["et-tcg-beta-data", "et-tcg-market-price-cache"];

test("historical reports are counted in verified backups and restored without entering operational reports", async () => {
  const storage = syntheticStorage(), before = storage.getItem("et-tcg-beta-scout"), archive = await syntheticHistory(3);
  const result = await prepareHistoricalRestockImport(JSON.parse(before), archive);
  const source = getBackupSource("legacy-restock-scout");
  assert.equal(countSourceRecords(result.nextScout, source), countSourceRecords(JSON.parse(before), source) + 3);
  storage.setItem("et-tcg-beta-scout", JSON.stringify(result.nextScout));
  const backup = await createVerifiedBackup({ localStorage: storage, sourceRegistry: [source] });
  const verified = await verifyBackupJson(backup.json);
  assert.equal(verified.valid, true);
  const decoded = readHistoricalRestockHistory(JSON.parse(backup.json).sections[0].data);
  assert.equal(decoded.observations.length, 3);
  assert.deepEqual(result.nextScout.reports, JSON.parse(before).reports);
  assert.deepEqual(result.nextScout.restockIntel, JSON.parse(before).restockIntel);
  assert.deepEqual(result.nextScout.restockPatterns, JSON.parse(before).restockPatterns);
});

test("real recovery and sync modules retain prices, save once and deliver exact history to a second device", async () => {
  const storage = syntheticStorage(), protectedBytes = Object.fromEntries(unchangedKeys.map(key => [key, storage.getItem(key)]));
  let remote = { format: WORKSPACE_CLOUD_FORMAT, revision: 0, updatedAt: null, sources: {} }, writes = 0;
  const transport = { authorize: async () => {}, read: async () => clone(remote), close() {},
    write: async ({ expectedRevision, sources }) => {
      assert.equal(expectedRevision, remote.revision); writes++;
      remote = { format: WORKSPACE_CLOUD_FORMAT, revision: remote.revision + 1, updatedAt: new Date().toISOString(), sources: clone(sources) };
      return clone(remote);
    } };
  const makeSync = storage => createCloudWorkspaceSync({ storage, ownerId: syntheticOwner, transport, locks,
    applySources: args => applyWorkspaceSources({ ...args, locks }) });
  const first = makeSync(storage);
  assert.equal((await first.sync()).status, "SYNCED");
  assert.equal(writes, 1);
  const scoutBefore = JSON.parse(storage.getItem("et-tcg-beta-scout"));
  const incoming = await syntheticHistory(3);
  const prepared = await prepareHistoricalRestockImport(scoutBefore, incoming);
  const before = captureRecoverySources(storage);
  await applyWorkspaceSources({ storage, expectedSources: { "legacy-restock-scout": before["legacy-restock-scout"] },
    nextSources: { "legacy-restock-scout": { schemaVersion: 0, data: prepared.nextScout } }, ownerId: syntheticOwner, locks });
  assert.equal((await first.sync()).status, "SYNCED");
  assert.equal(writes, 2);
  for (const key of unchangedKeys) assert.equal(storage.getItem(key), protectedBytes[key]);
  const savedScout = JSON.parse(storage.getItem("et-tcg-beta-scout"));
  const { [HISTORY_FIELD]: _history, ...retained } = savedScout;
  assert.deepEqual(retained, scoutBefore);
  const again = await prepareHistoricalRestockImport(savedScout, incoming);
  assert.equal(again.changed, false);
  assert.equal((await first.sync()).status, "SYNCED"); assert.equal(writes, 2, "repeat import must not create another cloud revision");
  const secondStorage = new MemoryStorage({ "code3.workspace-owner.v1": { version: 1, ownerId: syntheticOwner } });
  const second = makeSync(secondStorage);
  assert.equal((await second.sync({ allowApply: true })).status, "SYNCED");
  assert.equal(writes, 2, "reading a second device must not produce duplicate writes");
  assert.deepEqual(readHistoricalRestockHistory(JSON.parse(secondStorage.getItem("et-tcg-beta-scout"))), readHistoricalRestockHistory(savedScout));
  for (const key of unchangedKeys) assert.deepEqual(JSON.parse(secondStorage.getItem(key)), JSON.parse(protectedBytes[key]));
  assert.equal(captureWorkspaceSources(secondStorage)["legacy-restock-scout"].data.reports.length, 1);
  first.close(); second.close();
});

test("write denial, another writer and account changes leave original records and prices intact", async () => {
  const archive = await syntheticHistory(2), storage = syntheticStorage(), original = storage.snapshot();
  const before = captureRecoverySources(storage), next = (await prepareHistoricalRestockImport(syntheticScout(), archive)).nextScout;
  const args = { storage, expectedSources: { "legacy-restock-scout": before["legacy-restock-scout"] },
    nextSources: { "legacy-restock-scout": { schemaVersion: 0, data: next } }, ownerId: syntheticOwner, locks };
  await assert.rejects(applyWorkspaceSources({ ...args, locks: { request: async (_name, _options, run) => run(null) } }), error => error.code === "WORKSPACE_BUSY");
  assert.equal(storage.snapshot(), original);
  await assert.rejects(applyWorkspaceSources({ ...args, assertCurrent: () => { throw new Error("Account changed"); } }), /Account changed/);
  assert.equal(storage.snapshot(), original);
  const originalSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === "et-tcg-beta-scout" && value.includes(HISTORY_FIELD)) throw new Error("Synthetic quota denial");
    originalSet(key, value);
  };
  await assert.rejects(applyWorkspaceSources(args), error => error.code === "STORAGE_WRITE_FAILED");
  assert.deepEqual(JSON.parse(storage.getItem("et-tcg-beta-scout")), syntheticScout());
  for (const key of unchangedKeys) assert.equal(storage.getItem(key), syntheticStorage().getItem(key));
});
