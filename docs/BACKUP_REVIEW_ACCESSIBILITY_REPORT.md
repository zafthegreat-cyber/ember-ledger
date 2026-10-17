# Code 3 TCG backup review and keyboard accessibility

Completed September 23, 2026, America/New_York (final automated checks timestamped September 24 UTC). This is the next completed local batch after [PRIVATE_BETA_CANDIDATE_REPORT.md](./PRIVATE_BETA_CANDIDATE_REPORT.md). The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`; earlier completion reports associate it with `ui-104-final-product-ui-2`. Existing uncommitted work was preserved. Nothing was committed, pushed, merged or deployed.

## Delivered

1. **Readable Data & Backup findings.** Restore preview now shows affected records, paths, references and reasons instead of only problem counts. Source coverage is grouped in expandable sections. Duplicate aliases are included alongside the other existing validation categories. The local file chooser is removed from the tab sequence, and completed previews receive focus when appropriate without taking it from another control.
2. **Diagnostic review downloads.** Restore preview, migration preview and migration rehearsal each offer a bounded JSON review report. Reports retain useful finding metadata and exact minor-unit totals, with truncation indicated. They exclude raw source records, executable migration actions and unknown nested payloads. Reports can contain private identifiers or paths; they are neither backups nor restore/migration approvals.
3. **Separate migration results.** Preview and rehearsal have independent timestamps and statuses; an unrun check says so. An unavailable canonical server remains visibly blocked even when the validation blocker count is zero. Rehearsals expose warnings, conflicts, skipped actions and exact before/after count and currency changes. Huge aggregate amounts and zero-decimal currencies retain their precision. Duplicate requests and obsolete asynchronous results cannot replace current review state.
4. **More reliable form and return keyboard use.** Shared fields have explicit accessible labels and associated help/error descriptions. Required semantics preserve the existing validation flow. Return review, corrections, errors, edit, cancel and apply transitions maintain useful keyboard focus, including delayed results and React StrictMode.

The existing graphite/teal semantic theme is reused in both modes. Authentication, permissions, business rules, restore/migration activation, remote-execution safeguards, integrations and deployment settings were not changed.

Independent review found two issues before final verification: object-valued display metadata in an uploaded backup could crash React, and the preview report needed the actual nested migration plan hash. Primitive-only display formatting, array guards and a validated hash projection now cover those cases; no raw plan is exported.

## Actual verification

The [combined verification record](../artifacts/qa/backup-review-accessibility/verification.json) links the result files. Browser runs use disposable synthetic data with external requests and writes blocked where appropriate. Collector/seller journeys intentionally save only into their disposable local contexts.

| Check | Result |
| --- | --- |
| Production frontend build | Passed. Main App **1,919.28 kB / 509.45 kB gzip**; existing large-chunk warning remains. |
| Complete source lint and lint-configuration test | **333 files, 0 errors, 0 warnings**; configuration test passed. |
| Backend TypeScript | Passed. Frontend is JavaScript and has no separate configured type-check script. |
| Backup finding/report projection | **10/10** checks, including actual validator output, bounded metadata, malicious object labels, exact totals and exclusion of unknown payloads. |
| Whole-app backup review | **4/4** contexts: light/dark at 360/1440 px. Actual files, findings, keyboard focus, report download, replacement/corrupt previews, object-valued metadata, 44 px targets, no horizontal overflow, no page errors and no saved-data changes after normal startup. |
| Migration readiness review | **49/49**: 45 presentation/lifetime/exact-money checks plus four actual-domain browser contexts in both themes and sizes. Includes unavailable-server blocking and zero storage writes after fixture setup. |
| Shared form/return accessibility | **88/88** checks across eight theme/size/normal-React/StrictMode combinations. |
| Return component lifetimes | Original **50/50** and correction **42/42** passed. |
| Actual return correction journeys | **4/4**, both themes and representative phone/desktop sizes. |
| Collector/seller acceptance journeys | **4/4**, actual forms from empty data through saved records, organization, sale, shipment, return, report, reload and Back. |
| Existing backup, restore preview, migration preview/readiness | All four Node suites passed. |
| Reviewed boundaries and keyboard contract | Both existing Node suites passed. |
| Return correction domain | **26/26**, including **180** stock and exact-cost conservation checkpoints. |
| Broad browser regression | **28/28** scenarios passed. |
| Semantic theme/viewport/routes | **30/30** checks passed, including saved preferences, semantic contrast, primary actions, dialogs and overflow at 360/390/1440 px. |
| Whitespace | `git diff --check` passed. |

Source and build inputs were frozen before the combined run and unchanged afterward. The [final manifest](../artifacts/qa/backup-review-accessibility/source-final.json) covers **514 files**, SHA-256 `35b016c6dc6ad8b7aadc2b64fdad835381587fe9eddfdc891e1ccf91d9a8fcb1`. The starting manifest exactly matched the previous candidate's 511-file final digest. This records the complete inherited checkout, not exclusive authorship of every file.

## Screenshots and review

- [Mobile light restore findings](../artifacts/qa/backup-review-accessibility/backup-browser/restore-findings-light-360.png)
- [Desktop dark restore findings](../artifacts/qa/backup-review-accessibility/backup-browser/restore-findings-dark-1440.png)
- [Desktop dark blocked migration rehearsal](../artifacts/qa/backup-review-accessibility/migration/blocked-dark-1440.png)
- [Mobile light completed rehearsal](../artifacts/qa/backup-review-accessibility/migration/rehearsed-light-360.png)
- [Mobile light return keyboard review](../artifacts/qa/backup-review-accessibility/return-accessibility/light-360-normal-review.png)
- [Desktop dark return keyboard review](../artifacts/qa/backup-review-accessibility/return-accessibility/dark-1440-strict-review.png)

Representative screenshots were visually reviewed. Local Data & Backup: `http://127.0.0.1:5217/owner-center/controls/data-backup?betaLocalMode=true`.

## Evidence corrections and limits

An initial backup-browser probe captured storage before the app's existing delayed startup preference save, producing a false failure. The harness now waits for that normal startup save before comparing storage; subsequent passes still require no changes during review. The earlier failure screenshot remains investigation evidence, not a final result.

During delegated verification, an existing Record Search script was mistakenly rerun before inspecting its fixed output directory. It overwrote five historical evidence files in `artifacts/qa/next-ten/record-search-review` (the results JSON and four screenshots). Their previous contents were not recovered. The directory now has a [superseded-evidence notice](../artifacts/qa/next-ten/record-search-review/SUPERSEDED-EVIDENCE.md); copies of the new passing rerun are in this batch's `migration/record-search-rerun/`. Do not pair those overwritten files with an older completion claim. Details are in the [migration review report](../artifacts/qa/backup-review-accessibility/migration/REPORT.md).

This batch does not establish whole-app accessibility or hosted launch readiness. Physical devices and screen readers were not tested. A source review identified existing workspace tabs that still need the complete tab keyboard pattern; they remain keyboard-reachable buttons, and that separate improvement was not included here. This batch did not rerun the previous candidate's built signed-out production acceptance tests; those remain dated prior evidence.

The [private-beta acceptance matrix](./PRIVATE_BETA_ACCEPTANCE.md) still governs remaining launch gates: current hosted sign-in and role isolation, storage/recovery authority, explicit activation or exclusion of inactive services, and physical-device/assistive-technology acceptance. Whole-app recovery, real data cutover, provider execution, payment settlement and durable notification delivery remain unverified here. The application is not claimed to be 100% production complete.
