# Account Ops reliability, admin activity, and inspected returns

September 23, 2026. This completes the local batch requested as “Do 1–3,” following [NEXT_TEN_LOCAL_REPORT.md](./NEXT_TEN_LOCAL_REPORT.md). The checkout remains detached at `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`; earlier reports associate it with `ui-104-final-product-ui-2`. Existing uncommitted work was preserved. Changes remain local for review.

## Delivered

1. **Account Ops across tabs.** Open pages refresh after another tab saves, archives, removes or clears records. Open drafts retain their values and original revision; stale edits are rejected instead of overwriting newer data. Absent storage no longer resurrects cached records. Recovery and session restrictions remain enforced. Generated internal IDs also avoid false credential-scanner matches without weakening scanner policy or changing existing IDs.
2. **Beta Users activity regression.** Successful Collection and resale additions use the existing activity service after the primary save returns a record ID. Failed saves, edits, quantity merges, skipped imports, guest/local preview paths and expired sessions do not emit create activity. Tests execute the actual handlers and adapter with synthetic responses. Telemetry stays best effort and does not change save success.
3. **Inspected return → refund record → stock → resale.** Receive and inspect an existing sale return, review its quantities and exact amounts, then explicitly apply it. One saved update closes the inspection and records its manual refund and stock effects together. Original acquisition quantities, unit costs, provenance and sale amounts remain historical facts. Restocked units retain their exact cost when resold. Reports, CSV statements and Accountant Review use the applied adjustments once.

The return review uses the existing light/dark theme, shared record components, keyboard focus and mobile layouts. Applied records expose their saved history instead of an unusable Edit action. Sale details show current net proceeds and profit, leave ROI blank when no cost remains, and preserve date-only sale dates in the local calendar. Business Inventory shows remaining cost after returned units are resold.

## Verification and evidence

Current evidence lives under [`artifacts/qa/reliability-returns`](../artifacts/qa/reliability-returns/). Earlier failed probes are retained as investigation history; they are not counted as final passes.

The [combined verification record](../artifacts/qa/reliability-returns/verification.json) identifies the final candidate. Its [runtime/build-input manifest](../artifacts/qa/reliability-returns/source-final.json) covers **495 files**, SHA-256 `26662a6bd52b45cb66000c95228f8dbd4b5485ef5378bd2c1b4f84838a90822e`. It includes inherited work and is not an authorship or deployment claim. After complete-source lint, two small JSX presentation fixes removed a cramped redundant badge and invalid nested paragraphs in the recovery message; both affected components passed scoped lint and their browser checks again. The final build and Account Ops native rerun used an unchanged candidate. [Return closing checks](../artifacts/qa/reliability-returns/verification/closing-results.json), [final build/lint/native checks](../artifacts/qa/reliability-returns/verification/markup-results.json).

| Check | Result |
| --- | --- |
| Production build, complete-source lint, lint configuration, backend TypeScript | **Passed; 316 source files, 0 lint errors / 0 warnings.** See [build checks](../artifacts/qa/reliability-returns/verification/build-results.json). Frontend is JavaScript; no separate frontend type-check script is configured. |
| Broad existing browser regression | **28/28 passed**. |
| Existing theme checks | **30/30 passed**, light/dark at 360/390/1440px; contrast, saved preference, primary controls, overflow and dialogs. Keyboard/reduced-motion contracts passed. |
| Return workflow browser | **4/4 contexts passed**, 360/1440px in both themes: receipt/inspection, zero-write preview cancellation, keyboard confirmation, application, reload, report CSV and resale. |
| Existing manual-workflow browser | **4/4 contexts passed** across binder, wishlist, grading, event/visit, storage, shipment and channel report workflows. |
| Return component/session lifecycle | **50/50 passed** in normal React and StrictMode: duplicate clicks, cancel, rejected stale reviews, record changes, revoked owner access, identity changes and unmount. |
| Successful-create activity | **37/37 passed**; original Beta Users activity/role/privacy contract also passed. |
| Return domain | **29/29 passed**, including ordinary and managed inventory, partial/disposal/refund-only cases, exact pennies, return/resale/return, stale previews, denied owner access, failed or ambiguous writes, tampering, backups, currency and supported money bounds. |
| Existing Inventory Creation/Correction/Reconciliation/Accountant Review | **23/23 Node suites passed**. Existing manual lifecycle **34/34** and FlipScout checks passed. |
| Final Purchase/Inventory/Accounting compatibility rerun | **29/29 suites passed**, including all six Purchase/Receiving suites. [Final results](../artifacts/qa/reliability-returns/verification/inventory-results.json). |
| Independent review | Original and current financial values were independently checked; deterministic conservation scenarios verify unchanged acquisition cost equals available stock cost plus effective cost of sold units after each mutation. [Review evidence](../artifacts/qa/reliability-returns/independent-domain-review/). |
| Account Ops native consistency | Four full-app theme/viewport contexts, three overlapping batches each: **192 fulfilled creates and their activity records retained** in independent fresh readers. Four mounted-UI contexts cover refresh, drafts, conflicts, clearing, recovery and revocation. |
| Account Ops guards | **52 recovery scenarios**, **64 storage-safety assertions**, **24 restore scenarios**, **73 UI assertions**, plus coordination and cache-reset checks passed. |
| Generated Account Ops IDs | **6/6 targeted cases passed**; existing domain **196** and foundation-security **183** assertions passed. Native concurrency was rerun with the real default generator. |
| Backup, restore preview, migration preview/readiness and persistence | [Combined domain checks](../artifacts/qa/reliability-returns/verification/domain-results.json). No owner-data migration or real recovery was performed. |

Build warnings about the large App bundle remain. Synthetic browser verification used installed Chromium/Playwright; physical phones, other browser engines and assistive-technology sessions were not exercised.

## What this does not establish

- The September 16 cross-tab incident lacked a fresh-reader capture. Its exact cause remains unproven. A native stale-observer mechanism was reproduced, while new tests verify every fulfilled write through independent readers. This is not a claim of power-loss durability. [Investigation and proof](../artifacts/qa/reliability-returns/cross-tab/REPORT.md).
- Refunds are manual records; this workflow sends no payment and does not verify a payment provider's settlement. Hosted activity delivery, live provider integrations and real owner-data cutover remain unverified.
- Return application requires supported whole units and explicit, matching exact acquisition/sale costs. Ambiguous legacy costs must be corrected before applying a return. An applied return is immutable; later financial or stock-basis corrections require a separate return-aware workflow and remain blocked. [Domain contract and limits](../artifacts/qa/reliability-returns/returns/DOMAIN_REPORT.md).
- Schema 7 preserves the new return history and blocks older clients from silently dropping it. This work changes no deployment settings, remote-execution safeguards or credential-scanner rules.

No commit, push, merge or deployment was performed. The local preview remains available at `http://127.0.0.1:5217/?betaLocalMode=true`.

## Screenshots

- [Light mobile return review](../artifacts/qa/reliability-returns/returns-browser/return-review-light-360.png)
- [Dark desktop applied return](../artifacts/qa/reliability-returns/returns-browser/return-applied-dark-1440.png)
- [Light mobile adjusted report](../artifacts/qa/reliability-returns/returns-browser/adjusted-report-light-360.png)
- [Dark mobile Account Ops live refresh](../artifacts/qa/reliability-returns/cross-tab/live-refresh-dark-360.png)

Historical artifact note: the older recovery test wrote intermediate results to its former fixed path before its output routing was corrected. That old directory is visibly marked as superseded; current proof is in this batch. See the Account Ops report for the preserved interrupted evidence. Older completion reports should not be paired with those overwritten guard artifacts.
