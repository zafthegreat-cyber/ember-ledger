# Restock browsing and review upgrades

October 18, 2026. Completed locally on `codex/all-bot-integration-setup`, based on `46e2c8de9452d212a438fdcf7deb781ff7be1e2e`. The preceding release is already published through main commit `0878342196caabe4a633b43b94ab0aabecaaa10f` and PR #14. This follow-up has not been committed, pushed, merged or published.

## Restock browsing

The existing reports landing now searches loaded reports by product, store, city and observation text. Stock filters distinguish stock seen, low stock and empty shelves. Time filters use the observation date rather than making an old visit appear recent because it was imported later. Any time remains the default, retaining older and unknown-date records. Future and invalid dates cannot qualify as recent observations.

Report cards show the stock label, observation time, store, products, optional observation photo and trust state with less repetition. The existing View details dialog keeps the full report and its permitted editing actions. Clear filters restores keyboard focus to search. Show more and Show fewer work on the existing permitted report collection; filtering and pagination do not fetch or modify records.

Verification labels use an explicit verified status or true boolean. The string unverified cannot become Verified through a substring match. Vendor sightings and directions to customer service alone are not classified as stock seen. Historical imports remain labelled as historical.

## Review and photo controls

The ordinary report review groups store/time, shelf status/products and sharing information. Two labelled Edit actions return directly to the relevant existing step. Selected catalog artwork remains labelled as a reference image, separate from observation proof.

The existing modal focus helper now focuses the active ordinary-report heading and resets the scroll area when a step changes. Typing does not move focus. Validation messages announce errors. Guess workflows retain their existing focus behavior and eligibility checks.

Remove photo clears only the draft photo reference and file input, allowing the same file to be selected again. It retains the product, observation time, source and note. A selection generation guard prevents a delayed replacement upload from restoring a photo after removal and ignores callbacks after the renderer unmounts. Existing private-storage uploads and stored files are unchanged.

## Verification

- Production web build and full source ESLint passed. The existing large App chunk, dynamic import and Babel size notices remain non-failing tool warnings.
- Report browser checks passed at 320, 390 and 1440 pixels in light and dark themes. They cover contextual edits, settled heading focus and scroll position, draft retention, photo removal, same-file reselection, delayed replacement cancellation, duplicate-save protection and preservation of original records and prices. Final thumbnail/caption styling was rechecked at 320 pixels in both themes and 390 pixels dark. The narrow dark check includes 200 percent text and manual-location/future-date guards.
- Feed browser checks passed at the same six width/theme contexts. They cover composed search/status/time filters, pagination, clear/reset focus, unchanged reports and prices, opening/closing full details and retained filters. The narrow dark case checks 200 percent text using text scaling only. Visible controls meet the 44 pixel minimum, with no horizontal overflow or browser errors.
- Existing store presentation passed at 360 and 1440 pixels in both themes, including More/View/Close, visible focus, contrast and unchanged records.
- Existing Scout record checks passed all 34 cases and the records/corrupt-boot browser cases. Scout lint/state regressions passed all 16 cases. Report save-flow, date/backfill, Quick Add routing and all 16 adaptive-page checks passed. The new pure feed presentation regressions passed all 30 checks, including legacy catalog-snapshot names. Existing Restocks entry, refresh, Add details and Back checks passed at 320 pixels dark, 390 pixels dark and 1440 pixels light; their selectors follow the new cards and retain their navigation/data-preservation assertions.
- All 14 generated catalog files match the pre-upgrade SHA-256 hashes exactly. No production records, database schema, authentication, permissions, recovery protocol or deployment configuration were changed.

Browser checks use disposable loopback contexts with synthetic data. Server mutations and outside-origin requests are blocked. No real sign-in, account sync, physical phone or store package was tested in this follow-up. No root frontend typecheck or generic test script exists; the available source lint, build and relevant regression commands were used.

The older `test:scout-store-handoff` browser script still expects a Next button while the already-published ordinary report uses Continue; its four cases fail that stale assertion with zero page errors. Evidence is in `artifacts/qa/release-readiness/scout-store-handoff/results.json`. The unrelated older keyboard/provider-label source assertions remain documented in the preceding release preflight. These assertions were not weakened to make this upgrade pass.

## Evidence

- `artifacts/qa/restock-review-upgrade/`: build/lint logs, before/after catalog hashes, existing record/store results, six-context report results and final phone checks.
- `artifacts/qa/restock-feed-upgrade/`: feed browser results and mobile/desktop screenshots.
- `scripts/test-restock-report-browser.cjs`, `scripts/test-restock-feed-browser.cjs` and `scripts/test-restock-feed-presentation.mjs`: repeatable synthetic regressions.

The previous publication record is `artifacts/qa/publish-2026-10-18/publication.json`. Native beta enrollment, signing, physical-device acceptance and production privacy-service rollout remain separate work described in `docs/mobile-beta/READINESS.md`.
