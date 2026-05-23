import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const app = read("src/App.jsx");
const smartSearch = read("src/components/SmartCatalogSearchBox.jsx");
const catalogSearchUtils = read("src/utils/catalogSearchUtils.js");
const pkg = JSON.parse(read("package.json"));

assert.match(app, /useDeferredValue/);
assert.match(app, /const deferredAppSearchQuery = useDeferredValue\(appSearchQuery\)/);
assert.match(app, /const deferredVaultSearch = useDeferredValue\(vaultSearch\)/);
assert.match(app, /const deferredInventorySearch = useDeferredValue\(inventorySearch\)/);
assert.match(app, /const deferredImportCatalogSearch = useDeferredValue\(importCatalogSearch\)/);
assert.match(app, /const filteredItems = useMemo/);
assert.match(app, /deferredInventorySearch\.toLowerCase\(\)/);
assert.match(app, /searchVaultItems\(filterVaultItems\(vaultItems, vaultFilter\), deferredVaultSearch\)/);

assert.match(smartSearch, /useDeferredValue/);
assert.match(smartSearch, /const deferredValue = useDeferredValue\(value\)/);
assert.match(smartSearch, /query: deferredValue/);
assert.match(smartSearch, /}, 180\)/);
assert.doesNotMatch(smartSearch, /buildLocalSuggestions\(nextValue\)/);

assert.match(catalogSearchUtils, /const queryExpansionCache = new Map\(\)/);
assert.match(catalogSearchUtils, /const catalogIndexCache = new WeakMap\(\)/);
assert.match(catalogSearchUtils, /function buildCatalogSearchIndex/);
assert.match(catalogSearchUtils, /function buildCatalogQueryMeta/);
assert.match(catalogSearchUtils, /function indexedItemMayMatch/);
assert.match(catalogSearchUtils, /\.filter\(\(indexed\) => indexedItemMayMatch\(queryMeta, indexed\)\)/);

assert.equal(pkg.scripts?.["test:search-performance"], "node --no-warnings scripts/test-search-performance.mjs");

console.log("Search performance guardrails passed.");
