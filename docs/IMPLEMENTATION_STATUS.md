# Code 3 Implementation Status

Last audited: 2026-08-19

Last published commit: `264d5a5dbc58568295ba514b9c474f588f42282e`

Repository branch: `ui-104-final-product-ui-2` (the audit worktree is detached at the verified commit)

Pull request: #1, Draft
Deployment: authenticated Vercel Preview only; no production deployment

## Current phase

**Phase 1A — Code 3 Runtime Branding, Owner Security Boundary, and Verified Recovery Contract** is implemented and validated in the local worktree, awaiting its publication checkpoint. No database migration or restore apply was added.

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
- local implementation backup/checkpoint history through the published baseline.

Validated local Phase 1A additions awaiting publication:

- centralized Code 3 display, PWA, browser-title, offline, favicon, and accessible-logo identity with separate blank business name/tagline;
- Supabase Auth access-token verification and normalized server principal;
- provider-qualified immutable-subject OWNER allowlist;
- fail-closed protected eBay health/search routes and safe auth-session inspection;
- exact-origin CORS for auth/eBay plus reusable redaction;
- verified JSON backup format version 1 with SHA-256 section/manifest hashes and explicit coverage;
- bounded, no-write Restore Preview with duplicate, reference, schema, prohibited-data, and money diagnostics;
- compact Owner Center auth states and Data & Backup workflow.

## Partially complete or implemented differently

- canonical records are versioned and validated but browser-local;
- owner authorization protects the eBay route family locally, but not legacy/private API families and not yet any deployed environment;
- Supabase/PostgreSQL support exists for legacy domains, not the canonical private model;
- Collection sets/wishlist/grading and Business record screens are useful foundations, not complete lifecycles;
- auctions and restocks have data/calculation foundations but incomplete source/detail/planning flows;
- reports/performance calculate some real local metrics, but many target associations and histories are absent;
- feature controls are local UI controls, not server policy;
- PWA install/offline shell exists, but durable sync, conflicts, and safe queued mutation do not;
- the approved Code 3 values are applied centrally in the local runtime, but default social handle/currency/time zone remain unresolved and compatibility/public-beta copy still needs a bounded historical-wording sweep;
- compatibility routing remains custom and large portions of legacy UI still live in `src/App.jsx`.

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
| AI-assisted review | provider/privacy/cost approval, protected evidence, review/provenance pipeline |
| Production deployment | all security blockers and owner physical-device review |

## Not started or materially missing

- canonical backend repository for Deal Finder, Owner Center, purchases, owned items, sales, and money;
- complete server/file-inclusive backup and an owner-confirmed transactional restore implementation;
- universal cross-record search;
- durable search history, schedules, notifications, and system job history;
- comparable-record repository and licensed sold-price feed;
- full auction event/lot/source/calendar/live-display/pickup workflows;
- complete restock report/visit/product/trip screens and cross-domain performance attribution;
- binders, placeholder generator, full grading submissions, complete unassigned review;
- receiving, returns, shipping, storage labels, booth, receipts, commitments, reconciliation, full reports;
- record-grounded Business Assistant;
- protected AI review pipeline;
- canonical internal Kids & Community and feature-flagged Marketing & Content;
- connected-device/session administration and append-only audit history.

## Last verified test evidence

The published baseline report records:

- frontend production build: passed;
- backend TypeScript build: passed;
- Deal Finder (`test:flip-scout`) and Owner Center tests: passed;
- eBay connector tests: 13/13 passed;
- browser, route-loading, compatibility, plain-language, lazy direct-load, keyboard, light/dark viewport, and focused smoke tests: passed;
- bounded beta regression: 28/28 scenarios passed in 109.114 seconds with no open handles;
- `git diff --check`: passed.

The published baseline evidence remains historical. Phase 1A adds focused branding, authentication/authorization/CORS, backup, and restore-preview tests plus the required full regression gate. Final local outcomes belong in the Phase 1A completion report and must not be represented as published evidence until committed and verified from a clean checkout.

## Preview state

- PR #1 remains Draft per the task baseline.
- The published branch commit is `264d5a5dbc58568295ba514b9c474f588f42282e`.
- Deployment is Vercel Preview only and requires authentication.
- No production deployment is represented by this documentation.

## Known defects and debt

1. The main application chunk is approximately 2,337 kB minified and 586 kB gzip.
2. Only auth/eBay locally use the new owner/CORS boundary; legacy Express routes remain outside it.
3. Browser-visible legacy role/development variables are presentation/testing inputs, not a safe authorization source.
4. Current owner/business records are single-browser local data.
5. Browser backup integrity/preview exist locally, but server data and file bytes are excluded and restore apply is intentionally absent.
6. `src/App.jsx` contains extensive legacy renderers and compatibility state.
7. Provider capability/status vocabularies are not yet normalized to the target contract.
8. Several legacy/public-beta data models and routes remain alongside the private product.
9. Dependency vulnerability reports require separate review.
10. Physical Samsung/Android review is still recommended before any production decision.
11. Compatibility/public-beta modules still contain historical visible branding; new primary identity is centralized, but a later bounded copy migration remains.

## Next recommended task

Checkpoint and publish the validated Phase 1A file set, then verify the existing Draft PR and Preview remain non-production. Do not begin Phase 1B without a separate approved task.

After Phase 1A is separately checkpointed and clean-checkout verified, the next implementation specification should be **Phase 1B — Canonical persistence, protected files, durable audit, server-inclusive backup, and reversible migration rehearsal**. It must begin with a no-write schema/mapping design and may not perform an irreversible migration without explicit owner approval.
