# Code 3 TCG workspace keyboard navigation

September 23, 2026, America/New_York (verification timestamps use September 24 UTC). This local batch follows [BACKUP_REVIEW_ACCESSIBILITY_REPORT.md](./BACKUP_REVIEW_ACCESSIBILITY_REPORT.md). The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`, associated with `origin/ui-104-final-product-ui-2`. Existing uncommitted work was preserved. No commit, push, merge or deployment was performed.

## Delivered

- **Business → Money supports manual keyboard tabs.** Left/Right wrap between Expenses, Mileage and Reports; Home/End reach the first/last tab. Enter, Space or a click opens the chosen section. Arrow browsing does not change the route or add history entries. Leaving and returning to the tab row starts at the selected tab.
- **Tabs and content have reciprocal accessible labels.** Inactive panels remain hidden without mounting their contents. Reconciliation stays in More with its own named region and a reachable Expenses tab. Reports and the channel/booth statement now appear together beneath the Money heading and navigation.
- **Focus stays useful.** The app's route-focus effect preserves a selected Money tab after activation, while Back and Forward retain their existing page-navigation handling. Visible focus uses the existing semantic theme token; controls retain 44 px targets.
- **More menus close reliably.** A desktop browser test found that the open menu could cover Add Expense after switching sections. The shared Money/Collection disclosure now closes on selection, Escape, or focus leaving. Escape returns focus to its summary.

Authentication, permissions, business calculations, saved-data models, integrations, deployment settings and remote-execution safeguards were not changed. The only runtime/build-input changes from the previous batch are `package.json`, `src/App.jsx`, the new `src/components/operations/WorkspaceTabs.jsx`, `src/pages/EverydayWorkspaces.jsx` and its stylesheet.

## Verification

Final evidence is under [`artifacts/qa/workspace-keyboard`](../artifacts/qa/workspace-keyboard/). The [combined verification record](../artifacts/qa/workspace-keyboard/verification.json) identifies the checked source and individual results.

| Check | Actual result |
| --- | --- |
| Production build | Passed. Main App **1,919.42 kB / 509.52 kB gzip**. Existing large-chunk warning remains. |
| Source lint and lint configuration | **334 files, 0 errors, 0 warnings**; configuration test passed. Modified/new test scripts also lint cleanly. |
| Backend TypeScript | Passed. Frontend is JavaScript with no separate configured type-check script. |
| New actual-app keyboard journeys | **4/4 contexts**, light/dark at 360/1440 px, seven behavior groups each. |
| Keyboard journey details | Arrow wrap/Home/End, manual activation, selected-tab re-entry, no arrow-created history, focus retention, Back/Forward, linked panels, report placement, More Escape/closure, Reconciliation fallback, no overflow and 44 px targets. |
| Draft and shared-menu regression | Actual expense draft survives declined discard and reload; confirmed discard clears the draft. Collection More preserves search on Back. Saved business/collection records stay unchanged in these disposable contexts; zero page/React errors. |
| Full collector/seller journeys | **4/4**, actual forms through organization, sale, shipment, return, report, saved-state reload and Back. |
| App modal history | **17/17** checks passed. |
| Workspace source contracts | **87 assertions** passed. |
| Route-loading contracts | **32/32** passed. |
| Accessibility and menu/full-page route contracts | Both passed. |
| Broad browser regression | **28/28** scenarios passed. |
| Semantic themes | **30/30** theme/viewport/route checks passed, including saved preferences, contrast, primary actions, dialogs and overflow. |
| Whitespace | `git diff --check` passed. |

The browser tests use disposable synthetic data, block nonlocal/non-GET network requests, and never operate a real owner account. Independent source review found and verified the selected-tab re-entry fix. Representative screenshots were visually reviewed.

The source was frozen before final checks. The [final manifest](../artifacts/qa/workspace-keyboard/source-final.json) covers **515 files**, SHA-256 `33fc7c259112c7b32db0f03e5ac4bad677f45605462451ceae00fc9c2d22c24a`. The starting manifest matched the previous batch's final digest. This identifies the inherited local checkout, not authorship of all its contents or a deployed release.

## Screenshots

- [Desktop light selected tab and keyboard focus](../artifacts/qa/workspace-keyboard/browser-complete/money-keyboard-focus-light-1440.png)
- [Mobile dark Reports panel](../artifacts/qa/workspace-keyboard/browser-complete/money-reports-dark-360.png)
- [Desktop dark Reconciliation](../artifacts/qa/workspace-keyboard/browser-complete/money-reconciliation-dark-1440.png)
- [Mobile light preserved expense draft](../artifacts/qa/workspace-keyboard/browser-complete/money-preserved-draft-light-360.png)
- [Mobile dark Collection search after Back](../artifacts/qa/workspace-keyboard/browser-complete/collection-more-preserved-search-dark-360.png)

Local review URL: `http://127.0.0.1:5217/business/money/expenses?betaLocalMode=true`.

## Probe corrections and remaining limits

The first browser probe used an overly strict label locator that did not account for the visible required marker. Its evidence remains in `browser/`. The next probe exposed the real desktop More-menu overlap; that evidence remains in `browser-final/`. `browser-complete/` is the final passing keyboard run. No historical evidence directory was overwritten in this batch.

The accessibility source check was updated to follow the extracted tab component. Two older source-contract failures were caused by searching only `App.jsx` for JSX moved into lazy components in an earlier batch. Route-loading and menu tests now use the existing helper that follows mounted deferred components, preserving their assertions. The initial suspicion about a retired heading was incorrect.

This is not whole-app accessibility certification. Similar pre-existing tab patterns in Owner Center, Business Compliance and legacy/demo surfaces were not changed. Physical devices, other browser engines and screen readers remain unverified. No fresh hosted authorization or recovery proof was attempted. The [private-beta acceptance matrix](./PRIVATE_BETA_ACCEPTANCE.md) still governs hosted identity, storage/recovery, inactive-service scope and device/support launch gates.
