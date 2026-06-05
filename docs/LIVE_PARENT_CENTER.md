# Live Parent Center UI

## Scope

Section 8 integrates the live Parent Center UI as a mock-only safety shell.

## Files changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_PARENT_CENTER.md`

## Route/screen added

- `/parent-center`
- `parentCenter` active tab

## Mock-only behavior

- Kid profile rows are mock examples.
- Parent approvals, trusted adults, trade guidance, purchase reminders, and Spark participation are UI-only planning cards.
- No child accounts, auth changes, messaging, payment flows, uploads, or backend writes are connected.

## Safety protections

- Copy states: “Kids can collect safely with parent-guided tools.”
- Child profiles stay private and parent-managed.
- No public child profiles are enabled.
- No unmoderated kid messaging is connected.
- Trade, Spark, community, and purchase actions are framed as parent-guided review.

## Backend TODOs

- TODO: Add a reviewed parent/child safety contract before connecting any child account, trusted adult, approval, or messaging systems.
- TODO: Connect real family workspace data only after auth, privacy, and RLS behavior are explicitly approved and tested.

## Responsive QA results

Passed:

- 390x844
- 430x932
- 1440x900

Result: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors, and required parent-safety copy present.

## Accessibility QA notes

The page uses existing utility shell buttons and card components with clear labels and readable text. Mobile cards stack to one column, CTAs use existing 44px-friendly button styles, and child/private data is represented as mock-only labels.

## Screenshot paths

- `artifacts/qa/live-ui-integration-train/parent-center/parent-center-390x844.png`
- `artifacts/qa/live-ui-integration-train/parent-center/parent-center-430x932.png`
- `artifacts/qa/live-ui-integration-train/parent-center/parent-center-1440x900.png`
- `artifacts/qa/live-ui-integration-train/parent-center/live-parent-center-qa-results.json`

## Checks run

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

## Known warnings

- Existing Vite large chunk warning may appear during build.
- Existing LF-to-CRLF working-copy warning may appear during Git checks.
- Chromium may need outside-sandbox rerun if `spawn EPERM` occurs.

## Next recommended task

Section 9: integrate the live Tidepool UI after Parent Center is committed.
