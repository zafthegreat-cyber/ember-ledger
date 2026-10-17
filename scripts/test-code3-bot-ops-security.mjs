import assert from "node:assert/strict";
import {
  BOT_OPS_PERSISTENCE_CONTRACT,
  BOT_PROVIDER_KEYS,
} from "../src/features/botOps/constants.js";
import { BOT_OPS_SAFETY_CONTRACT } from "../src/features/botOps/contracts.js";
import { createBotOpsPersistence } from "../src/features/botOps/persistence.js";
import {
  assertSafeBotOpsInput,
  safeBotOpsClone,
  sanitizeBotProviderMessage,
} from "../src/features/botOps/security.js";
import {
  normalizeBotAttempt,
  normalizeBotInstallation,
  normalizeBotTask,
  normalizeCheckoutEvidence,
  normalizeTaskGroup,
} from "../src/features/botOps/validators.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(callback, predicate, message) { assert.throws(callback, predicate, message); assertions += 1; }

for (const value of [
  { ownerId: "forged" },
  { nested: { ownerSubject: "forged" } },
  { nested: [{ role: "OWNER" }] },
  { nested: { session: { authenticated: true } } },
  { nested: { requestedOwnerRole: "OWNER" } },
  { nested: { browserEntitlement: "OWNER" } },
]) {
  throws(() => assertSafeBotOpsInput(value), (error) => error.code === "AUTHORITY_FIELD_REJECTED");
}

for (const value of [
  { botPassword: "synthetic" },
  { retailerPassword: "synthetic" },
  { accessToken: "synthetic" },
  { refresh_token: "synthetic" },
  { cookie: "synthetic" },
  { otp: "000000" },
  { cardNumber: "SYNTHETIC-CARD-NUMBER" },
  { cvv: "000" },
  { proxyPassword: "synthetic" },
  { proxyUsername: "synthetic" },
  { nested: { clientSecret: "synthetic" } },
]) {
  throws(() => assertSafeBotOpsInput(value), (error) => error.code === "SECRET_FIELD_REJECTED");
}

for (const value of [
  { rawPayload: { safeLooking: true } },
  { rawResponse: "synthetic response" },
  { providerLogs: ["synthetic log"] },
  { requestHeaders: { x: "y" } },
]) {
  throws(() => assertSafeBotOpsInput(value), (error) => error.code === "RAW_PROVIDER_DATA_REJECTED");
}

for (const text of [
  `https://provider.invalid/path?${["access", "token"].join("_")}=synthetic`,
  `https://${["fixture-user", "fixture-pass"].join(":")}@proxy.invalid/`,
  "Bearer synthetic-token-value",
  ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
]) {
  throws(() => assertSafeBotOpsInput({ notes: text }), (error) => error.code === "CREDENTIAL_TEXT_REJECTED");
}

assert.doesNotThrow(() => assertSafeBotOpsInput({
  accountOpsStoreAccountId: "store-account:test-001",
  accountOpsProfileId: "profile:test-001",
  shippingProfileReference: "shipping:test-001",
  billingProfileReference: "billing:test-001",
  providerLabel: "Synthetic provider metadata",
}));
assertions += 1;

const source = { nested: { status: "DISCONNECTED" } };
const copy = safeBotOpsClone(source);
copy.nested.status = "CHANGED";
equal(source.nested.status, "DISCONNECTED");
equal(sanitizeBotProviderMessage("  Safe\nsynthetic\tstatus  "), "Safe synthetic status");
equal(sanitizeBotProviderMessage("Bearer synthetic-token-value"), "Provider status was unavailable.");

for (const option of ["mode", "persistenceMode", "remoteDataSource", "request", "explicitRemoteActivation", "remoteActive", "syncEngine", "migrationApply", "rollbackExecutor"]) {
  throws(
    () => createBotOpsPersistence({ [option]: option === "mode" ? "REMOTE_ACTIVE" : {} }),
    (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
    `${option} must not be caller-selectable`,
  );
}

equal(BOT_OPS_PERSISTENCE_CONTRACT.authoritativeMode, "LOCAL_ONLY");
equal(BOT_OPS_PERSISTENCE_CONTRACT.remoteActive, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.liveProviderConnections, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.providerNetworkAccess, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.automaticTaskControl, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.automaticCheckout, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.automaticPurchaseCreation, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.automaticReceiving, false);
equal(BOT_OPS_PERSISTENCE_CONTRACT.automaticInventoryMutation, false);
equal(BOT_OPS_SAFETY_CONTRACT.purchaseMutationAvailable, false);
equal(BOT_OPS_SAFETY_CONTRACT.receivingMutationAvailable, false);
equal(BOT_OPS_SAFETY_CONTRACT.inventoryMutationAvailable, false);
equal(BOT_OPS_SAFETY_CONTRACT.botCredentialsStored, false);
equal(BOT_OPS_SAFETY_CONTRACT.retailerCredentialsStored, false);
equal(BOT_OPS_SAFETY_CONTRACT.proxyCredentialsStored, false);
equal(BOT_OPS_SAFETY_CONTRACT.paymentCredentialsStored, false);

const liveInstallation = {
  provider: BOT_PROVIDER_KEYS.HAYHA,
  friendlyName: "Synthetic Hayha installation",
  enabled: true,
  healthState: "HEALTHY",
};
throws(() => normalizeBotInstallation(liveInstallation), (error) => error.code === "LIVE_INSTALLATION_STATE_PROHIBITED");
throws(
  () => normalizeTaskGroup({ name: "Synthetic group", retailerId: "retailer:test", provider: BOT_PROVIDER_KEYS.STELLAR, installationId: "installation:test", enabled: true }),
  (error) => error.code === "LIVE_TASK_GROUP_PROHIBITED",
);
throws(
  () => normalizeBotTask({ taskGroupId: "group:test", productTargetId: "target:test", retailerId: "retailer:test", provider: BOT_PROVIDER_KEYS.HAYHA, installationId: "installation:test", runtimeStatus: "RUNNING" }),
  (error) => error.code === "LIVE_TASK_STATUS_PROHIBITED",
);
throws(
  () => normalizeBotAttempt({
    providerEventKey: "HAYHA:installation:test:event:test",
    providerEventId: "event:test",
    sourceHash: "a".repeat(64),
    provider: BOT_PROVIDER_KEYS.HAYHA,
    installationId: "installation:test",
    taskId: "task:test",
    retailerId: "retailer:test",
    occurredAt: "2026-08-28T12:00:00.000Z",
  }),
  (error) => error.code === "LIVE_PROVIDER_EVENT_PROHIBITED",
);

const checkoutBase = {
  evidenceKey: "MOCK:installation:test:event:test",
  sourceHash: "b".repeat(64),
  provider: BOT_PROVIDER_KEYS.MOCK,
  installationId: "installation:test",
  taskId: "task:test",
  attemptId: "attempt:test",
  retailerId: "retailer:test",
  productTargetId: "target:test",
  quantity: 1,
  expectedAmount: { minorUnits: 4999, currency: "USD" },
  occurredAt: "2026-08-28T12:00:00.000Z",
  reviewState: "NEEDS_REVIEW",
};
const safeEvidence = normalizeCheckoutEvidence(checkoutBase);
equal(safeEvidence.requiresOwnerReview, true);
equal(safeEvidence.purchaseCreated, false);
equal(safeEvidence.automaticPurchaseCreationAllowed, false);
equal(safeEvidence.inventoryCreated, false);
equal(safeEvidence.automaticReceivingAllowed, false);
for (const violation of [
  { purchaseCreated: true },
  { automaticPurchaseCreationAllowed: true },
  { inventoryCreated: true },
  { automaticReceivingAllowed: true },
  { requiresOwnerReview: false },
]) {
  throws(
    () => normalizeCheckoutEvidence({ ...checkoutBase, ...violation }),
    (error) => error.code === "PURCHASE_BOUNDARY_VIOLATION",
  );
}

ok(BOT_OPS_SAFETY_CONTRACT.futureHandoff.indexOf("OWNER_CONFIRMATION") < BOT_OPS_SAFETY_CONTRACT.futureHandoff.indexOf("PURCHASE_FUTURE"));

console.log(`Code 3 Bot Operations security: ${assertions} assertions passed.`);
