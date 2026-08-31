import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/features/botOps/BotOperationsPage.jsx");
const styles = read("src/features/botOps/bot-operations.css");
const workspacePage = read("src/features/workspaces/WorkspaceHomePage.jsx");
const app = read("src/App.jsx");
const registry = read("src/config/workspaceRegistry.js");
const routes = read("src/utils/appRouteState.js");

let assertions = 0;
function matches(value, pattern, message) { assert.match(value, pattern, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }

matches(workspacePage, /lazy\(\(\) => import\("\.\.\/botOps\/BotOperationsPage\.jsx"\)\)/, "Bot Operations remains route-split");
matches(workspacePage, /session\?\.status !== OWNER_SESSION_STATES\.AUTHORIZED[\s\S]*return <EmptyState title="Owner Access Required"[\s\S]*return <Suspense[\s\S]*<BotOperationsPage/, "Bot Operations renders only after the verified-owner checks");
matches(workspacePage, /SIGN_IN_REQUIRED[\s\S]*Sign In Required[\s\S]*Owner Access Required/, "unauthorized users receive the established private-workspace denial states");
matches(app, /botOpsSection/, "App route state carries the current Bot section");
matches(app, /onBotOpsSectionChange/, "Bot section navigation uses the shared browser-history path");
matches(routes, /section === "bot"[\s\S]*productWorkspaceHome:\s*WORKSPACE_IDS\.BOT,\s*botOpsSection/, "direct Bot links resolve the Bot workspace and section");
matches(registry, /path:\s*"\/bot"[\s\S]*requiredAuthority:\s*AUTHORITY_REQUIREMENTS\.VERIFIED_OWNER/, "Bot home remains OWNER-only");
for (const section of ["bots", "task-groups", "tasks", "accounts", "profiles", "proxies", "targets", "activity"]) {
  matches(registry, new RegExp(`path:\\s*"\\/bot\\/${section}"[\\s\\S]*?requiredAuthority:\\s*AUTHORITY_REQUIREMENTS\\.VERIFIED_OWNER`), `${section} remains OWNER-only`);
}

matches(page, /OWNER_SESSION_STATES\.AUTHORIZED/, "the page derives authorization from the verified session contract");
matches(page, /if \(!authorized\)[\s\S]*setService\(null\)[\s\S]*return/, "Bot storage stays unloaded before authorization");
matches(page, /createBotOpsService\(/, "authorized Bot Operations reuses the domain service");
matches(page, /Overview[\s\S]*Bots[\s\S]*Task Groups[\s\S]*Tasks[\s\S]*Accounts[\s\S]*Profiles[\s\S]*Proxies[\s\S]*Activity/, "the approved workflow sections are represented");
matches(page, /Hayha[\s\S]*Stellar/, "registered provider foundations are visible");
matches(page, /Not Configured|Not configured/, "provider state is honest");
matches(page, /label:\s*"Provider network",\s*value:\s*"Disabled"/, "no provider networking is implied");
matches(page, /No tasks[\s\S]*No live or local task records exist/, "empty runtime state is honest");
matches(page, /Bot Success[^<]*Purchase|Bot success[^<]*Purchase/, "bot success stays distinct from Purchase");
matches(page, /Checkout Evidence[^<]*Purchase|checkout evidence[^<]*Purchase/, "checkout evidence stays distinct from Purchase");
matches(page, /owner review/i, "checkout evidence exposes the owner-review boundary");
matches(page, /Account Ops/i, "retailer-account assignments reference Account Ops");

excludes(page, /dangerouslySetInnerHTML/, "Bot metadata is never injected as raw HTML");
excludes(page, />\s*(?:Start|Restart|Checkout|Purchase|Buy Now)\s*</i, "normal UI exposes no live task or purchasing controls");
excludes(page, /(?:Hayha|Stellar)[\s\S]{0,80}(?:Connected|Healthy|Running)/, "unconfigured providers are not represented as connected");
excludes(page, /(?:password|accessToken|refreshToken|proxyPassword|cvv)\s*[:=]/i, "presentation code contains no secret-bearing model fields");
excludes(page, /REMOTE_ACTIVE|OWNER_CONFIRMED_CUTOVER/, "presentation cannot activate persistence cutover");
excludes(page, /(?:create|import)Purchase\s*\(/, "Bot Operations cannot create a Purchase");
excludes(page, /receiveInventory\s*\(|createInventory\s*\(/, "Bot Operations cannot mutate inventory");

matches(styles, /min-height:\s*44px/, "interactive Bot controls meet the touch-target minimum");
matches(styles, /overflow-wrap:\s*anywhere/, "long identifiers wrap safely");
matches(styles, /@media \(max-width:\s*700px\)/, "mobile layouts are explicit");
matches(styles, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/, "wide layouts use responsive card grids instead of fixed tables");
matches(styles, /@media \(prefers-reduced-motion:\s*reduce\)/, "reduced motion is respected");
matches(styles, /minmax\(0,\s*1fr\)/, "responsive grids permit children to shrink without overflow");

console.log(`Code 3 Bot Operations UI contract: ${assertions} assertions passed.`);
