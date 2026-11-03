import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import * as espree from "espree";
import { normalizeImportedStore } from "../src/utils/storeImportUtils.js";
import { DEFAULT_VIRGINIA_REGION, VIRGINIA_STORE_STATE } from "../src/data/storeGroups.js";
import { defaultStoreRegionForState, storeRegionsForState, storeStateForRegion } from "../src/data/storeStates.js";

const scoutSource = readFileSync(new URL("../src/pages/Scout.jsx", import.meta.url), "utf8");
const ast = espree.parse(scoutSource, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
let submitMissingStore;
let missingStoreFormRegion;
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && node.id?.name === "submitMissingStoreForReview") submitMissingStore = node;
  if (node.type === "FunctionDeclaration" && node.id?.name === "missingStoreFormRegion") missingStoreFormRegion = node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.type) visit(value);
  }
}
visit(ast);
assert.ok(submitMissingStore, "The public missing-store form handler must exist");
assert.ok(missingStoreFormRegion, "The missing-store form keeps its region within the chosen state");
const virginiaRegions = new Set(storeRegionsForState("VA"));

for (const fixture of [
  { state: "North Carolina", code: "NC", city: "Raleigh", region: storeRegionsForState("NC")[0] },
  { state: "Maryland", code: "MD", city: "Baltimore", region: storeRegionsForState("MD")[0] },
  { state: "District of Columbia", code: "DC", city: "Washington", region: storeRegionsForState("DC")[0] },
]) {
  test(`public missing-store review preserves ${fixture.state} instead of relabeling it Virginia`, () => {
    let submitted;
    const notices = [];
    const context = vm.createContext({
      missingStoreForm: { name: "Synthetic family card shop", retailer: "Local Card Shop", address: "1 Test Street", city: fixture.city, state: fixture.state, region: fixture.region, zip: "00000", notes: "Synthetic review fixture" },
      normalizeImportedStore,
      VIRGINIA_STORE_STATE,
      DEFAULT_VIRGINIA_REGION,
      defaultStoreRegionForState,
      storeRegionsForState,
      storeStateForRegion,
      homeStateName: VIRGINIA_STORE_STATE,
      homeRegion: DEFAULT_VIRGINIA_REGION,
      makeScoutId: () => "synthetic-store-review",
      SUGGESTION_TYPES: { ADD_MISSING_STORE: "add_missing_store" },
      submitSharedDataSuggestion: (payload) => { submitted = payload; return { id: "synthetic-review" }; },
      setError: (value) => notices.push(value),
      setMissingStoreForm: () => {},
      setMissingStoreModalOpen: () => {},
    });
    vm.runInContext(scoutSource.slice(...missingStoreFormRegion.range), context);
    vm.runInContext(scoutSource.slice(...submitMissingStore.range), context);
    context.submitMissingStoreForReview({ preventDefault() {} });
    assert.equal(submitted.targetTable, "stores");
    assert.equal(submitted.suggestionType, "add_missing_store");
    assert.equal(submitted.submittedData.state, fixture.state);
    assert.equal(submitted.submittedData.stateCode, fixture.code);
    assert.equal(submitted.submittedData.region, fixture.region);
    assert.equal(submitted.submittedData.active, false, "A regional suggestion must still await review");
    assert.match(notices.at(-1), /will not appear publicly until approved/);
  });

  test(`${fixture.code} aliases, code-only rows, and empty regions retain their real area`, () => {
    for (const state of [fixture.code, fixture.code.toLowerCase(), fixture.state]) {
      const normalized = normalizeImportedStore({ name: "Synthetic shop", state, city: "Richmond" });
      assert.equal(normalized.state, fixture.state);
      assert.equal(normalized.stateCode, fixture.code);
      assert.ok(!virginiaRegions.has(normalized.region), "A shared city name must not infer a Virginia region");
      assert.equal(storeStateForRegion(normalized.region), fixture.code, "The region belongs to the row's own state");
    }
    const codeOnly = normalizeImportedStore({ name: "Synthetic shop", state_code: fixture.code });
    assert.equal(codeOnly.state, fixture.state);
    assert.equal(codeOnly.stateCode, fixture.code);
  });
}

test("Virginia region inference and absent-state defaults retain existing behavior", () => {
  const normalized = normalizeImportedStore({ name: "Synthetic shop", state: "VA", city: "Virginia Beach" });
  assert.equal(normalized.state, "Virginia");
  assert.equal(normalized.stateCode, "VA");
  assert.equal(normalized.region, DEFAULT_VIRGINIA_REGION);
  assert.equal(normalizeImportedStore({ name: "Synthetic shop" }).region, "Other Virginia");
});

test("other explicit areas and supplied codes survive without a fabricated Virginia code", () => {
  const withCode = normalizeImportedStore({ name: "Synthetic shop", state: "New York", stateCode: "NY", region: "Capital District" });
  assert.equal(withCode.state, "New York");
  assert.equal(withCode.stateCode, "NY");
  assert.equal(withCode.region, "Capital District");
  const withoutCode = normalizeImportedStore({ name: "Synthetic shop", state: "West Virginia", region: "Eastern Panhandle" });
  assert.equal(withoutCode.state, "West Virginia");
  assert.equal(withoutCode.stateCode, "");
  assert.equal(withoutCode.region, "Eastern Panhandle");
});
