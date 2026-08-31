# Code 3 Implementation Status

Last audited: 2026-08-28

Published Phase 2B2-B commit / Phase 2D-A starting HEAD: `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`

Repository branch represented: `ui-104-final-product-ui-2` (Phase 2D-A local working copy prepared from a detached worktree at the published Phase 2B2-B commit)

Pull request: #1, Draft
Deployment: the published Phase 2B2-B commit has a Preview. Its separate Phase 2B2-B.1 operational verification is paused; a Free Upstash resource and three branch-scoped Preview secrets exist, but remaining owner/CORS/activation values are absent, no follow-up Preview was deployed, and `hostedRuntimeVerified=false`. Phase 2D-A is local only and has no deployment.

## Current phase

**Phase 2D-A — Bot Integration Foundation** is the current local-only implementation phase. It adds provider-neutral Bot Operations records/services, safe Account Ops references, test-only mock adapters/fixtures, scoped idempotency and contradiction-preserving history, recursive credential/authority/raw-provider rejection, a sanitized Backup/zero-write Restore Preview extension, and an OWNER-gated responsive UI. Hayha and Stellar remain `NOT_CONFIGURED`; all live capabilities are false. It does not connect or control a Bot, use real credentials/accounts/proxies, automate checkout, create a Business Purchase, receive Inventory, activate hosted canonical persistence, or deploy Production.

Phase 2B2-B.1 remains paused and independent. `LOCAL_ONLY` remains authoritative; `REMOTE_ACTIVE` is disabled; the Phase 1B schema remains `SCHEMA_ONLY`; no owner record moved; `hostedRuntimeVerified=false`.

## Completed baseline

- definitive product, feature-status, architecture, data, integration, security, roadmap, status, and risk documentation;
- approved Code 3 application-name decision documented with the business name and tagline kept separate;
- approved minimal mobile-first shell and plain-language primary navigation;
- published minimal Home, Find, Global Add, Collection, and Business surfaces that Phase 2A.5 reorganizes through compatibility routes;
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

The published Phase 2A checkpoint adds:

- a first-class, lazy-loaded `/account-ops/*` private workspace with Overview, Profiles, Emails, Store Accounts, and Tasks;
- a verified-session gate that does not read the Account Ops repository before OWNER authorization and never treats an operational profile as authentication identity;
- one schema-versioned `code3.account-ops.v1` source with eight arrays (`profileGroups`, `profiles`, `emailDomains`, `emailAliases`, `retailers`, `storeAccounts`, `tasks`, `activity`) through a persistence gateway fixed to `LOCAL_ONLY`;
- profile/group create, edit, archive, relationship, search, and filter behavior;
- secure-random alias templates, validation/collision handling, and an explicit distinction between locally generated metadata, catch-all evidence, provider provisioning, and receiving-mail confirmation;
- static capability-honest retailer presets plus custom retailer metadata, store-account status/verification/setup/checklist state, and explainable account health;
- nonsecret credential references and an ephemeral password generator whose plaintext value is never logged, persisted, analyzed, or backed up;
- manual/account-generated tasks, retained done/dismissed state, safe metadata-only bulk operations, and bounded recent activity;
- future Inbox and order-candidate contracts only at the Phase 2A checkpoint; no mailbox connection, message fetch/parser, order import, retailer signup submission, verification bypass, checkout, or purchase action;
- Backup Format v1 coverage for Account Ops metadata and zero-write Restore Preview validation, with all eight migration paths explicitly `REQUIRES_MAPPING` because no canonical Account Ops domain exists;
- [ACCOUNT_OPS_CONTRACT.md](./ACCOUNT_OPS_CONTRACT.md) plus completed domain, fixture, UI-contract, browser, recovery, security, route, accessibility, and regression validation.

The published Phase 2A.5 checkpoint adds:

- one central product-workspace/route ownership model for Collect, Find, Sell, Bot, Business, Owner, Global, and legacy redirects;
- compatibility-first homes at `/collect`, `/find/home`, `/sell/home`, `/bot`, and `/business`;
- a compact, accessible workspace switcher plus workspace-local mobile and desktop navigation;
- a bounded `code3.workspace-preference.v1` preference with a public product-workspace fallback and optional inert last selection; it is separate from historical `Workspace`/`activeWorkspaceId`, contains no authority, requires fresh OWNER verification before a remembered Bot selection can resolve, and yields to direct routes;
- an OWNER-only Bot shell with honest no-provider state and no automation;
- Business association for Account Ops while retaining its existing pre-storage verified OWNER gate;
- explicit future entitlement metadata that cannot authorize a route and keeps OWNER distinct from paid tiers;
- [WORKSPACE_ARCHITECTURE_CONTRACT.md](./WORKSPACE_ARCHITECTURE_CONTRACT.md), with its reviewed workspace/navigation safety boundary published at `4c6c7891a123777acec8f326793f30aee61f3de6`.

The published Phase 2B1 checkpoint adds:

- a provider-neutral trusted-runtime boundary under `backend/src/providerRuntime` with Gmail and Microsoft definitions that truthfully expose no active capabilities;
- OWNER-protected, no-store status/capability and disconnect routes under `/api/account-ops/provider-connections`, mounted before legacy wildcard CORS;
- unavailable default connection, secret, and OAuth-state stores so Preview/Production cannot connect accidentally, plus dependency-injected memory adapters restricted to automated tests;
- bounded OAuth-state contracts for verified-owner, provider, exact redirect, expiration, and atomic one-time consumption, without an active connect or callback route;
- server redaction for bearer/basic credentials, OAuth codes/state/verifiers, tokens, reset/login links, and secret-bearing URL parameters;
- fixed client request handling and lazy Account Ops Connections/Inbox/Orders surfaces loaded only after the existing verified OWNER boundary;
- a separate versioned `code3.inbox-order.v1` `LOCAL_ONLY` source with minimized `messageEvents`, current `orderCandidates`, append-only `candidateEvents`, and sanitized `activity`;
- protected/unrelated-message minimization before hashing or persistence, deterministic alias/retailer proposals, exact-minor-unit money, scoped idempotency, multi-message order reconciliation, and retry repair of missing history/activity without duplicating complete records;
- explicit candidate owner confirmation/correction/rejection with retained provenance and no path to the Purchase repository;
- Backup Format v1 registration at 23 total sources (19 locally included and four excluded/conditional), zero-write Restore Preview validation, and four `REQUIRES_MAPPING` paths;
- [INBOX_ORDER_PROVIDER_CONTRACT.md](./INBOX_ORDER_PROVIDER_CONTRACT.md) and deterministic synthetic fixtures only. No real mailbox, provider token, authorization scope, Purchase import, or hosted provider connection is active.

Published Phase 2B2-A adds:

- exact `api/auth/session.ts` and `api/account-ops/provider-connections.ts` filesystem functions that only export the canonical Express app;
- `backend/src/providerRuntime/trustedRuntime.ts`, whose bounded proof requires exact server-owned Vercel Preview markers and rejects Production, hosted-unknown, local, test, request, role, and query substitutes;
- separate runtime and provider readiness: trusted Preview execution may be available while runtime `available=false`, Gmail/Outlook remain `NOT_CONFIGURED`, all live capabilities remain false, and default connection/secret/OAuth-state stores remain unavailable;
- a client response allowlist and Account Ops status view showing `Trusted runtime available/unavailable` separately from Gmail/Outlook configuration, with no Connect action;
- focused Preview mapping, owner-auth, no-store/CORS, secret exclusion, no-mailbox-network, Production-safety, and provider-capability tests;
- [PREVIEW_TRUSTED_RUNTIME_CONTRACT.md](./PREVIEW_TRUSTED_RUNTIME_CONTRACT.md). OAuth, callbacks, provider reads, mailbox ingestion, Purchase import, remote persistence, and Production remain absent.

The exact candidate was deployed manually to a Vercel Preview for bounded runtime verification. The deployment is Ready and includes Node functions for `/api/auth/session` and `/api/account-ops/provider-connections`. Both paths return Express JSON with `Cache-Control: no-store`; the session path safely reports `AUTH_NOT_CONFIGURED`, while the protected provider path returns `401 authentication_required` and ignores a synthetic client role query. The normal Code 3 Home and direct Account Ops route load to the sign-in boundary. Because server-side Preview authentication and owner-allowlist configuration are absent, no valid owner `200` response was possible, Gmail/Outlook status could not be attested through the hosted protected response, and `hostedRuntimeVerified` remains `false`.

Published Phase 2B2-B adds:

- official Upstash Redis REST transport with telemetry disabled and errors reduced to bounded provider-unavailable responses;
- an environment selector that can activate managed stores only in real exact Preview execution after configured project/Git-branch values match Vercel's server-owned values; the effective namespace adds a project/branch-derived scope;
- owner-hash-scoped bounded provider connection metadata, separate from secret material;
- AES-256-GCM secret encryption before storage, using a 32-byte server key, fresh IV/authentication tag, key version, and owner/provider/connection/reference associated data;
- random digest-only OAuth state with exact owner/provider/redirect binding, TTL/capacity limits, cleanup, and atomic Lua validate-and-consume plus replay markers;
- no hosted memory fallback and continued automated-test-only memory adapter restrictions;
- exact origin canonicalization with Preview reading only its Preview-origin list, Production reading only its general list, and no wildcard branch-domain acceptance;
- exact durable-kind enforcement plus bounded connection/secret/OAuth write-read-delete readiness operations; `PING`, environment names, and test-memory adapters cannot verify hosting; and
- tests and backup guards proving managed operational state stays out of browser persistence and Backup Format v1.

After publication, a Free Upstash resource was provisioned and its REST endpoint, token, and Code 3 encryption key were configured as branch-scoped Preview secrets. Supabase owner/auth values and the remaining Preview CORS/activation/runtime values were not configured, no follow-up Preview was deployed, and no connection record, provider secret, or OAuth state was created. The application makes no at-rest platform claim and keeps `hostedRuntimeVerified=false`. Phase 2B2-B.1 remains paused until the owner explicitly says `Supabase signed in.`

The local Phase 2D-A candidate adds:

- `src/features/botOps` with provider-neutral constants, contracts, validators, static provider registry, adapter boundary, security guard, `LOCAL_ONLY` persistence/repository/service, reconciliation, synthetic fixtures and exports;
- `code3.bot-ops.v1` with ten collections: installations, retailer-account links, Bot profiles, proxy metadata, product targets, task groups, tasks, append-only attempts, reviewable Checkout Evidence, and append-only activity;
- static Hayha and Stellar definitions that remain `NOT_CONFIGURED`, disconnected, with empty/unverified retailer coverage and all live capabilities false;
- an explicitly injected automated-test `MOCK` adapter that cannot appear as normal-runtime provider health or a real registry connection;
- shared Account Ops profile/store-account references without copying credentials or converting operational profiles into authentication authority;
- recursive rejection of owner/session/role/entitlement authority, Bot/provider/retailer/payment/proxy credentials, raw provider payloads/logs/headers/request-response bodies, credential-bearing URLs/text, dangerous prototype keys and unsafe/oversized values;
- provider + installation + event scoped identities, deterministic source hashes, same-event replay no-ops, cross-installation distinction, interrupted-write repair, reordered time preservation and contradiction history;
- `Bot Success != Purchase` and `Checkout Evidence != Purchase`, with no Purchase/lot/receipt/receiving/Owned Item/Inventory/quantity/cost-basis writer;
- one sanitized Backup Format v1 section, raising the registry to 24 total/20 locally included sources, with all ten Bot paths `REQUIRES_MAPPING` and Restore Preview remaining zero-write; and
- responsive OWNER-only Overview, Bots, Task Groups, Tasks, Accounts, Profiles, Proxies, Product Targets, and Activity sections whose normal runtime is honestly disconnected/empty and never seeded from fixtures.

See [BOT_INTEGRATION_CONTRACT.md](./BOT_INTEGRATION_CONTRACT.md). Focused and complete regression counts are recorded only after the final Phase 2D-A gate finishes; source presence alone is not test or provider evidence.

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
- compatibility routing remains custom and large portions of legacy UI still live in `src/App.jsx`; Phase 2A.5 centralizes workspace ownership but does not complete renderer extraction.
- Account Ops profiles, aliases, retailer accounts, health, and tasks work only in the published Phase 2A browser-local source; provider activation, durable audit, and canonical mapping remain absent. Phase 2B1 adds only synthetic/minimized local Inbox/Order Candidate evidence and safe provider capability truth. Phase 2B2-B adds server secret/state adapters, not a credential-vault UI or connected provider; its Free Upstash resource and three branch-scoped Preview secrets do not satisfy the still-paused owner/runtime/deployed proof.
- Phase 2D-A Bot Operations is a usable local metadata/evidence foundation, but it remains browser-local and synthetic/test-only where provider activity is concerned; it is not evidence that Hayha, Stellar, task control, checkout, credentials, or provider networking is implemented.

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
| Phase 2B2-B hosted owner/storage proof | legitimate Supabase OWNER session, remaining exact branch-scoped Preview CORS/activation/runtime configuration, and bounded deployed readiness proof; the approved Free Upstash resource and three Secret branch-scoped Preview variables already exist, but the operational step remains paused |
| Live Unified Inbox and retailer-order ingestion | provisioned/verified managed stores, approved minimum provider scopes, callback routing, retention/revocation, protected content, and owner review before any future Purchase import |
| Live Hayha or Stellar integration | separately approved provider/mode, terms/anti-abuse review, server-only credential/revocation or owner-local companion contract, test installation, provider health and no-checkout proof |
| Bot Checkout Evidence to Purchase/Inventory | separately approved external-order reconciliation, stable import identity, explicit OWNER confirmation, transactional idempotency/rollback, receiving workflow and no automatic mutation |
| Production deployment | all security blockers and owner physical-device review |

## Not started or materially missing

- activation and disposable-database verification of the canonical backend repository for Deal Finder, Owner Center, purchases, owned items, sales, and money;
- complete server/file-inclusive backup and an owner-confirmed transactional restore implementation;
- universal cross-record search;
- server-verified commercial entitlements, subscription billing, checkout, or payment processing (`OWNER` remains authority rather than a plan);
- live Hayha/Stellar/provider adapters, task control, proxy connectivity/credentials, checkout, purchasing, retailer automation, or Bot-to-Purchase/Inventory handoff; Phase 2D-A supplies only local provider-neutral metadata/evidence and test mocks;
- live Gmail, Outlook, IMAP, webhook, polling, cursor, or mailbox authorization/ingestion; Phase 2B1 has provider definitions and synthetic local processing only;
- Order Candidate to Business Purchase import or automatic inventory receiving; Phase 2B1 never calls those repositories;
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

The published Phase 2A validation gate passed frontend and backend builds; 183 Account Ops domain assertions; 20/20 deterministic fixtures with 573 assertions; 31 UI-contract assertions; and a 25-capture mobile browser matrix with 228 assertions, zero 360-pixel horizontal overflow, and no application browser errors. Backup Format v1 passed with 18 included sections and 14 fixture records; Restore Preview, Migration Preview, client persistence, and Migration Readiness remained zero-write/local-only. Phase 1A/1B/1C branding, security, canonical, eBay, intelligence, sourcing, Owner Center, route, compatibility, accessibility, lazy-load, light/dark viewport, and focused-smoke gates passed. The bounded regression passed 28/28 scenarios in 314.834 seconds with zero retries and no open handles. The five slowest scenarios were Business inventory add/edit/delete (42.617 seconds), Scout report persistence (33.891 seconds), Collection-to-resale quantity transfer (28.801 seconds), Scout report add/edit (25.129 seconds), and Market Watch deal check (23.789 seconds). One dark viewport run made concurrently with the light matrix missed a Scout text assertion; the unchanged dark matrix passed all 47 combinations when run alone, identifying local browser contention rather than an application correction.

The published Phase 2A.5 validation gate passed the frontend/backend builds and all inherited Phase 1A–2A security, canonical, persistence, migration-preview/readiness, backup/restore, intelligence, eBay, sourcing, Owner Center, Account Ops, route, compatibility, plain-language, accessibility, lazy-load, viewport, and smoke suites. Focused workspace evidence was 256 registry assertions, 82 preference assertions, 20/20 deterministic fixtures with 115 assertions, 91 UI-contract assertions, and a 24-capture mobile browser matrix with 237 assertions, zero browser errors, and zero 360-pixel horizontal overflow. Light and dark inherited viewport matrices each passed 46 checks. The bounded regression passed 28/28 scenarios in 323.442 seconds with zero retries and no open handles. The five slowest scenarios were Business inventory add/edit/delete (41.815 seconds), Scout report persistence (34.347 seconds), Collection-to-resale quantity transfer (28.678 seconds), Market Watch deal check (28.131 seconds), and Scout report add/edit (25.221 seconds). Publication did not activate Production, a provider, or remote persistence.

Phase 2B1 focused validation passes 16/16 provider-runtime cases, 52 domain assertions, 25/25 synthetic fixtures with 56 assertions, 102 history/idempotency assertions, and 55 security/protected-message assertions. Frontend/backend builds, owner security 27/27, canonical backend 47/47, eBay 13/13, persistence/migration, and Backup/Restore Preview gates also pass; Backup Format v1 reports 19 included sections and 18 fixture records. Account Ops UI-contract coverage is 53 assertions after the Connections/Inbox/Orders additions, and its final browser matrix reports 20 fixtures, 30 captures, 249 assertions, no application errors, and no 360-pixel overflow. The bounded regression passes 28/28 scenarios in 444.527 seconds with zero retries and no open handles. The final local main `App` chunk is 2,347.64 kB minified and 589.36 kB gzip. Source-level tests and a frontend Preview are not evidence that a mailbox or hosted provider runtime is connected.

## Preview state

- PR #1 remains Draft per the task baseline.
- The published branch includes Phase 2B2-B at `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`; Phase 2D-A changes are local only.
- The published Preview proves filesystem routing to Express and fail-closed authentication, not the complete owner-authorized managed-store proof.
- `hostedRuntimeVerified=false` because no legitimate owner plus exact durable-store readiness response has been proven. The Free Upstash resource and three branch-scoped Preview secrets do not satisfy the missing Supabase owner/auth and remaining exact CORS/activation/runtime gate. Phase 2B2-B.1 is paused; required names are documented without values in [OWNER_AUTH_DECISION.md](./OWNER_AUTH_DECISION.md).
- Phase 2D-A does not deploy a Preview, inspect or use the Upstash resource, resume Supabase sign-in, connect a provider, or change Production/Development configuration.
- No production deployment is represented by this documentation.

## Known defects and debt

1. The published Phase 2A.5 main application chunk is approximately 2,347.63 kB minified and 589.36 kB gzip, compared with the published Phase 2A baseline of 2,337.78 kB and 586.01 kB gzip. The validated Phase 2B1 candidate is 2,347.64 kB minified and 589.36 kB gzip.
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
24. Phase 2B1 Inbox and Orders process only deterministic synthetic/owner-supplied minimized evidence locally. No mailbox is connected, no message is fetched, no protected body is retained, and no candidate can create a Purchase.
25. Assisted retailer setup is a human checklist. Code 3 neither submits signups nor bypasses CAPTCHA, OTP, verification, bot detection, household/account limits, or purchase limits.
26. Phase 2A.5 workspace ownership remains a presentation layer over custom routing; a saved preference and entitlement hints are deliberately nonauthoritative, and physical Android Back QA remains necessary.
27. Bot is an OWNER-only `LOCAL_ONLY` metadata/evidence foundation. Hayha/Stellar remain `NOT_CONFIGURED`; no live provider, credential, provider network, task control, live proxy, checkout, Purchase, receiving, or Inventory integration exists. Normal runtime remains empty unless the owner creates safe metadata; fixtures are test-only.
28. Auction events/lots are not yet addressable through stable record-detail URLs; workspace routing links honestly to the implemented `/find/auctions` surface instead of inventing an unsupported lot-detail route.
29. Phase 2B2-A's exact candidate Preview proves the Express functions are hosted and fail closed, but an owner-authorized managed-health response is still absent. `hostedRuntimeVerified` therefore remains `false`; a `Ready` deployment and unauthenticated `401` are not full provider-runtime proof and do not enable OAuth.
30. Phase 2B2-B implements exact-project/branch Preview-only durable connection metadata, AES-256-GCM secret, and atomic OAuth-state adapters with bounded write/read/delete readiness. A Free Upstash resource and three branch-scoped Preview secrets exist, but owner/CORS/activation/runtime values and the authenticated readiness proof are absent; Phase 2B2-B.1 is paused. No provider record is populated, key rotation operations remain incomplete, and resource existence/`PING`/test-memory stores are not acceptable hosted proof.
31. Gmail and Microsoft minimum read-only scope/provider-registration decisions remain external blockers. Phase 2B1 requests no scope and includes no network adapter.
32. The local Inbox/Order source requires a future canonical mapping. All four paths remain `REQUIRES_MAPPING`; its unencrypted local/backup metadata shares the existing device/download security limitation.
33. The local Bot Operations source requires a future canonical mapping. All ten paths remain `REQUIRES_MAPPING`; its unencrypted local/backup metadata shares the device/download limitation, and no managed Bot credential store or Purchase/Inventory handoff is authorized.

## Next recommended task

After the Phase 2D-A local completion report, stop. The recommended scope for a future Phase 2D-B is a one-provider/one-integration-mode architecture, terms/anti-abuse/security review and isolated read/status pilot plan; Phase 2D-B is not authorized and must not begin with credentials, network access, task control or checkout. Phase 2B2-B.1 remains paused until the owner explicitly says `Supabase signed in.` Gmail/Outlook, mailbox reads, Purchase import, billing, renderer extraction, and disposable-database work remain separate approvals.

Do not apply the schema to the owner or Production database, enable `REMOTE_ACTIVE`, migrate files, or execute a migration plan without a separately approved cutover task and verified backup.
