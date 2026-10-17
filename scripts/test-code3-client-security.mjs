import assert from "node:assert/strict";
import fs from "node:fs";

import { canAccessOwnerCenter } from "../src/features/ownerCenter/ownerAuthorization.js";
import { nextOwnerSessionRecheckDelay, OWNER_SESSION_RECHECK_MS } from "../src/services/ownerSessionTiming.js";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("src/App.jsx");
const ownerSession = read("src/services/ownerSession.js");
const ebayClient = read("src/features/flipScout/ebayClient.js");
const ownerPage = read("src/features/ownerCenter/OwnerCenterPage.jsx");
const clientSource = [app, ownerSession, ebayClient, ownerPage].join("\n");

assert.equal(canAccessOwnerCenter({ session: { authenticated: true, ownerAuthorized: true } }), true);
assert.equal(canAccessOwnerCenter({ session: { authenticated: true, ownerAuthorized: false }, currentUserProfile: { appRole: "owner" } }), false);
assert.equal(canAccessOwnerCenter({ session: { authenticated: false, ownerAuthorized: true } }), false);
assert.match(app, /isLocalDevelopmentIdentityEnabled/);
assert.match(app, /authSessionVersion/);
assert.match(app, /setAuthSessionVersion\(\(current\) => current \+ 1\)/);
assert.match(app, /nextOwnerSessionRecheckDelay\(nextSession\.expiresAt\)/);
assert.doesNotMatch(app, /const BETA_LOCAL_MODE = runtimeParams\?\.get\("betaLocalMode"\) === "true" \|\|/);
assert.match(ownerSession, /development && isLoopbackHostname/);
assert.match(ownerSession, /supabase\.auth\.getSession/);
assert.match(ownerSession, /response\.ok && payload\.authenticated === true && payload\.ownerAuthorized !== true/);
assert.match(ebayClient, /getOwnerRequestHeaders/);
assert.match(ownerPage, /Sign In Required/);
assert.match(ownerPage, /Owner Access Required/);
assert.match(ownerPage, /\[initialSection, initialSubsection\]/, "mounted Owner Center routes must follow Back\/Forward state");
assert.match(ownerPage, /onSectionChange\?\.\(nextSection, nextSubsection\)/, "Owner Center tab changes must update canonical route state");
assert.doesNotMatch(app, /useState\(\(\) => createOwnerCenterRepository\(\)\.load\(\)/, "Owner Center data must not be parsed before verified authorization");
assert.doesNotMatch(clientSource, /EBAY_CLIENT_SECRET\s*=|process\.env\.EBAY_CLIENT_SECRET/);
assert.doesNotMatch(clientSource, /access_token[^\n]{0,80}(console|JSON\.stringify)/i);
assert.equal(nextOwnerSessionRecheckDelay("2026-08-19T12:10:00.000Z", Date.parse("2026-08-19T12:00:00.000Z")), OWNER_SESSION_RECHECK_MS);
assert.equal(nextOwnerSessionRecheckDelay("2026-08-19T12:00:01.000Z", Date.parse("2026-08-19T12:00:00.000Z")), 1250);
assert.equal(nextOwnerSessionRecheckDelay("2026-08-19T11:59:00.000Z", Date.parse("2026-08-19T12:00:00.000Z")), 250);

console.log("Code 3 client session and credential-boundary checks passed.");
