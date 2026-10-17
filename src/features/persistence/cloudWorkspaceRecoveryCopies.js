import { canonicalStringify, hashCanonicalJson, parseUntrustedJsonValue } from "../backup/canonicalJson.js";
import { validateWorkspaceSources, workspaceFail } from "./cloudWorkspaceSources.js";

const PREFIX = "code3.workspace-conflict-copy.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function preserveWorkspaceConflictCopy({ storage, ownerId, copyId, sources, cloudRevision, assertCurrent = () => {} }) {
  assertCurrent();
  if (!UUID.test(ownerId || "") || !UUID.test(copyId || "")) workspaceFail("INVALID_RECOVERY_COPY", "A valid account and recovery copy are required.");
  validateWorkspaceSources(sources);
  const payload = { format: "code3-workspace-conflict-copy", version: 1, ownerId, copyId, createdAt: new Date().toISOString(), cloudRevision, sources };
  const serialized = canonicalStringify({ ...payload, hash: await hashCanonicalJson(payload) });
  const key = `${PREFIX}${ownerId}:${copyId}`;
  assertCurrent();
  if (storage.getItem(key) !== null) workspaceFail("RECOVERY_COPY_EXISTS", "This review already has a preserved copy. Start a new conflict review.");
  try { storage.setItem(key, serialized); } catch { workspaceFail("RECOVERY_COPY_FAILED", "Free device storage or export a backup before resolving this conflict. Neither version was replaced."); }
  if (storage.getItem(key) !== serialized) workspaceFail("RECOVERY_COPY_FAILED", "The safety copy could not be verified. Neither version was replaced.");
  return { copyId, createdAt: payload.createdAt };
}

export async function readWorkspaceConflictCopy({ storage, ownerId, copyId }) {
  if (!UUID.test(ownerId || "") || !UUID.test(copyId || "")) workspaceFail("INVALID_RECOVERY_COPY", "A valid account and recovery copy are required.");
  const raw = storage.getItem(`${PREFIX}${ownerId}:${copyId}`);
  if (raw === null) workspaceFail("RECOVERY_COPY_MISSING", "This device recovery copy is no longer available.");
  const value = parseUntrustedJsonValue(raw);
  const { hash, ...payload } = value;
  if (payload.format !== "code3-workspace-conflict-copy" || payload.version !== 1 || payload.ownerId !== ownerId || payload.copyId !== copyId
    || !Number.isFinite(Date.parse(payload.createdAt)) || await hashCanonicalJson(payload) !== hash) workspaceFail("RECOVERY_COPY_INVALID", "This device recovery copy could not be verified.");
  validateWorkspaceSources(payload.sources);
  return payload;
}

export async function listWorkspaceConflictCopies({ storage, ownerId }) {
  if (!UUID.test(ownerId || "")) workspaceFail("ACCOUNT_REQUIRED", "Sign in before viewing device recovery copies.");
  const prefix = `${PREFIX}${ownerId}:`;
  const copies = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const payload = await readWorkspaceConflictCopy({ storage, ownerId, copyId: key.slice(prefix.length) });
    copies.push({ copyId: payload.copyId, createdAt: payload.createdAt, cloudRevision: payload.cloudRevision });
  }
  return copies.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
