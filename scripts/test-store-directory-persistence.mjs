import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clearDirectoryStoreRegistry,
  compactSavedStores,
  isUnchangedDirectoryStore,
  registerDirectoryStores,
} from "../src/utils/storeDirectoryPersistence.js";

const walmart = { id: "osm-1", name: "Walmart Supercenter", city: "Suffolk", state: "Virginia", favorite: false };
const target = { id: "osm-2", name: "Target", city: "Norfolk", state: "Virginia", favorite: false };

test("nothing is dropped before a directory loads", () => {
  clearDirectoryStoreRegistry();
  assert.deepEqual(compactSavedStores([walmart, target]), [walmart, target]);
});

test("unchanged directory rows are left out of saved data; edited and added stores stay", () => {
  clearDirectoryStoreRegistry();
  registerDirectoryStores([walmart, target]);
  const favorited = { ...walmart, favorite: true };
  const added = { id: "store-mine", name: "My card shop", city: "Suffolk", state: "Virginia" };
  assert.deepEqual(compactSavedStores([walmart, favorited, target, added]), [favorited, added]);
  assert.equal(isUnchangedDirectoryStore(target), true);
  assert.equal(isUnchangedDirectoryStore({ ...target, status: "In stock" }), false);
});

test("a store registered in two shapes matches either one", () => {
  clearDirectoryStoreRegistry();
  const normalized = { ...walmart, stateCode: "VA", region: "Hampton Roads / 757" };
  registerDirectoryStores([walmart]);
  registerDirectoryStores([normalized]);
  assert.deepEqual(compactSavedStores([walmart, normalized]), []);
});

test("a full directory no longer fits the old way but compacts to almost nothing", () => {
  clearDirectoryStoreRegistry();
  const directory = Array.from({ length: 2300 }, (_, index) => ({ id: `osm-${index}`, name: `Store ${index}`, notes: "x".repeat(2000) }));
  registerDirectoryStores(directory);
  assert.ok(JSON.stringify(directory).length > 4_500_000, "the directory alone is near the browser's storage limit");
  const saved = compactSavedStores([...directory, { ...directory[5], favorite: true }]);
  assert.equal(saved.length, 1);
  assert.ok(JSON.stringify(saved).length < 5_000);
});

test("every Restocks save goes through the compaction", () => {
  const scout = readFileSync(new URL("../src/pages/Scout.jsx", import.meta.url), "utf8");
  assert.match(scout, /stores: compactSavedStores\(savedStores\)/, "first-visit save leaves directory rows out");
  assert.match(scout, /if \(merged\.stores\) merged\.stores = compactSavedStores\(merged\.stores\);/, "saveLocalScout compacts");
  assert.match(scout, /compactSavedStores\(saved\.stores\)\.length < saved\.stores\.length/, "existing oversized saves shrink on load");
  assert.doesNotMatch(scout, /\(saved\.stores \|\| stores\)\.map/, "report saves start from the full list, not the compacted save");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /stores: compactSavedStores\(nextStores\)/, "favorite-store save compacts");
});
