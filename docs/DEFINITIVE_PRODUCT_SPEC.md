# Code 3 — Definitive Product Specification

Status: normative product source of truth

Published baseline: `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`

Current local phase: Phase 2D-A Bot Integration Foundation, unpublished and local-only. The separate Phase 2B2-B.1 Preview operational verification remains paused pending the owner's explicit `Supabase signed in.` confirmation; `hostedRuntimeVerified=false`.

Product stage: private owner application, Vercel Preview only
Approved application name: Code 3

## 1. Authority and scope

This document defines the intended private application. It supersedes conflicting older branding, navigation, wording, and product-structure documents. Historical repository names, route aliases, storage namespaces, generated-data identifiers, and migration keys may remain internal when renaming them would put data or compatibility at risk. They are not permission to restore retired visible branding or fantasy terminology.

Detailed implementation truth is recorded separately:

- Current feature status: [FEATURE_STATUS_MATRIX.md](./FEATURE_STATUS_MATRIX.md)
- Current and target architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Product workspace contract: [WORKSPACE_ARCHITECTURE_CONTRACT.md](./WORKSPACE_ARCHITECTURE_CONTRACT.md)
- Current and target records: [DATA_MODEL.md](./DATA_MODEL.md)
- Provider capabilities: [INTEGRATIONS.md](./INTEGRATIONS.md)
- Security requirements: [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md)
- Sequenced work: [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)
- Verified project state: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
- Active risks: [RISK_REGISTER.md](./RISK_REGISTER.md)
- Bot provider/domain/security boundary: [BOT_INTEGRATION_CONTRACT.md](./BOT_INTEGRATION_CONTRACT.md)

The words MUST, MUST NOT, SHOULD, and MAY are normative.

## 2. Product definition

Code 3 is the private collecting, sourcing, flipping, auction, restock, and business-management application. It is a private operating system for Pokémon and collectible sourcing, collecting, resale operations, and business records. Pokémon is the first domain; the acquisition, auction, owned-item, inventory, sales, and bookkeeping models MUST also accommodate other trading-card games, One Piece, sports cards, toys, general collectibles, resale inventory, and mixed auction lots.

The product helps the owner:

1. discover and attribute opportunities;
2. calculate complete acquisition cost and realistic outcomes;
3. set a maximum offer or bid without taking the external action;
4. purchase, receive, process, and allocate lots;
5. maintain one physical-item history across collection, resale, hold, and community purposes;
6. prepare listings and record sales, shipping, returns, fees, and refunds;
7. calculate realized results and compare them with original projections;
8. measure the usefulness of sources, searches, stores, products, auctions, and trips;
9. preserve evidence, provenance, corrections, and exportable business records.

The application is separate from any future public customer product. It MUST NOT expose private records through public accounts, storefronts, feeds, subscriptions, payments, or community features. Any future connection to a public brand requires a separately approved data boundary and product specification.

## 3. Product guardrails

The application MAY recommend, calculate, alert, identify, organize, and prepare drafts. It MUST NOT automatically:

- buy a product, submit an offer or bid, or message a seller;
- log into or automate an unsupported marketplace;
- bypass a CAPTCHA, rate limit, robots rule, private API, or access control;
- publish a sales listing without confirmation;
- create final inventory from unreviewed imported or AI-produced data;
- claim a guaranteed appraisal, professional grade, authenticity result, or restock;
- treat an active asking price as a completed sale or market value.

## 4. Brand contract

The approved application name is **Code 3**. The legal or public business name is not finalized and MUST remain a separate configurable field; the application-name decision does not imply that the business itself is named Code 3. The tagline is also not finalized and MUST remain configurable without inventing permanent copy.

The centralized configuration MUST supply these approved application values:

- application display name: `Code 3`;
- application short name: `Code 3`;
- PWA name: `Code 3`;
- PWA short name: `Code 3`;
- browser-title template: `Code 3 — {pageTitle}`;
- default accessible logo text: `Code 3`;
- visual logo text MAY use uppercase `CODE 3`.

It MUST also keep these independently configurable:

- legal/public business display name;
- tagline;
- logo, app icon, and favicon references;
- primary and secondary accents;
- support email placeholder and default social handle;
- default currency and default time zone.

All visible application-name rendering MUST consume `src/config/brand.js` or a single successor configuration source. Components MUST NOT hard-code Code 3 individually. Existing storage keys, database fields, API and compatibility routes, internal modules, environment variables, historical identifiers, and imported source identifiers are not renamed for cosmetic reasons.

The published runtime consumes these values through the centralized brand configuration and associated PWA/browser-title tests.

## 5. Roles and authorization

`OWNER` is the only enabled private-product role initially. The owner can use all everyday workspaces and Owner Center controls, connections, imports, search rules, performance, reports, backup, security, and system history.

Backend authorization MUST protect every sensitive API and file. Hiding navigation or trusting a client-side role is insufficient.

The authorization model SHOULD reserve, but not enable without need:

- `COLLABORATOR`: purchasing, receiving, item processing, listings, sales, and shipping;
- `INVENTORY_HELPER`: identification, photography, storage, lot processing, and labels, with financial visibility denied by default;
- `BOOKKEEPER`: expenses, mileage, receipts, reconciliation, and exports;
- `READ_ONLY`: explicit record-level view permissions without mutation.

## 6. Permanent interaction contract

The approved minimal interface is the baseline. Everyday mobile screens MUST have one purpose, one page title, one dominant action, no more than two immediately visible secondary actions, no more than three major sections, no more than four summary values, no nested cards, no duplicate totals, no technical provider information, and no more than three visible tabs. Secondary tools belong under More; detail belongs on record pages.

At 360 pixels, screens MUST avoid horizontal overflow, use at least 44-pixel targets, expose visible focus states, preserve logical headings, use non-color status cues, support reduced motion, and keep financial values in tabular numerals. Long workflows MUST be guided and resumable. Drafts MUST be preserved. Destructive actions MUST require confirmation.

The mental model is five focused product workspaces in one application, plus one separate private owner control room.

### Primary navigation

- Product workspace switcher: Collect, Find, Sell, Bot, Business. Bot is visible only to a verified OWNER.
- Mobile and desktop navigation are workspace-local and show only implemented destinations; they MUST NOT flatten every Code 3 route into one global dock or sidebar.
- Compatibility-first workspace homes are `/collect`, `/find/home`, `/sell/home`, `/bot`, and `/business`.
- Owner Center is separate from the switcher and remains OWNER-only. Account Ops is associated with Business but retains its stronger `VERIFIED_OWNER` gate.
- Global Add/search actions MAY remain globally reachable when they route into a real workflow and its owning workspace.
- Profile menu target: Owner Center, Notifications, Business Assistant, Kids & Community, Settings, Lock App, Sign Out. Optional entries obey feature controls.

The workspace registry MAY carry future `FREE`, `PLUS`, `PRO`, `BUSINESS`, and `OWNER` metadata, but billing and subscription entitlements are not implemented. `OWNER` is authority, never a purchasable tier, and client metadata cannot authorize a private route.

## 7. Conceptual page map

Canonical user-facing ownership is:

- **Collect**: personal collection, owned-item details, sets, binders, wishlist, grading candidates, card identification/condition assistance, and personal storage views.
- **Find**
  - Deals: feed/inbox, detail, analysis, import review, comparable records, saved opportunities.
  - Restocks: live, stores, store detail, product detail, report, visit, trip planner.
  - Auctions: feed, event, lot, maximum bid, live bid display, pickup planner, calendar, source detail.
- **Sell**: resale inventory, listing preparation, local sales/order foundations, shipping/returns, and item-level results. A workspace shell does not imply external listing or order integration.
- **Bot**: OWNER-only provider-neutral operations foundation for installations, Account Ops references, task groups/tasks, product targets, proxy metadata, append-only attempts, and reviewable Checkout Evidence. Hayha and Stellar remain `NOT_CONFIGURED`; no live provider, credential, task control, purchase, checkout, bypass, or automation is implemented.
- **Business**
  - Purchases: list, detail, receive, lot processing, allocation, returns/refunds.
  - Money: expenses, mileage, receipts, reports, commitments, reconciliation.
  - Account Ops: Business-associated navigation with a separate verified-OWNER authorization boundary.
  - Operational tasks and shared business records presented without duplicating Collect or Sell records.
- **Owner Center**
  - Overview: exactly five compact operational rows.
  - Sourcing: opportunities, eBay, auction sources, imports, search rules/history, sellers, sources.
  - Restocks: live, stores, products, patterns, visits, prediction review.
  - Performance: overview, sources, search rules, restocks, auctions, deal accuracy.
  - Controls: connections, schedules, scoring, notifications, imports, data/backup, features, security, system history.
- **Secondary, feature-controlled areas**: Kids & Community, Marketing & Content, Business Assistant, Notifications, Tasks/Calendar, Universal Search, Settings.

Internal compatibility routes MAY redirect or delegate to these concepts. They MUST NOT create a second authoritative version of a workflow.

The same opportunity, purchase, owned item, inventory item, and sale MUST remain one shared record across workspace projections. Workspaces MUST NOT introduce disconnected Collect, Sell, or Business copies. Route ownership, switcher behavior, remembered preference, deep links, compatibility, and authority semantics are normative in [WORKSPACE_ARCHITECTURE_CONTRACT.md](./WORKSPACE_ARCHITECTURE_CONTRACT.md).

## 8. Home and Global Add

The root compatibility Home answers what needs attention, what the best opportunity is, what is happening today, and how the business is doing at a glance. Attention and activity lists contain at most five compact rows. Best Opportunity contains one image-led record and is omitted when empty. The optional summary is one strip with at most Buying Budget, Inventory at Cost, Month Sales, and Month Profit.

Collect, Find, Sell, Bot, and Business each have a route-safe workspace Home whose content is limited to that workspace's existing data and working actions. A workspace Home MUST use an honest empty/foundation state rather than invent provider connectivity, orders, metrics, or automation. The root Home remains a global/compatibility surface and is not a sixth product workspace.

Global Add is an action sheet, not a workspace. Working and enabled primary actions are Scan Listing, Analyze Deal, Record Purchase, Add Collection Item, and Record Sale. More MAY expose Add Auction, Add Resale Inventory, Add Expense, Add Mileage, Add Receipt, Report Restock, Record Store Visit, Create Kids' Pack, and Record Donation. An action MUST be hidden until it opens a real workflow.

## 9. Universal Search

Universal Search SHOULD group results by record type across opportunities, auctions, restocks, products, purchases/lots, owned items, inventory, sales, expenses, receipts, sellers/sources, certification numbers, storage locations, notes, and tasks. It SHOULD support recent searches, filters, exact identifiers, card number, certification number, UPC, SKU, seller, and marketplace URL.

## 10. Find and opportunities

Find is the acquisition workspace. Deals, Restocks, and Auctions are primary. Saved, Deal Analysis, eBay Search, Import Review, Sources, and Search Rules are secondary. Raw job controls, provider diagnostics, and performance belong in Owner Center.

### Deal Inbox

The normalized feed accepts official provider results, manual URLs/text, shared screenshots or photos, CSV/JSON, authorized email alerts, auction feeds, local sellers, and manual entry. Compact rows show identity, source, price or current bid, one profit signal or Needs Analysis, combined confidence/risk, age or remaining time, and Review.

Supported lifecycle statuses are `NEW`, `NEEDS_REVIEW`, `NEEDS_ANALYSIS`, `STRONG_OPPORTUNITY`, `WORTH_AN_OFFER`, `WATCH`, `SAVED`, `OFFER_PLANNED`, `OFFER_MADE`, `BIDDING`, `PURCHASED`, `PASSED`, `EXPIRED`, `DUPLICATE`, and `ARCHIVED`.

Deal detail preserves the original URL, title, description, images/screenshots, provider payload identity, seller data supplied by an approved source, location, format, asking/bid data, dates, attribution, last check, change history, risks, analysis, rule, and purchase link. Analyze, Save, Open Original Listing, Mark Purchased, and Pass are primary record actions. Confirmed deletion behavior MUST remain.

### Import Review

Scanner and import data MUST pass through review before creating a Deal Inbox record. Review distinguishes `NEW`, `MATCHING_EXISTING`, `CHANGED`, `DUPLICATE`, `EXPIRED`, `MISSING_INFORMATION`, `ALREADY_IMPORTED`, and `IMPORT_FAILED`. The action is **Import to Deal Inbox**, never a purchase action.

### Deal Analysis

Deal Analysis is a resumable five-step workflow: Listing, Item Details, Purchase Costs, Resale Assumptions, Decision. The result shows Recommendation, Maximum Offer, Landed Cost, Expected Profit, Expected ROI, Confidence, Risk, and Save/Watch before secondary detail. Low/expected/high scenarios share one comparison. Assumptions, calculations, rules, missing information, risks, and comparable records are collapsed by default.

Allowed recommendations are `STRONG_OPPORTUNITY`, `WORTH_AN_OFFER`, `WATCH`, `FAIR_PRICE`, `PERSONAL_COLLECTION`, `PASS`, and `NOT_ENOUGH_INFORMATION`. The application never presents a purchase command.

### Comparable records

Comparable records preserve source/reference, sale date, price/shipping, match attributes, grading, listing format, evidence type, inclusion decision, exclusion reason, and notes. Completed sales and active asks remain separate. Outliers are visible and manually excludable. When sufficient licensed data exists, analysis SHOULD favor a weighted median of recent, closely matched completed sales and preserve the exact comparison set.

### Financial formulas

All monetary terms use the selected scenario inputs:

```text
landedCost = purchasePrice + purchaseShipping + purchaseTax
  + buyerPremium + fixedBuyerFees + travelCost + tolls + laborCost
  + disposalCost + cleaningCost + repairCost + preparationCost
  + otherAcquisitionCosts

grossCollected = expectedResalePrice + shippingChargedToBuyer - discounts

expectedNetProceeds = grossCollected
  - percentageSellingFees - percentagePaymentFees - fixedSellingFees
  - outboundShipping - packaging - insurance - returnFraudReserve
  - otherSellingCosts

expectedProfit = expectedNetProceeds - landedCost
ROI = expectedProfit / landedCost
profitMargin = expectedProfit / grossCollected
allowableByProfit = expectedNetProceeds - minimumDesiredProfit
allowableByROI = expectedNetProceeds / (1 + targetROI)
maximumAllowableLandedCost = min(allowableByProfit, allowableByROI)
maximumBaseOffer = maximumAllowableLandedCost
  - acquisitionCostsOtherThanBasePurchasePrice
```

Negative offers are clamped to zero. Missing or invalid data produces an explicit unavailable result, never `NaN`, `Infinity`, an invalid percentage, or a misleading zero. Money SHOULD use integer minor units in the target persistence layer, and intermediate values MUST NOT be rounded prematurely.

### eBay and Search Rules

The existing official eBay Browse connector MUST retain server-side credentials, OAuth caching/retry, documented filters, pagination, timeout/rate-limit handling, normalization, deduplication, changed/expired detection, and Import Review. It performs no account action and supplies active listings, not sold comparables.

Search Rules support provider/product classification, positive/negative/exact terms and misspellings, category, price/landed/purchase limits, location/distance, delivery and format, listing windows, seller threshold, profit/ROI/confidence/risk thresholds, priority, schedule/quiet hours, result limit, review-queue behavior, and notes. Templates are disabled until explicitly configured.

## 11. Restocks

The everyday Restocks area exposes confirmed reports and probability-based likely windows, nearby stores, observed products, freshness, and confidence. Approved labels are Confirmed, Likely Window, Possible, Report Becoming Stale, and Not Enough Data. A directory entry is context, never restock evidence.

Store profiles, product observations, restock reports, owner visits, predictions, and trip plans preserve the complete fields defined in [DATA_MODEL.md](./DATA_MODEL.md). Predictions retain their supporting events and later outcome. Owner Center metrics are computed only from real records and use `HIGH_CONFIDENCE_PATTERN`, `MODERATE_CONFIDENCE_PATTERN`, `WEAK_PATTERN`, or `NOT_ENOUGH_DATA`. Profit-per-trip/mile/hour remains unavailable until purchase, sale, mileage, and time attribution is complete.

## 12. Auctions

The model supports storage, estate, government, police, tax/public surplus, liquidation, local live, online, marketplace, charity, and other sources through authorized or manual ingestion.

Auction events retain source, timing, preview/registration/deposit/payment/pickup terms, location, status, and notes. Lots retain visible and unknown contents, bid state, reserve, premiums/fees/tax, travel and processing costs, scenarios, maximum bid, confidence, risk, and history.

Maximum-bid tax modes are `NONE`, `HAMMER_ONLY`, `HAMMER_PLUS_PREMIUM`, `MANUAL_TAXABLE_SUBTOTAL`, and `ACTUAL_TAX_AMOUNT`. Complex fee structures SHOULD use a tested numerical solver. Live Bid Mode is a read-only decision display; it never submits a bid. Pickup Planner manages logistics and checklists without claiming optimal routing unless real route data is used.

## 12A. Bot Operations foundation

Bot Operations is a verified-OWNER, provider-neutral local foundation. It models providers, installations, reusable Account Ops account/profile references, proxy metadata, product targets, task groups, tasks, append-only attempts, reviewable Checkout Evidence, and sanitized activity through `src/features/botOps`. The normal runtime starts empty. Synthetic Hayha/Stellar-disconnected, healthy/degraded mock, task-state, error, contradiction, and evidence cases exist only in tests or an explicit test harness.

Every provider declares capabilities independently. Unsupported behavior is unavailable rather than simulated. `HAYHA` and `STELLAR` remain `NOT_CONFIGURED`, all live capabilities remain false, and the mock adapter is test-only. Phase 2D-A includes no provider SDK/network adapter, bridge, webhook receiver, export watcher, credential store, task control, retailer automation, proxy connection, cart, checkout, or purchasing action.

Attempts retain scoped provider/installation/event identity and append-only history. Repeated identical events are idempotent; changed, reordered, cross-installation, or contradictory events remain reviewable rather than being overwritten. Raw provider logs and credential-bearing payloads are prohibited.

Bot success and Checkout Evidence are evidence, not business transactions:

```text
Bot Attempt -> Bot Checkout Evidence
  -> future Order Candidate / external-order reconciliation
  -> future OWNER confirmation -> future Purchase
  -> future Receiving -> future Inventory
```

Every step after Checkout Evidence is inactive. Phase 2D-A cannot create or mutate a Purchase, lot, receipt, Owned Item, Inventory record, quantity, or cost basis. The complete contract is [BOT_INTEGRATION_CONTRACT.md](./BOT_INTEGRATION_CONTRACT.md).

## 13. One owned-item model and Collection

One physical item has one stable owned-item record and one purpose: `PERSONAL_COLLECTION`, `FOR_RESALE`, `HOLD`, `KIDS_COMMUNITY`, or `UNASSIGNED`. Purpose changes preserve source, purchase/lot, images, identity, allocated cost, notes, storage, and history, and append an audit entry. Sell This Item changes purpose to `FOR_RESALE`; it does not duplicate the item.

Collection provides search/filter, owned quantity, supported estimate, and item detail. Sets, binders/pages/slots, printable placeholders, wishlist matching, grading submissions, and unassigned review are dedicated screens. Automated visual condition is always labeled Apparent Condition and cannot guarantee a grade. Legacy ambiguity remains `UNASSIGNED` until confirmed.

## 14. Purchases and inventory

Purchase status progresses through `PLANNED`, `OFFER_MADE`, `WON`, `AWAITING_PAYMENT`, `PAID`, `IN_TRANSIT`, `PICKUP_REQUIRED`, `RECEIVED`, `PROCESSING`, `COMPLETED`, `RETURNED`, `REFUNDED`, or `CANCELLED`. Purchases preserve all source, payment, acquisition-cost, receipt, logistics, lot, note, and history data.

Receiving confirms quantity and condition, records missing/damaged items and photos, and starts processing without silently finalizing inventory. Lot processing identifies physical items and assigns purpose. Allocation methods are `MANUAL`, `EQUAL`, `QUANTITY`, `RELATIVE_VALUE`, `BULK`, and `MIXED`. Total, allocated, unallocated, difference, method, and rounding adjustment are always visible; unresolved differences require explicit acceptance.

Inventory tracks available/reserved/sold quantity, allocated cost, projection, price, condition, hierarchical storage, listing/sales state, aging, and audit history. The status vocabulary and storage hierarchy are specified in [DATA_MODEL.md](./DATA_MODEL.md). Labels and QR codes are printable metadata only; printing does not change item or shipment status.

## 15. Sales and returns

Channel profiles MAY supply default selling/payment fees, fixed fees, shipping, payout delay, reserve, and listing templates. Generated listing copy requires confirmation. Active listings preserve external attribution and MUST warn before available quantity is exceeded.

Sales preserve gross amount, buyer shipping, discounts, all fees and fulfillment costs, refunds/returns, cost of goods sold, proceeds, realized profit/ROI, tracking, and payout status. Shipping records weight, dimensions, packaging, carrier/service, insurance, label, checklist, and estimated versus actual cost, with Rollo and scale workflows prioritized.

A return preserves the original sale, appends a return record, records refund and costs, waits for receipt/inspection, restores quantity only when appropriate, permits a condition downgrade, and recalculates realized results. Booth records reconcile location inventory, rent/commission, statements, sales, fees, payout, missing/returned stock, and status.

## 16. Money and reporting

Expenses, mileage, receipts, cash commitments, reports, and reconciliation retain the associations and fields defined in [DATA_MODEL.md](./DATA_MODEL.md). Mileage is a business record, not a guaranteed deduction. Bookkeeping exports are not tax returns.

Reconciliation MUST surface unallocated cost, missing COGS, negative or duplicated quantity/records, certification conflicts, incomplete returns, missing fees, auction/purchase gaps, receipt issues, listing oversell, and projected values presented as actual.

Reports MUST distinguish gross sales, net sales, revenue, cash received, net proceeds, inventory purchases, cost of goods sold, operating expenses, projected profit, realized profit, cash flow, inventory at cost, and projected inventory value.

## 17. Owner Center

Overview contains exactly five flat rows: eBay Scanner, Imports Awaiting Review, Auctions Ending Soon, Restock Activity, and Failures Requiring Action. Detailed metrics live in Sourcing, Restocks, Performance, or Controls.

Sourcing unifies opportunities and provides eBay/search metrics, auction-source capabilities/terms, import review, search-run history, and seller/source profiles. Performance presents a Found-to-Profitable funnel and evidence-based source, rule, auction, restock, and projection-accuracy metrics. Recommendations such as Keep, Refine, or Pause require a documented minimum sample.

Controls owns connections, job schedules, scoring defaults, notifications, imports, data/backup, feature controls, security, and system history. Changing scoring defaults never rewrites a saved analysis without explicit recalculation. Disabled modules disappear from everyday navigation. A connection or backup is never shown as successful until verified.

## 18. Secondary modules

Kids & Community is internal tracking for packs, donations, giveaways, events, and impact, and minimizes children's personal information. Marketing & Content is feature-flagged and secondary; publishing requires confirmation and approved access. Business Assistant answers only from real records, states date range and actual/projected semantics, links evidence, shows formulas and missing data, and never mutates records without confirmation. Tasks, calendar, and notifications use deep-linked records, priorities, snooze, and completion; background behavior is not advertised until a service exists.

## 19. Optional AI

AI is feature-flagged, cost-controlled, and human-reviewed. Possible assistance includes listing/screenshot extraction, product recognition, binder analysis, auction-photo review, authenticity-risk screening, apparent-condition notes, and receipt extraction. Original input, raw output, model/version, confidence, user correction, and final confirmed values remain distinct. Unseen contents receive no assigned value; authenticity, condition, and grade are never guaranteed.

## 20. Provider policy

Every provider implements an explicit capability and configuration contract. Official APIs and approved partnerships are preferred. Where automated access is unavailable, supported inputs are manual URL/entry, share target, screenshot, authorized email alert, CSV/JSON, RSS/feed, or official export. Provider details and current capability truth are maintained in [INTEGRATIONS.md](./INTEGRATIONS.md).

## 21. Data, provenance, and correction

The target entities and relationships are normative in [DATA_MODEL.md](./DATA_MODEL.md). Major records use stable IDs, created/updated timestamps and actors, version, source, archive state, and notes when relevant. Financial, inventory, and sales history uses archive, void, correction, return, refund, and write-off instead of destructive deletion where appropriate.

Imported and analyzed information keeps original source data, normalized data, original files, AI output, user corrections, final confirmation, import date, provider/external ID, model/version, and modification history separately. Owner-entered tax, costs, notes, condition, status, assumptions, and decisions are never silently overwritten.

## 22. Persistence, migration, and backup

Browser-local persistence is interim. The target is owner authentication, backend authorization, relational storage, protected object storage, a secure API/provider/repository layer, versioned migrations, jobs, audit logs, verified backup/restore, and an offline-aware client cache.

Migration MUST preserve current storage keys until validated; create and verify a backup; validate schemas; preview mappings and duplicates; preserve IDs/history; require confirmation for irreversible work; and provide rollback. Import follows upload/share, parse, validate, preview, map, error/duplicate review, confirm, import, and report. Backup status is truthful and versioned.

## 23. Security and privacy

Secrets remain server-side and out of bundles, logs, and Git. Sensitive endpoints require server authorization, input validation, rate limiting, safe URL handling, file type/size validation, protected file access, signed URLs where appropriate, webhook deduplication, audit logs, secure sessions, exportable owner data, and minimal seller/buyer personal information. Full payment-card credentials are never stored. Current gaps and production blockers are normative in [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md).

## 24. Offline, error, and state behavior

The installable Android experience SHOULD preserve drafts and saved reads offline, show honest offline status, queue only safe retryable operations, prevent duplicate submissions, handle Back/keyboard/safe areas/camera chooser, restore scroll/form state, and never claim cloud sync when unavailable.

Each screen defines compact empty, loading, partial, provider-unconfigured, provider-failure, offline, permission, validation, and unexpected-error states. Empty states use one heading, one sentence, and at most one relevant action.

## 25. Performance and compatibility

The known main application chunk is approximately 2,337 kB minified and 586 kB gzip. Future extraction MUST split legacy domain renderers and load Collection, Business detail, Owner Center, Reports, and optional AI by route while keeping Home/shell light. Direct routes, history behavior, local hydration, fallbacks, and aliases MUST continue to work. Tiny shared primitives are not individually split, and desktop space never justifies renewed clutter.

## 26. Verification contract

Unit coverage includes calculations, allocation/rounding, quantities/returns/aging, scoring/risk, export, serialization, migrations, Bot provider capability truth, event idempotency/reconciliation, and secret rejection. Integration coverage includes providers, deduplication/updates, rules, review, purchase-to-owned-item, allocation, purpose history, sale/return, associations, auctions, restocks, Bot Operations local-only boundaries, authorization, backup/restore, and mocked AI review. End-to-end coverage follows deal-to-sale, auction-to-result, restock-to-trip-performance, collection-to-resale lifecycles, and an OWNER-gated Bot empty/local foundation with no external action.

The existing bounded 28-scenario suite remains a release gate. Assertions are not weakened to hide regressions.

## 27. Permanent non-goals

Without a separate approved specification, the product excludes unauthorized scraping, access-control evasion, automated external account actions, guaranteed valuation/grade/authenticity/restock claims, a public customer marketplace or social network, public customer accounts, payments, subscriptions, tax filing, payroll, and mixing private owner records into a public product.

## 28. Canonical lifecycle

```text
Opportunity Found -> Import Review -> Deal Inbox -> Deal Analysis
-> Save / Watch / Pass -> Offer or Bid Plan -> Purchase -> Receive
-> Process Lot -> Allocate Costs -> Assign Purpose
   -> Personal Collection | For Resale | Hold | Kids & Community
-> Prepare Item -> Create Listing -> Record Sale -> Ship
-> Complete / Return -> Calculate Actual Result
-> Compare Projection to Actual -> Improve source intelligence
```

One physical item retains one continuous, auditable history throughout.

## 29. Delivery policy

The implementation is phased. No phase silently expands provider authority, changes historical data, or ships an irreversible migration. The repository-informed order and acceptance gates are maintained in [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md).
