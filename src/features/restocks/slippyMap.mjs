// Map maths for the restock map (Nov 25 2026, owner: "the map is terrible").
// Pure helpers so the map can be dragged anywhere, zoomed, and group pins that
// would sit on top of each other. No map library: tiles are plain images.

export const TILE = 256;
export const MIN_ZOOM = 4;
export const MAX_ZOOM = 17;
const MAX_LAT = 85.05112878;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export const clampZoom = (zoom) => clamp(Math.round(Number(zoom) || 0), MIN_ZOOM, MAX_ZOOM);

/** Latitude/longitude to map pixels at a zoom level (Web Mercator). */
export function project(point, zoom) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((clamp(Number(point.lat), -MAX_LAT, MAX_LAT) * Math.PI) / 180);
  return {
    x: ((Number(point.lng) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Map pixels back to latitude/longitude. */
export function unproject(pixel, zoom) {
  const scale = TILE * 2 ** zoom;
  const lng = (pixel.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pixel.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: clamp(lat, -MAX_LAT, MAX_LAT), lng: ((((lng + 180) % 360) + 360) % 360) - 180 };
}

/** Where a place sits inside a map of this size, in pixels from its top-left corner. */
export function toScreen(point, view, size) {
  const center = project(view.center, view.zoom);
  const world = project(point, view.zoom);
  return { x: world.x - center.x + size.width / 2, y: world.y - center.y + size.height / 2 };
}

/** The place under a point of the map (pixels from its top-left corner). */
export function fromScreen(pixel, view, size) {
  const center = project(view.center, view.zoom);
  return unproject({ x: center.x + pixel.x - size.width / 2, y: center.y + pixel.y - size.height / 2 }, view.zoom);
}

/** Dragging the map by (dx, dy) pixels moves its centre the other way. */
export function panBy(view, dx, dy) {
  const center = project(view.center, view.zoom);
  return { ...view, center: unproject({ x: center.x - dx, y: center.y - dy }, view.zoom) };
}

/** Zooms by whole steps, keeping the place under `anchor` (screen pixels) where it is. */
export function zoomAt(view, delta, size, anchor = null) {
  const zoom = clampZoom(view.zoom + delta);
  if (zoom === view.zoom) return view;
  const pivot = anchor || { x: size.width / 2, y: size.height / 2 };
  const place = fromScreen(pivot, view, size);
  const world = project(place, zoom);
  return { zoom, center: unproject({ x: world.x - (pivot.x - size.width / 2), y: world.y - (pivot.y - size.height / 2) }, zoom) };
}

/** The closest zoom that keeps every point inside the map, with room for the pins. */
export function fitView(points = [], size = { width: 320, height: 320 }, { padding = 48, maxZoom = 15, lone = 13 } = {}) {
  const list = points.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  if (!list.length) return { center: { lat: 39.5, lng: -98.35 }, zoom: MIN_ZOOM };
  if (list.length === 1) return { center: { lat: list[0].lat, lng: list[0].lng }, zoom: lone };
  const width = Math.max(40, size.width - padding * 2), height = Math.max(40, size.height - padding * 2);
  for (let zoom = maxZoom; zoom >= MIN_ZOOM; zoom -= 1) {
    const worlds = list.map((point) => project(point, zoom));
    const xs = worlds.map((world) => world.x), ys = worlds.map((world) => world.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    if (right - left <= width && bottom - top <= height) return { zoom, center: unproject({ x: (left + right) / 2, y: (top + bottom) / 2 }, zoom) };
  }
  const worlds = list.map((point) => project(point, MIN_ZOOM));
  return { zoom: MIN_ZOOM, center: unproject({ x: worlds.reduce((sum, world) => sum + world.x, 0) / worlds.length, y: worlds.reduce((sum, world) => sum + world.y, 0) / worlds.length }, MIN_ZOOM) };
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;
/** Miles between two places. */
export function milesBetween(a, b) {
  const dLat = toRadians(b.lat - a.lat), dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * The stores the map opens on: those around the anchor (the first point, which is
 * the most useful store), so one far-away store does not zoom the map out to a
 * whole state. Falls back to every point when the anchor stands alone.
 */
export function focusPoints(points = [], { miles = 15 } = {}) {
  const list = points.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  if (list.length < 3) return list;
  const near = list.filter((point) => milesBetween(list[0], point) <= miles);
  return near.length >= 2 ? near : list;
}

/** Zoom for a "within N miles" area. */
export function zoomForRadius(miles = 25) {
  return miles <= 5 ? 12 : miles <= 10 ? 11 : miles <= 25 ? 10 : miles <= 50 ? 9 : 8;
}

/**
 * Groups pins that would overlap on screen. Each pin: { id, x, y } in screen
 * pixels. The selected pin always stands alone. Returns groups in drawing order:
 * { key, x, y, items } where items has one pin (a store) or several (a group).
 */
export function clusterPins(pins = [], { radius = 46, selectedId = "" } = {}) {
  const groups = [];
  const selected = pins.find((pin) => selectedId && String(pin.id) === String(selectedId));
  for (const pin of pins) {
    if (pin === selected) continue;
    const home = groups.find((group) => Math.hypot(group.x - pin.x, group.y - pin.y) <= radius);
    if (home) {
      home.items.push(pin);
      home.x = home.items.reduce((sum, item) => sum + item.x, 0) / home.items.length;
      home.y = home.items.reduce((sum, item) => sum + item.y, 0) / home.items.length;
    } else {
      groups.push({ x: pin.x, y: pin.y, items: [pin] });
    }
  }
  const result = groups.map((group) => ({ ...group, key: group.items.length === 1 ? `pin-${group.items[0].id}` : `group-${group.items.map((item) => item.id).sort().join("+")}` }));
  if (selected) {
    // A store under the chosen pin is nudged out from beneath it, so it can still be tapped.
    for (const group of result) {
      const dx = group.x - selected.x, dy = group.y - selected.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      const ux = distance > 0.5 ? dx / distance : 1, uy = distance > 0.5 ? dy / distance : 0;
      group.x = selected.x + ux * radius;
      group.y = selected.y + uy * radius;
    }
    result.push({ key: `pin-${selected.id}`, x: selected.x, y: selected.y, items: [selected] });
  }
  return result;
}

/** The map image squares needed to cover a map of this size. */
export function visibleTiles(view, size) {
  const zoom = clampZoom(view.zoom);
  const center = project(view.center, zoom);
  const left = center.x - size.width / 2, top = center.y - size.height / 2;
  const count = 2 ** zoom;
  const tiles = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.height) / TILE); ty += 1) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.width) / TILE); tx += 1) {
      tiles.push({ key: `${zoom}/${tx}/${ty}`, z: zoom, x: ((tx % count) + count) % count, y: ty, left: Math.round(tx * TILE - left), top: Math.round(ty * TILE - top) });
    }
  }
  return tiles;
}

/** True when a screen point is inside the map (with a margin for half a pin). */
export function onScreen(pixel, size, margin = 0) {
  return pixel.x >= -margin && pixel.y >= -margin && pixel.x <= size.width + margin && pixel.y <= size.height + margin;
}

/**
 * A store's name for the map. Directory names look like
 * "180 - Trade St. / Central Park Blvd. (Target)"; people read "Target" and the street.
 */
export function storeMapLabel(row = {}) {
  const raw = String(row.name || "").trim();
  const listed = raw.match(/^#?\d+\s*[-–]\s*(.+?)\s*\(([^)]+)\)\s*$/);
  const retailer = String(row.retailer || "").trim();
  if (listed) {
    const title = listed[2].split("/")[0].trim() || retailer || raw;
    return { title, place: listed[1].trim(), initial: title.charAt(0).toUpperCase() || "S" };
  }
  const title = raw || retailer || "Store";
  return { title, place: "", initial: title.replace(/^the\s+/i, "").charAt(0).toUpperCase() || "S" };
}
