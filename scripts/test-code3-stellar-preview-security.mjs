import assert from "node:assert/strict";
import {
  PHASE_2DB2_STELLAR_PREVIEW_FIXTURES,
  STELLAR_PREVIEW_FORMAT_STATES,
  STELLAR_PREVIEW_SECURITY_CATEGORIES,
  previewStellarTaskExportText,
  scanStellarTaskExportSecurity,
  stellarPreviewFixtureRawText,
} from "../src/features/botOps/importPreview/index.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }

const securityFixtures = PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.filter((fixture) => fixture.expectedSecurityCategory);
ok(securityFixtures.length >= 29, "security coverage should include every requested prohibited category, wrapped field, export shape, value scan, and nested case");
for (const fixture of securityFixtures) {
  const result = previewStellarTaskExportText({
    fileName: fixture.file.name,
    mimeType: fixture.file.type,
    text: stellarPreviewFixtureRawText(fixture),
  });
  equal(result.formatRecognitionState, fixture.expectedState, `${fixture.key} must fail closed`);
  equal(result.safeToPreview, false, `${fixture.key} must not produce a preview`);
  equal(result.tasks.length, 0, `${fixture.key} must not retain normalized tasks`);
  ok(result.blockingSecurityFindings.some((finding) => finding.category === fixture.expectedSecurityCategory), `${fixture.key} should report its category only`);
  const serialized = JSON.stringify(result);
  excludes(serialized, /synthetic\.invalid\.value|4111[ -]?1111|access_token=/i, `${fixture.key} must not echo synthetic secret values`);
  excludes(serialized, /\$\.tasks|futureMetadata\.nested|proxyPassword|clientSecret|authorizationHeader/i, `${fixture.key} must not expose sensitive paths or field names`);
}

for (const value of [
  { nested: [{ ownerSubject: "synthetic.invalid" }] },
  { nested: { role: "OWNER" } },
  { nested: { browserRole: "OWNER" } },
]) {
  const scan = scanStellarTaskExportSecurity(value);
  equal(scan.safe, false);
  ok(scan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.AUTHORITY_DATA));
}

const bearer = ["Bearer", "synthetic.invalid.value"].join(" ");
const jwt = ["eyJzeW50aGV0aWMiOiJ0ZXN0In0", "eyJzdWIiOiJ0ZXN0In0", "signature-test-only"].join(".");
for (const text of [bearer, jwt, ["-----BEGIN", "PRIVATE KEY-----"].join(" "), ["-----BEGIN", "ENCRYPTED PRIVATE KEY-----"].join(" ")]) {
  const scan = scanStellarTaskExportSecurity({ note: text });
  equal(scan.safe, false);
  ok(scan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA));
}

for (const text of [
  `https://provider.invalid/path?${["refresh", "token"].join("_")}=synthetic.invalid`,
  `https://${["proxy-user", "proxy-pass"].join(":")}@proxy.invalid:8443`,
  `https://discord.com/api/webhooks/${["123456789", "synthetic.invalid"].join("/")}`,
]) {
  const scan = scanStellarTaskExportSecurity({ note: text });
  equal(scan.safe, false);
  ok(scan.findings.some((finding) => [
    STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL,
    STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA,
  ].includes(finding.category)));
}

const cyclic = {};
cyclic.child = cyclic;
const cyclicScan = scanStellarTaskExportSecurity(cyclic);
equal(cyclicScan.safe, false);
ok(cyclicScan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE));

const unusualPrototype = Object.create({ inherited: true });
unusualPrototype.safeLabel = "synthetic";
const unusualScan = scanStellarTaskExportSecurity(unusualPrototype);
equal(unusualScan.safe, false);
ok(unusualScan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE));

const safeScan = scanStellarTaskExportSecurity({
  tasks: [{ id: "task.synthetic.test", site: "Target", sku: "SKU.TEST", quantity: 1, unknown: { nested: [true, "safe"] } }],
});
equal(safeScan.safe, true);
equal(safeScan.findings.length, 0);

const safeTaskFieldScan = scanStellarTaskExportSecurity({
  taskName: "Synthetic task",
  groupName: "Synthetic group",
  productIdentifier: "SKU.TEST",
  productTitle: "Synthetic product",
  site: "Target",
  status: "MONITORING",
});
equal(safeTaskFieldScan.safe, true, "ordinary allowlisted task metadata must not be mistaken for personal profile data");
equal(safeTaskFieldScan.findings.length, 0);

const contiguousCard = scanStellarTaskExportSecurity({ note: ["4111", "1111", "1111", "1111"].join("") });
equal(contiguousCard.safe, false, "a contiguous Luhn-valid PAN must be detected independently of its field name");
ok(contiguousCard.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA));

const numericCard = scanStellarTaskExportSecurity({ futureReference: 4111111111111111 });
equal(numericCard.safe, false, "a safe-integer numeric Luhn-valid PAN must be detected independently of its field name");
ok(numericCard.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA));

const oversizedKey = scanStellarTaskExportSecurity({ ["x".repeat(161)]: "safe-looking" });
equal(oversizedKey.safe, false, "oversized unknown keys must fail closed before they can reach ignored-field UI");
ok(oversizedKey.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED));

const credentialBearingKey = scanStellarTaskExportSecurity({ [["note", "Bearer", "synthetic.invalid.value"].join(" ")]: "safe-looking" });
equal(credentialBearingKey.safe, false, "credential-shaped text in an unknown field name must not survive into ignored-field UI");
ok(credentialBearingKey.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA));

const credentialUrlKey = scanStellarTaskExportSecurity({ [`note https://provider.invalid/?${["access", "token"].join("_")}=synthetic.invalid`]: "safe-looking" });
equal(credentialUrlKey.safe, false, "credential-bearing URL text in an unknown field name must fail closed");
ok(credentialUrlKey.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL));

for (const key of ["pwd", "pass"]) {
  const scan = scanStellarTaskExportSecurity({ [key]: "synthetic.invalid" });
  equal(scan.safe, false, `${key} must be treated as a credential field`);
  ok(scan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA));
}

for (const [key, category] of [
  ["passwordValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["accessTokenValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["refreshTokenValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["apiKeyValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["cookieValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA],
  ["authorizationValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["sessionState", STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA],
  ["retailerPasswordValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["passwordHash", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["tokenHash", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["paymentProfile", STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA],
  ["cardExpiry", STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA],
  ["cardholderName", STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA],
  ["accountEmail", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["username", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["rawPayloadValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["providerResponseValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["requestHeadersValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["configurationData", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["settingsBackup", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["profileDataValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["usernameValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["emailAddress", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["valueRawPayload", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["myProviderResponse", STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA],
  ["valueProfileData", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["myUsername", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["myEmailAddress", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["myEmail", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["contactEmail", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["userEmail", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["myPhone", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["contactAddress", STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA],
  ["secretValue", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["valueSecret", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["mySecret", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["secretData", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
  ["secret2", STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA],
]) {
  const scan = scanStellarTaskExportSecurity({ [key]: "synthetic.invalid" });
  equal(scan.safe, false, `${key} must fail closed`);
  ok(scan.findings.some((finding) => finding.category === category), `${key} should use its bounded security category`);
}

for (const text of [
  ["AKIA", "ABCDEFGHIJKLMNOP"].join(""),
  ["ghp_", "A".repeat(24)].join(""),
  ["sk", "live", "A".repeat(24)].join("_"),
  ["AIza", "A".repeat(32)].join(""),
  ["xoxb", "1".repeat(12), "A".repeat(24)].join("-"),
]) {
  const scan = scanStellarTaskExportSecurity({ futureReference: text });
  equal(scan.safe, false, "high-confidence standalone token signatures must fail closed under unknown keys");
  ok(scan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA));
}

const profileExport = scanStellarTaskExportSecurity({ profiles: [{ name: "Synthetic Person", email: "owner@example.invalid", address: "123 Example Street" }] });
equal(profileExport.safe, false, "profile exports must be rejected before format recognition");
ok(profileExport.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA));

const proxyExport = scanStellarTaskExportSecurity({ proxy: "proxy.example.invalid:8080:synthetic-user:synthetic-pass" });
equal(proxyExport.safe, false, "proxy exports must fail closed regardless of value shape");
ok(proxyExport.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA));

const encodedCredentialUrl = scanStellarTaskExportSecurity({ note: "https://provider.invalid/callback?access%5Ftoken=synthetic.invalid" });
equal(encodedCredentialUrl.safe, false, "percent-encoded credential query names must not bypass URL screening");
ok(encodedCredentialUrl.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL));

for (const key of ["future\nlabel", "future\u202elabel"]) {
  const scan = scanStellarTaskExportSecurity({ [key]: "safe-looking" });
  equal(scan.safe, false, "control and bidi field names must not reach ignored-field UI");
  ok(scan.findings.some((finding) => finding.category === STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE));
}

const mixedFixture = PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.find((fixture) => fixture.key === "mixed-safe-and-unsafe");
const mixed = previewStellarTaskExportText({
  fileName: mixedFixture.file.name,
  mimeType: mixedFixture.file.type,
  text: stellarPreviewFixtureRawText(mixedFixture),
});
equal(mixed.formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.UNSAFE);
equal(mixed.summary.safeRecognizedTaskCount, 0, "one prohibited field blocks the entire file before normalization");
equal(mixed.tasks.length, 0);

for (const finding of mixed.blockingSecurityFindings) {
  ok(Object.keys(finding).every((key) => ["category", "count", "message"].includes(key)), "security findings remain category-level");
  excludes(finding.message, /\$|\[|\]|synthetic\.invalid/i, "security messages contain no path or secret value");
}

console.log(`Code 3 Stellar export preview security: ${assertions} assertions passed across ${securityFixtures.length} blocking fixtures.`);
