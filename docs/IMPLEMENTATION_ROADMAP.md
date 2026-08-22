# Code 3 Implementation Roadmap

Published baseline: `264d5a5dbc58568295ba514b9c474f588f42282e`
Planning rule: no phase is authorized merely by appearing here.

## Repository-informed sequencing decision

The audit changes the conceptual “backend persistence first” phase into two gated parts. **Phase 1A — Owner Security Boundary and Verified Recovery Contract** is implemented and validated in the local worktree, awaiting publication. It comes before a database migration or scheduled scanning because current canonical records are browser-local and recovery must be understood first. The local result protects the eBay route family and provides a trustworthy browser export/no-write preview, but it does not yet protect legacy APIs or include server/file data.

The first runtime change has applied Code 3 through the centralized brand configuration and coordinated PWA/browser/offline metadata in the local worktree. Storage, database, route, module, environment, cache, history, compatibility, and imported-source identifiers remain unchanged. The legal/public business name and tagline remain separately configurable and unresolved.

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

**Local status:** Implemented and validated, awaiting its publication checkpoint, and undeployed. Do not treat this status as authorization to start Phase 1B.

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

## Phase 1B — Canonical persistence, files, audit, and migration rehearsal

- **Objective:** introduce relational canonical repositories and protected object storage, then rehearse a reversible migration from browser/legacy data.
- **Current code affected:** all domain repositories, phase-2 Supabase compatibility, backend database layer, receipt/image references, Owner Center data/backup.
- **Likely files/modules:** proposed backend domain/repository modules, versioned migrations, protected file service, shared validators, local-to-server adapters, and migration/report scripts.
- **Data changes:** canonical tables/entities from `DATA_MODEL.md`, stable IDs, integer minor currency units, record versions, provenance, audit logs, file manifests.
- **Migration risks:** float-to-minor-unit differences, duplicate/overlapping legacy records, orphan links, ambiguous owned-item purpose, local records on more than one device, file loss.
- **Dependencies:** Phase 1A authorization and verified export; database/object-storage choice; schema review.
- **External authorization:** database and object-storage provisioning.
- **Test plan:** migrations up/down in disposable environments; dry-run mapping; totals/IDs/history/file hashes; optimistic concurrency; repository contract; backup/restore; rollback rehearsal.
- **Acceptance criteria:** no irreversible production write; preview migration reconciles counts and money; ambiguous records queue as `UNASSIGNED`; old keys remain readable; repository switch can roll back; protected files require owner authorization.
- **Rollback:** retain local repositories and export, reverse preview migration, keep old IDs/keys, remove target data only from disposable environment.
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
- **Current code affected:** existing eBay service/routes, Search Rules, Import Review, Owner Center sourcing/performance/controls, notifications/jobs.
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
- **Current code affected:** `src/features/flipScout/calculations.js`, `src/features/flipScout/screens/AuctionsScreen.jsx`, connectors, imports, purchases, Owner Center sourcing/performance.
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
- **Current code affected:** Owner Center restock repository/models/page, Find Restocks handoff, existing store/report services, purchase/mileage links.
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
- **Current code affected:** imports, files, Deal Analysis, grading queue, receipts, feature controls, provider architecture.
- **Likely files/modules:** server AI adapter, evidence pipeline, review UI, model/version/cost logging, evaluation fixtures.
- **Data changes:** immutable AI result, confidence/evidence, correction, final confirmation, cost/usage.
- **Migration risks:** privacy/retention, cost, hallucination, copyrighted images, false authenticity/condition/value claims.
- **Dependencies:** protected files, authorization/audit, review queues, provider approval, evaluation dataset.
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

Publish the validated Phase 1A checkpoint, verify the Draft PR and non-production Preview, and configure the documented Preview authentication variables outside source control. Begin Phase 1B only through a separate approved task.

After a separate Phase 1A checkpoint and clean-checkout proof, specify Phase 1B as a no-write canonical-schema, server/file export-adapter, audit, and migration-rehearsal task. Do not perform a database migration or restore apply without explicit approval.
