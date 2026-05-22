import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const app = read("src/App.jsx");
const catalogSeed = read("src/data/pokemonProductCatalog.js");
const pkg = JSON.parse(read("package.json"));

assert.match(app, /const catalogSeedWarmNeeded = Boolean/);
assert.match(app, /const storeSeedWarmNeeded = Boolean/);
assert.match(app, /loadLocalCatalogSeed\(catalogSeedUrgent \? "active catalog flow" : "deferred catalog flow"\)/);
assert.match(app, /loadVirginiaStoreSeed\("store directory route"\)/);
assert.doesNotMatch(app, /requestIdleCallback\(loadLocalCatalogSeed,\s*\{\s*timeout:\s*1500\s*\}/);
assert.doesNotMatch(app, /requestIdleCallback\(loadVirginiaStoreSeed,\s*\{\s*timeout:\s*1800\s*\}/);

assert.match(catalogSeed, /generated\/sealedProducts\.json\?url/);
assert.match(catalogSeed, /export async function loadPokemonProductCatalog/);
assert.match(catalogSeed, /fetch\(importedSealedProductsUrl/);
assert.doesNotMatch(catalogSeed, /import importedSealedProducts from "\.\/generated\/sealedProducts\.json"/);

assert.match(app, /const emberAssistContext = useMemo/);
assert.match(app, /const emberAssistStarterPrompts = useMemo/);
assert.match(app, /const emberAssistOwnMessages = useMemo/);

assert.equal(pkg.scripts?.["test:performance-routing"], "node --no-warnings scripts/test-performance-routing.mjs");

console.log("Performance routing tests passed.");
