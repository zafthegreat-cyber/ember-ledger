import { canonicalStringify, hashCanonicalJson, parseUntrustedJsonValue } from "../backup/canonicalJson.js";
import { validateWorkspaceSources, workspaceFail } from "./cloudWorkspaceSources.js";
import { createWorkspacePayloadStore } from "./workspacePayloadStore.js";

const PREFIX = "code3.workspace-conflict-copy.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function preserveWorkspaceConflictCopy({ storage, ownerId, copyId, sources, cloudRevision, assertCurrent = () => {}, payloadStore = createWorkspacePayloadStore() }) {
  assertCurrent();
  if (!UUID.test(ownerId || "") || !UUID.test(copyId || "") || !Number.isSafeInteger(cloudRevision) || cloudRevision < 0) workspaceFail("INVALID_RECOVERY_COPY", "A valid account, revision, and recovery copy are required.");
  validateWorkspaceSources(sources);
  const payload = { format: "code3-workspace-conflict-copy", version: 1, ownerId, copyId, createdAt: new Date().toISOString(), cloudRevision, sources };
  const hash = await hashCanonicalJson(payload);
  const serialized = canonicalStringify({ ...payload, hash });
  const key = `${PREFIX}${ownerId}:${copyId}`;
  assertCurrent();
  if (storage.getItem(key) !== null) workspaceFail("RECOVERY_COPY_EXISTS", "This review already has a preserved copy. Start a new conflict review.");
  const payloadKey = `conflict-copy:${ownerId}:${copyId}:${hash}`;
  let saved = canonicalStringify({ format: "code3-workspace-conflict-reference", version: 1, ownerId, copyId, payloadKey, hash });
  try {
    await payloadStore.put(payloadKey, serialized, { assertCurrent });
    if (await payloadStore.get(payloadKey) !== serialized) workspaceFail("RECOVERY_COPY_FAILED", "The safety copy could not be verified. Neither version was replaced.");
  } catch (error) {
    if (!String(error?.code || "").startsWith("PAYLOAD_STORE_")) throw error;
    saved = serialized;
  }
  assertCurrent();
  if (storage.getItem(key) !== null) workspaceFail("RECOVERY_COPY_EXISTS", "This review already has a preserved copy. Start a new conflict review.");
  try { storage.setItem(key, saved); } catch { /* Verify adapters that can throw after writing. */ }
  if (storage.getItem(key) !== saved) workspaceFail("RECOVERY_COPY_FAILED", "Device storage could not preserve the safety copy. Export a backup before resolving this conflict. Neither version was replaced.");
  return { copyId, createdAt: payload.createdAt };
}

export async function readWorkspaceConflictCopy({ storage, ownerId, copyId, payloadStore = createWorkspacePayloadStore() }) {
  if (!UUID.test(ownerId || "") || !UUID.test(copyId || "")) workspaceFail("INVALID_RECOVERY_COPY", "A valid account and recovery copy are required.");
  const key = `${PREFIX}${ownerId}:${copyId}`;
  const raw = storage.getItem(key);
  if (raw === null) workspaceFail("RECOVERY_COPY_MISSING", "This device recovery copy is no longer available.");
  let value = parseUntrustedJsonValue(raw);
  let reference;
  if (value?.format === "code3-workspace-conflict-reference") {
    reference = value;
    if (reference.version !== 1 || reference.ownerId !== ownerId || reference.copyId !== copyId || !/^[0-9a-f]{64}$/.test(reference.hash || "")
      || reference.payloadKey !== `conflict-copy:${ownerId}:${copyId}:${reference.hash}`
      || Object.keys(reference).some((field) => !["format", "version", "ownerId", "copyId", "payloadKey", "hash"].includes(field))) workspaceFail("RECOVERY_COPY_INVALID", "This device recovery reference could not be verified.");
    let archived;
    try { archived = await payloadStore.get(reference.payloadKey); }
    catch { workspaceFail("RECOVERY_COPY_UNAVAILABLE", "The browser safety store is unavailable. Keep this device's data and retry when storage is available."); }
    if (archived === null) workspaceFail("RECOVERY_COPY_MISSING", "This device recovery payload is missing. Original records have not been replaced.");
    value = parseUntrustedJsonValue(archived);
  }
  const { hash, ...payload } = value;
  if (payload.format !== "code3-workspace-conflict-copy" || payload.version !== 1 || payload.ownerId !== ownerId || payload.copyId !== copyId
    || !Number.isFinite(Date.parse(payload.createdAt)) || !Number.isSafeInteger(payload.cloudRevision) || payload.cloudRevision < 0
    || Object.keys(payload).some((field) => !["format", "version", "ownerId", "copyId", "createdAt", "cloudRevision", "sources"].includes(field))
    || await hashCanonicalJson(payload) !== hash || (reference && reference.hash !== hash)) workspaceFail("RECOVERY_COPY_INVALID", "This device recovery copy could not be verified.");
  validateWorkspaceSources(payload.sources);
  if (storage.getItem(key) !== raw) workspaceFail("RECOVERY_COPY_INVALID", "This device recovery reference changed during verification. Try again.");
  return payload;
}

export async function listWorkspaceConflictCopies({ storage, ownerId, payloadStore = createWorkspacePayloadStore() }) {
  if (!UUID.test(ownerId || "")) workspaceFail("ACCOUNT_REQUIRED", "Sign in before viewing device recovery copies.");
  const prefix = `${PREFIX}${ownerId}:`;
  const copies = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const payload = await readWorkspaceConflictCopy({ storage, ownerId, copyId: key.slice(prefix.length), payloadStore });
    copies.push({ copyId: payload.copyId, createdAt: payload.createdAt, cloudRevision: payload.cloudRevision });
  }
  return copies.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
