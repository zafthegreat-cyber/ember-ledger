// Builds the per-state Restocks store directory files in src/data/generated
// from OpenStreetMap (Overpass) plus any hand-curated seeds in seeds/stores.
//
//   node --use-system-ca scripts/import-state-stores.cjs --state=MD
//   node --use-system-ca scripts/import-state-stores.cjs --state=VA,MD,DC,NC
//   node --use-system-ca scripts/import-state-stores.cjs --all --dry-run
//
// States and regions come from src/data/storeStates.js. A state whose
// Overpass request fails keeps its existing generated file.
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { syncStateStores } = require("./sync-catalog-prices-stores.cjs");

const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "src", "data", "generated");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS || 240_000);
const PAUSE_BETWEEN_STATES_MS = 5_000;

function requestedStateCodes(allCodes) {
  if (args.includes("--all")) return allCodes;
  const values = args
    .filter((arg) => arg.startsWith("--state="))
    .flatMap((arg) => arg.slice("--state=".length).split(","))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return values.length ? values : ["VA"];
}

async function main() {
  const {
    STORE_DIRECTORY_STATES,
    getStoreDirectoryState,
    inferStoreRegionForState,
  } = await import(pathToFileURL(path.join(rootDir, "src", "data", "storeStates.js")).href);

  const codes = requestedStateCodes(STORE_DIRECTORY_STATES.map((state) => state.code));
  if (codes.some(code => !getStoreDirectoryState(code))) throw new Error("Every requested state must be a valid US state or DC.");
  const results = [];
  for (const [index, code] of codes.entries()) {
    const state = getStoreDirectoryState(code);
    if (!state) throw new Error(`${code} is not a store directory state. Add it to src/data/storeStates.js first.`);
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_STATES_MS));

    console.log(`${state.code}: requesting OpenStreetMap stores...`);
    const synced = await syncStateStores(state.name, { timeoutMs: OVERPASS_TIMEOUT_MS });
    if (synced.overpassError) {
      console.error(`${state.code}: Overpass failed, keeping ${state.file}: ${synced.overpassError}`);
      results.push({ state: state.code, file: state.file, written: false, error: synced.overpassError });
      continue;
    }

    const stores = synced.stores.map((store) => ({
      ...store,
      state: state.code,
      region: inferStoreRegionForState(store, state.code),
    }));
    const regionCounts = stores.reduce((counts, store) => ({ ...counts, [store.region]: (counts[store.region] || 0) + 1 }), {});
    if (!dryRun) {
      await fs.writeFile(path.join(generatedDir, state.file), `${JSON.stringify(stores, null, 2)}\n`);
    }
    console.log(`${state.code}: ${stores.length} stores (${synced.importedFromOverpass} from Overpass)${dryRun ? ", dry run" : ` -> ${state.file}`}`);
    results.push({ state: state.code, file: state.file, written: !dryRun, stores: stores.length, fromOverpass: synced.importedFromOverpass, regionCounts });
  }

  if (!dryRun) {
    const { prepareStoreDirectory } = await import("./prepare-store-directory.mjs");
    await prepareStoreDirectory({ root: rootDir });
  }

  console.log(JSON.stringify({ ok: results.every((row) => !row.error), dryRun, results }, null, 2));
  if (results.some((row) => row.error)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
