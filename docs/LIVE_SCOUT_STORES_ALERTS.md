# Live Scout Stores / Alerts UI

## Scope

This section polished the existing live Scout Store Detail, Watch Stores, Alerts, and Calendar surfaces. It did not add backend behavior or new integrations.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_SCOUT_STORES_ALERTS.md`

## UI Changes

- Replaced public-facing "raw history" / "pattern windows" wording in Watch Stores with safer "sensitive history" language.
- Increased touch targets for Scout store toggles, retailer chips, calendar tabs, store filters, and calendar layer chips.
- Added mobile-safe spacing for Scout stores and calendar surfaces.
- Compacted phone-only Watch Stores and Calendar layouts so controls clear the bottom dock.
- Hid optional advanced store/calendar filters on the smallest phone widths where they crowded primary actions.

## Mock-Only / Existing Data Behavior

This pass used the app's existing Scout store/report/calendar UI state. It did not add uploads, live OCR, live AI, scraping, database writes, Supabase mutations, checkout, payments, auth changes, billing changes, database schema changes, or RLS changes.

## Safety / Anti-Scalper Notes

- Public copy emphasizes current signals and protected sensitive history.
- QA checked for unsafe phrases such as auto-buy, checkout, guaranteed stock, vendor route, employee schedule, and flip opportunity.
- QA checked for raw-pattern exposure phrases such as raw restock history and pattern windows.

## Responsive QA

Screenshots and the QA result JSON are saved under:

- `artifacts/qa/live-scout-stores-alerts/`

Captured states:

- Watch Stores: 390x844, 430x932, 768x1024, 1440x900
- Store Detail: 390x844, 430x932, 768x1024, 1440x900
- Alerts / Calendar: 390x844, 430x932, 768x1024, 1440x900

Final QA result:

- `failures: []`
- no horizontal overflow
- no console errors
- no maximum update depth errors
- no unsafe copy
- no raw-pattern exposure
- no tiny targets
- no dock-covered controls

## Checks

- `git diff --check`: passed with existing LF-to-CRLF warnings only
- `npm.cmd run build`: passed with existing Vite large-chunk warning
- `npm.cmd run lint --if-present`: skipped cleanly
- `npm.cmd run typecheck --if-present`: skipped cleanly
- `npm.cmd test --if-present`: skipped cleanly
- `npm.cmd run format:check --if-present`: skipped cleanly
- `npm.cmd run smoke:beta`: passed
- `npm.cmd run test:app-fallbacks`: passed
- `npm.cmd run test:menu-full-page-routes`: passed
- `npm.cmd run test:scout`: passed outside sandbox after sandbox Chromium `spawn EPERM`

## Known Warnings

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium browser checks may need outside-sandbox reruns when sandbox launch hits `spawn EPERM`.

## Next Recommended Task

Begin the next ordered integration section from `docs/LIVE_UI_INTEGRATION_TRAIN.md`: Vault.
