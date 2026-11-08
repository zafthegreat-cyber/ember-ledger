import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { parse } from "espree";
import { build } from "esbuild";
import { US_STATES } from "../src/data/usStates.js";
import { STORE_DIRECTORY_STATES, detectStoreStateFromText, normalizeStoreStateCode, storeStateFromZip, storeRegionsForState } from "../src/data/storeStates.js";
import { normalizeImportedStore, dedupeStoresByChainAddress } from "../src/utils/storeImportUtils.js";
import { normalizeStoreAreaFields, matchesRegionalAreaFilters } from "../src/utils/regionalBrowsingUtils.js";
import { isOpenAccessState } from "../src/utils/onboardingGuidance.js";
import { encodeScoutReportCloudNotes, decodeScoutReportCloudNotes, mergeScoutReportCloudSave } from "../src/utils/scoutReportCloudContext.mjs";
import { prepareRestockFeedEntries, restockFeedLocationOptions } from "../src/utils/restockFeedPresentation.mjs";

test("exactly 50 states and DC are available, with no duplicate state or region keys", () => {
  assert.equal(US_STATES.length, 51);
  assert.equal(new Set(US_STATES.map(s => s.code)).size, 51);
  assert.equal(STORE_DIRECTORY_STATES.length, 51);
  const regions = STORE_DIRECTORY_STATES.flatMap(s => storeRegionsForState(s.code));
  assert.equal(new Set(regions).size, regions.length);
});

for (const state of US_STATES) {
  test(`${state.code}: selection, signup, store normalization and area filtering agree`, () => {
    for (const value of [state.name, state.code, state.code.toLowerCase()]) {
      assert.equal(normalizeStoreStateCode(value), state.code);
      assert.equal(isOpenAccessState(value), true);
      const input = { id: `fixture-${state.code}`, name: "Synthetic shop", city: "Richmond", state: value, notes: "Keep original notes" };
      const original = structuredClone(input);
      const store = normalizeImportedStore(input);
      assert.deepEqual(input, original, "Normalization must not mutate a saved record");
      assert.equal(store.id, input.id);
      assert.equal(store.notes, input.notes);
      assert.equal(store.state, state.name);
      assert.equal(store.stateCode, state.code);
      const area = normalizeStoreAreaFields(store);
      assert.equal(area.state, state.name, "A same-named city must not override the explicit state");
      assert.equal(matchesRegionalAreaFilters(area, { state: state.name }), true);
      assert.equal(matchesRegionalAreaFilters(area, { state: state.code === "VA" ? "California" : "Virginia" }), false);
    }
  });
}

test("ZIP-based state suggestions cover every state, preserve leading zeros and ZIP+4", () => {
  const examples = { AL:"35203", AK:"99501", AZ:"85001", AR:"72201", CA:"90210", CO:"80202", CT:"06103", DE:"19801", DC:"20001", FL:"33101", GA:"30303", HI:"96813", ID:"83702", IL:"60601", IN:"46204", IA:"50309", KS:"66603", KY:"40202", LA:"70112", ME:"04101", MD:"21201", MA:"02108", MI:"48201", MN:"55401", MS:"39201", MO:"63101", MT:"59601", NE:"68102", NV:"89101", NH:"03301", NJ:"07102", NM:"87501", NY:"10001", NC:"27601", ND:"58501", OH:"43215", OK:"73102", OR:"97201", PA:"19103", RI:"02903", SC:"29201", SD:"57501", TN:"37201", TX:"75201", UT:"84101", VT:"05602", VA:"23451", WA:"98101", WV:"25301", WI:"53703", WY:"82001" };
  assert.equal(Object.keys(examples).length, 51);
  for (const [code, zip] of Object.entries(examples)) {
    assert.equal(storeStateFromZip(zip), code, zip);
    assert.equal(storeStateFromZip(`${zip}-1234`), code, zip);
    assert.equal(detectStoreStateFromText(zip), code, zip);
  }
  for (const [zip, code] of Object.entries({ "06390":"NY", "73949":"TX", "71233":"MS", "49936":"WI", "20799":"DC", "96799":"" })) assert.equal(storeStateFromZip(zip), code);
  for (const invalid of ["", "00000", "1234", "123456", "00901", "34001", "96201", "96910"]) assert.equal(storeStateFromZip(invalid), "", invalid);
});

test("explicit states take priority over shared city names and mismatched ZIP hints", () => {
  for (const [text, code] of [["Richmond, CA", "CA"], ["Portland, OR 97201", "OR"], ["Charleston, WV", "WV"], ["West Virginia", "WV"], ["Kansas City, Missouri", "MO"], ["Washington, DC", "DC"], ["Washington", "WA"], ["Richmond, CA 23451", "CA"]]) assert.equal(detectStoreStateFromText(text), code, text);
  assert.equal(detectStoreStateFromText("unrecognized area"), "");
  assert.equal(normalizeStoreAreaFields({ state: "CA", city: "Richmond", region: "Hampton Roads / 757" }).state, "California");
  assert.equal(normalizeStoreAreaFields({ state: "WV", city: "Charleston", region: "Eastern Panhandle" }).region, "Eastern Panhandle");
  assert.equal(normalizeImportedStore({ state: "NY", region: "Capital District" }).region, "Capital District");
});

test("deduplication keeps distinct same-address stores across states and cities", () => {
  const row = { name: "Synthetic shop", chain: "Target", address: "1 Main Street", zip: "", city: "Richmond" };
  const stores = [{ ...row, id: "ca", state: "CA" }, { ...row, id: "va", state: "VA" }, { ...row, id: "ca2", city: "Other City", state: "CA" }];
  assert.equal(dedupeStoresByChainAddress(stores).length, 3);
  assert.equal(dedupeStoresByChainAddress([...stores, stores[0]]).length, 3);
});

test("manual reports with same-named cities in different states stay distinct in feed filters", () => {
  const entries = prepareRestockFeedEntries([{ id: "ca", city: "Richmond", state: "CA" }, { id: "va", city: "Richmond", state: "VA" }]);
  assert.equal(restockFeedLocationOptions(entries).cities.length, 2);
  assert.deepEqual(entries.map(e => e.cityLabel).sort(), ["Richmond, California", "Richmond, Virginia"]);
});

test("nationwide manual location survives the deployed notes format and account-envelope merge", () => {
  for (const state of US_STATES) {
    const report = Object.freeze({ id: `fixture-${state.code}`, state: state.code, city: "Richmond", region: "Local area", notes: "Keep my exact notes", reportStatus: "no_stock", visibility: "private_from_map", verified: false, price: 81.05, observedAt: "2026-10-01T12:00:00Z" });
    const encoded = encodeScoutReportCloudNotes(report);
    const decoded = decodeScoutReportCloudNotes(encoded);
    assert.equal(decoded.notes, report.notes);
    assert.deepEqual(decoded.storeLocation, { state: state.code, city: report.city, region: report.region });
    assert.equal(decoded.reportStatus, "no_stock");
    assert.equal(decoded.verified, undefined, "Location context never supplies moderation authority");
    assert.equal(encodeScoutReportCloudNotes({ ...report, notes: encoded }), encoded, "Repeated saves do not duplicate the context");
    const merged = mergeScoutReportCloudSave(report, { id: "server-id", city: "", state: "", region: "", visibility: "private_from_map", verified: false });
    assert.equal(merged.state, state.code, "Older cloud rows cannot erase an existing state");
    assert.equal(merged.city, "Richmond");
    assert.equal(merged.id, "server-id");
    assert.equal(report.price, 81.05);
    assert.equal(report.observedAt, "2026-10-01T12:00:00Z");
  }
  for (const context of [{ state: "XX" }, { state: "CA", city: "a".repeat(81) }, { state: "CA", verified: true }, { state: "CA", user_id: "another-user" }]) {
    assert.equal(decodeScoutReportCloudNotes(`Notes\n\n[Code 3 report context v1:${JSON.stringify(context)}]`).storeLocation, undefined);
  }
});

test("states without bundled stores load empty without fetching an undefined URL or Virginia fallback", async () => {
  const result = await build({ entryPoints: ["src/data/storeDirectory.js"], bundle: true, platform: "node", format: "esm", write: false, outdir: "out", logLevel: "silent" });
  const code = result.outputFiles.find(file => file.path.endsWith(".js")).text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = () => { fetched++; throw new Error("Unexpected fetch"); };
  try {
    for (const state of US_STATES.filter(s => !["VA", "MD", "NC", "DC"].includes(s.code))) assert.deepEqual(await module.loadStoreDirectory(state.code), []);
    assert.deepEqual(await module.loadStoreDirectory("invalid"), []);
    assert.equal(fetched, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("the live public suggestion handler can submit a reviewed store in every state", async () => {
  const source = await readFile("src/pages/Scout.jsx", "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
  const functions = new Map();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" && ["submitMissingStoreForReview", "missingStoreFormRegion"].includes(node.id?.name)) functions.set(node.id.name, source.slice(...node.range));
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
  visit(ast);
  assert.equal(functions.size, 2);
  for (const state of US_STATES) {
    let submitted;
    const context = vm.createContext({ missingStoreForm: { name: "Synthetic review shop", state: state.name, city: "Richmond", address: "1 Test Street", notes: "Not a real store" }, normalizeImportedStore, homeStateName: "Virginia", homeRegion: "Hampton Roads / 757", storeRegionsForState, storeStateForRegion: code => STORE_DIRECTORY_STATES.find(s => storeRegionsForState(s.code).includes(code))?.code || "", defaultStoreRegionForState: code => STORE_DIRECTORY_STATES.find(s => s.code === normalizeStoreStateCode(code))?.defaultRegion || "", makeScoutId: () => `fixture-${state.code}`, SUGGESTION_TYPES: { ADD_MISSING_STORE: "add_missing_store" }, submitSharedDataSuggestion: value => { submitted = value; return { id: "fixture" }; }, setError() {}, setMissingStoreForm() {}, setMissingStoreModalOpen() {} });
    for (const code of functions.values()) vm.runInContext(code, context);
    context.submitMissingStoreForReview({ preventDefault() {} });
    assert.equal(submitted.submittedData.stateCode, state.code);
    assert.equal(submitted.submittedData.active, false, "State expansion must not bypass review");
    assert.equal(submitted.submittedData.id, `fixture-${state.code}`);
  }
});

test("the actual calendar area handler includes matching states and excludes other local states", async () => {
  const source = await readFile("src/App.jsx", "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
  let handler;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" && node.id?.name === "watchCalendarAreaMatches") handler = source.slice(...node.range);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
  visit(ast);
  assert.ok(handler);
  const areas = US_STATES.map(s => ({ value: s.code === "VA" ? "all_virginia" : `all_${s.code.toLowerCase()}`, cities: [] }));
  for (const state of US_STATES) {
    const context = vm.createContext({ storeDirectoryState: state.code, watchCalendarArea: "all_virginia", WATCH_CALENDAR_AREAS: areas, normalizeStoreStateCode, detectStoreStateFromText });
    vm.runInContext(handler, context);
    assert.equal(context.watchCalendarAreaMatches({ locationType: "store", state: state.code, city: "Richmond" }), true);
    assert.equal(context.watchCalendarAreaMatches({ locationType: "store", state: state.code === "VA" ? "CA" : "VA", city: "Richmond" }), false);
    assert.equal(context.watchCalendarAreaMatches({ locationType: "online" }), true);
  }
});
