# Live Forge UI

## Scope

- Live Forge dashboard workspace.
- Mock-only Trade Analyzer, Listing Builder, and Sales Ledger preview cards.
- Existing grouped inventory, sales records, and owner-safe Forge surfaces remain in place.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_FORGE.md`

## Screens Integrated

- Forge dashboard.
- Trade Analyzer preview.
- Listing Builder preview.
- Sales Ledger preview with an existing Sales Records entry point.

## Mock-Only Behavior

- Trade Analyzer preview uses static comparison copy and does not save trade history.
- Listing Builder preview uses static draft copy and does not publish listings.
- Sales Ledger preview shows static recordkeeping context and only links to existing Sales Records UI.
- No inventory, Vault, Forge item, sale, listing, checkout, payment, upload, or backend mutation behavior was added or changed.

## Safety / Business Notes

- Trade preview reminds users to get parent approval for kid-owned items.
- Listing preview states no checkout, payment, or marketplace posting is connected.
- Sales Ledger preview keeps the existing recordkeeping language: confirm summaries with a tax professional.

## Backend TODOs

- TODO: If future trade analyzer records are approved, keep review-before-save and avoid mutating Vault/Forge inventory without explicit user confirmation.
- TODO: If future marketplace listings are approved, connect through seller/shop review and safety controls before any live posting.
- TODO: If future sales import/export improvements are approved, keep recordkeeping copy separate from legal/tax advice.

## Responsive QA

- `artifacts/qa/live-ui-integration-train/forge/forge-390x844.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/forge/forge-430x932.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/forge/forge-1440x900.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/forge/live-forge-qa-results.json`: required Trade Analyzer, Listing Builder, and Sales Ledger copy present.
- Current local QA role shows seller tools disabled; Section 12 previews are visible in that safe disabled state without turning seller tools on.

## Accessibility QA Notes

- Preview cards use semantic `article` regions.
- The Sales Ledger action is a real button with clear copy.
- Mock-only trade/listing cards use badges instead of fake disabled actions.

## Checks

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:sales-records`: passed.
- `npm.cmd run test:forge-grouped-inventory`: passed.

## Known Warnings

- Existing Vite large chunk warning may appear during build.
- Existing LF-to-CRLF working-copy warnings may appear during Git checks.
- Chromium may require outside-sandbox rerun if local sandbox launch hits `spawn EPERM`.

## Next Recommended Task

- Continue to Section 13: Shop Portal after this section passes checks and is committed.
