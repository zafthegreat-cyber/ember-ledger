# Operations workspace refinement

Date: 2026-10-18. Working branch: `codex/all-bot-integration-setup`. Published baseline: `eb560fc97d36939f19ae68aafbb1e1c7806e8632`. This is a local, uncommitted continuation of the Bot tracking and purchase-email candidate. Nothing was pushed, merged, or deployed in this pass.

## What changed

The Icebox screenshots informed the organization of the existing Code 3 TCG tools: a module rail, contextual views, compact grouped record lists, and a focused detail pane. Code 3 keeps its own logo, semantic teal/neutral palette, light/dark preferences, routes, and existing data authority.

- Shared `OperationsWorkspace` and `OperationsRecordBrowser` provide desktop navigation and list/detail layouts. On phones, the section picker and list-to-detail flow avoid squeezing several columns together. Back restores keyboard focus to the selected row. Search and filters stay in memory; the shared components do not write storage.
- Email & Orders has searchable purchase drafts, confirmed purchases, deliveries, inventory records, and receipt previews. Search includes order references, retailer names, item names, and identifiers. Retailer/status filters show counts. The app-password form collapses after a successful pull; missing fields still require review. Save draft, Confirm Purchase, receiving, and inventory actions remain separate.
- Opening a newly saved email draft clears stale list filters so the requested draft is visible. Pending saves disable filtering and navigation within the record browser. Receipt-review drafts are retained when moving between the list and details.
- Bot Operations now exposes its existing sections in a consistent rail/picker. Task tracking has group, installation, provider, and stage filters with counts, compact records, one selected task, and editable manual-plan details. Overview links open the intended task. The Bot workspace uses available desktop width so the list and details can fit together.
- Account Ops has contextual views for profiles/aliases, setup/health, provider connections, and activity/tasks. Profiles have visible group selection, group management, and compact record/detail views; store accounts retain setup, edit, copy, selection, bulk review, archive, and full-profile actions. Setup's All Accounts action returns to the list. Email/order entry points link to the existing purchase-email workflow, with browser Back preserved.
- Fixed an inherited app style that made every module button look selected. Inactive items are neutral; only the current section receives the teal selection treatment. Existing safe touch targets and visible focus are retained.

## Screenshot feature mapping

| Reference area | Existing Code 3 location and usable capability | Still unavailable |
| --- | --- | --- |
| Account creation | `/account-ops/accounts`: account drafts, legitimate signup links, manual verification/checklists, recorded health, tasks | Automated signup or retailer verification calls |
| Profile Manager | `/account-ops/profiles`, `/account-ops/identity`: reusable identity/address metadata, groups, aliases, full editor | Verified compatibility/export contracts for every external bot |
| Card Manager | `/account-ops/payment`: safe payment references, last four digits, assignments and recorded limits | Card issuance, connected VCC service, payment-credential storage |
| Order Manager | `/business/purchases`: one-time AOL/Gmail/Yahoo receipt pull implementation, review, duplicate-safe drafts, explicit confirmation, receiving, inventory review and corrections | Persistent mailbox sync, full email client, live shipment polling, automatic purchase confirmation |
| Browser AIO | `/account-ops/infrastructure`: browser/server/workspace metadata | Managed browser sessions, cookies, autofill or remote controls |
| SKU Manager | `/bot/targets`, `/bot/tasks`: product identifiers, retailer, price/quantity limits, manual plans and groups | Live retailer lookup, SKU discovery or monitoring |
| ACO / bot tasks | `/bot/tasks`, `/bot/bots`: eight named provider installation records, manual plan stages, activity, existing sanitized Stellar export preview | Native bot status/order sync, start/stop, automatic checkout |
| Stock checker | `/find/restocks`: existing observational community reports, store visits, stock labels, optional photos and review/post flow | Connected retailer inventory checker |
| Inventory and expenses | `/business/inventory`, `/business/money/expenses`: existing workflows retained | No duplicate inventory or expense system was added |

The screenshots do not establish an integration API or authorize a capability to be shown as working. All eight named bots remain explicitly unconnected until supported interfaces and real verification exist. The current email feature is one pull at a time, not a saved connection.

## Verification

All browser records are synthetic, in isolated browser contexts against disposable loopback port 5243. The user's signed-in services on ports 5239/5240 and production records were not used or modified. External browser requests are blocked in the test fixtures.

- Frontend production build passed. The existing large App chunk warning remains.
- Complete-source ESLint passed with no errors or warnings; the existing Babel large-file note remains. Backend TypeScript build passed. No separate frontend TypeScript check is configured.
- Shared workspace: six 320/390/1440px light/dark cases passed, including selection, keyboard Back/focus, filter preservation, touch targets, overflow, zero storage writes, and neutral inactive navigation.
- Email browser: nine result groups passed, covering six theme/viewport flows, deterministic generated-ID regression, access/error/storage/account-change safety, and the actual mobile app route. Existing synthetic collection, sale, price and bot records remain preserved. Opening a saved receipt draft through a nonmatching prior filter is covered.
- Mailbox route/transport/parser: 102 tests passed. Client API: 89 checks. Purchase/Receiving: 1,814 assertions. Order list selectors: 25 checks. Inventory creation/correction/reconciliation UI contracts: 182 assertions. Email mapping and duplicate/replay tests passed.
- Bot domain/provider/security/Stellar suites: 4,141 assertions. Tracking: 565 domain and 37 selector assertions.
- Bot browser regressions: 27 fixtures, 39 captures and 1,037 assertions. Stellar preview: 9 scenarios / 186 assertions. Provider setup passed six theme/viewport cases, two actual-app routes, corrupt-storage and cross-tab cancellation checks. Task tracking passed six full behavior cases, actual-app, concurrency and evidence checks, plus six final layout cases and actual 320px light/1440px dark routes after visual fixes.
- Account Ops domain/fixtures/UI/security/zero-write suites: 7,595 assertions.
- Account Ops new actual-app checks: six mobile/tablet/desktop light/dark combinations, 130 assertions, including profile grouping, editing, bulk selection, setup-to-account navigation, purchase-link/browser-Back, and unchanged unrelated stored records. Existing 20-fixture/31-capture Account Ops browser suite: 228 assertions passed.
- Account Ops foundation browser matrix: five scenarios / 938 assertions passed. Total Account Ops checks across these suites: 8,891 assertions.
- Purchase/Receiving browser regression: 15 scenarios and 337 assertions passed, including owner denial and the preview's zero-write boundary.
- Downstream inventory/accounting browser checks: 20 scenarios and 294 assertions passed (creation 4/38, correction/replacement 6/45, historical reconciliation 5/38, accountant review 5/173). Exact costs, explicit mutation, idempotency, existing history, reload and owner-denial checks remain intact.
- Backup: 22 sections and 34 records passed. Workspace recovery: 23 checks passed.

Responsive Account Ops/Bot and downstream inventory browser results are recorded in their current artifact manifests. Final production rebuild and scoped lint passed after the visual refinements. The additional pending-save filter/Back regression also passed. `git diff --check` passed; Git reports the repository's existing LF/CRLF conversion notices.

## Evidence

- [Shared workspace results](../artifacts/qa/operations-workspace/results.json)
- [Email flow results](../artifacts/qa/purchase-email-import/results.json)
- [Desktop receipt inbox](../artifacts/qa/purchase-email-import/1440-dark-receipts.png)
- [Actual mobile receipt review](../artifacts/qa/purchase-email-import/320-dark-actual-app-viewport.png)
- [Account Ops desktop](../artifacts/qa/account-ops-workspace/desktop-dark-final.png)
- [Account Ops workspace manifest](../artifacts/qa/account-ops-workspace/manifest.json) and [foundation manifest](../artifacts/qa/code3-phase2a6a-account-ops-foundation/current/manifest.json)
- [Bot desktop task details](../artifacts/qa/bot-tracking/1440-dark-actual-app-task-detail.png) and [Bot phone list](../artifacts/qa/bot-tracking/320-light-actual-app-list.png)
- [Purchase/Receiving browser manifest](../artifacts/qa/code3-phase2ca-purchase-receiving/current/manifest.json)
- [Build log](../artifacts/qa/operations-workspace/build.log), [lint log](../artifacts/qa/operations-workspace/lint.log), [backend type-check log](../artifacts/qa/operations-workspace/backend-build.log)
- [Earlier purchase-email implementation](./PURCHASE_EMAIL_IMPORT_LOCAL_REPORT.md) and [Bot tracking checkpoint](./BOT_TRACKING_LOCAL_REPORT.md)

## Limits and next steps

This is an organizational UI refinement of the existing tools, not completion of every external feature in Icebox. No real app password was supplied, no actual mailbox was pulled, and no native bot integration was activated. Hosted IMAP egress, real receipt templates, physical phone hardware, screen-reader operation, and newly added local purchase records syncing between real devices remain unverified. Existing storage/backup authority is retained; no new cloud-sync behavior or migration was introduced.

Review the local screens, then separately authorize publication if desired. A real-mailbox test requires the verified owner to enter a provider-generated app password inside the app, never through chat. Provider-backed browser/card/bot/stock features require their supported interfaces and individual operational verification.
