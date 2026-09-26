import { MESSAGE_CATEGORIES, ORDER_STATES, PROVIDER_HEALTH_STATES } from "../constants.js";

export const PHASE2B1_FIXED_NOW = "2026-08-27T14:00:00.000Z";

export const PHASE2B1_FIXTURE_CONTEXT = Object.freeze({
  accountOps: {
    aliases: [
      {
        id: "alias-walmart",
        aliasAddress: "orders-walmart@code3-fixture.test",
        profileId: "profile-business",
        retailerId: "retailer-preset:walmart",
        status: "ACTIVE",
        provisioningState: "RECEIVING_CONFIRMED",
      },
      {
        id: "alias-target",
        aliasAddress: "orders-target@code3-fixture.test",
        profileId: "profile-business",
        retailerId: "retailer-preset:target",
        status: "ACTIVE",
        provisioningState: "RECEIVING_CONFIRMED",
      },
      {
        id: "alias-disabled",
        aliasAddress: "disabled@code3-fixture.test",
        profileId: "profile-business",
        retailerId: "retailer-preset:walmart",
        status: "DISABLED",
        provisioningState: "FAILED",
      },
    ],
    storeAccounts: [
      { id: "account-walmart", aliasId: "alias-walmart", profileId: "profile-business", retailerId: "retailer-preset:walmart" },
      { id: "account-target", aliasId: "alias-target", profileId: "profile-business", retailerId: "retailer-preset:target" },
    ],
  },
  retailerIdentification: {
    senderRules: [
      { retailerId: "retailer-preset:walmart", senderDomains: ["orders.fixture-walmart.test"] },
      { retailerId: "retailer-preset:target", senderDomains: ["orders.fixture-target.test"] },
    ],
  },
});

function message(id, overrides = {}) {
  return {
    provider: "SYNTHETIC",
    providerConnectionId: "connection-fixture-1",
    providerMessageId: id,
    providerThreadId: `thread-${id}`,
    sender: { address: "orders@orders.fixture-walmart.test", displayName: "Fixture Retailer" },
    recipients: ["orders-walmart@code3-fixture.test"],
    subject: "Order update",
    receivedAt: PHASE2B1_FIXED_NOW,
    category: MESSAGE_CATEGORIES.ORDER_CONFIRMATION,
    orderProposal: {
      externalOrderId: "ORDER-1001",
      orderedAt: "2026-08-27T13:00:00.000Z",
      currency: "USD",
      lineItems: [{ providerLineId: "line-1", title: "Synthetic card product", quantity: 2, unitPrice: "40.00" }],
      subtotal: "80.00",
      discounts: "5.00",
      tax: "5.25",
      shipping: "0.00",
      total: "80.25",
      fulfillmentType: "SHIPPING",
      orderStatus: ORDER_STATES.CONFIRMED,
      retailerId: "retailer-preset:walmart",
      storeAccountId: "account-walmart",
      aliasId: "alias-walmart",
      profileId: "profile-business",
    },
    ...overrides,
  };
}

export const PHASE2B1_QA_FIXTURES = Object.freeze([
  {
    id: "disconnected-provider",
    kind: "CONNECTION",
    input: { provider: "GMAIL", connectionId: "connection-disconnected", status: PROVIDER_HEALTH_STATES.DISCONNECTED },
  },
  {
    id: "healthy-provider-metadata",
    kind: "CONNECTION",
    input: {
      provider: "GMAIL",
      connectionId: "connection-healthy",
      connectedAccountLabel: "Fixture mailbox",
      status: PROVIDER_HEALTH_STATES.HEALTHY,
      connectedAt: "2026-08-27T12:00:00.000Z",
      lastHealthyAt: PHASE2B1_FIXED_NOW,
      healthEvidenceAt: PHASE2B1_FIXED_NOW,
      grantedScopes: ["MAIL_READ_ONLY"],
      capabilities: ["BOUNDED_MESSAGE_METADATA"],
    },
  },
  {
    id: "needs-reauth",
    kind: "CONNECTION",
    input: { provider: "OUTLOOK", connectionId: "connection-reauth", status: PROVIDER_HEALTH_STATES.NEEDS_REAUTH, errors: ["AUTHORIZATION_EXPIRED"] },
  },
  { id: "order-confirmation", kind: "MESSAGE", input: message("message-order-confirmation") },
  {
    id: "shipped-order",
    kind: "MESSAGE",
    input: message("message-shipped", {
      category: MESSAGE_CATEGORIES.SHIPPED,
      subject: "Your synthetic order shipped",
      orderProposal: { ...message("base").orderProposal, orderStatus: ORDER_STATES.SHIPPED, trackingReferences: [{ carrier: "Fixture Carrier", reference: "TRACK-1001", status: "IN_TRANSIT" }] },
    }),
  },
  {
    id: "delivered-order",
    kind: "MESSAGE",
    input: message("message-delivered", { category: MESSAGE_CATEGORIES.DELIVERED, orderProposal: { ...message("base").orderProposal, orderStatus: ORDER_STATES.DELIVERED } }),
  },
  {
    id: "cancellation",
    kind: "MESSAGE",
    input: message("message-cancelled", { category: MESSAGE_CATEGORIES.CANCELLED, orderProposal: { ...message("base").orderProposal, orderStatus: ORDER_STATES.CANCELLED } }),
  },
  {
    id: "refund",
    kind: "MESSAGE",
    input: message("message-refund", { category: MESSAGE_CATEGORIES.REFUND, orderProposal: { ...message("base").orderProposal, refundAmount: "20.00", orderStatus: ORDER_STATES.REFUNDED } }),
  },
  {
    id: "partial-cancellation",
    kind: "MESSAGE",
    input: message("message-partial-cancel", { category: MESSAGE_CATEGORIES.CANCELLED, orderProposal: { ...message("base").orderProposal, orderStatus: ORDER_STATES.PARTIALLY_CANCELLED } }),
  },
  {
    id: "pickup-order",
    kind: "MESSAGE",
    input: message("message-pickup", { category: MESSAGE_CATEGORIES.PICKUP, orderProposal: { ...message("base").orderProposal, fulfillmentType: "PICKUP", pickupStoreReference: "fixture-store-1", orderStatus: ORDER_STATES.READY_FOR_PICKUP } }),
  },
  { id: "alias-exact-match", kind: "MESSAGE", input: message("message-alias-match") },
  {
    id: "retailer-inferred",
    kind: "MESSAGE",
    input: message("message-retailer-inferred", { recipients: ["unregistered@code3-fixture.test"], orderProposal: { ...message("base").orderProposal, retailerId: null, aliasId: null, storeAccountId: null } }),
  },
  {
    id: "conflicting-retailer",
    kind: "MESSAGE",
    input: message("message-retailer-conflict", { sender: { address: "orders@orders.fixture-target.test", displayName: "Fixture Retailer" } }),
  },
  { id: "duplicate-provider-message", kind: "MESSAGE", input: message("message-order-confirmation") },
  {
    id: "same-order-multiple-messages",
    kind: "MESSAGE",
    input: message("message-order-followup", { category: MESSAGE_CATEGORIES.SHIPPED, orderProposal: { ...message("base").orderProposal, orderStatus: ORDER_STATES.SHIPPED } }),
  },
  {
    id: "conflicting-totals",
    kind: "MESSAGE",
    input: message("message-total-conflict", { orderProposal: { ...message("base").orderProposal, total: "91.00" } }),
  },
  {
    id: "malformed-money",
    kind: "MESSAGE_ERROR",
    input: message("message-malformed-money", { orderProposal: { ...message("base").orderProposal, total: "80.251" } }),
    expectedError: "EXCESS_PRECISION",
  },
  {
    id: "missing-order-id",
    kind: "MESSAGE",
    input: message("message-missing-order-id", { orderProposal: { ...message("base").orderProposal, externalOrderId: "" } }),
  },
  {
    id: "protected-otp-message",
    kind: "MESSAGE",
    secretSentinel: "731942",
    input: message("message-protected-otp", {
      category: MESSAGE_CATEGORIES.VERIFICATION,
      subject: "Your verification code",
      content: `Use code ${"731" + "942"} to continue.`,
      orderProposal: undefined,
    }),
  },
  {
    id: "password-reset-message",
    kind: "MESSAGE",
    secretSentinel: "fixture-reset-secret",
    input: message("message-password-reset", {
      category: MESSAGE_CATEGORIES.PASSWORD_SECURITY,
      subject: "Password reset requested",
      content: `Reset link: https://accounts.invalid/reset?token=${"fixture-reset-" + "secret"}`,
      orderProposal: undefined,
    }),
  },
  {
    id: "unrelated-personal-message",
    kind: "MESSAGE",
    input: message("message-unrelated", { sender: { address: "person@personal.fixture.test", displayName: "Fixture Person" }, recipients: ["orders-walmart@code3-fixture.test"], subject: "Dinner plans", category: MESSAGE_CATEGORIES.OTHER, orderProposal: undefined, content: "See you later." }),
  },
  { id: "owner-corrected-candidate", kind: "REVIEW", input: message("message-owner-correction"), review: { action: "CORRECT", corrections: [{ field: "externalOrderId", value: "ORDER-CORRECTED", reason: "Owner checked the receipt." }] } },
  { id: "rejected-candidate", kind: "REVIEW", input: message("message-owner-reject"), review: { action: "REJECT", reason: "Not a real retailer order." } },
  { id: "duplicate-external-order", kind: "MESSAGE", input: message("message-duplicate-order", { providerConnectionId: "connection-fixture-2" }) },
  {
    id: "multi-currency-conflict",
    kind: "MESSAGE_ERROR",
    input: message("message-currency-conflict", { orderProposal: { ...message("base").orderProposal, tax: { minorUnits: 525, currency: "CAD" } } }),
    expectedError: "CURRENCY_MISMATCH",
  },
]);
