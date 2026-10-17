# Code 3 TCG private-beta acceptance

September 23, 2026. This is a local release-readiness assessment, not approval to publish or a statement that hosted access works. It follows [RELIABILITY_RETURNS_LOCAL_REPORT.md](./RELIABILITY_RETURNS_LOCAL_REPORT.md). The parent candidate report owns the final build, complete regression results and source fingerprint.

## Proposed beta scope

The defensible first scope is manual collecting and selling: record owned items, organize exact physical units, track wants, record resale intake and sales, record shipment evidence, inspect returns, and review bookkeeping summaries. Keep Collect, Find, Sell, Bot and Business in their current structure. An unavailable integration should continue to say it is unavailable.

The local developer preview uses a development-only owner identity on loopback. It does **not** prove that an invited collector or seller can sign in, obtain the intended permissions, retain their data on the deployed service, or recover it. A hosted private beta remains blocked until those acceptance gates are demonstrated. Browser local storage is device/origin scoped; reload and a fresh page prove saved visibility, not survival of disk loss or multi-device synchronization.

## Acceptance matrix

| Area | Concrete candidate behavior / evidence | Release boundary |
| --- | --- | --- |
| Collector intake | Actual `CollectionWorkspace` guided Add Item form persists one owned record with purpose, quantity, acquisition cost and storage. New acceptance harness starts empty; no owned-item fixtures substitute for intake. | Manual identity entry; catalog and image-provider accuracy are not established. |
| Organization and wants | Binder placement points to the original item/unit; exact set/collector-number wishlist matching creates no extra inventory. Reload, Collection search, exact-record URL and Back are exercised. | Private cross-source search is owner-gated, not evidence that a non-owner collector has this capability. |
| Seller intake and inventory | Actual Add Resale Inventory form records quantity and aggregate acquisition cost; processing/storage history stays linked to the same ID. | This journey is manual intake. Owner-confirmed Purchase/Receiving/Inventory provenance has separate existing suites and is not replaced by this test. |
| Sale and fulfillment | Guided completed sale validates stock and uses the existing exact cost calculation; shipment progresses from Packed to Shipped with manual reference and timestamp. | No marketplace publication, postage purchase, tracking-provider delivery or payment settlement is performed. |
| Inspected return and report | Requested → Received → Inspected; cancel review makes zero writes, explicit keyboard confirmation applies one refund/restock, original acquisition and sale remain intact, reload and channel CSV reflect the adjustment once. | Refund is a manual record. New applied-return correction/reversal acceptance belongs to the parent candidate's dedicated tests. |
| Backup and recovery | Existing source-registry export, integrity checks and read-only review remain; Account Ops empty-target recovery host and private-byte service have disposable proofs. | Default Account Ops Restore Apply is disabled without fresh owner verification. Whole-app/nonempty restore, integrated file recovery and production rollback are not complete. |
| Canonical persistence | `persistenceMode.js` defaults LOCAL_ONLY; REMOTE_ACTIVE requires explicit owner-confirmed cutover and a supplied remote data source. Account Ops, Inbox and Bot persistence explicitly select LOCAL_ONLY. | App-wide canonical adoption/mapping and real owner-data cutover are open. A library adapter or successful local rehearsal is not a deployed migration. |
| Offline and background work | Owner-partitioned queue/idempotency/conflict contracts have existing local tests; search rules and notification preferences can be recorded. | No production idempotent transport, integrated queue/conflict UI, two-device proof or durable search-run/notification-delivery engine is accepted. A saved preference is not a running job. |
| Private attachments | Canonical record attachment UI and durable service contracts exist. `server.ts` mounts `createPrivateFilesRouter()` without a service. | Authenticated default route fails closed with `private_files_not_active` (503). Approved durable runtime, ownership/retention policy and integrated recovery are required before promising hosted attachments. |
| Sessions and confirmations | Stable owner identity metadata, session service, audit ledger, revocation and one-use purpose-bound confirmation contracts exist. Default router has no service/session resolver. | Server route reports `owner_sessions_not_active` (503). Real provider session resolution, fresh challenge, required-route guards and broader audit coverage are still required. JWT refresh time is not fresh authentication. |
| Provider operations | Bot UI explicitly states Hayha/Stellar are not configured and all live capabilities are disabled. eBay health UI distinguishes unavailable/unconfigured from healthy. | No remote Bot control, retailer checkout, mailbox ingestion, push/SMS/email delivery or live marketplace guarantee is accepted by these journeys. Provider capability approval and bounded live proof are separate. |
| Presentation and platform | New journeys run 360px and 1440px, light/dark, reduced motion, no horizontal overflow, keyboard confirmation and saved preferences. Parent owns broad theme/accessibility regression and loading measurements. | Installed Chromium only. Physical phones, other engines, screen reader usage and real network/device performance remain unverified. |

Runtime evidence: [EverydayWorkspaces](../src/pages/EverydayWorkspaces.jsx), [manual lifecycles](../src/features/manualLifecycles/ManualLifecycles.jsx), [record search](../src/features/recordSearch/RecordSearchPanel.jsx), [persistence modes](../src/features/persistence/persistenceMode.js), [server mounts](../backend/src/server.ts), [file router](../backend/src/routes/privateFiles.routes.ts), [session router](../backend/src/routes/ownerSessions.routes.ts), [Account Ops recovery panel](../src/features/backup/AccountOpsRecoveryPanel.jsx), [Bot operations](../src/features/botOps/BotOperationsPage.jsx), [owner session](../src/services/ownerSession.js).

## Required gates before inviting users to a hosted beta

1. **Built candidate and hosted identity:** publish only after separate approval; then demonstrate real invited-user login, intended collector/seller/owner roles, denied user/query-spoof cases, sign-out, expired/revoked access, and isolation between two legitimate accounts. Do not enable developer identity in a production build. Local synthetic owner acceptance is not a substitute.
2. **Storage authority and recovery:** identify which saved records are local, legacy cloud or canonical. Confirm destination/mapping coverage, verify backup including required byte assets, and rehearse recovery and rollback with disposable data before separately approved owner cutover. Do not infer an empty production store because canonical tables are absent.
3. **Hosted security and service wiring:** validate current environment and API origin configuration, hosted owner boundaries and the existing database-policy/security findings. Either finish the session/file integrations needed by the release promise or explicitly exclude their unavailable actions from beta scope. Current settings have not been changed by this audit.
4. **Capability truth:** accept the manual workflows first. Enable each external capability only after approved scopes/terms, server-side credential configuration, data-use/retention decisions and a bounded live pilot. Do not relabel asking prices as sold comparables or manual refunds as payment-provider settlement.
5. **Device and support rehearsal:** complete physical mobile/browser and assistive-technology checks, agree where participants report problems and how their data is recovered, then record known issues, responsible owner and rollback steps for the exact build.

The September 15 [hosted audit](./HOSTED_READINESS_AUDIT.md) is **historical evidence only**: it found real legacy data, missing canonical tables at that time, database advisor findings, and unavailable Vercel access. This audit did not read a live provider, inspect secrets, activate services, migrate data or revalidate that hosted state. Those historical findings must be resolved or freshly checked before relying on them.

## Harness and results

`scripts/test-private-beta-journeys.cjs` uses disposable browser contexts, actual local UI mutations, a fresh observer page, and no external network access. All nonlocal requests and non-GET requests are blocked. Local API health reads return an explicit Not Configured fixture. It never signs into a real account, sends a message, changes a provider setting or writes owner data. Failure attempts remain in their own artifact subdirectories.

Run the four local development journeys against the existing loopback preview:

```powershell
$env:APP_URL = 'http://127.0.0.1:5217/'
$env:PRIVATE_BETA_QA_DIR = 'artifacts/qa/private-beta-candidate/acceptance/dev-final'
$env:PRIVATE_BETA_MODE = 'journeys'
node scripts/test-private-beta-journeys.cjs
```

Production mode is intentionally narrower: built login/assets, responsive overflow and owner-route denial even with `betaLocalMode=true`. Production cannot use the development identity for authorized mutation acceptance. Run against a separately started built preview, with a distinct output directory:

```powershell
$env:APP_URL = 'http://127.0.0.1:<approved-preview-port>/'
$env:PRIVATE_BETA_QA_DIR = 'artifacts/qa/private-beta-candidate/acceptance/production-final'
$env:PRIVATE_BETA_MODE = 'production-smoke'
node scripts/test-private-beta-journeys.cjs
```

Current local result: **4/4 full journeys passed on the frozen final source**, light/dark at 360/1440px. [Closing results](../artifacts/qa/private-beta-candidate/acceptance/dev-final/results.json) include original saved identities, independent-reader state hashes and blocked network requests. There are 24 workflow screenshots, four unauthenticated denial screenshots and four downloaded CSV statements. Representative views: [light mobile binder](../artifacts/qa/private-beta-candidate/acceptance/dev-final/collector-organized-light-360.png), [dark desktop search](../artifacts/qa/private-beta-candidate/acceptance/dev-final/collector-search-dark-1440.png), [dark mobile applied return](../artifacts/qa/private-beta-candidate/acceptance/dev-final/seller-returned-dark-360.png), [light desktop report](../artifacts/qa/private-beta-candidate/acceptance/dev-final/seller-report-light-1440.png).

The real entry path exposed a missed integration boundary: quantity typed into Add Resale Inventory is persisted as canonical integer text, while return calculation previously accepted only numeric values. The domain fix accepts strict supported integer text for derivation and preserves the original field/history; the final journey uses actual form data and completes the return. It does not replace the record with a numeric fixture.

Independent correction review also passes [six exact-cent conservation states](../artifacts/qa/private-beta-candidate/acceptance/independent-review/results.json): two-unit return, reversal, freshly inspected partial restoration, resale, second return, and restoration of the remaining original unit. Original acquisition and sale fields stay unchanged; used/later-return-attributed units cannot be removed; retries do not write again. Review found that a backdated saved correction was initially accepted; interleaved per-inventory chronology validation now rejects it, with a permanent domain regression and the independent probe rerun. [Audit notes](../artifacts/qa/private-beta-candidate/acceptance/REPORT.md).

Production build smoke: **4/4 passed** against the final local built preview at `127.0.0.1:5218`. Built JavaScript/CSS loads, login renders in both themes at 360/1440px without horizontal overflow, and private owner search stays denied even with a `betaLocalMode=true` query. [Results](../artifacts/qa/private-beta-candidate/acceptance/production-final/results.json), [light mobile login](../artifacts/qa/private-beta-candidate/acceptance/production-final/production-login-light-360.png), [dark desktop login](../artifacts/qa/private-beta-candidate/acceptance/production-final/production-login-dark-1440.png). The parent candidate report owns final-source combined build/regression acceptance. A passing local harness does not close the hosted gates above.
