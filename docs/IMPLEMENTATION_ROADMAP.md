# Code 3 Implementation Roadmap

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`
Planning rule: no phase is authorized merely by appearing here.

## Repository-informed sequencing decision

The audit changes the conceptual “backend persistence first” phase into gated parts. **Phase 1A — Owner Security Boundary and Verified Recovery Contract** is published on the feature branch. It comes before a database migration or scheduled scanning because current canonical records are browser-local and recovery must be understood first. It protects the eBay route family and provides a trustworthy browser export/no-write preview, but it does not yet protect legacy APIs or include server/file data.

**Phase 1B — Canonical Backend Persistence and Reversible Migration Planning** is published on the feature branch as schema, repository/API, local/remote abstraction, backup-adapter, and no-write migration-preview contracts. `LOCAL_ONLY` remains authoritative. Schema and file metadata are `SCHEMA_ONLY`, the preview/remote comparison path is `DRY_RUN_ONLY`, and `REMOTE_ACTIVE` is `NOT_ACTIVE`. No migration was run and no owner record moved.

**Phase 1C — Intelligence and Card Analysis Foundation** is published through commit `af21199f610cc91e31d9dee59af6f0a2f748ab79`. It adds deterministic decision-support services and append-only local card-analysis history without changing the Phase 1B persistence state. Auction results can be saved without a generic linked revision series, and restock intelligence recomputes from observations. It does not configure an AI/computer-vision provider, apply a schema, activate remote persistence, move owner data, sync, or automate marketplace actions.

**Phase 2A — Account Ops Foundation** is a separately authorized local working copy on top of that published checkpoint. It adds legitimate owner-managed profiles, alias metadata, retailer-account metadata, assisted human setup, account health, and tasks through a gateway fixed to `LOCAL_ONLY`. It adds no canonical domain, provider-provisioned email, mailbox/order integration, retailer signup submission, verification bypass, migration, sync, or remote cutover. Final validation and publication remain separate gates.

The published Phase 1A runtime applies Code 3 through the centralized brand configuration and coordinated PWA/browser/offline metadata. Storage, database, route, module, environment, cache, history, compatibility, and imported-source identifiers remain unchanged. The legal/public business name and tagline remain separately configurable and unresolved.

No time estimates are provided. Complexity is relative: Small, Medium, Large, or Extra Large.

## Phase 0 — Definitive audit and documentation

- **Objective:** establish one product contract and evidence-based current-state inventory.
- **Current code affected:** none; documentation only.
- **Likely files/modules:** the nine definitive documents in `docs/`.
- **Data changes:** none.
- **Migration risks:** older documents may conflict; this specification explicitly supersedes visible branding/navigation/product conflicts while retaining technical migration references.
- **Dependencies:** verified baseline and repository audit.
- **External authorization:** none.
- **Test plan:** diff, Markdown/path/link/source-reference and terminology checks.
- **Acceptance criteria:** all required documents exist, cross-link, distinguish implemented from placeholder, and name one next phase.
- **Rollback:** remove documentation changes; no runtime impact.
- **Complexity:** Medium.

## Phase 1A — Owner security boundary and verified recovery contract

**Status:** Published on the feature branch. Hosted configuration and Production acceptance remain separate gates.

- **Objective:** protect sensitive API operations with server-authenticated OWNER authorization and produce a complete, validated, restorable preview of current owner data before migration.
- **Current code affected:** authentication/profile code in `src/App.jsx`; `src/features/ownerCenter/ownerAuthorization.js`; Express application/middleware; all sensitive API routes; feature/local repositories and legacy persistence exports.
- **Implemented files/modules:** centralized brand/PWA metadata; `backend/src/auth`, `backend/src/security`, `backend/src/routes/auth.routes.ts`, protected eBay router/server mounts; `src/services/ownerSession.js`; `src/features/backup`; Owner Center auth/Data & Backup integration; environment examples and focused tests.
- **Data changes:** versioned backup manifest/schema and audit-event format; no irreversible migration.
- **Migration risks:** locking out the owner, local-development bypass leaking to preview/production, incomplete export coverage, exposing private data in backup files, incompatible legacy IDs.
- **Dependencies:** explicit auth provider/session choice; inventory of all local keys and Supabase tables; recovery procedure.
- **External authorization:** authentication service/configuration if not self-hosted; no marketplace expansion.
- **Test plan:** centralized-brand/PWA/title tests; unauthenticated/wrong-role/expired/owner API tests; CORS/CSRF/origin tests; eBay regression; export counts/hashes/parse; restore dry run; legacy-key coverage; credential and log-redaction scans.
- **Acceptance criteria:** primary runtime identity derives from centralized Code 3 configuration; business name/tagline remain independent; eBay routes default deny; owner access succeeds; UI hiding is not the security boundary; development/test adapters cannot operate in hosted runtimes; export coverage is explicit rather than always called complete; SHA-256 self-verification passes; Restore Preview reports counts/errors/duplicates without writing; rollback/recovery is documented; the full regression passes.
- **Rollback:** disable new middleware only in an isolated preview, restore previous server route deployment, and use the verified export; no record cutover has occurred.
- **Complexity:** Large.

## Phase 1B — Canonical backend persistence and reversible migration planning

**Checkpoint status:** Implemented, validated, and published on the feature branch. The schema is `SCHEMA_ONLY`; repository/API contracts remain hosted-gated; `REMOTE_ACTIVE` is `NOT_ACTIVE`; Migration Readiness is `DRY_RUN_ONLY` and no-write.

- **Objective:** select the owner-authorized Express/PostgreSQL target, define relational canonical repositories and file-reference metadata, and rehearse a reversible migration from browser/legacy data without writes.
- **Current code affected:** all domain repositories, phase-2 Supabase compatibility, backend database layer, receipt/image references, Owner Center data/backup.
- **Implemented/likely files/modules:** backend canonical domain/repository/validation/API modules; versioned schema migration source; client persistence-mode/data-source modules; migration adapters/plan/preview; `src/features/backup/MigrationReadinessPanel.jsx`; owner-authorized canonical remote-export read integration; the four Phase 1B contract documents. Exact local paths are recorded in [CANONICAL_PERSISTENCE_DECISION.md](./CANONICAL_PERSISTENCE_DECISION.md) after implementation review.
- **Data changes:** schema source only for canonical tables/entities from `DATA_MODEL.md`, stable IDs, integer minor currency units, record versions, provenance, future journal/audit fields, and file metadata. Existing local data is unchanged.
- **Migration risks:** float-to-minor-unit differences, ambiguous legacy-to-generic rate semantics, duplicate/overlapping or identity-less legacy records, orphan links, ambiguous owned-item purpose, local records on more than one device, file loss.
- **Dependencies:** Phase 1A authorization and verified export; database/object-storage choice; schema review.
- **External authorization:** database provisioning and later schema execution; object-storage provisioning is deferred because Phase 1B does not upload bytes.
- **Test plan:** schema inspection without applying owner migrations; owner-scoped repository/API behavior; strict validation, active/archive uniqueness parity across every domain, status/archive parity, strict remote timestamp/UUID keyset pagination, and legacy-compatible private local cursor ordering; optimistic conflicts; complete 80-path migration-registry coverage; deterministic mapping/plan/hash; plan-wide identity, FileAsset path, and forward-reference checks; zero-write preview; remote-backup unavailable/unauthorized/hash-mismatch/consistent-snapshot coverage; existing backup/restore; full regression.
- **Acceptance criteria:** no production/owner migration; server-derived owner scope; no client owner override; preview classifies insert/update/skip/decision and reconciles owner-wide IDs, plan-local/remote references, file metadata, and money without writes; inserts carry their exact stable UUID in `input.id`, invalid plan targets invalidate dependents, and unresolved decisions/intra-plan ID/provider/certification/FileAsset-path collisions block; identity-less, archived, and unmapped-rate candidates require owner review; no delete or archive action is proposed, canonical create/update cannot spoof archive, and archived records are immutable without a future restore contract; old keys remain readable; `REMOTE_ACTIVE` remains disabled; file references are reported without claiming byte coverage.
- **Rollback:** preview requires no data rollback because it writes nothing; retain local repositories/export/IDs/keys and remove unactivated schema/code as one bounded change. Future apply requirements are in [MIGRATION_ROLLBACK_CONTRACT.md](./MIGRATION_ROLLBACK_CONTRACT.md).
- **Complexity:** Extra Large.

## Phase 1C — Intelligence and card analysis foundation

**Status:** Published through `af21199f610cc91e31d9dee59af6f0a2f748ab79`. Its publication gate passed the bounded regression with `LOCAL_ONLY` authoritative, the Phase 1B schema unapplied, and `REMOTE_ACTIVE` disabled.

- **Objective:** provide a deterministic, explainable, owner-reviewable analysis layer for cards, deals, lots, auctions, and restock observations without autonomous action or fabricated provider/model evidence.
- **Current code affected:** Deal Analysis/appraisals, existing eBay normalized results, manual auction/lot calculations, Owner Center restock observations, and future scanner/image input boundaries.
- **Implemented files/modules:** `src/features/intelligence/constants.js`, `contracts.js`, `confidence.js`, `money.js`, `conditionAssessment.js`, `valuation.js`, `dealIntelligence.js`, `lotIntelligence.js`, `auctionIntelligence.js`, `restockIntelligence.js`, `analysisPipeline.js`, `analysisHistory.js`, provider evidence adapters, focused tests/fixtures, and [INTELLIGENCE_CONTRACT.md](./INTELLIGENCE_CONTRACT.md).
- **Data changes:** tagged `code3-intelligence-analysis-v1` card revisions append to the existing local `appraisals` collection. Auction saves retain a current result without joining that revision series, and restock intelligence derives results from existing observations. No repository schema version, existing record, canonical table, file byte, or hosted owner record is changed.
- **Migration risks:** local revisions need a future canonical mapping; owner-corrected values must remain separate from system proposals; image references are not protected bytes; existing float-based records must not be silently mixed into new minor-unit calculations.
- **Dependencies:** Phase 1A owner boundary and Phase 1B `LOCAL_ONLY` persistence gateway; existing eBay normalization; real owner-entered/provider evidence.
- **External authorization:** none for deterministic local rules or current official eBay active-listing evidence. Completed-sale evidence requires an approved/licensed source; future AI/CV requires a separately approved provider/privacy/file specification.
- **Test plan:** condition spectrum and structural damage; poor/conflicting evidence; shared confidence/source independence; exact money/currency/fees/ROI; valuation v2 matched-condition and explicit-`NM` basis selection; unknown/incompatible comparable exclusion; sold-vs-active evidence; every deal recommendation and explicit risk severity; auction premium/tax/shipping/pickup/downside; lot unknown/liquidity burdens; sparse/stale/conflicting restock observations with latest-positive freshness; deterministic card hashes/revisions/comparisons; owner correction/version conflict; recursive authority-field rejection; eBay/scanner capability truth including missing-currency behavior; mobile/accessibility; existing Phase 1A/1B and 28-scenario regression gates.
- **Acceptance criteria:** equivalent normalized inputs produce the same substantive hash/result; condition remains an apparent proposal, not a grade; owner confirmation is never silently replaced; only verified completed sales support completed-sale valuation; matching-condition sales are never double-adjusted; only explicit `NM` baselines may be adjusted when no match exists; unknown/incompatible bases are excluded; active eBay asks and official provider evidence remain separate, and provider currency is never fabricated; recommendation rationale, risk severity, and assumptions are visible; restock confidence cannot bypass source independence; no purchase/offer/bid action exists; card history is append-only/local without claiming generic auction/restock revisions; no remote adapter, migration, sync, file upload, or model claim is introduced.
- **Rollback:** revert the Phase 1C checkpoint and remove only explicitly created tagged local test data; no database or remote-data rollback is needed because Phase 1C performs no cutover or migration. Existing legacy appraisals remain untouched.
- **Complexity:** Large.

## Phase 2A — Account Ops foundation

**Status:** Locally implemented from published commit `af21199f610cc91e31d9dee59af6f0a2f748ab79`; final validation and publication are pending. This bounded product extension does not replace or authorize the established Phase 2 structural extraction below.

- **Objective:** provide a mobile-first, legitimate owner workspace for reusable operational profiles, generated alias metadata, retailer-account records, human-assisted setup, verification state, explainable health, and account tasks.
- **Current code affected:** custom route registry/shell navigation; new `src/features/accountOps` domain, local repository/service, UI, and fixtures; Backup v1 registry/validation/Restore Preview; migration-source registry; focused route and Account Ops tests.
- **Implemented files/modules:** `src/features/accountOps`, `/account-ops/*` route integration, Account Ops backup/migration adapters, [ACCOUNT_OPS_CONTRACT.md](./ACCOUNT_OPS_CONTRACT.md), and focused domain/fixture/browser coverage.
- **Data changes:** one `code3.account-ops.v1` browser source with `profileGroups`, `profiles`, `emailDomains`, `emailAliases`, `retailers`, `storeAccounts`, `tasks`, and `activity`. `LOCAL_ONLY` is hard-wired. Backup includes allowed metadata; every migration path is `REQUIRES_MAPPING`.
- **Migration risks:** browser-local names/phones/addresses/aliases/usernames can be lost or exposed; downloaded JSON is unencrypted; alias status can be mistaken for real mail delivery; retailer/profile/account identities require a future canonical mapping; no secure-vault provider is active.
- **Dependencies:** published Phase 1A owner session, Phase 1B local persistence and verified recovery, existing Code 3 route/design patterns.
- **External authorization:** none for local metadata. Provider-managed aliases, catch-all verification, credential vaults, mailbox access, and order APIs each require a separately approved provider/security contract.
- **Test plan:** profile/group CRUD/archive/owner-scope; alias templates/secure randomness/collisions/validation/provisioning truth; password entropy and no persistence/log/backup; retailer/account/setup/status/health relationships; tasks; recursive authority/secret injection; Account Ops backup and zero-write Restore Preview; eight-path migration classification; 360px light/dark/long-content/empty/attention/setup cases; existing security, route, accessibility, and 28-scenario regression gates.
- **Acceptance criteria:** owner-authorized first-class route; private storage is not read before authorization; profile cannot become authentication identity; generated alias is never called provisioned; plaintext password/OTP/token/payment secret never persists; setup stops at human verification; health explains each signal; Inbox/Orders remain contracts only; no bulk signup, retailer-limit evasion, purchasing, checkout, migration, sync, or remote activation exists.
- **Rollback:** remove the unpublished Account Ops route/domain and backup registrations; retain the unchanged Phase 1A–1C sources. Because no database, provider, or remote write occurs, no data or deployment rollback is required beyond explicitly removing local test records if the owner chooses.
- **Complexity:** Large.

## Phase 2B — Unified Inbox and order intelligence

**Status:** Future and not authorized. Phase 2A supplies contracts only.

- **Objective:** connect one explicitly approved, minimally scoped mailbox/order provider; normalize verification, shipment, cancellation, refund, security, and order evidence; require owner review before an explicit Add to Purchases action.
- **Current code affected:** Phase 2A alias/account relationships and future contracts, provider connections, protected files, import review, Purchases, shipments, tasks, and audit history.
- **Likely files/modules:** server-only mail/order provider adapter; webhook/polling verification; bounded message metadata/raw-content references; order-candidate review queue; idempotent task/import linkage.
- **Data changes:** authorized mailbox connection metadata, normalized message evidence, order candidates, import decisions, task provenance, protected raw-content references, and provider cursors; no plaintext credentials or unnecessary message bodies.
- **Migration risks:** duplicate messages/orders, sensitive-content retention, wrong account/profile attribution, unreviewed purchase creation, provider replay, stale cursor, and cross-account disclosure.
- **Dependencies:** Phase 2A publication; application-wide server OWNER authorization; protected file/content storage; provider selection/scopes/retention; canonical persistence or an explicitly accepted local-only limit; idempotency and audit policy. The established Phase 2 shell extraction should precede or accompany substantial UI growth.
- **External authorization:** approved mailbox/order provider, owner consent, minimized scopes, webhook/signature or polling terms, and documented retention/deletion behavior.
- **Test plan:** mocked authorization/scopes, message/order normalization, deduplication/replay, account/profile/alias attribution, redaction, retention, failure truthfulness, owner review gate, no automatic Purchase/checkout, task generation, disconnect, backup/export classification.
- **Acceptance criteria:** no mailbox is labeled connected before a verified health check; only bounded metadata/content references are retained; every order candidate links to evidence and remains uncommitted until owner review; importing cannot buy, pay, message, or bypass retailer controls; secrets stay server-side.
- **Rollback:** disable/disconnect the provider, stop ingestion, retain reviewed metadata/audit under the retention policy, and preserve Phase 2A manual workflows.
- **Complexity:** Extra Large.

## Phase 2 — App-shell extraction and route ownership hardening

- **Objective:** reduce the initial bundle and make one canonical renderer own each workflow before feature growth increases coupling.
- **Current code affected:** `src/App.jsx`, `src/utils/appRouteState.js`, legacy pages and compatibility renderers, Vite chunk configuration.
- **Likely files/modules:** domain route modules for detailed sourcing, collection compatibility, business compatibility, exchange, community/moderation, administration, settings/utilities; shared route boundary and loading/error components.
- **Data changes:** none; storage hydration behavior must remain compatible.
- **Migration risks:** direct-route refresh, query/hash loss, Android/browser Back, modal history, local hydration races, duplicated dependencies.
- **Dependencies:** existing `docs/APP_SHELL_EXTRACTION_PLAN.md`, route tests, stable authorization interface from Phase 1A.
- **External authorization:** none.
- **Test plan:** build-size comparison, every direct route, alias redirects, refresh/fallback, history/back, light/dark viewport, accessibility, 28-scenario regression.
- **Acceptance criteria:** Home/shell materially smaller; Owner Center and heavy domains load on demand; no duplicate workflow; all compatibility tests and full regression pass.
- **Rollback:** revert one domain extraction at a time; keep route registry/aliases stable.
- **Complexity:** Large.

## Phase 3 — Scheduled eBay intelligence

- **Objective:** run authorized Search Rules on a durable, rate-limit-aware schedule and attribute discovery through realized outcome, without account actions.
- **Current code affected:** existing eBay service/routes, Phase 1C eBay evidence normalization/deal intelligence, Search Rules, Import Review, Owner Center sourcing/performance/controls, notifications/jobs.
- **Likely files/modules:** backend job/search-run repositories, scheduler/worker, rule compiler, expiration checks, alert delivery, eBay adapter extensions, Owner Center history/metrics.
- **Data changes:** `SearchRun`, `BackgroundJob`, listing snapshots/change events, notification delivery, attribution links.
- **Migration risks:** duplicate jobs/results, quota exhaustion, alert floods, stale credentials, overwriting owner corrections.
- **Dependencies:** Phases 1A/1B; route extraction recommended; production eBay quota/terms review.
- **External authorization:** eBay production application approval and notification provider if alerts leave the app.
- **Test plan:** mocked schedules/tokens/rate limits/retries/idempotency; deduplication/change/expiry; quiet hours; rule attribution; owner authorization; no account-action endpoints.
- **Acceptance criteria:** bounded runs record full history; retry cannot duplicate imports; failures are visible; every result enters Import Review; new/change/expiry alerts link to records; no buying/offers/bids.
- **Rollback:** disable schedules by feature control, retain run history, preserve manual eBay search.
- **Complexity:** Large.

## Phase 4 — Auction sources and operational workflows

- **Objective:** formalize source capability/terms, authorized/manual ingestion, events/lots, maximum bid, calendar, and pickup planning.
- **Current code affected:** `src/features/flipScout/calculations.js`, `src/features/flipScout/screens/AuctionsScreen.jsx`, Phase 1C lot/auction intelligence, connectors, imports, purchases, Owner Center sourcing/performance.
- **Likely files/modules:** auction repositories/API, source registry, event/lot/detail screens, bid solver, import adapters, pickup/calendar modules.
- **Data changes:** `AuctionEvent`, `AuctionLot`, `BidPlan`, `PickupPlan`, source terms and performance attribution.
- **Migration risks:** source-specific tax/premium rules, unknown-content valuation, duplicate lots, time-zone/deadline mistakes, winning auction not becoming purchase.
- **Dependencies:** Phase 1 persistence/auth; authorized source access where used.
- **External authorization:** official APIs/feeds/email scopes per source; none for manual records.
- **Test plan:** all tax modes, complex numerical solver, fees/logistics, deadlines/time zones, import dedupe, event-to-purchase, lost/won states, no bid submission.
- **Acceptance criteria:** manual flow is complete; capability state is honest; maximum bid is reproducible; live mode is read-only; pickup deadlines and purchase linkage work.
- **Rollback:** disable source adapter, preserve manual records/plans, revert repository reads without deleting lots.
- **Complexity:** Large.

## Phase 5 — Restock collection and intelligence

- **Objective:** make fast reports, visits, observations, predictions, trip planning, and real evidence-based performance complete.
- **Current code affected:** Owner Center restock repository/models/page, Phase 1C restock intelligence, Find Restocks handoff, existing store/report services, purchase/mileage links.
- **Likely files/modules:** restock domain repository/API, mobile report/visit forms, store/product detail, pattern service, prediction review, trip planner.
- **Data changes:** canonical restock/store/visit/observation/prediction records and outcome links.
- **Migration risks:** store directory mistaken for evidence, inconsistent product/store identity, time-zone errors, incomplete trip profit attribution.
- **Dependencies:** canonical persistence/auth; store/product identity strategy; mapping of legacy local store reports.
- **External authorization:** mapping/routing data only if route calculations are introduced.
- **Test plan:** confirmation/reliability, pattern thresholds, stale reports, prediction outcomes/error, incomplete-metric disclosures, purchase/mileage/sale attribution.
- **Acceptance criteria:** reports are quick and auditable; probability language is enforced; no prediction appears without support; missing profit/trip data remains unavailable rather than zero.
- **Rollback:** disable predictions and keep raw events/visits; retain local export.
- **Complexity:** Large.

## Phase 6 — Collection enhancements

- **Objective:** complete sets, binders, printable placeholders, wishlist matching, grading submissions, and unassigned review without duplicating owned items.
- **Current code affected:** Collection workspace, owned-item purpose module, inventory compatibility, catalog/product references.
- **Likely files/modules:** collection domain pages/repositories, binder layout/print module, wishlist matcher, grading queue, unassigned migration review.
- **Data changes:** binder/page/slot, wishlist, grading submission, item assignment/audit records.
- **Migration risks:** duplicate physical records, ambiguous catalog identity, copyrighted image use in printouts, purpose/history loss.
- **Dependencies:** canonical `OwnedItem` and protected files from Phase 1B.
- **External authorization:** card-image licensing/usage review; grading-provider APIs only in a later approved integration.
- **Test plan:** purpose transition/audit, binder uniqueness/slots, placeholder layouts, wishlist match thresholds, grading cost/break-even, unassigned review.
- **Acceptance criteria:** Sell This Item changes purpose in place; every binder assignment is reversible; print preview works; apparent condition is labeled; ambiguous items remain unassigned.
- **Rollback:** disable enhanced views, retain owned-item core and audit history.
- **Complexity:** Large.

## Phase 7 — Business operations completion

- **Objective:** complete receiving, lot processing, allocation, storage/labels, listing drafts, shipping, returns, and booth workflows.
- **Current code affected:** records screens/utilities under `src/features/flipScout`, Business workspace, owned items, and sales validation.
- **Likely files/modules:** purchase/inventory/sales APIs and details, receiving/processing steps, allocation engine, storage hierarchy, label/print, listing/shipping/return/booth modules.
- **Data changes:** canonical purchase lots/allocations, inventory adjustments, storage, listings, shipments, returns, booth statements.
- **Migration risks:** overselling, duplicate inventory, COGS loss, allocation rounding, return quantity restoration, print side effects.
- **Dependencies:** Phase 1B owned-item/persistence; channel profiles; optional printer workflow decisions.
- **External authorization:** shipping/label or channel access only if separately approved; manual workflows require none.
- **Test plan:** purchase-to-item, all allocation methods/rounding, quantity reservations, listing oversell, sale/return/refund, shipping estimated/actual, label no-side-effect, booth reconciliation.
- **Acceptance criteria:** every dollar reconciles or has explicit exception; one item history persists; drafts do not sell stock; returns preserve the sale and restore only inspected quantity.
- **Rollback:** feature flags per submodule; preserve core purchase/inventory/sale records and adjustment audit.
- **Complexity:** Extra Large.

## Phase 8 — Money, reconciliation, and reports

- **Objective:** complete receipts, commitments, bookkeeping semantics, reconciliation, and trustworthy actual/projected reporting.
- **Current code affected:** expenses/mileage/sales/purchases, Money workspace, CSV/JSON exports, Owner Center performance.
- **Likely files/modules:** receipt storage/review, report queries, reconciliation rules/queue, commitment service, bookkeeping export package.
- **Data changes:** canonical receipts/assets, commitments, reconciliation issues/resolutions, report snapshots where required.
- **Migration risks:** double-counted fees/expenses, projected values presented as actual, missing COGS, tax-language overclaim, report drift.
- **Dependencies:** Phases 1B and 7; complete transactional associations.
- **External authorization:** accounting export format review if a third-party target is introduced.
- **Test plan:** semantic totals, date ranges/time zones, returns/refunds, reconciliation rules, duplicate detection, report-to-source-record trace, exports and restore.
- **Acceptance criteria:** every displayed total is traceable; actual/projected are distinct; reconciliation links the record and correction; exports validate and are not labeled tax returns.
- **Rollback:** disable derived reports/reconciliation suggestions; retain source transactions and exports.
- **Complexity:** Extra Large.

## Phase 9 — Record-grounded Business Assistant

- **Objective:** answer owner questions from authorized application records with explicit evidence and no autonomous mutation.
- **Current code affected:** legacy assistant UI/thread storage, universal search, reporting/query services, feature controls.
- **Likely files/modules:** assistant query/tool API, citation/link renderer, formula explanation, conversation storage, policy/confirmation boundary.
- **Data changes:** assistant sessions/messages/tool audit with minimized content and record links.
- **Migration risks:** disclosure across roles, hallucinated totals, projected/actual confusion, stale cache, unintended writes.
- **Dependencies:** server authorization, canonical records, reporting semantics, audit logs.
- **External authorization:** AI provider only if model-backed; a deterministic query assistant may precede it.
- **Test plan:** mocked questions, date range, authorization, evidence links, formulas, missing data, prompt injection, no-write guarantees.
- **Acceptance criteria:** answers are reproducible from linked records, disclose gaps, and cannot buy/bid/offer/message or mutate without a separate confirmed action.
- **Rollback:** disable feature flag; preserve underlying reports.
- **Complexity:** Large.

## Phase 10 — AI-assisted review

- **Objective:** add review-only extraction/recognition for screenshots, products, binders, receipts, and auction photos.
- **Current code affected:** Phase 1C normalized evidence/analysis contracts, imports, protected files, Deal Analysis, grading queue, receipts, feature controls, provider architecture.
- **Likely files/modules:** server AI adapter behind the Phase 1C provider-neutral boundary, protected evidence pipeline, review UI, model/version/cost logging, evaluation fixtures.
- **Data changes:** immutable AI result, confidence/evidence, correction, final confirmation, cost/usage.
- **Migration risks:** privacy/retention, cost, hallucination, copyrighted images, false authenticity/condition/value claims.
- **Dependencies:** Phase 1C provenance/history contract, protected files, authorization/audit, review queues, provider approval, evaluation dataset.
- **External authorization:** selected AI provider and data-use/retention approval.
- **Test plan:** mocked responses, adversarial/low-confidence evidence, no unseen-content value, apparent-condition wording, final-confirm requirement, budget/rate limits.
- **Acceptance criteria:** raw output never becomes final inventory; confidence/evidence/version are visible; owner corrections persist; guarantees are prohibited.
- **Rollback:** disable provider/feature, retain original evidence and confirmed manual records.
- **Complexity:** Extra Large.

## Phase 11 — Kids, community, and marketing

- **Objective:** complete private impact tracking and optional secondary content planning without cluttering everyday navigation.
- **Current code affected:** legacy community/kids/content modules, owned-item purpose, feature controls, profile menu.
- **Likely files/modules:** internal kids/community repositories and pages, impact reports, feature-flagged marketing modules, protected assets.
- **Data changes:** packs, donations, giveaways, events, content/calendar/campaign/assets/performance.
- **Migration risks:** children's personal data, mixing public/private records, inventory cost attribution, accidental publishing.
- **Dependencies:** owned items, money, files, server authorization, private/public boundary.
- **External authorization:** platform APIs only for separately approved confirmed publishing; otherwise none.
- **Test plan:** purpose/quantity/cost attribution, minimized personal data, feature visibility, no auto-publish, role access.
- **Acceptance criteria:** internal impact totals trace to records; disabled modules disappear; content remains draft until confirmed through approved access.
- **Rollback:** disable modules, retain owned-item donation history and exports.
- **Complexity:** Large.

## Phase 12 — Offline hardening, security review, and production readiness

- **Objective:** make the installed Android app conflict-safe and establish evidence for a production decision.
- **Current code affected:** service worker/cache, draft repositories, API mutation client, shell/history, monitoring, deployment settings.
- **Likely files/modules:** offline queue/idempotency/conflict UI, cache versioning, observability/redaction, security headers/CSP, environment gates, physical-device QA scripts/docs.
- **Data changes:** sync state, idempotency keys, conflict records, device/session records.
- **Migration risks:** duplicate writes, stale data, offline conflict loss, cache/schema mismatch, preview/production configuration drift.
- **Dependencies:** canonical server API and completed critical workflows; dependency/security review.
- **External authorization:** production hosting/domains/monitoring only after owner approval.
- **Test plan:** offline read/draft/retry/conflict, Android Back/keyboard/camera/safe areas, session revocation, load/performance, backup restore, security review, full regression.
- **Acceptance criteria:** queued writes are idempotent; conflicts are owner-resolved; physical Android checks pass; production blockers in `SECURITY_AND_PRIVACY.md` are closed or explicitly accepted; no automatic external action exists.
- **Rollback:** keep production disabled, revert service worker/cache version, restore prior verified deployment and backup.
- **Complexity:** Extra Large.

## Cross-phase gates

Every implementation phase must:

1. preserve storage keys and compatibility aliases until migration evidence permits retirement;
2. preserve server-only credentials and the eBay Import Review gate;
3. use real or honest empty data, never invented metrics;
4. add focused tests and retain the 28-scenario release gate when shared behavior changes;
5. create a verified backup before data migration;
6. document external authorization and provider limits;
7. supply rollback steps before irreversible work;
8. keep the approved minimal UI contract;
9. derive Code 3 app-name rendering from the centralized configuration while keeping the business name/tagline separate;
10. avoid generated catalog changes and unrelated refactors;
11. stop before production deployment unless separately authorized.

## Exact next task recommendation

Phase 2A final local validation is complete; the next step is owner review followed, if approved, by a separately authorized publication checkpoint that preserves its local-only boundary. The next Account Ops product task is the Phase 2B design/security review—not implementation—covering provider selection, mailbox/order scopes, retention, protected content, server secrets, idempotency, and the owner review gate. In parallel, the established route/app-shell extraction remains the safest structural task before additional feature growth. A separately approved data task may provision only a disposable database to test schema/ownership/rollback and compare a verified backup through Migration Preview. Do not activate `REMOTE_ACTIVE`, migrate owner data, upload file bytes, connect a mailbox, or apply a Production schema without another explicit owner-approved specification.
