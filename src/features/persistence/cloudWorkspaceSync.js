import { canonicalStringify } from "../backup/canonicalJson.js";
import { countSourceRecords } from "../backup/backupFormat.js";
import {
  WORKSPACE_CLOUD_FORMAT, WORKSPACE_SYNC_SOURCES, WorkspaceSyncError, captureWorkspaceSources, cloneWorkspaceJson,
  reconcileWorkspaceSources, validateWorkspaceSources, workspaceFail, workspaceSourceHashes,
} from "./cloudWorkspaceSources.js";
import { readWorkspaceBinding } from "./workspaceOwnerBinding.js";
import { preserveWorkspaceConflictCopy, listWorkspaceConflictCopies, readWorkspaceConflictCopy } from "./cloudWorkspaceRecoveryCopies.js";

const STATE_PREFIX = "code3.workspace-sync-state.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkedSnapshot(value, projectUrl) {
  if (!value || value.format !== WORKSPACE_CLOUD_FORMAT || !Number.isSafeInteger(value.revision) || value.revision < 0
    || (value.revision > 0 && !Number.isFinite(Date.parse(value.updatedAt)))
    || (value.revision === 0 && Object.keys(value.sources || {}).length)) workspaceFail("INVALID_CLOUD_RESPONSE", "The cloud response could not be verified. Your device records are unchanged.");
  return { format: WORKSPACE_CLOUD_FORMAT, revision: value.revision, updatedAt: value.updatedAt || null, sources: validateWorkspaceSources(value.sources, { projectUrl }) };
}

function remoteError(error) {
  const code = String(error?.code || "");
  if (code === "40001" || /workspace_revision_conflict/.test(error?.message || "")) return new WorkspaceSyncError("REVISION_CONFLICT", "Another device saved a newer version. Both versions have been preserved.");
  if (code === "42501" && /workspace_access_required/.test(error?.message || "")) return new WorkspaceSyncError("ACCESS_REQUIRED", "Cloud saving is waiting for account access approval. Your existing device records are preserved.");
  if (["42501", "28000", "PGRST301", "PGRST302"].includes(code) || /workspace_session_required/.test(error?.message || "")) return new WorkspaceSyncError("AUTH_REQUIRED", "Sign in to an approved account to continue cloud saving.");
  if (["PGRST202", "42883"].includes(code)) return new WorkspaceSyncError("CLOUD_NOT_CONFIGURED", "Cloud saving is not available on this server yet. Your records remain saved on this device.");
  if (code === "22023") return new WorkspaceSyncError("CLOUD_VALIDATION_FAILED", "The cloud server declined this snapshot. Your device records are unchanged.");
  return new WorkspaceSyncError("OFFLINE", "Changes remain saved on this device. Cloud saving will retry when the connection is available.");
}
function retryableAuthenticationError(error) {
  return error && (error.name === "AuthRetryableFetchError" || error.status === 0 || error.status >= 500 || error.status === 429);
}

/** Uses the signed-in user's JWT. Neither RPC accepts a caller-selected owner. */
export function createSupabaseWorkspaceTransport({ client, ownerId, timeoutMs = 15000 } = {}) {
  if (!client?.rpc || !client.auth?.getUser || !client.auth?.getSession || !UUID.test(ownerId || "")) workspaceFail("AUTH_REQUIRED", "A verified account is required for cloud saving.");
  let closed = false;
  const pendingControllers = new Set();
  async function bounded(request, controller) {
    let timer;
    try {
      return await Promise.race([request, new Promise((_, reject) => {
        timer = setTimeout(() => { controller?.abort(); reject(remoteError()); }, timeoutMs);
      })]);
    } finally { clearTimeout(timer); if (controller) pendingControllers.delete(controller); }
  }
  async function authorize() {
    if (closed) workspaceFail("SESSION_CHANGED", "This cloud saving session has ended.");
    let session;
    try { session = await bounded(client.auth.getSession()); } catch { throw remoteError(); }
    if (closed) workspaceFail("SESSION_CHANGED", "This cloud saving session has ended.");
    if (retryableAuthenticationError(session.error)) throw remoteError();
    if (session.error || !session.data?.session?.access_token || session.data.session.user?.id !== ownerId) workspaceFail("AUTH_REQUIRED", "Sign in to the same approved account before syncing these records.");
    const token = session.data.session.access_token;
    let result;
    try { result = await bounded(client.auth.getUser(token)); } catch { throw remoteError(); }
    if (closed) workspaceFail("SESSION_CHANGED", "This cloud saving session has ended.");
    if (retryableAuthenticationError(result.error)) throw remoteError();
    if (result.error || result.data?.user?.id !== ownerId || result.data.user.is_anonymous === true) workspaceFail("AUTH_REQUIRED", "Sign in to the same approved account before syncing these records.");
    return token;
  }
  async function rpc(name, args) {
    const token = await authorize();
    let result;
    const controller = new AbortController();
    pendingControllers.add(controller);
    try {
      const request = client.rpc(name, args);
      // PostgREST is lazy: a shared client's active account may change between
      // verification and fetch. Pin this operation to the verified token.
      if (typeof request.setHeader !== "function") workspaceFail("CLIENT_UNSUPPORTED", "Update the account client before cloud saving. Device records are unchanged.");
      request.setHeader("Authorization", `Bearer ${token}`);
      result = await bounded(typeof request.abortSignal === "function" ? request.abortSignal(controller.signal) : request, controller);
    } catch (error) { pendingControllers.delete(controller); if (error instanceof WorkspaceSyncError) throw error; throw remoteError(); }
    if (closed) workspaceFail("SESSION_CHANGED", "The account changed while cloud saving was running.");
    // Re-check before an acknowledged snapshot can be applied to local storage.
    await authorize();
    if (result.error) throw remoteError(result.error);
    return result.data;
  }
  return Object.freeze({
    close() { closed = true; for (const controller of pendingControllers) controller.abort(); pendingControllers.clear(); },
    authorize,
    async read(revision = null) { return checkedSnapshot(await rpc("code3_workspace_read", { p_revision: revision }), client.supabaseUrl); },
    async write({ expectedRevision, sources, mutationId }) {
      sources = validateWorkspaceSources(sources, { projectUrl: client.supabaseUrl });
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !UUID.test(mutationId || "")) workspaceFail("INVALID_MUTATION", "Cloud saving requires a valid revision and stable operation ID.");
      const result = checkedSnapshot(await rpc("code3_workspace_write", { p_expected_revision: expectedRevision, p_sources: sources, p_mutation_id: mutationId }), client.supabaseUrl);
      if (result.revision !== expectedRevision + 1 || canonicalStringify(result.sources) !== canonicalStringify(sources)) workspaceFail("INVALID_ACKNOWLEDGEMENT", "The server save could not be verified. Both copies remain preserved.");
      return result;
    },
    async history() {
      const result = await rpc("code3_workspace_history", {});
      if (!Array.isArray(result) || result.some((row) => !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updatedAt)))) workspaceFail("INVALID_CLOUD_RESPONSE", "The cloud recovery history could not be verified.");
      return result;
    },
  });
}

function readState(storage, ownerId) {
  const raw = storage.getItem(`${STATE_PREFIX}${ownerId}`);
  if (raw === null) return { revision: 0, hashes: {} };
  let state;
  try { state = JSON.parse(raw); } catch { workspaceFail("SYNC_STATE_UNREADABLE", "Cloud save tracking needs review. Your records have been preserved."); }
  if (!state || state.version !== 1 || state.ownerId !== ownerId || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !state.hashes || typeof state.hashes !== "object" || Array.isArray(state.hashes)
    || Object.values(state.hashes).some((hash) => !/^[0-9a-f]{64}$/.test(hash))) workspaceFail("SYNC_STATE_UNREADABLE", "Cloud save tracking needs review. Your records have been preserved.");
  return state;
}

/** Local records are the durable outbox; only verified server acknowledgements advance its baseline. */
export function createCloudWorkspaceSync({ storage, client, ownerId, applySources, locks = globalThis.navigator?.locks,
  transport = createSupabaseWorkspaceTransport({ client, ownerId }), idFactory = () => globalThis.crypto.randomUUID(), projectUrl = client?.supabaseUrl } = {}) {
  if (!UUID.test(ownerId || "") || !storage?.getItem || typeof applySources !== "function") workspaceFail("HOST_REQUIRED", "Cloud saving requires an account, device storage, and protected recovery adapter.");
  let closed = false;
  let running = null;
  const reviews = new Map();
  let state = { status: "IDLE", revision: 0, conflicts: [], changedSources: [], message: "Cloud saving is ready." };
  const listeners = new Set();
  const capture = () => captureWorkspaceSources(storage, { projectUrl });
  function report(next) { state = { ...state, ...next }; for (const listener of listeners) listener(); return cloneWorkspaceJson(state); }
  function assertActive() {
    if (closed) workspaceFail("SESSION_CHANGED", "This cloud saving session has ended.");
    if (readWorkspaceBinding(storage)?.ownerId !== ownerId) workspaceFail("OWNER_BINDING_REQUIRED", "Confirm which account owns these device records before cloud saving.");
  }
  async function acknowledge(snapshot) {
    const hashes = await workspaceSourceHashes(snapshot.sources);
    assertActive();
    const key = `${STATE_PREFIX}${ownerId}`;
    const value = canonicalStringify({ version: 1, ownerId, revision: snapshot.revision, hashes, updatedAt: snapshot.updatedAt });
    try { storage.setItem(key, value); } catch { workspaceFail("LOCAL_TRACKING_FAILED", "Cloud saved this version, but this device could not save its sync receipt. Keep your records open and free browser storage before retrying."); }
    if (storage.getItem(key) !== value) workspaceFail("LOCAL_TRACKING_FAILED", "The sync receipt could not be verified. Existing records are preserved.");
  }
  async function run({ allowApply = false } = {}) {
    assertActive();
    report({ status: "SYNCING", message: "Checking saved changes…" });
    const baseline = readState(storage, ownerId);
    const local = capture();
    const remote = await transport.read();
    assertActive();
    if (canonicalStringify(capture()) !== canonicalStringify(local)) return report({ status: "PENDING", message: "New changes are saved on this device and will sync next.", conflicts: [] });
    if (remote.revision < baseline.revision) workspaceFail("CLOUD_HISTORY_CHANGED", "The cloud history changed unexpectedly. Your local records have not been replaced.");
    const merge = await reconcileWorkspaceSources({ baselineHashes: baseline.hashes, localSources: local, remoteSources: remote.sources, projectUrl });
    assertActive();
    if (merge.conflicts.length) return report({ status: "CONFLICT", conflicts: merge.conflicts, changedSources: [], revision: remote.revision, message: "This device and another device changed the same records. Both copies are preserved. Review the differences before syncing." });
    if (merge.changedLocal.length && !allowApply) return report({ status: "REMOTE_AVAILABLE", conflicts: [], changedSources: merge.changedLocal, revision: remote.revision, message: "Another device has saved changes. Reload safely to load them." });
    if (merge.changedLocal.length) {
      await transport.authorize?.();
      assertActive();
      await applySources({ storage, expectedSources: local, nextSources: merge.sources, ownerId, locks, assertCurrent: assertActive, projectUrl });
      assertActive();
    }
    let saved = remote;
    if (canonicalStringify(merge.sources) !== canonicalStringify(remote.sources)) {
      assertActive();
      // A newer edit may occur during the request. It remains in local storage and
      // differs from this acknowledged baseline, so the following pass sends it.
      saved = await transport.write({ expectedRevision: remote.revision, sources: merge.sources, mutationId: idFactory() });
      assertActive();
    }
    await acknowledge(saved);
    const pending = canonicalStringify(capture()) !== canonicalStringify(saved.sources);
    return report({ status: pending ? "PENDING" : "SYNCED", revision: saved.revision, updatedAt: saved.updatedAt,
      conflicts: [], changedSources: merge.changedLocal, message: pending ? "New changes are saved on this device and waiting to sync." : "Saved to your account. Other devices can load this version." });
  }
  async function previewConflicts() {
    if (running) await running;
    assertActive();
    const local = capture();
    const remote = await transport.read();
    const baseline = readState(storage, ownerId);
    const merge = await reconcileWorkspaceSources({ baselineHashes: baseline.hashes, localSources: local, remoteSources: remote.sources, projectUrl });
    assertActive();
    const reviewId = idFactory();
    reviews.clear();
    reviews.set(reviewId, { local, remote, merge });
    return {
      reviewId, revision: remote.revision,
      conflicts: merge.conflicts.map((sourceId) => {
        const source = WORKSPACE_SYNC_SOURCES.find((entry) => entry.sourceId === sourceId);
        return { sourceId, displayName: source.displayName,
          deviceRecordCount: countSourceRecords(local[sourceId]?.data, source),
          cloudRecordCount: countSourceRecords(remote.sources[sourceId]?.data, source),
          device: cloneWorkspaceJson(local[sourceId] || null), cloud: cloneWorkspaceJson(remote.sources[sourceId] || null) };
      }),
    };
  }
  async function resolveConflicts({ reviewId, choices, confirmed } = {}) {
    if (running) await running;
    assertActive();
    if (confirmed !== true || !reviews.has(reviewId)) workspaceFail("CONFLICT_REVIEW_REQUIRED", "Review both saved versions before resolving this conflict.");
    const review = reviews.get(reviewId);
    if (!choices || Object.keys(choices).length !== review.merge.conflicts.length
      || review.merge.conflicts.some((id) => !["DEVICE", "CLOUD"].includes(choices[id]))) workspaceFail("CONFLICT_CHOICES_REQUIRED", "Choose which version to use for each conflicting source. Both originals stay recoverable.");
    if (canonicalStringify(capture()) !== canonicalStringify(review.local)) workspaceFail("STALE_CONFLICT_REVIEW", "This device changed after the review. Review the latest records again.");
    const currentRemote = await transport.read();
    assertActive();
    if (currentRemote.revision !== review.remote.revision || canonicalStringify(currentRemote.sources) !== canonicalStringify(review.remote.sources)) workspaceFail("STALE_CONFLICT_REVIEW", "Another device changed after the review. Review the latest records again.");
    const chosen = { ...review.merge.sources };
    for (const sourceId of review.merge.conflicts) {
      const selected = choices[sourceId] === "DEVICE" ? review.local[sourceId] : review.remote.sources[sourceId];
      if (!selected) workspaceFail("SOURCE_DELETION_BLOCKED", "Cloud conflict review cannot remove an entire source. Use recovery to inspect that source first.");
      chosen[sourceId] = selected;
    }
    validateWorkspaceSources(chosen, { projectUrl });
    await transport.authorize?.();
    assertActive();
    await preserveWorkspaceConflictCopy({ storage, ownerId, copyId: reviewId, sources: review.local, cloudRevision: currentRemote.revision, assertCurrent: assertActive, projectUrl });
    assertActive();
    await applySources({ storage, expectedSources: review.local, nextSources: chosen, ownerId, locks, assertCurrent: assertActive, projectUrl });
    assertActive();
    const saved = canonicalStringify(chosen) === canonicalStringify(currentRemote.sources) ? currentRemote
      : await transport.write({ expectedRevision: currentRemote.revision, sources: chosen, mutationId: idFactory() });
    assertActive();
    await acknowledge(saved);
    reviews.clear();
    return report({ status: "SYNCED", revision: saved.revision, updatedAt: saved.updatedAt, conflicts: [], changedSources: Object.keys(choices), message: "Your reviewed version is saved. Original versions remain in device recovery and cloud history." });
  }
  function sync(options = {}) {
    if (running) return options.allowApply === true ? running.then(() => sync(options)) : running;
    running = run(options).catch((error) => report({ status: error.code || "ERROR", message: error.message || "Cloud saving paused. Existing data is unchanged.", conflicts: [] })).finally(() => { running = null; });
    return running;
  }
  return Object.freeze({
    getStatus: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { closed = true; transport.close?.(); },
    sync,
    history: () => { assertActive(); return transport.history(); },
    readRevision: (revision) => { assertActive(); return transport.read(revision); },
    previewConflicts,
    resolveConflicts,
    listDeviceRecoveryCopies: () => { assertActive(); return listWorkspaceConflictCopies({ storage, ownerId, projectUrl }); },
    readDeviceRecoveryCopy: (copyId) => { assertActive(); return readWorkspaceConflictCopy({ storage, ownerId, copyId, projectUrl }); },
    waitForIdle: () => running || Promise.resolve(),
  });
}
