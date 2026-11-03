// Store directory states and their regions. This is the single source for
// which states have a Restocks store directory and how stores are grouped
// into regions. Pure data and helpers only: the OpenStreetMap importer
// (scripts/import-state-stores.cjs) loads this file too, so keep it free of
// Vite-only imports.

export const DEFAULT_STORE_STATE_CODE = "VA";

// Each region lists city hints (matched against city and county text) and
// one or more [lat, lon] centers used when a store has no usable
// city. Region names must be unique across states.
export const STORE_DIRECTORY_STATES = [
  {
    code: "VA",
    name: "Virginia",
    shortName: "Virginia",
    file: "virginiaStores.json",
    zipPrefixes: [[201, 201], [220, 246]],
    defaultRegion: "Hampton Roads / 757",
    otherRegion: "Other Virginia",
    regions: [
      {
        name: "Hampton Roads / 757",
        centers: [[36.85, -76.29], [37.05, -76.45], [37.27, -76.71]],
        cities: ["suffolk", "chesapeake", "norfolk", "virginia beach", "portsmouth", "hampton", "newport news", "yorktown", "williamsburg", "smithfield", "carrollton", "franklin", "isle of wight", "gloucester", "poquoson"],
      },
      {
        name: "Richmond / Central Virginia",
        centers: [[37.54, -77.43]],
        cities: ["richmond", "henrico", "midlothian", "chesterfield", "mechanicsville", "glen allen", "short pump", "ashland", "chester", "colonial heights", "petersburg", "hopewell"],
      },
      {
        name: "Northern Virginia",
        centers: [[38.85, -77.3], [39.05, -77.48]],
        cities: ["alexandria", "arlington", "fairfax", "vienna", "falls church", "manassas", "woodbridge", "lorton", "sterling", "ashburn", "leesburg", "reston", "herndon", "chantilly", "mclean", "tysons", "springfield", "centreville", "gainesville", "dumfries", "loudoun", "prince william"],
      },
      {
        name: "Fredericksburg",
        centers: [[38.3, -77.46]],
        cities: ["fredericksburg", "stafford", "spotsylvania", "king george"],
      },
      {
        name: "Charlottesville / Albemarle",
        centers: [[38.03, -78.48]],
        cities: ["charlottesville", "albemarle", "waynesboro", "staunton"],
      },
      {
        name: "Roanoke / Southwest Virginia",
        centers: [[37.27, -79.94], [37.15, -80.4], [36.75, -81.8]],
        cities: ["roanoke", "salem", "blacksburg", "christiansburg", "radford", "bristol", "abingdon", "wytheville", "pulaski", "galax"],
      },
      {
        name: "Lynchburg",
        centers: [[37.41, -79.14]],
        cities: ["lynchburg", "forest", "madison heights", "bedford"],
      },
      {
        name: "Shenandoah Valley",
        centers: [[39.18, -78.16], [38.45, -78.87]],
        cities: ["winchester", "front royal", "harrisonburg", "woodstock", "lexington", "staunton"],
      },
      {
        name: "Eastern Shore",
        centers: [[37.6, -75.75]],
        cities: ["exmore", "onley", "chincoteague", "cape charles", "accomac"],
      },
      {
        name: "Southside Virginia",
        centers: [[36.6, -79.4], [36.75, -78.1]],
        cities: ["danville", "farmville", "martinsville", "south boston", "south hill", "emporia"],
      },
    ],
  },
  {
    code: "MD",
    name: "Maryland",
    shortName: "Maryland",
    file: "marylandStores.json",
    zipPrefixes: [[206, 219]],
    defaultRegion: "Baltimore Metro",
    otherRegion: "Other Maryland",
    regions: [
      {
        name: "Baltimore Metro",
        centers: [[39.29, -76.61], [39.4, -76.6], [39.2, -76.85]],
        cities: ["baltimore", "towson", "columbia", "ellicott city", "glen burnie", "owings mills", "catonsville", "dundalk", "essex", "bel air", "aberdeen", "westminster", "pikesville", "parkville", "timonium", "cockeysville", "hunt valley", "white marsh", "perry hall", "reisterstown", "randallstown", "linthicum", "elkridge", "hanover", "havre de grace", "edgewood", "eldersburg", "harford", "howard county"],
      },
      {
        name: "Maryland DC Suburbs",
        centers: [[39.0, -77.05], [38.85, -76.85], [39.14, -77.2]],
        cities: ["silver spring", "bethesda", "rockville", "gaithersburg", "germantown", "college park", "bowie", "laurel", "greenbelt", "hyattsville", "largo", "upper marlboro", "wheaton", "olney", "clinton", "oxon hill", "national harbor", "capitol heights", "landover", "beltsville", "chevy chase", "potomac", "clarksburg", "temple hills", "fort washington", "district heights", "lanham", "glenarden", "montgomery county", "prince george"],
      },
      {
        name: "Annapolis / Anne Arundel",
        centers: [[38.98, -76.49], [39.08, -76.65]],
        cities: ["annapolis", "severna park", "pasadena", "odenton", "crofton", "severn", "millersville", "arnold", "gambrills", "edgewater", "fort meade", "anne arundel"],
      },
      {
        name: "Frederick / Western Maryland",
        centers: [[39.41, -77.41], [39.64, -77.72], [39.65, -78.76]],
        cities: ["frederick", "hagerstown", "cumberland", "frostburg", "urbana", "middletown", "thurmont", "mount airy", "brunswick", "oakland", "hancock", "washington county", "allegany", "garrett"],
      },
      {
        name: "Southern Maryland",
        centers: [[38.6, -76.93], [38.26, -76.45], [38.54, -76.59]],
        cities: ["waldorf", "la plata", "lexington park", "california", "prince frederick", "leonardtown", "white plains", "indian head", "dunkirk", "solomons", "chesapeake beach", "great mills", "charles county", "calvert", "st. mary"],
      },
      {
        name: "Maryland Eastern Shore",
        centers: [[38.36, -75.6], [38.77, -76.07], [39.6, -75.83], [38.34, -75.08]],
        cities: ["salisbury", "ocean city", "easton", "cambridge", "chestertown", "elkton", "north east", "berlin", "fruitland", "princess anne", "pocomoke", "denton", "stevensville", "kent island", "grasonville", "wicomico", "worcester", "cecil"],
      },
    ],
  },
  {
    code: "DC",
    name: "District of Columbia",
    shortName: "Washington, DC",
    file: "dcStores.json",
    zipPrefixes: [[200, 200], [202, 205]],
    defaultRegion: "Washington, DC",
    otherRegion: "Washington, DC",
    regions: [
      {
        name: "Washington, DC",
        centers: [[38.9, -77.03]],
        cities: ["washington", "district of columbia"],
      },
    ],
  },
  {
    code: "NC",
    name: "North Carolina",
    shortName: "North Carolina",
    file: "northCarolinaStores.json",
    zipPrefixes: [[270, 289]],
    defaultRegion: "Triangle (Raleigh / Durham)",
    otherRegion: "Other North Carolina",
    regions: [
      {
        name: "Triangle (Raleigh / Durham)",
        centers: [[35.78, -78.64], [35.99, -78.9], [35.79, -78.78]],
        cities: ["raleigh", "durham", "cary", "chapel hill", "apex", "wake forest", "morrisville", "garner", "holly springs", "fuquay-varina", "fuquay varina", "knightdale", "wendell", "clayton", "carrboro", "hillsborough", "zebulon", "rolesville", "sanford", "smithfield", "wake county", "orange county", "johnston"],
      },
      {
        name: "Charlotte Metro",
        centers: [[35.23, -80.84], [35.41, -80.58], [35.26, -81.19]],
        cities: ["charlotte", "concord", "gastonia", "huntersville", "matthews", "mint hill", "cornelius", "mooresville", "kannapolis", "monroe", "indian trail", "pineville", "davidson", "statesville", "belmont", "salisbury", "waxhaw", "harrisburg", "lincolnton", "shelby", "mecklenburg", "cabarrus", "union county", "gaston"],
      },
      {
        name: "Triad (Greensboro / Winston-Salem)",
        centers: [[36.07, -79.79], [36.1, -80.24], [35.96, -80.0]],
        cities: ["greensboro", "winston-salem", "winston salem", "high point", "burlington", "kernersville", "clemmons", "thomasville", "lexington", "asheboro", "reidsville", "graham", "mebane", "eden", "mount airy", "guilford", "forsyth", "alamance"],
      },
      {
        name: "Wilmington / Southeast NC",
        centers: [[34.23, -77.94], [33.92, -78.02]],
        cities: ["wilmington", "leland", "southport", "hampstead", "carolina beach", "wrightsville beach", "whiteville", "new hanover", "brunswick", "pender"],
      },
      {
        name: "Fayetteville / Sandhills",
        centers: [[35.05, -78.88], [35.17, -79.4], [34.62, -79.01]],
        cities: ["fayetteville", "spring lake", "hope mills", "fort liberty", "fort bragg", "southern pines", "pinehurst", "aberdeen", "lumberton", "raeford", "laurinburg", "rockingham", "cumberland", "moore county", "robeson"],
      },
      {
        name: "Eastern North Carolina",
        centers: [[35.61, -77.37], [35.94, -77.79], [34.75, -77.43], [35.11, -77.04], [36.3, -76.22]],
        cities: ["greenville", "rocky mount", "wilson", "goldsboro", "jacksonville", "new bern", "kinston", "elizabeth city", "havelock", "morehead city", "roanoke rapids", "kill devil hills", "nags head", "kitty hawk", "ahoskie", "tarboro", "pitt county", "onslow", "craven", "wayne county", "outer banks"],
      },
      {
        name: "Asheville / Western NC",
        centers: [[35.6, -82.55], [35.73, -81.34], [36.22, -81.67]],
        cities: ["asheville", "hendersonville", "boone", "hickory", "morganton", "lenoir", "brevard", "waynesville", "black mountain", "sylva", "marion", "murphy", "weaverville", "buncombe", "henderson county", "watauga", "catawba"],
      },
    ],
  },
];

const STATE_BY_CODE = new Map(STORE_DIRECTORY_STATES.map((state) => [state.code, state]));
const STATE_ALIAS_ENTRIES = STORE_DIRECTORY_STATES.flatMap((state) => [
  [state.code.toLowerCase(), state.code],
  [state.name.toLowerCase(), state.code],
  [state.shortName.toLowerCase(), state.code],
]);
const STATE_CODE_BY_ALIAS = new Map([
  ...STATE_ALIAS_ENTRIES,
  ["washington dc", "DC"],
  ["washington d.c.", "DC"],
  ["d.c.", "DC"],
]);
const REGION_STATE = new Map(
  STORE_DIRECTORY_STATES.flatMap((state) => [
    ...state.regions.map((region) => [region.name, state.code]),
    [state.otherRegion, state.code],
  ])
);

export const STORE_DIRECTORY_STATE_CODES = STORE_DIRECTORY_STATES.map((state) => state.code);

export function normalizeStoreStateCode(value = "") {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return "";
  return STATE_CODE_BY_ALIAS.get(text) || "";
}

export function getStoreDirectoryState(value = DEFAULT_STORE_STATE_CODE) {
  return STATE_BY_CODE.get(normalizeStoreStateCode(value)) || null;
}

export function storeStateName(value = "") {
  return getStoreDirectoryState(value)?.name || "";
}

export function storeStateShortName(value = "") {
  return getStoreDirectoryState(value)?.shortName || "";
}

export function storeRegionsForState(value = DEFAULT_STORE_STATE_CODE) {
  const state = getStoreDirectoryState(value);
  if (!state) return [];
  const names = state.regions.map((region) => region.name);
  return names.includes(state.otherRegion) ? names : [...names, state.otherRegion];
}

export function defaultStoreRegionForState(value = DEFAULT_STORE_STATE_CODE) {
  return getStoreDirectoryState(value)?.defaultRegion || "";
}

export function otherStoreRegionForState(value = DEFAULT_STORE_STATE_CODE) {
  return getStoreDirectoryState(value)?.otherRegion || "";
}

export function storeStateForRegion(region = "") {
  return REGION_STATE.get(String(region || "").trim()) || "";
}

export const ALL_STORE_REGIONS = STORE_DIRECTORY_STATES.flatMap((state) => storeRegionsForState(state.code));

function distanceKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function storeCoords(store = {}) {
  const lat = Number(store.latitude ?? store.lat);
  const lon = Number(store.longitude ?? store.lng ?? store.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return [lat, lon];
}

function nearestRegion(coords, states, maxKm = Infinity) {
  let best = null;
  for (const state of states) {
    for (const region of state.regions) {
      for (const center of region.centers || []) {
        const km = distanceKm(coords, center);
        if (km <= maxKm && (!best || km < best.km)) best = { km, region: region.name, state: state.code };
      }
    }
  }
  return best;
}

function cityHintText(store = {}) {
  return [store.city, store.county].filter(Boolean).join(" ").toLowerCase();
}

// Picks a region for a store inside its state: an explicit known region wins,
// then city hints, then the nearest region center within 80 km.
export function inferStoreRegionForState(store = {}, stateValue = store.state) {
  const state = getStoreDirectoryState(stateValue);
  if (!state) return String(store.region || "").trim();
  const explicit = String(store.region || "").trim();
  if (explicit && storeStateForRegion(explicit) === state.code) return explicit;
  const text = cityHintText(store);
  const byCity = state.regions.find((region) => region.cities.some((city) => text.includes(city)));
  if (byCity) return byCity.name;
  const coords = storeCoords(store);
  const byCoords = coords ? nearestRegion(coords, [state], 80) : null;
  return byCoords?.region || state.otherRegion;
}

export function storeStateFromZip(zip = "") {
  const match = String(zip || "").match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!match) return "";
  const prefix = Number(match[1].slice(0, 3));
  const state = STORE_DIRECTORY_STATES.find((entry) => entry.zipPrefixes.some(([low, high]) => prefix >= low && prefix <= high));
  return state?.code || "";
}

export function storeStateFromCoords(lat, lon) {
  const coords = storeCoords({ latitude: lat, longitude: lon });
  if (!coords) return "";
  return nearestRegion(coords, STORE_DIRECTORY_STATES, 150)?.state || "";
}

// Best guess at a supported state from free-text home area ("23320",
// "Raleigh, NC", "Baltimore"). Returns "" when nothing matches.
export function detectStoreStateFromText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const byZip = storeStateFromZip(text);
  if (byZip) return byZip;
  const lower = text.toLowerCase();
  const exact = normalizeStoreStateCode(lower);
  if (exact) return exact;
  const codeMatch = text.match(/(?:,|\s)\s*(VA|MD|DC|NC)\.?\s*$/i) || text.match(/\b(D\.C\.)/i);
  if (codeMatch) return normalizeStoreStateCode(codeMatch[1]);
  const named = STORE_DIRECTORY_STATES.find((state) => lower.includes(state.name.toLowerCase()) && !(state.code === "VA" && lower.includes("west virginia")));
  if (named) return named.code;
  if (/washington,?\s*d\.?c\.?/.test(lower)) return "DC";
  const byCity = STORE_DIRECTORY_STATES.find((state) =>
    state.code !== "DC" && state.regions.some((region) => region.cities.some((city) => city.length > 4 && new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)))
  );
  return byCity?.code || "";
}
