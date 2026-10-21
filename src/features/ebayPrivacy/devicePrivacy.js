import { canonicalStringify } from "../backup/canonicalJson.js";
import { createWorkspacePayloadStore } from "../persistence/workspacePayloadStore.js";
import { redactEbayArchive } from "./privacyArchives.js";
import { deriveEbayListingTombstones, readEbayPrivacyPolicy, writeEbayPrivacyPolicy } from "./privacyPolicy.js";
import { sha256Text } from "./identityHash.js";

const PREFIXES = ["ember-and-tide.flip-scout.v1", "code3.workspace-recovery.v1", "code3.workspace-checkpoint.v1", "code3.workspace-conflict-copy.v1:",
  "code3.workspace-device-archive.v1:", "code3.workspace-device-archive-ref.v1:", "code3.workspace-owner-switch.v1", "code3.session-draft-archive.v1:",
  "code3.session-draft-switch.v1", "private-business-hub.deal-analysis-draft.v1", "private-business-hub.form-draft."];
function deviceEntries(storage) {
  const values = [];
  for (let index=0; index<Number(storage?.length || 0); index++) {
    const key = storage.key(index);
    if (typeof key === "string" && PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix))) values.push([key,storage.getItem(key)]);
  }
  return values;
}
/** Run before record writers mount, or while holding the workspace exclusive lease. */
export async function redactEbayDeviceCopies({ storage, sessionStorage, policy = readEbayPrivacyPolicy(storage), payloadStore = createWorkspacePayloadStore(), assertCurrent = () => {} }) {
  if (!policy.tombstones.length) return { changedKeys: [], payloads: 0 };
  const rawHashes = new Map();
  const entries = [...deviceEntries(storage).map(([key,raw]) => ({storage,key,raw})), ...deviceEntries(sessionStorage).map(([key,raw]) => ({storage:sessionStorage,key,raw}))];
  for (const entry of entries) if (entry.raw) policy = deriveEbayListingTombstones(JSON.parse(entry.raw),policy);
  writeEbayPrivacyPolicy(policy,storage);
  // Populate exact old/new raw hashes before resealing recovery journals.
  for (const entry of entries) {
    if (!entry.raw) continue;
    const parsed = JSON.parse(entry.raw);
    const next = redactEbayArchive(parsed,policy,new Map(),rawHashes);
    if (next !== parsed) rawHashes.set(sha256Text(canonicalStringify(entry.raw)),sha256Text(canonicalStringify(canonicalStringify(next))));
  }
  const references = await payloadStore.redactEbayPrivacy(policy,{ assertCurrent,rawHashes });
  if (references.ebayPrivacyPolicy) policy = writeEbayPrivacyPolicy(references.ebayPrivacyPolicy,storage);
  const writes = entries.map((entry) => {
    if (!entry.raw) return entry;
    const parsed = JSON.parse(entry.raw);
    const next = redactEbayArchive(parsed,policy,references,rawHashes);
    return { ...entry, next: next === parsed ? entry.raw : canonicalStringify(next) };
  });
  const changedKeys = [];
  for (const entry of writes) {
    assertCurrent();
    if (entry.next === undefined || entry.next === entry.raw) continue;
    if (entry.storage.getItem(entry.key) !== entry.raw) throw new Error("Records changed during the eBay privacy update. Reopen the app before retrying.");
    entry.storage.setItem(entry.key,entry.next);
    if (entry.storage.getItem(entry.key) !== entry.next) throw new Error("The eBay privacy update could not be saved on this device.");
    changedKeys.push(entry.key);
  }
  return { changedKeys, payloads: references.size };
}
