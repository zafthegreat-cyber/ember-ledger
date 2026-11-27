// Restock map maths (src/features/restocks/slippyMap.mjs), Nov 25 2026.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { busiestPoints, clampZoom, clusterPins, fitView, focusPoints, fromScreen, groupLabel, MAX_ZOOM, milesBetween, MIN_ZOOM, onScreen, panBy, project, storeMapLabel, toScreen, unproject, visibleTiles, zoomAt, zoomForRadius, zoomTo } from "../src/features/restocks/slippyMap.mjs";

const size = { width: 320, height: 360 };
const fredericksburg = { lat: 38.3032, lng: -77.4605 };
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

test("places turn into map pixels and back", () => {
  const world = project(fredericksburg, 12);
  const back = unproject(world, 12);
  assert.ok(near(back.lat, fredericksburg.lat) && near(back.lng, fredericksburg.lng));
  assert.deepEqual(project({ lat: 0, lng: 0 }, 0), { x: 128, y: 128 });
  const view = { center: fredericksburg, zoom: 12 };
  const middle = toScreen(fredericksburg, view, size);
  assert.ok(near(middle.x, 160) && near(middle.y, 180), "The centre of the view is the middle of the map");
  const corner = fromScreen({ x: 0, y: 0 }, view, size);
  assert.ok(corner.lat > fredericksburg.lat && corner.lng < fredericksburg.lng, "Top-left is north-west");
});

test("dragging moves the map freely, any distance", () => {
  const view = { center: fredericksburg, zoom: 12 };
  const dragged = panBy(view, 600, -400);
  const where = toScreen(fredericksburg, dragged, size);
  assert.ok(near(where.x, 160 + 600, 1e-4) && near(where.y, 180 - 400, 1e-4), "The place moves with the finger, well past the old 52 px limit");
  assert.equal(dragged.zoom, 12);
});

test("zooming keeps the place under the fingers where it is", () => {
  const view = { center: fredericksburg, zoom: 10 };
  const anchor = { x: 40, y: 300 };
  const place = fromScreen(anchor, view, size);
  const closer = zoomAt(view, 2, size, anchor);
  assert.equal(closer.zoom, 12);
  const after = toScreen(place, closer, size);
  assert.ok(near(after.x, anchor.x, 1e-3) && near(after.y, anchor.y, 1e-3));
  assert.equal(zoomAt({ center: fredericksburg, zoom: MAX_ZOOM }, 1, size).zoom, MAX_ZOOM);
  assert.equal(zoomAt({ center: fredericksburg, zoom: MIN_ZOOM }, -1, size).zoom, MIN_ZOOM);
  assert.equal(clampZoom(99), MAX_ZOOM);
  assert.equal(clampZoom("x"), MIN_ZOOM);
});

test("the opening view fits the stores, not the whole state", () => {
  const town = [fredericksburg, { lat: 38.29, lng: -77.51 }, { lat: 38.33, lng: -77.49 }, { lat: 38.25, lng: -77.5 }];
  const fitted = fitView(town, size);
  assert.ok(fitted.zoom >= 11, `Stores a few miles apart open close in (zoom ${fitted.zoom})`);
  for (const point of town) assert.ok(onScreen(toScreen(point, fitted, size), size), "Every store is on the map");
  assert.equal(fitView([fredericksburg], size).zoom, 13);
  assert.equal(fitView([], size).zoom, MIN_ZOOM);
  // One store two hours away no longer zooms everything out.
  const withOutlier = [...town, { lat: 37.54, lng: -77.44 }];
  assert.equal(focusPoints(withOutlier).length, 4);
  assert.ok(fitView(focusPoints(withOutlier), size).zoom >= 11);
  assert.ok(fitView(withOutlier, size).zoom <= 9, "Fitting every store is the far-out view the old map opened on");
  assert.equal(focusPoints([fredericksburg, { lat: 37.54, lng: -77.44 }]).length, 2, "Two stores are both shown");
  assert.ok(milesBetween(fredericksburg, { lat: 37.54, lng: -77.44 }) > 45);
  assert.deepEqual([5, 10, 25, 50, 100].map(zoomForRadius), [12, 11, 10, 9, 8]);
});

test("pins that would overlap become one group; the chosen store stands alone", () => {
  const pins = [
    { id: "a", x: 100, y: 100 }, { id: "b", x: 110, y: 104 }, { id: "c", x: 96, y: 120 },
    { id: "d", x: 250, y: 300 },
  ];
  const groups = clusterPins(pins);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["a", "b", "c"]);
  assert.ok(groups[0].x > 96 && groups[0].x < 110, "A group sits in the middle of its stores");
  assert.equal(groups[1].items[0].id, "d");
  const chosen = clusterPins(pins, { selectedId: "b" });
  assert.equal(chosen.at(-1).key, "pin-b", "The chosen store is drawn last, on top");
  assert.deepEqual(chosen[0].items.map((item) => item.id), ["a", "c"]);
  assert.ok(Math.hypot(chosen[0].x - 110, chosen[0].y - 104) >= 45.9, "Stores under the chosen pin are nudged out so they can be tapped");
  const stacked = clusterPins([{ id: "a", x: 50, y: 50 }, { id: "b", x: 50, y: 50 }], { selectedId: "a" });
  assert.deepEqual([stacked[0].x, stacked[0].y], [96, 50], "Two stores on the very same spot sit side by side");
  assert.equal(clusterPins([]).length, 0);
  // Zoomed in far enough, the same stores are apart.
  assert.equal(clusterPins(pins.map((pin) => ({ ...pin, x: pin.x * 6, y: pin.y * 6 }))).length, 4);
});

test("map pictures cover the whole view wherever it is dragged", () => {
  const view = { center: fredericksburg, zoom: 12 };
  const tiles = visibleTiles(view, size);
  assert.ok(tiles.length >= 4 && tiles.length <= 9);
  assert.ok(Math.min(...tiles.map((tile) => tile.left)) <= 0 && Math.max(...tiles.map((tile) => tile.left + 256)) >= size.width);
  assert.ok(Math.min(...tiles.map((tile) => tile.top)) <= 0 && Math.max(...tiles.map((tile) => tile.top + 256)) >= size.height);
  const moved = visibleTiles(panBy(view, 3000, 0), size);
  assert.notDeepEqual(moved.map((tile) => tile.key), tiles.map((tile) => tile.key), "Dragging far loads new pictures");
  assert.ok(visibleTiles({ center: { lat: 0, lng: 179.9 }, zoom: 4 }, size).every((tile) => tile.x >= 0 && tile.x < 16), "Wraps around the date line");
});

// Nov 27 2026 ("improve the map").
test("two fingers zoom smoothly: any level in between, still keeping the place under them", () => {
  const view = { center: fredericksburg, zoom: 10 };
  const anchor = { x: 60, y: 90 };
  const place = fromScreen(anchor, view, size);
  const between = zoomTo(view, 10.585, size, anchor);
  assert.equal(between.zoom, 10.585);
  const after = toScreen(place, between, size);
  assert.ok(near(after.x, anchor.x, 1e-3) && near(after.y, anchor.y, 1e-3));
  assert.equal(zoomTo(view, 99, size).zoom, MAX_ZOOM);
  assert.equal(zoomTo(view, -3, size).zoom, MIN_ZOOM);
  assert.equal(zoomAt(between, 1, size).zoom, 12, "A button press from in between goes to a whole level");
  // Between levels the nearest level's pictures are drawn larger, still covering the map with no gaps.
  const tiles = visibleTiles(between, size);
  assert.ok(tiles.every((tile) => tile.z === 11 && tile.size >= 191 && tile.size <= 193), "Level 11 pictures, about 192 px each at 10.585");
  assert.ok(Math.min(...tiles.map((tile) => tile.left)) <= 0 && Math.max(...tiles.map((tile) => tile.left + tile.size)) >= size.width);
  assert.ok(Math.min(...tiles.map((tile) => tile.top)) <= 0 && Math.max(...tiles.map((tile) => tile.top + tile.height)) >= size.height);
  const row = tiles.filter((tile) => tile.top === tiles[0].top).sort((a, b) => a.left - b.left);
  for (let index = 1; index < row.length; index += 1) assert.equal(row[index].left, row[index - 1].left + row[index - 1].size, "Neighbouring pictures meet exactly");
  assert.ok(visibleTiles(view, size).every((tile) => tile.size === 256), "At a whole level, pictures are their own size");
});

test("with nothing reported or followed, the map opens on the busiest town", () => {
  const richmond = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, lat: 37.54 + (i % 6) * 0.01, lng: -77.44 + Math.floor(i / 6) * 0.01 }));
  const roanoke = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, lat: 37.27 + i * 0.005, lng: -79.94 }));
  const lone = [{ id: "far", lat: 36.6, lng: -82.2 }];
  // Sorted by name, a far-away store can come first; the opening must not follow it.
  const picked = busiestPoints([...lone, ...roanoke, ...richmond], { miles: 6 });
  assert.equal(picked.length, 30);
  assert.ok(picked.every((point) => point.id.startsWith("r")), "Only the busy town's stores are in the opening view");
  assert.ok(fitView(picked, size).zoom >= 11, "and it opens close enough to tell stores apart");
  assert.equal(busiestPoints([fredericksburg, { lat: 37.54, lng: -77.44 }]).length, 2, "Two stores are both shown");
  assert.equal(busiestPoints([]).length, 0);
});

test("a whole state on the map: groups never overlap, and it stays quick", () => {
  // 2,500 stores scattered over a map 1,000 px wide, the size of a state's directory.
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pins = Array.from({ length: 2500 }, (_, i) => ({ id: `s${i}`, x: random() * 1000, y: random() * 450 }));
  const started = performance.now();
  const groups = clusterPins(pins, { selectedId: "s5" });
  const took = performance.now() - started;
  assert.ok(took < 250, `Grouping 2,500 stores is quick (${Math.round(took)} ms)`);
  assert.equal(groups.reduce((sum, group) => sum + group.items.length, 0), 2500, "Every store is in exactly one pin or group");
  const free = groups.filter((group) => group.key !== "pin-s5");
  for (let a = 0; a < free.length; a += 1) for (let b = a + 1; b < free.length; b += 1) {
    assert.ok(Math.hypot(free[a].x - free[b].x, free[a].y - free[b].y) >= 45.9, "No two groups sit on each other");
  }
  assert.deepEqual([groupLabel(7), groupLabel(999), groupLabel(1000), groupLabel(2480)], ["7", "999", "1k+", "2k+"], "Big numbers fit the circle");
});

test("store names read like a person would say them", () => {
  assert.deepEqual(storeMapLabel({ name: "180 - Trade St. / Central Park Blvd. (Target)", retailer: "Target" }), { title: "Target", place: "Trade St. / Central Park Blvd.", initial: "T" });
  assert.equal(storeMapLabel({ name: "413 - Stafford Complex Ctr. (Walmart / Auto Zone)" }).title, "Walmart");
  assert.deepEqual(storeMapLabel({ name: "Arcanas Video Games" }), { title: "Arcanas Video Games", place: "", initial: "A" });
  assert.equal(storeMapLabel({ name: "The Card Shop" }).initial, "C");
  assert.equal(storeMapLabel({}).title, "Store");
  // The pin's letter is the chain's: every Target is a T (it was "R" for Redmill Target).
  assert.deepEqual(storeMapLabel({ name: "Redmill Target", retailer: "Target" }), { title: "Redmill Target", place: "", initial: "T" });
  assert.equal(storeMapLabel({ name: "Corner Cards", retailer: "Store" }).initial, "C", "A placeholder chain name is not used");
});

test("wiring: the restock page uses the draggable map and keeps the safety rules", () => {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const card = read("src/features/restocks/RestockMapCard.jsx");
  assert.match(card, /RestockSlippyMap/);
  assert.doesNotMatch(card, /ScoutTileMap\b(?!\.jsx)/, "The fixed picture-map is no longer used here");
  assert.match(card, /buildRestockMapRows\(/, "Still only the latest public report per store");
  assert.doesNotMatch(card, /quantity/i, "No stock quantities");
  const map = read("src/features/restocks/RestockSlippyMap.jsx");
  assert.match(map, /aria-label="Zoom in"/);
  assert.match(map, /aria-label="Show stores near me"/);
  assert.match(map, /© OpenStreetMap/);
  const css = read("src/features/restocks/restock-map-card.css");
  assert.match(css, /touch-action: none/, "One finger drags the map instead of the page");
  assert.doesNotMatch(css, /\b(blue|teal|cyan)\b|#0[0-9a-f]{2}[89a-f][0-9a-f]{2}\b/i, "No blue or teal");
});
