# Live Market Detail and State UI

## Scope

This section integrates UI polish for:

- Market Product Detail
- Market Loading state
- Market Error state

The existing Market search, result, and product-detail behavior remains intact.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_MARKET_DETAIL_STATES.md`

## Screens Updated

- Existing Market product detail drawer
- Existing Market search loading state
- Existing Market search error state

## Mock-Only / UI-Only Behavior

- Added honest display labels and helper copy only.
- No live price API was added.
- No retailer scraping was added.
- No checkout, payment, purchase, or auto-buy flow was added.
- No backend write or database mutation was added.

## Safety / Data Boundaries

- Product detail now includes explicit no-checkout language.
- Loading state says "Checking fair value" and repeats that Market is not an auto-buy dashboard.
- Error state offers Try Search Again, Vault review fallback, and Ember Assist fallback without promising live data.
- Existing source/freshness labels remain honest.

## Responsive QA Results

- Product Detail 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Product Detail 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Product Detail 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Loading 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Error/fallback 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/market-detail-states/market-product-detail-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-product-detail-430x932.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-product-detail-1440x900.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-loading-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/market-error-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-detail-states/live-market-detail-states-qa-results.json`

## Checks Run

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

## Known Warnings

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.
- Error screenshot uses QA-only request interception; app behavior remains fallback-first when live catalog data is unavailable.

## Next Recommended Task

Continue to Section 7: More / Settings / Privacy & Safety / Membership.
