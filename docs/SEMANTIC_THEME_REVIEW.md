# Code 3 TCG visual refinement — local review

2026-09-14. Not committed, pushed, merged, or deployed.

## Starting point

Checkout: ember-hearth-command-pass-clean-final-5ba6627, detached HEAD ba68b2e, associated cached branch origin/ui-104-final-product-ui-2. Existing uncommitted Account Ops, UI, login, deployment documentation, and Code 3 TCG branding changes were preserved.

## Visual changes

The authoritative palette is src/styles/theme.css. Light mode uses the requested #F7F8F5 page, white surfaces, #24312E text, #5F6D66 secondary text, #0F766E action color, white action text, and #E2E7E3 subtle borders. Dark mode uses #141B19 page, #1E2925 surfaces, #F2F5F3 text, #A5B4AC secondary text, #67C8BB actions, #102C27 action text, and #35453D subtle borders.

Stronger interactive borders, focus rings, hover colors, and labeled success/warning/error treatments have separate semantic tokens. Existing operations and legacy command-board variables map to the same palette. Shared surface rules cover navigation, cards, tables, forms, dialogs, empty states, and Settings. The login story panel is neutral; older card fills and typography are restrained. Collectible artwork and logo assets are unchanged.

Removed duplicate palette declarations from operations-ui.css and replaced hard-coded colors in the prior workspace-polish stylesheet with semantic references. The existing brand accent metadata now matches the light palette.

No workspace, workflow, route handler, theme preference logic, authentication, permissions, data model, provider integration, remote-execution safeguard, or deployment setting was changed. No Bot-specific operational layout was edited.

## Verification

- Production frontend build passed; the existing large-bundle warning remains.
- Changed JavaScript file passed ESLint. There is no root lint or typecheck npm script. The existing backend tsconfig passed tsc --noEmit; no frontend TypeScript project exists.
- Branding checks, including generated build metadata, passed.
- Keyboard/reduced-motion contracts, route-loading checks, and workspace contracts passed.
- The route-loading test had a stale exact Home JSX match from the earlier Home navigation update. It now allows additional props while still requiring the extracted Home component; application routing was not changed.
- Login layout and reset/signup navigation passed at 360, 875, and 1440 pixels in light and dark.
- Broad viewport matrix: 46 checks per theme passed.
- Final semantic checks cover five routes at 390 and 1440 pixels in both themes (20 cases), including exact palette values, saved preferences, primary button text/touch size, nested button label color, overflow, filter-dialog focus, and Escape behavior.
- Account Ops browser suite: 5 scenarios / 926 assertions passed.
- Bot Operations browser suite: 27 fixtures / 809 assertions passed.
- Full beta regression: 28/28 scenarios passed.
- Final build and diff whitespace checks passed.

Screenshots: artifacts/qa/semantic-theme/ (final representative routes and filter dialogs), artifacts/qa/login-refresh/, artifacts/qa/viewport-guard/, and artifacts/qa/viewport-guard-dark/. Logs: artifacts/qa/semantic-theme-*.log and artifacts/qa/theme-test-*.log.

These are local synthetic browser checks, not live-provider verification, an exhaustive screen-reader audit, or testing on physical iOS/Android devices. No production publication was attempted.
