# Live Scout Online and Watchlist UI

## Scope

This section integrates live UI shells for:

- Scout Online
- Scout Watchlist

The section is UI-only and mock-only. It does not add scraping, checkout, live inventory, uploads, live AI, database writes, auth changes, billing changes, database schema changes, or RLS changes.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_SCOUT_ONLINE_WATCHLIST.md`

## Routes / Screens Added

- `/scout/online`
- `/scout/watchlist`

Scout Home and the Scout header can reach these views through the existing Scout route state.

## Mock-Only Behavior

- Online signal cards are static mock rows.
- Watched product cards are static mock rows.
- Watched store summary reads the existing local Scout store rows already available to the UI.
- Watch Product and Add product watch route users to the mock Watchlist / Online views.
- No checkout or retailer action is wired.

## Safety / Anti-Scalper Protections

- Copy states that Scout Online is not an auto-buy dashboard.
- Copy says no scraping, no checkout, no exact quantities, no vendor schedules, and no raw pattern history.
- Online signals are framed as manual checks with source/freshness labels.
- Watchlist limits keep selected stores and product watches tier-safe.

## Backend TODOs

- TODO: Replace mock online signal rows with a reviewed read-only Scout source contract.
- TODO: Replace mock watched product rows with reviewed read-only product watch data.
- TODO: Keep exact quantities hidden unless a trusted shop explicitly chooses to publish them.

## Responsive QA Results

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.

The first sandbox browser launch hit Chromium `spawn EPERM`; the same QA was rerun outside the sandbox and passed.

## Accessibility QA Notes

- Primary actions clear the bottom dock at compact widths.
- Product and store watch actions remain at least 44px tall.
- Text wraps within cards at 390px and 430px.
- Safety badges wrap instead of clipping.
- The standalone preview board still renders with the approved Hearth / Scout / Vault / Market / More nav labels.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-online-390x844.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-online-430x932.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-online-1440x900.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-watchlist-390x844.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-watchlist-430x932.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/scout-watchlist-1440x900.png`
- `artifacts/qa/live-ui-integration-train/scout-online-watchlist/live-scout-online-watchlist-qa-results.json`

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
- `npm.cmd run test:scout`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

## Known Warnings

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.

## Next Recommended Task

After this section passes checks and is committed, continue to Section 3: Vault Home.
