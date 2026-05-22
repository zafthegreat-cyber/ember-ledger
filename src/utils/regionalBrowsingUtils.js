import { normalizeStoreLocationType } from "./storeExpansionUtils.js";

export const REGIONAL_BROWSING_EMPTY_COPY = {
  noStores: "No stores in this area yet. Suggest a store or broaden the area to keep expanding Ember & Tide safely.",
  noFamilyFriendly: "No family-friendly shops in this area yet. Broaden the area or suggest a local shop for admin review.",
  noReports: "No confirmed reports here yet. Submit a Scout report when you spot stock to help families nearby.",
  noPredictions: "No predictions here yet because confirmed restock history is too limited.",
  noFavorites: "No favorite stores yet. Follow stores from their profiles to keep nearby signals together.",
};

const STATE_ALIASES = new Map([
  ["va", "Virginia"],
  ["virginia", "Virginia"],
  ["md", "Maryland"],
  ["maryland", "Maryland"],
  ["nc", "North Carolina"],
  ["north carolina", "North Carolina"],
]);

const CITY_ALIASES = new Map([
  ["virginia beach", "Virginia Beach"],
  ["va beach", "Virginia Beach"],
  ["chesapeake", "Chesapeake"],
  ["norfolk", "Norfolk"],
  ["suffolk", "Suffolk"],
  ["newport news", "Newport News"],
  ["hampton", "Hampton"],
  ["williamsburg", "Williamsburg"],
  ["fredericksburg", "Fredericksburg"],
  ["richmond", "Richmond"],
  ["alexandria", "Alexandria"],
  ["arlington", "Arlington"],
  ["fairfax", "Fairfax"],
  ["raleigh", "Raleigh"],
  ["charlotte", "Charlotte"],
]);

const REGION_HINTS = [
  {
    label: "Hampton Roads / 757",
    pattern: /\b(hampton roads|757|tidewater|virginia beach|va beach|chesapeake|norfolk|suffolk|portsmouth|newport news|hampton|williamsburg|yorktown|chesapeake bay)\b/i,
  },
  {
    label: "Richmond / Central Virginia",
    pattern: /\b(richmond|central virginia|chesterfield|henrico|glen allen|mechanicsville|midlothian|short pump)\b/i,
  },
  {
    label: "Northern Virginia",
    pattern: /\b(northern virginia|nova|fairfax|arlington|alexandria|loudoun|prince william|manassas|woodbridge|mclean|tysons|reston)\b/i,
  },
  {
    label: "Fredericksburg",
    pattern: /\b(fredericksburg|spotsylvania|stafford)\b/i,
  },
  {
    label: "Maryland",
    pattern: /\b(maryland|baltimore|annapolis|rockville|bethesda|silver spring)\b/i,
  },
  {
    label: "North Carolina",
    pattern: /\b(north carolina|raleigh|durham|charlotte|outer banks|obx|cary|greensboro)\b/i,
  },
];

const REGION_STATE_LABELS = new Map([
  ["Hampton Roads / 757", "Virginia"],
  ["Richmond / Central Virginia", "Virginia"],
  ["Northern Virginia", "Virginia"],
  ["Fredericksburg", "Virginia"],
  ["Other Virginia", "Virginia"],
  ["Maryland", "Maryland"],
  ["North Carolina", "North Carolina"],
]);

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function compactText(...values) {
  return values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean).join(" ");
}

function normalizeKey(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleCase(value = "") {
  return normalizeKey(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.length <= 2 ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function normalizeStateLabel(value = "") {
  const key = normalizeKey(value);
  if (!key) return "";
  return STATE_ALIASES.get(key) || titleCase(key);
}

export function normalizeCityLabel(value = "") {
  const key = normalizeKey(value);
  if (!key) return "";
  return CITY_ALIASES.get(key) || titleCase(key);
}

export function normalizeRegionLabel(value = "", context = {}) {
  const explicit = normalizeKey(value);
  const city = normalizeKey(context.city);
  const state = normalizeKey(context.state);
  const text = compactText(explicit, city, state, context.area, context.county);
  if (!text) return "";
  const hinted = REGION_HINTS.find((entry) => entry.pattern.test(text));
  if (hinted) return hinted.label;
  if (STATE_ALIASES.get(state) === "Virginia" || /virginia/.test(text)) return "Other Virginia";
  if (STATE_ALIASES.get(state)) return STATE_ALIASES.get(state);
  return titleCase(explicit || state || city || "Other");
}

function reconcileStateForRegion(state = "", region = "") {
  const inferredState = REGION_STATE_LABELS.get(region);
  if (!inferredState) return state;
  if (!state) return inferredState;
  if ((region === "Maryland" || region === "North Carolina") && state !== inferredState) return inferredState;
  return state;
}

export function normalizeStoreDisplayLabel(store = {}) {
  const nickname = firstValue(store.nickname, store.storeNickname, store.store_nickname);
  const name = firstValue(store.storeName, store.store_name, store.name, store.locationName);
  const chain = firstValue(store.retailer, store.chain, store.storeGroup, store.store_group);
  if (nickname && name && normalizeKey(nickname) !== normalizeKey(name)) return `${nickname} - ${name}`;
  return firstValue(nickname, name, chain, "Store location");
}

export function normalizeStoreAreaFields(store = {}) {
  const city = normalizeCityLabel(firstValue(store.city, store.addressCity, store.address_city, store.locality));
  let state = normalizeStateLabel(firstValue(store.state, store.stateCode, store.state_code, store.regionState));
  const region = normalizeRegionLabel(firstValue(store.region, store.area, store.metroArea, store.metro_area, store.county), { city, state, area: store.area, county: store.county });
  state = reconcileStateForRegion(state, region);
  const storeType = normalizeStoreLocationType(store);
  const chain = firstValue(store.retailer, store.chain, store.storeGroup, store.store_group, "Retailer");
  const nickname = firstValue(store.nickname, store.storeNickname, store.store_nickname);
  const displayLabel = normalizeStoreDisplayLabel(store);
  const areaLabel = [city, region || state].filter(Boolean).join(" / ") || state || region || "Area not listed";
  return {
    city,
    state,
    region,
    areaLabel,
    displayLabel,
    storeType,
    chain,
    nickname,
    stateKey: normalizeKey(state),
    regionKey: normalizeKey(region),
    cityKey: normalizeKey(city),
  };
}

export function matchesRegionalAreaFilters(storeOrProfile = {}, filters = {}) {
  const area = storeOrProfile.cityKey && storeOrProfile.regionKey
    ? storeOrProfile
    : normalizeStoreAreaFields(storeOrProfile.store || storeOrProfile);
  if (filters.state && filters.state !== "All" && area.state !== filters.state) return false;
  if (filters.region && filters.region !== "All" && area.region !== filters.region) return false;
  if (filters.city && filters.city !== "All" && area.city !== filters.city) return false;
  return true;
}

export function regionalFilterActive(filters = {}) {
  return Boolean(
    (filters.state && filters.state !== "All") ||
    (filters.region && filters.region !== "All") ||
    (filters.city && filters.city !== "All")
  );
}

export function buildMapReadyStoreLocation(storeOrProfile = {}) {
  const profile = storeOrProfile.store ? storeOrProfile : { store: storeOrProfile };
  const store = profile.store || storeOrProfile;
  const area = normalizeStoreAreaFields({ ...store, city: profile.city || store.city, state: profile.state || store.state, region: profile.region || store.region });
  const lat = Number(store.latitude ?? store.lat ?? store.locationLat ?? store.location_lat);
  const lng = Number(store.longitude ?? store.lng ?? store.lon ?? store.locationLng ?? store.location_lng);
  const coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  return {
    id: String(profile.id || store.id || store.storeId || store.store_id || area.displayLabel).toLowerCase(),
    displayName: profile.name || area.displayLabel,
    city: area.city,
    state: area.state,
    region: area.region,
    areaLabel: area.areaLabel,
    storeType: profile.storeType || area.storeType,
    badges: (profile.badges || []).map((badge) => badge.label || badge).filter(Boolean),
    recentConfirmedReportCount: Number(profile.activity?.recentReportCount || 0),
    predictedWindowCount: Number(profile.activity?.predictedWindows?.length || 0),
    communityGuessCount: Number(profile.activity?.communityGuessCount || 0),
    favorite: Boolean(profile.favorite || store.favorite || store.watchlisted || store.watchlist),
    coordinates,
    profileRoute: `/scout/stores/${encodeURIComponent(String(profile.id || store.id || store.storeId || store.store_id || area.displayLabel).toLowerCase())}`,
  };
}

export function buildRegionalStoreBuckets(profiles = [], options = {}) {
  const admin = Boolean(options.admin);
  const buckets = new Map();
  profiles.forEach((profile) => {
    if (!profile) return;
    if (profile.activeForViewer === false && !admin) return;
    const area = normalizeStoreAreaFields({ ...(profile.store || profile), city: profile.city, state: profile.state, region: profile.region });
    const key = `${area.state || "Unknown"}|${area.region || "Other"}|region`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: area.region || area.state || "Other Area",
        state: area.state,
        region: area.region,
        city: "",
        storeCount: 0,
        familyFriendlyCount: 0,
        favoriteCount: 0,
        confirmedReportCount: 0,
        predictedWindowCount: 0,
        communityGuessCount: 0,
        featuredPartnerCount: 0,
        advertisingPartnerCount: 0,
        mapReadyStores: [],
      });
    }
    const bucket = buckets.get(key);
    bucket.storeCount += 1;
    bucket.familyFriendlyCount += Number(Boolean(profile.store?.familyFriendlyApproved));
    bucket.favoriteCount += Number(Boolean(profile.favorite));
    bucket.confirmedReportCount += Number(profile.activity?.recentReportCount || 0);
    bucket.predictedWindowCount += Number(profile.activity?.predictedWindows?.length || 0);
    bucket.communityGuessCount += Number(profile.activity?.communityGuessCount || 0);
    bucket.featuredPartnerCount += Number(Boolean(profile.store?.featuredPartner));
    bucket.advertisingPartnerCount += Number(Boolean(profile.store?.advertisingPartner));
    bucket.mapReadyStores.push(buildMapReadyStoreLocation(profile));
  });
  return [...buckets.values()].sort((a, b) => {
    const scoreA = a.featuredPartnerCount * 8 + a.familyFriendlyCount * 5 + a.confirmedReportCount + a.storeCount;
    const scoreB = b.featuredPartnerCount * 8 + b.familyFriendlyCount * 5 + b.confirmedReportCount + b.storeCount;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a.label).localeCompare(String(b.label));
  });
}

export function buildRegionalCityBuckets(profiles = [], filters = {}, options = {}) {
  const admin = Boolean(options.admin);
  const buckets = new Map();
  profiles.forEach((profile) => {
    if (!profile) return;
    if (profile.activeForViewer === false && !admin) return;
    if (!matchesRegionalAreaFilters(profile, { state: filters.state, region: filters.region })) return;
    const area = normalizeStoreAreaFields({ ...(profile.store || profile), city: profile.city, state: profile.state, region: profile.region });
    if (!area.city) return;
    const key = `${area.state}|${area.region}|${area.city}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: area.city,
        state: area.state,
        region: area.region,
        city: area.city,
        storeCount: 0,
        familyFriendlyCount: 0,
        confirmedReportCount: 0,
        predictedWindowCount: 0,
      });
    }
    const bucket = buckets.get(key);
    bucket.storeCount += 1;
    bucket.familyFriendlyCount += Number(Boolean(profile.store?.familyFriendlyApproved));
    bucket.confirmedReportCount += Number(profile.activity?.recentReportCount || 0);
    bucket.predictedWindowCount += Number(profile.activity?.predictedWindows?.length || 0);
  });
  return [...buckets.values()].sort((a, b) => b.storeCount - a.storeCount || String(a.label).localeCompare(String(b.label)));
}
