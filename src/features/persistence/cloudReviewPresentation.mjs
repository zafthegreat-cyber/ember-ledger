const storageUnconfirmed = code => ["DEVICE_SAVE_FAILED", "STORAGE_UNAVAILABLE", "STORAGE_WRITE_FAILED", "DRAFT_STORAGE_UNAVAILABLE", "LOCAL_TRACKING_FAILED", "RECOVERY_COPY_FAILED", "QuotaExceededError", "SecurityError", "RECOVERY_REQUIRED"].includes(code) || code.startsWith("PAYLOAD_");
export function cloudSavingPresentation(status = {}, enabled = true) {
  const code = String(status.status || "IDLE");
  if (storageUnconfirmed(code)) return { title: "Device saving needs attention", mode: "Review required", detail: "A complete device save has not been verified. Keep this tab and its stored data. Follow the recovery message before editing or clearing browser storage." };
  if (code === "CONFLICT") return { title: "Review conflicting changes", mode: "Review required", detail: "Both saved copies remain available. Review the field differences and choose a version for each group; automatic retry cannot choose for you." };
  if (code === "REMOTE_AVAILABLE") return { title: "New saved changes are available", mode: "Your action required", detail: "The current device copy has not been replaced. Finish open edits, then load the changes from the other device." };
  if (!enabled || code === "PAUSED") return { title: "Cloud saving paused", mode: "Resume to sync", detail: "Existing device records remain on this device. New cloud saves wait until you resume cloud saving." };
  if (["OFFLINE", "PENDING", "REVISION_CONFLICT"].includes(code)) return { title: code === "PENDING" ? "Device changes waiting to sync" : "Cloud save waiting to retry", mode: "Automatic retry", detail: "Device records remain saved here. With cloud saving enabled, the app checks again while it is open and when the connection returns. A later conflict will need review." };
  if (code === "SYNCED") return { title: "Saved to your account", mode: "Last save confirmed", detail: "The last cloud save was verified. Continue keeping a separate backup for recovery." };
  if (["IDLE", "SYNCING"].includes(code)) return { title: code === "SYNCING" ? "Checking saved changes" : "Cloud saving ready", mode: "Checking automatically", detail: "The next confirmed cloud save will appear below. Device records are not replaced without the existing save and recovery checks." };
  if (["AUTH_REQUIRED", "ACCESS_REQUIRED", "SESSION_CHANGED", "OWNER_BINDING_REQUIRED"].includes(code)) return { title: "Cloud saving needs account review", mode: "Your action required", detail: "Existing device records have not been replaced. Verify the same account and its access before trying again; do not clear stored data to resolve this." };
  return { title: "Cloud save not confirmed", mode: "Review required", detail: "Existing stored records have not been replaced. Follow the status message, then use Sync now after the issue is resolved. A server or validation failure does not confirm a new cloud backup." };
}

const sensitive = field => /password|secret|authorization|credential|access.?token|refresh.?token|api.?key/i.test(field);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clip = value => String(value).length > 280 ? `${String(value).slice(0, 280)}…` : String(value);
function shown(value, path) {
  if (sensitive(path)) return "Hidden sensitive field";
  if (value === undefined) return "Not present";
  if (value === null) return "Not recorded";
  if (value === "") return "Blank";
  if (Array.isArray(value)) return `${value.length} entries`;
  if (object(value)) return `${Object.keys(value).length} fields`;
  return clip(value);
}
export function conflictTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" }).format(new Date(time)) : "Not recorded";
}

/** Bounded, read-only comparison. Matching IDs prevent a reordered array from pairing unrelated records. */
export function buildCloudConflictDifferences(device, cloud, { maxRows = 50, maxVisited = 10000 } = {}) {
  const rows = [];
  let total = 0, visited = 0, limited = false, deviceUpdatedAt = null, cloudUpdatedAt = null;
  const noteTime = (value, side) => {
    if (!object(value)) return;
    for (const field of ["updatedAt", "updated_at", "modifiedAt", "modified_at"]) {
      const time = Date.parse(value[field] || "");
      if (Number.isFinite(time)) {
        if (side === "device" && (!deviceUpdatedAt || time > Date.parse(deviceUpdatedAt))) deviceUpdatedAt = value[field];
        if (side === "cloud" && (!cloudUpdatedAt || time > Date.parse(cloudUpdatedAt))) cloudUpdatedAt = value[field];
      }
    }
  };
  const add = (path, a, b) => {
    total++;
    if (rows.length < maxRows) rows.push({ path, device: shown(a, path), cloud: shown(b, path) });
  };
  const keyed = array => Array.isArray(array) && array.every(value => object(value) && (typeof value.id === "string" || typeof value.id === "number")) && new Set(array.map(value => String(value.id))).size === array.length;
  const compare = (a, b, path, depth = 0) => {
    if (++visited > maxVisited || depth > 18) { limited = true; return; }
    noteTime(a, "device"); noteTime(b, "cloud");
    if (a === b) return;
    if (sensitive(path)) { add(path, a, b); return; }
    if (keyed(a) && keyed(b)) {
      const left = new Map(a.map(value => [String(value.id), value])), right = new Map(b.map(value => [String(value.id), value]));
      const leftIds = [...left.keys()], rightIds = [...right.keys()];
      if (leftIds.length === rightIds.length && leftIds.every(id => right.has(id)) && leftIds.some((id, index) => id !== rightIds[index])) add(`${path} · Record order`, leftIds.join(", "), rightIds.join(", "));
      for (const id of new Set([...leftIds, ...rightIds])) {
        if (limited) break;
        const record = left.get(id) || right.get(id);
        const label = clip(record.name || record.title || record.itemName || "Record");
        compare(left.get(id), right.get(id), `${path} · ${label} [${id}]`, depth + 1);
      }
    } else if (Array.isArray(a) && Array.isArray(b)) {
      for (let index = 0; index < Math.max(a.length, b.length) && !limited; index++) compare(a[index], b[index], `${path} · Entry ${index + 1}`, depth + 1);
    } else if (object(a) && object(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        if (limited) break;
        compare(a[key], b[key], `${path} · ${key}`, depth + 1);
      }
    } else add(path, a, b);
  };
  if (device?.schemaVersion !== cloud?.schemaVersion) add("Schema version", device?.schemaVersion, cloud?.schemaVersion);
  compare(device?.data, cloud?.data, "Records");
  return { rows, total, truncated: limited || total > rows.length, limited, deviceUpdatedAt, cloudUpdatedAt };
}
