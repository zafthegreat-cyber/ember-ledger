import assert from "node:assert/strict";
import {
  INBOX_ORDER_CONFIDENCE,
  MESSAGE_CATEGORIES,
  ORDER_STATES,
  PHASE2B1_FIXTURE_CONTEXT,
  PHASE2B1_QA_FIXTURES,
  createOrderCandidateFromEvent,
  identifyRetailer,
  matchRecipientAliases,
  normalizeOrderAmounts,
  normalizeProviderConnectionMetadata,
  normalizeProviderMessage,
  reconcileOrderCandidate,
} from "../src/features/inboxOrder/index.js";

let assertions = 0;
function equal(actual, expected, message) { assertions += 1; assert.equal(actual, expected, message); }
function ok(value, message) { assertions += 1; assert.ok(value, message); }
async function test(name, callback) { await callback(); process.stdout.write(`ok - ${name}\n`); }

const orderFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "order-confirmation");

await test("provider metadata can be healthy only with trusted health evidence", () => {
  assert.throws(
    () => normalizeProviderConnectionMetadata({ provider: "GMAIL", connectionId: "c1", status: "HEALTHY" }),
    (error) => error.code === "HEALTH_EVIDENCE_REQUIRED",
  );
  assertions += 1;
  const connection = normalizeProviderConnectionMetadata({
    provider: "GMAIL",
    connectionId: "c1",
    status: "HEALTHY",
    healthEvidenceAt: "2026-08-27T14:00:00Z",
    grantedScopes: ["MAIL_READ_ONLY"],
  });
  equal(connection.status, "HEALTHY");
  equal(connection.containsProviderSecret, false);
  ok(!JSON.stringify(connection).includes("accessToken"));
});

await test("exact alias matching resolves Account Ops relationships without claiming sender authority", () => {
  const match = matchRecipientAliases(["ORDERS-WALMART@CODE3-FIXTURE.TEST"], PHASE2B1_FIXTURE_CONTEXT.accountOps);
  equal(match.matchType, "EXACT");
  equal(match.selected.aliasId, "alias-walmart");
  equal(match.selected.storeAccountIds[0], "account-walmart");
  equal(match.confidence, "HIGH");
  const retailer = identifyRetailer(
    { sender: "unknown@untrusted.fixture.test", aliasMatch: match },
    PHASE2B1_FIXTURE_CONTEXT.retailerIdentification,
  );
  equal(retailer.proposedRetailerId, "retailer-preset:walmart");
  equal(retailer.confidence, "LOW");
});

await test("trusted sender and exact alias produce explainable retailer confidence", async () => {
  const event = await normalizeProviderMessage(orderFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  equal(event.aliasMatch.selectedAliasId, "alias-walmart");
  equal(event.retailerProposal.proposedRetailerId, "retailer-preset:walmart");
  equal(event.retailerProposal.confidence, INBOX_ORDER_CONFIDENCE.HIGH);
  ok(event.retailerProposal.evidence.some((entry) => entry.kind === "TRUSTED_SENDER_RULE"));
  equal(event.rawContentRetained, false);
  equal(event.purchaseCreated, false);
});

await test("spoofable display text and contradictory retailer evidence cannot produce HIGH confidence", async () => {
  const conflictFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "conflicting-retailer");
  const event = await normalizeProviderMessage(conflictFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  equal(event.retailerProposal.confidence, "LOW");
  ok(event.warnings.includes("RETAILER_ALIAS_SENDER_CONFLICT"));
  const candidate = await createOrderCandidateFromEvent(event);
  equal(candidate.confidence, "LOW");
  const displayOnly = identifyRetailer(
    { sender: { address: "unknown@untrusted.fixture.test", displayName: "Walmart" }, aliasMatch: { selected: null } },
    PHASE2B1_FIXTURE_CONTEXT.retailerIdentification,
  );
  equal(displayOnly.confidence, "INSUFFICIENT");
});

await test("money remains exact in integer minor units", () => {
  const amounts = normalizeOrderAmounts({
    currency: "USD",
    lineItems: [{ title: "Fixture product", quantity: 3, unitPrice: "19.99" }],
    subtotal: "59.97",
    discounts: "5.00",
    tax: "3.85",
    shipping: "4.99",
    total: "63.81",
  });
  equal(amounts.computedLineSubtotal.minorUnits, 5997);
  equal(amounts.computedExpectedTotal.minorUnits, 6381);
  equal(amounts.total.minorUnits, 6381);
  equal(amounts.warnings.length, 0);
  assert.throws(
    () => normalizeOrderAmounts({ currency: "USD", total: "1.001" }),
    (error) => error.code === "EXCESS_PRECISION",
  );
  assertions += 1;
  assert.throws(
    () => normalizeOrderAmounts({ total: { minorUnits: 100, currency: "USD" }, tax: { minorUnits: 5, currency: "CAD" } }),
    (error) => error.code === "CURRENCY_MISMATCH",
  );
  assertions += 1;
});

await test("supplied money conflicts warn instead of silently rewriting", () => {
  const amounts = normalizeOrderAmounts({
    currency: "USD",
    lineItems: [{ title: "Fixture", quantity: 2, unitPrice: "10.00" }],
    subtotal: "21.00",
    discounts: "0.00",
    tax: "0.00",
    shipping: "0.00",
    total: "25.00",
  });
  equal(amounts.subtotal.minorUnits, 2100);
  equal(amounts.computedLineSubtotal.minorUnits, 2000);
  ok(amounts.warnings.includes("SUBTOTAL_LINE_SUM_MISMATCH"));
  ok(amounts.warnings.includes("ORDER_TOTAL_MISMATCH"));
});

await test("Order Candidate is advisory and owner-review-only", async () => {
  const event = await normalizeProviderMessage(orderFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  const candidate = await createOrderCandidateFromEvent(event);
  equal(candidate.systemProposal.orderStatus, ORDER_STATES.CONFIRMED);
  equal(candidate.ownerReview.state, "NEW");
  equal(candidate.ownerReviewRequired, true);
  equal(candidate.automaticImportAllowed, false);
  equal(candidate.purchaseCreated, false);
  equal(candidate.inventoryCreated, false);
  equal(candidate.systemProposal.total.minorUnits, 8025);
});

await test("multi-message reconciliation preserves history and avoids status downgrade", async () => {
  const confirmation = await normalizeProviderMessage(orderFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  const shippedFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "shipped-order");
  const deliveredFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "delivered-order");
  const shipped = await normalizeProviderMessage(shippedFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  const delivered = await normalizeProviderMessage(deliveredFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  const first = await createOrderCandidateFromEvent(confirmation);
  const second = reconcileOrderCandidate(first, shipped);
  const third = reconcileOrderCandidate(second, delivered);
  const lateShipment = reconcileOrderCandidate(third, { ...shipped, id: `${shipped.id}-late` });
  equal(third.sourceEventIds.length, 3);
  equal(third.eventHistory.length, 3);
  equal(third.systemProposal.orderStatus, ORDER_STATES.DELIVERED);
  equal(lateShipment.systemProposal.orderStatus, ORDER_STATES.DELIVERED);
  equal(lateShipment.ownerReview.state, "NEW");
});

await test("protected and unrelated messages do not become Order Candidates", async () => {
  const protectedFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "protected-otp-message");
  const personalFixture = PHASE2B1_QA_FIXTURES.find((fixture) => fixture.id === "unrelated-personal-message");
  const protectedEvent = await normalizeProviderMessage(protectedFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  const personalEvent = await normalizeProviderMessage(personalFixture.input, PHASE2B1_FIXTURE_CONTEXT);
  equal(protectedEvent.category, MESSAGE_CATEGORIES.PROTECTED);
  equal(protectedEvent.retention, "PROTECTED_MINIMUM");
  equal(await createOrderCandidateFromEvent(protectedEvent), null);
  equal(personalEvent.category, MESSAGE_CATEGORIES.OTHER);
  equal(personalEvent.protected, true);
  equal(personalEvent.retention, "DISCARDED_AFTER_CLASSIFICATION");
  equal(personalEvent.subject, "Unrelated message");
  equal(personalEvent.sender.address, null);
  equal(personalEvent.recipientAddresses.length, 0);
  equal(await createOrderCandidateFromEvent(personalEvent), null);
});

console.log(`Code 3 Inbox/Order domain: ${assertions} assertions passed.`);
