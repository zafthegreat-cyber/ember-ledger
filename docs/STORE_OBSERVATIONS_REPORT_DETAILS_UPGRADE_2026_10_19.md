# Store observations and report details upgrades

October 19, 2026. Completed locally on `codex/all-bot-integration-setup`, adding to the uncommitted upgrades recorded in `docs/RESTOCK_BROWSING_REVIEW_UPGRADE_2026_10_18.md`. HEAD remains `46e2c8de9452d212a438fdcf7deb781ff7be1e2e`. These changes have not been committed, pushed, merged or published; the previous production release remains main commit `0878342196caabe4a633b43b94ab0aabecaaa10f`.

## Store pages

Everyday store actions now come before technical metrics. Watch exposes its current pressed state. Store information retains the four existing metrics and correction action in a disclosure; the saved restock date is labelled as saved metadata.

A new observation summary reads only the existing permitted reports for the selected exact store ID. It chooses the latest dated past observation, independent of later upload dates. Historical imports, future-only reports, missing dates and empty stores have distinct, truthful states. Product names and a View report action help collectors inspect the source without implying guaranteed current inventory. Separate stores at the same address keep their own reports.

## Full report details

The detail dialog has a concise stock/time/trust summary and an open product section instead of repeating a full feed card. All normalized meaningful product rows, item notes, top-level report notes and explicitly saved proof notes remain available. Array-item numeric zero quantities and prices and nonnumeric reported prices remain visible. Existing catalog reference artwork is labelled separately from observation proof, including compatible top-level saved image references. Raw import/planning source text is not newly exposed.

The photo gallery initially shows four photos and can expand to every saved observation photo. Image errors retain the saved reference and offer retry. Header and footer stay reachable while the body scrolls. Keyboard focus starts on Close, stays inside the ordinary detail dialog, and returns to its launching View details, View report or persistent More action after Close or Escape. The page scroll lock is restored on dismissal.

Report a new visit is available only when the report resolves to an existing eligible exact store and the existing quick-report handler is supplied. It opens that handler with the store and default report type, without copying the old observation time, products, notes, photos or confidence. Existing Add details/Edit details and administrator deletion authority remain with the original handlers.

## Verification

- Production web build and full source ESLint passed. Existing non-failing large-chunk, dynamic-import and Babel size notices remain.
- The actual report-details flow passed at 320, 390 and 1440 pixels in light and dark themes. All 117 measured controls met the 44 pixel minimum; page, dialog and body had no horizontal overflow. The narrow dark case also passed 200 percent text with the expanded-gallery action reachable between the fixed header and footer.
- Detail checks cover keyboard containment, Escape and opener focus restoration, body scroll lock and shared-report handoff, six proof photos, separate catalog art, item/report/proof notes, future/invalid dates, unknown-store restrictions and a fresh new-visit save. Every old record, the fully settled local catalog and its fixture market price remained unchanged; saving created only the new synthetic report.
- Store-summary checks passed five states across three contexts: 320 pixels light, 390 pixels dark and 1440 pixels dark. They cover exact IDs, latest observation versus late upload, historical/future/unknown/empty states, keyboard return, touch targets, overflow and unchanged records/prices. There were no external or mutation attempts or page errors in these fixtures.
- The existing feed regression passed all six width/theme contexts, retaining composed filters, pagination, full details and saved records/prices. Its fixture now waits for existing catalog hydration before taking the exact preservation baseline and marks its custom catalog entry as manual; preservation assertions remain intact.
- Existing store presentation passed at 360 and 1440 pixels in both themes. Its disclosure assertion now checks the intentionally open Details section and tests both keyboard collapse and expansion.
- Existing Scout record/handler checks passed all 34 cases plus records/corrupt-boot browser cases. Scout lint/state checks passed all 16 cases. New observation helpers passed 20 checks; feed helpers passed 30. Report save-flow and visit-date/backfill checks passed. Syntax and `git diff --check` passed.
- All 14 generated catalog files match the pre-upgrade SHA-256 hashes exactly. No real account, production record, cloud saving/recovery protocol, authentication, permission, schema, price refresh, dependency or deployment configuration was changed.

Browser tests used disposable loopback contexts, synthetic data and blocked non-GET/outside-origin requests. The detail matrix recorded three blocked existing catalog-image GET attempts per context; no external traffic or server writes escaped the guard. Physical phones, real-account visibility/sync and native store packages were not tested or updated.

## Known limits

The existing child detail dialog has no separate browser-history entry; browser Back retains its previous navigation behavior. The older administrator-only nested delete-confirmation focus behavior and legacy top-level numeric-zero normalization were left unchanged. These are not claims that every dialog or legacy normalization path is complete. The older Next/Continue handoff assertion and unrelated provider/keyboard source assertions remain documented in the preceding local report and release preflight. No root frontend typecheck or generic test script exists.

## Evidence

- `artifacts/qa/restock-store-details-upgrade/`: final build/lint logs, existing store/record checks, prior local patch, before/after catalog hashes and completion record.
- `artifacts/qa/restock-details-upgrade/final/`: six detail contexts and screenshots, including narrow dark text scaling.
- `artifacts/qa/restock-store-details-upgrade/store-observations/`: fifteen summary states and screenshots.
- `artifacts/qa/restock-store-details-upgrade/feed-regression-final/`: six passing feed contexts.
- `scripts/test-restock-details-browser.cjs`, `scripts/test-store-observation-browser.cjs` and `scripts/test-store-observation-presentation.mjs`: repeatable new checks.
