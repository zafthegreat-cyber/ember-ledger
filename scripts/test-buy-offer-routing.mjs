import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_ROUTE_STORAGE_KEY,
  canonicalLocationForPath,
  loadInitialRouteState,
  pathFromActiveTab,
  routeStateFromPath,
} from "../src/utils/appRouteState.js";
import {
  AUTHORITY_REQUIREMENTS,
  ROUTE_CLASSIFICATIONS,
  WORKSPACE_IDS,
  resolveRouteOwnership,
  resolveWorkspaceContext,
} from "../src/config/workspaceRegistry.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(root, process.env.QA_OUTPUT_DIR || "artifacts/qa/buy-offer/routing");
const results = [];
function check(name, run) {
  try {
    run();
    results.push({ name, status: "passed" });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

check("Buy Offer deep link and state roundtrip", () => {
  const state = routeStateFromPath("/find/buy-offer");
  assert.deepEqual(state, { activeTab: "flipScout", flipScoutView: "buy-offer" });
  assert.equal(pathFromActiveTab(state.activeTab, state), "/find/buy-offer");
  assert.deepEqual(routeStateFromPath("/find/buy-offer/"), state);
});

check("Buy Offer retains the existing Find workspace classification", () => {
  const route = resolveRouteOwnership("/find/buy-offer");
  assert.equal(route.workspace, WORKSPACE_IDS.FIND);
  assert.equal(route.classification, ROUTE_CLASSIFICATIONS.FIND);
  assert.equal(route.requiredAuthority, AUTHORITY_REQUIREMENTS.NONE);
  const context = resolveWorkspaceContext("/find/buy-offer", { rememberedWorkspace: WORKSPACE_IDS.BUSINESS });
  assert.equal(context.activeWorkspace, WORKSPACE_IDS.FIND);
  assert.equal(context.accessDenied, false);
});

check("Direct load overrides a stale saved route without changing saved state", () => {
  const savedState = JSON.stringify({ activeTab: "workspaceHome", flipScoutView: "appraise", productWorkspaceHome: WORKSPACE_IDS.COLLECT });
  let reads = 0;
  const state = loadInitialRouteState({
    location: { pathname: "/find/buy-offer", search: "?betaLocalMode=true" },
    localStorage: { getItem(key) { assert.equal(key, APP_ROUTE_STORAGE_KEY); reads += 1; return savedState; } },
  });
  assert.equal(reads, 1);
  assert.equal(state.activeTab, "flipScout");
  assert.equal(state.flipScoutView, "buy-offer");
  assert.equal(state.productWorkspaceHome, WORKSPACE_IDS.COLLECT);
});

check("Buy Offer canonicalization preserves query and fragment", () => {
  assert.equal(canonicalLocationForPath("/find/buy-offer", "?betaLocalMode=true", "#result"), "/find/buy-offer?betaLocalMode=true#result");
});

const existingFindRoutes = [
  ["deals", "/find/deals", ["/find", "/find/deal-feed", "/scout/flip-scout"]],
  ["restocks", "/find/restocks", []],
  ["auctions", "/find/auctions", []],
  ["rules", "/find/saved-searches", ["/find/rules"]],
  ["ebay", "/find/ebay", ["/find/ebay-search"]],
  ["appraise", "/find/deal-analysis", ["/find/analyze"]],
  ["sources", "/find/sources", ["/find/integrations"]],
];
for (const [view, canonical, aliases] of existingFindRoutes) {
  check(`Existing ${view} route and aliases remain compatible`, () => {
    const expected = { activeTab: "flipScout", flipScoutView: view };
    for (const location of [canonical, ...aliases]) assert.deepEqual(routeStateFromPath(location), expected, location);
    assert.equal(pathFromActiveTab("flipScout", expected), canonical);
  });
}

check("Back and Forward route sequence retains distinct tool destinations", () => {
  const sequence = ["/find/home", "/find/buy-offer", "/find/deals", "/find/buy-offer", "/find/home", "/find/buy-offer"];
  assert.deepEqual(sequence.map((location) => {
    const state = routeStateFromPath(location);
    return pathFromActiveTab(state.activeTab, state);
  }), sequence);
});

check("Protected workspaces keep their existing owner requirement", () => {
  for (const location of ["/account-ops", "/owner-center/controls/data-backup", "/business/purchases", "/bot/tasks"]) {
    assert.equal(resolveRouteOwnership(location).requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER, location);
    assert.equal(resolveWorkspaceContext(location, { ownerAuthorized: false }).accessDenied, true, location);
  }
});

check("Unknown Find routes retain the established Deals fallback", () => {
  assert.deepEqual(routeStateFromPath("/find/not-a-tool"), { activeTab: "flipScout", flipScoutView: "deals" });
  assert.equal(pathFromActiveTab("flipScout", { flipScoutView: "not-a-tool" }), "/find/deals");
});

await mkdir(output, { recursive: true });
const report = { checkedAt: new Date().toISOString(), scope: "Pure route and workspace resolution; browser navigation is verified separately.", passed: results.filter((row) => row.status === "passed").length, failed: results.filter((row) => row.status === "failed").length, results };
await writeFile(path.join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
if (report.failed) process.exitCode = 1;
