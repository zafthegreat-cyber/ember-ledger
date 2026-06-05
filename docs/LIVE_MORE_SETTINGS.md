# Live More and Settings UI

## Scope

Section 7 integrates the live More command menu, Settings, Privacy & Safety, and Membership Foundation surfaces.

## Files changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_MORE_SETTINGS.md`

## Routes/screens updated

- More command menu
- Settings
- Privacy & Safety / Trust
- Membership Foundation

## Mock-only behavior

- Membership pricing, trials, add-ons, and locked states remain beta preview copy.
- Parent Center and Shop Portal menu entries route to existing safe live surfaces until their dedicated integration sections are completed.
- No checkout, billing provider, subscription mutation, or payment workflow is connected.

## Safety protections

- More exposes Privacy & Safety, Parent Center, and Shop Portal as clear command-menu entries.
- Settings now calls out Scout limits, family safety, child privacy, no open kid messaging, protected Scout data, and role-scoped tools.
- Privacy & Safety explains that raw Scout patterns, private child details, and admin-only moderation data stay protected.

## Backend TODOs

- TODO: Replace beta-preview membership copy with a backend-approved billing and entitlement contract when checkout is explicitly approved.
- TODO: Replace Parent Center and Shop Portal shortcut routing with dedicated live pages in Sections 8 and 13.

## Responsive QA results

Passed:

- More 390x844 / 430x932 / 1440x900
- Settings 390x844 / 430x932 / 1440x900
- Privacy & Safety 390x844 / 430x932 / 1440x900
- Membership 390x844 / 430x932 / 1440x900

Result: no horizontal overflow, no dock overlap, no console errors, and no maximum update depth errors in the captured states.

## Accessibility QA notes

The updated menu entries use existing button components and 44px-friendly drawer link styles. Utility surfaces keep readable card text and avoid nested interactive controls in the added Privacy & Safety cards.

## Screenshot paths

- `artifacts/qa/live-ui-integration-train/more-settings/more-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/more-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/more-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/settings-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/settings-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/settings-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/privacy-safety-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/privacy-safety-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/privacy-safety-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/membership-390x844.png`
- `artifacts/qa/live-ui-integration-train/more-settings/membership-430x932.png`
- `artifacts/qa/live-ui-integration-train/more-settings/membership-1440x900.png`
- `artifacts/qa/live-ui-integration-train/more-settings/live-more-settings-qa-results.json`

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
- `npm.cmd run test:admin`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:admin-command-center`: passed.

## Known warnings

- Existing Vite large chunk warning may appear during build.
- Existing LF-to-CRLF working-copy warning may appear during Git checks.
- Chromium may need outside-sandbox rerun if `spawn EPERM` occurs.

## Next recommended task

Section 8: integrate the dedicated live Parent Center UI after Section 7 is committed.
