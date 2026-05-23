import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const app = read("src/App.jsx");
const catalogSeed = read("src/data/pokemonProductCatalog.js");
const storeSeed = read("src/data/virginiaStoresSeed.js");
const pkg = JSON.parse(read("package.json"));

assert.match(app, /const catalogSeedWarmNeeded = Boolean/);
assert.match(app, /const catalogWorkflowWarmNeeded = Boolean/);
assert.match(app, /const catalogRouteWarmNeeded = Boolean/);
assert.match(app, /const catalogQueryWarmNeeded = Boolean/);
assert.match(app, /activeTab === "market" &&\s*\(\s*submittedCatalogSearch/);
assert.match(app, /const storeSeedWarmNeeded = Boolean/);
assert.match(app, /loadLocalCatalogSeed\(catalogSeedUrgent \? "active catalog flow" : "deferred catalog flow"\)/);
assert.match(app, /loadVirginiaStoreSeed\("store directory route"\)/);
assert.doesNotMatch(app, /requestIdleCallback\(loadLocalCatalogSeed,\s*\{\s*timeout:\s*1500\s*\}/);
assert.doesNotMatch(app, /requestIdleCallback\(loadVirginiaStoreSeed,\s*\{\s*timeout:\s*1800\s*\}/);
assert.match(app, /from "\.\/services\/pokemonCatalogSearchCore"/);
assert.match(app, /import\("\.\/services\/pokemonCatalogSearch"\)/);
assert.match(app, /const SmartCatalogSearchBox = lazy\(\(\) => import\("\.\/components\/SmartCatalogSearchBox"\)\)/);
assert.doesNotMatch(app, /import SmartCatalogSearchBox from "\.\/components\/SmartCatalogSearchBox"/);
assert.doesNotMatch(app, /from "\.\/services\/pokemonCatalogSearch"/);
assert.match(app, /from "\.\/data\/pokemonCatalogCoreData"/);
assert.doesNotMatch(app, /from "\.\/data\/sharedPokemonCatalog"/);
assert.doesNotMatch(app, /from "\.\/data\/generated\/releaseCalendar\.json"/);
assert.doesNotMatch(app, /from "\.\/data\/generated\/dropCalendarSeed\.json"/);
assert.doesNotMatch(app, /from "\.\/data\/generated\/retailerDropEvents\.json"/);
assert.doesNotMatch(app, /from "\.\/data\/generated\/calendarSyncStatus\.json"/);
assert.doesNotMatch(app, /from "\.\/data\/scoutRestockIntelSeed"/);
assert.match(app, /function loadCalendarDataOnDemand\(\)/);
assert.match(app, /import\("\.\/data\/generated\/releaseCalendar\.json"\)/);
assert.match(app, /function loadScoutRestockIntelOnDemand\(\)/);
assert.match(app, /import\("\.\/data\/scoutRestockIntelSeed"\)/);
assert.match(app, /from "\.\/utils\/emberAssistLite"/);
assert.match(app, /import\("\.\/utils\/emberAssist"\)/);
assert.doesNotMatch(app, /from "\.\/utils\/emberAssist"/);

assert.match(catalogSeed, /generated\/sealedProducts\.json\?url/);
assert.match(catalogSeed, /export async function loadPokemonProductCatalog/);
assert.match(catalogSeed, /fetch\(importedSealedProductsUrl/);
assert.doesNotMatch(catalogSeed, /import importedSealedProducts from "\.\/generated\/sealedProducts\.json"/);
assert.doesNotMatch(catalogSeed, /from "\.\/productAliases"/);

assert.match(storeSeed, /generated\/virginiaStores\.json\?url/);
assert.match(storeSeed, /export async function loadVirginiaStoresSeed/);
assert.match(storeSeed, /fetch\(generatedVirginiaStoresUrl/);
assert.doesNotMatch(storeSeed, /import generatedVirginiaStores from "\.\/generated\/virginiaStores\.json"/);

assert.match(app, /const emberAssistContext = useMemo/);
assert.match(app, /const emberAssistStarterPrompts = useMemo/);
assert.match(app, /const emberAssistOwnMessages = useMemo/);
assert.match(app, /const workspaceItems = useMemo/);
assert.match(app, /const forgeInventoryBuckets = useMemo/);
assert.match(app, /const catalogOptionSummary = useMemo/);
assert.match(app, /const tideTradrCatalogRawResults = useMemo/);
assert.match(app, /const scoutForecastPreviewRows = useMemo/);
assert.match(app, /const tidepoolPostsWithCounts = useMemo/);
assert.match(app, /const vaultSetCompletionRows = useMemo/);

assert.equal(pkg.scripts?.["test:performance-routing"], "node --no-warnings scripts/test-performance-routing.mjs");

console.log("Performance routing tests passed.");
