import assert from "node:assert/strict";
import { createDeviceTransfer, inspectDeviceTransfer, compareDeviceTransfer, transferRecoveryParts } from "../src/features/backup/deviceTransfer.js";
import { canonicalStringify, hashCanonicalJson } from "../src/features/backup/canonicalJson.js";
import { BACKUP_SOURCE_REGISTRY } from "../src/features/backup/backupSourceRegistry.js";
import { WORKSPACE_BINDING_KEY } from "../src/features/persistence/workspaceOwnerBinding.js";
import { reconcileWorkspaceSources, workspaceSourceHashes, WORKSPACE_SYNC_SOURCES } from "../src/features/persistence/cloudWorkspaceSources.js";
import { planWorkspaceRestore } from "../src/features/backup/workspaceRestorePlan.js";
import { applyWorkspaceSources } from "../src/features/backup/workspaceRecovery.js";
import { getPhase2dQaFixture } from "../src/features/botOps/fixtures/phase2dQaFixtures.js";
import { createFixtureDraftInput } from "../src/features/purchaseReceiving/fixtures/phase2caFixtures.js";
import { createMemoryPurchaseReceivingStorage, createPurchaseReceivingService, PURCHASE_RECEIVING_STORAGE_KEY } from "../src/features/purchaseReceiving/index.js";

const userId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000011";
const CORE = "et-tcg-beta-data";
const locks = { request: async (_name, _options, callback) => callback({ name: "synthetic" }) };
class Storage {
  constructor(values = {}, owner = userId) { this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])); if (owner) this.values.set(WORKSPACE_BINDING_KEY, JSON.stringify({ version: 1, ownerId: owner })); this.writes = 0; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes++; this.values.set(key, String(value)); }
  removeItem(key) { this.writes++; this.values.delete(key); }
  snapshot() { return canonicalStringify([...this.values]); }
}
async function cloud({ quantity = 2, file = "test", rows = true, incomplete = false, owner = userId } = {}) {
  const bytes = new TextEncoder().encode(file);
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const payload = { format: "code3-cloud-backup", version: 1, createdAt: "2026-10-18T10:00:00.000Z", records: { format: "code3-legacy-cloud-records", version: 1, ownerId: owner, sections: { inventory_items: rows ? [{ id: itemId, user_id: owner, name: "Synthetic card", quantity }] : [] }, recordCount: rows ? 1 : 0, fileManifest: [{ bucket: "receipts", path: "synthetic.png", size: bytes.length }], missingTables: incomplete ? ["workspaces"] : [], exclusions: [] }, attachments: [{ bucket: "receipts", path: "synthetic.png", size: bytes.length, mimeType: "image/png", sha256, base64: Buffer.from(bytes).toString("base64") }], coverage: incomplete ? "PARTIAL" : "COMPLETE_FOR_LISTED_SCOPE", fileErrors: [], externalFileReferences: 0 };
  return { backup: { ...payload, integrity: await hashCanonicalJson(payload) } };
}
const source = new Storage({ [CORE]: { items: [{ id: "owned-one", name: "One", quantity: 1 }, { id: "owned-two", name: "Two", quantity: 2 }], profile: { role: "admin", name: "Private local profile" } }, "sb-synthetic-auth-token": "never-export-me" });
const sessionStorage = new Storage({}, null);
const readCloudBackup = () => cloud();
const options = { storage: source, sessionStorage, userId, readCloudBackup };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const exported = await createDeviceTransfer(options);

await check("export includes every registered device source and verified cloud attachments, writes nothing", () => {
  assert.equal(exported.deviceRecordCount, 2); assert.equal(exported.cloudRecordCount, 1); assert.equal(exported.attachmentCount, 1);
  assert.equal(exported.transfer.deviceBackup.sections.length, BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport).length);
  assert.ok(!exported.json.includes("never-export-me")); assert.ok(!exported.json.includes("Private local profile"));
  assert.equal(source.writes, 0); assert.equal(sessionStorage.writes, 0);
});
await check("all matching record IDs and attachment bytes compare without writes", async () => {
  const before = source.snapshot(); const result = await compareDeviceTransfer(exported.json, options);
  assert.equal(result.device.matched, 2); assert.equal(result.cloud.matched, 1); assert.equal(result.attachments.matched, 1);
  assert.equal(result.device.missing, 0); assert.equal(result.device.different, 0); assert.equal(result.status, "LISTED_RECORDS_MATCH");
  assert.equal(source.snapshot(), before); assert.equal(source.writes, 0);
});
await check("equal record counts with replacement IDs cannot masquerade as a successful transfer", async () => {
  const storage = new Storage({ [CORE]: { items: [{ id: "owned-one", name: "One", quantity: 1 }, { id: "other", name: "Other", quantity: 2 }] } });
  const result = await compareDeviceTransfer(exported.json, { ...options, storage });
  assert.equal(result.device.expected, result.device.current); assert.equal(result.device.missing, 1); assert.equal(result.device.additional, 1); assert.equal(result.status, "REVIEW_DIFFERENCES"); assert.equal(storage.writes, 0);
});
await check("same IDs with changed values and attachment bytes are differences, never overwritten", async () => {
  const storage = new Storage({ [CORE]: { items: [{ id: "owned-one", name: "One", quantity: 999 }, { id: "owned-two", name: "Two", quantity: 2 }] } });
  const before = storage.snapshot();
  const result = await compareDeviceTransfer(exported.json, { ...options, storage, readCloudBackup: () => cloud({ quantity: 99, file: "diff" }) });
  assert.equal(result.device.different, 1); assert.equal(result.cloud.different, 1); assert.equal(result.attachments.different, 1); assert.equal(storage.snapshot(), before);
});
await check("newer additional records do not count as missing or become removed", async () => {
  const storage = new Storage({ [CORE]: { items: [...JSON.parse(source.getItem(CORE)).items, { id: "extra", quantity: 3 }] } });
  const result = await compareDeviceTransfer(exported.json, { ...options, storage });
  assert.equal(result.device.matched, 2); assert.equal(result.device.additional, 1); assert.equal(result.device.missing, 0); assert.equal(storage.writes, 0);
});
await check("owner mismatch, unclaimed storage and account changes fail closed", async () => {
  await assert.rejects(inspectDeviceTransfer(exported.json, { userId: otherId }), { code: "TRANSFER_OWNER_MISMATCH" });
  await assert.rejects(createDeviceTransfer({ ...options, userId: otherId }), { code: "TRANSFER_ACCOUNT_REQUIRED" });
  await assert.rejects(createDeviceTransfer({ ...options, storage: new Storage({}, null) }), { code: "TRANSFER_ACCOUNT_REQUIRED" });
  await assert.rejects(createDeviceTransfer({ ...options, assertCurrent() { throw new Error("account switched"); } }), /account switched/);
  await assert.rejects(createDeviceTransfer({ ...options, readCloudBackup: () => cloud({ owner: otherId }) }), /belong/);
});
await check("source edits during cloud download cannot produce a falsely current transfer", async () => {
  const storage = new Storage({ [CORE]: { items: [{ id: "one" }] } });
  await assert.rejects(createDeviceTransfer({ ...options, storage, readCloudBackup: async () => { storage.setItem(CORE, JSON.stringify({ items: [{ id: "one" }, { id: "newer" }] })); return cloud(); } }), { code: "TRANSFER_CHANGED" });
  assert.equal(JSON.parse(storage.getItem(CORE)).items.length, 2); assert.equal(storage.writes, 1);
});
await check("tampering, unsafe object keys and pending transaction journals block transfer", async () => {
  const tampered = JSON.parse(exported.json); tampered.deviceBackup.sections[0].data.injected = "changed";
  await assert.rejects(inspectDeviceTransfer(JSON.stringify(tampered), { userId }), { code: "TRANSFER_INTEGRITY" });
  await assert.rejects(inspectDeviceTransfer('{"__proto__":{}}', { userId }), { code: "PROHIBITED_KEY" });
  const storage = new Storage({ "code3.workspace-recovery.v1": "interrupted" });
  await assert.rejects(createDeviceTransfer({ ...options, storage }), { code: "TRANSFER_RECOVERY_REQUIRED" }); assert.equal(storage.writes, 0);
});
await check("offline device-only export is explicit incomplete coverage and contains no cloud write", async () => {
  const offline = await createDeviceTransfer({ ...options, readCloudBackup: null });
  assert.equal(offline.cloudRecordCount, null); assert.equal(offline.attachmentCount, null); assert.ok(offline.warnings.some((warning) => warning.includes("not included")));
  const result = await compareDeviceTransfer(offline.json, { ...options, readCloudBackup: null }); assert.equal(result.status, "MATCHED_WITH_LIMITATIONS"); assert.equal(source.writes, 0);
  await assert.rejects(createDeviceTransfer({ ...options, readCloudBackup: async () => { throw new Error("offline"); } }), /offline/);
});
await check("unsupported draft restore and external file references stay visible", async () => {
  const storage = new Storage({ [CORE]: { items: [{ id: "photo", imageUrl: "blob:synthetic" }] } });
  const drafts = new Storage({ "private-business-hub.deal-analysis-draft.v1": { title: "Unfinished synthetic draft" }, "code3.session-draft-owner.v1": { version: 1, ownerId: userId } }, null);
  const result = await createDeviceTransfer({ ...options, storage, sessionStorage: drafts });
  assert.ok(result.warnings.some((warning) => warning.includes("Unsaved workflow drafts"))); assert.ok(result.warnings.some((warning) => warning.includes("original files")));
});
await check("unclaimed and other-account session drafts cannot enter a transfer", async () => {
  const drafts = new Storage({ "private-business-hub.deal-analysis-draft.v1": { title: "Unlinked" } }, null);
  await assert.rejects(createDeviceTransfer({ ...options, sessionStorage: drafts }), { code: "TRANSFER_DRAFT_OWNER_REQUIRED" });
  drafts.setItem("code3.session-draft-owner.v1", JSON.stringify({ version: 1, ownerId: otherId }));
  await assert.rejects(createDeviceTransfer({ ...options, sessionStorage: drafts }), { code: "TRANSFER_DRAFT_OWNER_REQUIRED" });
  assert.equal(drafts.getItem("private-business-hub.deal-analysis-draft.v1"), '{"title":"Unlinked"}');
});
await check("partial cloud coverage remains flagged even when matching record counts", async () => {
  const result = await compareDeviceTransfer(exported.json, { ...options, readCloudBackup: () => cloud({ incomplete: true }) });
  assert.equal(result.status, "MATCHED_WITH_LIMITATIONS"); assert.ok(result.warnings.some((warning) => warning.includes("unavailable")));
});
await check("transfer recovery uses original additive plans and preserves current conflicts, auth, prices", async () => {
  const target = new Storage({ [CORE]: { items: [{ id: "owned-one", name: "Newer", quantity: 3 }], marketPriceCache: { live: 123 } }, "sb-synthetic-auth-token": "keep-target-session" });
  const parts = await transferRecoveryParts(exported.json, { userId });
  const reviewed = await planWorkspaceRestore(parts.deviceRaw, { storage: target });
  assert.equal(reviewed.plan.preservedConflicts, 1); assert.equal(reviewed.plan.addedRecords, 1);
  await applyWorkspaceSources({ storage: target, ownerId: userId, locks, ...reviewed });
  const result = JSON.parse(target.getItem(CORE)); assert.equal(result.items[0].name, "Newer"); assert.equal(result.items.length, 2); assert.deepEqual(result.marketPriceCache, { live: 123 }); assert.equal(target.getItem("sb-synthetic-auth-token"), "keep-target-session");
});
await check("empty native workspace cannot overwrite populated cloud or auto-resolve conflicting local edits", async () => {
  const remote = { "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: "cloud-owned", quantity: 4 }] } } };
  const empty = await reconcileWorkspaceSources({ localSources: {}, remoteSources: remote }); assert.deepEqual(empty.sources, remote); assert.equal(empty.changedRemote.length, 0);
  const conflict = await reconcileWorkspaceSources({ baselineHashes: await workspaceSourceHashes(remote), localSources: { "legacy-core-business": { schemaVersion: 0, data: { items: [] } } }, remoteSources: { "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: "cloud-owned", quantity: 5 }] } } } });
  assert.deepEqual(conflict.conflicts, ["legacy-core-business"]);
});
await check("Bot and purchase records are covered by device export and generic cloud registry", async () => {
  const bot = getPhase2dQaFixture("synthetic-checkout-success").state;
  const sourceDef = BACKUP_SOURCE_REGISTRY.find((source) => source.sourceId === "bot-operations");
  const botState = structuredClone(sourceDef.emptyValue); botState.installations = bot.installations;
  const purchases = createMemoryPurchaseReceivingStorage(); let counter = 0;
  const service = createPurchaseReceivingService({ storage: purchases, isOwnerAuthorized: () => true, now: () => "2026-10-18T10:00:00.000Z", idFactory: (prefix) => `${prefix}.transfer-${++counter}.test` });
  await service.createDraft(createFixtureDraftInput({ retailerAccountReference: "", profileReference: "" }));
  const storage = new Storage({ "code3.bot-ops.v1": botState, [PURCHASE_RECEIVING_STORAGE_KEY]: purchases.getItem(PURCHASE_RECEIVING_STORAGE_KEY) });
  const result = await createDeviceTransfer({ ...options, storage });
  assert.ok(result.transfer.deviceBackup.sections.find((section) => section.sourceId === "bot-operations").recordCount > 0);
  assert.ok(result.transfer.deviceBackup.sections.find((section) => section.sourceId === "purchase-receiving").recordCount > 0);
  for (const id of ["bot-operations", "purchase-receiving"]) assert.ok(WORKSPACE_SYNC_SOURCES.some((source) => source.sourceId === id));
});
console.log(`PASS ${checks} device-transfer scenarios; synthetic storage and cloud records only.`);
