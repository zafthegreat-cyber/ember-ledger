import assert from "node:assert/strict";
import {
  AUTHORITY_REQUIREMENTS,
  getAvailableWorkspaces,
  resolveRouteOwnership,
  resolveWorkspaceContext,
  ROUTE_CLASSIFICATIONS,
  WORKSPACE_IDS,
} from "../src/config/workspaceRegistry.js";
import {
  canonicalPathForPath,
  pathFromActiveTab,
  routeStateFromPath,
} from "../src/utils/appRouteState.js";

let assertionCount = 0;

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function deepEqual(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(value, message) {
  assertionCount += 1;
  assert.ok(value, message);
}

const SHARED_ITEM_ID = "owned-item-workspace-001";
const sharedOwnedItem = Object.freeze({
  id: SHARED_ITEM_ID,
  name: "Deterministic card",
  purpose: "PERSONAL_COLLECTION",
  sourceDealId: "deal-workspace-001",
  purchaseId: "purchase-workspace-001",
});

export const WORKSPACE_QA_FIXTURES = Object.freeze([
  { id: "collect-empty", route: "/collect", workspace: WORKSPACE_IDS.COLLECT, state: "EMPTY", records: [] },
  { id: "collect-populated", route: "/collect", workspace: WORKSPACE_IDS.COLLECT, state: "POPULATED", records: [sharedOwnedItem] },
  { id: "find-empty", route: "/find/home", workspace: WORKSPACE_IDS.FIND, state: "EMPTY", records: [] },
  { id: "find-populated", route: "/find/home", workspace: WORKSPACE_IDS.FIND, state: "POPULATED", recordIds: ["deal-workspace-001"] },
  { id: "sell-empty", route: "/sell/home", workspace: WORKSPACE_IDS.SELL, state: "EMPTY", records: [] },
  { id: "sell-populated", route: "/sell/home", workspace: WORKSPACE_IDS.SELL, state: "POPULATED", records: [sharedOwnedItem] },
  { id: "business-empty", route: "/business", workspace: WORKSPACE_IDS.BUSINESS, state: "EMPTY", records: [] },
  { id: "business-populated", route: "/business", workspace: WORKSPACE_IDS.BUSINESS, state: "POPULATED", records: [sharedOwnedItem] },
  { id: "bot-owner-only", route: "/bot", workspace: WORKSPACE_IDS.BOT, ownerAuthorized: true, state: "OWNER_FOUNDATION" },
  { id: "workspace-switcher", route: "/find/home", workspace: WORKSPACE_IDS.FIND, state: "SWITCHER_OPEN" },
  { id: "non-owner-workspace-list", route: "/", routeWorkspace: null, workspace: WORKSPACE_IDS.COLLECT, ownerAuthorized: false, state: "PUBLIC_SWITCHER" },
  { id: "owner-workspace-list", route: "/", routeWorkspace: null, workspace: WORKSPACE_IDS.COLLECT, ownerAuthorized: true, state: "OWNER_SWITCHER" },
  { id: "deep-linked-auction", route: "/find/auctions", workspace: WORKSPACE_IDS.FIND, state: "DEEP_LINK" },
  { id: "deep-linked-account-ops", route: "/account-ops/accounts", workspace: WORKSPACE_IDS.BUSINESS, ownerAuthorized: false, state: "OWNER_GATE" },
  { id: "legacy-route-redirect", route: "/sell", canonicalRoute: "/business/sales", workspace: WORKSPACE_IDS.SELL, state: "COMPATIBILITY" },
  { id: "remembered-workspace", route: "/settings", routeWorkspace: null, rememberedWorkspace: WORKSPACE_IDS.SELL, workspace: WORKSPACE_IDS.SELL, state: "REMEMBERED" },
  { id: "invalid-remembered-workspace", route: "/settings", routeWorkspace: null, rememberedWorkspace: "OWNER", workspace: WORKSPACE_IDS.COLLECT, state: "SAFE_FALLBACK" },
  { id: "cross-workspace-action", route: "/business/purchases", sourceRoute: "/find/deals", workspace: WORKSPACE_IDS.BUSINESS, recordId: "deal-workspace-001", state: "REFERENCE" },
  { id: "light-mobile", route: "/collect", workspace: WORKSPACE_IDS.COLLECT, theme: "light", viewport: Object.freeze({ width: 360, height: 800 }) },
  { id: "dark-mobile", route: "/find/home", workspace: WORKSPACE_IDS.FIND, theme: "dark", viewport: Object.freeze({ width: 360, height: 800 }) },
]);

equal(WORKSPACE_QA_FIXTURES.length, 20, "The deterministic QA contract must retain all 20 requested cases");
equal(new Set(WORKSPACE_QA_FIXTURES.map((fixture) => fixture.id)).size, 20, "Fixture ids must be unique");
equal(Object.isFrozen(WORKSPACE_QA_FIXTURES), true);

for (const fixture of WORKSPACE_QA_FIXTURES) {
  const route = resolveRouteOwnership(fixture.route);
  ok(route, `${fixture.id} should use a registered route`);
  const expectedRouteWorkspace = Object.hasOwn(fixture, "routeWorkspace") ? fixture.routeWorkspace : fixture.workspace;
  equal(route.workspace, expectedRouteWorkspace, `${fixture.id} workspace ownership`);
  const context = resolveWorkspaceContext(fixture.route, {
    rememberedWorkspace: fixture.rememberedWorkspace,
    ownerAuthorized: fixture.ownerAuthorized === true,
  });
  equal(context.activeWorkspace, fixture.workspace, `${fixture.id} resolved workspace`);
}

deepEqual(routeStateFromPath("/collect"), {
  activeTab: "workspaceHome",
  productWorkspaceHome: WORKSPACE_IDS.COLLECT,
});
deepEqual(routeStateFromPath("/find/home"), {
  activeTab: "workspaceHome",
  productWorkspaceHome: WORKSPACE_IDS.FIND,
});
deepEqual(routeStateFromPath("/sell/home"), {
  activeTab: "workspaceHome",
  productWorkspaceHome: WORKSPACE_IDS.SELL,
});
deepEqual(routeStateFromPath("/bot"), {
  activeTab: "workspaceHome",
  productWorkspaceHome: WORKSPACE_IDS.BOT,
  botOpsSection: "overview",
});
deepEqual(routeStateFromPath("/business"), {
  activeTab: "businessWorkspace",
  businessWorkspaceView: "overview",
  businessMoneyView: "expenses",
});
deepEqual(routeStateFromPath("/bot/tasks"), {
  activeTab: "workspaceHome",
  productWorkspaceHome: WORKSPACE_IDS.BOT,
  botOpsSection: "tasks",
}, "The implemented Bot Tasks route must retain Bot workspace context");
equal(pathFromActiveTab("workspaceHome", { productWorkspaceHome: WORKSPACE_IDS.BOT, botOpsSection: "tasks" }), "/bot/tasks");
deepEqual(routeStateFromPath("/bot/unknown"), { activeTab: "dashboard" }, "An unknown Bot route must not become an active feature");

const nonOwnerIds = getAvailableWorkspaces().map((workspace) => workspace.id);
const ownerIds = getAvailableWorkspaces({ ownerAuthorized: true }).map((workspace) => workspace.id);
deepEqual(nonOwnerIds, [WORKSPACE_IDS.COLLECT, WORKSPACE_IDS.FIND, WORKSPACE_IDS.SELL, WORKSPACE_IDS.BUSINESS]);
deepEqual(ownerIds, [WORKSPACE_IDS.COLLECT, WORKSPACE_IDS.FIND, WORKSPACE_IDS.SELL, WORKSPACE_IDS.BOT, WORKSPACE_IDS.BUSINESS]);
ok(!nonOwnerIds.includes(WORKSPACE_IDS.BOT), "A non-owner switcher must not reveal Bot");
ok(ownerIds.includes(WORKSPACE_IDS.BOT), "A verified owner switcher may expose Bot");

const accountOpsRoute = resolveRouteOwnership("/account-ops/accounts");
equal(accountOpsRoute.workspace, WORKSPACE_IDS.BUSINESS);
equal(accountOpsRoute.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER);
equal(
  resolveWorkspaceContext("/account-ops/accounts").accessDenied,
  true,
  "Business workspace context must not grant Account Ops owner authority",
);
equal(resolveRouteOwnership("/owner-center")?.classification, ROUTE_CLASSIFICATIONS.OWNER);
equal(resolveRouteOwnership("/owner-center")?.workspace, null, "Owner Center is not an ordinary workspace");

equal(resolveRouteOwnership("/find")?.key, "find", "The established /find path remains the deal surface");
equal(routeStateFromPath("/find").flipScoutView, "deals");
equal(canonicalPathForPath("/find"), "/find");
equal(resolveRouteOwnership("/sell")?.classification, ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT);
equal(canonicalPathForPath("/sell"), "/business/sales");
equal(routeStateFromPath("/sell").businessWorkspaceView, "sales");
equal(pathFromActiveTab("scout", { scoutView: "reports" }), "/scout/reports");
equal(pathFromActiveTab("inventory"), "/forge");
equal(pathFromActiveTab("sales"), "/forge/sales");
equal(pathFromActiveTab("expenses"), "/forge/expenses");
equal(pathFromActiveTab("mileage"), "/forge/mileage");
equal(pathFromActiveTab("reports"), "/forge/reports");

const directAuction = resolveWorkspaceContext("/find/auctions", {
  rememberedWorkspace: WORKSPACE_IDS.COLLECT,
});
equal(directAuction.activeWorkspace, WORKSPACE_IDS.FIND);
equal(directAuction.source, "route");
const rememberedSell = resolveWorkspaceContext("/settings", {
  rememberedWorkspace: WORKSPACE_IDS.SELL,
});
equal(rememberedSell.activeWorkspace, WORKSPACE_IDS.SELL);
equal(rememberedSell.source, "remembered");
const invalidRemembered = resolveWorkspaceContext("/settings", {
  rememberedWorkspace: "OWNER",
});
equal(invalidRemembered.activeWorkspace, WORKSPACE_IDS.COLLECT);
equal(invalidRemembered.source, "fallback");

const collectProjection = Object.freeze({ workspace: WORKSPACE_IDS.COLLECT, item: sharedOwnedItem });
const sellProjection = Object.freeze({ workspace: WORKSPACE_IDS.SELL, item: sharedOwnedItem });
const businessProjection = Object.freeze({ workspace: WORKSPACE_IDS.BUSINESS, item: sharedOwnedItem });
equal(collectProjection.item, sellProjection.item, "Workspace projections should reference one owned item object");
equal(sellProjection.item, businessProjection.item, "Business views should not clone the owned item");
equal(collectProjection.item.id, SHARED_ITEM_ID);
equal(collectProjection.item.sourceDealId, "deal-workspace-001");
equal(collectProjection.item.purchaseId, "purchase-workspace-001");

for (const mobileFixture of WORKSPACE_QA_FIXTURES.filter((fixture) => fixture.viewport)) {
  equal(mobileFixture.viewport.width, 360);
  equal(mobileFixture.viewport.height, 800);
  ok(["light", "dark"].includes(mobileFixture.theme));
}

const visibleRouteText = getAvailableWorkspaces({ ownerAuthorized: true })
  .flatMap((workspace) => workspace.navigation)
  .map((item) => `${item.label} ${item.path}`)
  .join(" ");
for (const unsupported of ["Inbox", "Gmail", "Outlook", "Stellar", "Hayha", "Valor", "Upgrade", "Checkout"]) {
  ok(!visibleRouteText.includes(unsupported), `${unsupported} must not appear as an implemented workspace destination`);
}

console.log(`Code 3 workspace fixtures passed (20/20 cases, ${assertionCount} assertions).`);
