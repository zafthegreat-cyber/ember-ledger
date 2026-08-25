# Code 3 Data Model

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`.

Phase 1A authentication and recovery structures and the validated Phase 1B schema/mapping contracts are published on the feature branch. No Phase 1B migration has been executed and no owner record has moved.

This document distinguishes current persisted shapes, Phase 1B schema-only representations, and the future active canonical model. A table, migration file, repository interface, or dry-run result is not evidence that remote persistence is active.

## Modeling rules

- One physical item has one stable `OwnedItem` identity.
- Imported source evidence, normalized data, user corrections, and final records remain separate.
- Historical financial and inventory facts are corrected, voided, returned, refunded, written off, or archived rather than destructively replaced.
- Major records include stable ID, created/updated timestamp, created/updated actor, schema/version, source, archive status, and notes where relevant.
- Target money uses integer minor units plus ISO currency. Current browser records use JavaScript numbers and require reconciliation during migration.
- Quantities use explicit units and validation; a draft sale does not reduce available quantity.
- Dates are stored as UTC instants when time is meaningful, plus source time zone where interpretation matters.
- Provider and external IDs are namespaced and never used as the sole internal primary key.
- Unknown legacy purpose remains `UNASSIGNED`; migration does not guess irreversibly.

## Current persisted models

### Deal Finder repository

`src/features/flipScout/storageRepository.js` stores one schema-versioned document under `ember-and-tide.flip-scout.v1` (retained internal compatibility key).

| Collection | Current purpose |
|---|---|
| `deals` | normalized listings and manually entered opportunities |
| `appraisals` | saved deal assumptions/results |
| `auctions` | manually entered auctions and maximum-bid inputs |
| `searchRules` | local rule definitions and templates |
| `purchases` | purchase headers and original projections |
| `lots` | purchase-lot grouping and allocations |
| `inventory` | owned/resale item records and quantity |
| `sales` | sale records and realized results |
| `expenses` | business expense records |
| `mileage` | business mileage records |
| `activity` | recent feature activity |
| `providerListings` | reviewed discovery snapshots used for deduplication/change detection |

The repository schema version is currently 2. It provides defaults, safe parsing, validation, import/export, and update events. It is client-local.

### Owner Center repository

`src/features/ownerCenter/ownerCenterRepository.js` stores schema version 1 under `private-business-hub.owner-center.v1` (an intentionally retained internal compatibility key, not visible branding).

| Collection/config | Current purpose |
|---|---|
| `restockStoreProfiles` | store pattern context |
| `restockEvents` | reports/confirmations |
| `restockPredictions` | prediction and outcome records |
| `storeVisits` | owner trip outcomes |
| `productObservations` | product/store observations |
| `imports` | owner import activity summaries |
| `jobs` | local job/status summaries, not a durable scheduler |
| `controls.scoring` | owner default deal thresholds/reserves |
| `controls.features` | client-visible feature toggles |

### Owned-item compatibility

`src/features/ownedItems/ownedItemPurpose.js` formalizes:

- `PERSONAL_COLLECTION`
- `FOR_RESALE`
- `HOLD`
- `KIDS_COMMUNITY`
- `UNASSIGNED`

Purpose changes append history while preserving the original inventory record. Compatibility inference reads existing fields but ambiguous records stay unassigned.

### Legacy browser and Supabase data

Important retained browser keys include:

```text
et-tcg-beta-data
et-tcg-beta-scout
et-tcg-beta-tidepool
et-tcg-beta-feedback
et-tcg-beta-suggestions
et-tcg-beta-admin-review-log
et-tcg-market-price-cache
tide_tradr_what_did_i_see_reports
et-tcg-app-theme
et-tcg-daily-tide
et-tcg-route-state
et-tcg-beta-catalog-view
et-tcg-beta-catalog-page-size
et-tcg-beta-vault-showcase-view
et-tcg-forge-mode-settings
et-grade-assist-checklists
et-ember-assist-thread
et-tcg-beta-readiness
et-tcg-phase2-data
```

`src/services/phase2Persistence.js` may write selected legacy records to Supabase when configured, otherwise it uses `et-tcg-phase2-data`. Existing migrations in `supabase/migrations` define older profiles, workspaces, catalog, receipt, notification, and beta-feature tables. These are not yet the target canonical private-business schema.

Form drafts use historical internal session/local keys such as `private-business-hub.form-draft.*`. These are compatibility identifiers, not the approved application name, and MUST remain readable until migration is verified.

## Phase 1A security and recovery structures

Phase 1A introduces transport and recovery contracts, not canonical persisted business entities.

### AuthPrincipal

The backend-only normalized principal contains immutable `subject`, `provider`, optional provider-supplied `email` and `emailVerified`, plus `issuedAt` and `expiresAt`. Owner authorization compares `provider:subject` with a server-only allowlist. No principal, role, or owner identifier is accepted from browser storage or request bodies.

### Backup source registry

Each source descriptor contains `sourceId`, `displayName`, `storageType`, `schemaVersion`, supported versions, owner-data and security-state flags, Phase 1A inclusion, export/validation adapter identifiers, reference dependencies, record paths, coverage relevance, and an exclusion reason when omitted.

Registered local sources cover Deal Finder schema 2, Owner Center schema 1, allowlisted legacy business and fallback documents, legacy restock/community and review sources, safe preferences, and safe workflow drafts. Phase 1B may also include a valid owner-authorized canonical PostgreSQL export. Legacy Supabase, other PostgreSQL/process-memory records, and file bytes remain registered exclusions. Authentication/session persistence is a prohibited source and is never exportable.

### BackupEnvelope version 1

The JSON envelope contains format/version, creation and build provenance, coverage status/summary, manifest, data sections, and integrity metadata. Each section contains source ID, schema version, record count, exact sanitized data, warnings, and SHA-256. See [BACKUP_FORMAT_V1.md](./BACKUP_FORMAT_V1.md).

Coverage is `COMPLETE`, `PARTIAL`, or `FAILED`. Configured remote sources or referenced but unembedded file bytes make an otherwise valid artifact partial. Security/session exclusion does not make it partial because those values are prohibited recovery data.

### RestorePreviewResult

The no-write result is `READY_FOR_FUTURE_RESTORE`, `READY_WITH_WARNINGS`, `BLOCKED`, `UNSUPPORTED`, or `CORRUPTED`. It contains integrity/schema/source/count comparisons plus duplicate, collision, money, prohibited-field, and broken-reference findings. It is an in-memory diagnostic, not an import job or audit write. See [RESTORE_PREVIEW_CONTRACT.md](./RESTORE_PREVIEW_CONTRACT.md).

## Phase 1B schema-only rules

Phase 1B defines canonical records without activating them. `supabase/migrations/20260820120000_code3_canonical_owner_records.sql` uses a typed `code3_records` envelope plus `code3_record_links`, so each major owner record row includes:

```text
id UUID
owner_subject text
record_type text
status text
source/external_provider/external_id/source_url
amount_minor/currency/rate_basis_points
quantity/certification_number/occurred_at
created_at timestamptz
updated_at timestamptz
record_version integer
archived_at timestamptz or explicit archive state
source text
notes text when relevant
metadata jsonb when bounded evidence is safer than over-normalization
```

Relationships use explicit link rows and foreign keys where appropriate, while domain definitions validate the allowed relationship names and target types. Likely lookups are indexed by owner plus record type/status, source/provider/external ID, certification, and created/updated time. Parent purchase/lot, owned item, sale, store, and auction links remain owner-scoped. Supabase row-level policies complement—but never replace—owner scoping in the server repository.

Canonical list ordering is ascending `(created_at, id)` and its opaque server keyset cursor contains both values with a strictly validated timestamp and UUID ID. The private local cursor uses the same ordering but remains compatible with legacy non-UUID IDs during `LOCAL_ONLY`; it is not a canonical server cursor. Local and PostgreSQL adapters apply the same `status` and `includeArchived` filters. Canonical create/update reject `ARCHIVED`; only the version-checked archive operation sets status `ARCHIVED` and `archived_at`. It does not delete the record. An archived record cannot be updated in Phase 1B; restoration requires a future explicit, audited contract.

Canonical IDs are UUIDs generated once. The schema primary key is `(owner_subject, id)`: one owner's UUID is unique across all canonical record types, while a different owner may independently use the same UUID. A valid owner-wide unique local UUID may survive migration. Provider IDs, certification numbers, legacy IDs, and source URLs remain separate. A non-UUID legacy ID may produce a deterministic preview proposal from its source identity, but a record with no stable legacy or semantic identity receives no proposed UUID and requires an owner decision. Preview writes nothing, and every collision is reported before a future apply.

Canonical money is an integer `amount_minor` paired with an ISO `currency`. Existing local numeric values remain unchanged. Preview may propose exact conversion only when the source precision and currency make it unambiguous; it preserves the source value and blocks non-finite, ambiguous, or unsupported-precision values.

Mutable records use optimistic `record_version`. A future update supplies `expectedVersion`; a stale value produces `409` rather than overwriting the newer record. Archive/correction/return/refund/write-off semantics remain distinct from destructive deletion.

File bytes are not migrated in Phase 1B. The `FILE_ASSET` record type, client manifest validator, generic canonical record, and `code3_file_assets` metadata row can represent stable ID, owner-derived scope, provider/path, MIME type, size, SHA-256, creation time, and a validated owner-scoped related record. The metadata row has an owner-scoped foreign key to the generic `FILE_ASSET` envelope; service and dry-run validation also require its optional related record to resolve within the same owner, including a valid planned insert for dry-run only. Its storage-provider/path pair is owner-unique and remains reserved when the metadata record is archived. The normal browser backup does not synthesize this manifest, and a metadata row never proves the referenced byte exists, is protected, or is included in backup.

The schema source additionally defines `code3_file_assets` for reference metadata and `code3_audit_events` for future append-only safe summaries. Neither has an active production writer in Phase 1B. Direct browser roles are not granted table access; owner-scoped RLS policies are defense in depth for a separately reviewed future access mode.

See [CANONICAL_PERSISTENCE_DECISION.md](./CANONICAL_PERSISTENCE_DECISION.md), [MIGRATION_PREVIEW_CONTRACT.md](./MIGRATION_PREVIEW_CONTRACT.md), and [MIGRATION_ROLLBACK_CONTRACT.md](./MIGRATION_ROLLBACK_CONTRACT.md).

## Target entity map

```mermaid
erDiagram
    USER ||--o{ USER_ROLE : has
    ROLE ||--o{ USER_ROLE : grants
    BUSINESS_PROFILE ||--|| BRAND_CONFIG : uses
    PROVIDER ||--o{ PROVIDER_CONNECTION : configures
    PROVIDER ||--o{ SEARCH_RULE : searches
    SEARCH_RULE ||--o{ SEARCH_RUN : executes
    SEARCH_RUN ||--o{ LISTING : discovers
    LISTING ||--o{ LISTING_SNAPSHOT : snapshots
    LISTING ||--o{ DEAL_ANALYSIS : analyzes
    DEAL_ANALYSIS ||--o{ DEAL_SCENARIO : compares
    DEAL_ANALYSIS }o--o{ COMPARABLE_RECORD : uses
    LISTING }o--|| SELLER_PROFILE : attributed_to
    LISTING }o--|| SOURCE_PROFILE : sourced_from
    AUCTION_EVENT ||--o{ AUCTION_LOT : contains
    AUCTION_LOT ||--o{ BID_PLAN : evaluates
    AUCTION_EVENT ||--o{ PICKUP_PLAN : requires
    PURCHASE ||--o{ PURCHASE_LOT : contains
    PURCHASE_LOT ||--o{ OWNED_ITEM : creates
    PURCHASE ||--o{ COST_ALLOCATION : reconciles
    OWNED_ITEM ||--o{ INVENTORY_ADJUSTMENT : changes
    OWNED_ITEM }o--|| STORAGE_LOCATION : stored_at
    OWNED_ITEM ||--o{ SALES_LISTING : listed_as
    SALE ||--o{ SALE_LINE_ITEM : contains
    SALE_LINE_ITEM }o--|| OWNED_ITEM : sells
    SALE ||--o{ SHIPMENT : fulfilled_by
    SALE ||--o{ RETURN : may_have
    RESTOCK_STORE_PROFILE ||--o{ RESTOCK_EVENT : reports
    RESTOCK_STORE_PROFILE ||--o{ STORE_VISIT : visited
    RESTOCK_EVENT ||--o{ RESTOCK_PREDICTION : supports
    PRODUCT_OBSERVATION }o--|| RESTOCK_STORE_PROFILE : observed_at
```

## Identity, access, and configuration

| Entity | Required target content |
|---|---|
| `User` | identity, status, verified contact reference, session/security metadata |
| `AuthPrincipal` | verified provider subject and bounded claims used transiently for authorization; never restored as owner data |
| `Role` / `Permission` | OWNER plus dormant collaborator/helper/bookkeeper/read-only policies |
| `BusinessProfile` | owner business settings and default reporting context |
| `BrandConfig` | Code 3 application display/short/PWA names, title template and accessible logo text; independently configurable legal/public business name and unfinished tagline; marks/icons, accents, support/social, currency, time zone |
| `AppSetting` | versioned owner settings not belonging to a domain |
| `FeatureFlag` | availability, owner override, required dependency, reason unavailable |

## Providers and discovery

| Entity | Required target content |
|---|---|
| `Provider` | provider ID/type, display name, capabilities, legal/terms review state |
| `ProviderConnection` | configuration/auth status, encrypted secret references, scopes, health/last check; never browser secrets |
| `ProviderCapability` | declared operation and status |
| `SearchRule` | all keyword, classification, price/cost, geography, format, time-window, seller, score, schedule, quiet-hour, result-limit, queue, priority, and note fields |
| `SearchRun` | rule/provider, start/finish, counts, errors, rate-limit state, runtime, cursor/page metadata |
| `Listing` | provider/external identity, original URL, title/description, seller/location, format, current price/bid/shipping, dates, state, classification, confidence/risk, related rule/purchase |
| `ListingSnapshot` | immutable provider-normalized state at check time, payload hash, change set, availability |
| `ListingImage` | original URL or protected asset reference, position, source, content metadata |
| `DealAnalysis` | immutable input version, selected scenario, recommendation, maximum offer, confidence/risk/missing data, source set |
| `DealScenario` | low/expected/high resale and complete cost/proceeds/profit/ROI/margin outputs |
| `ComparableRecord` | completed-sale vs active-ask evidence, match fields, inclusion/exclusion and reason, manual/provider provenance |
| `SellerProfile` | marketplace identity, location/rating history, purchase outcomes, packaging/condition/trust notes |
| `SourceProfile` | source type, capability, coverage, terms, prior outcomes, owner preference/block status |

Listings use the statuses in [DEFINITIVE_PRODUCT_SPEC.md](./DEFINITIVE_PRODUCT_SPEC.md). Import staging is an `ImportJob` plus row-level review results, not a final listing or owned item.

## Auctions

| Entity | Required target content |
|---|---|
| `AuctionEvent` | source/URL/type, address/distance, start/end/preview/registration, deposits, payment/pickup terms, notes/status |
| `AuctionLot` | event/lot identity, description/photos, visible/unknown contents, bid/reserve data, premium/fees/tax, logistics/processing costs, resale scenarios, risk/confidence/status |
| `BidPlan` | fee/tax policy, desired profit/ROI, solved maximum bid, scenario version, no external action |
| `PickupPlan` | window, route inputs, vehicle/helper/equipment, documents/payment/weather/tolls/destinations/checklist |

Tax mode is one of `NONE`, `HAMMER_ONLY`, `HAMMER_PLUS_PREMIUM`, `MANUAL_TAXABLE_SUBTOTAL`, or `ACTUAL_TAX_AMOUNT`.

## Restocks

| Entity | Required target content |
|---|---|
| `RestockStoreProfile` | retailer/store/address/coordinates/distance, stocking method, confirmed pattern, products/quantity/sellout, notes |
| `RestockEvent` | store/product, report time, confirmation status/source/evidence, quantity, sellout, reliability, notes |
| `RestockPrediction` | store/product, predicted date/window, confidence, supporting events, actual outcome, timing error, correct/partial/incorrect |
| `StoreVisit` | store/date/arrival, success, products/quantity/spend, miles/time, purchase link, notes |
| `ProductObservation` | product/UPC/SKU, store/retailer, MSRP, date/quantity/limit/sellout, notes |
| `TripPlan` | selected stores, route inputs, distance/time, hours/windows, priorities, vehicle, notes; no unsupported optimization claim |

## Purchases and owned items

| Entity | Required target content |
|---|---|
| `Purchase` | source/seller/listing, dates/status, every acquisition cost, payment/receipt, shipment/pickup, projections, notes/history |
| `PurchaseLot` | purchase, photos, descriptions, expected/actual quantities, processing state |
| `CostAllocation` | purchase/lot/item, method, basis, amount, rounding adjustment, accepted unresolved difference and actor |
| `OwnedItem` | stable physical identity, purchase/lot, product/card fields, quantity, purpose, condition/grade/certification, images, allocated cost, storage, projection, notes/history |
| `InventoryAdjustment` | quantity/state/storage/purpose change, reason, before/after, related sale/return/correction, actor |
| `StorageLocation` | hierarchical building/room/shelf/cabinet/bin/box/binder/page/slot node |
| `Binder` / `BinderPage` / `BinderSlot` | binder metadata and explicit owned-item placement |
| `WishlistItem` | target product/variant/condition, maximum price, priority, preferred source, alert/matches |
| `GradingSubmission` | candidate, provider/cost/shipping/insurance, expected grade/value, break-even, dates/result/certification/actual cost |

Owned-item purpose is `PERSONAL_COLLECTION`, `FOR_RESALE`, `HOLD`, `KIDS_COMMUNITY`, or `UNASSIGNED`.

Inventory status supports `UNPROCESSED`, `NEEDS_IDENTIFICATION`, `NEEDS_REVIEW`, `NEEDS_CLEANING`, `NEEDS_PHOTOS`, `NEEDS_PRICING`, `READY_TO_LIST`, `LISTED`, `RESERVED`, `SOLD`, `SHIPPED`, `RETURNED`, `HOLD`, `GRADING_CANDIDATE`, `SUBMITTED_FOR_GRADING`, `DONATED`, `WRITTEN_OFF`, `MISSING`, and `ARCHIVED`.

Default aging buckets are 0–30, 31–60, 61–90, 91–180, 181–365, and over 365 days; report settings may define custom ranges.

## Sales and fulfillment

| Entity | Required target content |
|---|---|
| `SalesChannel` | channel type, default fees/shipping/payout/reserve/template |
| `SalesListing` | owned item, channel, generated/confirmed copy, category/condition/photos, quantity/pricing/shipping/returns, external URL/status |
| `Sale` | channel/buyer-minimized identity, dates, gross/shipping/discounts/fees/costs/refunds, COGS, proceeds/profit/ROI, payout status |
| `SaleLineItem` | owned item, quantity, unit/gross amounts, allocated COGS; prevents double sale |
| `Shipment` | weight/dimensions/packaging/carrier/service/insurance/tracking/label/checklist, estimated/actual cost |
| `Return` | original sale/lines, request/receipt/inspection, refund/costs, quantity restoration, condition outcome, recalculation |
| `BoothLocation` | venue/shelf/case and commercial terms |
| `BoothStatement` | period, inventory movement, sales, withheld fees, payout, missing/returned items, reconciliation |

## Money

| Entity | Required target content |
|---|---|
| `Expense` | date/category/merchant/description/amount/payment/business percentage, related records, receipt/recurring/notes |
| `MileageTrip` | date/start/destination/purpose/round trip/miles/odometer/parking/tolls, related record, notes |
| `Receipt` | protected image/PDF, merchant/date/amount/tax/category/transaction, duplicate/review state, original file |
| `CashCommitment` | type, related record, expected amount/date, paid/settled state, exposure |
| `ReconciliationIssue` | typed discrepancy, severity, records, evidence, status, resolution/correction |

Expense categories cover inventory, shipping, packaging, selling/payment fees, supplies/equipment, booth, advertising/software, travel/tolls/storage, repair/cleaning/disposal, grading/insurance, professional/licenses, donations, and other.

## Community, content, and work management

| Entity | Required target content |
|---|---|
| `KidsPack` | type/age range, card/special item count, packaging and allocated inventory cost, assembly/destination/distribution/event/notes |
| `Donation` | recipient-minimized identity, date/items/quantity/cost/event/notes |
| `Giveaway` | rules/date/items/winner-minimized identity/distribution/cost/notes |
| `CommunityEvent` | location/date, inventory/packs/expenses/attendance/notes |
| `ContentDraft` | platform/copy/assets/tags/action/schedule/approval/published URL |
| `ContentCalendarItem` | platform/date/campaign/type/status/related records/notes |
| `Campaign` | goal/dates/products/budget/content/giveaways/results |
| `CreativeAsset` | protected file, type, brand usage, rights/source |
| `SocialPerformanceRecord` | source/date-range and available engagement/traffic/attribution facts |
| `Task` | title/status/priority/due date, related record, assignment, completion |
| `CalendarEvent` | typed date/time/time zone, related record, reminders |
| `Notification` | priority/type/record/time/deep link, read/snooze/completed state and delivery evidence |

## Files, jobs, import/export, and audit

| Entity | Required target content |
|---|---|
| `FileAsset` | protected object key, original name, MIME/size/hash, source, owner, access policy, scan status |
| `ImportJob` | method/source, original file/data, schema/mapping, row validation/deduplication, preview, confirmation, counts/errors |
| `ExportJob` | future durable type/date range/schema version, generated asset, validation/hash, requested/completed timestamps; Phase 1A returns only an in-memory activity summary |
| `SyncJob` | provider/direction/cursor, idempotency key, counts/errors/retry state |
| `BackgroundJob` | type/schedule/attempt/lease, status, inputs/result, rate-limit metadata, heartbeat/history |
| `ActivityLog` | owner-facing domain activity |
| `AuditLog` | append-only actor/action/entity/before-after references, request/session, timestamp, administrative reason |

## Provenance layers

For every import or assisted analysis, retain:

1. original payload, file, URL, image, or screenshot;
2. provider-normalized payload and normalizer version;
3. optional raw AI output and model/version;
4. owner edits and corrections;
5. final confirmed record and confirmation actor/time;
6. later snapshots, change detection, corrections, and audit entries.

Owner-entered tax, costs, notes, condition, status, resale assumptions, and decision history cannot be overwritten by refresh. A new snapshot may propose changes for review.

## Money precision and formulas

Target database columns store currency as integer minor units (`BIGINT` where aggregate size warrants it). Phase 1B constrains individual `amount_minor` values to JavaScript's safe-integer range and validates amount/currency as a pair. When an amount is supplied without currency, canonical create uses the current default `USD`; currency without an amount is rejected, and an update may not leave only one member of the pair. The generic canonical record also has an optional integer `rate_basis_points` field, exposed as `rateBasisPoints` and bounded from 0 through 100,000 by client/server/schema validation. Phase 1B does not semantically map legacy fee, tax, ROI, and similar domain-specific values into that field; they remain preserved in source metadata pending an explicit owner-reviewed mapping. Conversion, if ever introduced, preserves source amount/currency, rate, provider, and timestamp.

Canonical record metadata is a bounded JSON object. The client/server wire contract accepts at most 250,000 UTF-8 JSON bytes and also limits depth, node count, keys, array length, and string length. The schema's 262,144-byte JSON text constraint provides a safety margin for representation overhead; it does not expand the accepted API contract.

Current local floating-point values MUST be exported, validated to currency precision, totaled by record type, and reconciled before conversion. Allocation rounding uses an explicit adjustment assigned deterministically and recorded.

Phase 1B conversion is diagnostic only. The current validator explicitly supports `USD`, `CAD`, `EUR`, `GBP`, and `AUD` with two minor digits, plus `JPY` with zero; any other currency blocks until its precision rule is added and tested. For a two-decimal currency, `12.34`, `12.3`, and `12` may be proposed as `1234`, `1230`, and `1200` minor units. `12.345`, `NaN`, Infinity, ambiguous strings, missing currency, and incompatible linked currencies warn or block according to the field contract. No migration adapter silently rounds or mutates a local value.

## Migration approach

1. Inventory every current key/table and freeze schema validators.
2. Create a versioned JSON export and state `COMPLETE`, `PARTIAL`, or `FAILED` coverage honestly; verify hashes/counts and diagnose IDs, references, and money without mutation.
3. Produce a deterministic zero-write mapping plan with inserts, updates, skips, required decisions, errors, duplicates, ambiguous purposes, orphan references, and money-conversion differences; never propose delete.
4. Preserve old IDs as migration references while assigning stable canonical IDs.
5. Import originals/provenance before normalized final records.
6. Keep old keys read-only and support rollback until record-level reconciliation passes.
7. Require owner confirmation before cutover or destructive retirement.

Records that cannot map automatically remain in an explicit review queue; they are never dropped or guessed.
