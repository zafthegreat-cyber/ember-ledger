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
    appSource.includes("function CollectorFlipDetailCard") &&
    appSource.includes("function SealedProductShelfCard") &&
    appSource.includes("collectorShowcaseRarityTone") &&
    appSource.includes("Rarity unknown") &&
    appSource.includes("3D Collector Showcase") &&
    appSource.includes("Sealed Product Shelf") &&
    appSource.includes("Collection Gallery") &&
    appSource.includes("Back-side details") &&
    appSource.includes("vaultDisplayMode") &&
    appSource.includes("market-showcase-preview") &&
    appSource.includes("quick-add-showcase-preview"),
  "Collector Showcase and flip details should be wired into shared UI, Vault, Market, and Quick Add."
);
assert.ok(
    cssSource.includes(".collector-showcase-card") &&
    cssSource.includes(".collector-flip-card") &&
    cssSource.includes(".sealed-product-shelf-card") &&
    cssSource.includes(".vault-gallery-tile") &&
    cssSource.includes(".collector-rarity-secret") &&
    cssSource.includes("@media (prefers-reduced-motion: reduce)") &&
    cssSource.includes("transform: none"),
  "Collector Showcase and flip details should provide a reduced-motion CSS fallback."
);
assert.ok(
  cssSource.includes("contain: layout paint style") &&
    cssSource.includes("content-visibility: auto") &&
    cssSource.includes("contain-intrinsic-size") &&
    cssSource.includes(".collector-showcase-mini .collector-showcase-shine") &&
    cssSource.includes("backface-visibility: hidden"),
  "Collector Showcase surfaces should use lightweight containment, compact list previews, and GPU-safe transforms."
);
assert.ok(
  appSource.includes("Visual display mode. Open item profile.") &&
    appSource.includes("Visual display mode. Card details are shown as text.") &&
    appSource.includes("Visual display mode. Open item profile details.") &&
    appSource.includes("Visual display mode. Check sealed condition manually.") &&
    appSource.includes("sealed product shelf card") &&
    cssSource.includes("button.collector-showcase-card:focus-visible") &&
    cssSource.includes(".collector-flip-card > summary:focus-visible") &&
    cssSource.includes(".vault-gallery-tile:focus-visible") &&
    cssSource.includes("@media (prefers-reduced-motion: reduce)"),
  "Collector Showcase surfaces should expose keyboard focus states, reduced-motion fallback, and screen-reader helper text."
);
assert.equal(
  /(showcase|flip)[^.]{0,100}(authenticat|grade verified|product verified|live market|guaranteed price|official scan)/i.test(appSource),
  false,
  "Collector Showcase and flip detail copy should not claim grading, authentication, live market pricing, or product verification."
);
assert.ok(
  appSource.includes("function detectCollectorItemVisualType") &&
    appSource.includes("function collectorVisualTypeLabel") &&
    appSource.includes('"booster box"') &&
    appSource.includes('"sealed product"') &&
    appSource.includes('"wishlist"') &&
    appSource.includes("visualType: detectCollectorItemVisualType(displayItem)") &&
    appSource.includes("displayKind: item ? detectCollectorItemVisualType(item)") &&
    appSource.includes("const kind = detectCollectorItemVisualType(item)") &&
    appSource.includes("kind={detectCollectorItemVisualType(product)}") &&
    appSource.includes("kind={detectCollectorItemVisualType(selectedCatalogDetailProduct)}") &&
    appSource.includes("const productKind = detectCollectorItemVisualType(product)") &&
    cssSource.includes(".collector-showcase-wishlist"),
  "Shared product visual type detection should drive Vault, Market, Quick Add, Item Profile, Gallery, and Display Case surfaces."
);
assert.equal(
  /type detection verified|scan-detected type|automatic type verification|verified product type|authenticated product type|official product classification|live stock type|marketplace listing type verified/i.test(appSource),
  false,
  "Product type detection should stay a visual helper, not a verification, scanning, live stock, or marketplace claim."
);
assert.equal(
  /sealed product shelf[^.]{0,140}(live stock|in stock|guaranteed availability|product verified|official verification|live price)/i.test(appSource),
  false,
  "Sealed Product Shelf should not claim stock status, live prices, or product verification."
);
assert.ok(
  appSource.includes("Display Case") &&
    appSource.includes("vaultDisplayCase") &&
    appSource.includes("Local display only") &&
    appSource.includes("not public sharing") &&
    appSource.includes("not a listing") &&
    appSource.includes("not a sale") &&
    cssSource.includes(".vault-display-case-panel"),
  "Vault Display Case should be wired as a local-only collection-room surface."
);
assert.equal(
  /display case[^.]{0,180}(public profile is live|public sharing is live|listing is live|marketplace post is live|checkout is connected|payment is connected|seller listing is live)/i.test(appSource),
  false,
  "Display Case should not claim public sharing, seller listing, checkout, or payment behavior."
);
assert.ok(
  appSource.includes("Compare Table") &&
    appSource.includes("itemComparison") &&
    appSource.includes("Comparison uses saved/local data.") &&
    appSource.includes("Not live market pricing") &&
    cssSource.includes(".item-compare-table-card"),
  "Card/Product Compare Table should be wired as a local saved/manual research surface."
);
assert.equal(
  /compare table[^.]{0,240}(live market pricing is active|live market pricing is connected|value is guaranteed|guaranteed returns|grade verified|grading verified|authentication verified|official price feed|live price feed)/i.test(appSource),
  false,
  "Compare Table should not claim live pricing, guaranteed value, grading, authentication, or investment advice."
);
assert.ok(
  appSource.includes("Manual collector note") &&
    appSource.includes("Not a professional grade") &&
    appSource.includes("Condition can affect price; verify before trading or buying.") &&
    appSource.includes("storageCareNotes") &&
    appSource.includes("conditionCheckedAt") &&
    cssSource.includes(".vault-manual-condition-panel"),
  "Vault condition notes should be saved and displayed as manual collector notes, not grading."
);
assert.equal(
  /condition scan verified|condition scan is live|professional condition assessment|official condition grade|grade verified|grading verified|authenticated condition|authentication verified|condition verification complete|automatic condition detection|condition detected by scan/i.test(appSource),
  false,
  "Vault condition notes should not claim scanning, authentication, verification, or professional grading."
);
assert.ok(
  cssSource.includes('.flow-modal[data-flow="addActionSheet"]') &&
    cssSource.includes('.flow-modal[data-flow="multiDestinationAdd"]') &&
    cssSource.includes("height: 100dvh"),
  "Mobile Scan Anything and Review/Add flows should receive full-page modal treatment."
);

console.log("Menu full-page route tests passed.");
