import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "src", "App.jsx");
const appSource = fs.readFileSync(appPath, "utf8");

const expectedRoutes = [
  ['section === "settings"', 'activeTab: "settings"'],
  ['section === "account"', 'activeTab: "account"'],
  ['section === "collections"', 'activeTab: "collections"'],
  ['section === "data-backup"', 'activeTab: "dataBackup"'],
  ['section === "tcg-os"', 'activeTab: "tcgOs"'],
  ['section === "help"', 'activeTab: "help"'],
  ['section === "moderator"', 'activeTab: "moderator"'],
];

for (const [routeFragment, activeTabFragment] of expectedRoutes) {
  assert.ok(appSource.includes(routeFragment), `Missing route parser fragment: ${routeFragment}`);
  assert.ok(appSource.includes(activeTabFragment), `Missing active tab mapping: ${activeTabFragment}`);
}

const expectedRenderers = [
  'activeTab === "settings" && renderSettingsPage()',
  'activeTab === "account" && renderAccountPage()',
  'activeTab === "collections" && renderCollectionsPage()',
  'activeTab === "dataBackup" && renderDataBackupPage()',
  'activeTab === "tcgOs" && renderTcgOsPage()',
  'activeTab === "profile" && renderProfilePage()',
  'activeTab === "help" && renderHelpPage()',
  'activeTab === "moderator" && renderModeratorPage()',
];

for (const renderer of expectedRenderers) {
  assert.ok(appSource.includes(renderer), `Missing full-page renderer: ${renderer}`);
}

assert.ok(
  appSource.includes('utilityDestination ? "Open >"'),
  "Menu drawer sections should launch utility pages instead of expanding full inline panels."
);
assert.ok(
  appSource.includes('!utilityDestination && open ? <div className="drawer-collapsible-body">{children}</div> : null'),
  "Only non-utility drawer sections may render inline drawer bodies."
);
assert.equal(
  /keepOpen:\s*true/.test(appSource),
  false,
  "Menu launcher items should not keep the drawer open for inline utility panels."
);

console.log("Menu full-page route tests passed.");
