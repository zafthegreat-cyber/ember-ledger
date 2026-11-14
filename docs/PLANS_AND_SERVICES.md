# Code 3 TCG — Plans & Services (canonical)

Written 2026-11-14 from the decisions of 2026-10-31 (Rule A) and 2026-11-13 (open beta).
This document wins over `paid-tiers-and-feature-gates.md`, `FREE_FEATURE_PARITY.md`
and the product-vision tier notes wherever they disagree. `src/services/featureGates.js`
and the Membership page copy match this file; `npm run test:tier-foundation` and
`test:should-batch2` guard the mapping.

## The rule

**Free covers everything an ordinary collector needs. Paid is for people running a
business or hunting restocks.** (Zena, 2026-10-31: "I want the average collector to
be able to do what they need. But I want paid features.")

During the open beta every plan is free and every gate is open. Prices are set when
beta closes, and people are told before anything costs money. Nothing a person did
for free during beta is taken away from Free afterwards.

## Plans

| Plan | Who it is for | What it adds | Price |
|---|---|---|---|
| **Free** | Every collector, every family member | The complete collector app (below) | $0, forever |
| **Collector** | People who hunt restocks | 3 watched stores (swap 1 every 14 days), deeper current store details, restock/text alerts, price history, unlimited scans | Free during beta; priced after |
| **Family** | Parents | Everything in Collector plus parent-managed kid profiles (2 included), Family Vault, kid-safe views, kid wishlists, Spark family reminders | Free during beta; priced after |
| **Seller** | Resellers | Everything in Collector plus the Business ledger: inventory with cost basis, sales, expenses, mileage, receipts and receipt scan, profit/loss, Deal Finder, listing prep, cross-listing status, business reports and exports | Free during beta; priced after |
| **Shop** | Local card shops (approved by hand) | Shop profile and directory listing, store rules/limits/events, Trusted Family Friend application, staff seats, featured placement (Shop Plus) | Free during beta for approved shops |

Legacy plan ids (`collector_plus`, `seller_pro`, `scout_premium`, `ultimate`, `shop_basic`,
`shop_plus`) normalise to the five above and must not appear in new copy.

## What Free includes (the "complete collector" list)

- Unlimited cards, sealed and graded items — scan, search, or type them in (`unlimited_vault`, `vault_scan_add`, `manual_add`)
- Folders, tags, variants, wishlist, favorites (`variants`, `wishlist_basic`)
- Total collection value and a fair range per item (`portfolio_value`)
- Set progress, missing-card lists, binder view (`set_completion`)
- Wishlist alerts and saved Market searches (`wishlist_alerts`, `saved_market_searches`)
- Collection export (`collection_export`, `vault_export`)
- Graded slab tracking (`graded_slab_tracking`)
- Basic trade analyzer, deck/list builder
- 1 watched store (change once every 30 days), submit and confirm restock reports, limited current restock details (`scout_reports_basic`, `scout_submit_reports`)
- Community (read, post, report), The Spark, the guided tour, feedback button

## What is paid (after beta)

- **Restocks tooling** (Collector): more watched stores, deeper store details, alerts, price history, unlimited scans. Never: raw restock history, pattern tools, vendor schedules, exact all-store access — those are not sold on any plan (AGENTS.md safety rules).
- **Business ledger** (Seller): inventory cost basis, sales, expenses, mileage, receipts, receipt scan, profit/loss, Deal Finder, listing prep, cross-listing status, reports, exports.
- **Family** profiles and kid-safe views (Family). Note: proper Kid Mode is blocked on the COPPA review (priorities doc, item 45).
- **Shop** tools (Shop; approved by hand).

## Services outside the app (not plans)

- **Discord community + restock bot** — free while the server is small; revisit with app pricing.
- **ACO (managed auto-checkout)** — separate paid service, adults only, Stripe Checkout, own Supabase project. See `claude/code3-aco-in-app-plan.md` and `code3-aco-service.md` in the project. Not part of any app plan and never bundled into Free.
- **Code 3 Browser** — free desktop download for trusted testers.

## Copy rules

- Say "Free during beta" on paid plans and "Included for everyone" on Free.
- Never promise a price, a date, or "lifetime" anything.
- Never describe a Free limit that the gates do not enforce (the Nov 6 simulation flagged exactly this).
- Restock pattern history is not a feature to tease; it does not exist for sale.

## Change log

- 2026-11-14: gates moved to Free: `unlimited_vault`, `set_completion`, `portfolio_value`, `wishlist_alerts`, `variants`, `graded_slab_tracking`, `collection_export`, `saved_market_searches`, `vault_unlimited`, `vault_scan_add`, `vault_export`. `price_history` and `unlimited_scans` stay on Collector. Free/Collector feature copy rewritten.
