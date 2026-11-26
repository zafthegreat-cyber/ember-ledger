// Where a store sits on a map (moved out of ScoutTileMap.jsx on Nov 25 2026 so the
// restock map and the reports board place stores by the same rules): its saved
// coordinates, else an estimate for its city or region with a small steady offset
// so stores in one city do not sit on one point. An estimate is area-level only.
import { STORE_DIRECTORY_STATES, normalizeStoreStateCode } from "../data/storeStates.js";

const AREA_COORDINATE_FALLBACKS = [
  { keys: ["virginia beach", "lynn haven", "lynnhaven", "pembroke", "princess anne"], lat: 36.8529, lng: -75.978 },
  { keys: ["chesapeake", "greenbrier", "battlefield", "great bridge"], lat: 36.7682, lng: -76.2875 },
  { keys: ["norfolk", "ghent", "military circle"], lat: 36.8508, lng: -76.2859 },
  { keys: ["portsmouth"], lat: 36.8354, lng: -76.2983 },
  { keys: ["newport news"], lat: 37.0871, lng: -76.473 },
  { keys: ["hampton"], lat: 37.0299, lng: -76.3452 },
  { keys: ["suffolk"], lat: 36.7282, lng: -76.5836 },
  { keys: ["williamsburg"], lat: 37.2707, lng: -76.7075 },
  { keys: ["richmond", "short pump", "chesterfield", "henrico"], lat: 37.5407, lng: -77.436 },
  { keys: ["alexandria", "arlington", "fairfax", "tysons", "northern virginia", "nova"], lat: 38.8462, lng: -77.3064 },
  { keys: ["fredericksburg", "spotsylvania"], lat: 38.3032, lng: -77.4605 },
  { keys: ["charlottesville", "albemarle"], lat: 38.0293, lng: -78.4767 },
  { keys: ["roanoke"], lat: 37.271, lng: -79.9414 },
  { keys: ["lynchburg"], lat: 37.4138, lng: -79.1422 },
  { keys: ["shenandoah", "winchester", "harrisonburg"], lat: 38.4496, lng: -78.8689 },
  { keys: ["eastern shore", "accomack", "onancock"], lat: 37.708, lng: -75.7497 },
  { keys: ["southside", "danville", "martinsville"], lat: 36.5859, lng: -79.395 },
  { keys: ["southwest", "bristol", "abingdon", "wytheville"], lat: 36.7098, lng: -81.9773 },
  // Other directory states: region names first (they are unique), then their
  // city hints, both from storeStates.
  ...["name", "cities"].flatMap((field) => STORE_DIRECTORY_STATES.filter((state) => state.code !== "VA").flatMap((state) =>
    state.regions.map((region) => ({
      stateCode: state.code,
      keys: field === "name" ? [region.name.toLowerCase()] : region.cities.filter((city) => city.length > 4 && city !== "washington"),
      lat: region.centers[0][0],
      lng: region.centers[0][1],
    }))
  )),
  { stateCode: "DC", keys: ["washington, dc", "washington dc", "district of columbia"], lat: 38.9, lng: -77.03 },
  { keys: ["hampton roads", "757", "virginia"], lat: 36.8529, lng: -76.1474 },
  { stateCode: "MD", keys: ["maryland"], lat: 39.29, lng: -76.61 },
  { stateCode: "NC", keys: ["north carolina"], lat: 35.78, lng: -78.64 },
];

function stableOffset(seed, scale = 0.028) {
  const text = String(seed || "scout-store");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  const x = (((hash & 0xff) / 255) - 0.5) * scale;
  const y = ((((hash >> 8) & 0xff) / 255) - 0.5) * scale;
  return { lat: y, lng: x };
}

export function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getRowCoordinates(row = {}) {
  const coordinates = row.coordinates || row.location || {};
  const store = row.store || row.profile?.store || {};
  const lat = toFiniteNumber(
    coordinates.lat ??
    coordinates.latitude ??
    row.lat ??
    row.latitude ??
    store.lat ??
    store.latitude ??
    store.locationLat ??
    store.location_lat
  );
  const lng = toFiniteNumber(
    coordinates.lng ??
    coordinates.lon ??
    coordinates.longitude ??
    row.lng ??
    row.lon ??
    row.longitude ??
    store.lng ??
    store.lon ??
    store.longitude ??
    store.locationLng ??
    store.location_lng
  );
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 85.05112878 || Math.abs(lng) > 180) return null;
  return { lat, lng, source: "coordinate" };
}

export function inferAreaCoordinates(row = {}, index = 0) {
  const store = row.store || row.profile?.store || {};
  const haystack = [
    row.area,
    row.city,
    row.region,
    row.retailer,
    row.name,
    row.storeName,
    row.store_name,
    row.profile?.area,
    row.profile?.areaLabel,
    row.profile?.name,
    store.city,
    store.region,
    store.address,
    store.area,
    store.name,
    store.storeName,
    store.nickname,
    store.retailer,
  ].filter(Boolean).join(" ").toLowerCase();
  const stateCode = normalizeStoreStateCode(row.state || row.profile?.state || store.state || row.stateCode || store.stateCode);
  const fallback = AREA_COORDINATE_FALLBACKS.find((entry) =>
    (!stateCode || stateCode === (entry.stateCode || "VA")) && entry.keys.some((key) => haystack.includes(key)));
  if (!fallback) return null;
  const offset = stableOffset(`${haystack}-${index}`);
  return {
    lat: fallback.lat + offset.lat,
    lng: fallback.lng + offset.lng,
    source: "area",
  };
}

/** Saved coordinates, else the city or region estimate, else null. */
export function resolveStoreCoordinates(row = {}, index = 0) {
  return getRowCoordinates(row) || inferAreaCoordinates(row, index);
}
