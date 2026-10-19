# Collection portfolio upgrade

October 19, 2026. Implemented locally on `codex/all-bot-integration-setup`, HEAD `11f58ad3378c0d065f939372bfaa1e686dfd979c`. The preceding release is already published through main `78f16b02097db0b47a79dcea31aff7001b7bce45` and PR #15. This portfolio follow-up has not been committed, pushed, merged or deployed.

## User experience

The ordinary `/collection` page now uses the reference screenshots as direction for its portfolio overview, large value display, value hiding, Overview/Performance controls, Most valuable list, artwork grid/list and bottom-sheet portfolio chooser. Existing Code 3 TCG semantic light/dark colors, navigation and real artwork resolution are retained. This does not copy the reference application's branding or add a new workspace.

All portfolios shows each permitted personal-collection record once. Main contains items not organized into a custom portfolio. Users can create and rename portfolios, organize existing items, mark favorites, reorder custom portfolios and remove a custom portfolio after confirmation. Removing one keeps original items and returns their organization to Main; the confirmation explicitly identifies the custom portfolio's saved snapshots that will also be removed. Main itself cannot be removed. The selected portfolio survives reload.

Search and condition filters affect the displayed items, not the whole portfolio total or ranking. Grid/List, period, sort and hidden-value presentation survive the existing full-record Back action during the session. Cards and ranked rows open the same existing full records. Add Item, editing, item purpose, managed-inventory restrictions, Sets & Binders, Wishlist, Grading and unassigned review retain their existing handlers.

## Values and history

The new summary is quantity-aware. It distinguishes saved market estimates from projected estimates, preserves explicit zero values, counts missing coverage and never substitutes purchase costs or catalog-match prices for missing saved prices. This corrects the old collection summary's once-per-row projection sum without changing any stored price, cost or business calculation.

There was no aggregate portfolio history to reuse. Charts therefore use only real, explicitly saved, dated value snapshots. The first snapshot does not create a past curve. The 1D/7D/1M/3M/6M/MAX controls filter those snapshots; missing, invalid, future and unpriced nonempty snapshots cannot become invented historical values. A readable table accompanies the chart. Changes are labelled as changes in saved collection value, including additions/removals and estimate changes, not investment returns.

Hide values removes monetary text from the collection UI, chart description/table, change display and exported CSV value columns. Opening a full item deliberately retains that existing record page's details. CSV exports contain only presentation fields and neutralize spreadsheet formula prefixes. Performance and Export continue through the existing plan restrictions; the implementation adds no entitlement bypass.

## Persistence boundaries

Named-portfolio organization, selection, favorites and snapshots are new device-local presentation metadata, scoped by account and active workspace under `code3-collection-portfolios-v1:`. Membership references original record origin and ID. No records are duplicated, moved to another purpose or assigned to physical binder slots.

This metadata is not added to cloud synchronization or the existing backup schema. It currently stays on the device/browser where it was saved. Existing collection items keep their original saving, backup and sync behavior. No claim is made that portfolio organization or snapshot history follows users between phone and computer.

Loading preferences performs no write. Malformed/unsupported saved copies are preserved and block replacement until readable; quota/read/verification errors surface in the active dialog or page. Writes detect stale tab revisions, verify the saved bytes and avoid rolling back another writer's copy. The existing history controller accepts an isolated optional token key for portfolio dialogs, retaining its original report key and behavior.

## Actual checks

- Production web build and full source ESLint passed. Existing non-failing large-chunk/dynamic-import and Babel notices remain. No frontend typecheck script exists; unchanged backend TypeScript was not rebuilt.
- Thirty model/storage/valuation/history/CSV scenarios passed, including frozen original records, zero/missing values, quantity, overflow, account/workspace isolation, malformed data, denied reads, quota, stale tabs and verified-write rollback.
- Twenty-nine report/overlay/App-history cases passed, including two new independent history-key cases. Existing seventeen App modal-history cases passed.
- Actual app browser checks passed all six 320/390/1440 pixel light/dark contexts. All 332 measured visible controls met the 44 pixel minimum. No page or portfolio horizontal overflow occurred, including both 320 pixel themes at 200 percent text.
- Those checks cover totals independent of search/filter, Grid/List, full-record Back, Most valuable, complete portfolio organization/reload flows, real current snapshots and all periods, chart table, shown/hidden CSV, More-menu layout and chooser Back/Forward/Escape/focus.
- Three additional browser guards passed: the existing administrator regular Free-plan preview denied Performance and Export, corrupted preference bytes stayed intact, and a metadata-only quota failure showed an error while keeping the draft and original records. Ordinary beta mode intentionally grants paid tools under the existing policy; these are not production billing/account tests.
- Upfront and post-interaction assertions preserved original legacy/repository items, sale, canonical expense and settled local catalog values. The 37.25 fixture price remained unchanged. External and network-write attempts and uncaught errors were zero; the local Vite development WebSocket was blocked.
- Existing photo/detail/Back regression passed eight contexts across Collection and both inventory sources, preserving personal/private-compatible/snake-case/catalog image references and every original record. Its selectors now target the new collection grid while retaining the original assertions.
- Existing collector/seller/store workspace experience regression passed three viewport/theme contexts. Its collection selector now distinguishes the grid card from the new ranked row, and its isolated fixture supplies a portfolio scope. Initial sandboxed esbuild could not resolve imports; the unchanged regression passed with approved filesystem access.
- Existing inventory valuation and Vault workflow checks passed. New scripts passed syntax checks and `git diff --check` passed. All fourteen generated catalog/price files match the initial hashes; generated files, backend, database, authentication, cloud sync, dependencies and deployment settings were not changed.

All UI checks used disposable synthetic contexts. Real production accounts, physical phones and cross-device metadata were not tested. Native distribution packages were not built or uploaded for this local follow-up. Market-mover feeds, a new trade engine and arbitrary bulk item mutations are not implied by this portfolio interface.

## Evidence

- `artifacts/qa/collection-portfolio-browser/final/results.json` and adjacent screenshots: final six actual-app contexts and three guards.
- `artifacts/qa/collection-portfolio-upgrade/`: build/lint, model/history, valuation/workflow and existing browser regression logs; before/after catalog hashes and completion record.
- `scripts/test-collection-portfolio-browser.cjs` and `scripts/test-collection-portfolio.mjs`: repeatable new checks.
- The final 390 pixel dark Overview and chooser screenshots are synthetic UI previews, not screenshots of the user's real holdings.
