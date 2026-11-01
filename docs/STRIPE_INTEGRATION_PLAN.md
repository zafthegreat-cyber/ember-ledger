# Anchor & Wing Stripe integration plan

Prepared October 25, 2026 for Anchor & Wing LLC, app developer, https://code3tcg.com. The public marketing site uses `code3tcg.com`; authenticated app, Checkout returns, Customer Portal returns and billing webhooks use `code3tcg.app`. The company hub uses `anchorandwingllc.com`.
Scope: Code 3 TCG subscriptions and add-ons, with a repeatable approach for the Anchor & Wing app portfolio.

## Current outcome

The Stripe plugin was installed with `codex plugin add stripe@openai-curated`. Its authenticated MCP connection and `stripe_implementation_planner` are available. The owner selected **Anchor & Wing LLC sandbox**, account `acct_1UUZfyJ8o8i7lNhO`, `livemode=false`.

Planner guide `iguide_61VdzWsIWkYgwxqi541J8o8i7lNhO` was accepted for web-hosted Checkout, flat-rate subscriptions, a permanent free plan without a card, Customer Portal, and default payment recovery. The Tax monitoring choice is provisional: tax obligations have not been established. No active tax registrations were returned in this sandbox.

The local Code 3 implementation is an **initial sandbox foundation**, disabled by default. It is not connected to a deployed billing database or a real API key, and has not completed a real Stripe sandbox payment. Paid features are not enabled by this change. Other portfolio apps have not been modified or deployed.

## Recommended integration

| Need | Approach |
| --- | --- |
| Payments | Server-created hosted Checkout Sessions. Browser sends an offer identifier and attempt UUID; the server chooses the price and customer. |
| Billing | Flat-rate recurring Prices, flexible subscription billing, Customer Portal, and webhook-driven subscription state. Keep the useful free plan. |
| One-time add-ons | Checkout payment mode with durable grants only after verified successful payment. Refunds/disputes remove grants. No one-time product was invented for this setup. |
| Existing Code 3 add-ons | The preview catalog lists recurring monthly charges. Implement quantity limits, base-plan eligibility and adult authorization before offering these. |
| Tax | Confirm actual registrations and digital-product classifications, set price tax behavior, then enable Stripe Tax for registered locations. Until then, keep collection off and review threshold monitoring. |
| Customer self-service | An authenticated portal session, using the stored customer ID and an app-specific portal configuration. Initially support invoices, payment details and cancellation at period end. Enable plan changes only after entitlement transitions are verified. |
| Recovery | Configure Stripe recovery settings and customer notifications, then verify past-due, failed payment, action-required, retry and cancellation behavior. |

The planner returned an Accounts v2 portal blueprint. Stripe's current documentation says Accounts v2 for merchants outside Connect is a public preview. This implementation uses the documented Customers API path for direct merchant subscriptions, without opting the account into that preview. Do not introduce Connect unless the business later needs to collect money for independent sellers.

The installed official Node SDK is `stripe@23.0.1`, default API `2026-09-30.endive`. It is available to both the backend package and the Vercel adapter. Keep event destinations and SDK/API versions coordinated during future upgrades.

## Account review and sandbox catalog

| App / resource | Observed state |
| --- | --- |
| Code 3 app | Membership cards and feature gates were beta previews. No Stripe checkout or server billing implementation existed. |
| DealDay Pro | Existing sandbox product `prod_VVcYcFXPrjJRAE`; $2.99/month `price_1UUbJCJ8o8i7lNhOXQJrJjMK`, $24.99/year `price_1UUbJEJ8o8i7lNhORwiMNBUi`. Preserved. Product tax code is unset and price tax behavior unspecified; review before enabling Tax. Source checkout/webhook code was not audited in this task. |
| Code 3 Collector test product | Created `prod_Code3CollectorBetaV1`, tagged `app=code3`, with a sandbox-only description. |
| Code 3 Collector test price | Created `price_1UUbnBJ8o8i7lNhOJf7NPgE8`, lookup key `code3_collector_monthly_beta_v1`: USD 199 cents/month, exclusive tax behavior. Amount comes from the existing beta preview; it does not approve a live launch price. |
| Code 3 portal | Created `bpc_1UUbnDJ8o8i7lNhOKpSRNcg8`. Invoice history, address/name/tax ID updates, payment method updates and end-of-period cancellation. Subscription switching is off. |
| Tax | No active sandbox registrations. No registrations or collection settings were changed. Code 3 product tax classification is still pending. |

## What was built

`backend/src/billing/` contains configuration validation, private Postgres persistence, Stripe service methods, an authenticated router and opt-in runtime wiring.

- `GET /api/billing/status`: verified session, app catalog and durable grants.
- `POST /api/billing/checkout`: verified email, server-approved adult billing enrollment, server price allowlist and fixed return origin. Rejects a second subscription when an existing or pending subscription needs to be managed.
- `POST /api/billing/portal`: the same account boundary; does not accept a customer ID from the browser.
- `POST /api/billing/webhook`: bounded original JSON bytes and Stripe signature verification. Mounted before general app parsing. No browser authentication is applied to Stripe callbacks.

Webhook processing supports Checkout completion and asynchronous success, subscription changes, invoice paid/failed/action-required, and purchase refunds/disputes. It fetches current Stripe state under an account row lock, so delayed events cannot overwrite newer subscription state. A unique event ledger and grant updates commit together; failures roll back and return a retryable error. Active subscription access also requires a paid latest invoice and expires at the item's period end. One-time fulfillment checks the current payment and charge before granting access. Any partial refund revokes the corresponding one-time grant in this initial policy. Dispute restoration and subscription refund decisions require an operator review.

Credentials must be sandbox keys and must belong to the selected account. Live keys, connected-account events, privileged plan names, cross-app products, arbitrary amounts, customer IDs and return URLs are rejected. Errors do not expose raw provider responses. Dynamic payment methods remain enabled. Checkout attempt parameters stay stable for Stripe idempotency retries, including the integration identifier.

The optional panel in Plans & access is behind `VITE_CODE3_STRIPE_SANDBOX_ENABLED=true` and is hidden in preview personas and native app builds. Its server routes also remain disabled until configuration is complete. Existing preview plan buttons and beta access remain as they were.

## Finish the sandbox connection

1. Open the selected sandbox's [API keys](https://dashboard.stripe.com/acct_1UUZfyJ8o8i7lNhO/apikeys). Prefer a restricted `rk_test_` key. Configure the resource permissions listed below. Keep the key out of chat and source control.
2. Save it as `STRIPE_SECRET_KEY` in `backend/.env`. The optional `scripts/configure-stripe-sandbox.ps1` helper accepts hidden input and saves only to that ignored file. It does not enable checkout. For hosting, save credentials in the hosting provider's server secret store; never use a `VITE_` prefix.
3. Set `CODE3_BILLING_DATABASE_URL` to the intended server-only sandbox billing database. Explicitly apply only `backend/migrations/20261025_stripe_billing.sql`. The schema is private, has RLS enabled with no browser policies, and is not added to Supabase's exposed schemas. Do not apply the unrelated migration backlog.
4. Enroll a verified adult test account in `code3_billing.accounts` with its provider-verified Supabase subject. The approval fields must come from a reviewed adult enrollment process or an explicit server-operator action. Never derive approval from browser profile roles or user-editable metadata.
5. Configure a sandbox event destination at `https://code3tcg.app/api/billing/webhook` (or the explicitly selected sandbox preview origin). Save its signing secret as `STRIPE_WEBHOOK_SECRET`. Subscribe to the event types listed below. Vercel routes this path through the existing raw-body Express adapter, keeping the current function count unchanged.
6. Copy the nonsecret catalog and portal IDs from `backend/.env.example`; set the correct exact origin and CORS origin for the test deployment. Keep `CODE3_STRIPE_TAX_ENABLED=false` until registrations and classifications are confirmed. Then enable both billing flags for a sandbox preview.
7. Complete Checkout in the browser using Stripe test payment details, confirm webhook receipt and durable grants, then test Customer Portal cancellation and payment method changes. Verify the same authenticated account gets access and another account does not. Refreshing the success URL must not grant access.

Restricted key resources: read own account, Products, Prices, Tax registrations, Subscriptions, Invoices, PaymentIntents and Charges; read/write Customers and Checkout Sessions; write Customer Portal sessions, with read access to their configurations as required. No payouts, bank accounts, transfers or live-mode privileges are needed. Adjust exact Dashboard permission names using Stripe's permission reference and request logs; do not grant unrelated write access to resolve a missing read permission.

Webhook subscriptions:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.payment_action_required
charge.refunded
charge.dispute.created
charge.dispute.closed
```

## Complete the product rollout

Before real payments, replace browser-only membership authority with a verified billing projection and enforce entitlements in paid server operations. This first change records and reports billing grants but deliberately does not reinterpret existing local beta roles as purchased access. Add a server reconciliation job and operational alerts for missed deliveries and stale subscription state, a reviewed adult enrollment flow, and rate limits backed by shared storage for hosted scale. Test subscription changes, prorations, recovery notifications, refunds and disputes with approved business policies. Preserve protected Scout history and shop trust labels independently of payment.

For each additional Anchor & Wing app, use its own app identifier, catalog, customer mapping, webhook destination, adult/account policy and portal configuration. Scope identity by the app's verified provider/subject; do not merge people across apps just because emails match. A portfolio bundle needs explicit products, entitlements and account-linking consent. Share the billing service pattern and account-level Stripe configuration while keeping customer data and product access isolated. Roll out to DealDay, Little Echoes and Steady only after inspecting each app's current source and auth model.

Confirm final plan/add-on prices, cancellation/refund terms, privacy links, Tax registrations and tax codes before creating live products. Native digital-goods checkout requires a separate review of current store rules and eligible regions before showing Stripe purchase links in the Capacitor app. No real charges or live billing deployment are included in this task.

## Validation and references

Passed: 14 billing service/HTTP tests, an isolated PostgreSQL test for real SQL transactions/RLS/expiry, 45 existing auth/API security tests, targeted frontend lint, production frontend build and 56 existing Vercel packaging checks. Initial local HTTP tests were blocked by the filesystem/network sandbox; the same tests passed with local HTTP permission. No real account API key or end-to-end payment has been tested. The build retains existing large-chunk/dynamic-import warnings.

Primary documentation used: [hosted Checkout subscriptions](https://docs.stripe.com/payments/checkout/build-subscriptions?payment-ui=stripe-hosted), [Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [Accounts as customers and preview status](https://docs.stripe.com/accounts-v2/use-accounts-as-customers), [webhooks](https://docs.stripe.com/webhooks), [Tax registrations](https://docs.stripe.com/tax/registrations), [restricted keys](https://docs.stripe.com/keys/restricted-api-keys). The skill's four `/references/*.md` URLs did not resolve; current primary product documentation and the planner supplied implementation guidance.
