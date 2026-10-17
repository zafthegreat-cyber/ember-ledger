# Whole-app UI refresh

Date: 2026-09-14

Working checkout: ember-hearth-command-pass-clean-final-5ba6627, detached at ba68b2eb5f4fe027f5234cf207a44f8c07514ea2; associated branch ui-104-final-product-ui-2. This refresh is local and uncommitted, on top of the completed Account Ops candidate.

## Changes

- Added one shared presentation layer for page headings, spacing, cards, forms, buttons, focus indicators, and light/dark surfaces. Removed distracting button glow across current and legacy routes.
- Home now has a clear overview and working shortcuts to Find, Purchases & Receiving, Inventory, and Sales. Business shortcuts use the current Business routes.
- Restored mobile Collection and Business page headings and page actions. Organized Business destinations into responsive cards; improved record and empty-state presentation.
- Aligned Find navigation and empty states with the shared components.
- Improved command-board navigation label sizes, selected states, settings cards, and text contrast. Preserved existing reduced-motion behavior.
- Preserved the completed Account Ops UI and all existing data, role, provider, and persistence boundaries.

## Verification

- Frontend production build passed. Existing large App bundle warning remains.
- Keyboard/reduced-motion and route-loading checks passed.
- Workspace contracts passed: registry 260, preferences 84, fixture assertions 117 across 20 cases, UI contracts 87.
- Account Ops foundation browser: 5 scenarios / 926 assertions passed.
- New browser check verifies all four Home destinations, usable mobile Collection search, Business card styling, and purchase navigation.
- Full beta regression: 28/28 scenarios passed (330.222 seconds).
- Responsive matrix: 46 light + 46 dark checks passed across mobile, tablet, and desktop, including login, Home, Find, Collection, Business, Owner Center, restocks, Scout, Vault, Exchange, Forge, Market, Spark, Settings, and mobile quick add.
- A final targeted check covers the subsequent mobile Settings label-wrap correction.
- Git diff whitespace check passed.

Logs and screenshots are under artifacts/qa/whole-app-* and artifacts/qa/viewport-guard{,-dark}/. Browser verification uses synthetic local beta sessions.

No deployment, commit, migration, external communication, provider activation, or real account creation was performed.
