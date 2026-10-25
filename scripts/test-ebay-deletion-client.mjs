import assert from "node:assert/strict";
import { test } from "node:test";
import { createFlipScoutRepository } from "../src/features/flipScout/storageRepository.js";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";

function fixture() {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const state = createEmptyFlipScoutState("2026-10-24T00:00:00Z");
  state.deals = [{ id: "business-id", providerId: "ebay", sellerName: "SyntheticSeller", description: "Personal", purchasePrice: 42, status: "Purchased" }];
  storage.setItem(FLIP_SCOUT_STORAGE_KEY, JSON.stringify(state));
  return { storage, repository: createFlipScoutRepository(storage) };
}

test("device reconciliation persists redaction and retains business identity and values", async () => {
  const { repository, storage } = fixture();
  const result = await repository.reconcileEbayPrivacy(async state => {
    delete state.deals[0].sellerName; delete state.deals[0].description;
    state.deals[0].ebayDataDeleted = true;
    return state;
  });
  assert.equal(result.changed, true);
  assert.equal(result.state.deals[0].purchasePrice, 42);
  assert.equal(result.state.deals[0].id, "business-id");
  assert.ok(!storage.getItem(FLIP_SCOUT_STORAGE_KEY).includes("SyntheticSeller"));
  assert.equal((await repository.reconcileEbayPrivacy(async state => state)).changed, false);
});

test("device reconciliation refuses an altered business amount or missing record", async () => {
  const { repository, storage } = fixture();
  const before = storage.getItem(FLIP_SCOUT_STORAGE_KEY);
  await assert.rejects(repository.reconcileEbayPrivacy(async state => { state.deals[0].purchasePrice = 0; return state; }), /protected business values/);
  await assert.rejects(repository.reconcileEbayPrivacy(async state => { state.deals = []; return state; }), /business records/);
  assert.equal(storage.getItem(FLIP_SCOUT_STORAGE_KEY), before);
});

test("offline errors and storage failures remain failures instead of reporting a deletion", async () => {
  const { repository, storage } = fixture();
  await assert.rejects(repository.reconcileEbayPrivacy(async () => { throw new Error("offline"); }), /offline/);
  storage.setItem = () => { throw new Error("storage unavailable"); };
  await assert.rejects(repository.reconcileEbayPrivacy(async state => { delete state.deals[0].sellerName; return state; }), /storage unavailable/);
});
