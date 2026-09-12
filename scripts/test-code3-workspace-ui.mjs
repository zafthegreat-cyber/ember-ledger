import assert from "node:assert/strict";
import fs from "node:fs";

const read = (relativeUrl) => fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
const appSource = read("../src/App.jsx");
const routeStateSource = read("../src/utils/appRouteState.js");
const registrySource = read("../src/config/workspaceRegistry.js");
const switcherSource = read("../src/features/workspaces/WorkspaceSwitcher.jsx");
const homeSource = read("../src/features/workspaces/WorkspaceHomePage.jsx");
const workspaceCss = read("../src/features/workspaces/workspace-shell.css");
const operationsSource = read("../src/components/operations/OperationsUI.jsx");
const operationsCss = read("../src/components/operations/operations-ui.css");
const accountOpsSource = read("../src/features/accountOps/AccountOpsPage.jsx");
const everydayWorkspacesSource = read("../src/pages/EverydayWorkspaces.jsx");
const collectionWorkspaceSource = everydayWorkspacesSource.slice(
  everydayWorkspacesSource.indexOf("export function CollectionWorkspace"),
  everydayWorkspacesSource.indexOf("function BusinessDetail"),
);
const businessWorkspaceSource = everydayWorkspacesSource.slice(
  everydayWorkspacesSource.indexOf("export function BusinessWorkspace"),
);
const packageJson = JSON.parse(read("../package.json"));

let assertionCount = 0;

function match(source, expression, message) {
  assertionCount += 1;
  assert.match(source, expression, message);
}

function doesNotMatch(source, expression, message) {
  assertionCount += 1;
  assert.doesNotMatch(source, expression, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

match(
  appSource,
  /const WorkspaceHomePage = lazy\(\(\) => import\("\.\/features\/workspaces\/WorkspaceHomePage"\)\)/,
  "Workspace homes should remain outside the already-large main App chunk",
);
match(appSource, /<LazyToolBoundary label=\{`Loading \$\{getWorkspaceDefinition\(effectiveProductWorkspaceHome\)/);
match(appSource, /<WorkspaceHomePage[\s\S]*workspace=\{effectiveProductWorkspaceHome\}/);
match(appSource, /import WorkspaceSwitcher from "\.\/features\/workspaces\/WorkspaceSwitcher"/);
match(appSource, /<WorkspaceSwitcher[\s\S]*workspaces=\{switcherWorkspaces\}[\s\S]*onSelect=\{\(workspace\) => navigateProductWorkspace\(workspace\.id\)\}/);

match(switcherSource, /<details[\s\S]*data-testid="workspace-switcher"/);
match(switcherSource, /<summary aria-label=\{`\$\{contextLabel\}\. Switch Code 3 workspace`\}>/);
match(switcherSource, /BRAND_CONFIG\.applicationShortName/, "Switcher branding should use the central Code 3 configuration");
match(switcherSource, /event\.key !== "Escape"/);
match(switcherSource, /querySelector\("summary"\)\?\.focus\(\)/, "Escape should restore focus to the disclosure control");
match(switcherSource, /const selectWorkspace = \(workspace\) => \{[\s\S]*open = false;[\s\S]*querySelector\("summary"\)\?\.focus\(\);[\s\S]*onSelect\?\.\(workspace\)/, "Workspace selection should close the disclosure without leaving focus in hidden content");
match(switcherSource, /aria-current=\{workspace\.id === currentWorkspaceId \? "page" : undefined\}/);
match(switcherSource, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
match(switcherSource, /document\.removeEventListener\("pointerdown", closeOnOutsidePointer\)/);

match(workspaceCss, /\.code3-workspace-switcher > summary \{[\s\S]*min-height: 44px/);
match(workspaceCss, /\.code3-workspace-switcher__menu button \{[\s\S]*min-height: 52px/);
match(workspaceCss, /\.code3-workspace-switcher > summary:focus-visible/);
match(workspaceCss, /\.code3-workspace-switcher__menu button:focus-visible/);
match(workspaceCss, /outline: 3px solid/);
match(workspaceCss, /width: min\(310px, calc\(100vw - 28px\)\)/, "Switcher menu must fit a 360px viewport");
match(workspaceCss, /padding: 18px 16px calc\(96px \+ env\(safe-area-inset-bottom, 0px\)\)/);
match(workspaceCss, /@media \(max-width: 700px\)/);
match(workspaceCss, /width: min\(220px, calc\(100vw - 78px\)\)/);
match(workspaceCss, /@media \(prefers-reduced-motion: reduce\)/);
match(workspaceCss, /\.code3-workspace-switcher__chevron \{ transition: none; \}/);
match(operationsCss, /@media \(min-width: 701px\) and \(max-width: 1179px\)[\s\S]*\.app\.app-command-shell \.topbar-brand \{ display: none !important; \}/, "Tablet topbars should leave one grid slot for the workspace switcher");

match(appSource, /const availableProductWorkspaces = getAvailableWorkspaces\(\{[\s\S]*ownerAuthorized: ownerCenterAuthorized/);
match(appSource, /const shellRouteOwnership = resolveRouteOwnership\(shellRoutePath\)/);
match(appSource, /const shellRoutePath = pathFromActiveTab\(activeTab, \{/);
doesNotMatch(appSource, /const shellRoutePath = currentRoutePath\(\)/, "Workspace ownership must not call route helpers that depend on later render declarations");
match(appSource, /directWorkspace: shellRouteOwnership\?\.workspace \|\| ""/);
match(appSource, /currentProductWorkspaceId = workspaceSelection\.workspace/);
match(appSource, /workspaceId === WORKSPACE_IDS\.BOT && !ownerCenterAuthorized/);
match(appSource, /routeWorkspace === WORKSPACE_IDS\.BOT && !ownerCenterAuthorized/);
match(appSource, /shellRouteOwnership\?\.classification === ROUTE_CLASSIFICATIONS\.OWNER/);
match(appSource, /privateBotRouteDenied\s*\? "Owner Access Required"/);
match(homeSource, /data-testid=\{botDenied \? "owner-workspace-access-state"/);
doesNotMatch(homeSource, /data-testid=\{`\$\{workspace\.toLowerCase\(\)\}-workspace-home`\}/, "Denied private routes must not expose the Bot workspace identity in the DOM");
match(appSource, /const productWorkspaceHomeAvailable = availableProductWorkspaces\.some/);
match(appSource, /workspace=\{effectiveProductWorkspaceHome\}/, "Disabled workspace homes should render the safe available fallback");
match(appSource, /availableProductWorkspaces\.find\(\(candidate\) => candidate\.id === workspaceId\)/, "Programmatic workspace navigation should respect availability metadata");
match(appSource, /\}, \[activeTab, flipScoutView, productWorkspaceHome, effectiveProductWorkspaceHome, botOpsSection, collectionWorkspaceView/, "Switching between workspace homes and Bot sections should reset route focus and scroll even when the active tab is unchanged");
doesNotMatch(homeSource, /<main\b/, "Workspace homes must not nest a second main landmark inside the application shell");

match(appSource, /const mobileBottomTabs = currentProductWorkspaceId === WORKSPACE_IDS\.BOT[\s\S]*globalAddTab/);
match(appSource, /\.slice\(0, 5\)/, "Mobile workspace navigation should stay bounded");
match(appSource, /ariaLabel: "Open global Add menu"/);
match(appSource, /const desktopSidebarItems = workspaceNavItems\.filter/);
match(appSource, /ownerCenterAuthorized \? \{ key: "owner-center"/);
doesNotMatch(registrySource, /label:\s*"Owner Center"[\s\S]{0,120}switcherEligible:\s*true/);

match(routeStateSource, /if \(section === "collect"\) return \{ activeTab: "workspaceHome", productWorkspaceHome: WORKSPACE_IDS\.COLLECT \}/);
match(routeStateSource, /if \(section === "find" && subSection === "home"\)/);
match(routeStateSource, /if \(section === "sell" && subSection === "home"\)/);
match(routeStateSource, /if \(section === "bot"\) \{[\s\S]*allowedBotSections[\s\S]*return \{ activeTab: "workspaceHome", productWorkspaceHome: WORKSPACE_IDS\.BOT, botOpsSection \}/, "Implemented Bot Operations sections should retain workspace context");
match(routeStateSource, /if \(subSection && !allowedBotSections\.includes\(subSection\)\) return \{ activeTab: "dashboard" \}/, "Unknown Bot children must fail closed");

for (const emptyCopy of [
  "No cards in your collection yet.",
  "No watched opportunities yet.",
  "No items ready to sell.",
]) {
  match(homeSource, new RegExp(emptyCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing honest empty state: ${emptyCopy}`);
}
match(homeSource, /lazy\(\(\) => import\("\.\.\/botOps\/BotOperationsPage\.jsx"\)\)/, "Bot Operations should remain route-lazy");
match(homeSource, /session\?\.status !== OWNER_SESSION_STATES\.AUTHORIZED/, "Bot Operations must remain behind the verified owner gate");

match(appSource, /items=\{workspaceItems\}/, "Workspace homes should consume shared item records");
match(appSource, /<CollectionWorkspace[\s\S]*items=\{workspaceItems\}/);
match(appSource, /<BusinessWorkspace[\s\S]*items=\{workspaceItems\}/);
match(collectionWorkspaceSource, /useEffect\(\(\) => \{[\s\S]*setView\(initialView\);[\s\S]*setSelected\(null\);[\s\S]*setForm\(null\);[\s\S]*\}, \[initialView\]\);/, "Collection route changes should replace stale detail and form content");
match(businessWorkspaceSource, /useEffect\(\(\) => \{[\s\S]*setView\(initialView\);[\s\S]*setSelected\(null\);[\s\S]*setForm\(null\);[\s\S]*\}, \[initialView\]\);/, "Business route changes should replace stale detail and form content");
match(businessWorkspaceSource, /useEffect\(\(\) => \{\s*setMoneyViewState\(initialMoneyView\);\s*\}, \[initialMoneyView\]\);/, "Business Money deep links should synchronize the rendered subview");
match(appSource, /updateOwnedItemPurpose\(item, OWNED_ITEM_PURPOSES\.FOR_RESALE/);
match(appSource, /updateOwnedItemPurpose\(item, OWNED_ITEM_PURPOSES\.PERSONAL_COLLECTION/);
doesNotMatch(homeSource, /localStorage|sessionStorage|indexedDB/i, "Workspace homes must not create a parallel record store");

match(accountOpsSource, /if \(session\.status === OWNER_SESSION_STATES\.LOADING\)/);
match(accountOpsSource, /if \(session\.status === OWNER_SESSION_STATES\.SIGN_IN_REQUIRED\)/);
match(accountOpsSource, /if \(session\.status === OWNER_SESSION_STATES\.OWNER_ACCESS_REQUIRED\)/);
match(appSource, /onReturnHome=\{\(\) => navigateProductWorkspace\(WORKSPACE_IDS\.BUSINESS\)\}/);
match(registrySource, /key: "account-ops"[\s\S]{0,300}workspace: WORKSPACE_IDS\.BUSINESS[\s\S]{0,300}requiredAuthority: AUTHORITY_REQUIREMENTS\.VERIFIED_OWNER/);

match(operationsSource, /aria-label="Primary navigation"/);
match(operationsSource, /aria-current=\{item\.key === activeKey && !item\.isAction \? "page"/);
match(workspaceCss, /font-variant-numeric: tabular-nums/);
match(workspaceCss, /text-overflow: ellipsis/);
match(workspaceCss, /min-width: 0/);

const visibleNavSlice = registrySource.slice(0, registrySource.indexOf("const CANONICAL_ROUTES"));
for (const futureFeature of ["Inbox", "Order Import", "Stellar", "Hayha", "Valor", "Billing", "Upgrade"]) {
  doesNotMatch(visibleNavSlice, new RegExp(`label:\\s*["']${futureFeature}`, "i"), `${futureFeature} must not be exposed as implemented navigation`);
}
doesNotMatch(
  registrySource,
  /clientAuthoritativeEntitlement|localStorage|sessionStorage/,
  "Workspace entitlement labels must remain inert metadata without client storage authority",
);

equal(
  packageJson.scripts?.["test:code3-workspaces"],
  "node --no-warnings scripts/test-code3-workspace-registry.mjs && node --no-warnings scripts/test-code3-workspace-preference.mjs && node --no-warnings scripts/test-code3-workspace-fixtures.mjs && node --no-warnings scripts/test-code3-workspace-ui.mjs",
  "The workspace contract suite should run registry, preference, fixtures, and UI checks",
);

console.log(`Code 3 workspace UI contracts passed (${assertionCount} assertions).`);
