# Live Scout Report Flow Integration

## Scope

This pass integrates live production UI shells for Scout Add Report, Scan Screenshot, and Review Report only.

Out of scope:

- Deploy
- Vault, Market, More, Forge, Tidepool, The Spark, Ember Assist, Parent Center, Shop Portal, or Admin Review integration
- Backend writes
- Auth, billing, database, or RLS changes
- Real uploads
- Live text extraction
- Live AI
- Retail scraping
- Checkout, payments, subscriptions, auto-buy, or messaging

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `scripts/beta-smoke.cjs`
- `docs/LIVE_UI_10HR_PASS.md`
- `docs/LIVE_SCOUT_REPORT_FLOW.md`

## Routes And Screens Added

The live Scout page now has mock-only page-style states inside the existing `scoutView` architecture:

- `addReport`: Scout Add Report
- `scanScreenshot`: Scout Scan Screenshot
- `reviewReport`: Scout Review Report

No broad router rewrite was added.

## Mock-Only Behavior

- Add Report uses read-only mock field values.
- Scan Screenshot shows a mock upload/scan area and mock extraction results.
- Review Report shows editable-looking summary rows and local success state.
- `Submit current report` only flips local UI state to show: `Thanks - your report is queued for trust review.`
- No report is saved.
- No file is uploaded.
- No OCR or live extraction runs.
- No database mutation runs.
- No Supabase write was added.

## Scout Home Links

Scout Home and the Scout header now link into the new mock-only page shells:

- Header `Add Report` opens Scout Add Report.
- Header `Scan Screenshot` opens Scout Scan Screenshot.
- Scout Home `Submit report` opens Scout Add Report.
- Scout Home report CTA `Review report` opens Scout Review Report.

Other existing Scout entry points, such as Store Detail report actions, keep their existing behavior.

## Safety And Anti-Scalper Protections

Visible copy includes:

- `Share useful proof, not exploitable patterns.`
- `Please avoid employee names, private messages, vendor schedules, and unsafe details.`
- `We use reports to help families, not expose restock patterns.`
- `Nothing is shared until you review and confirm.`
- `Your proof helps families decide whether a trip is worth it.`
- `No vendor schedules`
- `No employee names`
- `No private messages`
- `Exact quantities stay hidden unless a trusted shop chooses to share them.`

The UI avoids claims about guaranteed stock, scraping, checkout, payment, bot behavior, or profit opportunities.

## Backend TODOs

- TODO: Connect Scout Add Report fields to the existing reviewed report draft model only after save permissions and backend contracts are approved.
- TODO: Connect Scan Screenshot to a reviewed extraction service only after privacy, upload, and moderation rules are approved.
- TODO: Connect Review Report submit to the existing Scout review/save flow only after confirming no duplicate saves and correct user ownership behavior.

## Responsive QA Results

Screenshots and QA JSON are saved under:

- `artifacts/qa/live-scout-report-flow/`
- `artifacts/qa/live-scout-report-flow/live-scout-report-flow-qa-results.json`

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

Probe results:

- 390x844: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets, no covered primary actions.
- 430x932: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets, no covered primary actions.
- 768x1024: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets, no covered primary actions.
- 1440x900: no horizontal overflow, no console errors, no maximum update depth errors, no tiny targets.
- `screen-set.html`: still renders through the Vite preview, five-tab nav labels remain present, Scan Screenshot and Review Report remain present in the approved standalone preview.

## Accessibility Notes

- Primary flow actions are real buttons with visible text labels.
- Mobile and tablet probes found no visible button below 40px.
- Scout report fields use labels and read-only inputs for mock values.
- Review summary rows are button-like and expose visible `Edit` affordances.
- The flow pages preserve the existing app shell focus styles.

## Checks Run

- `git diff --check`: PASS with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: PASS with existing Vite large-chunk warning only.
- `npm.cmd run lint --if-present`: PASS/skipped, no script output.
- `npm.cmd run typecheck --if-present`: PASS/skipped, no script output.
- `npm.cmd test --if-present`: PASS/skipped, no script output.
- `npm.cmd run format:check --if-present`: PASS/skipped, no script output.
- `npm.cmd run smoke:beta`: PASS.
- `npm.cmd run test:app-fallbacks`: PASS.
- `npm.cmd run test:menu-full-page-routes`: PASS.
- `npm.cmd run test:scout`: PASS outside sandbox after sandbox Chromium `spawn EPERM`.

## Known Warnings

- Existing Vite large-chunk warning remains.
- Existing LF-to-CRLF working-copy warning remains.
- Chromium browser checks require outside-sandbox rerun in this environment because sandbox launch hits `spawn EPERM`.

## Next Recommended Task

Next controlled integration task: Scout Store Detail / Watch Stores / Alerts and Calendar, or review the Scout report flow visually before starting the next production page.
