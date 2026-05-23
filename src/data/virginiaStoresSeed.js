import hamptonRoads from "../../seeds/stores/virginia-hampton-roads.json";
import richmond from "../../seeds/stores/virginia-richmond.json";
import northernVa from "../../seeds/stores/virginia-northern-va.json";
import fredericksburg from "../../seeds/stores/virginia-fredericksburg.json";
import charlottesville from "../../seeds/stores/virginia-charlottesville.json";
import roanoke from "../../seeds/stores/virginia-roanoke.json";
import lynchburg from "../../seeds/stores/virginia-lynchburg.json";
import shenandoah from "../../seeds/stores/virginia-shenandoah.json";
import easternShore from "../../seeds/stores/virginia-eastern-shore.json";
import southside from "../../seeds/stores/virginia-southside.json";
import southwest from "../../seeds/stores/virginia-southwest.json";
import otherVirginia from "../../seeds/stores/virginia-other.json";
import generatedVirginiaStoresUrl from "./generated/virginiaStores.json?url";
import { dedupeStoresByChainAddress, normalizeImportedStoreBatch } from "../utils/storeImportUtils";
import { DEFAULT_VIRGINIA_REGION, VIRGINIA_STORE_STATE } from "./storeGroups";

export const VIRGINIA_STORE_SEED_BATCHES = [
  { ...hamptonRoads, region: DEFAULT_VIRGINIA_REGION, source: "local-seed-hampton-roads" },
  { ...richmond, source: "local-seed-richmond" },
  { ...northernVa, source: "local-seed-northern-virginia" },
  { ...fredericksburg, region: "Fredericksburg", source: "local-seed-fredericksburg" },
  { ...charlottesville, region: "Charlottesville / Albemarle", source: "local-seed-charlottesville" },
  { ...roanoke, region: "Roanoke / Southwest Virginia", source: "local-seed-roanoke" },
  { ...lynchburg, region: "Lynchburg", source: "local-seed-lynchburg" },
  { ...shenandoah, region: "Shenandoah Valley", source: "local-seed-shenandoah" },
  { ...easternShore, region: "Eastern Shore", source: "local-seed-eastern-shore" },
  { ...southside, region: "Southside Virginia", source: "local-seed-southside" },
  { ...southwest, region: "Roanoke / Southwest Virginia", source: "local-seed-southwest" },
  { ...otherVirginia, region: "Other Virginia", source: "local-seed-other-virginia" },
];

const LOCAL_VIRGINIA_STORES = VIRGINIA_STORE_SEED_BATCHES.flatMap((batch) =>
  normalizeImportedStoreBatch(batch.stores || [], {
    region: batch.region,
    state: batch.state || VIRGINIA_STORE_STATE,
    source: batch.source || "local-seed",
    sourceUrl: batch.sourceUrl || "",
  })
);

const LOCAL_VIRGINIA_STORES_SEED = dedupeStoresByChainAddress(LOCAL_VIRGINIA_STORES);
let generatedVirginiaStoresPromise = null;

async function loadGeneratedVirginiaStores() {
  if (!generatedVirginiaStoresPromise) {
    generatedVirginiaStoresPromise = fetch(generatedVirginiaStoresUrl, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load Virginia store directory: ${response.status}`);
        return response.json();
      })
      .then((rows) => (Array.isArray(rows) ? rows : []));
  }
  return generatedVirginiaStoresPromise;
}

function normalizeGeneratedVirginiaStores(rows = []) {
  return normalizeImportedStoreBatch(rows, {
  region: "Virginia statewide",
  state: VIRGINIA_STORE_STATE,
  source: "openstreetmap-overpass-cache",
  });
}

export async function loadVirginiaStoresSeed() {
  if (typeof fetch !== "function") return LOCAL_VIRGINIA_STORES_SEED;
  try {
    const generatedStores = normalizeGeneratedVirginiaStores(await loadGeneratedVirginiaStores());
    return dedupeStoresByChainAddress([
      ...LOCAL_VIRGINIA_STORES,
      ...generatedStores,
    ]);
  } catch (error) {
    console.warn("Could not load generated Virginia store directory. Using local store seeds only.", error);
    return LOCAL_VIRGINIA_STORES_SEED;
  }
}

export const VIRGINIA_STORES_SEED = LOCAL_VIRGINIA_STORES_SEED;

export const VIRGINIA_STORE_SEED_STATUS = [
  ...VIRGINIA_STORE_SEED_BATCHES.map((batch) => ({
  region: batch.region,
  source: batch.source,
  count: (batch.stores || []).length,
  instructions: batch.instructions || "Add only stable public store rows. Do not invent addresses or restock information.",
  })),
  {
    region: "Virginia statewide",
    source: "openstreetmap-overpass-cache",
    count: "On demand",
    instructions: "Cached directory matches only. Scout restock confidence still comes from user reports and history.",
  },
];

export async function loadVirginiaStoreSeedStatus() {
  if (typeof fetch !== "function") return VIRGINIA_STORE_SEED_STATUS;
  try {
    const generatedRows = await loadGeneratedVirginiaStores();
    return VIRGINIA_STORE_SEED_STATUS.map((status) =>
      status.source === "openstreetmap-overpass-cache"
        ? { ...status, count: generatedRows.length }
        : status
    );
  } catch {
    return VIRGINIA_STORE_SEED_STATUS;
  }
}
