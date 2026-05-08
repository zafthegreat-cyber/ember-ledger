import hamptonRoads from "../../seeds/stores/virginia-hampton-roads.json";
import richmond from "../../seeds/stores/virginia-richmond.json";
import northernVa from "../../seeds/stores/virginia-northern-va.json";
import fredericksburg from "../../seeds/stores/virginia-fredericksburg.json";
import charlottesville from "../../seeds/stores/virginia-charlottesville.json";
import roanoke from "../../seeds/stores/virginia-roanoke.json";
import lynchburg from "../../seeds/stores/virginia-lynchburg.json";
import shenandoah from "../../seeds/stores/virginia-shenandoah.json";
import southwest from "../../seeds/stores/virginia-southwest.json";
import { normalizeImportedStoreBatch } from "../utils/storeImportUtils";

export const VIRGINIA_STORE_SEED_BATCHES = [
  { ...hamptonRoads, region: "Hampton Roads", source: "local-seed-hampton-roads" },
  { ...richmond, source: "local-seed-richmond" },
  { ...northernVa, source: "local-seed-northern-virginia" },
  { ...fredericksburg, region: "Northern Virginia", source: "local-seed-fredericksburg" },
  { ...charlottesville, region: "Charlottesville / Central West", source: "local-seed-charlottesville" },
  { ...roanoke, region: "Roanoke / Southwest Virginia", source: "local-seed-roanoke" },
  { ...lynchburg, region: "Southside Virginia", source: "local-seed-lynchburg" },
  { ...shenandoah, region: "Shenandoah Valley", source: "local-seed-shenandoah" },
  { ...southwest, region: "Roanoke / Southwest Virginia", source: "local-seed-southwest" },
];

export const VIRGINIA_STORES_SEED = VIRGINIA_STORE_SEED_BATCHES.flatMap((batch) =>
  normalizeImportedStoreBatch(batch.stores || [], {
    region: batch.region,
    state: batch.state || "VA",
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
