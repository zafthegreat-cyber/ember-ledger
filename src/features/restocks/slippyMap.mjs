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
  return zoomTo(view, clampZoom(view.zoom + delta), size, anchor);
}

/**
 * Zooms to any level in between too (Nov 27 2026: two fingers zoom smoothly instead
 * of jumping a whole step), keeping the place under `anchor` where it is.
 */
export function zoomTo(view, zoom, size, anchor = null) {
  const level = clamp(Number(zoom) || 0, MIN_ZOOM, MAX_ZOOM);
  if (level === view.zoom) return view;
  const pivot = anchor || { x: size.width / 2, y: size.height / 2 };
  const place = fromScreen(pivot, view, size);
  const world = project(place, level);
  return { zoom: level, center: unproject({ x: world.x - (pivot.x - size.width / 2), y: world.y - (pivot.y - size.height / 2) }, level) };
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

/**
 * Where most stores are (Nov 27 2026). With the whole state's directory on the map
 * and nothing reported or followed yet, the map opens on its busiest town, not on
 * whichever store sorts first by name. Quick for thousands of stores: points are
 * counted in squares about `miles` across, then those near the busiest one are kept.
 */
export function busiestPoints(points = [], { miles = 12 } = {}) {
  const list = points.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  if (list.length < 3) return list;
  const middleLat = list.reduce((sum, point) => sum + point.lat, 0) / list.length;
  const latStep = miles / 69;
  const lngStep = latStep / Math.max(0.2, Math.cos(toRadians(middleLat)));
  const cellOf = (point) => [Math.floor(point.lat / latStep), Math.floor(point.lng / lngStep)];
  const counts = new Map();
  for (const point of list) {
    const [row, column] = cellOf(point);
    counts.set(`${row}:${column}`, (counts.get(`${row}:${column}`) || 0) + 1);
  }
  let best = list[0], bestCount = -1;
  for (const point of list) {
    const [row, column] = cellOf(point);
    let count = 0;
    for (let dRow = -1; dRow <= 1; dRow += 1) for (let dColumn = -1; dColumn <= 1; dColumn += 1) count += counts.get(`${row + dRow}:${column + dColumn}`) || 0;
    if (count > bestCount) { best = point; bestCount = count; }
  }
  const near = list.filter((point) => milesBetween(best, point) <= miles);
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
  // Groups are filed in squares one radius across, so a pin only checks the groups in
  // the squares around it (Nov 27 2026: the map now carries a whole state's stores).
  // Same result as checking every group: the earliest group within reach wins.
  const cells = new Map();
  const cellKey = (x, y) => `${Math.floor(x / radius)}:${Math.floor(y / radius)}`;
  const file = (index) => { const key = cellKey(groups[index].x, groups[index].y); if (!cells.has(key)) cells.set(key, new Set()); cells.get(key).add(index); };
  for (const pin of pins) {
    if (pin === selected) continue;
    const column = Math.floor(pin.x / radius), row = Math.floor(pin.y / radius);
    let homeIndex = -1;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      for (const index of cells.get(`${column + dx}:${row + dy}`) || []) {
        if ((homeIndex < 0 || index < homeIndex) && Math.hypot(groups[index].x - pin.x, groups[index].y - pin.y) <= radius) homeIndex = index;
      }
    }
    if (homeIndex >= 0) {
      const home = groups[homeIndex];
      cells.get(cellKey(home.x, home.y))?.delete(homeIndex);
      home.items.push(pin);
      home.sumX += pin.x; home.sumY += pin.y;
      home.x = home.sumX / home.items.length;
      home.y = home.sumY / home.items.length;
      file(homeIndex);
    } else {
      groups.push({ x: pin.x, y: pin.y, sumX: pin.x, sumY: pin.y, items: [pin] });
      file(groups.length - 1);
    }
  }
  // A group's middle moves as stores join it, so two groups can drift onto each other
  // (with a whole state on the map they did). Those are joined; few groups, so a plain check.
  const merged = mergeCloseGroups(groups, radius);
  const result = merged.map((group) => ({ x: group.x, y: group.y, items: group.items, key: group.items.length === 1 ? `pin-${group.items[0].id}` : `group-${group.items.map((item) => item.id).sort().join("+")}` }));
  if (selected) {
    // A store under the chosen pin is nudged out from beneath it, so it can still be tapped.
    const nudged = new Set();
    for (const group of result) {
      const dx = group.x - selected.x, dy = group.y - selected.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      const ux = distance > 0.5 ? dx / distance : 1, uy = distance > 0.5 ? dy / distance : 0;
      group.x = selected.x + ux * radius;
      group.y = selected.y + uy * radius;
      nudged.add(group);
    }
    // A nudged pin that lands on a neighbour joins it (the neighbour stays put, so nothing new overlaps).
    for (let a = 0; a < result.length; a += 1) {
      for (let b = a + 1; b < result.length; b += 1) {
        if (!(nudged.has(result[a]) || nudged.has(result[b])) || Math.hypot(result[a].x - result[b].x, result[a].y - result[b].y) >= radius) continue;
        const [keep, gone] = nudged.has(result[a]) && !nudged.has(result[b]) ? [b, a] : [a, b];
        const kept = result[keep];
        kept.items = kept.items.concat(result[gone].items);
        kept.key = `group-${kept.items.map((item) => item.id).sort().join("+")}`;
        result.splice(gone, 1);
        a = -1; // start again: indexes moved
        break;
      }
    }
    result.push({ key: `pin-${selected.id}`, x: selected.x, y: selected.y, items: [selected] });
  }
  return result;
}

function mergeCloseGroups(groups, radius) {
  const list = groups.map((group) => ({ x: group.x, y: group.y, sumX: group.sumX, sumY: group.sumY, items: group.items }));
  for (let pass = 0; pass < 8; pass += 1) {
    let joined = false;
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        if (Math.hypot(list[a].x - list[b].x, list[a].y - list[b].y) >= radius) continue;
        const keep = list[a], gone = list.splice(b, 1)[0];
        keep.items = keep.items.concat(gone.items);
        keep.sumX += gone.sumX; keep.sumY += gone.sumY;
        keep.x = keep.sumX / keep.items.length; keep.y = keep.sumY / keep.items.length;
        joined = true;
        b = a; // look again from this group, whose middle just moved
      }
    }
    if (!joined) break;
  }
  return list;
}

/**
 * The map image squares needed to cover a map of this size. Between two zoom levels
 * (while two fingers zoom) the nearest level's pictures are drawn larger or smaller;
 * `size` is each square's width and height on screen.
 */
export function visibleTiles(view, size) {
  const zoom = clampZoom(view.zoom);
  const scale = 2 ** (clamp(Number(view.zoom) || zoom, MIN_ZOOM, MAX_ZOOM) - zoom);
  const step = TILE * scale;
  const center = project(view.center, zoom);
  const left = center.x * scale - size.width / 2, top = center.y * scale - size.height / 2;
  const count = 2 ** zoom;
  const tiles = [];
  for (let ty = Math.floor(top / step); ty <= Math.floor((top + size.height) / step); ty += 1) {
    if (ty < 0 || ty >= count) continue;
    const y0 = Math.round(ty * step - top), y1 = Math.round((ty + 1) * step - top);
    for (let tx = Math.floor(left / step); tx <= Math.floor((left + size.width) / step); tx += 1) {
      const x0 = Math.round(tx * step - left), x1 = Math.round((tx + 1) * step - left);
      tiles.push({ key: `${zoom}/${tx}/${ty}`, z: zoom, x: ((tx % count) + count) % count, y: ty, left: x0, top: y0, size: x1 - x0, height: y1 - y0 });
    }
  }
  return tiles;
}

/** The number on a group pin: short enough for the circle. */
export function groupLabel(count = 0) {
  return count >= 1000 ? `${Math.floor(count / 1000)}k+` : String(count);
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
  // The letter on the pin is the chain's (Nov 27 2026): "Redmill Target" is a T, like
  // every other Target, not an R.
  const chain = /^(store|unknown)$/i.test(retailer) ? "" : retailer;
  const initialOf = (text) => text.replace(/^the\s+/i, "").charAt(0).toUpperCase() || "S";
  if (listed) {
    const title = listed[2].split("/")[0].trim() || retailer || raw;
    return { title, place: listed[1].trim(), initial: initialOf(chain || title) };
  }
  const title = raw || retailer || "Store";
  return { title, place: "", initial: initialOf(chain || title) };
}
