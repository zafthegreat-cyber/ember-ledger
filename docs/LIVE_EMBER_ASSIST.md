# Live Ember Assist UI

## Scope

- Live Ember Assist floating helper panel.
- Friendly helper hero, prompt chips, recent-help examples, privacy/safety note, and quick actions.
- Mock/static UI framing only for Section 11 of the live UI integration train.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_EMBER_ASSIST.md`

## Screens Integrated

- Ember Assist helper panel.

## Mock-Only Behavior

- Recent-help cards are static examples.
- Quick action cards route to existing safe app surfaces or existing review-first flows.
- No new AI provider, assistant API, upload service, chat backend, or chat persistence was added.
- Existing local helper fallback behavior remains unchanged.

## Safety Notes

- Copy says: "Warm helper layer. No fake promises."
- The panel states it does not promise live stock, checkout, or guaranteed prices.
- The privacy note says Ember Assist does not search private child details, hidden admin notes, raw Scout patterns, or retailer schedules.
- "Report something unsafe" opens the existing feedback surface instead of adding messaging or moderation backend work.

## Backend TODOs

- TODO: If future live assistant services are approved, route them through explicit safety review, privacy review, and backend tests before connecting.
- TODO: If persistent support threads are approved, keep parent/child privacy rules and admin gating explicit.

## Responsive QA

- `artifacts/qa/live-ui-integration-train/assist/ember-assist-390x844.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/assist/ember-assist-430x932.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/assist/ember-assist-1440x900.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/assist/live-ember-assist-qa-results.json`: required helper copy/actions present.

## Accessibility QA Notes

- Quick actions use real buttons with clear labels and helper text.
- The panel keeps the existing dialog role and close control.
- Touch targets remain at least 44px through existing mobile control rules.

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
- `npm.cmd run test:ember-assist`: passed.

## Known Warnings

- Existing Vite large chunk warning may appear during build.
- Existing LF-to-CRLF working-copy warnings may appear during Git checks.
- Chromium may require outside-sandbox rerun if local sandbox launch hits `spawn EPERM`.

## Next Recommended Task

- Continue to Section 12: Forge / Trade Analyzer / Listing Builder / Sales Ledger after this section passes checks and is committed.
