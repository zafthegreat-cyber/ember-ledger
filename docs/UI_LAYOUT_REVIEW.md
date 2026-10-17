# Code 3 TCG layout review

Date: 2026-09-14. Local review candidate; no commit, push, merge, or deployment.

Working checkout: `ember-hearth-command-pass-clean-final-5ba6627`, detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`, associated with `ui-104-final-product-ui-2`. This pass builds on the completed Account Ops and semantic-theme work; it does not restart those phases. The working tree also contains those earlier uncommitted changes.

## What changed

- Home has a clear welcome, a compact attention summary, a prominent Find destination, and a grouped list of Purchases, Inventory, and Sales. Existing attention records, opportunities, recent activity, and business summaries remain available when data exists.
- Settings now uses one account summary and three groups: Account & app, Records & support, and Family & community. Preferences, workspace options, privacy guidance, and build details expand in place. Existing routes, notifications, controls, and Back behavior remain intact.
- Collection has a compact count/value row, usable search and filters, consistent record cards, and a welcoming empty state. No-match results have a clear reset action; existing unassigned items retain purpose-assignment guidance.
- Business destinations follow purchases, inventory, and sales, with Money and Compliance grouped below. Each has a clear icon, description, and destination indicator.
- Find has aligned tabs, an organized feed heading/action row, and clearer empty-state guidance.
- The shared shell gives Add visual priority while keeping secondary controls quieter. Navigation labels and the Code 3 TCG footer are consistent.
- Removed overlapping Everyday workspace overrides from the shared polish stylesheet. Per-page layout rules now live with the page; all use the existing semantic theme tokens.

The agreed neutral/teal light and dark palettes and saved theme preferences are retained. No business rules, authentication, permissions, data model, integration, remote-execution safeguard, or deployment setting changed.

## Verification

| Check | Actual result |
| --- | --- |
| Final frontend production build | Passed; existing large App bundle warning remains |
| Backend TypeScript `--noEmit` | Passed |
| Full beta regression | 28/28 scenarios passed |
| Light viewport matrix | 46/46 checks passed |
| Dark viewport matrix | 46/46 checks passed |
| Semantic theme browser checks | 20/20 cases passed: mobile/desktop, both palettes, saved preference, primary actions, dialogs |
| Workspace, route-loading, full-page-route, keyboard accessibility contracts | Passed |
| Focused workspace navigation check | Passed: Home destinations, mobile search, Business cards/purchases, Settings label visibility |
| Settings browser checks | Passed: 390/1440 px, both themes, four disclosures, keyboard toggling, notifications, nine destinations with Back, dark preference after reload |
| Home browser checks | Passed: 360/768/1440 px, both themes, touch targets, focus, overflow, destination navigation |
| Final Home / populated Collection check | 12/12 scenarios passed at 360/1440 px in both themes: saved theme, no overflow/errors, search + condition reset, unchanged item purposes, unassigned guidance and record navigation |
| Git diff whitespace check | Passed |
| Lint on six changed UI modules | Not clean: the current ESLint setup reports JSX references as unused, plus existing ref/effect diagnostics. Comparing non-unused diagnostics with HEAD found no added diagnostics by rule/message/count. Raw lint and comparison evidence are retained. |

Browser tests use isolated synthetic local sessions at `http://127.0.0.1:5217/`. Physical-device testing, screen-reader testing, and a complete accessibility certification were not performed. Production was not changed or reverified in this pass. The existing Account Ops/Bot operational suites were not rerun for these page-layout changes; their earlier completion reports remain the record for that work.

## Review evidence

- Current Home and Settings captures: `artifacts/qa/layout-review/` (both themes and mobile/desktop, including expanded preferences).
- Collection, Find, Business and theme/dialog captures: `artifacts/qa/semantic-theme/`.
- Full app viewport captures: `artifacts/qa/viewport-guard/` and `artifacts/qa/viewport-guard-dark/`.
- Build, regression, route, accessibility, type-check, and lint logs: `artifacts/qa/layout-*.log`.
- Settings results: `artifacts/qa/layout-review/settings-checks.json`.
- Final Home and Collection results/captures: `artifacts/qa/layout-review/home-collection-checks.json` and `collection-*.png`.
- Lint comparison: `artifacts/qa/layout-lint-comparison.json`.

Review locally with `/?betaLocalMode=true` or `/settings?betaLocalMode=true`. A separate approval is required before publication.
