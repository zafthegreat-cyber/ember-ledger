# Restock phone navigation and confirmation upgrades

October 19, 2026. Completed locally on `codex/all-bot-integration-setup`, HEAD `46e2c8de9452d212a438fdcf7deb781ff7be1e2e`. This adds to the uncommitted work recorded in `STORE_OBSERVATIONS_REPORT_DETAILS_UPGRADE_2026_10_19.md`; it does not replace that work. Nothing in this batch was committed, pushed, merged or published.

## Changes

Report details now have their own browser-history entry. Back closes the details while keeping the feed's filters and exact page URL. Forward resolves the same report against the current permitted reports before reopening it. Close and Escape consume the detail entry, so another Back reaches the previous page rather than a stale dialog entry.

Report a new visit and Add details/Edit details wait for the detail-entry traversal before invoking the existing handlers. Duplicate clicks, failed or delayed Back, changed routes and newer overlays cannot launch an expired handoff or pop a different dialog. History contains only an opaque UI token; report content and IDs are not added to history. App route handling now leaves same-location overlay entries to their owners, with suspended quick-report restoration still running first.

The administrator delete confirmation now uses the existing theme tokens, a clearly labelled destructive action, reachable header/footer and a scrolling description. Cancel receives initial focus; Tab and Shift+Tab stay in the confirmation. Escape, Cancel and the close control restore focus to the captured Delete button after the parent becomes interactive again. The parent report is inert while confirmation is open. Existing deletion permissions and the destructive handler are unchanged. Browser verification canceled every confirmation and never deleted a report.

Older reports with top-level numeric zero quantity or price now show those values in the read-only detail view. Shared normalization, editing, saved records and price calculations remain unchanged. Reports that already contain item rows retain their own item values.

## Actual verification

- `npm run build`: passed. Existing non-failing large-chunk and ineffective-dynamic-import notices remain.
- `npm run lint:src`: passed after the final source changes. The existing Babel notice for the large App file remains. There is no root frontend typecheck script; backend TypeScript was unchanged and was not checked in this batch.
- New actual-app navigation tests: 12 disposable contexts passed, covering ordinary history/handoffs and administrator cancellation at 320, 390 and 1440 pixels in light and dark themes. All 42 measured normal controls and three enlarged-text controls met the 44 pixel minimum, with no horizontal overflow. Narrow dark mode also passed 200 percent text with footer actions reachable. Keyboard containment, opener restoration, exact URL/filters, Back/Forward, Close/Escape, canceled handoffs and legacy zero values passed. Original synthetic records and the settled catalog/prices remained byte-equivalent. No external-request attempts, network-mutation attempts or page errors occurred in this matrix.
- Existing report-details browser regression: six width/theme contexts passed, including proof photos, catalog reference artwork, complete notes, date states, store-history More/View focus return, a fresh new-visit save and preservation of every old record and settled catalog price. Three existing catalog-image GET attempts per context were blocked by the loopback guard; no external requests escaped and no server writes occurred.
- Existing feed browser regression: all six width/theme contexts passed, including composed filters, pagination, readable full details, keyboard focus and unchanged records/prices.
- New history/controller and actual App route-effect checks: 27 passed. Existing App modal-history checks: 17 passed. Scout lint/state checks: 16 passed.
- Legacy-zero presentation: 11 scenarios passed. Store-observation presentation: 20 passed. Feed presentation: 30 passed.
- Existing Scout record/handler checks: 34 passed, plus records and corrupt-startup browser cases. The initial sandboxed esbuild invocation could not resolve project imports; rerunning the unchanged test with approved filesystem access passed.
- `git diff --check` and new browser-script syntax checks passed. All 14 generated catalog, price and related data files match this batch's initial SHA-256 hashes exactly.

## Boundaries and remaining limits

All browser checks used synthetic loopback contexts with non-GET and outside-origin requests blocked. No real account, cloud sync/recovery protocol, authentication, permissions, database schema, integration, price refresh, dependency or deployment configuration changed. Physical iPhone/Android testing, real-account sync and native store uploads were not performed.

Browsers that reject `history.pushState` remain a known restriction: the exception propagates before a detail frame or UI opens. The fault test confirms navigation and records remain unchanged. This is not a claim of support for history-restricted browsers. Existing unrelated Next/Continue and provider/keyboard source-test limitations remain recorded in the earlier completion report; they were not modified or disabled here.

## Evidence

- `artifacts/qa/restock-phone-navigation/final/results.json` and adjacent PNGs: all 12 final actual-app contexts, with narrow enlarged-text screenshots.
- `artifacts/qa/restock-phone-upgrade/`: final build/lint and regression logs, before/after catalog hashes and this batch's preserved prior local diff.
- `artifacts/qa/restock-phone-upgrade/details-regression/`: six detail contexts and screenshots.
- `artifacts/qa/restock-phone-upgrade/feed-regression/`: six feed contexts and screenshots.
- `scripts/test-restock-phone-navigation-browser.cjs`, `scripts/test-restock-details-history.mjs` and `scripts/test-restock-detail-items.mjs`: repeatable checks added in this batch.
