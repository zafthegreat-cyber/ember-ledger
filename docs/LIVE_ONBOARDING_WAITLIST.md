# Live Onboarding and Virginia-first UI

## Scope

- Live mock-only onboarding route family at `/onboarding/:view`.
- Views: Welcome, State Check, Waitlist, Choose Role, Family Setup, Notifications, First Store, and Permission Needed.
- Virginia-first launch framing and role/tier preview cards.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_ONBOARDING_WAITLIST.md`

## Routes / Screens Added

- `/onboarding/welcome`
- `/onboarding/state-check`
- `/onboarding/waitlist`
- `/onboarding/choose-role`
- `/onboarding/family-setup`
- `/onboarding/notifications`
- `/onboarding/first-store`
- `/onboarding/permission-needed`

## Mock-only Behavior

- The onboarding screens are local UI previews.
- Buttons move between local subviews or existing safe app surfaces.
- No account creation flow, beta waitlist submission, billing action, database write, upload, live AI call, or backend request was added.

## Safety and Privacy Notes

- Copy keeps the Virginia-first launch clear.
- Child/family details stay private.
- Scout raw patterns, vendor schedules, exact quantities, and employee details stay hidden.
- Membership and Shop paths remain preview/permission-gated; checkout is not connected.

## Backend TODOs

- TODO: If future backend onboarding is approved, keep state collection, waitlist submission, family setup, and notification preferences behind existing auth/RLS policies.
- TODO: Keep child profile details parent-guided and private.

## Responsive QA

Screenshots saved under `artifacts/qa/live-ui-integration-train/onboarding/`.

- `onboarding-welcome-390x844.png`, `onboarding-welcome-430x932.png`, `onboarding-welcome-1440x900.png`
- `onboarding-state-check-390x844.png`, `onboarding-state-check-430x932.png`, `onboarding-state-check-1440x900.png`
- `onboarding-waitlist-390x844.png`, `onboarding-waitlist-430x932.png`, `onboarding-waitlist-1440x900.png`
- `onboarding-choose-role-390x844.png`, `onboarding-choose-role-430x932.png`, `onboarding-choose-role-1440x900.png`
- `onboarding-family-setup-390x844.png`, `onboarding-family-setup-430x932.png`, `onboarding-family-setup-1440x900.png`
- `onboarding-notifications-390x844.png`, `onboarding-notifications-430x932.png`, `onboarding-notifications-1440x900.png`
- `onboarding-first-store-390x844.png`, `onboarding-first-store-430x932.png`, `onboarding-first-store-1440x900.png`
- `onboarding-permission-needed-390x844.png`, `onboarding-permission-needed-430x932.png`, `onboarding-permission-needed-1440x900.png`
- `live-onboarding-qa-results.json`

QA results: no horizontal overflow, no console errors, no maximum update depth errors, required safety copy present.

## Accessibility QA Notes

- Step selector uses buttons with `aria-current="step"` on the active view.
- Cards use readable labels, large tap targets, and single focusable controls.
- Locked and permission language explains access without exposing hidden data.

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
- `npm.cmd run test:onboarding --if-present`: passed.

## Known Warnings

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Browser screenshots required outside-sandbox Playwright because Chromium can hit sandbox `spawn EPERM`.

## Next Recommended Task

- Continue to Section 16: Final Integration QA and Polish.
