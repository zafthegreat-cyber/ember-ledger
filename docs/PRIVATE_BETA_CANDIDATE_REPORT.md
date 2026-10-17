# Code 3 TCG local private-beta candidate

September 23, 2026. This is the next completed local batch after [RELIABILITY_RETURNS_LOCAL_REPORT.md](./RELIABILITY_RETURNS_LOCAL_REPORT.md): reviewed return corrections, initial-load improvement and private-beta acceptance. The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`; earlier reports associate this work with `ui-104-final-product-ui-2`. Existing uncommitted work was preserved. Nothing was committed, pushed, merged or deployed.

## Delivered

1. **Correct or reverse an applied return.** Open its sale → Inspected return → Review stock & refund → Correct applied return or Reverse applied return. Review the before/change/after amounts and confirm explicitly. Each correction appends a reason, reference and exact unit/cost effects; the original sale, acquisition and closed inspection remain unchanged. Increasing restocked quantity requires a fresh physical inspection. Stock removal is blocked for resold units, later-return stock, active reservations, binder assignments and active grading. Refund-only corrections remain possible after resale. Reports, CSV and Accountant Review include the signed corrections once. This records manual money handling; it does not send or recover money.
2. **Smaller initial app load.** Nine inactive renderers now load when needed. State, handlers, route gates, saved drafts and Back behavior remain in their existing owners. Delayed forms retain keyboard focus correctly. The App file is **11.73% smaller**; total initial production JavaScript transfer is **6.44% smaller**. Measured function parsing fell **8.96%** in five cold Chromium runs. Those timings use simulated CPU/network conditions on a shared machine and are not a physical-device guarantee. The App still exceeds the build's 500 kB warning threshold.
3. **A bounded private-beta candidate and acceptance matrix.** New browser journeys start with empty data and use the actual Collection and resale forms through organization, wishlist, sale, shipment, inspected return, reload, search, Back and report export. Production assets, login and protected-route denial are checked separately because production correctly disallows the development owner shortcut. [PRIVATE_BETA_ACCEPTANCE.md](./PRIVATE_BETA_ACCEPTANCE.md) identifies the manual beta scope and remaining hosted gates.

The complete journey exposed a real integration defect: the ordinary Inventory form saves whole quantities as strings, which the earlier return ledger rejected. Strict whole-number parsing now supports those existing records without rewriting their original data. Independent review also found that imported correction timestamps could go backward relative to earlier corrections. The saved-history validator now rejects that sequence, and permanent regressions cover both fixes.

Schema **8** preserves correction lineage. Backups validate that history and retain support for older source versions. Canonical migration remains blocked where a lossless history mapping has not been approved; no real data migration was attempted. Acquisition quantity/cost/provenance corrections after an applied customer return still require a separate return-aware workflow, including when that return has subsequently been reversed.

## Verification

Evidence is under [`artifacts/qa/private-beta-candidate`](../artifacts/qa/private-beta-candidate/). Final combined results are in `verification-final`; earlier failed probes remain investigation evidence, not final passes.

| Check | Actual result |
| --- | --- |
| Final production build | Passed. Main App approximately **1,919.28 kB / 509.47 kB Vite gzip**; large-chunk warning remains. |
| Complete source lint / lint configuration | Passed: **331 files, 0 errors, 0 warnings**. |
| Backend TypeScript | Passed. Frontend is JavaScript and has no separate configured type-check script. |
| Return correction domain | **26/26 passed**, including **180** deterministic ordinary/managed stock and exact-cost conservation checkpoints. |
| Existing inspected-return domain | **29/29 passed**. Existing manual lifecycle and FlipScout tests passed. |
| Purchase/Receiving, Inventory Creation/Correction/Reconciliation, Accountant Review | **29/29 existing Node scripts passed**. |
| Return UI lifetime and authorization | Original **50/50**, new correction **42/42**, normal React and StrictMode. |
| Return workflows | Original **4/4** and correction **4/4**, 360/1440px in both themes. Includes cancel, keyboard confirmation, retained history, reload, exact report totals, resale and blocked unsafe reversal. |
| New collector/seller acceptance | **4/4**, empty-data intake through complete local journeys; independent fresh-page read verifies saved records. |
| Built production smoke | **4/4**, actual assets/login and denied private owner route, including attempted beta-query spoof. No production authorization bypass. |
| Deferred-view behavior | **121 checks passed**: 32 viewport/theme/form checks, 4 delayed-modal lifetime cases, 17 history, 28 React lifecycle and 40 async-data lifecycle. |
| Source preservation | Nine extracted JSX bodies unchanged; 1,325 remaining functions and 831 hook expressions unchanged. One focus effect delegates to the tested deferred-modal helper. |
| Backup, restore preview, migration preview/readiness, local persistence | Passed. No owner restore or cutover performed. |
| Owner/release security and private file/session contracts | **60/60** and **46/46 passed** with local fixtures. This is not proof that hosted services are activated. |
| Independent accounting review | Six scenarios passed, including exact pennies, reversal/reapply/resale/later return, idempotency and saved chronology tampering. |
| Broad existing browser regression and semantic theme suite | **28/28 regression scenarios** and **30/30 theme/viewport/route checks passed**; keyboard/reduced-motion contract passed. |

Detailed evidence: [return domain](../artifacts/qa/private-beta-candidate/return-corrections/REPORT.md), [performance](../artifacts/qa/private-beta-candidate/performance/REPORT.md), [journeys and readiness](../artifacts/qa/private-beta-candidate/acceptance/REPORT.md), [final checks](../artifacts/qa/private-beta-candidate/verification-final/), [broad checks](../artifacts/qa/private-beta-candidate/verification/).

## Remaining launch gates

This completes the requested local work; it does **not** make the whole product or hosted beta 100% complete. Before inviting users, demonstrate real hosted sign-in and role isolation, select and verify storage/recovery authority, complete or explicitly exclude inactive services and integrations, and test physical devices and assistive technology. Provider execution, payment settlement, durable notification delivery, whole-app recovery and real owner-data cutover remain outside this local proof. The September 15 hosted audit is historical evidence, not a current live check.

No deployment settings, authentication policy, provider activation or remote-execution safeguards were changed. Local developer preview: `http://127.0.0.1:5217/?betaLocalMode=true`. Built signed-out preview: `http://127.0.0.1:5218/`.

## Screenshots

- [Mobile light correction preview](../artifacts/qa/private-beta-candidate/correction-browser/correction-preview-light-360.png)
- [Desktop dark correction history](../artifacts/qa/private-beta-candidate/correction-browser/correction-history-dark-1440.png)
- [Mobile dark blocked reversal after resale](../artifacts/qa/private-beta-candidate/correction-browser/resold-reversal-blocked-dark-360.png)
- [Desktop light corrected report](../artifacts/qa/private-beta-candidate/correction-browser/corrected-report-after-resale-light-1440.png)

The [final runtime/build-input manifest](../artifacts/qa/private-beta-candidate/source-final.json) covers **511 files**, SHA-256 `8b78f33796241546afc95163f95f06ed8f3d4098e7c8a0db83baaef3a07110fb`, unchanged through final build/domain/return checks. The [combined verification record](../artifacts/qa/private-beta-candidate/verification.json) identifies the result files. This includes inherited work and is not an authorship or deployment claim. The final manifest also covers the real `eslint.config.mjs`; the earlier baseline capture only named the unused `.js` path. This coverage addition is not a runtime change.
