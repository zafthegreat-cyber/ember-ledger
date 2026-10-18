import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/features/botOps/BotOperationsPage.jsx");
const setup = read("src/features/botOps/BotProviderSetup.jsx");
const tracker = read("src/features/botOps/BotTaskTracker.jsx");
const overview = read("src/features/botOps/BotTrackingOverview.jsx");
const activity = read("src/features/botOps/BotTrackingActivity.jsx");
const presentation = `${page}\n${setup}\n${tracker}\n${overview}\n${activity}`;
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
matches(page, /if \(!authorized\) return undefined;[\s\S]*createBotOpsService\(/, "Bot storage stays unloaded before authorization");
matches(page, /session\.identityKey \|\| session\.userId/, "verified identity changes remount private Bot state");
matches(page, /useLayoutEffect\(\(\) => \{[\s\S]*operationLifetime\.current = false/, "unmount closes the write lifetime during the layout cleanup");
matches(page, /isOperationActive: \(\) => !cancelled && operationLifetime\.current/, "queued writes check the active owner page lifetime");
matches(page, /createBotOpsService\(/, "authorized Bot Operations reuses the domain service");
matches(page, /Overview[\s\S]*Tasks[\s\S]*Bots[\s\S]*Task Groups[\s\S]*Accounts[\s\S]*Profiles[\s\S]*Proxies[\s\S]*Activity/, "tracking is promoted to primary navigation while all sections remain represented");
matches(page, /BotProviderSetup providers=\{providers\} installations=\{snapshot\.installations\} onSave=\{saveInstallation\}/, "setup uses the current saved snapshot and domain save callback");
matches(page, /if \(!authorized \|\| !service\) throw new Error/, "saving rechecks the verified-owner gate");
matches(page, /service\.updateRecord\("installations", existing\.id, fields, existing\.recordVersion\)/, "edits retain identity and use optimistic record version checking");
matches(page, /service\.createInstallation\([\s\S]*?connectionMode: BOT_INTEGRATION_MODES\.MANUAL_RECORD, enabled: false, healthState: "DISCONNECTED"/, "new installations are explicitly disconnected local records");
matches(page, /const fields = \{ friendlyName: input\.friendlyName, runtimeLabel: input\.runtimeLabel, version: input\.version \}/, "updates allow only the three nonsecret editable fields");
matches(page, /setSnapshot\(await service\.loadSnapshot\(\)\)/, "saving reloads the authoritative local snapshot");
matches(page, /installation was saved, but the list could not refresh/, "a post-write refresh error does not incorrectly claim the write failed");
matches(setup, /\["POLAR", "SNIPED", "SWOOPER"\]/, "the user's requested bots are easy to find");
matches(setup, /\[\.\.\.priority, \.\.\.other\]\.map\(\(provider\) => <option/, "all remaining providers remain selectable");
matches(setup, /Bot provider[\s\S]*Installation name[\s\S]*Device label \(optional\)[\s\S]*Bot version \(optional\)/, "the setup form uses clear accessible labels");
matches(setup, /disabled=\{saving \|\| Boolean\(editing\)\}/, "editing cannot silently change provider identity");
matches(setup, /setup\.summary[\s\S]*setup\.availableNow[\s\S]*setup\.nextStep[\s\S]*setup\.reviewedAt/, "provider-specific guidance and evidence dates are displayed");
matches(setup, /timeZone: "UTC"/, "evidence review dates do not shift into the previous day");
matches(setup, /target="_blank" rel="noopener noreferrer"/, "official provider links open safely without a live connection");
matches(setup, /Connection details[\s\S]*does not connect this app or grant access/, "research details stay separate from connected capability");
matches(setup, /<dt>Provider network<\/dt><dd>Disabled<\/dd>/, "no provider networking is implied");
matches(setup, /data-testid="bot-provider-connection"[\s\S]*?Not connected/, "a saved label is not represented as a connection");
matches(setup, /Live status, task control, and checkout are unavailable/, "setup remains honest about live features");
matches(setup, /savingRef\.current \|\| !selected/, "rapid repeated submission cannot create duplicate installations");
matches(setup, /setEditing\(saved\)/, "successful creation becomes an edit rather than a repeat-create action");
matches(setup, /saveError\?\.savedRecord[\s\S]*setEditing\(saveError\.savedRecord\)/, "a saved record is retained after refresh failure to avoid duplicate retry creates");
matches(setup, /role="status"[\s\S]*role="alert"/, "save outcomes and failures are announced");
matches(setup, /Saved in this browser on this device/, "local installation persistence is not described as cloud sync");
matches(setup, /CREDENTIAL\|SECRET\|AUTHORITY\|RAW_PROVIDER/, "rejected secret-bearing input gets readable guidance");
matches(page, /service\.createManualPlan\(input\)/, "new plans use the atomic domain service");
matches(page, /service\.updateManualPlan\(existing\.id, input, existing\.recordVersion\)/, "manual edits retain optimistic record versions");
matches(page, /refreshError\.savedRecord = saved\.task \|\| saved/, "saved plans survive a post-write refresh error without a duplicate retry");
matches(overview, /Bot success[^<]*Purchase/, "bot success stays distinct from Purchase");
matches(overview, /checkout evidence[^<]*Purchase/, "checkout evidence stays distinct from Purchase");
matches(activity, /requiresOwnerReview/, "checkout evidence uses the persisted owner-review boundary including reconciled records");
matches(page, /Account Ops/i, "retailer-account assignments reference Account Ops");

excludes(presentation, /dangerouslySetInnerHTML/, "Bot metadata is never injected as raw HTML");
excludes(presentation, />\s*(?:Start|Restart|Checkout|Purchase|Buy Now)\s*</i, "normal UI exposes no live task or purchasing controls");
excludes(presentation, /(?:Hayha|Stellar)[\s\S]{0,80}(?:Connected|Healthy|Running)/, "unconfigured providers are not represented as connected");
excludes(presentation, /(?:password|accessToken|refreshToken|proxyPassword|cvv)\s*[:=]/i, "presentation code contains no secret-bearing model fields");
excludes(setup, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/, "setup cannot create network connections or bypass the domain persistence service");
excludes(page, /REMOTE_ACTIVE|OWNER_CONFIRMED_CUTOVER/, "presentation cannot activate persistence cutover");
excludes(page, /(?:create|import)Purchase\s*\(/, "Bot Operations cannot create a Purchase");
excludes(page, /receiveInventory\s*\(|createInventory\s*\(/, "Bot Operations cannot mutate inventory");

matches(styles, /min-height:\s*44px/, "interactive Bot controls meet the touch-target minimum");
matches(styles, /overflow-wrap:\s*anywhere/, "long identifiers wrap safely");
matches(styles, /@media \(max-width:\s*700px\)/, "mobile layouts are explicit");
excludes(styles, /button:nth-of-type\(3\)\s*\{\s*display:\s*none/, "Task Groups remains reachable from mobile navigation");
matches(styles, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/, "wide layouts use responsive card grids instead of fixed tables");
matches(styles, /@media \(prefers-reduced-motion:\s*reduce\)/, "reduced motion is respected");
matches(styles, /minmax\(0,\s*1fr\)/, "responsive grids permit children to shrink without overflow");

console.log(`Code 3 Bot Operations UI contract: ${assertions} assertions passed.`);
