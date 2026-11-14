// Nov 6 UX pass: sign-out placement, guided tour, Nest/Lantern retired, warm palette, simpler You/Account pages.
//   node --no-warnings --test scripts/test-ux-declutter.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renameLegacyProductNames } from "../src/config/plainLanguage.js";
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Nest and Lantern are gone from visible copy", () => {
  assert.equal(renameLegacyProductNames("Open Lantern"), "Open Safety Center");
  assert.equal(renameLegacyProductNames("Lantern Safety Center"), "Safety Center");
  assert.equal(renameLegacyProductNames("Nest"), "Family");
  assert.equal(renameLegacyProductNames("Open Nest to review family collecting settings."), "Open Family Settings to review family collecting settings.");
});

test("sign out is on the Settings account card and first in the account menu", () => {
  const menu = src("src/pages/Menu.jsx");
  assert.match(menu, /className="settings-layout__sign-out" onClick=\{signOut\}>Sign out/);
  assert.match(menu, /Take the tour/);
  const app = src("src/App.jsx");
  assert.match(app, /menuAccountItems\.unshift\(\{ key: "sign-out"/);
  assert.match(app, /startAppTour: \(\) => setAppTourOpen\(true\)/);
});

test("guided tour has six steps, opens once per device, and is rendered by the app", () => {
  const tour = src("src/features/tour/AppTour.jsx");
  assert.equal((tour.match(/^\s+key: "/gm) || []).length, 6);
  assert.match(tour, /APP_TOUR_STORAGE_KEY = "code3-app-tour-v1"/);
  assert.match(tour, /Sign out live under You \/ Settings/);
  const app = src("src/App.jsx");
  assert.match(app, /<AppTour open=\{appTourOpen\} onClose=/);
  assert.match(app, /appTourSeen\(\)/);
});

test("collectors get the simple You page and a quiet Account page", () => {
  const profile = src("src/features/deferredViews/ProfileContent.jsx");
  assert.match(profile, /if \(!adminViewingAsAdmin\) \{/);
  assert.match(profile, /you-simple-grid/);
  const app = src("src/App.jsx");
  assert.match(app, /statusItems=\{!adminViewingAsAdmin \? \[\] : \[/);
  assert.match(app, /account-setup-collapsed/);
  assert.match(app, /className="drawer-link logout-link account-sign-out-button" onClick=\{signOut\}>Sign out/);
  assert.match(app, /ACCOUNT_SETUP_TIER_ROWS\.filter\(\(tier\) => adminViewingAsAdmin \|\| !\["admin", "beta"\]\.includes\(tier\.key\)\)/);
});

test("warm palette polish is loaded last and defines the teal accent", () => {
  const appCss = src("src/App.css");
  assert.ok(appCss.trim().endsWith('@import "./styles/app/15-warm-palette-polish.css";'));
  const polish = src("src/styles/app/15-warm-palette-polish.css");
  assert.match(polish, /--c3-teal:/);
  assert.match(polish, /--c3-page: #1A1518/);
  assert.match(polish, /text-transform: none !important/);
});

test("MUST-11: quiet command boards and admin-only clutter on the five main pages", () => {
  const board = src("src/components/command-system/CommandBoardV4.jsx");
  assert.match(board, /const quiet = density === "quiet" \|\| \(density === "auto" && !\(experience\?\.showAdminTools\)\);/);
  assert.match(board, /command-board-v4-more/);
  assert.match(board, /slice\(0, quiet \? 1 : 2\)/);
  for (const [file, marker] of [
    ["src/pages/Market.jsx", /fullBoard \? <aside className="market-v4-side-rail"/],
    ["src/pages/Market.jsx", /Search for a card or product to start\./],
    ["src/pages/Vault.jsx", /\{fullBoard \? \(<div className="vault-status-chip-row"/],
    ["src/pages/Vault.jsx", /\{fullBoard \? renderUpgradeValuePreview\("vault"\) : null\}/],
    ["src/pages/Scout.jsx", /\{fullBoard \? \(<article className="scout-command-safety-card">/],
    ["src/pages/Scout.jsx", /Recent reports near you\./],
    ["src/features/deferredViews/CommunityContent.jsx", /\{adminToolsVisible \? \(<EtMockupRightRail/],
    ["src/features/deferredViews/CommunityContent.jsx", /\{adminToolsVisible \? \(<div className="tidepool-preview-feed"/],
    ["src/pages/OperationsHome.jsx", /title="Welcome back\."\s*\/?>?/],
  ]) assert.match(src(file), marker, `${file} ${marker}`);
  assert.doesNotMatch(src("src/pages/OperationsHome.jsx"), /Stock changes quickly\. Check when a report was observed\./);
  assert.doesNotMatch(src("src/features/deferredViews/CommunityContent.jsx"), /Community posting opens after beta access is approved/);
});
