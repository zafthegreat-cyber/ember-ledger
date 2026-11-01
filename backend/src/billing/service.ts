import { createHash } from "node:crypto";
import Stripe from "stripe";
import { BillingError, type BillingConfig, type BillingOffer } from "./config";
import type { BillingRepository, BillingTransaction, BillingGrant } from "./repository";
import type { AuthPrincipal } from "../auth/authPrincipal";

const identifier = (value: unknown): string => typeof value === "string" ? value
  : value && typeof value === "object" && "id" in value ? String(value.id) : "";
const noPurchase = () => new BillingError("adult_billing_required", 403, "Purchases require an approved adult billing account.");
// The attempt UUID supplies randomness; hashing keeps retry parameters identical.
const suffix = (account: string, attempt: string) => [...createHash("sha256").update(`${account}:${attempt}`).digest().subarray(0, 8)].map(byte => String.fromCharCode(97 + byte % 26)).join("");
const pendingStatuses = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const subscriptionEvents = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"]);
const checkoutEvents = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const refundEvents = new Set(["charge.refunded", "charge.dispute.created", "charge.dispute.closed"]);

export function createBillingService(config: BillingConfig, repository: BillingRepository, stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 15_000 })) {
  const byPrice = new Map(config.offers.map(offer => [offer.priceId, offer]));
  let verifiedAccount: Promise<void> | undefined;
  async function verifyAccount() {
    verifiedAccount ||= stripe.accounts.retrieveCurrent().then(account => {
      if (account.id !== config.expectedAccountId) throw new BillingError("stripe_account_mismatch", 503, "The key must belong to the approved Anchor & Wing sandbox.");
    }).catch(error => { verifiedAccount = undefined; throw error; });
    await verifiedAccount;
  }
  async function checkedPrice(offer: BillingOffer) {
    const price = await stripe.prices.retrieve(offer.priceId, { expand: ["product"] });
    const product = price.product;
    if (price.livemode || !price.active || !product || typeof product === "string" || product.deleted
      || !product.active || product.metadata.app !== config.appId
      || price.type !== (offer.mode === "subscription" ? "recurring" : "one_time")
      || price.unit_amount === null || price.billing_scheme !== "per_unit") {
      throw new BillingError("billing_catalog_invalid", 503, "The sandbox offer is not ready.");
    }
    if (config.taxEnabled && (!product.tax_code || !["inclusive", "exclusive"].includes(price.tax_behavior || ""))) {
      throw new BillingError("tax_catalog_incomplete", 503, "Product tax classification and price tax behavior must be configured.");
    }
    return price;
  }
  async function requireTaxRegistration() {
    if (config.taxEnabled && !(await stripe.tax.registrations.list({ status: "active", limit: 1 })).data.length) {
      throw new BillingError("tax_registration_required", 503, "Tax collection requires an active registration in this sandbox.");
    }
  }
  async function customer(tx: BillingTransaction, principal: AuthPrincipal) {
    if (!tx.account.adult_approved) throw noPurchase();
    if (tx.account.customer_id) return tx.account.customer_id;
    const created = await stripe.customers.create({ email: principal.email,
      metadata: { app: config.appId, billing_account_id: tx.account.id } },
    { idempotencyKey: `${config.appId}:customer:${tx.account.id}` });
    if (created.livemode) throw new BillingError("billing_mode_mismatch", 503, "Sandbox billing mode could not be verified.");
    await tx.setCustomer(created.id);
    return created.id;
  }
  async function currentSubscriptions(customerId: string) {
    // Pagination prevents silent loss when a customer has many historical subscriptions.
    const subscriptions: Stripe.Subscription[] = [];
    for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) subscriptions.push(subscription);
    return subscriptions;
  }
  async function synchronize(tx: BillingTransaction) {
    const subscriptions = await currentSubscriptions(tx.account.customer_id!);
    const grants: BillingGrant[] = [];
    for (const subscription of subscriptions) {
      if (subscription.livemode || identifier(subscription.customer) !== tx.account.customer_id
        || subscription.metadata.app !== config.appId || subscription.metadata.billing_account_id !== tx.account.id
        || !["active", "trialing"].includes(subscription.status)) continue;
      // No paid access for active subscriptions with an unpaid latest invoice.
      // Trials are supported if explicitly introduced later through Stripe configuration.
      if (subscription.status === "active") {
        const invoiceId = identifier(subscription.latest_invoice);
        if (!invoiceId || (await stripe.invoices.retrieve(invoiceId)).status !== "paid") continue;
      }
      for (const item of subscription.items.data) {
        const offer = byPrice.get(item.price.id);
        if (offer?.mode === "subscription" && item.current_period_end > Date.now() / 1000) {
          grants.push({ source: subscription.id, entitlement: offer.entitlement, validUntil: item.current_period_end });
        }
      }
    }
    const unique = new Map<string, BillingGrant>();
    for (const grant of grants) {
      const key = `${grant.source}:${grant.entitlement}`;
      const previous = unique.get(key);
      if (!previous || (grant.validUntil || 0) > (previous.validUntil || 0)) unique.set(key, grant);
    }
    await tx.replaceSubscriptions([...unique.values()]);
  }
  return {
    async status(principal: AuthPrincipal) {
      await verifyAccount();
      return repository.forPrincipal(principal, async tx => ({ enabled: true, mode: "sandbox", adultApproved: tx.account.adult_approved,
        hasCustomer: Boolean(tx.account.customer_id), taxCollection: config.taxEnabled, grants: await tx.grants(),
        offers: await Promise.all(config.offers.map(async offer => {
          const price = await checkedPrice(offer);
          return { id: offer.id, label: offer.label, mode: offer.mode, amount: price.unit_amount,
            currency: price.currency, interval: price.recurring?.interval || null, intervalCount: price.recurring?.interval_count || null };
        })) }));
    },
    async checkout(principal: AuthPrincipal, offerId: string, attemptId: string) {
      await verifyAccount();
      const offer = config.offers.find(candidate => candidate.id === offerId);
      if (!offer) throw new BillingError("invalid_billing_offer", 400, "Select a configured offer.");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) throw new BillingError("invalid_checkout_attempt", 400, "Start a new checkout attempt.");
      return repository.forPrincipal(principal, async tx => {
        if (!tx.account.adult_approved) throw noPurchase();
        await checkedPrice(offer);
        await requireTaxRegistration();
        const customerId = await customer(tx, principal);
        if (offer.mode === "subscription") {
          if ((await currentSubscriptions(customerId)).some(subscription => pendingStatuses.has(subscription.status))) {
            throw new BillingError("subscription_exists", 409, "Manage your existing subscription in the billing portal.");
          }
          for await (const session of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
            if (session.mode === "subscription") {
              if (session.metadata?.offer_id === offer.id && session.url) return { url: session.url };
              throw new BillingError("checkout_in_progress", 409, "Complete or cancel your open subscription checkout first.");
            }
          }
        }
        const metadata = { app: config.appId, billing_account_id: tx.account.id, offer_id: offer.id };
        const session = await stripe.checkout.sessions.create({
          mode: offer.mode, customer: customerId, client_reference_id: tx.account.id,
          line_items: [{ price: offer.priceId, quantity: 1 }],
          success_url: `${config.origin}/?billing=success`, cancel_url: `${config.origin}/?billing=canceled`,
          billing_address_collection: "required", customer_update: { address: "auto", name: "auto" },
          automatic_tax: { enabled: config.taxEnabled },
          ...(config.taxEnabled ? { tax_id_collection: { enabled: true } } : {}),
          metadata,
          integration_identifier: `${config.appId}_hosted_${suffix(tx.account.id, attemptId)}`,
          ...(offer.mode === "subscription" ? { subscription_data: { metadata, billing_mode: { type: "flexible" as const } } }
            : { payment_intent_data: { metadata } }),
        }, { idempotencyKey: `${config.appId}:checkout:${tx.account.id}:${attemptId}` });
        if (session.livemode || !session.url) throw new BillingError("checkout_unavailable", 503, "Sandbox checkout is unavailable.");
        return { url: session.url };
      });
    },
    async portal(principal: AuthPrincipal) {
      await verifyAccount();
      return repository.forPrincipal(principal, async tx => {
        if (!tx.account.adult_approved) throw noPurchase();
        if (!tx.account.customer_id || !config.portalConfiguration) throw new BillingError("portal_unavailable", 409, "The sandbox billing portal is not ready.");
        const session = await stripe.billingPortal.sessions.create({ customer: tx.account.customer_id,
          configuration: config.portalConfiguration, return_url: `${config.origin}/?billing=returned` });
        return { url: session.url };
      });
    },
    async webhook(raw: Buffer, signature: string) {
      let event: Stripe.Event;
      try { event = stripe.webhooks.constructEvent(raw, signature, config.webhookSecret); }
      catch { throw new BillingError("invalid_stripe_signature", 400, "Invalid webhook signature."); }
      if (event.livemode || event.account) throw new BillingError("billing_mode_mismatch", 400, "Unexpected Stripe event context.");
      if (!subscriptionEvents.has(event.type) && !checkoutEvents.has(event.type) && !refundEvents.has(event.type)) return;
      await verifyAccount();
      const object = event.data.object as unknown as Record<string, unknown>;
      let customerId = identifier(object.customer);
      let charge: Stripe.Charge | undefined;
      if (refundEvents.has(event.type)) {
        const chargeId = event.type === "charge.refunded" ? identifier(object.id) : identifier(object.charge);
        charge = await stripe.charges.retrieve(chargeId);
        customerId = identifier(charge.customer);
      }
      if (!customerId) return;
      const processed = await repository.forCustomer(customerId, async tx => {
        if (await tx.seen(event.id)) return;
        if (subscriptionEvents.has(event.type)) {
          // Fetch current state under the account lock: events can arrive out of order.
          await synchronize(tx);
        } else if (checkoutEvents.has(event.type)) {
          const session = await stripe.checkout.sessions.retrieve(String(object.id), { expand: ["payment_intent"] });
          if (session.livemode || identifier(session.customer) !== tx.account.customer_id
            || session.metadata?.app !== config.appId || session.metadata?.billing_account_id !== tx.account.id) throw new BillingError("billing_account_mismatch", 400, "Checkout account mismatch.");
          if (session.mode === "subscription") await synchronize(tx);
          else if (session.mode === "payment" && session.status === "complete" && session.payment_status === "paid") {
            const intentId = identifier(session.payment_intent);
            if (!intentId) throw new BillingError("payment_unverified", 503, "Payment could not be verified.");
            const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
            const latestCharge = intent.latest_charge;
            // Replayed completion events cannot restore an already refunded/disputed purchase.
            if (intent.status === "succeeded" && latestCharge && typeof latestCharge !== "string" && !latestCharge.refunded && !latestCharge.amount_refunded && !latestCharge.disputed) {
              for await (const item of stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })) {
                const offer = byPrice.get(item.price?.id || "");
                if (offer?.mode === "payment") await tx.grantPurchase({ source: intentId, entitlement: offer.entitlement, validUntil: null });
              }
            }
          }
        } else if (charge && (charge.amount_refunded > 0 || charge.disputed || event.type === "charge.dispute.created")) {
          await tx.revokePurchase(identifier(charge.payment_intent));
        }
        await tx.record(event.id, event.type);
        return true;
      });
      if (processed === null) {
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer.deleted && customer.metadata.app === config.appId) {
          // A Stripe callback can race a new customer transaction. Ask Stripe to retry it.
          throw new BillingError("billing_account_pending", 503, "The billing account is not ready for synchronization.");
        }
      }
    },
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
