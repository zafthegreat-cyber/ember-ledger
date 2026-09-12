import assert from "node:assert/strict";
import {
  PurchaseReceivingSecurityError,
  assertSafePurchaseReceivingInput,
  safePurchaseReceivingClone,
  sanitizePurchaseReceivingNote,
} from "../src/features/purchaseReceiving/security.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function rejects(value, expectedCode) {
  assert.throws(
    () => assertSafePurchaseReceivingInput(value),
    (error) => error instanceof PurchaseReceivingSecurityError && error.code === expectedCode,
  );
  assertions += 1;
}

for (const value of [
  { ownerId: "forged-owner.test" },
  { nested: { ownerSubject: "forged-subject.test" } },
  { nested: [{ role: "OWNER" }] },
  { nested: { session: { status: "AUTHORIZED" } } },
  { nested: { rawClaims: { sub: "forged.test" } } },
  { nested: { clientRole: "OWNER" } },
  { nested: { entitlement: "OWNER" } },
]) rejects(value, "AUTHORITY_FIELD_REJECTED");

for (const value of [
  { password: "synthetic.invalid" },
  { nested: { retailerPassword: "synthetic.invalid" } },
  { nested: { accessToken: "synthetic.invalid" } },
  { nested: { refresh_token: "synthetic.invalid" } },
  { nested: { providerCredential: "synthetic.invalid" } },
  { nested: { cookie: "synthetic.invalid" } },
  { nested: { otp: "000000" } },
  { nested: { securityAnswer: "synthetic.invalid" } },
  { nested: { cardNumber: "4111111111111111" } },
  { nested: { cvv: "000" } },
  { nested: { proxyPassword: "synthetic.invalid" } },
  { nested: { proxyUrl: "http://user.invalid:pass.invalid@proxy.invalid" } },
  { nested: { pwd: "synthetic.invalid" } },
  { nested: { passwd: "synthetic.invalid" } },
  { nested: { accountPin: "0000" } },
  { nested: { accessKey: "synthetic.invalid" } },
  { nested: { sessionKey: "synthetic.invalid" } },
  { nested: { bankRouting: "synthetic.invalid" } },
  { nested: { accountNumber: "synthetic.invalid" } },
  { nested: { proxyUser: "synthetic.invalid" } },
  { nested: { proxyPass: "synthetic.invalid" } },
  { nested: { sessionTokenValue: "synthetic.invalid" } },
  { nested: { cookieValue: "synthetic.invalid" } },
  { nested: { tokenValue: "synthetic.invalid" } },
  { nested: { apiTokenValue: "synthetic.invalid" } },
  { nested: { paymentTokenValue: "synthetic.invalid" } },
  { nested: { passValue: "synthetic.invalid" } },
  { nested: { licenseTokenValue: "synthetic.invalid" } },
]) rejects(value, "SECRET_FIELD_REJECTED");

for (const value of [
  { rawEmail: "synthetic raw content" },
  { nested: { messageBody: "synthetic raw content" } },
  { nested: { rawProviderPayload: { safeLooking: true } } },
  { nested: { rawBotLogs: ["synthetic"] } },
  { nested: { responseBody: "synthetic" } },
  { nested: { emailHtml: "synthetic" } },
  { nested: { headers: { synthetic: true } } },
  { nested: { request: { synthetic: true } } },
  { nested: { providerData: { synthetic: true } } },
  { nested: { sourceData: { synthetic: true } } },
  { nested: { messageContent: "synthetic" } },
  { nested: { emailContent: "synthetic" } },
  { nested: { httpResponse: { synthetic: true } } },
  { nested: { responseData: { synthetic: true } } },
  { nested: { requestData: { synthetic: true } } },
  { nested: { originalMessage: "synthetic" } },
  { nested: { rawHtml: "synthetic" } },
  { nested: { bodyHtml: "synthetic" } },
  { nested: { messageHtml: "synthetic" } },
  { nested: { rawHeaders: { synthetic: true } } },
]) rejects(value, "RAW_SOURCE_DATA_REJECTED");

for (const value of [
  { notes: "Authorization: Bearer synthetic-token-value" },
  { notes: "password = synthetic.invalid" },
  { trackingReference: "https://carrier.invalid/track?token=synthetic.invalid" },
  { notes: "-----BEGIN PRIVATE KEY-----" },
  { proxyReference: "socks5://user.invalid:pass.invalid@proxy.invalid:1080" },
  { note: ["AKIA", "A".repeat(16)].join("") },
  { note: ["ghp_", "A".repeat(36)].join("") },
  { note: ["sk", "live", "A".repeat(24)].join("_") },
  { note: ["AIza", "A".repeat(35)].join("") },
  { note: ["xoxb", "1".repeat(12), "A".repeat(24)].join("-") },
  { note: ["eyJ", "A".repeat(12), ".", "B".repeat(12), ".", "C".repeat(12)].join("") },
  { note: ["4111", "1111", "1111", "1111"].join("") },
  { note: "https://carrier.invalid/track?access%5Ftoken=synthetic.invalid" },
  { note: "https://carrier.invalid/track?access%255Ftoken=synthetic.invalid" },
  { note: "https://carrier.invalid/track?token%253Dsynthetic.invalid" },
  { note: "postgresql://synthetic-user@database.invalid/code3" },
  { note: "rediss://synthetic-user:synthetic-password@redis.invalid:6379" },
  { note: "https%3A%2F%2Fsynthetic-token%40service.invalid" },
  { note: "https://service.invalid/?access%5Ftoken=synthetic.invalid%ZZ" },
  { note: "https://service.invalid/?api%5Fkey=synthetic.invalid%ZZ" },
  { note: "https://service.invalid/?password%3Dsynthetic.invalid%ZZ" },
  { note: Array.from({ length: 4 }).reduce((value) => encodeURIComponent(value), "https://service.invalid/?access_token=synthetic.invalid") },
  { note: "-----BEGIN ENCRYPTED PRIVATE KEY-----" },
  { note: "-----BEGIN DSA PRIVATE KEY-----" },
  { note: "-----BEGIN PGP PRIVATE KEY BLOCK-----" },
  { note: JSON.stringify({ [["access", "token"].join("_")]: "synthetic.invalid" }) },
  { note: "Cookie: sessionid=synthetic.invalid" },
  { note: "Set-Cookie: auth=synthetic.invalid; HttpOnly" },
  { note: ["sb", "secret", "A".repeat(24)].join("_") },
  { note: ["glpat", "A".repeat(24)].join("-") },
  { note: ["npm", "A".repeat(32)].join("_") },
  { note: ["SG", "A".repeat(16), "B".repeat(24)].join(".") },
  { note: "https://service.invalid/callback?client_secret=synthetic.invalid" },
  { note: "https://service.invalid/callback?oauth_state=synthetic.invalid" },
  { note: "https://service.invalid/callback?code_verifier=synthetic.invalid" },
  { note: "https://service.invalid/callback?pkce_verifier=synthetic.invalid" },
  { note: "https://service.invalid/callback?authorization_code=synthetic.invalid" },
  { note: "https://service.invalid/callback?id_token=synthetic.invalid" },
  { note: "https://storage.invalid/file?X-Amz-Credential=synthetic.invalid&X-Amz-Signature=synthetic.invalid" },
  { note: "https://storage.invalid/file?signature=synthetic.invalid" },
]) rejects(value, "CREDENTIAL_TEXT_REJECTED");

for (const value of [
  { myPasswordValue: "synthetic.invalid" },
  { credentialValue: "synthetic.invalid" },
  { valueSecret: "synthetic.invalid" },
  { cardNumberValue: "synthetic.invalid" },
  { myCvvValue: "synthetic.invalid" },
  { proxyPasswordValue: "synthetic.invalid" },
  { sessionCookieValue: "synthetic.invalid" },
  { licenseKey: "synthetic.invalid" },
  { myPanValue: "synthetic.invalid" },
  { paymentPanValue: "synthetic.invalid" },
  { bankAccountValue: "synthetic.invalid" },
  { routingNumberValue: "synthetic.invalid" },
  { cardExpiryValue: "synthetic.invalid" },
  { cardExpirationValue: "synthetic.invalid" },
  { securityQuestion: "synthetic.invalid" },
  { recoveryPhrase: "synthetic.invalid" },
  { seedPhrase: "synthetic.invalid" },
  { encryptionKey: "synthetic.invalid" },
  { signingKey: "synthetic.invalid" },
  { bearer: "synthetic.invalid" },
]) rejects(value, "SECRET_FIELD_REJECTED");

for (const value of [
  { ownerSubjectValue: "synthetic.invalid" },
  { myRoleValue: "OWNER" },
  { owner: true },
  { admin: true },
  { isAdmin: true },
  { adminRole: "OWNER" },
  { authority: "OWNER" },
  { authorized: true },
  { userAuthority: "OWNER" },
  { authenticatedOwner: true },
  { verifiedOwner: true },
  { ownerAccess: true },
  { adminAccess: true },
  { isAuthorized: true },
  { elevatedRole: "OWNER" },
  { accessLevel: "OWNER" },
  { scope: "OWNER" },
  { ownerScopeValue: "OWNER" },
  { permissionLevel: "OWNER" },
  { hasOwnerAccess: true },
  { superuser: true },
  { mySessionId: "synthetic.invalid" },
  { sessionIdentifier: "synthetic.invalid" },
  { authSession: "synthetic.invalid" },
  { sessionValue: "synthetic.invalid" },
  { jwtValue: "synthetic.invalid" },
  { claimValue: "synthetic.invalid" },
  { claimsValue: "synthetic.invalid" },
  { permissionValue: "synthetic.invalid" },
  { entitlementValue: "synthetic.invalid" },
  { userIdValue: "synthetic.invalid" },
  { authState: "synthetic.invalid" },
  { authenticationState: "synthetic.invalid" },
  { authorizationState: "synthetic.invalid" },
  { identityRole: "OWNER" },
  { ownerAllowlist: ["synthetic.invalid"] },
  { ownerPermissions: ["synthetic.invalid"] },
  { authorizedOwner: true },
  { testAuth: true },
  { principal: "synthetic.invalid" },
  { subject: "synthetic.invalid" },
  { privileges: ["OWNER"] },
  { accessControl: "OWNER" },
  { isSuperuser: true },
  { adminFlag: true },
  { ownerFlag: true },
  { isAuthenticated: true },
  { accountRole: "OWNER" },
  { currentRole: "OWNER" },
  { authorityLevel: "OWNER" },
  { ownerStatus: "AUTHORIZED" },
  { sessionData: "synthetic.invalid" },
  { entitlementPlan: "OWNER" },
  { roleFlag: true },
  { principalValue: "synthetic.invalid" },
]) rejects(value, "AUTHORITY_FIELD_REJECTED");

for (const value of [
  { rawPayloadValue: "synthetic.invalid" },
  { providerResponseValue: "synthetic.invalid" },
  { rawWebhookPayload: "synthetic.invalid" },
  { rawOrderEmail: "synthetic.invalid" },
]) rejects(value, "RAW_SOURCE_DATA_REJECTED");

rejects({ note: Number(["4111", "1111", "1111", "1111"].join("")) }, "PAYMENT_VALUE_REJECTED");

const polluted = JSON.parse('{"safe":true,"__proto__":{"polluted":true}}');
rejects(polluted, "PROTOTYPE_KEY_REJECTED");
rejects({ amount: Number.POSITIVE_INFINITY }, "NON_FINITE_NUMBER");
rejects({ amount: 0.1 }, "UNSAFE_NUMBER");
rejects({ note: 1e18 }, "UNSAFE_NUMBER");
rejects({ values: new Array(1_001).fill(0) }, "ARRAY_TOO_LARGE");
rejects({ value: "x".repeat(16_001) }, "STRING_TOO_LONG");

const cyclic = {};
cyclic.self = cyclic;
rejects(cyclic, "CYCLIC_INPUT");

const nonPlain = Object.create({ inherited: true });
nonPlain.value = "synthetic";
rejects(nonPlain, "UNSAFE_OBJECT");

const safe = {
  retailerId: "retailer.synthetic.test",
  externalOrderId: "ORDER-SYNTHETIC-001",
  lineItems: [{ title: "Synthetic product", quantityOrdered: 1, unitPrice: { minorUnits: 1000, currency: "USD" } }],
  warnings: ["SYNTHETIC_FIXTURE"],
  provenance: [{ source: "TEST_FIXTURE", observedAt: "2026-08-31T14:00:00.000Z" }],
};
assert.doesNotThrow(() => assertSafePurchaseReceivingInput(safe));
assertions += 1;
assert.doesNotThrow(() => assertSafePurchaseReceivingInput({
  upc: "1234567890128",
  gtin: "0194252099537",
}));
assertions += 1;
const clone = safePurchaseReceivingClone(safe);
assert.deepEqual(clone, safe);
assertions += 1;
ok(clone !== safe, "safe clone is detached from caller input");
clone.lineItems[0].title = "changed";
equal(safe.lineItems[0].title, "Synthetic product", "safe clone cannot mutate source evidence");

equal(sanitizePurchaseReceivingNote("  Synthetic\nreceiving\t note  "), "Synthetic receiving note");
equal(sanitizePurchaseReceivingNote("password: synthetic.invalid"), "Details were unavailable.");
equal(sanitizePurchaseReceivingNote("x".repeat(700)).length, 500, "sanitized note is bounded");

const logged = [];
const originalError = console.error;
console.error = (...args) => logged.push(args.join(" "));
try {
  try { assertSafePurchaseReceivingInput({ accessToken: "sentinel-secret-value.invalid" }); } catch {}
} finally {
  console.error = originalError;
}
equal(logged.join("\n").includes("sentinel-secret-value.invalid"), false, "security rejection does not log secret values");

console.log(`Code 3 Purchase/Receiving security: ${assertions} assertions passed.`);
