import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fetchAccountOpsProviderConnections,
  normalizeProviderConnectionsPayload,
} from "../src/services/accountOpsProviderApi.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const page = read("src/features/accountOps/AccountOpsPage.jsx");
const providerFoundation = read("src/features/accountOps/InboxOrderFoundation.jsx");
const providerApi = read("src/services/accountOpsProviderApi.js");
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

const safeProviderPayload = normalizeProviderConnectionsPayload({
  configurationState: "AVAILABLE",
  providerCapabilities: [{ authorizationStatus: "UNAVAILABLE" }],
  runtime: {
    oauthStateStorage: { available: false, kind: "UNAVAILABLE" },
    secretStorage: { available: false, kind: "UNAVAILABLE" },
  },
  connections: [{
    connectionId: "connection:fixture-0001",
    provider: "gmail",
    connectedAccountLabel: "Synthetic account",
    status: "HEALTHY",
    grantedScopesSummary: ["Read-only order metadata"],
    capabilityFlags: { listBoundedMessageMetadata: true, sendMail: false },
  }],
  warnings: [],
});
assert.equal(safeProviderPayload.connections[0].capabilities.listBoundedMessageMetadata, true);
assert.equal(safeProviderPayload.connections[0].capabilities.sendMail, false);
assertions += 2;
assert.throws(
  () => normalizeProviderConnectionsPayload({ configurationState: "AVAILABLE", accessToken: "synthetic" }),
  (error) => error.code === "UNSAFE_RESPONSE",
);
assertions += 1;
const fetchedProviderPayload = await fetchAccountOpsProviderConnections({
  getRequestHeadersImpl: async () => ({ "X-Code3-Local-Dev": "1" }),
  fetchImpl: async () => new Response(JSON.stringify({
    ok: true,
    configurationState: "NOT_CONFIGURED",
    connections: [],
    providerCapabilities: [{ providerId: "gmail", authorizationStatus: "UNAVAILABLE" }],
    warnings: ["No live provider is configured."],
    runtime: {
      available: false,
      oauthStateStorage: { available: false, kind: "UNAVAILABLE" },
      secretStorage: { available: false, kind: "UNAVAILABLE" },
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } }),
});
assert.equal(fetchedProviderPayload.configurationState, "NOT_CONFIGURED");
assert.equal(fetchedProviderPayload.connections.length, 0);
assertions += 2;

matches(app, /lazy\(\(\) => import\("\.\/features\/accountOps\/AccountOpsPage"\)\)/, "Account Ops should remain route-split");
matches(app, /<AccountOpsPage[\s\S]*session=\{ownerSession\}/, "Account Ops should receive the verified owner session");
matches(app, /ownerCenterAuthorized \? \{ key: "account-ops", label: "Account Ops"/, "Account Ops navigation should require verified owner authorization");
matches(routes, /\["overview", "profiles", "emails", "accounts", "tasks", "connections", "inbox", "orders"\]/, "Account Ops should expose the approved sections and honest provider foundations");
matches(routes, /return \{ activeTab: "accountOps", accountOpsSection \}/, "direct Account Ops routes should restore section state");

matches(page, /OWNER_SESSION_STATES\.SIGN_IN_REQUIRED[\s\S]*title="Sign In Required"/, "the sign-in-required state should be compact and explicit");
matches(page, /OWNER_SESSION_STATES\.OWNER_ACCESS_REQUIRED[\s\S]*title="Owner Access Required"/, "the non-owner state should be compact and explicit");
matches(page, /if \(!authorized\)[\s\S]*No Account Ops records were loaded/, "private Account Ops data should stay unloaded without verified authorization");
matches(page, /if \(!authorized\) \{[\s\S]*setService\(null\)[\s\S]*return;[\s\S]*createAccountOpsService\(\)/, "the local service should be constructed only after authorization");
matches(page, /lazy\(\(\) => import\("\.\/InboxOrderFoundation\.jsx"\)\)/, "provider and order foundations should remain lazy inside the Account Ops route");
matches(page, /if \(!authorized\) return[\s\S]*<InboxOrderFoundation section=\{section\}/, "the provider foundation should render only after the existing verified-owner return boundary");

matches(page, /SECTIONS\.slice\(0, 3\)/, "mobile section navigation should keep three primary choices");
matches(page, /<summary>More<\/summary>/, "secondary Account Ops sections should use progressive disclosure on mobile");
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

matches(providerFoundation, /title="Provider Connections"[\s\S]*Foundation Only/, "provider connections should present an honest foundation state");
matches(providerFoundation, /No mailbox connected/, "provider connections should have an honest disconnected empty state");
matches(providerFoundation, /Code 3 is not reading a mailbox\./, "Inbox should not imply live mailbox access");
matches(providerFoundation, /An Order Candidate is evidence, not a Business Purchase\./, "order candidates should stay separate from business purchases");
matches(providerFoundation, /This phase cannot create purchases, receive inventory, or change business records\./, "order review should remain non-mutating");
matches(providerFoundation, /No sample messages are shown as real data\./, "synthetic fixtures should not be presented as live mailbox content");
matches(providerApi, /ACCOUNT_OPS_PROVIDER_CONNECTIONS_PATH = "\/api\/account-ops\/provider-connections"/, "the provider client should use only the protected provider-connections prefix");
matches(providerApi, /method !== "GET" \|\| options\.body !== undefined/, "the Phase 2B1 provider client should remain read-only");
matches(providerApi, /options\.headers !== undefined[\s\S]*Caller-supplied provider request headers are not allowed/, "callers should not inject authorization or provider headers");
matches(providerApi, /assertNoProviderSecrets\(payload\)/, "provider responses should be rejected if credential material is returned");
matches(providerApi, /PROHIBITED_RESPONSE_VALUE/, "provider display strings should be screened for credential material");
matches(providerApi, /authorizationstatus[\s\S]*oauthstatestorage[\s\S]*secretstorage|isProhibitedResponseKey/, "safe provider-status metadata should remain distinguishable from credential fields");
matches(providerApi, /content-type[\s\S]*application\/json/, "SPA fallback HTML should not be mistaken for a trusted provider response");

matches(styles, /min-height:\s*44px/, "key Account Ops controls should meet the 44px touch-target minimum");
matches(styles, /overflow-wrap:\s*anywhere/, "long aliases and retailer names should wrap safely");
matches(styles, /@media \(min-width: 980px\)[\s\S]*account-ops-mobile-list[\s\S]*account-ops-desktop-table/, "desktop tables should not replace mobile cards at narrow widths");
matches(styles, /@media \(max-width: 699px\)/, "Account Ops should include explicit mobile layout rules");
matches(styles, /@media \(prefers-reduced-motion: reduce\)/, "Account Ops should respect reduced motion");

excludes(page, /dangerouslySetInnerHTML/, "Account Ops should not render record data as raw HTML");
excludes(providerFoundation, /dangerouslySetInnerHTML/, "provider and order metadata should not render as raw HTML");
excludes(providerFoundation, />\s*Import Purchase\s*</, "Phase 2B1 should not expose an active Purchase import action");
excludes(providerApi, /export async function accountOpsProviderRequest/, "the raw provider response helper should not be a public client API");
excludes(page, /(?:bulk|mass)[ -](?:signup|registration|account creation)/i, "Phase 2A must not expose bulk retailer signup");
excludes(page, /(?:persist|save|store)[A-Za-z]*(?:Password|Secret)\s*\(/, "plaintext password persistence helpers must not be introduced");
excludes(page, /REMOTE_ACTIVE|OWNER_CONFIRMED_CUTOVER/, "the presentation layer must not activate persistence cutover modes");

console.log(`Code 3 Account Ops UI contract passed: ${assertions} assertions.`);
