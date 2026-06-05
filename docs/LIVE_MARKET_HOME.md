# Live Market Home UI

## Scope

This section integrates the live Market Home discovery surface only.

Included:

- Market search home guidance
- Category chips
- Fair search card
- Mock product result cards
- Fair range labels
- Trusted source / freshness labels
- Watchlist prompt

Not included:

- Market product detail
- Loading state
- Error state
- Live price API work
- Retailer scraping
- Checkout or purchase flows

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_MARKET_HOME.md`

## Mock-Only / UI-Only Behavior

- Product cards are mock discovery examples.
- Fair ranges and freshness labels are display-only examples.
- The Watch action only opens the existing Market watchlist tab.
- The Use in search action only places text into the existing search field.
- No backend write, live price API, retailer scraping, checkout, payment, or purchase behavior was added.

## Safety / Anti-Scalper Notes

Visible copy now reinforces:

- "Market compares fair value. It is not an auto-buy dashboard."
- Watchlist behavior is interest tracking, not a rush feed.
- Weak data should stay labeled honestly.
- No exact-stock or checkout promises are made.

## Responsive QA Results

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- Standalone `screen-set.html` preview rendered at 390x844 with approved Hearth / Scout / Vault / Market / More nav text, no horizontal overflow, and no console/page errors.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/market-home/market-home-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-home/market-home-430x932.png`
- `artifacts/qa/live-ui-integration-train/market-home/market-home-1440x900.png`
- `artifacts/qa/live-ui-integration-train/market-home/screen-set-preview-390x844.png`
- `artifacts/qa/live-ui-integration-train/market-home/live-market-home-qa-results.json`

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
- `npm.cmd run test:market`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun first hit an intermittent Supabase REST 500, second outside-sandbox rerun passed.

## Known Warnings

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.
- One outside-sandbox Market check hit an intermittent Supabase REST 500 for a catalog search request; rerun passed without code changes.

## Next Recommended Task

Continue to Section 6: Market Product Detail / Loading / Error.
