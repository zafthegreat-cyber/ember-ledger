import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const page = read("src/features/accountOps/AccountOpsPage.jsx");
const styles = read("src/features/accountOps/account-ops.css");
const app = read("src/App.jsx");
const routes = read("src/utils/appRouteState.js");

let assertions = 0;
function matches(value, pattern, message) {
  assertions += 1;
  assert.match(value, pattern, message);
}
function excludes(value, pattern, message) {
  assertions += 1;
  assert.doesNotMatch(value, pattern, message);
}

matches(app, /lazy\(\(\) => import\("\.\/features\/accountOps\/AccountOpsPage"\)\)/, "Account Ops should remain route-split");
matches(app, /<AccountOpsPage[\s\S]*session=\{ownerSession\}/, "Account Ops should receive the verified owner session");
matches(app, /ownerCenterAuthorized \? \{ key: "account-ops", label: "Account Ops"/, "Account Ops navigation should require verified owner authorization");
matches(routes, /\["overview", "profiles", "emails", "accounts", "tasks"\]/, "Account Ops should expose the approved sections");
matches(routes, /return \{ activeTab: "accountOps", accountOpsSection \}/, "direct Account Ops routes should restore section state");

matches(page, /OWNER_SESSION_STATES\.SIGN_IN_REQUIRED[\s\S]*title="Sign In Required"/, "the sign-in-required state should be compact and explicit");
matches(page, /OWNER_SESSION_STATES\.OWNER_ACCESS_REQUIRED[\s\S]*title="Owner Access Required"/, "the non-owner state should be compact and explicit");
matches(page, /if \(!authorized\)[\s\S]*No Account Ops records were loaded/, "private Account Ops data should stay unloaded without verified authorization");
matches(page, /if \(!authorized\) \{[\s\S]*setService\(null\)[\s\S]*return;[\s\S]*createAccountOpsService\(\)/, "the local service should be constructed only after authorization");

matches(page, /SECTIONS\.slice\(0, 3\)/, "mobile section navigation should keep three primary choices");
matches(page, /<summary>More<\/summary>/, "Store Accounts and Tasks should use progressive disclosure on mobile");
matches(page, /title="Account Ops"/, "the workspace should use the approved Code 3 name");
matches(page, /Store Accounts[\s\S]*Ready[\s\S]*Needs Attention[\s\S]*Problem[\s\S]*Email Aliases[\s\S]*Tasks/, "overview metrics should be derived from Account Ops records");
matches(page, /Generate email alias/, "the alias generator should be present");
matches(page, /Generated locally — not provisioned and not yet confirmed to receive mail\./, "generated aliases must not be represented as live");
matches(page, /Receiving Confirmed[\s\S]*Generated Only/, "receiving evidence and local generation should remain distinct");
matches(page, /Code 3 never saves generated passwords/, "the ephemeral-password boundary should be visible");
matches(page, /Verification, CAPTCHA, OTP, and submission remain owner-controlled\./, "retailer security boundaries should remain human-controlled");
matches(page, /Code 3 never submits signup forms, bypasses CAPTCHA or OTP, or manufactures verification\./, "assisted setup should disclose its non-automation boundary");
matches(page, /Credential reference ID[\s\S]*Reference metadata only — never the password\./, "credential storage should use references only");
matches(page, /Account Ops tasks are manual local records in Phase 2A\./, "task automation should not be implied");

matches(styles, /min-height:\s*44px/, "key Account Ops controls should meet the 44px touch-target minimum");
matches(styles, /overflow-wrap:\s*anywhere/, "long aliases and retailer names should wrap safely");
matches(styles, /@media \(min-width: 980px\)[\s\S]*account-ops-mobile-list[\s\S]*account-ops-desktop-table/, "desktop tables should not replace mobile cards at narrow widths");
matches(styles, /@media \(max-width: 699px\)/, "Account Ops should include explicit mobile layout rules");
matches(styles, /@media \(prefers-reduced-motion: reduce\)/, "Account Ops should respect reduced motion");

excludes(page, /dangerouslySetInnerHTML/, "Account Ops should not render record data as raw HTML");
excludes(page, />\s*(?:Inbox|Orders)\s*</, "future Inbox and Orders should not appear as working Phase 2A navigation");
excludes(page, /(?:bulk|mass)[ -](?:signup|registration|account creation)/i, "Phase 2A must not expose bulk retailer signup");
excludes(page, /(?:persist|save|store)[A-Za-z]*(?:Password|Secret)\s*\(/, "plaintext password persistence helpers must not be introduced");
excludes(page, /REMOTE_ACTIVE|OWNER_CONFIRMED_CUTOVER/, "the presentation layer must not activate persistence cutover modes");

console.log(`Code 3 Account Ops UI contract passed: ${assertions} assertions.`);
