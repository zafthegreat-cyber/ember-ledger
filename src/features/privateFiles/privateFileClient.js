const BASE = "/api/code3/private-files";
export const PRIVATE_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const PRIVATE_FILE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const TYPES = new Set(PRIVATE_FILE_ACCEPT.split(","));
const FILE_FIELDS = new Set(["id", "originalName", "mimeType", "size", "sha256", "relatedRecordType", "relatedRecordId", "createdAt", "retainUntil", "deletedAt", "bytesBase64"]);
const sha256 = async (bytes) => [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");

export async function verifyPrivateFileBackup(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup) || Object.keys(backup).some((key) => !["format", "files", "exportedAt", "omittedDeletedCount", "sha256"].includes(key))
    || backup.format !== "code3-private-files-v1" || !Array.isArray(backup.files) || backup.files.length > 128 || typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))
    || !Number.isSafeInteger(backup.omittedDeletedCount) || backup.omittedDeletedCount < 0) throw new Error("The private-file backup format could not be verified.");
  const seen = new Set();
  let total = 0;
  for (const file of backup.files) {
    if (!file || typeof file !== "object" || Array.isArray(file) || Object.keys(file).some((key) => !FILE_FIELDS.has(key))
      || !/^[a-f0-9-]{36}$/i.test(file.id) || seen.has(file.id) || !TYPES.has(file.mimeType) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > PRIVATE_FILE_MAX_BYTES
      || typeof file.originalName !== "string" || !file.originalName.trim() || file.originalName.length > 180 || /[/\\]/.test(file.originalName) || [...file.originalName].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
      || !/^[A-Z_]{2,40}$/.test(file.relatedRecordType) || !/^[a-f0-9-]{36}$/i.test(file.relatedRecordId)
      || typeof file.createdAt !== "string" || typeof file.retainUntil !== "string" || !Number.isFinite(Date.parse(file.createdAt)) || !Number.isFinite(Date.parse(file.retainUntil)) || Date.parse(file.retainUntil) < Date.parse(file.createdAt)
      || file.deletedAt !== null || typeof file.bytesBase64 !== "string" || file.bytesBase64.length > Math.ceil(PRIVATE_FILE_MAX_BYTES / 3) * 4
      || file.bytesBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.bytesBase64)) throw new Error("An attachment is missing, duplicated or invalid. No complete backup was produced.");
    seen.add(file.id); total += file.size;
    if (total > 32 * 1024 * 1024) throw new Error("The private-file backup exceeds the supported 32 MB byte limit.");
    const decoded = globalThis.atob(file.bytesBase64);
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    if (globalThis.btoa(decoded) !== file.bytesBase64 || bytes.byteLength !== file.size || await sha256(bytes) !== file.sha256) throw new Error("An attachment failed its integrity check. No complete backup was produced.");
  }
  const payload = { format: backup.format, files: backup.files, exportedAt: backup.exportedAt, omittedDeletedCount: backup.omittedDeletedCount };
  if (await sha256(new TextEncoder().encode(JSON.stringify(payload))) !== backup.sha256) throw new Error("The private-file backup failed its manifest integrity check.");
  return backup;
}

export function createPrivateFileClient({ request }) {
  if (typeof request !== "function") throw new Error("An authenticated private-file request adapter is required.");
  async function response(path, init = {}) {
    const result = await request(`${BASE}${path}`, { ...init, cache: "no-store" });
    if (!result.ok) {
      const body = await result.json().catch(() => null);
      const error = new Error(body?.error?.message || "Private attachments are unavailable. Reload before retrying.");
      error.code = body?.error?.code || "private_files_unavailable";
      throw error;
    }
    return result;
  }
  async function json(path, init) {
    const body = await (await response(path, init)).json();
    if (body?.ok !== true) throw new Error("The attachment operation could not be verified.");
    return body;
  }
  const route = (domain, recordId) => `/records/${encodeURIComponent(domain)}/${encodeURIComponent(recordId)}`;
  return Object.freeze({
    async list(domain, recordId, signal) {
      const files = (await json(route(domain, recordId), { signal })).files;
      if (!Array.isArray(files)) throw new Error("The attachment list could not be verified.");
      return files;
    },
    async upload(domain, recordId, file, signal) {
      if (!file || file.size < 1 || file.size > PRIVATE_FILE_MAX_BYTES) throw new Error("Choose a nonempty file no larger than 8 MB.");
      if (!TYPES.has(file.type)) throw new Error("Choose a PNG, JPEG, WebP or PDF file.");
      return (await json(`${route(domain, recordId)}?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file, signal })).file;
    },
    async download(file, signal) {
      const blob = await (await response(`/${encodeURIComponent(file.id)}/bytes`, { signal })).blob();
      const bytes = await blob.arrayBuffer();
      const hash = await sha256(bytes);
      if (blob.size !== file.size || hash !== file.sha256) throw new Error("The attachment failed its integrity check. No file was downloaded.");
      return blob;
    },
    async remove(file, signal) { return (await json(`/${encodeURIComponent(file.id)}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha256: file.sha256 }), signal })).result; },
    async exportBackup(signal) {
      const result = await json("/export", { signal });
      if (result.verified !== true || !result.backup) throw new Error("Attachment backup coverage could not be verified.");
      return verifyPrivateFileBackup(result.backup);
    },
    async previewRestore(backup, signal) {
      await verifyPrivateFileBackup(backup);
      return (await json("/restore/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup), signal })).plan;
    },
    async applyRestore(plan, proof, signal) { return (await json("/restore/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.planId, sha256: plan.sha256, proof }), signal })).result; },
  });
}
