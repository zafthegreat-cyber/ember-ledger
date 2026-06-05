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
| 1 | Live Hearth UI foundation | Complete | `aa6a7ea` | Hearth integrated with mock UI data and no backend changes. |
| 2 | Live Scout Home | Complete | `ff6d8a3` | Scout Home integrated with current-report mock UI and safety copy. |
| 3 | Scout Add Report / Scan Screenshot / Review Report | Complete | `f88384a` | Mock-only page shells inside existing Scout route state. |
| 4 | Scout Store Detail / Watch Stores / Alerts / Calendar | Complete | This section commit | Store/watch/calendar polish, safety copy, and responsive QA. |
| 5 | Vault | Not started | - | Next recommended section after Scout section approval. |
| 6 | Market | Not started | - | Do not start until Vault or explicit approval. |
| 7 | More / Settings / Admin-visible shells | Not started | - | Keep admin gates protected. |
| 8 | Forge / Tidepool / The Spark / Ember Assist | Not started | - | Integrate only when explicitly requested section by section. |

## Current Section: Scout Store Detail / Watch Stores / Alerts / Calendar

Scope:

- Scout Store Detail
- Scout Watch Stores
- Scout Alerts
- Scout Calendar

Allowed behavior:

- Existing Scout store/report/calendar data already present in the app
- Mock/local UI state only where applicable
- Existing Scout route/page shell
- Safety copy and responsive UI polish

Disallowed behavior:

- Real upload
- Live OCR or AI
- Database writes
- Supabase mutations
- Scraping
- Checkout/payment/subscription changes
- Auth or RLS changes

## Section QA Log

### Section 3 - Scout Add Report / Scan Screenshot / Review Report

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

### Section 4 - Scout Store Detail / Watch Stores / Alerts / Calendar

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
