# Live Admin Review UI

## Scope

- Live Admin Review command center.
- Mock-only review foundation band for proof review, Scout report review, Tidepool moderation, shop approvals, Spark donation review, suspicious behavior review, and user safety flags.
- Mock action vocabulary for Approve, Reject, Request proof, Hide, Escalate, and Suspend placeholder.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_ADMIN_REVIEW.md`

## Screens Integrated

- Admin Review.

## Mock-Only Behavior

- The new review foundation band is a static visual summary.
- Action vocabulary chips are not wired to mutations.
- Existing admin sections and existing protected actions remain unchanged.
- No ban, suspend, hide, approve, reject, user mutation, moderation backend call, or admin gate change was added.

## Safety Notes

- The foundation copy says no new admin actions are wired from the panel.
- Existing protected admin access remains the gate.
- Normal users remain blocked by the existing Permission Denied state.
- Private child/family context and raw Scout pattern data are not exposed.

## Backend TODOs

- TODO: If future admin workflow changes are approved, require confirmation modals, affected item names, audit logs, and protected backend/RLS enforcement.
- TODO: Keep destructive moderation actions separate from mock UI summaries until explicitly approved.

## Responsive QA

- Normal-user screenshots verified Permission Denied at:
  - `artifacts/qa/live-ui-integration-train/admin-review/admin-review-390x844.png`
  - `artifacts/qa/live-ui-integration-train/admin-review/admin-review-430x932.png`
  - `artifacts/qa/live-ui-integration-train/admin-review/admin-review-1440x900.png`
  - `artifacts/qa/live-ui-integration-train/admin-review/live-admin-review-qa-results.json`
- Seeded owner/admin screenshots verified the protected Admin Review foundation at:
  - `artifacts/qa/live-ui-integration-train/admin-review/admin-review-admin-390x844.png`
  - `artifacts/qa/live-ui-integration-train/admin-review/admin-review-admin-430x932.png`
  - `artifacts/qa/live-ui-integration-train/admin-review/admin-review-admin-1440x900.png`
  - `artifacts/qa/live-ui-integration-train/admin-review/live-admin-review-admin-seeded-qa-results.json`
- 390x844, 430x932, and 1440x900 admin screenshots had no horizontal overflow, no console errors, and no maximum update depth errors.

## Accessibility QA Notes

- Foundation rows use semantic `article` cards.
- Mock actions are static badges, not fake buttons.
- Existing admin queue buttons remain the only interactive controls in the new area.

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
- `npm.cmd run test:admin-command-center`: passed.
- `npm.cmd run test:admin-store-tools`: passed.
- `npm.cmd run test:admin`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.

## Known Warnings

- Existing Vite large chunk warning may appear during build.
- Existing LF-to-CRLF working-copy warnings may appear during Git checks.
- Chromium may require outside-sandbox rerun if local sandbox launch hits `spawn EPERM`.

## Next Recommended Task

- Continue to Section 15: Onboarding and Virginia-first Flow after this section passes checks and is committed.
