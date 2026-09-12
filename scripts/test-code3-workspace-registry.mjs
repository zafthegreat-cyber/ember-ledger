import assert from "node:assert/strict";
import {
  AUTHORITY_REQUIREMENTS,
  ENTITLEMENT_LABELS,
  getAvailableWorkspaces,
  getWorkspaceDefinition,
  getWorkspaceNavigation,
  NAV_PLACEMENTS,
  normalizeWorkspacePath,
  PRODUCT_WORKSPACES,
  resolveRouteOwnership,
  resolveWorkspaceContext,
  ROUTE_CLASSIFICATIONS,
  ROUTE_IMPLEMENTATION_STATES,
  ROUTE_MATCH_TYPES,
  ROUTE_REGISTRY,
  sanitizeWorkspaceId,
  validateWorkspaceRegistry,
  WORKSPACE_DEFINITIONS,
  WORKSPACE_IDS,
} from "../src/config/workspaceRegistry.js";

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

function workspaceFor(path) {
  return resolveRouteOwnership(path)?.workspace || null;
}

function classificationFor(path) {
  return resolveRouteOwnership(path)?.classification || null;
}

function isDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => isDeepFrozen(child, seen));
}

deepEqual(Object.values(WORKSPACE_IDS), ["COLLECT", "FIND", "SELL", "BOT", "BUSINESS"]);
deepEqual(Object.values(ROUTE_CLASSIFICATIONS), [
  "COLLECT",
  "FIND",
  "SELL",
  "BOT",
  "BUSINESS",
  "OWNER",
  "GLOBAL",
  "LEGACY_REDIRECT",
]);
deepEqual(Object.values(AUTHORITY_REQUIREMENTS), ["NONE", "VERIFIED_OWNER"]);
deepEqual(Object.values(ENTITLEMENT_LABELS), ["FREE", "PLUS", "PRO", "BUSINESS", "OWNER"]);

equal(PRODUCT_WORKSPACES.length, 5, "Only five product workspaces belong in the switcher registry");
equal(Object.keys(WORKSPACE_DEFINITIONS).length, 5);
equal(isDeepFrozen(WORKSPACE_DEFINITIONS), true, "Workspace configuration must be recursively immutable");
equal(isDeepFrozen(PRODUCT_WORKSPACES), true, "Product workspace exports must be recursively immutable");
equal(isDeepFrozen(ROUTE_REGISTRY), true, "Route registry exports must be recursively immutable");
equal(getWorkspaceDefinition("find"), WORKSPACE_DEFINITIONS.FIND);
equal(getWorkspaceDefinition(" OWNER "), null, "Owner Center is not a product workspace");
equal(getWorkspaceDefinition("unknown"), null);

const expectedHomes = {
  COLLECT: "/collect",
  FIND: "/find/home",
  SELL: "/sell/home",
  BOT: "/bot",
  BUSINESS: "/business",
};
for (const [workspaceId, homePath] of Object.entries(expectedHomes)) {
  const definition = getWorkspaceDefinition(workspaceId);
  equal(definition.homePath, homePath, `${workspaceId} should use its compatibility-safe home`);
  equal(workspaceFor(homePath), workspaceId, `${homePath} should select ${workspaceId}`);
  ok(
    definition.navigation.some((item) => item.path === homePath && item.placement === NAV_PLACEMENTS.HOME),
    `${workspaceId} should expose its implemented home`,
  );
}

const validation = validateWorkspaceRegistry();
equal(validation.valid, true, validation.errors.join("\n"));
deepEqual(validation.errors, []);
equal(Object.isFrozen(validation), true);
equal(Object.isFrozen(validation.errors), true);

equal(new Set(ROUTE_REGISTRY.map((entry) => entry.key)).size, ROUTE_REGISTRY.length, "Route keys must be unique");
equal(
  new Set(ROUTE_REGISTRY.map((entry) => `${entry.match}:${entry.path}`)).size,
  ROUTE_REGISTRY.length,
  "Route match patterns must be unique",
);
ok(ROUTE_REGISTRY.every((entry) => Object.values(ROUTE_MATCH_TYPES).includes(entry.match)));
ok(ROUTE_REGISTRY.every((entry) => Object.values(ROUTE_IMPLEMENTATION_STATES).includes(entry.implementation)));
ok(ROUTE_REGISTRY.every((entry) => Object.values(ROUTE_CLASSIFICATIONS).includes(entry.classification)));

const representativeMappings = [
  ["/collect", WORKSPACE_IDS.COLLECT, ROUTE_CLASSIFICATIONS.COLLECT],
  ["/collection", WORKSPACE_IDS.COLLECT, ROUTE_CLASSIFICATIONS.COLLECT],
  ["/collection/wishlist", WORKSPACE_IDS.COLLECT, ROUTE_CLASSIFICATIONS.COLLECT],
  ["/find", WORKSPACE_IDS.FIND, ROUTE_CLASSIFICATIONS.FIND],
  ["/find/deals", WORKSPACE_IDS.FIND, ROUTE_CLASSIFICATIONS.FIND],
  ["/find/auctions/lot-12", WORKSPACE_IDS.FIND, ROUTE_CLASSIFICATIONS.FIND],
  ["/find/restocks", WORKSPACE_IDS.FIND, ROUTE_CLASSIFICATIONS.FIND],
  ["/sell/home", WORKSPACE_IDS.SELL, ROUTE_CLASSIFICATIONS.SELL],
  ["/business/inventory", WORKSPACE_IDS.SELL, ROUTE_CLASSIFICATIONS.SELL],
  ["/business/sales/order-12", WORKSPACE_IDS.SELL, ROUTE_CLASSIFICATIONS.SELL],
  ["/business", WORKSPACE_IDS.BUSINESS, ROUTE_CLASSIFICATIONS.BUSINESS],
  ["/business/purchases", WORKSPACE_IDS.BUSINESS, ROUTE_CLASSIFICATIONS.BUSINESS],
  ["/business/money/reports", WORKSPACE_IDS.BUSINESS, ROUTE_CLASSIFICATIONS.BUSINESS],
  ["/account-ops/accounts", WORKSPACE_IDS.BUSINESS, ROUTE_CLASSIFICATIONS.BUSINESS],
  ["/bot", WORKSPACE_IDS.BOT, ROUTE_CLASSIFICATIONS.BOT],
  ["/bot/tasks", WORKSPACE_IDS.BOT, ROUTE_CLASSIFICATIONS.BOT],
  ["/owner-center/controls", null, ROUTE_CLASSIFICATIONS.OWNER],
  ["/settings", null, ROUTE_CLASSIFICATIONS.GLOBAL],
  ["/kids-community", null, ROUTE_CLASSIFICATIONS.GLOBAL],
  ["/", null, ROUTE_CLASSIFICATIONS.GLOBAL],
];
for (const [path, workspace, classification] of representativeMappings) {
  equal(workspaceFor(path), workspace, `${path} workspace`);
  equal(classificationFor(path), classification, `${path} classification`);
}

const findCompatibility = resolveRouteOwnership("/find");
equal(findCompatibility.redirectTo, "", "The established /find deal surface must not become a redirect");
equal(findCompatibility.key, "find");
const sellCompatibility = resolveRouteOwnership("/sell");
equal(sellCompatibility.classification, ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT);
equal(sellCompatibility.redirectTo, "/business/sales", "The established /sell alias must still mean Sales");
equal(workspaceFor("/sell/home"), WORKSPACE_IDS.SELL, "The new Sell home must outrank the exact legacy alias");

const accountOps = resolveRouteOwnership("/account-ops/profiles");
equal(accountOps.workspace, WORKSPACE_IDS.BUSINESS);
equal(accountOps.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER);
const bot = resolveRouteOwnership("/bot");
equal(bot.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER);
equal(resolveRouteOwnership("/bot/tasks")?.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER, "Implemented Bot Operations routes must retain the owner gate");
equal(resolveRouteOwnership("/bot/unknown"), null, "Unknown Bot destinations must not silently appear implemented");
const ownerCenter = resolveRouteOwnership("/owner-center");
equal(ownerCenter.classification, ROUTE_CLASSIFICATIONS.OWNER);
equal(ownerCenter.workspace, null);
equal(ownerCenter.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER);
ok(!PRODUCT_WORKSPACES.some((workspace) => workspace.id === "OWNER"), "Owner Center must stay outside the product switcher");

deepEqual(
  getAvailableWorkspaces().map((workspace) => workspace.id),
  [WORKSPACE_IDS.COLLECT, WORKSPACE_IDS.FIND, WORKSPACE_IDS.SELL, WORKSPACE_IDS.BUSINESS],
  "An unverified session must not see Bot",
);
deepEqual(
  getAvailableWorkspaces({ ownerAuthorized: true }).map((workspace) => workspace.id),
  [WORKSPACE_IDS.COLLECT, WORKSPACE_IDS.FIND, WORKSPACE_IDS.SELL, WORKSPACE_IDS.BOT, WORKSPACE_IDS.BUSINESS],
  "A verified owner may see Bot",
);
equal(Object.isFrozen(getAvailableWorkspaces()), true);
equal(sanitizeWorkspaceId("find"), WORKSPACE_IDS.FIND);
equal(sanitizeWorkspaceId(WORKSPACE_IDS.BOT), WORKSPACE_IDS.COLLECT, "A remembered Bot value cannot authorize Bot");
equal(sanitizeWorkspaceId(WORKSPACE_IDS.BOT, { ownerAuthorized: true }), WORKSPACE_IDS.BOT);
equal(sanitizeWorkspaceId("OWNER", { ownerAuthorized: true }), WORKSPACE_IDS.COLLECT);
equal(sanitizeWorkspaceId("invalid", { fallback: WORKSPACE_IDS.BUSINESS }), WORKSPACE_IDS.BUSINESS);
equal(
  sanitizeWorkspaceId(WORKSPACE_IDS.COLLECT, { featureControls: { collection: false }, fallback: WORKSPACE_IDS.FIND }),
  WORKSPACE_IDS.FIND,
  "A disabled saved workspace should fall back safely",
);

deepEqual(
  getWorkspaceNavigation(WORKSPACE_IDS.BOT),
  [],
  "Bot navigation must not be returned before verified owner authorization",
);
deepEqual(
  getWorkspaceNavigation(WORKSPACE_IDS.BOT, { ownerAuthorized: true }).map((item) => item.path),
  ["/bot", "/bot/bots", "/bot/task-groups", "/bot/tasks", "/bot/activity"],
  "Bot must expose only implemented local operations destinations",
);
ok(
  !getWorkspaceNavigation(WORKSPACE_IDS.BUSINESS).some((item) => item.path === "/account-ops"),
  "Business access alone must not expose Account Ops",
);
ok(
  getWorkspaceNavigation(WORKSPACE_IDS.BUSINESS, { ownerAuthorized: true }).some((item) => item.path === "/account-ops"),
  "A verified owner may see Account Ops in Business context",
);
ok(
  PRODUCT_WORKSPACES.flatMap((workspace) => workspace.navigation).every((item) => item.implemented),
  "Unimplemented Inbox, Orders, live provider, and billing routes must not enter navigation",
);

ok(
  getWorkspaceNavigation(WORKSPACE_IDS.BOT, { ownerAuthorized: true }).every((item) => item.requiredAuthority === AUTHORITY_REQUIREMENTS.VERIFIED_OWNER),
  "Every Bot navigation destination must retain verified-owner authority",
);

const directRouteContext = resolveWorkspaceContext("/find/auctions", {
  rememberedWorkspace: WORKSPACE_IDS.COLLECT,
});
equal(directRouteContext.activeWorkspace, WORKSPACE_IDS.FIND);
equal(directRouteContext.source, "route", "A direct deep link must override the remembered workspace");
equal(directRouteContext.accessDenied, false);
const rememberedGlobalContext = resolveWorkspaceContext("/settings", {
  rememberedWorkspace: WORKSPACE_IDS.SELL,
});
equal(rememberedGlobalContext.activeWorkspace, WORKSPACE_IDS.SELL);
equal(rememberedGlobalContext.source, "remembered");
const invalidRememberedContext = resolveWorkspaceContext("/settings", {
  rememberedWorkspace: "OWNER",
  fallback: WORKSPACE_IDS.COLLECT,
  ownerAuthorized: true,
});
equal(invalidRememberedContext.activeWorkspace, WORKSPACE_IDS.COLLECT);
equal(invalidRememberedContext.source, "fallback", "An invalid private remembered value must not be reported as restored");
const deniedBotContext = resolveWorkspaceContext("/bot", {
  rememberedWorkspace: WORKSPACE_IDS.BUSINESS,
  ownerAuthorized: false,
});
equal(deniedBotContext.activeWorkspace, WORKSPACE_IDS.BUSINESS);
equal(deniedBotContext.accessDenied, true);
equal(deniedBotContext.source, "remembered");
const ownerBotContext = resolveWorkspaceContext("/bot", { ownerAuthorized: true });
equal(ownerBotContext.activeWorkspace, WORKSPACE_IDS.BOT);
equal(ownerBotContext.accessDenied, false);
const ownerCenterContext = resolveWorkspaceContext("/owner-center", {
  rememberedWorkspace: WORKSPACE_IDS.FIND,
  ownerAuthorized: true,
});
equal(ownerCenterContext.activeWorkspace, WORKSPACE_IDS.FIND, "Owner Center must not become the active product workspace");
equal(ownerCenterContext.routeEntry.classification, ROUTE_CLASSIFICATIONS.OWNER);

for (const entry of ROUTE_REGISTRY.filter((candidate) => candidate.classification === ROUTE_CLASSIFICATIONS.LEGACY_REDIRECT)) {
  ok(entry.redirectTo.startsWith("/"), `${entry.key} should have a local redirect target`);
  ok(resolveRouteOwnership(entry.redirectTo), `${entry.key} should redirect to a registered route`);
  equal(entry.visible, false, `${entry.key} must not become workspace navigation`);
}

equal(normalizeWorkspacePath(" find//deals/?q=card#result "), "/find/deals");
equal(normalizeWorkspacePath("https://code3.example/find/auctions?view=ending#lot"), "/find/auctions");
equal(normalizeWorkspacePath("\\business\\sales\\"), "/business/sales");
equal(normalizeWorkspacePath(""), "/");

equal(WORKSPACE_DEFINITIONS.BOT.requiredAuthority, AUTHORITY_REQUIREMENTS.VERIFIED_OWNER);
deepEqual(WORKSPACE_DEFINITIONS.BOT.entitlementLabels, [ENTITLEMENT_LABELS.OWNER]);
equal(WORKSPACE_DEFINITIONS.BUSINESS.requiredAuthority, AUTHORITY_REQUIREMENTS.NONE);
deepEqual(WORKSPACE_DEFINITIONS.BUSINESS.entitlementLabels, [ENTITLEMENT_LABELS.BUSINESS]);
ok(
  WORKSPACE_DEFINITIONS.BOT.requiredAuthority !== WORKSPACE_DEFINITIONS.BUSINESS.requiredAuthority,
  "OWNER authority must remain distinct from future paid-tier metadata",
);

console.log(`Code 3 workspace registry tests passed (${assertionCount} assertions).`);
