import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/features/accountOps/AccountOpsPage.jsx");
const panel = read("src/features/accountOps/operationsFoundation/AccountOpsOperationsPanel.jsx");
const constants = read("src/features/accountOps/operationsFoundation/constants.js");
const contracts = read("src/features/accountOps/operationsFoundation/contracts.js");
const selectors = read("src/features/accountOps/operationsFoundation/selectors.js");
const styles = `${read("src/features/accountOps/account-ops.css")}\n${read("src/features/accountOps/operationsFoundation/account-ops-operations.css")}`;
const routes = read("src/utils/appRouteState.js");

let assertions = 0;
function matches(value, pattern, message) { assertions += 1; assert.match(value, pattern, message); }
function excludes(value, pattern, message) { assertions += 1; assert.doesNotMatch(value, pattern, message); }
function before(value, first, second, message) {
  assertions += 1;
  assert.ok(value.indexOf(first) >= 0 && value.indexOf(first) < value.indexOf(second), message);
}

for (const key of ["overview", "accounts", "identity", "payment", "network", "verification", "automation", "orders", "infrastructure", "activity"]) {
  matches(constants, new RegExp(`key: "${key}"`), `${key} must be part of the unified IA`);
  matches(routes, new RegExp(`"${key}"`), `${key} must support direct Account Ops routing`);
}

matches(page, /ACCOUNT_OPS_OPERATING_AREAS\.map/, "compact and wide navigation should share one IA source");
matches(page, /<OperationsWorkspace label="Account Ops areas" activeKey=\{activeArea\}/, "phones and desktop should use shared accessible workspace navigation");
matches(page, /aria-label=\{`\$\{searchLabelForSection\(activeArea\)\} views`\}/, "contextual navigation should have an accessible label");
matches(page, /Owner Only · Local Foundation/, "the page should label its local OWNER-only boundary");
matches(page, /AccountOpsOperationsPanel area="overview"/, "overview should render the integrated foundation");
matches(page, /AccountOpsOperationsPanel area="accounts"/, "accounts should render the integrated foundation with canonical records");
matches(page, /AccountOpsOperationsPanel area=\{section\}/, "identity through infrastructure should share the coherent panel");
matches(page, /AccountOpsOperationsPanel area="activity"/, "activity should combine derived attention with legacy owner tasks");
before(page, "if (!authorized)", "createAccountOpsService()", "OWNER denial must occur before the Account Ops service/storage is created");

for (const heading of [
  "Operations overview", "Account Creation Assistant", "Account Health Center", "Duplicate protection",
  "Profiles, aliases, and phone resources", "Profile Builder compatibility", "Virtual Cards & Billing Profiles", "Proxy Groups",
  "Verification Inbox", "CAPTCHA Center", "Bot Export Center", "Webhook Hub", "Unified Order Tracker",
  "Servers & Remote Workspaces", "Server Manager", "Cloud Instance Templates", "Remote Sessions",
  "Browser Sessions", "Attention Center", "Notification foundation", "Private search & command center",
]) matches(panel, new RegExp(`title="${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${heading} should be present`);

matches(panel, /Create Account Draft/, "account creation should begin as a local draft");
matches(panel, /owner completes signup, terms, CAPTCHA, MFA, email, and SMS steps/, "account creation should remain owner-assisted");
matches(panel, /does not contact retailers to check account health/, "health should not imply a live retailer check");
matches(panel, /prevent accidental duplicate organization; they never help evade retailer account limits/, "duplicate checks should state their legitimate purpose");
matches(panel, /Full card numbers, security codes, PINs, bank logins, and payment tokens are never permitted/, "payment metadata should clearly exclude secrets");
matches(panel, /Proxy usernames, passwords, authenticated URLs, and live endpoints are excluded/, "proxy metadata should exclude endpoints and authentication");
matches(panel, /does not solve challenges, intercept codes, reuse tokens, accept terms, or bypass account security/, "verification must remain human-controlled");
matches(panel, /Provider capability verified: No · Live connection: No/, "provider readiness must not imply capability");
matches(panel, /Order Candidate is not Purchase\. Delivery is not Receiving\./, "order projections should preserve canonical boundaries");
matches(panel, /does not create cloud instances, start or stop machines, open remote access, harvest browser state, or randomize fingerprints/, "infrastructure must be metadata-only and non-evasive");
matches(panel, /Results navigate; they never execute destructive commands/, "private search should remain navigation-only");
matches(panel, /No push, email, or webhook is sent/, "notification preferences should not send messages");

matches(constants, /Object\.values\(BOT_PROVIDER_CATALOG\)\.map/, "Account Ops readiness should use the shared real-provider catalog");
matches(constants, /readinessState: EXPORT_READINESS_STATES\.NOT_READY/, "provider catalog coverage must not imply working native exports");
matches(constants, /schemaState: EXPORT_SCHEMA_STATES\.UNVERIFIED/, "outbound schemas must remain unverified");
matches(constants, /liveRetailerAccountCreation:\s*false/, "live account creation must remain disabled");
matches(constants, /automaticCaptchaSolving:\s*false/, "automatic CAPTCHA solving must remain disabled");
matches(constants, /automaticMfa:\s*false/, "automatic MFA must remain disabled");
matches(constants, /liveMailboxConnection:\s*false/, "mailbox connections must remain disabled");
matches(constants, /liveBotConnection:\s*false/, "bot connections must remain disabled");
matches(constants, /serverProvisioning:\s*false/, "server provisioning must remain disabled");
matches(constants, /remotePersistence:\s*false/, "remote persistence must remain disabled");
matches(constants, /productionMutation:\s*false/, "Production mutation must remain disabled");
matches(contracts, /persisted:\s*false[\s\S]*authoritative:\s*false/, "operations snapshots should remain ephemeral/non-authoritative");
matches(contracts, /NORMALIZED_OPERATIONS_SNAPSHOTS\s*=\s*new WeakSet/, "trusted normalized snapshots should use private object identity rather than caller-controlled flags");
matches(selectors, /normalizeAccountOpsOperationsSnapshot\(operationsSnapshot \|\| \{\}\)/, "every caller-supplied operations snapshot should pass through strict normalization");
matches(panel, /Verified compatibility[\s\S]*"No"/, "Profile Builder should not claim verified retailer or bot compatibility");
matches(selectors, /navigationOnly:\s*true[\s\S]*destructiveAction:\s*false/, "search results must be navigation-only");

excludes(panel, /dangerouslySetInnerHTML/, "operations metadata must not render as HTML");
excludes(panel, />\s*(?:Connect|Send to Stellar|Send to Hayha|Provision Server|Start Server|Stop Server|Solve CAPTCHA|Accept Terms|Sync|Export Now)\s*</i, "no live automation control may appear");
excludes(panel, /(?:password|token|cookie|otp|cvv|proxyUrl)\s*[:=]\s*["'`][^"'`]+["'`]/i, "the UI must not embed a credential value");
excludes(panel, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/, "the operations panel must not include a network client");
excludes(panel, /localStorage|sessionStorage|indexedDB/, "the operations panel must not persist derived review state");

matches(styles, /\.account-ops-area-picker[\s\S]*min-height:\s*44px/, "the mobile area picker should meet the touch-target minimum");
matches(styles, /\.account-ops-operations-map button,[\s\S]*min-height:\s*52px/, "operations navigation cards should exceed the touch-target minimum");
matches(styles, /overflow-wrap:\s*anywhere/, "long safe metadata should wrap");
matches(styles, /@media \(max-width:\s*430px\)/, "small phones should receive single-column operations layouts");
matches(styles, /@media \(min-width:\s*700px\)/, "tablets should receive expanded operations layouts");
matches(styles, /@media \(min-width:\s*1180px\)/, "desktop should receive expanded operations layouts");
matches(styles, /@media \(prefers-reduced-motion:\s*reduce\)/, "reduced motion should be respected");
matches(styles, /:focus-visible/, "keyboard focus should remain visible");

console.log(`Code 3 Account Ops foundation UI: ${assertions} assertions passed.`);
