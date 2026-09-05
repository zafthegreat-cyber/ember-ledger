import assert from "node:assert/strict";
import {
  canonicalLocationForPath,
  canonicalPathForPath,
  pathFromActiveTab,
  routeStateFromPath,
} from "../src/utils/appRouteState.js";
import {
  AUTHORITY_REQUIREMENTS,
  resolveRouteOwnership,
  ROUTE_CLASSIFICATIONS,
  WORKSPACE_IDS,
} from "../src/config/workspaceRegistry.js";

const redirects = new Map([
  ["/scout/flip-scout", "/find/deals"],
  ["/inventory", "/business/inventory"],
  ["/sell", "/business/sales"],
  ["/sales", "/business/sales"],
  ["/purchases", "/business/purchases"],
  ["/integrations", "/owner-center/controls/connections"],
  ["/assistant", "/settings/help"],
  ["/spark", "/kids-community"],
  ["/kids-program", "/kids-community"],
  ["/parent-center", "/kids-community/parent"],
  ["/tidepool", "/kids-community/community"],
  ["/membership", "/settings/plans"],
  ["/help", "/settings/help"],
  ["/data-backup", "/owner-center/controls/data-backup"],
  ["/backup", "/owner-center/controls/data-backup"],
  ["/settings/data-backup", "/owner-center/controls/data-backup"],
]);

for (const [legacy, canonical] of redirects) {
  assert.equal(canonicalPathForPath(legacy), canonical, `${legacy} should resolve to ${canonical}`);
}

assert.equal(
  canonicalLocationForPath("/scout/flip-scout", "?view=ebay&rule=rare", "#results"),
  "/find/deals?view=ebay&rule=rare#results",
  "compatibility redirects retain query parameters and fragments",
);

assert.deepEqual(routeStateFromPath("/find/deal-analysis"), { activeTab: "flipScout", flipScoutView: "appraise" });
assert.deepEqual(routeStateFromPath("/business/money/mileage"), { activeTab: "businessWorkspace", businessWorkspaceView: "money", businessMoneyView: "mileage" });
assert.deepEqual(routeStateFromPath("/settings/plans"), { activeTab: "membership" });
assert.deepEqual(routeStateFromPath("/settings/data-backup"), { activeTab: "ownerCenter", ownerCenterSection: "controls", ownerCenterSubview: "data-backup" });

for (const distinctRoute of ["/scout/stores/store-1", "/vault/cards", "/forge/reports", "/exchange/forge", "/admin"]) {
  assert.equal(canonicalPathForPath(distinctRoute), distinctRoute, `${distinctRoute} remains available until its workflow is migrated`);
}

const workspaceHomes = new Map([
  ["/collect", WORKSPACE_IDS.COLLECT],
  ["/find/home", WORKSPACE_IDS.FIND],
  ["/sell/home", WORKSPACE_IDS.SELL],
  ["/bot", WORKSPACE_IDS.BOT],
]);

for (const [route, workspace] of workspaceHomes) {
  assert.deepEqual(routeStateFromPath(route), {
    activeTab: "workspaceHome",
    productWorkspaceHome: workspace,
    ...(workspace === WORKSPACE_IDS.BOT ? { botOpsSection: "overview" } : {}),
  });
  assert.equal(pathFromActiveTab("workspaceHome", { productWorkspaceHome: workspace }), route);
}

assert.deepEqual(routeStateFromPath("/bot/tasks"), { activeTab: "workspaceHome", productWorkspaceHome: WORKSPACE_IDS.BOT, botOpsSection: "tasks" }, "Implemented Bot routes must preserve section context");
assert.equal(pathFromActiveTab("workspaceHome", { productWorkspaceHome: WORKSPACE_IDS.BOT, botOpsSection: "tasks" }), "/bot/tasks");
assert.deepEqual(routeStateFromPath("/bot/unknown"), { activeTab: "dashboard" }, "Unknown Bot routes must not silently open Bot Operations");
assert.equal(canonicalPathForPath("/find"), "/find", "The established Find deal route remains canonical");
assert.equal(resolveRouteOwnership("/find")?.workspace, WORKSPACE_IDS.FIND);
assert.equal(resolveRouteOwnership("/sell")?.classification, ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT);
assert.equal(resolveRouteOwnership("/sell")?.redirectTo, "/business/sales");
assert.equal(resolveRouteOwnership("/account-ops")?.workspace, WORKSPACE_IDS.BUSINESS);
assert.equal(resolveRouteOwnership("/account-ops")?.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER);
for (const accountOpsSection of ["connections", "inbox", "orders"]) {
  const route = `/account-ops/${accountOpsSection}`;
  assert.deepEqual(routeStateFromPath(route), { activeTab: "accountOps", accountOpsSection }, `${route} should restore the protected Account Ops section`);
  assert.equal(pathFromActiveTab("accountOps", { accountOpsSection }), route, `${route} should serialize without a compatibility redirect`);
}
assert.equal(resolveRouteOwnership("/owner-center")?.classification, ROUTE_CLASSIFICATIONS.OWNER);
assert.equal(resolveRouteOwnership("/owner-center")?.workspace, null, "Owner Center stays outside product workspaces");

console.log(`Legacy compatibility checks passed: ${redirects.size + 33}`);
