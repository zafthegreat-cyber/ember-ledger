# Live UI Integration Train

## Rules

- Continue one production integration section at a time.
- Do not deploy from this train unless explicitly approved.
- Do not change backend, auth, billing, database, or RLS logic.
- Do not add scraping, checkout, payments, uploads, live AI, messaging, or auto-buy behavior.
- Keep the approved standalone `screen-set.html` preview intact.
- Keep each section mock-only unless a later task explicitly approves live backend integration.

## Ordered Sections

| Order | Section | Status | Commit | Notes |
| --- | --- | --- | --- | --- |
| 0 | Approved 40-screen preview checkpoint | Complete | `2f76da3` | Standalone preview remains the visual source of truth. |
| 0.1 | Live Hearth UI foundation | Complete | `aa6a7ea` | Hearth integrated with mock UI data and no backend changes. |
| 0.2 | Live Scout Home | Complete | `ff6d8a3` | Scout Home integrated with current-report mock UI and safety copy. |
| 0.3 | Scout Store Detail / Watch Stores / Alerts / Calendar | Complete | `ed815c5` | Supporting Scout stores/alerts section completed before this expanded train order. |
| 1 | Scout Add Report / Scan Screenshot / Review Report | Complete | `f88384a` | Mock-only page shells inside existing Scout route state. |
| 2 | Scout Online and Watchlist | Complete | `00c723d` | Mock-only online signals and tier-safe watchlist. |
| 3 | Vault Home | Complete | `d3b19e7` | Live Vault Home dashboard integrated above existing collection list. |
| 4 | Vault Item Detail / Add Item / Empty Vault | Complete | `25ea98c` | Empty Vault and Add Item flow polished; existing item detail preserved. |
| 5 | Market Home | Complete | `eca2e65` | Mock-only market search/discovery UI. |
| 6 | Market Product Detail / Loading / Error | Complete | `d9d9e82` | Honest labels only; no live price API. |
| 7 | More / Settings / Privacy & Safety / Membership | Complete | `16a5c36` | No billing or auth changes. |
| 8 | Parent Center | Complete | This section commit | Mock-only safety center; no child account backend changes. |
| 9 | Tidepool | Not started | - | Mock-only moderated community UI. |
| 10 | The Spark / Donate / Thank You | Not started | - | Mock-only giving flow; no payments. |
| 11 | Ember Assist | Not started | - | Mock-only helper UI; no live AI calls. |
| 12 | Forge / Trade Analyzer / Listing Builder / Sales Ledger | Not started | - | Mock-only workspace UI; no inventory writes. |
| 13 | Shop Portal | Not started | - | Mock-only trust controls; no shop backend changes. |
| 14 | Admin Review | Not started | - | Mock-only review UI; no admin mutations. |
| 15 | Onboarding and Virginia-first Flow | Not started | - | Mock/local UI only unless existing safe onboarding exists. |
| 16 | Final Integration QA and Polish | Not started | - | Final consistency, spacing, docs, screenshots, tests. |

## Current Section: Parent Center

Started: 2026-06-05 02:28:00 -04:00

Scope:

- Parent Center route/page
- Mock kid profiles
- Parent visibility, approval, restriction, purchase reminder, Spark participation, trusted adult, and safety summary cards

Allowed behavior:

- Mock-only family safety UI
- Links to existing safe Spark, Privacy & Safety, and Settings surfaces

Disallowed behavior:

- Auth, billing, database, or RLS changes
- Child account backend changes
- Live messaging
- Backend writes or Supabase mutations
- Parent/child auth changes
- Checkout, payments, uploads, or live AI

## Section QA Log

### Section 5 - Market Home

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/market-home/market-home-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-home/market-home-430x932.png`
- `artifacts/qa/live-ui-integration-train/market-home/market-home-1440x900.png`
- `artifacts/qa/live-ui-integration-train/market-home/screen-set-preview-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-home/live-market-home-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Standalone `screen-set.html` preview rendered at 390x844 with approved Hearth / Scout / Vault / Market / More nav text, no horizontal overflow, and no console/page errors.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:market`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun first hit an intermittent Supabase REST 500, second outside-sandbox rerun passed.

Mock-only notes:

- Discovery cards, fair ranges, freshness labels, and source labels are mock UI examples.
- Watch action only opens the existing Market watchlist tab.
- Use in search only places text into the existing search input.
- No live price API, scraping, checkout, purchase flow, database write, auth change, billing change, schema change, or RLS change was added.

### Section 6 - Market Product Detail / Loading / Error

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/market-detail-states/market-product-detail-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-product-detail-430x932.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-product-detail-1440x900.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-loading-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-error-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/live-market-detail-states-qa-results.json`

QA results:

- Product Detail 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Product Detail 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Product Detail 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Loading 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Error/fallback 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:market`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.

Mock-only notes:

- Product Detail now shows fair-range/no-checkout context using existing available values only.
- Loading state labels fair-value checking without promising live data.
- Error/fallback state explains unavailable live catalog data and offers safe retries/fallbacks.
- No live price API, scraping, checkout, purchase flow, database write, auth change, billing change, schema change, or RLS change was added.

### Section 7 - More / Settings / Privacy & Safety / Membership

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/more-settings/more-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/more-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/more-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/settings-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/settings-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/settings-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/privacy-safety-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/privacy-safety-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/privacy-safety-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/membership-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/membership-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/membership-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/live-more-settings-qa-results.json`

QA results:

- More 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Settings 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Privacy & Safety 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Membership 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:admin`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:admin-command-center`: passed.

Mock-only notes:

- More exposes Parent Center and Shop Portal as safe shortcuts to existing parent/Spark and partner interest surfaces until their dedicated sections are integrated.
- Membership remains beta preview copy with checkout disabled.
- Settings and Privacy & Safety copy documents child privacy, protected Scout data, role-scoped tools, and no unmoderated kid messaging.
- No auth, billing, database, RLS, checkout, payment, subscription, backend write, or admin gate change was added.

### Section 8 - Parent Center

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/parent-center/parent-center-390x844.png`
- `artifacts/qa/live-ui-integration-train/parent-center/parent-center-430x932.png`
- `artifacts/qa/live-ui-integration-train/parent-center/parent-center-1440x900.png`
- `artifacts/qa/live-ui-integration-train/parent-center/live-parent-center-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required parent-safety copy present.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required parent-safety copy present.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required parent-safety copy present.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:kids-program`: passed.

Mock-only notes:

- Parent Center uses mock kid profile rows and planning cards only.
- No child account backend, auth change, live messaging, payment flow, upload flow, backend write, database schema change, or RLS change was added.
- More now links Parent Center to the dedicated `parentCenter` route.

### Section 2 - Scout Online and Watchlist

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-online-390x844.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-online-430x932.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-online-1440x900.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-watchlist-390x844.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-watchlist-430x932.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-watchlist-1440x900.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/live-scout-online-watchlist-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Standalone `screen-set.html` preview rendered at 390x844 with approved Hearth / Scout / Vault / Market / More nav text, no horizontal overflow, and no console/page errors.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large-chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:scout`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

Warnings:

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.

Backend/auth/billing/database/RLS changes: none.

Deploy run: no.

### Section 3 - Vault Home

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/vault-home/vault-home-390x844.png`
- `artifacts/qa/live-ui-integration-train/vault-home/vault-home-430x932.png`
- `artifacts/qa/live-ui-integration-train/vault-home/vault-home-1440x900.png`
- `artifacts/qa/live-ui-integration-train/vault-home/live-vault-home-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Standalone `screen-set.html` preview rendered at 390x844 with approved Hearth / Scout / Vault / Market / More nav text, no horizontal overflow, and no console/page errors.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large-chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:vault`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

Warnings:

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.

Backend/auth/billing/database/RLS changes: none.

Deploy run: no.

### Section 4 - Vault Item Detail / Add Item / Empty Vault

Status: Complete. Commit pending for this section.

Screenshots:

- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-empty-390x844.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-empty-430x932.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-empty-1440x900.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-add-item-390x844.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-add-item-430x932.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-add-item-1440x900.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/live-vault-item-flows-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Populated item detail screenshot was not reachable because the current beta-local Vault state is empty; existing `VaultItemDetail` remains the live detail component.
- Standalone `screen-set.html` preview rendered at 390x844 with approved Hearth / Scout / Vault / Market / More nav text, no horizontal overflow, and no console/page errors.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large-chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:vault`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

Warnings:

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.
- Populated item detail screenshot was not captured because the current beta-local Vault state is empty.

Backend/auth/billing/database/RLS changes: none.

Deploy run: no.

### Section 1 - Scout Add Report / Scan Screenshot / Review Report

Status: Complete. Committed as the section commit containing this document update.

Screenshots:

- `artifacts/qa/live-scout-report-flow/scout-add-report-390x844.png`
- `artifacts/qa/live-scout-report-flow/scout-add-report-430x932.png`
- `artifacts/qa/live-scout-report-flow/scout-add-report-768x1024.png`
- `artifacts/qa/live-scout-report-flow/scout-add-report-1440x900.png`
- `artifacts/qa/live-scout-report-flow/scout-scan-screenshot-390x844.png`
- `artifacts/qa/live-scout-report-flow/scout-scan-screenshot-430x932.png`
- `artifacts/qa/live-scout-report-flow/scout-scan-screenshot-768x1024.png`
- `artifacts/qa/live-scout-report-flow/scout-scan-screenshot-1440x900.png`
- `artifacts/qa/live-scout-report-flow/scout-review-report-390x844.png`
- `artifacts/qa/live-scout-report-flow/scout-review-report-430x932.png`
- `artifacts/qa/live-scout-report-flow/scout-review-report-768x1024.png`
- `artifacts/qa/live-scout-report-flow/scout-review-report-1440x900.png`
- `artifacts/qa/live-scout-report-flow/live-scout-report-flow-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets, no covered primary actions.
- 430x932: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets, no covered primary actions.
- 768x1024: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets, no covered primary actions.
- 1440x900: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large-chunk warning.
- `npm.cmd run lint --if-present`: skipped cleanly.
- `npm.cmd run typecheck --if-present`: skipped cleanly.
- `npm.cmd test --if-present`: skipped cleanly.
- `npm.cmd run format:check --if-present`: skipped cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:scout`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

Warnings:

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.

Backend/auth/billing/database/RLS changes: none.

Deploy run: no.

### Supporting Scout Section - Store Detail / Watch Stores / Alerts / Calendar

Status: Complete. Committed as the section commit containing this document update.

Screenshots:

- `artifacts/qa/live-scout-stores-alerts/scout-watch-stores-390x844.png`
- `artifacts/qa/live-scout-stores-alerts/scout-watch-stores-430x932.png`
- `artifacts/qa/live-scout-stores-alerts/scout-watch-stores-768x1024.png`
- `artifacts/qa/live-scout-stores-alerts/scout-watch-stores-1440x900.png`
- `artifacts/qa/live-scout-stores-alerts/scout-store-detail-390x844.png`
- `artifacts/qa/live-scout-stores-alerts/scout-store-detail-430x932.png`
- `artifacts/qa/live-scout-stores-alerts/scout-store-detail-768x1024.png`
- `artifacts/qa/live-scout-stores-alerts/scout-store-detail-1440x900.png`
- `artifacts/qa/live-scout-stores-alerts/scout-alerts-calendar-390x844.png`
- `artifacts/qa/live-scout-stores-alerts/scout-alerts-calendar-430x932.png`
- `artifacts/qa/live-scout-stores-alerts/scout-alerts-calendar-768x1024.png`
- `artifacts/qa/live-scout-stores-alerts/scout-alerts-calendar-1440x900.png`
- `artifacts/qa/live-scout-stores-alerts/live-scout-stores-alerts-qa-results.json`

QA results:

- 390x844: no horizontal overflow, no console errors, no maximum update depth errors, no unsafe copy, no raw-pattern exposure, no tiny targets, no dock-covered controls.
- 430x932: no horizontal overflow, no console errors, no maximum update depth errors, no unsafe copy, no raw-pattern exposure, no tiny targets, no dock-covered controls.
- 768x1024: no horizontal overflow, no console errors, no maximum update depth errors, no unsafe copy, no raw-pattern exposure, no tiny targets, no dock-covered controls.
- 1440x900: no horizontal overflow, no console errors, no maximum update depth errors, no unsafe copy, no raw-pattern exposure, no tiny targets.

Checks:

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large-chunk warning.
- `npm.cmd run lint --if-present`: skipped cleanly.
- `npm.cmd run typecheck --if-present`: skipped cleanly.
- `npm.cmd test --if-present`: skipped cleanly.
- `npm.cmd run format:check --if-present`: skipped cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:scout`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

Warnings:

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.

Backend/auth/billing/database/RLS changes: none.

Deploy run: no.
