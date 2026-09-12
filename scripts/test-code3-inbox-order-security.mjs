import assert from "node:assert/strict";
import {
  PHASE2B1_FIXED_NOW,
  PHASE2B1_FIXTURE_CONTEXT,
  PHASE2B1_QA_FIXTURES,
  assertSafeInboxOrderInput,
  containsProtectedSecretText,
  createInboxOrderService,
  normalizeProviderConnectionMetadata,
} from "../src/features/inboxOrder/index.js";
import { createVerifiedBackup } from "../src/features/backup/index.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

let assertions = 0;
function rejects(value, code) {
  assert.throws(() => assertSafeInboxOrderInput(value), (error) => error.code === code);
  assertions += 1;
}

for (const value of [
  { ownerId: "forged" },
  { nested: { ownerSubject: "forged" } },
  { nested: [{ role: "OWNER" }] },
  { nested: { session: { valid: true } } },
  { nested: { authorization: "Bearer synthetic" } },
]) rejects(value, "AUTHORITY_FIELD_REJECTED");

for (const value of [
  { accessToken: "synthetic" },
  { nested: { refresh_token: "synthetic" } },
  { nested: { password: "synthetic" } },
  { nested: { otp: "123456" } },
  { nested: { clientSecret: "synthetic" } },
  { nested: { sessionToken: "synthetic" } },
  { nested: { oauthState: "synthetic" } },
  { nested: { authorizationCode: "synthetic" } },
  { nested: { providerCredential: "synthetic" } },
]) rejects(value, "SECRET_FIELD_REJECTED");

rejects({ trackingReference: "https://carrier.invalid/track?token=synthetic" }, "CREDENTIAL_URL_REJECTED");

rejects({ rawBody: "not normalized" }, "RAW_CONTENT_REJECTED");
assert.doesNotThrow(() => assertSafeInboxOrderInput({ content: "ephemeral" }, { allowRawContent: true }));
assertions += 1;

assert.throws(
  () => normalizeProviderConnectionMetadata({ provider: "GMAIL", connectionId: "c1", status: "DISCONNECTED", refreshToken: "synthetic" }),
  (error) => error.code === "SECRET_FIELD_REJECTED",
);
assertions += 1;

await assert.rejects(
  () => import("../src/features/inboxOrder/messageNormalization.js").then(({ normalizeProviderMessage }) => normalizeProviderMessage({
    provider: "SYNTHETIC",
    providerConnectionId: "connection-1",
    providerMessageId: "message-unsafe-metadata",
    sender: "orders@orders.fixture-walmart.test",
    recipients: ["orders-walmart@code3-fixture.test"],
    subject: "Order",
    receivedAt: PHASE2B1_FIXED_NOW,
    providerMetadata: { preview: `Code ${"654" + "321"}` },
  }, PHASE2B1_FIXTURE_CONTEXT)),
  (error) => error.code === "UNSAFE_PROVIDER_METADATA",
);
assertions += 1;

const protectedFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "protected-otp-message");
const resetFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "password-reset-message");
const storage = new MemoryStorage();
let id = 0;
const service = createInboxOrderService({
  storage,
  now: () => PHASE2B1_FIXED_NOW,
  idFactory: (prefix) => `${prefix}:security-${id += 1}`,
});
const logged = [];
const originalLog = console.log;
console.log = (...values) => logged.push(values.join(" "));
let protectedResult;
let resetResult;
let numberFirstOtpResult;
try {
  protectedResult = await service.processMessage(protectedFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  resetResult = await service.processMessage(resetFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  numberFirstOtpResult = await service.processMessage({
    provider: "SYNTHETIC",
    providerConnectionId: "connection-fixture-1",
    providerMessageId: "message-number-first-otp",
    sender: "security@accounts.fixture.test",
    recipients: ["orders-walmart@code3-fixture.test"],
    subject: `731942 is your Walmart code`,
    receivedAt: PHASE2B1_FIXED_NOW,
    category: "VERIFICATION",
    content: "Enter it to continue.",
  }, PHASE2B1_FIXTURE_CONTEXT);
} finally {
  console.log = originalLog;
}
const serializedResults = JSON.stringify([protectedResult, resetResult]);
const serializedStorage = [...storage.values.values()].join("\n");
for (const sentinel of [protectedFixture.secretSentinel, resetFixture.secretSentinel]) {
  assert.equal(serializedResults.includes(sentinel), false);
  assert.equal(serializedStorage.includes(sentinel), false);
  assert.equal(logged.join("\n").includes(sentinel), false);
  assertions += 3;
}
assert.equal(protectedResult.event.protected, true);
assert.equal(protectedResult.event.sender.address, null);
assert.equal(protectedResult.candidate, null);
assert.equal(resetResult.candidate, null);
assertions += 4;

const numberFirstOtpSentinel = "731942";
assert.equal(containsProtectedSecretText(`${numberFirstOtpSentinel} is your Walmart code`), true);
assert.equal(numberFirstOtpResult.event.category, "PROTECTED");
assert.equal(numberFirstOtpResult.event.protected, true);
assert.equal(numberFirstOtpResult.candidate, null);
assert.equal(JSON.stringify(numberFirstOtpResult).includes(numberFirstOtpSentinel), false);
assert.equal([...storage.values.values()].join("\n").includes(numberFirstOtpSentinel), false);
assert.equal(logged.join("\n").includes(numberFirstOtpSentinel), false);
assert.equal(JSON.stringify(await service.listActivity()).includes(numberFirstOtpSentinel), false);
const protectedBackup = await createVerifiedBackup({
  localStorage: storage,
  sessionStorage: new MemoryStorage(),
  createdAt: PHASE2B1_FIXED_NOW,
});
assert.equal(protectedBackup.json.includes(numberFirstOtpSentinel), false);
assertions += 9;

assert.equal("importPurchase" in service, false);
assert.equal("createPurchase" in service, false);
assert.equal("receiveInventory" in service, false);
assert.equal("delete" in service, false);
assertions += 4;

const unrelated = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "unrelated-personal-message");
const personal = await service.processMessage(unrelated.input, PHASE2B1_FIXTURE_CONTEXT);
assert.equal(personal.candidate, null);
assert.equal(personal.event.retention, "DISCARDED_AFTER_CLASSIFICATION");
assert.equal(personal.event.subject, "Unrelated message");
assert.equal(personal.event.sender.address, null);
assert.equal(personal.event.recipientAddresses.length, 0);
assert.equal(JSON.stringify(personal).includes("Dinner plans"), false);
assert.equal(JSON.stringify(personal).includes("See you later"), false);
assertions += 7;

const nestedProtected = await service.processMessage({
  provider: "SYNTHETIC",
  providerConnectionId: "connection-fixture-1",
  providerMessageId: "message-nested-protected",
  sender: "security@accounts.fixture.test",
  recipients: ["orders-walmart@code3-fixture.test"],
  subject: "Account notice",
  receivedAt: PHASE2B1_FIXED_NOW,
  content: { html: `<p>Your security code is ${"112" + "233"}</p>` },
  orderProposal: {
    externalOrderId: "SHOULD-NOT-BECOME-CANDIDATE",
    currency: "USD",
    total: "1.00",
  },
}, PHASE2B1_FIXTURE_CONTEXT);
assert.equal(nestedProtected.event.protected, true);
assert.equal(nestedProtected.candidate, null);
assert.equal(JSON.stringify(nestedProtected).includes("112233"), false);
assertions += 3;

const securityAlert = await service.processMessage({
  provider: "SYNTHETIC",
  providerConnectionId: "connection-fixture-1",
  providerMessageId: "message-security-alert",
  sender: "security@accounts.fixture.test",
  recipients: ["orders-walmart@code3-fixture.test"],
  subject: "Security alert: new sign-in",
  receivedAt: PHASE2B1_FIXED_NOW,
  content: "Review this account activity.",
}, PHASE2B1_FIXTURE_CONTEXT);
assert.equal(securityAlert.event.category, "PROTECTED");
assert.equal(securityAlert.event.subject, "Protected account message");
assert.equal(securityAlert.candidate, null);
assertions += 3;

console.log(`Code 3 Inbox/Order security: ${assertions} assertions passed.`);
