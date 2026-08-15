import assert from "node:assert/strict";
import { canonicalLocationForPath, canonicalPathForPath, routeStateFromPath } from "../src/utils/appRouteState.js";

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

for (const distinctRoute of ["/scout/stores/store-1", "/vault/cards", "/forge/reports", "/exchange/forge", "/admin"]) {
  assert.equal(canonicalPathForPath(distinctRoute), distinctRoute, `${distinctRoute} remains available until its workflow is migrated`);
}

console.log(`Legacy compatibility checks passed: ${redirects.size + 4}`);
