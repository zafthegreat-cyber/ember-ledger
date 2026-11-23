// Pure helpers for the restock map (RestockMapCard.jsx). Only the latest public
// report per store within 48 hours is used: no history, no quantities.
import { relativeUiTime } from "../../utils/uiTime.mjs";
import { areaKey, distanceMiles } from "../../utils/nationwideLocation.mjs";

export const RESTOCK_MAP_RECENT_HOURS = 48;
const num = (value) => (value === null || value === undefined || String(value).trim() === "" ? NaN : Number(value));
const storeId = (store = {}) => String(store.id || store.storeId || store.store_id || "");
const storeKey = (store = {}) => String(store.storeKey || store.store_key || "");
const coords = (store = {}) => {
  const lat = num(store.latitude ?? store.lat ?? store.locationLat ?? store.location_lat);
  const lng = num(store.longitude ?? store.lng ?? store.locationLng ?? store.location_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : null;
};
const seenAt = (report = {}) => Date.parse(report.observedAt || report.observed_at || report.createdAt || report.created_at || "");
const isPublic = (report = {}) => (report.visibility || "public") === "public" && !report.archivedAt && !report.archived_at;
const EMPTY_TYPES = new Set(["no_stock", "out_of_stock", "empty"]);

/** Pure: which stores go on the map, in what order, with their latest report. */
// area (optional, the chosen nearby area { lat, lng, city, state }): only stores
// within radius miles are shown, nearest first; followed stores always stay.
export function buildRestockMapRows({ stores = [], reports = [], isFollowed = () => false, now = Date.now(), maxPins = 12, area = null, radius = 25 } = {}) {
  const latest = new Map();
  for (const report of reports) {
    const at = seenAt(report);
    if (!isPublic(report) || !Number.isFinite(at) || now - at > RESTOCK_MAP_RECENT_HOURS * 3600000 || at > now + 600000) continue;
    for (const key of [String(report.storeId || report.store_id || ""), String(report.storeKey || report.store_key || "")]) {
      if (key && (!latest.has(key) || seenAt(latest.get(key)) < at)) latest.set(key, report);
    }
  }
  const seen = new Set();
  const rows = [];
  for (const store of stores) {
    const point = coords(store);
    const id = storeId(store) || storeKey(store);
    // Stores without saved coordinates are still shown: the map places them by
    // city (approximate), and the card says so.
    if (!id || seen.has(id) || !(point || store.city)) continue;
    seen.add(id);
    const report = latest.get(storeId(store)) || latest.get(storeKey(store)) || null;
    const followed = Boolean(isFollowed(store));
    let distance = null;
    if (area) {
      distance = point ? distanceMiles(area, point) : null;
      // No coordinates: a store in the chosen city counts as in the area.
      if (distance === null && areaKey(store.city) && areaKey(store.city) === areaKey(area.city) && areaKey(store.state || store.stateCode) === areaKey(area.state)) distance = 0;
      if (!followed && (distance === null || distance > radius)) continue;
    }
    rows.push({
      id, store, report,
      name: store.nickname || store.name || store.storeName || "Store",
      retailer: store.retailer || store.chain || "Store",
      area: [store.city, store.state || store.stateCode].filter(Boolean).join(", ") || "Area not listed",
      ...(point ? { latitude: point.lat, longitude: point.lng } : {}),
      city: store.city || "", exact: Boolean(point),
      followed,
      watchlisted: followed,
      distance,
    });
  }
  const rank = (row) => (row.report ? 0 : row.followed ? 1 : row.exact ? 2 : 3);
  return rows
    .sort((a, b) => rank(a) - rank(b) || (b.report ? seenAt(b.report) : 0) - (a.report ? seenAt(a.report) : 0) || (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, maxPins);
}

export function describeLatestReport(report, now = Date.now()) {
  if (!report) return { tone: "none", headline: "No report in the last 2 days", detail: "Be the first to share what you see here." };
  const empty = EMPTY_TYPES.has(String(report.reportType || report.report_type || ""));
  const confirmed = String(report.status || "") === "confirmed";
  const product = report.productName || report.product_name || report.itemName || "TCG product";
  const when = relativeUiTime(report.observedAt || report.observed_at || report.createdAt || report.created_at, now);
  return {
    tone: empty ? "empty" : confirmed ? "confirmed" : "reported",
    headline: empty ? `Shelf empty · ${when}` : `${confirmed ? "Confirmed" : "Reported"} · ${when}`,
    detail: empty ? `${product} was not on the shelf.` : `${product} was seen. Stock can change before you arrive.`,
  };
}
