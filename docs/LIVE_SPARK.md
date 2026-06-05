# Live The Spark UI Integration

## Scope

Section 10 integrates The Spark, Donate, and Thank You UI states into the live app. The goal is to make The Spark feel like a mission-centered giving hub while keeping all behavior mock-only.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_SPARK.md`

## Screens / Routes Added

- `/kids-program`
- `/kids-program/donate`
- `/kids-program/thank-you`

## Mock-Only Behavior

- Donate and Thank You are local UI states.
- Submit mock donation only switches to the Thank You view.
- Impact meter, impact stories, sponsor/shop support, and donation categories are static UI examples.
- No payment, checkout, external payment link, donation backend, upload service, database write, live AI call, auth change, billing change, schema change, or RLS change was added.

## Safety / Family Protections

- The Spark keeps parent-managed and admin-reviewed copy.
- Child/family request details remain private.
- Donate view explicitly says no payment, checkout, external link, or donation backend is connected.
- Thank You view says the mock support item is queued for admin review before it counts toward impact.

## Donation Categories

The Donate view includes:

- Cards
- Sealed products
- Packs
- Binders
- Sleeves
- Deck boxes
- Playmats
- Toys/prizes
- Gift cards
- Money/sponsorship placeholder only
- Event support
- Food/snacks
- Shipping help
- Volunteer time
- Services
- Other

## Backend TODOs

- TODO: connect donation intake only after payment/no-payment rules, admin review, privacy, and RLS are approved.
- TODO: connect shop/sponsor support only after shop permissions and review workflows are approved.

## Responsive QA Results

- Spark 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required Spark copy present.
- Donate 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and no-payment/no-checkout copy present.
- Thank You 390x844 / 430x932 / 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and mock review/impact copy present.

Browser screenshots required an outside-sandbox Playwright rerun after sandbox Chromium `spawn EPERM`.

## Accessibility QA Notes

The live integration uses existing semantic buttons for CTAs, static category chips for non-actions, readable card text, and full-width mobile action rows. Non-action preview grids were converted from buttons to static cards to avoid false affordances and dock-covered tap targets.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/spark/spark-390x844.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-430x932.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-1440x900.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-donate-390x844.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-donate-430x932.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-donate-1440x900.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-thank-you-390x844.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-thank-you-430x932.png`
- `artifacts/qa/live-ui-integration-train/spark/spark-thank-you-1440x900.png`
- `artifacts/qa/live-ui-integration-train/spark/live-spark-qa-results.json`

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
- `npm.cmd run test:kids-program`: passed.
- `npm.cmd run test:spark`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.

## Known Warnings

- Existing Vite large chunk warning during build.
- Existing LF-to-CRLF working-copy warnings from `git diff --check`.
- Sandbox Chromium `spawn EPERM` for `test:spark`; outside-sandbox rerun passed.

## Next Recommended Task

Continue to Section 11: Ember Assist. Keep it mock-only with no live AI calls or chat persistence.
