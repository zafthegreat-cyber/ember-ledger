// Map pictures (raster tiles) for the restock map and the Scout map (Nov 27 2026).
//
// The default is OpenStreetMap's own tile server. Its tile usage policy
// (https://operations.osmfoundation.org/policies/tiles/) allows apps like this one as long as they:
// - use exactly https://tile.openstreetmap.org/{z}/{x}/{y}.png;
// - show "© OpenStreetMap contributors" clearly on the map, linked to the copyright page, never
//   hidden under buttons;
// - let the browser send its normal Referer (never referrerPolicy="no-referrer" on tiles);
// - leave browser caching alone and fetch only the tiles in view (no saving areas for offline use).
//
// OSM promises no uptime and can block heavy or commercial use without notice. The policy also asks
// apps not to hard-code the URL. To switch provider, set these in the hosting settings and redeploy;
// the Play Store app (a website in Chrome) picks it up with no store update:
// - VITE_MAP_TILE_URL: an https template with {z}, {x} and {y}. Any key is the provider's public browser
//   key, restricted to this site's domain in the provider's dashboard;
// - VITE_MAP_TILE_CREDIT and VITE_MAP_TILE_CREDIT_URL: the provider's credit text and link.
//   Without them, the OpenStreetMap credit stays (most providers draw OSM data; many also want their own name).

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_CREDIT = "© OpenStreetMap contributors";
export const OSM_CREDIT_URL = "https://www.openstreetmap.org/copyright";

const text = (value) => String(value ?? "").trim();
const isHttpsUrl = (value) => /^https:\/\/\S+$/i.test(value);

// Settings from an env object (import.meta.env in the app; a plain object in tests).
export function mapTileSettings(env = {}) {
  const custom = text(env.VITE_MAP_TILE_URL);
  const useCustom = isHttpsUrl(custom) && ["{z}", "{x}", "{y}"].every((part) => custom.includes(part));
  const creditUrl = text(env.VITE_MAP_TILE_CREDIT_URL);
  return {
    url: useCustom ? custom : OSM_TILE_URL,
    credit: (useCustom && text(env.VITE_MAP_TILE_CREDIT)) || OSM_CREDIT,
    creditUrl: useCustom && isHttpsUrl(creditUrl) ? creditUrl : OSM_CREDIT_URL,
  };
}

const settings = mapTileSettings(import.meta.env || {});
export const MAP_TILE_URL = settings.url;
export const MAP_TILE_CREDIT = settings.credit;
export const MAP_TILE_CREDIT_URL = settings.creditUrl;

export function mapTileUrl(z, x, y, template = MAP_TILE_URL) {
  return template.replaceAll("{z}", String(z)).replaceAll("{x}", String(x)).replaceAll("{y}", String(y));
}
