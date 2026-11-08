import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { parse } from "espree";
import { validateLaunchConfig } from "./check-launch-config.mjs";
import { storeDirectoryManifest, prepareStoreDirectory } from "./prepare-store-directory.mjs";
import { US_STATES } from "../src/data/usStates.js";
import { createStockScreenshotPatch } from "../src/utils/stockScreenshotDraft.mjs";
const { syncStateStores } = createRequire(import.meta.url)("./sync-catalog-prices-stores.cjs");
const publicConfig = { VITE_SUPABASE_URL: "https://gxsfququorfczvhrkudl.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_synthetic_test_value" };

test("screenshot review accepts a manual store in every state without inventing a directory ID or stock confirmation", () => {
  const now = new Date(2026, 10, 8, 12).getTime();
  const choices = { platform: "discord", reportDate: "2026-11-08", reportTime: "10:00", observedTimeConfirmed: true, reportType: "no_stock", productName: "Pokemon booster packs", productCategory: "Pokemon TCG", storeId: "" };
  for (const state of US_STATES) {
    const result = createStockScreenshotPatch({}, { ...choices, manualStore: { name: "Synthetic manual shop", city: "Richmond", state: state.code } }, { stores: [], now });
    assert.equal(result.ok, true, state.code);
    assert.equal(result.patch.storeId, "");
    assert.equal(result.patch.state, state.code);
    assert.equal(result.patch.city, "Richmond");
    assert.equal(result.patch.visibility, "private_from_map");
    assert.equal(result.patch.storeConfirmed, false);
    assert.equal(result.patch.verified, false);
    assert.equal(result.patch.sourceType, "text_screenshot");
    assert.equal(result.patch.marketPrice, undefined);
  }
  for (const manualStore of [{ name: "", city: "Austin", state: "TX" }, { name: "Shop", city: "", state: "TX" }, { name: "Shop", city: "Austin", state: "ZZ" }]) assert.equal(createStockScreenshotPatch({}, { ...choices, manualStore }, { now }).ok, false);
  const draft = Object.freeze({ storeId: "original", state: "VA", city: "Norfolk", storeName: "Keep this shop", manualLocation: "", marketPrice: 81.05 });
  const options = { stores: [{ id: "original", name: "Keep this shop", state: "VA", city: "Norfolk" }], now };
  const selected = { ...choices, manualStore: { name: "New shop", city: "Austin", state: "TX" } };
  const kept = createStockScreenshotPatch(draft, selected, options);
  assert.ok(kept.ok); assert.equal(kept.patch.storeId, undefined);
  const replaced = createStockScreenshotPatch(draft, { ...selected, replaceEnteredFields: true }, options);
  assert.ok(replaced.ok); assert.equal(replaced.patch.storeId, ""); assert.equal(replaced.patch.state, "TX");
  assert.equal(draft.marketPrice, 81.05);
});

test("release configuration accepts public app config and rejects missing accounts, other origins, secrets and QA bypasses", () => {
  assert.equal(validateLaunchConfig(publicConfig).testBypassesDisabled, true);
  for (const change of [{ VITE_SUPABASE_URL: "" }, { VITE_SUPABASE_URL: "http://gxsfququorfczvhrkudl.supabase.co" }, { VITE_SUPABASE_URL: "https://other.supabase.co" }, { VITE_SUPABASE_ANON_KEY: "sb_secret_never-print" }, { VITE_SUPABASE_ANON_KEY: "" }, { VITE_SUPABASE_SERVICE_ROLE_KEY: "never-print" }, { VITE_API_BASE_URL: "http://localhost:3000" }, { VITE_BETA_LOCAL_MODE: "true" }, { VITE_CODE3_LOCAL_AUTH_ENABLED: "true" }, { VITE_QA_UNLOCK_PAID_FEATURES: "true" }]) assert.throws(() => validateLaunchConfig({ ...publicConfig, ...change }));
  const jwt = role => `x.${Buffer.from(JSON.stringify({ role, ref: "gxsfququorfczvhrkudl" })).toString("base64url")}.x`;
  assert.equal(validateLaunchConfig({ ...publicConfig, VITE_SUPABASE_ANON_KEY: jwt("anon") }).publicCredentialsOnly, true);
  assert.throws(() => validateLaunchConfig({ ...publicConfig, VITE_SUPABASE_ANON_KEY: jwt("service_role") }));
});

test("production and non-loopback previews cannot activate the actual App QA unlock expression", async () => {
  const source = await readFile("src/App.jsx", "utf8");
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
  const declaration = ast.body.flatMap(n => n.declarations || []).find(n => n.id?.name === "QA_UNLOCK_PAID_FEATURES");
  assert.ok(declaration);
  const expression = source.slice(...declaration.init.range).replaceAll("import.meta.env", "env");
  const evaluate = new Function("env", "runtimeParams", "isLocalDevelopmentIdentityEnabled", `return ${expression};`);
  for (const development of [true, false]) for (const loopback of [true, false]) {
    const enabled = evaluate({ DEV: development, VITE_QA_UNLOCK_PAID_FEATURES: "true" }, new URLSearchParams("qaUnlockPaid=true"), () => development && loopback);
    assert.equal(Boolean(enabled), development && loopback);
  }
});

test("every national importer query uses the exact US state code, never a name prefix", async () => {
  for (const state of US_STATES) {
    let request;
    const result = await syncStateStores(state.name, { fetcher: async (_url, options) => {
      request = options.body.get("data");
      return { elements: [{ type: "node", id: 101, lat: 40, lon: -90, tags: { name: "Target", brand: "Target", "addr:city": "Synthetic City", "addr:state": state.code } }] };
    } });
    assert.ok(request.includes(`US-${state.code}`), state.name);
    assert.equal(result.importedFromOverpass, 1);
    assert.equal(result.overpassError, "");
  }
});

test("failed, incomplete and empty importer responses retain cached-data fallback and cannot masquerade as coverage", async () => {
  for (const data of [{}, { elements: [] }, { elements: [], remark: "runtime error" }]) {
    const result = await syncStateStores("New York", { fetcher: async () => data });
    assert.ok(result.overpassError);
    assert.equal(result.importedFromOverpass, 0);
  }
  await assert.rejects(() => syncStateStores("Not a US state", { fetcher: () => { throw new Error("Must not fetch"); } }));
});

test("bundled directory coverage matches real files and hashes without changing prices or data", async () => {
  const manifest = await storeDirectoryManifest();
  assert.ok(manifest.directories.VA.count > 0);
  assert.equal(Boolean(manifest.directories.CA), (await readdir("src/data/generated")).includes("californiaStores.json"), "Unimported states must not claim a populated directory");
  for (const entry of Object.values(manifest.directories)) assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(await prepareStoreDirectory({ check: true }), manifest);
});

test("release directory checks accept equivalent Windows and Linux checkouts without rewriting data", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "code3-directory-eol-"));
  const text = `${JSON.stringify([{ id: "synthetic-dc", name: "Synthetic shop", state: "DC" }], null, 2)}\n`;
  const manifests = [];
  for (const style of ["lf", "crlf"]) {
    const checkout = resolve(root, style);
    await mkdir(resolve(checkout, "src/data/generated"), { recursive: true });
    const bytes = Buffer.from(style === "crlf" ? text.replaceAll("\n", "\r\n") : text);
    const source = resolve(checkout, "src/data/generated/dcStores.json");
    await writeFile(source, bytes);
    const manifest = await storeDirectoryManifest(checkout);
    manifests.push(manifest);
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(resolve(checkout, "src/data/storeDirectoryCoverage.json"), style === "crlf" ? json.replaceAll("\n", "\r\n") : json);
    assert.deepEqual(await prepareStoreDirectory({ root: checkout, check: true }), manifest);
    assert.deepEqual(await readFile(source), bytes);
  }
  assert.deepEqual(manifests[0], manifests[1]);
});
