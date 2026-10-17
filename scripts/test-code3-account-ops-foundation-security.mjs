import assert from "node:assert/strict";
import {
  AccountOpsSecurityError,
  assertSafeAccountOpsInput,
  safeAccountOpsClone,
} from "../src/features/accountOps/security.js";

let assertions = 0;

function accepts(value, message) {
  assert.doesNotThrow(() => assertSafeAccountOpsInput(value), message);
  assertions += 1;
}

function rejects(value, expectedCodes, message, forbiddenValue = "") {
  let error;
  try {
    assertSafeAccountOpsInput(value);
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof AccountOpsSecurityError, `${message}: expected an AccountOpsSecurityError`);
  assertions += 1;
  assert.ok(expectedCodes.includes(error.code), `${message}: unexpected code ${error.code}`);
  assertions += 1;
  if (forbiddenValue) {
    assert.equal(JSON.stringify({ message: error.message, details: error.details }).includes(forbiddenValue), false, `${message}: rejected values must not be echoed`);
    assertions += 1;
  }
}

const safeFoundationSnapshot = {
  accountCreationPlans: [{
    id: "creation-plan.synthetic.target",
    retailerId: "retailer-preset:target",
    accountLabel: "Target owner account",
    credentialReference: {
      provider: "EXTERNAL_PASSWORD_MANAGER",
      referenceId: "vault:item-synthetic-target",
      label: "External vault reference",
    },
    status: "WAITING_FOR_MFA",
    warnings: ["Passwords and one-time codes are never stored."],
  }],
  phoneResources: [{
    id: "phone-resource.synthetic.01",
    numberReference: "phone-ref.synthetic.01",
    providerLabel: "Owner-controlled phone service",
    region: "US",
    state: "AVAILABLE",
  }],
  paymentCards: [{
    id: "payment-card.synthetic.01",
    cardAlias: "Purchasing card A",
    providerLabel: "Synthetic issuer",
    last4: "4242",
    expirationMonth: 12,
    expirationYear: 2030,
    status: "AVAILABLE",
    profileId: "profile.synthetic.01",
    retailerId: "retailer-preset:target",
    accountId: "account.synthetic.target",
    spendingLimitMinor: 50_000,
    warnings: [],
    containsFullCardNumber: false,
    containsSecurityCode: false,
  }],
  verificationActions: [{
    id: "verification-action.synthetic.01",
    kind: "CAPTCHA",
    state: "ACTION_REQUIRED",
    challengeState: "WAITING_FOR_USER",
    instructions: "CAPTCHA token is not stored.",
  }],
  proxyGroupViews: [{
    id: "proxy-group.synthetic.01",
    providerLabel: "Synthetic proxy provider",
    type: "ISP",
    region: "US East",
    count: 12,
    health: "HEALTHY",
    latencyMs: 120,
    assignments: ["provider:stellar"],
    expiration: "2027-01-01T00:00:00.000Z",
    warnings: ["Proxy username is unavailable."],
  }],
  exportReadiness: [{
    provider: "STELLAR",
    compatibilityStatus: "READY_FOR_PREVIEW",
    supportedExportTypes: ["OFFLINE_PREVIEW"],
    verifiedSchemaStatus: "PARTIALLY_RECOGNIZED",
  }],
  webhookIntegrations: [{
    id: "webhook.synthetic.01",
    provider: "FUTURE_PROVIDER",
    direction: "INBOUND",
    eventTypes: ["ACCOUNT_ATTENTION"],
    enabled: false,
    health: "NOT_CONFIGURED",
    containsSecret: false,
  }],
  serverRecords: [{
    id: "server.synthetic.01",
    friendlyName: "Local runner preview",
    provider: "METADATA_ONLY",
    region: "US East",
    osLabel: "Windows",
    purpose: "BOT_RUNNER",
    status: "OFFLINE",
  }],
  cloudTemplates: [{
    id: "template.synthetic.monitor",
    provider: "FUTURE_CLOUD",
    region: "US East",
    sizeClass: "SMALL",
    estimatedCostMinor: 0,
    purpose: "LIGHTWEIGHT_MONITOR",
  }],
  remoteAccessRecords: [{
    id: "remote-access.synthetic.01",
    serverId: "server.synthetic.01",
    remoteAccessMethod: "RDP",
    state: "CLOSED",
    lastConnectedAt: null,
  }],
  browserWorkspaces: [{
    id: "browser-workspace.synthetic.01",
    profileId: "profile.synthetic.01",
    retailerId: "retailer-preset:target",
    accountId: "account.synthetic.target",
    state: "CLOSED",
    tabsCount: 0,
    extensionsMetadata: [],
    safeAutofillProfileId: "profile.synthetic.01",
  }],
  orderViews: [{
    id: "order-view.synthetic.01",
    externalOrderReference: "order.synthetic.01",
    retailerId: "retailer-preset:target",
    state: "SHIPPED",
  }],
  notificationPreferences: [{
    category: "Verification",
    channels: ["IN_APP"],
    enabled: false,
  }],
  boundaries: {
    liveRetailerAccountCreation: false,
    automaticCaptchaSolving: false,
    automaticMfa: false,
    liveMailboxConnection: false,
    liveBotConnection: false,
    providerExportWrite: false,
    webhookEndpointConfiguration: false,
    serverProvisioning: false,
    remoteAccessConnection: false,
    browserFingerprintEvasion: false,
    secretStorage: false,
    remotePersistence: false,
    productionMutation: false,
  },
};

accepts(safeFoundationSnapshot, "all exact Phase 2A.6-A structural collection names accept bounded metadata");
assert.deepEqual(safeAccountOpsClone(safeFoundationSnapshot), safeFoundationSnapshot, "safe metadata can be cloned without changing it");
assertions += 1;
assert.notEqual(safeAccountOpsClone(safeFoundationSnapshot), safeFoundationSnapshot, "the safe clone is not the caller's root object");
assertions += 1;

for (const [key, code] of [
  ["ownerSubject", "AUTHORITY_FIELD_REJECTED"],
  ["clientRole", "AUTHORITY_FIELD_REJECTED"],
  ["browserRole", "AUTHORITY_FIELD_REJECTED"],
  ["isOwner", "AUTHORITY_FIELD_REJECTED"],
  ["securityContext", "AUTHORITY_FIELD_REJECTED"],
  ["session", "AUTHORITY_FIELD_REJECTED"],
  ["password", "SECRET_FIELD_REJECTED"],
  ["generatedPassword", "SECRET_FIELD_REJECTED"],
  ["accessToken", "SECRET_FIELD_REJECTED"],
  ["refresh_token_value", "SECRET_FIELD_REJECTED"],
  ["retailerCookie", "SECRET_FIELD_REJECTED"],
  ["otpCode", "SECRET_FIELD_REJECTED"],
  ["verificationCode", "SECRET_FIELD_REJECTED"],
  ["captchaResponse", "SECRET_FIELD_REJECTED"],
  ["captchaSolutionToken", "SECRET_FIELD_REJECTED"],
  ["cardNumber", "SECRET_FIELD_REJECTED"],
  ["paymentCardNumber", "SECRET_FIELD_REJECTED"],
  ["cvv", "SECRET_FIELD_REJECTED"],
  ["proxyUsername", "SECRET_FIELD_REJECTED"],
  ["proxyPassword", "SECRET_FIELD_REJECTED"],
  ["proxyUrl", "SECRET_FIELD_REJECTED"],
  ["proxyEndpoint", "SECRET_FIELD_REJECTED"],
  ["botLicenseKey", "SECRET_FIELD_REJECTED"],
  ["webhookSecret", "SECRET_FIELD_REJECTED"],
  ["privateKey", "SECRET_FIELD_REJECTED"],
  ["retailerCredentials", "SECRET_FIELD_REJECTED"],
  ["providerSession", "SECRET_FIELD_REJECTED"],
  ["rawProviderResponse", "RAW_SOURCE_DATA_REJECTED"],
  ["providerPayload", "RAW_SOURCE_DATA_REJECTED"],
  ["rawBotPayload", "RAW_SOURCE_DATA_REJECTED"],
  ["rawEmailContent", "RAW_SOURCE_DATA_REJECTED"],
  ["requestHeaders", "RAW_SOURCE_DATA_REJECTED"],
  ["providerData", "RAW_SOURCE_DATA_REJECTED"],
]) {
  rejects({ safe: [{ nested: { [key]: "synthetic-forbidden-value" } }] }, [code], `recursive scanner rejects ${key}`, "synthetic-forbidden-value");
}

const constructedJwt = ["eyJ", "syntheticHeader".repeat(2), ".", "syntheticPayload".repeat(2), ".", "syntheticSignature".repeat(2)].join("");
const constructedPrivateKey = ["-----BEGIN ", "PRIVATE KEY", "-----\nsynthetic\n-----END ", "PRIVATE KEY", "-----"].join("");
const constructedHighConfidenceToken = ["gh", "p_", "S".repeat(24)].join("");
const constructedCard = ["4111", "1111", "1111", "1111"].join(" ");
const numericCard = Number(["4111", "1111", "1111", "1111"].join(""));

for (const [value, description] of [
  [["https://synthetic-user", ":synthetic-pass@proxy.invalid:8080"].join(""), "credential-bearing URL"],
  [["synthetic-user", ":synthetic-pass@proxy.invalid:8080"].join(""), "authenticated proxy endpoint"],
  ["https://service.invalid/path?access_token=synthetic-value", "query-string token"],
  ["https://service.invalid/path#captcha_solution=synthetic-value", "CAPTCHA solution URL"],
  ["Bearer synthetic-bearer-value", "Bearer authorization text"],
  ["Basic c3ludGhldGljOnZhbHVl", "Basic authorization text"],
  ["Cookie: retailer-session=synthetic", "cookie header text"],
  ["password: synthetic-password", "structured password text"],
  ["one-time code is 123456", "labeled OTP text"],
  ["CAPTCHA response=synthetic-response", "labeled CAPTCHA response text"],
  ["proxy username: synthetic-user", "labeled proxy credential text"],
  ["bot license: synthetic-license", "labeled bot-license text"],
  [constructedJwt, "JWT-like token"],
  [constructedPrivateKey, "private-key text"],
  [constructedHighConfidenceToken, "high-confidence standalone token"],
  [`Card on file ${constructedCard}`, "Luhn-valid payment-card text"],
]) {
  rejects({ safeLabel: value }, ["CREDENTIAL_TEXT_REJECTED"], `recursive scanner rejects ${description}`, value);
}

const encodedCredentialUrl = encodeURIComponent(encodeURIComponent(["https://synthetic-user", ":synthetic-pass@proxy.invalid:8080"].join("")));
rejects({ notes: encodedCredentialUrl }, ["CREDENTIAL_TEXT_REJECTED"], "nested URL encoding cannot hide credential-bearing text", encodedCredentialUrl);
rejects({ safeNumber: numericCard }, ["PAYMENT_VALUE_REJECTED"], "numeric Luhn-valid payment-card data is rejected", String(numericCard));

accepts({ paymentCards: [{ last4: "4242", expirationMonth: 10, expirationYear: 2031 }] }, "bounded virtual-card display metadata remains safe");
accepts({ identifiers: { upc: ["4111", "1111", "1111", "1111"].join(""), gtin: numericCard } }, "known product checksum identifiers do not become false-positive payment cards");
accepts({ identifiers: { upc: [["4111", "1111", "1111", "1111"].join("")] } }, "product checksum context is preserved through arrays");
accepts({ credentialReference: { provider: "EXTERNAL_PASSWORD_MANAGER", referenceId: "vault:item-safe", label: "Safe reference" } }, "existing credential-reference metadata remains supported");
accepts({ credentialProvider: "EXTERNAL_PASSWORD_MANAGER", credentialReferenceId: "vault:item-safe" }, "flattened credential-reference metadata remains supported");
accepts({ warnings: ["CAPTCHA token is not stored.", "Proxy username is unavailable.", "OTP values are never retained.", "Basic authentication is not configured."] }, "negative security guidance is not mistaken for credential content");
accepts({ tokenizationStatus: "NOT_CONFIGURED", providerLabel: "Metadata only" }, "unrelated bounded metadata containing a token word fragment remains valid");
rejects({ containsSecret: true }, ["SECRET_FIELD_REJECTED"], "sensitive-data exclusion markers cannot be enabled");
rejects({ containsSecurityCode: "false" }, ["SECRET_FIELD_REJECTED"], "sensitive-data exclusion markers require literal false");
rejects({ boundaries: { secretStorage: true } }, ["SECRET_FIELD_REJECTED"], "no-secret-storage boundary cannot be enabled");

rejects(JSON.parse('{"safe":{"__proto__":{"polluted":true}}}'), ["PROTOTYPE_KEY_REJECTED"], "prototype-pollution keys are rejected");
rejects({ nested: Object.create({ unsafe: true }) }, ["UNSAFE_OBJECT"], "non-plain nested objects are rejected");
const cyclic = { label: "synthetic" };
cyclic.self = cyclic;
rejects(cyclic, ["CYCLIC_INPUT"], "cyclic structures are rejected");
rejects({ latencyMs: Number.NaN }, ["NON_FINITE_NUMBER"], "non-finite numeric metadata is rejected");
const arrayWithNamedProperty = [];
arrayWithNamedProperty.safeLabel = "synthetic";
rejects(arrayWithNamedProperty, ["UNSAFE_OBJECT"], "named array properties are rejected");
const accessorObject = {};
Object.defineProperty(accessorObject, "safeLabel", { enumerable: true, get: () => "synthetic" });
rejects(accessorObject, ["UNSAFE_OBJECT"], "accessor properties are rejected without invoking the getter");
const symbolObject = { label: "synthetic" };
symbolObject[Symbol("hidden")] = "synthetic";
rejects(symbolObject, ["UNSAFE_OBJECT"], "symbol properties are rejected");

console.log(`Code 3 Account Ops foundation security: ${assertions} assertions passed.`);
