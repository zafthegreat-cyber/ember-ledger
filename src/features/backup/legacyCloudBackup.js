import { canonicalStringify, hashCanonicalJson, parseUntrustedBackupJson, sha256Text } from "./canonicalJson.js";

export const LEGACY_CLOUD_TABLES = Object.freeze(["workspaces", "vehicles", "inventory_items", "user_inventory", "sales_records", "business_expenses", "mileage_trips", "app_user_preferences", "notification_preferences", "deal_finder_sessions", "deal_finder_items", "scanner_intake_sessions", "marketplace_listing_channels", "receipt_records", "receipt_line_items", "kid_community_projects", "kid_community_project_items", "ai_assist_events", "store_user_watchlist", "saved_listings"]);
const BUCKETS = new Set(["receipts", "receipt-images", "product-submissions", "feedback-screenshots"]);
const CHILD_TABLES = new Set(["deal_finder_items", "receipt_line_items", "kid_community_project_items"]);
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 24 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function abort(signal) { if (signal?.aborted) throw new DOMException("Backup recovery was cancelled.", "AbortError"); }
function fail(message) { throw new Error(message); }
function fileKey(file) { return `${file.bucket}/${file.path}`; }
function safeFile(file) { return file && BUCKETS.has(file.bucket) && typeof file.path === "string" && file.path.length > 0 && file.path.length < 1024 && !file.path.includes("\\") && !file.path.includes(String.fromCharCode(0)) && file.path.split("/").every((part) => part && part !== "." && part !== ".."); }
async function digestBytes(bytes) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function base64(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192)); return btoa(binary); }
function decode(encoded) { if (typeof encoded !== "string" || encoded.length > MAX_FILE_BYTES * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail("An attachment has invalid encoded bytes."); return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)); }

function boundedOperation(operation, { signal, timeoutMs = 90_000 } = {}) {
  abort(signal);
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false; let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); callback(value);
    };
    const cancel = () => { controller.abort(); finish(reject, new DOMException("Backup recovery was cancelled. An attachment already uploading may finish as a new copy in the original account; existing files are never overwritten.", "AbortError")); };
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      finish(reject, new Error("Cloud backup recovery timed out. Existing records and files were not replaced. An attachment already uploading may finish as a new copy in the original account. Review saved cloud records before retrying."));
    }, timeoutMs);
    Promise.resolve().then(() => operation(controller.signal)).then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

async function account(client, userId, signal, pinnedToken = null) {
  abort(signal);
  if (!client || !UUID.test(userId || "")) fail("Sign in before exporting or recovering cloud records.");
  const session = await client.auth.getSession();
  abort(signal);
  const token = pinnedToken || session.data?.session?.access_token;
  if (session.error || session.data?.session?.user?.id !== userId || !token) fail("The signed-in account changed. Reopen backup recovery for the current account.");
  const { data, error } = await client.auth.getUser(token);
  abort(signal);
  if (error || data?.user?.id !== userId) fail("The signed-in account changed. Reopen backup recovery for the current account.");
  return token;
}
function authorizedRequest(request, token) {
  if (!request?.setHeader || !token) fail("This deployment cannot bind recovery requests to the verified account. Your existing data is unchanged.");
  return request.setHeader("Authorization", `Bearer ${token}`);
}
function files(client, bucket, token) { return authorizedRequest(client.storage.from(bucket), token); }
async function rpc(client, name, args, signal, token) {
  abort(signal);
  const query = authorizedRequest(client.rpc(name, args), token);
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  abort(signal);
  if (error) fail(error.code === "PGRST202" ? "Cloud backup recovery is not installed on this deployment yet." : error.message || "Cloud backup could not finish.");
  return data;
}

function validateRecords(records, userId) {
  if (records?.format !== "code3-legacy-cloud-records" || records.version !== 1 || records.ownerId !== userId || !records.sections || Array.isArray(records.sections)) fail("The cloud backup does not belong to this account or format.");
  let count = 0;
  for (const [table, rows] of Object.entries(records.sections)) {
    if (!LEGACY_CLOUD_TABLES.includes(table) || !Array.isArray(rows)) fail("The cloud backup contains an unsupported source.");
    const ids = new Set();
    for (const row of rows) {
      if (!row || !UUID.test(row.id || "") || ids.has(row.id)) fail("Cloud records need unique stable IDs.");
      ids.add(row.id);
      if (table === "workspaces" ? row.owner_user_id !== userId : !CHILD_TABLES.has(table) && row.user_id !== userId) fail("A backup record belongs to a different account.");
    }
    count += rows.length;
    if (count > 100000) fail("The cloud backup has too many records.");
  }
  if (records.recordCount !== count) fail("The cloud backup record count does not match its contents.");
  return count;
}

function referencedFiles(records, projectUrl) {
  if (!Array.isArray(records.fileManifest || [])) fail("The cloud attachment manifest is invalid.");
  const files = new Map((records.fileManifest || []).filter(safeFile).map((file) => [fileKey(file), file]));
  let externalReferences = (records.fileManifest || []).filter((file) => !safeFile(file)).length;
  const stack = [records.sections];
  const origin = projectUrl ? new URL(projectUrl).origin : null;
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) { stack.push(...value); continue; }
    if (value && typeof value === "object") { stack.push(...Object.values(value)); continue; }
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) continue;
    let url; try { url = new URL(value); } catch { continue; }
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) continue;
    if (!origin || url.origin !== origin) { externalReferences++; continue; }
    let file; try { file = { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) }; } catch { externalReferences++; continue; }
    if (!safeFile(file)) { externalReferences++; continue; }
    if (!files.has(fileKey(file))) files.set(fileKey(file), file);
  }
  return { files: [...files.values()], externalReferences };
}

export async function exportLegacyCloudBackup(options = {}) { return boundedOperation((signal) => exportCloud({ ...options, signal }), options); }
async function exportCloud({ client, userId, signal, projectUrl = client?.supabaseUrl } = {}) {
  const token = await account(client, userId, signal);
  const records = await rpc(client, "code3_export_legacy_cloud_backup", {}, signal, token);
  validateRecords(records, userId);
  const referenced = referencedFiles(records, projectUrl);
  const attachments = []; const fileErrors = [];
  let totalBytes = 0;
  for (const file of referenced.files) {
    abort(signal);
    try {
      if (Number(file.size || 0) > MAX_FILE_BYTES || totalBytes + Number(file.size || 0) > MAX_TOTAL_FILE_BYTES) fail("Attachment exceeds the supported download size.");
      await account(client, userId, signal, token);
      const { data, error } = await files(client, file.bucket, token).download(file.path, {}, { signal });
      abort(signal);
      if (error || !data) fail("Attachment could not be downloaded with this account's access.");
      if (data.size > MAX_FILE_BYTES || totalBytes + data.size > MAX_TOTAL_FILE_BYTES || file.size != null && Number(file.size) !== data.size) fail("Attachment size changed or exceeds the supported limit.");
      const bytes = new Uint8Array(await data.arrayBuffer());
      attachments.push({ bucket: file.bucket, path: file.path, mimeType: data.type || file.mimeType || "application/octet-stream", size: bytes.length, sha256: await digestBytes(bytes), base64: base64(bytes) });
      totalBytes += bytes.length;
    } catch (error) { abort(signal); fileErrors.push({ bucket: file.bucket, path: file.path, message: error.message }); }
  }
  await account(client, userId, signal, token);
  const payload = { format: "code3-cloud-backup", version: 1, createdAt: new Date().toISOString(), records, attachments,
    coverage: fileErrors.length || records.missingTables?.length || referenced.externalReferences ? "PARTIAL" : "COMPLETE_FOR_LISTED_SCOPE",
    fileErrors, externalFileReferences: referenced.externalReferences,
  };
  const backup = { ...payload, integrity: await hashCanonicalJson(payload) };
  const json = canonicalStringify(backup);
  if (new TextEncoder().encode(json).byteLength > MAX_BYTES) fail("Cloud backup exceeds 40 MB. Download record and attachment groups separately.");
  await inspectLegacyCloudBackup(json, { userId });
  abort(signal);
  return { backup, json, fileName: `code-3-cloud-backup-${backup.createdAt.slice(0, 10)}.json`, verified: true };
}

export async function inspectLegacyCloudBackup(raw, { userId } = {}) {
  const backup = parseUntrustedBackupJson(raw, { maxBytes: MAX_BYTES, maxStringLength: MAX_FILE_BYTES * 1.4, maxTotalRecords: 150000 });
  const { integrity, ...payload } = backup;
  if (backup.format !== "code3-cloud-backup" || backup.version !== 1 || await hashCanonicalJson(payload) !== integrity) fail("Cloud backup integrity could not be verified.");
  const recordCount = validateRecords(backup.records, userId);
  if (!["COMPLETE_FOR_LISTED_SCOPE", "PARTIAL"].includes(backup.coverage) || !Array.isArray(backup.fileErrors) || !Number.isSafeInteger(backup.externalFileReferences) || backup.externalFileReferences < 0) fail("The cloud backup coverage report is invalid.");
  if (!Array.isArray(backup.attachments) || backup.attachments.length > 1000) fail("The attachment manifest is invalid.");
  const seen = new Set(); let fileBytes = 0;
  for (const file of backup.attachments) {
    if (!safeFile(file) || seen.has(fileKey(file))) fail("The attachment manifest contains an unsafe or duplicate path.");
    seen.add(fileKey(file));
    const bytes = decode(file.base64);
    fileBytes += bytes.length;
    if (bytes.length !== file.size || await digestBytes(bytes) !== file.sha256 || fileBytes > MAX_TOTAL_FILE_BYTES) fail("An attachment failed byte integrity or size verification.");
  }
  if (!Array.isArray(backup.records.fileManifest) || !Array.isArray(backup.records.missingTables) || !Array.isArray(backup.records.exclusions)) fail("The cloud backup source manifest is invalid.");
  const incomplete = backup.fileErrors.length || backup.externalFileReferences || backup.records.missingTables.length || backup.records.fileManifest.some((file) => !safeFile(file) || !seen.has(fileKey(file)));
  if (backup.coverage === "COMPLETE_FOR_LISTED_SCOPE" && incomplete) fail("The cloud backup claims complete coverage but has missing files or sources.");
  const payloadText = canonicalStringify(backup);
  return { backup, payloadText, planDigest: await sha256Text(payloadText), recordCount, attachmentCount: backup.attachments.length, fileBytes,
    coverage: backup.coverage, exclusions: backup.records.exclusions || [], missingFiles: backup.fileErrors || [] };
}

export async function restoreLegacyCloudBackup(options = {}) { return boundedOperation((signal) => restoreCloud({ ...options, signal }), options); }
async function restoreCloud({ client, raw, confirmation, userId, signal } = {}) {
  const reviewed = await inspectLegacyCloudBackup(raw, { userId });
  if (confirmation?.purpose !== "CLOUD_RESTORE" || confirmation.planDigest !== reviewed.planDigest || !confirmation.challengeId || !confirmation.grant) fail("Verify your account for this exact cloud backup before restoring it.");
  const token = await account(client, userId, signal);
  const uploaded = [];
  try {
    // Upload missing files first, with upsert explicitly disabled. Existing bytes
    // must match exactly; a different file is never overwritten or deleted.
    for (const file of reviewed.backup.attachments) {
      await account(client, userId, signal, token);
      let response = await files(client, file.bucket, token).download(file.path, {}, { signal });
      abort(signal);
      if (response.error) {
        const status = String(response.error.statusCode ?? response.error.status ?? "");
        if (!/^(404|400)$/.test(status) && !/not found|does not exist/i.test(response.error.message || "")) fail("An attachment could not be checked. No existing file was replaced.");
        const bytes = decode(file.base64);
        await account(client, userId, signal, token);
        const added = await files(client, file.bucket, token).upload(file.path, new Blob([bytes], { type: file.mimeType }), { upsert: false, contentType: file.mimeType });
        abort(signal);
        if (added.error && !/already exists|duplicate/i.test(added.error.message || "")) fail(added.error.message || "An attachment could not be recovered.");
        if (!added.error) uploaded.push(fileKey(file));
        await account(client, userId, signal, token);
        response = await files(client, file.bucket, token).download(file.path, {}, { signal });
        abort(signal);
      }
      if (response.error || !response.data || response.data.size !== file.size || await digestBytes(new Uint8Array(await response.data.arrayBuffer())) !== file.sha256) fail("An existing or recovered attachment has different bytes. It was not overwritten.");
    }
    await account(client, userId, signal, token);
    const result = await rpc(client, "code3_restore_legacy_cloud_backup", { payload_text: reviewed.payloadText, challenge_id: confirmation.challengeId, confirmation_token: confirmation.grant }, signal, token);
    if (result?.status !== "APPLIED") fail("Cloud record recovery was not confirmed.");
    return { ...result, uploadedFiles: uploaded.length, retainedExistingFiles: reviewed.attachmentCount - uploaded.length };
  } catch (error) {
    // Database inserts are transactional. New file copies are retained for an
    // idempotent retry instead of risking a delete of a concurrently edited file.
    if (uploaded.length) error.message = `${error.message} ${uploaded.length} new attachment(s) were preserved for retry. Existing files were not changed.`;
    throw error;
  }
}
