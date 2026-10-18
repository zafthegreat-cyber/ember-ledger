import { canonicalStringify, hashCanonicalJson, parseUntrustedBackupJson } from "./canonicalJson.js";
import { createVerifiedBackup, verifyBackupEnvelope } from "./backupFormat.js";
import { BACKUP_SOURCE_REGISTRY, BACKUP_STORAGE_TYPES } from "./backupSourceRegistry.js";
import { inspectLegacyCloudBackup } from "./legacyCloudBackup.js";
import { readWorkspaceBinding } from "../persistence/workspaceOwnerBinding.js";
import { previewBackupRestore } from "./restorePreview.js";
import { hasSessionDrafts, hasPendingSessionDraftSwitch, readSessionDraftBinding } from "../persistence/workspaceSessionBinding.js";

export const DEVICE_TRANSFER_FORMAT = "code3-device-transfer";
export const DEVICE_TRANSFER_MAX_BYTES = 52 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FIELDS = ["format", "version", "ownerId", "createdAt", "deviceBackup", "cloudBackup", "integrity"];
const includedSources = BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport);
const transactionKeys = ["code3.workspace-recovery.v1", "code3.workspace-owner-switch.v1", "code3.account-ops.restore-journal.v1", "ember-and-tide.flip-scout.v1.inventory-creation-commit-journal.v1", "code3.purchase-receiving.v1.inventory-reconciliation-commit-journal.v1"];
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function same(left, right) { return canonicalStringify(left) === canonicalStringify(right); }
function assertOwner(storage, userId) {
  if (!UUID.test(userId || "") || readWorkspaceBinding(storage)?.ownerId !== userId) fail("TRANSFER_ACCOUNT_REQUIRED", "Sign in to the account that owns these device records before preparing or comparing a transfer.");
  if (transactionKeys.some((key) => storage.getItem(key) !== null)) fail("TRANSFER_RECOVERY_REQUIRED", "An interrupted save needs recovery before preparing a transfer. Keep the app’s stored data and retry safely.");
}
function assertDraftOwner(storage, userId) {
  if (!storage?.getItem) return;
  if (hasPendingSessionDraftSwitch(storage) || hasSessionDrafts(storage) && readSessionDraftBinding(storage)?.ownerId !== userId) fail("TRANSFER_DRAFT_OWNER_REQUIRED", "This tab has unfinished or unlinked drafts. Confirm their original account before preparing a transfer.");
}
function copyStorage(storage, type) {
  const keys = new Set(includedSources.filter((source) => source.storageType === type).flatMap((source) => source.storageKeys || [source.storageKey]).filter(Boolean));
  const prefixes = includedSources.filter((source) => source.storageType === type).flatMap((source) => source.storagePrefixes || []);
  for (let index = 0; index < (storage?.length || 0); index++) {
    const key = storage.key(index);
    if (typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix))) keys.add(key);
  }
  // Account Ops backup must still consult its existing recovery guard.
  if (type === BACKUP_STORAGE_TYPES.LOCAL_STORAGE) keys.add("code3.account-ops.restore-journal.v1");
  const values = new Map([...keys].sort().map((key) => [key, storage?.getItem(key) ?? null]).filter(([, value]) => value !== null));
  return { getItem: (key) => values.get(key) ?? null, key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; }, fingerprint: () => canonicalStringify([...values]) };
}

/** Read-only package. No source storage, cloud record, baseline, or ownership marker is written. */
export async function createDeviceTransfer({ storage, sessionStorage, userId, readCloudBackup, assertCurrent = () => {}, applicationVersion = "unknown" } = {}) {
  assertOwner(storage, userId); assertDraftOwner(sessionStorage, userId); assertCurrent();
  const device = copyStorage(storage, BACKUP_STORAGE_TYPES.LOCAL_STORAGE);
  const drafts = copyStorage(sessionStorage, BACKUP_STORAGE_TYPES.SESSION_STORAGE);
  const result = await createVerifiedBackup({ localStorage: device, sessionStorage: drafts, configuredSourceIds: ["supabase-owner-data"], applicationVersion });
  if (!result.verified) fail("TRANSFER_BACKUP_INVALID", "Some device records could not be backed up. Keep the original app and resolve its backup findings first.");
  const cloud = readCloudBackup ? await readCloudBackup() : null;
  assertCurrent(); assertOwner(storage, userId); assertDraftOwner(sessionStorage, userId);
  if (device.fingerprint() !== copyStorage(storage, BACKUP_STORAGE_TYPES.LOCAL_STORAGE).fingerprint()
    || drafts.fingerprint() !== copyStorage(sessionStorage, BACKUP_STORAGE_TYPES.SESSION_STORAGE).fingerprint()) fail("TRANSFER_CHANGED", "Records changed while the transfer was prepared. Your records are unchanged; prepare a fresh copy.");
  const payload = { format: DEVICE_TRANSFER_FORMAT, version: 1, ownerId: userId, createdAt: new Date().toISOString(), deviceBackup: result.backup, cloudBackup: cloud?.backup || null };
  const transfer = { ...payload, integrity: await hashCanonicalJson(payload) };
  const json = canonicalStringify(transfer);
  const checked = await inspectDeviceTransfer(json, { userId });
  assertCurrent(); assertOwner(storage, userId); assertDraftOwner(sessionStorage, userId);
  return { ...checked, json, fileName: `code-3-device-transfer-${transfer.createdAt.slice(0, 10)}.json` };
}

export async function inspectDeviceTransfer(raw, { userId } = {}) {
  const transfer = parseUntrustedBackupJson(raw, { maxBytes: DEVICE_TRANSFER_MAX_BYTES, maxStringLength: 12 * 1024 * 1024, maxTotalRecords: 250000 });
  if (!UUID.test(userId || "") || transfer.ownerId !== userId) fail("TRANSFER_OWNER_MISMATCH", "This transfer belongs to a different account. Sign in to the original account; no records were changed.");
  if (transfer.format !== DEVICE_TRANSFER_FORMAT || transfer.version !== 1 || Object.keys(transfer).some((key) => !FIELDS.includes(key))
    || !Number.isFinite(Date.parse(transfer.createdAt))) fail("TRANSFER_INVALID", "This transfer format is not supported.");
  const { integrity, ...payload } = transfer;
  if (await hashCanonicalJson(payload) !== integrity) fail("TRANSFER_INTEGRITY", "This transfer is damaged or has changed. Keep the original app and prepare another copy.");
  const checked = await verifyBackupEnvelope(transfer.deviceBackup);
  if (!checked.valid || transfer.deviceBackup.coverageStatus === "FAILED") fail("TRANSFER_BACKUP_INVALID", "The device records in this transfer failed validation.");
  const sectionIds = transfer.deviceBackup.sections.map((section) => section.sourceId);
  if (new Set(sectionIds).size !== sectionIds.length || includedSources.some((source) => !sectionIds.includes(source.sourceId))) fail("TRANSFER_SOURCE_MISSING", "This transfer does not cover every supported device record group. Prepare a current transfer from the original app.");
  const preview = await previewBackupRestore(canonicalStringify(transfer.deviceBackup));
  if (!["READY_FOR_FUTURE_RESTORE", "READY_WITH_WARNINGS"].includes(preview.result)) fail("TRANSFER_BACKUP_INVALID", "The device records need schema, security, or relationship review before transfer.");
  const cloud = transfer.cloudBackup === null ? null : await inspectLegacyCloudBackup(canonicalStringify(transfer.cloudBackup), { userId });
  const warnings = [];
  if (!cloud) warnings.push("Cloud records and cloud attachment bytes are not included. Compare again with cloud access before completing your move.");
  if (cloud?.coverage !== "COMPLETE_FOR_LISTED_SCOPE" && cloud) warnings.push("Some cloud tables or files were unavailable. Keep the original app and the listed files.");
  const files = transfer.deviceBackup.coverageSummary?.fileReferences || {};
  const fileReferencesToCheck = Math.max(0, (files.total || 0) - (files.embedded || 0));
  if (fileReferencesToCheck) warnings.push(`${fileReferencesToCheck} device file reference(s) need their original files. A matching reference alone does not verify image or receipt bytes.`);
  const drafts = transfer.deviceBackup.sections.find((section) => section.sourceId === "workflow-drafts");
  if (drafts && Object.keys(drafts.data).length) warnings.push("Unsaved workflow drafts are preserved in this file but are not imported by device recovery. Finish those drafts in the original app.");
  const excluded = transfer.deviceBackup.manifest.excludedSources.filter((source) => source.affectsCoverage && source.sourceId !== "supabase-owner-data" && source.sourceId !== "file-assets");
  for (const source of excluded) warnings.push(`${source.displayName}: ${source.reason}`);
  if (cloud) warnings.push(...cloud.exclusions);
  return { transfer, cloud, warnings, fileReferencesToCheck, deviceRecordCount: transfer.deviceBackup.coverageSummary.recordCount,
    cloudRecordCount: cloud?.recordCount ?? null, attachmentCount: cloud?.attachmentCount ?? null };
}

function recordId(record) {
  if (!record || typeof record !== "object") return null;
  const id = record.id ?? record.recordId ?? record.record_id ?? record.postId ?? record.reportId ?? record.eventId;
  return id == null ? null : String(id);
}
function rowsAt(data, path) {
  const value = path === "$" ? data : path.split(".").reduce((current, key) => current?.[key], data);
  return Array.isArray(value) ? value : path === "$" && value && Object.keys(value).length ? [value] : [];
}
function compareRows(expected, current) {
  const result = { expected: expected.length, current: current.length, matched: 0, missing: 0, different: 0, additional: 0 };
  const keyOf = (record) => recordId(record) === null ? `content:${canonicalStringify(record)}` : `id:${recordId(record)}`;
  const indexed = new Map();
  for (const record of current) {
    const key = keyOf(record);
    if (!indexed.has(key)) indexed.set(key, []);
    indexed.get(key).push(record);
  }
  let used = 0;
  for (const record of expected) {
    const candidates = indexed.get(keyOf(record));
    if (!candidates?.length) result.missing++;
    else { used++; if (same(candidates.pop(), record)) result.matched++; else result.different++; }
  }
  result.additional = current.length - used;
  return result;
}
function sumRows(rows) {
  return rows.reduce((total, row) => Object.fromEntries(Object.keys(total).map((key) => [key, total[key] + row[key]])), { expected: 0, current: 0, matched: 0, missing: 0, different: 0, additional: 0 });
}

/** Compares identifiers AND record contents; equal counts cannot conceal a lost/replaced record. */
export async function compareDeviceTransfer(raw, { storage, sessionStorage, userId, readCloudBackup, assertCurrent = () => {} } = {}) {
  assertOwner(storage, userId); assertCurrent();
  const source = await inspectDeviceTransfer(raw, { userId });
  const current = await createDeviceTransfer({ storage, sessionStorage, userId, readCloudBackup, assertCurrent });
  assertOwner(storage, userId); assertCurrent();
  const currentSections = new Map(current.transfer.deviceBackup.sections.map((section) => [section.sourceId, section]));
  const sections = source.transfer.deviceBackup.sections.filter((section) => {
    const registered = BACKUP_SOURCE_REGISTRY.find((candidate) => candidate.sourceId === section.sourceId);
    return registered?.storageType === BACKUP_STORAGE_TYPES.LOCAL_STORAGE;
  }).map((section) => {
    const registered = BACKUP_SOURCE_REGISTRY.find((candidate) => candidate.sourceId === section.sourceId);
    const present = currentSections.get(section.sourceId)?.data || {};
    return { sourceId: section.sourceId, name: registered.displayName,
      ...sumRows(registered.recordPaths.map((path) => compareRows(rowsAt(section.data, path), rowsAt(present, path)))),
      settingsDiffer: !same(section.data, present) };
  });
  const cloudSections = source.cloud && current.cloud ? Object.entries(source.cloud.backup.records.sections).map(([name, rows]) => ({ name, ...compareRows(rows, current.cloud.backup.records.sections[name] || []) })) : null;
  const attachments = source.cloud && current.cloud ? compareRows(source.cloud.backup.attachments.map(({ bucket, path, sha256, size }) => ({ id: `${bucket}/${path}`, sha256, size })), current.cloud.backup.attachments.map(({ bucket, path, sha256, size }) => ({ id: `${bucket}/${path}`, sha256, size }))) : null;
  const device = sumRows(sections);
  const cloud = cloudSections ? sumRows(cloudSections) : null;
  const differences = device.missing + device.different + (cloud?.missing || 0) + (cloud?.different || 0) + (attachments?.missing || 0) + (attachments?.different || 0);
  const warnings = [...new Set([...source.warnings, ...current.warnings])];
  return { checkedAt: new Date().toISOString(), sourceCreatedAt: source.transfer.createdAt, sections, device, cloud, cloudSections, attachments, warnings,
    status: differences ? "REVIEW_DIFFERENCES" : !cloud || warnings.length ? "MATCHED_WITH_LIMITATIONS" : "LISTED_RECORDS_MATCH",
    settingsDiffer: sections.filter((section) => section.settingsDiffer).length,
    message: differences ? "Some saved records need review. Both versions are unchanged." : "All compared source records match. Additional records on this device were kept.",
  };
}

export async function transferRecoveryParts(raw, { userId } = {}) {
  const checked = await inspectDeviceTransfer(raw, { userId });
  return { deviceRaw: canonicalStringify(checked.transfer.deviceBackup), cloudRaw: checked.cloud ? canonicalStringify(checked.transfer.cloudBackup) : null, warnings: checked.warnings };
}
