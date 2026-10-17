import { BACKUP_PARSE_LIMITS, parseUntrustedBackupJson } from "./canonicalJson.js";

export const LEGACY_BACKUP_MAX_BYTES = BACKUP_PARSE_LIMITS.maxBytes;

const recordArrays = [
  "items", "purchasers", "catalogProducts", "expenses", "sales", "vehicles", "mileageTrips",
  "workspaces", "workspaceMembers", "workspaceInvites", "suggestions", "tideTradrWatchlist",
  "marketplaceListings", "marketplaceReports", "marketPriceMemories", "itemComparisons",
  "scoutStores", "scoutReports", "scoutItems", "scoutRoutes", "tidepoolPosts", "tidepoolReports",
  "tidepoolComments", "tidepoolReactions",
];
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function requireRecordArrays(data, fields, path) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
    if (!Array.isArray(data[field]) || data[field].some(row => !isObject(row))) {
      throw new Error(`${path}.${field} must contain an array of records.`);
    }
  }
}

export function parseLegacyBetaBackup(raw) {
  const payload = parseUntrustedBackupJson(raw);
  if (payload.format === "code-3-backup") {
    throw new Error("Code 3 verified backups must use Data & Backup → Preview restore. They cannot be merged or replaced with the legacy importer.");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "format") || payload.sections || payload.manifest) {
    throw new Error("This backup format is not supported by the legacy importer.");
  }
  if (payload.backupType !== undefined && payload.backupType !== "local-beta") {
    throw new Error("This is not a local beta backup.");
  }
  if (payload.backupVersion !== undefined && ![1, 2].includes(payload.backupVersion)) {
    throw new Error("This legacy backup version is not supported.");
  }
  const data = Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
  if (!isObject(data) || !Array.isArray(data.items)) {
    throw new Error("This does not look like a legacy beta backup: an items array is required before normalization.");
  }
  requireRecordArrays(data, recordArrays, "data");
  for (const [key, fields] of [
    ["scout", ["stores", "reports", "items", "routes", "bestBuyStockResults", "bestBuyNightlyReports"]],
    ["tidepoolCommunity", ["posts", "comments", "reactions"]],
  ]) {
    if (data[key] === undefined) continue;
    if (!isObject(data[key])) throw new Error(`data.${key} must be an object.`);
    requireRecordArrays(data[key], fields, `data.${key}`);
  }
  for (const settings of [payload.settings, data.settings]) {
    if (settings !== undefined && !isObject(settings)) throw new Error("Backup settings must be an object.");
  }
  if (data.marketplaceSavedIds !== undefined && !Array.isArray(data.marketplaceSavedIds)) {
    throw new Error("data.marketplaceSavedIds must be an array.");
  }
  return payload;
}
