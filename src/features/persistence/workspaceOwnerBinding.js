import { canonicalStringify, hashCanonicalJson, parseUntrustedJsonValue } from "../backup/canonicalJson.js";
import { WORKSPACE_CHECKPOINT_KEY, WORKSPACE_RECOVERY_KEY, withWorkspaceStorageLock } from "../backup/workspaceRecovery.js";
import { WORKSPACE_SYNC_KEYS, workspaceFail } from "./cloudWorkspaceSources.js";

export const WORKSPACE_BINDING_KEY = "code3.workspace-owner.v1";
export const WORKSPACE_SWITCH_KEY = "code3.workspace-owner-switch.v1";
const ARCHIVE_PREFIX = "code3.workspace-device-archive.v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNER_KEYS = Object.freeze([...WORKSPACE_SYNC_KEYS, WORKSPACE_CHECKPOINT_KEY, "et-tcg-route-state"]);

function assertOwner(ownerId) { if (!UUID.test(ownerId || "")) workspaceFail("ACCOUNT_REQUIRED", "Sign in to a verified account before opening saved records."); }
function write(storage, key, raw) {
  try { if (raw === null) storage.removeItem(key); else storage.setItem(key, raw); } catch { /* Verify even adapters that throw after a successful write. */ }
  if (storage.getItem(key) !== raw) workspaceFail("DEVICE_SAVE_FAILED", "Device storage could not preserve your records. No account switch has been accepted.");
}
function rawSources(storage) { return Object.fromEntries(OWNER_KEYS.map((key) => [key, storage.getItem(key)])); }
function setSources(storage, raws) { for (const key of OWNER_KEYS) write(storage, key, raws[key] ?? null); }
function assertNoRecovery(storage) {
  if (storage.getItem(WORKSPACE_RECOVERY_KEY) !== null || storage.getItem(WORKSPACE_SWITCH_KEY) !== null) workspaceFail("RECOVERY_REQUIRED", "An interrupted save must be recovered before changing accounts.");
  // These existing transaction journals must be settled by their own repository
  // before copying record sources; they are not portable account data.
  const journals = ["code3.account-ops.restore-journal.v1", "ember-and-tide.flip-scout.v1.inventory-creation-commit-journal.v1", "code3.purchase-receiving.v1.inventory-reconciliation-commit-journal.v1"];
  if (journals.some((key) => storage.getItem(key) !== null)) workspaceFail("RECOVERY_REQUIRED", "An existing record transaction needs recovery before changing accounts.");
}
function parseBinding(raw) {
  if (raw === null) return null;
  let value;
  try { value = JSON.parse(raw); } catch { workspaceFail("OWNER_BINDING_UNREADABLE", "The device account marker needs recovery. Existing records are untouched."); }
  if (value?.version !== 1 || !UUID.test(value.ownerId || "") || Object.keys(value).some((key) => !["version", "ownerId"].includes(key))) workspaceFail("OWNER_BINDING_UNREADABLE", "The device account marker needs recovery. Existing records are untouched.");
  return value;
}
export function readWorkspaceBinding(storage) { return parseBinding(storage.getItem(WORKSPACE_BINDING_KEY)); }
export function hasWorkspaceLocalRecords(storage) { return WORKSPACE_SYNC_KEYS.some((key) => storage.getItem(key) !== null); }
export function hasPendingWorkspaceOwnerSwitch(storage) { return storage.getItem(WORKSPACE_SWITCH_KEY) !== null; }

async function sealedArchive(ownerId, raws) {
  // This is a device-only exact-byte safety copy. It is outside the cloud/backup
  // registry and never includes Supabase tokens or arbitrary browser keys.
  const payload = { format: "code3-device-workspace-archive", version: 1, ownerId, raws };
  return canonicalStringify({ ...payload, hash: await hashCanonicalJson(payload) });
}
async function readArchive(storage, ownerId) {
  const raw = storage.getItem(`${ARCHIVE_PREFIX}${ownerId}`);
  if (raw === null) return { raw: null, raws: Object.fromEntries(OWNER_KEYS.map((key) => [key, null])) };
  const value = parseUntrustedJsonValue(raw, { maxBytes: 24 * 1024 * 1024, maxStringLength: 12 * 1024 * 1024 });
  const { hash, ...payload } = value;
  if (payload.format !== "code3-device-workspace-archive" || payload.version !== 1 || payload.ownerId !== ownerId
    || Object.keys(payload).some((key) => !["format", "version", "ownerId", "raws"].includes(key))
    || !payload.raws || Object.keys(payload.raws).some((key) => !OWNER_KEYS.includes(key))
    || Object.values(payload.raws).some((entry) => entry !== null && typeof entry !== "string")
    || await hashCanonicalJson(payload) !== hash) workspaceFail("ARCHIVE_INVALID", "The previous account's device copy could not be verified. Current data is unchanged.");
  return { raw, raws: payload.raws };
}

/** Explicitly attributes legacy unbound records; it never silently claims them at sign-in. */
export async function claimWorkspaceOwner({ storage, ownerId, confirmed, locks = globalThis.navigator?.locks, assertCurrent = () => {} } = {}) {
  assertOwner(ownerId);
  if (confirmed !== true) workspaceFail("OWNER_CONFIRMATION_REQUIRED", "Confirm that these device records belong to this account before enabling cloud saving.");
  return withWorkspaceStorageLock(locks, async () => {
    assertCurrent();
    assertNoRecovery(storage);
    const existing = readWorkspaceBinding(storage);
    if (existing?.ownerId === ownerId) return { status: "ALREADY_BOUND", ownerId };
    if (existing) workspaceFail("OWNER_SWITCH_REQUIRED", "These device records belong to another account. Preserve that account's copy before switching.");
    const before = rawSources(storage);
    const archive = await sealedArchive(ownerId, before);
    assertCurrent();
    assertNoRecovery(storage);
    if (readWorkspaceBinding(storage) || canonicalStringify(rawSources(storage)) !== canonicalStringify(before)) workspaceFail("STALE_DEVICE_DATA", "Device records changed before ownership could be confirmed. Try again.");
    write(storage, `${ARCHIVE_PREFIX}${ownerId}`, archive);
    write(storage, WORKSPACE_BINDING_KEY, canonicalStringify({ version: 1, ownerId }));
    return { status: "BOUND", ownerId };
  });
}

/** Requires all application writers unmounted. Archives before changing any registered key. */
export async function switchWorkspaceOwner({ storage, ownerId, confirmed, locks = globalThis.navigator?.locks, assertCurrent = () => {} } = {}) {
  assertOwner(ownerId);
  if (confirmed !== true) workspaceFail("OWNER_CONFIRMATION_REQUIRED", "Confirm the account switch before opening a different workspace.");
  return withWorkspaceStorageLock(locks, async () => {
    assertCurrent();
    assertNoRecovery(storage);
    const previous = readWorkspaceBinding(storage);
    if (!previous) workspaceFail("OWNER_CONFIRMATION_REQUIRED", "Confirm the owner of existing device records before switching accounts.");
    if (previous.ownerId === ownerId) return { status: "UNCHANGED", ownerId };
    const beforeRaw = storage.getItem(WORKSPACE_BINDING_KEY);
    const before = rawSources(storage);
    const target = await readArchive(storage, ownerId);
    const archive = await sealedArchive(previous.ownerId, before);
    assertCurrent();
    assertNoRecovery(storage);
    if (storage.getItem(WORKSPACE_BINDING_KEY) !== beforeRaw || canonicalStringify(rawSources(storage)) !== canonicalStringify(before)
      || storage.getItem(`${ARCHIVE_PREFIX}${ownerId}`) !== target.raw) workspaceFail("STALE_DEVICE_DATA", "Device records changed before the account switch. Try again.");
    write(storage, `${ARCHIVE_PREFIX}${previous.ownerId}`, archive);
    const journal = canonicalStringify({ version: 1, from: previous.ownerId, to: ownerId, state: "PREPARED" });
    write(storage, WORKSPACE_SWITCH_KEY, journal);
    try {
      setSources(storage, target.raws);
      write(storage, WORKSPACE_BINDING_KEY, canonicalStringify({ version: 1, ownerId }));
      write(storage, WORKSPACE_SWITCH_KEY, canonicalStringify({ version: 1, from: previous.ownerId, to: ownerId, state: "COMMITTED" }));
    } catch (error) {
      try { setSources(storage, before); write(storage, WORKSPACE_BINDING_KEY, beforeRaw); write(storage, WORKSPACE_SWITCH_KEY, null); }
      catch { workspaceFail("OWNER_SWITCH_RECOVERY_REQUIRED", "The account switch stopped with a preserved device copy. Recover it before opening records."); }
      throw error;
    }
    write(storage, WORKSPACE_SWITCH_KEY, null);
    return { status: "SWITCHED", ownerId, preservedOwnerId: previous.ownerId };
  });
}

export async function recoverWorkspaceOwnerSwitch({ storage, locks = globalThis.navigator?.locks, assertCurrent = () => {} } = {}) {
  return withWorkspaceStorageLock(locks, async () => {
    assertCurrent();
    const raw = storage.getItem(WORKSPACE_SWITCH_KEY);
    if (raw === null) return { status: "NO_RECOVERY" };
    const journal = parseUntrustedJsonValue(raw);
    if (journal.version !== 1 || !UUID.test(journal.from || "") || !UUID.test(journal.to || "") || !["PREPARED", "COMMITTED"].includes(journal.state)
      || Object.keys(journal).some((key) => !["version", "from", "to", "state"].includes(key))) workspaceFail("OWNER_SWITCH_RECOVERY_REQUIRED", "The account switch checkpoint needs review. Original copies are retained.");
    if (journal.state === "COMMITTED") {
      if (readWorkspaceBinding(storage)?.ownerId !== journal.to) workspaceFail("OWNER_SWITCH_RECOVERY_REQUIRED", "The completed account switch no longer matches this device.");
    } else {
      const archive = await readArchive(storage, journal.from);
      assertCurrent();
      if (!archive.raw || storage.getItem(WORKSPACE_SWITCH_KEY) !== raw) workspaceFail("OWNER_SWITCH_RECOVERY_REQUIRED", "The original device copy could not be verified.");
      setSources(storage, archive.raws);
      write(storage, WORKSPACE_BINDING_KEY, canonicalStringify({ version: 1, ownerId: journal.from }));
    }
    write(storage, WORKSPACE_SWITCH_KEY, null);
    return { status: journal.state === "COMMITTED" ? "RECOVERED_COMMIT" : "ROLLED_BACK" };
  });
}
