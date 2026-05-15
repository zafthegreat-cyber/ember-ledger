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
import { normalizeImportedStoreBatch } from "../utils/storeImportUtils";
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

export const VIRGINIA_STORES_SEED = VIRGINIA_STORE_SEED_BATCHES.flatMap((batch) =>
  normalizeImportedStoreBatch(batch.stores || [], {
    region: batch.region,
    state: batch.state || VIRGINIA_STORE_STATE,
    source: batch.source || "local-seed",
    sourceUrl: batch.sourceUrl || "",
  })
);

export const VIRGINIA_STORE_SEED_STATUS = VIRGINIA_STORE_SEED_BATCHES.map((batch) => ({
  region: batch.region,
  source: batch.source,
  count: (batch.stores || []).length,
  instructions: batch.instructions || "Add only stable public store rows. Do not invent addresses or restock information.",
}));
