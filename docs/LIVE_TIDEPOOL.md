# Live Tidepool UI Integration

## Scope

Section 9 integrates the live Tidepool page as a mock-only, family-safe community surface. The goal is to make Tidepool feel like moderated collecting activity, not a rush-alert feed.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_TIDEPOOL.md`

## Screens / Routes Added

- Existing live Tidepool route/page was expanded with:
  - Safe community notice
  - Local / Families / Events / Shops / Tips section cards
  - Trusted shop update example
  - Family event card
  - Marketplace tip post
  - Trade interest post
  - Report or ask-for-review action

## Mock-Only Behavior

- Section cards and preview posts are static UI examples.
- Trusted shop, event, tip, and trade interest content is mock copy.
- The report/review button opens the existing feedback/report affordance only.
- No live community posting, live messaging, uploads, scraping, checkout, payments, AI calls, or database writes were added.

## Safety / Anti-Scalper Protections

- Tidepool copy says: "Tidepool is for trusted collecting activity, not rush alerts."
- Content avoids exact inventory quantities, vendor schedules, employee details, and guaranteed-stock language.
- Preview posts focus on events, family tips, parent-guided trade practice, and trusted shop context.
- Moderation/reporting remains reachable through existing report affordances.

## Backend TODOs

- TODO: connect vetted community posts to a moderated backend queue only after auth, RLS, child safety, and moderation requirements are explicitly approved.
- TODO: connect trusted shop updates only after shop permissions and safe quantity-sharing rules are implemented.

## Responsive QA Results

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required Tidepool safety/community copy present.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required Tidepool safety/community copy present.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required Tidepool safety/community copy present.

Browser screenshots required an outside-sandbox Playwright rerun after sandbox Chromium `spawn EPERM`.

## Accessibility QA Notes

The integration uses existing semantic buttons, card structure, readable section text, and mobile grids with full-width actions at compact widths. Viewport QA confirmed no clipped action rows or dock-covered non-nav buttons.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/tidepool/tidepool-390x844.png`
- `artifacts/qa/live-ui-integration-train/tidepool/tidepool-430x932.png`
- `artifacts/qa/live-ui-integration-train/tidepool/tidepool-1440x900.png`
- `artifacts/qa/live-ui-integration-train/tidepool/live-tidepool-qa-results.json`

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
- `npm.cmd run test:tidepool-community`: passed.
- `npm.cmd run test:tidepool-moderation`: passed.

## Known Warnings

- Existing Vite large chunk warning during build.
- Existing LF-to-CRLF working-copy warnings from `git diff --check`.
- Sandbox Chromium `spawn EPERM` for screenshot QA; outside-sandbox Playwright rerun passed.

## Next Recommended Task

Continue to Section 10: The Spark / Donate / Thank You after Tidepool checks pass and the section is committed.
