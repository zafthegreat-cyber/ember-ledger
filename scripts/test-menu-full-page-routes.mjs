import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "src", "App.jsx");
const cssPath = path.join(root, "src", "App.css");
const appSource = fs.readFileSync(appPath, "utf8");
const cssSource = fs.readFileSync(cssPath, "utf8");

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
assert.ok(
  appSource.includes('className="drawer menu-drawer navigation-drawer open"'),
  "Mobile menu should use the menu/navigation drawer classes targeted by scroll-safe CSS."
);
assert.ok(
  cssSource.includes(".drawer.open.menu-drawer .drawer-menu-stack") && cssSource.includes("overflow-y: auto"),
  "Mobile menu drawer stack should scroll independently."
);
assert.ok(
  appSource.includes("<strong>Wishlist / ISO</strong>") &&
    appSource.includes("runMenuAction(openWishlistIsoSurface)") &&
    appSource.includes("No automatic matching or seller offers."),
  "Menu should expose a safe Wishlist / ISO shortcut into the local planning surface."
);
assert.ok(
  appSource.includes("<strong>Event Planner</strong>") &&
    appSource.includes("runMenuAction(openCollectorEventPlannerSurface)") &&
    appSource.includes("No RSVP, tickets, payments, or public listings."),
  "Menu should expose a safe Event Planner shortcut into the local collector planning surface."
);
assert.equal(
  /matched with sellers|seller offers are live|automatic matching is live|guaranteed seller offers/i.test(appSource),
  false,
  "Wishlist / ISO should not claim live matching or seller offers."
);
assert.equal(
  /RSVPs are live|ticketing is live|payments are live|public event listing is live|shops are verified|calendar sync is live|notifications are sent/i.test(appSource),
  false,
  "Event Planner should not claim live RSVPs, ticketing, payments, public listings, shop verification, calendar sync, or notifications."
);
assert.ok(
  appSource.includes("function CollectorShowcaseCard") &&
    appSource.includes("3D Collector Showcase") &&
    appSource.includes("vaultDisplayMode") &&
    appSource.includes("market-showcase-preview") &&
    appSource.includes("quick-add-showcase-preview"),
  "Collector Showcase should be wired into shared UI, Vault, Market, and Quick Add."
);
assert.ok(
  cssSource.includes(".collector-showcase-card") &&
    cssSource.includes("@media (prefers-reduced-motion: reduce)") &&
    cssSource.includes("transform: none"),
  "Collector Showcase should provide a reduced-motion CSS fallback."
);
assert.equal(
  /showcase[^.]{0,80}(authenticat|grade verified|product verified|live market|guaranteed price|official scan)/i.test(appSource),
  false,
  "Collector Showcase copy should not claim grading, authentication, live market pricing, or product verification."
);
assert.ok(
  cssSource.includes('.flow-modal[data-flow="addActionSheet"]') &&
    cssSource.includes('.flow-modal[data-flow="multiDestinationAdd"]') &&
    cssSource.includes("height: 100dvh"),
  "Mobile Scan Anything and Review/Add flows should receive full-page modal treatment."
);

console.log("Menu full-page route tests passed.");
