# Code 3 Implementation Status

Last audited: 2026-08-26

Published Phase 1C commit: `af21199f610cc91e31d9dee59af6f0a2f748ab79`

Repository branch represented: `ui-104-final-product-ui-2` (Phase 2A local working copy prepared from a detached worktree at the published Phase 1C commit)

Pull request: #1, Draft
Deployment: authenticated Vercel Preview only; no production deployment

## Current phase

**Phase 2A — Account Ops Foundation** is implemented and fully validated locally, and remains unpublished pending a separately authorized checkpoint. It adds profiles, alias metadata, retailer-account metadata, assisted human setup, account health, tasks, backup/preview registration, and future Inbox/Orders contracts. Phase 1B remains the persistence boundary: its database artifact is `SCHEMA_ONLY`, Migration Preview is `DRY_RUN_ONLY`, `LOCAL_ONLY` remains authoritative, `REMOTE_ACTIVE` is disabled, no database migration was executed, no provider-backed alias/mail/order connection was activated, and no owner data moved.

## Completed baseline

- definitive product, feature-status, architecture, data, integration, security, roadmap, status, and risk documentation;
- approved Code 3 application-name decision documented with the business name and tagline kept separate;
- approved minimal mobile-first shell and plain-language primary navigation;
- Home, Find, Global Add, Collection, and Business workspace foundations;
- owner-only Owner Center UI with Overview, Sourcing, Restocks, Performance, and Controls;
- server-side eBay Browse OAuth/search, token cache, filters, pagination, error mapping, and honest health state;
- eBay discovery normalization, deduplication, changed/expired detection, and Import Review gate;
- Deal Inbox, manual Deal Analysis, tested calculations, Search Rules, manual auctions/max-bid foundation;
- purchase/lot/inventory/sale/expense/mileage and projected-versus-actual local records;
- one owned-item purpose model with audit history compatibility;
- restock profile/event/prediction/visit/observation local models and metrics;
- JSON/CSV feature export/import foundation;
- centralized brand and semantic design-token foundation;
- light/dark, keyboard, safe-area, Android-back, route-alias, and compatibility foundations;
- clean-checkout reproducibility and targeted browser/regression runners;
- local implementation backup/checkpoint history through the published baseline;
- centralized Code 3 display, PWA, browser-title, offline, favicon, and accessible-logo identity with separate blank business name/tagline;
- Supabase Auth access-token verification and normalized server principal;
- provider-qualified immutable-subject OWNER allowlist;
- fail-closed protected eBay health/search routes and safe auth-session inspection;
- exact-origin CORS for auth/eBay plus reusable redaction;
- verified JSON backup format version 1 with SHA-256 section/manifest hashes and explicit coverage;
- bounded, no-write Restore Preview with duplicate, reference, schema, prohibited-data, and money diagnostics;
- compact Owner Center auth states and Data & Backup workflow.

The Phase 1B checkpoint adds:

- selected canonical architecture: React → owner-authorized Express API → domain repository/service → PostgreSQL/Supabase Postgres;
- schema-only canonical domains with UUIDs, owner scope, record versions, minor-unit money, a generic bounded basis-point field, foreign keys/indexes, and file-reference metadata;
- owner-scoped repository and API contracts with strict input validation, matching local/remote status and `includeArchived` behavior, stable `(createdAt, id)` keyset ordering, strict timestamp/UUID remote cursors with a separate legacy-compatible private local cursor, `ARCHIVED` state, active-record external/certification uniqueness, archive operations, and `409` optimistic conflicts;
- explicit `LOCAL_ONLY`, `MIGRATION_PREVIEW`, and `REMOTE_ACTIVE` modes with local remaining active; existing feature components are not yet switched to the new gateway;
- complete explicit classification of all 80 backup-registry record paths and deterministic Migration Preview actions (`INSERT`, `UPDATE`, `SKIP`, `REQUIRES_DECISION`) with no delete/archive proposal; owner-wide ID collisions, identity-less records, and archived candidates require review through `ARCHIVE_ACTION_REQUIRED`;
- client canonical wire validation aligned to the server contract; ID/provider/certification/sale-reference/expense/import/version/reference, generic rate, source-read, and money-conversion diagnostics; an explicit metadata-only FileAsset manifest path; and backend dry-run enforcement for exact `input.id`, unresolved decisions, plan-local forward references, invalid-target propagation, archived-record immutability, and intra-plan ID/provider/certification/FileAsset-path collisions;
- Migration Readiness under Owner Center → Controls → Data & Backup through `src/features/backup/MigrationReadinessPanel.jsx`;
- owner-authorized server-export bridge through `src/services/code3OwnerApi.js`, with one consistent repository snapshot, a recomputed source hash, verified remote records when available, and honest `PARTIAL`/unavailable coverage otherwise;
- rollback and offline/sync contracts; no sync engine, file upload, restore apply, or migration apply.

The published Phase 1C checkpoint adds:

- reusable presentation-independent intelligence contracts and methodology versions under `src/features/intelligence`;
- a complete apparent-condition vocabulary (`NM`, `LP`, `MP`, `HP`, `DMG`) and defect taxonomy with structural-damage, cumulative-wear, front/back, image-quality, uncertainty, and centering safeguards;
- one shared `HIGH`, `MEDIUM`, `LOW`, `INSUFFICIENT` confidence model that accounts for source independence, quality, sample size, freshness, completeness, identity/condition certainty, and contradictions;
- exact safe-integer minor-unit money and bounded basis-point calculations with explicit rounding behavior;
- `code3.valuation.v2` condition-aware valuation that uses matching-condition verified sales without another adjustment, falls back only to an explicitly `NM` baseline adjustment, excludes unknown/incompatible conditions, and keeps active listings, reference prices, owner cost/sales, and predicted resale separate; no sold-price provider was added;
- explainable advisory deal recommendations (`STRONG_BUY`, `BUY`, `WATCH`, `PASS`, `INSUFFICIENT_DATA`) with explicit risk severity, multi-item lot scenarios, auction maximum-bid/downside calculations, and coarse evidence-based restock likelihood based on latest-positive freshness and source-independent evidence;
- a reusable card-analysis pipeline with canonical input hashing, identity/evidence/condition/valuation/recommendation separation, and optional explicit persistence;
- append-only tagged local card-analysis revisions in the existing `appraisals` collection through a gateway fixed to `LOCAL_ONLY`, including linked reanalysis, deterministic comparison, and version-checked owner corrections that never mutate the system proposal; auction saves do not create a generic revision series and restock intelligence recomputes from observations;
- an eBay adapter that preserves official source identity/observations/active-listing evidence separately and refuses to fabricate missing currency, plus a scanner/provider-neutral boundary that makes no OCR, computer-vision, grade, or authenticity claim;
- [INTELLIGENCE_CONTRACT.md](./INTELLIGENCE_CONTRACT.md) plus focused domain/history/provider tests and deterministic QA inputs.

The local, unpublished Phase 2A working copy adds:

- a first-class, lazy-loaded `/account-ops/*` private workspace with Overview, Profiles, Emails, Store Accounts, and Tasks;
- a verified-session gate that does not read the Account Ops repository before OWNER authorization and never treats an operational profile as authentication identity;
- one schema-versioned `code3.account-ops.v1` source with eight arrays (`profileGroups`, `profiles`, `emailDomains`, `emailAliases`, `retailers`, `storeAccounts`, `tasks`, `activity`) through a persistence gateway fixed to `LOCAL_ONLY`;
- profile/group create, edit, archive, relationship, search, and filter behavior;
- secure-random alias templates, validation/collision handling, and an explicit distinction between locally generated metadata, catch-all evidence, provider provisioning, and receiving-mail confirmation;
- static capability-honest retailer presets plus custom retailer metadata, store-account status/verification/setup/checklist state, and explainable account health;
- nonsecret credential references and an ephemeral password generator whose plaintext value is never logged, persisted, analyzed, or backed up;
- manual/account-generated tasks, retained done/dismissed state, safe metadata-only bulk operations, and bounded recent activity;
- future Inbox and order-candidate contracts only; no mailbox connection, message fetch/parser, order import, retailer signup submission, verification bypass, checkout, or purchase action;
- Backup Format v1 coverage for Account Ops metadata and zero-write Restore Preview validation, with all eight migration paths explicitly `REQUIRES_MAPPING` because no canonical Account Ops domain exists;
- [ACCOUNT_OPS_CONTRACT.md](./ACCOUNT_OPS_CONTRACT.md) plus completed domain, fixture, UI-contract, browser, recovery, security, route, accessibility, and regression validation.

## Partially complete or implemented differently

- canonical target contracts are versioned and validated, while active feature records remain browser-local and retain their existing heterogeneous schemas;
- owner authorization protects the eBay route family in published source and Phase 1B canonical routes locally, but legacy/private API families remain outside it and hosted configuration still requires verification;
- Supabase/PostgreSQL support exists for legacy domains; Phase 1B adds canonical schema/repository contracts locally but does not activate them;
- Collection sets/wishlist/grading and Business record screens are useful foundations, not complete lifecycles;
- auctions and restocks now have deterministic Phase 1C decision-support services in addition to their local data/calculation foundations, but auction has no linked generic revision series, restock conclusions recompute from observations, and source/detail/planning/canonical history flows remain incomplete;
- reports/performance calculate some real local metrics, but many target associations and histories are absent;
- feature controls are local UI controls, not server policy;
- PWA install/offline shell exists, but durable sync, conflicts, and safe queued mutation do not;
- the approved Code 3 values are applied centrally in the local runtime, but default social handle/currency/time zone remain unresolved and compatibility/public-beta copy still needs a bounded historical-wording sweep;
- compatibility routing remains custom and large portions of legacy UI still live in `src/App.jsx`.
- Account Ops profiles, aliases, retailer accounts, health, and tasks work only in the Phase 2A browser-local source; secure credential storage, provider provisioning, Inbox/Orders, durable audit, and canonical mapping remain absent.

## Blocked

| Capability | Blocker |
|---|---|
| Production private-data use | deployed/configured owner boundary for all sensitive APIs, durable canonical storage, server/file backup, security review |
| Scheduled eBay scans/alerts | server authorization, durable jobs, production eBay access/quota, notification delivery |
| Sold-comparable analysis | approved/licensed completed-sale data source |
| Automated marketplace search beyond eBay | official provider API/partnership or authorized feed |
| Protected receipts/images | object storage and authenticated file access |
| Full cross-device operation | canonical API, conflict strategy, offline-aware cache |
| Background notifications | durable scheduler and verified delivery provider |
| AI-assisted review | Phase 1C supplies deterministic contracts/provenance only; a real provider still requires privacy/cost approval, protected evidence, evaluation, and human review |
| Provider-managed email aliases | approved email provider, server-side credentials, owner authorization, truthful health/provisioning contract, and retention policy |
| Unified Inbox and retailer orders | approved minimally scoped provider, protected content, idempotency, retention, server authorization, and owner review before Purchases |
| Production deployment | all security blockers and owner physical-device review |

## Not started or materially missing

- activation and disposable-database verification of the canonical backend repository for Deal Finder, Owner Center, purchases, owned items, sales, and money;
- complete server/file-inclusive backup and an owner-confirmed transactional restore implementation;
- universal cross-record search;
- durable search history, schedules, notifications, and system job history;
- comparable-record repository and licensed sold-price feed;
- full auction event/lot/source/calendar/live-display/pickup workflows;
- complete restock report/visit/product/trip screens and cross-domain performance attribution;
- binders, placeholder generator, full grading submissions, complete unassigned review;
- receiving, returns, shipping, storage labels, booth, receipts, commitments, reconciliation, full reports;
- record-grounded Business Assistant;
- protected model-backed AI review pipeline (Phase 1C deterministic rules and adapter boundary are not AI/CV);
- canonical internal Kids & Community and feature-flagged Marketing & Content;
- connected-device/session administration and append-only audit history.

## Last verified test evidence

The published Phase 1A checkpoint report records:

- frontend production build: passed;
- backend TypeScript build: passed;
- Deal Finder (`test:flip-scout`) and Owner Center tests: passed;
- eBay connector tests: 13/13 passed;
- browser, route-loading, compatibility, plain-language, lazy direct-load, keyboard, light/dark viewport, and focused smoke tests: passed;
- bounded beta regression: 28/28 scenarios passed with no open handles;
- `git diff --check`: passed.

The Phase 1B checkpoint separately passed its repository, schema-inspection, validation, migration-preview/plan, persistence-mode, remote-backup, Migration Readiness, build, security, existing-feature, route, accessibility, light/dark viewport, focused-smoke, and safety-scan gates. Publication of that source is not evidence of schema execution, hosted activation, or owner-data migration.

Focused Phase 1B evidence: `npm --prefix backend run test:code3-canonical` passed 47/47 assertions; `npm run test:code3-client-persistence`, `npm run test:code3-migration-preview`, and `npm run test:code3-migration-readiness` each passed.

Phase 1C publication-candidate validation was reproducible and is represented by the published `af21199f610cc91e31d9dee59af6f0a2f748ab79` checkpoint. Focused results were 168 domain assertions, 27 card-history/provider cases, 61 integration assertions, and 15/15 deterministic QA fixtures with 175 assertions. They include strict `LOCAL_ONLY`, zero remote calls, nested authority-field rejection, linked card revisions, owner correction provenance, deterministic input hashes/comparison, valuation v2 condition-basis behavior, honest eBay active evidence/missing-currency handling, human-readable auction assumptions, explicit risk severity, restock latest-positive freshness/source independence, and no scanner CV claim.

The Phase 1C final local gate passed frontend and backend builds; Phase 1A/1B security, canonical, persistence, migration-preview/readiness, backup/restore, eBay, sourcing, Owner Center, route, browser, accessibility, light/dark viewport, and focused-smoke suites; credential/safety scans; and the complete bounded regression. The regression passed 28/28 scenarios in 323.446 seconds of suite time, with zero retries and no open handles after cleanup. The five slowest scenarios were Business inventory add/edit/delete (42.680 seconds), Scout report persistence (33.961 seconds), Collection-to-resale quantity transfer (28.968 seconds), Market Watch deal check (27.996 seconds), and Scout report add/edit (25.154 seconds). “Scout” and “Forge” remain intentional historical regression-scenario names, not visible Code 3 product labels.

The Phase 2A local validation gate passed frontend and backend builds; 183 Account Ops domain assertions; 20/20 deterministic fixtures with 573 assertions; 31 UI-contract assertions; and a 25-capture mobile browser matrix with 228 assertions, zero 360-pixel horizontal overflow, and no application browser errors. Backup Format v1 passed with 18 included sections and 14 fixture records; Restore Preview, Migration Preview, client persistence, and Migration Readiness remained zero-write/local-only. Phase 1A/1B/1C branding, security, canonical, eBay, intelligence, sourcing, Owner Center, route, compatibility, accessibility, lazy-load, light/dark viewport, and focused-smoke gates passed. The bounded regression passed 28/28 scenarios in 314.834 seconds with zero retries and no open handles. The five slowest scenarios were Business inventory add/edit/delete (42.617 seconds), Scout report persistence (33.891 seconds), Collection-to-resale quantity transfer (28.801 seconds), Scout report add/edit (25.129 seconds), and Market Watch deal check (23.789 seconds). One dark viewport run made concurrently with the light matrix missed a Scout text assertion; the unchanged dark matrix passed all 47 combinations when run alone, identifying local browser contention rather than an application correction.

## Preview state

- PR #1 remains Draft per the task baseline.
- The published branch points to the Phase 1C checkpoint `af21199f610cc91e31d9dee59af6f0a2f748ab79`; Phase 2A changes are local only.
- Deployment is Vercel Preview only and requires authentication.
- No production deployment is represented by this documentation.

## Known defects and debt

1. The main application chunk is approximately 2,337 kB minified and 586 kB gzip.
2. Auth/eBay use the published owner/CORS boundary; Phase 1B canonical routes reuse it, while legacy Express routes remain outside it.
3. Browser-visible legacy role/development variables are presentation/testing inputs, not a safe authorization source.
4. Current owner/business records are single-browser local data.
5. Browser backup integrity/preview exist and Phase 1B can include a valid owner-authorized canonical server export; canonical data remains excluded/`PARTIAL` while the gate/database is unavailable, other server sources and file bytes remain outside coverage, and restore apply is intentionally absent.
6. `src/App.jsx` contains extensive legacy renderers and compatibility state.
7. Provider capability/status vocabularies are not yet normalized to the target contract.
8. Several legacy/public-beta data models and routes remain alongside the private product.
9. Dependency vulnerability reports require separate review.
10. Physical Samsung/Android review is still recommended before any production decision.
11. Compatibility/public-beta modules still contain historical visible branding; new primary identity is centralized, but a later bounded copy migration remains.
12. Phase 1B schema files have not been executed against a disposable, Preview, owner, or Production database in this task.
13. Migration Readiness is local-only and no-write; its integrated owner-authorized read adapter can supply remote counts only when the gated canonical export is configured, available, complete enough for its stated coverage, and valid.
14. File assets remain metadata/schema only. An explicitly supplied metadata manifest can be previewed as canonical `FILE_ASSET` records, but the normal backup registry does not synthesize that manifest and file bytes are not inventoried, uploaded, migrated, protected, or included in backup.
15. Offline/sync behavior is a contract only; no pending-write queue is active.
16. Minor-unit preview currently supports only `USD`, `CAD`, `EUR`, `GBP`, `AUD`, and `JPY`; other currencies block pending an explicit precision rule.
17. The canonical envelope has one generic bounded `rateBasisPoints` field, but Phase 1B does not semantically map legacy fee, tax, ROI, and other domain-specific percentages into it; those values remain preserved metadata pending an owner-reviewed mapping.
18. Phase 1C completed-sale valuation has no licensed provider; active eBay asks are deliberately separate and cannot produce a completed-sale market estimate. Valuation v2 can use only matching-condition verified sales or an explicit `NM` baseline and excludes unknown/incompatible condition bases.
19. Phase 1C has no OCR, computer-vision, authenticity, grading, or AI provider. Image references are not protected file bytes and are not analyzed by the provider-neutral adapter.
20. Card-analysis history remains single-browser `LOCAL_ONLY` data inside `appraisals`; it is recoverable through the existing registered section, subject to the same local-device/file-byte coverage limitations. Auction saves have no generic linked revision series, and restock results recompute from observations.
21. Deterministic condition, deal, auction, and restock proposals depend on supplied evidence/assumptions and require owner review; explicit risk severity and confidence bands remain advisory, and reproducibility is not certainty.
22. Account Ops can contain names, phones, addresses, aliases, usernames, and notes in browser-local storage and unencrypted JSON backups; no canonical or protected persistence exists.
23. A generated alias is local metadata only. No provider-managed or verified catch-all integration can prove that it receives mail, and no secure credential-vault adapter is active.
24. Account Ops Inbox and Orders are contracts only. No mailbox is connected, no messages or order events are fetched, and no external evidence can create a Purchase automatically.
25. Assisted retailer setup is a human checklist. Code 3 neither submits signups nor bypasses CAPTCHA, OTP, verification, bot detection, household/account limits, or purchase limits.

## Next recommended task

Review the validated Phase 2A captures and, if approved, publish Phase 2A only through a separately authorized checkpoint. The recommended Phase 2B work is first a design/security decision for a minimally scoped read-only Inbox/order provider and owner-review gate; do not connect a mailbox or implement order ingestion without that approval. The established route/app-shell extraction remains the safer structural task before further feature growth, and disposable-database verification remains separately authorized with no owner data.

Do not apply the schema to the owner or Production database, enable `REMOTE_ACTIVE`, migrate files, or execute a migration plan without a separately approved cutover task and verified backup.
