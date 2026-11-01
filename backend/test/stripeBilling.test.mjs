import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import express from "express";
import Stripe from "stripe";

const require = createRequire(import.meta.url);
const { readBillingConfig } = require("../dist/billing/config.js");
const { createBillingService } = require("../dist/billing/service.js");
const { createBillingRouter } = require("../dist/billing/router.js");
const principal = { provider: "supabase", subject: "adult", email: "adult@example.test", emailVerified: true, issuedAt: 1, expiresAt: 9999999999 };
const config = { enabled: true, appId: "code3", expectedAccountId: "acct_approved", origin: "https://code3tcg.com", secretKey: "sk_test_placeholder", webhookSecret: "whsec_placeholder", taxEnabled: false,
  portalConfiguration: "bpc_test", offers: [
    { id: "collector_monthly", label: "Collector", priceId: "price_collector", mode: "subscription", entitlement: "collector" },
    { id: "export_once", label: "Export test", priceId: "price_export", mode: "payment", entitlement: "addon:export" },
  ] };
const attempt = "10000000-0000-4000-8000-000000000001";
const collection = data => ({ data, async *[Symbol.asyncIterator]() { yield* data; } });

function setup(overrides = {}) {
  const state = { account: { id: "20000000-0000-4000-8000-000000000002", customer_id: "cus_adult", adult_approved: true },
    grants: [], events: new Set(), subscriptions: [], open: [], invoiceStatus: "paid", registrations: [], creates: [], portals: [], refunds: 0,
    chargeDisputed: false, paymentStatus: "paid", webhookWrites: 0, failRecord: false, productApp: "code3" };
  Object.assign(state, overrides);
  let queue = Promise.resolve();
  const transact = async work => {
    const prior = queue; let release; queue = new Promise(resolve => { release = resolve; }); await prior;
    const snapshot = { grants: structuredClone(state.grants), events: new Set(state.events), account: { ...state.account } };
    try { return await work({
      account: state.account,
      async setCustomer(id) { state.account.customer_id = id; },
      async seen(id) { return state.events.has(id); },
      async record(id) { if (state.failRecord) throw new Error("DB unavailable"); state.events.add(id); state.webhookWrites++; },
      async replaceSubscriptions(grants) { state.grants = state.grants.filter(g => !g.source.startsWith("sub_")).concat(grants); },
      async grantPurchase(grant) { if (!state.grants.some(g => g.source === grant.source && g.entitlement === grant.entitlement)) state.grants.push(grant); },
      async revokePurchase(source) { state.grants = state.grants.filter(g => g.source !== source); },
      async grants() { return state.grants; },
    }); } catch (error) { Object.assign(state, snapshot); throw error; } finally { release(); }
  };
  const repository = {
    async forPrincipal(who, work) { assert.equal(who.subject, "adult"); return transact(work); },
    async forCustomer(customer, work) { return customer === state.account.customer_id ? transact(work) : null; },
  };
  const realStripe = new Stripe("sk_test_placeholder");
  const stripe = {
    accounts: { async retrieveCurrent() { return { id: state.accountId || "acct_approved" }; } },
    webhooks: realStripe.webhooks,
    prices: { async retrieve(id) { return { id, active: true, livemode: false, product: { id: "prod_code3", active: true, metadata: { app: state.productApp }, tax_code: "txcd_test" },
      type: id === "price_collector" ? "recurring" : "one_time", recurring: id === "price_collector" ? { interval: "month", interval_count: 1 } : null,
      unit_amount: 199, currency: "usd", billing_scheme: "per_unit", tax_behavior: "exclusive" }; } },
    tax: { registrations: { async list() { return { data: state.registrations }; } } },
    customers: { async create() { return { id: "cus_created", livemode: false }; }, async retrieve() { return { metadata: { app: state.productApp } }; } },
    subscriptions: { list() { return collection(state.subscriptions); } },
    invoices: { async retrieve() { return { status: state.invoiceStatus }; } },
    checkout: { sessions: {
      list() { return collection(state.open); },
      async create(params, options) { state.creates.push({ params, options }); return { id: "cs_test", url: "https://checkout.stripe.com/c/pay/test", livemode: false }; },
      async retrieve(id) { return { id, livemode: false, customer: "cus_adult", status: "complete", payment_status: state.paymentStatus,
        mode: "payment", metadata: { app: "code3", billing_account_id: state.account.id }, payment_intent: "pi_purchase" }; },
      listLineItems() { return collection([{ price: { id: "price_export" } }]); },
    } },
    paymentIntents: { async retrieve() { return { status: "succeeded", latest_charge: { refunded: state.refunds === 199, amount_refunded: state.refunds, disputed: state.chargeDisputed } }; } },
    charges: { async retrieve() { return { customer: "cus_adult", payment_intent: "pi_purchase", amount_refunded: state.refunds, disputed: state.chargeDisputed }; } },
    billingPortal: { sessions: { async create(params) { state.portals.push(params); return { url: "https://billing.stripe.com/p/session/test" }; } } },
  };
  const service = createBillingService({ ...config, ...overrides.config }, repository, stripe);
  const event = (id, type, object = { id: "cs_test", customer: "cus_adult" }, extra = {}) => {
    const raw = Buffer.from(JSON.stringify({ id, object: "event", type, livemode: false, data: { object }, ...extra }));
    return [raw, realStripe.webhooks.generateTestHeaderString({ payload: raw.toString(), secret: config.webhookSecret })];
  };
  return { state, service, event };
}

test("sandbox configuration rejects live credentials, privileged entitlements and duplicate offers", () => {
  const env = { CODE3_BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "rk_test_example", STRIPE_WEBHOOK_SECRET: "whsec_example", CODE3_BILLING_ORIGIN: config.origin, CODE3_STRIPE_OFFERS_JSON: JSON.stringify(config.offers) };
  assert.equal(readBillingConfig(env).offers.length, 2);
  assert.equal(readBillingConfig({}).enabled, false);
  for (const change of [ { STRIPE_SECRET_KEY: "sk_live_example" }, { CODE3_BILLING_ORIGIN: "https://code3tcg.com/path" },
    { CODE3_STRIPE_OFFERS_JSON: JSON.stringify([{ ...config.offers[0], entitlement: "admin" }]) },
    { CODE3_STRIPE_OFFERS_JSON: JSON.stringify([config.offers[0], config.offers[0]]) } ]) assert.throws(() => readBillingConfig({ ...env, ...change }));
});

test("checkout uses server prices, account identity, flexible billing and idempotency", async () => {
  const { service, state } = setup();
  await service.checkout(principal, "collector_monthly", attempt);
  const { params, options } = state.creates[0];
  assert.deepEqual(params.line_items, [{ price: "price_collector", quantity: 1 }]);
  assert.equal(params.customer, "cus_adult");
  assert.equal(params.metadata.billing_account_id, state.account.id);
  assert.equal(params.subscription_data.billing_mode.type, "flexible");
  assert.match(params.integration_identifier, /^code3_hosted_[a-z]{8}$/);
  assert.equal(Object.hasOwn(params, "payment_method_types"), false);
  assert.equal(params.automatic_tax.enabled, false);
  assert.equal(params.success_url, "https://code3tcg.com/?billing=success");
  assert.ok(options.idempotencyKey.endsWith(attempt));
  await service.checkout(principal, "collector_monthly", attempt);
  assert.deepEqual(state.creates[1], state.creates[0], "same attempt must send identical Stripe idempotency parameters");
  await assert.rejects(service.checkout(principal, "price_attacker", attempt), { code: "invalid_billing_offer" });
  await assert.rejects(service.checkout(principal, "collector_monthly", "bad"), { code: "invalid_checkout_attempt" });
});

test("unapproved adult account cannot create checkout or portal", async () => {
  const { service, state } = setup(); state.account.adult_approved = false;
  await assert.rejects(service.checkout(principal, "collector_monthly", attempt), { code: "adult_billing_required" });
  await assert.rejects(service.portal(principal), { code: "adult_billing_required" });
  assert.equal(state.creates.length + state.portals.length, 0);
});

test("a sandbox API key for a different Stripe account cannot be used", async () => {
  const { service, state } = setup({ accountId: "acct_other" });
  await assert.rejects(service.status(principal), { code: "stripe_account_mismatch" });
  await assert.rejects(service.checkout(principal, "collector_monthly", attempt), { code: "stripe_account_mismatch" });
  assert.equal(state.creates.length, 0);
});

test("portal uses only persisted customer and configured app portal", async () => {
  const { service, state } = setup(); await service.portal(principal);
  assert.deepEqual(state.portals[0], { customer: "cus_adult", configuration: "bpc_test", return_url: "https://code3tcg.com/?billing=returned" });
});

test("duplicate subscription and pending checkout cannot create double subscriptions", async () => {
  const { service, state } = setup();
  state.subscriptions = [{ status: "past_due" }];
  await assert.rejects(service.checkout(principal, "collector_monthly", attempt), { code: "subscription_exists" });
  state.subscriptions = []; state.open = [{ mode: "subscription", metadata: { offer_id: "collector_monthly" }, url: "https://checkout.stripe.com/existing" }];
  assert.equal((await service.checkout(principal, "collector_monthly", attempt)).url, "https://checkout.stripe.com/existing");
  state.open[0].metadata.offer_id = "family_monthly";
  await assert.rejects(service.checkout(principal, "collector_monthly", attempt), { code: "checkout_in_progress" });
  assert.equal(state.creates.length, 0);
});

test("tax enabled requires active sandbox registration and app-owned product", async () => {
  const { service, state } = setup({ config: { taxEnabled: true } });
  await assert.rejects(service.checkout(principal, "collector_monthly", attempt), { code: "tax_registration_required" });
  assert.equal(state.creates.length, 0);
  state.registrations = [{ status: "active" }];
  await service.checkout(principal, "collector_monthly", attempt);
  assert.equal(state.creates[0].params.automatic_tax.enabled, true);
  state.productApp = "dealday";
  await assert.rejects(service.checkout(principal, "collector_monthly", attempt), { code: "billing_catalog_invalid" });
});

test("verified asynchronous purchase fulfills once and ignores unpaid completion", async () => {
  const { service, state, event } = setup(); state.paymentStatus = "unpaid";
  await service.webhook(...event("evt_unpaid", "checkout.session.completed"));
  assert.equal(state.grants.length, 0); state.paymentStatus = "paid";
  const paid = event("evt_paid", "checkout.session.async_payment_succeeded");
  await Promise.all([service.webhook(...paid), service.webhook(...paid)]);
  assert.deepEqual(state.grants.map(g => g.entitlement), ["addon:export"]);
  assert.equal(state.webhookWrites, 2);
});

test("partial refund revokes one-time access; delayed completion cannot restore it", async () => {
  const { service, state, event } = setup();
  await service.webhook(...event("evt_paid", "checkout.session.completed"));
  state.refunds = 99;
  await service.webhook(...event("evt_refund", "charge.refunded", { id: "ch_purchase", customer: "cus_adult" }));
  assert.equal(state.grants.length, 0);
  await service.webhook(...event("evt_delayed", "checkout.session.async_payment_succeeded"));
  assert.equal(state.grants.length, 0);
});

test("subscription state is retrieved under lock for out-of-order events and failed payments", async () => {
  const { service, state, event } = setup();
  const subscription = { id: "sub_current", customer: "cus_adult", livemode: false, status: "active", latest_invoice: "in_paid",
    metadata: { app: "code3", billing_account_id: state.account.id }, items: { data: [{ price: { id: "price_collector" }, current_period_end: Math.floor(Date.now() / 1000) + 86400 }] } };
  state.subscriptions = [subscription];
  await service.webhook(...event("evt_old_delete", "customer.subscription.deleted", { id: "sub_old", customer: "cus_adult" }));
  assert.equal(state.grants[0].entitlement, "collector");
  state.invoiceStatus = "open";
  await service.webhook(...event("evt_failed", "invoice.payment_failed", { id: "in_paid", customer: "cus_adult" }));
  assert.equal(state.grants.length, 0);
  state.invoiceStatus = "paid"; subscription.status = "canceled";
  await service.webhook(...event("evt_cancel", "customer.subscription.updated", { customer: "cus_adult" }));
  assert.equal(state.grants.length, 0);
});

test("DB failure rolls back fulfillment and event marker so Stripe can retry", async () => {
  const { service, state, event } = setup(); state.failRecord = true;
  const paid = event("evt_retry", "checkout.session.completed");
  await assert.rejects(service.webhook(...paid));
  assert.equal(state.grants.length, 0); assert.equal(state.events.size, 0);
  state.failRecord = false; await service.webhook(...paid);
  assert.equal(state.grants.length, 1); assert.equal(state.events.size, 1);
});

test("invalid signatures, live events and connected-account events are rejected", async () => {
  const { service, state, event } = setup();
  const signed = event("evt_signed", "checkout.session.completed");
  await assert.rejects(service.webhook(Buffer.from("{}"), signed[1]), { code: "invalid_stripe_signature" });
  await assert.rejects(service.webhook(...event("evt_live", "checkout.session.completed", {}, { livemode: true })), { code: "billing_mode_mismatch" });
  await assert.rejects(service.webhook(...event("evt_connect", "checkout.session.completed", {}, { account: "acct_other" })), { code: "billing_mode_mismatch" });
  assert.equal(state.events.size, 0);
});

async function withServer(router, work) {
  const app = express(); app.use("/api/billing", router);
  const server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  try { await work(`http://127.0.0.1:${server.address().port}/api/billing`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const identityProvider = { providerId: "supabase", isConfigured: () => true,
  async verifyAccessToken(token) { return token === "verified" ? { ok: true, principal } : { ok: false, reason: "invalid" }; } };
const authorized = { Authorization: "Bearer verified", "Content-Type": "application/json" };

test("HTTP routes reject identity spoofing and keep raw webhook verification separate", async () => {
  const { service, event } = setup();
  await withServer(createBillingRouter({ service, identityProvider }), async base => {
    assert.equal((await fetch(`${base}/status`)).status, 401);
    const status = await fetch(`${base}/status`, { headers: authorized }); assert.equal(status.status, 200);
    assert.equal((await status.json()).mode, "sandbox");
    const spoof = await fetch(`${base}/checkout`, { method: "POST", headers: authorized, body: JSON.stringify({ offerId: "collector_monthly", attemptId: attempt, customerId: "cus_victim" }) });
    assert.equal(spoof.status, 400);
    const paid = event("evt_http", "checkout.session.completed");
    const webhook = await fetch(`${base}/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": paid[1] }, body: paid[0] });
    assert.equal(webhook.status, 200);
    const bad = await fetch(`${base}/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": paid[1] }, body: "{}" });
    assert.equal(bad.status, 400);
    const blocked = await fetch(`${base}/status`, { headers: { ...authorized, Origin: "https://evil.example" } });
    assert.equal(blocked.status, 403);
  });
});

test("disabled configuration leaves billing unavailable without affecting the application", async () => {
  await withServer(createBillingRouter({ identityProvider }), async base => {
    const status = await fetch(`${base}/status`, { headers: authorized });
    assert.equal((await status.json()).enabled, false);
    const checkout = await fetch(`${base}/checkout`, { method: "POST", headers: authorized, body: JSON.stringify({ offerId: "collector_monthly", attemptId: attempt }) });
    assert.equal(checkout.status, 503);
  });
});
