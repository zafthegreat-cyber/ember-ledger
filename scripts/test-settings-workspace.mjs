import assert from "node:assert/strict";
import {
  forgeModeSummary,
  sellerModeEnabled,
  workspaceDeleteBlockReason,
} from "../src/utils/settingsWorkspaceSafety.js";

const defaultWorkspaceId = "workspace-personal-local-beta";
const emptyWorkspace = { id: "workspace-business", name: "TCG Business" };
const activeWorkspace = { id: "workspace-active", name: "Active Seller" };

assert.match(
  workspaceDeleteBlockReason({ id: defaultWorkspaceId }, { total: 0 }, {
    defaultWorkspaceId,
    canManage: true,
    activeWorkspaceId: "other",
    activeWorkspaceCount: 2,
    confirmed: true,
  }),
  /default personal/i
);
assert.match(
  workspaceDeleteBlockReason(emptyWorkspace, { total: 2 }, {
    defaultWorkspaceId,
    canManage: true,
    activeWorkspaceId: "other",
    activeWorkspaceCount: 2,
    confirmed: true,
  }),
  /still has records/i
);
assert.match(
  workspaceDeleteBlockReason(activeWorkspace, { total: 0 }, {
    defaultWorkspaceId,
    canManage: true,
    activeWorkspaceId: activeWorkspace.id,
    activeWorkspaceCount: 1,
    confirmed: true,
  }),
  /another active workspace/i
);
assert.match(
  workspaceDeleteBlockReason(emptyWorkspace, { total: 0 }, {
    defaultWorkspaceId,
    canManage: true,
    activeWorkspaceId: "other",
    activeWorkspaceCount: 2,
    confirmed: false,
  }),
  /Type DELETE/i
);
assert.equal(
  workspaceDeleteBlockReason(emptyWorkspace, { total: 0 }, {
    defaultWorkspaceId,
    canManage: true,
    activeWorkspaceId: "other",
    activeWorkspaceCount: 2,
    confirmed: true,
  }),
  ""
);

assert.equal(forgeModeSummary({ lockToEmberTide: true }, { name: "Ember & Tide" }), "Forge is locked to Ember & Tide.");
assert.match(forgeModeSummary({ lockToEmberTide: true }, null), /unavailable/i);
assert.match(forgeModeSummary({ personalForgeEnabled: false }, null), /Personal Forge is hidden/i);
assert.equal(sellerModeEnabled("seller", "collector"), true);
assert.equal(sellerModeEnabled("collector", "seller"), true);
assert.equal(sellerModeEnabled("collector", "collector"), false);

console.log("Settings workspace tests passed.");
