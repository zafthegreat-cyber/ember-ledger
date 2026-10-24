# Restock reporting, screenshot intake and sync release

User-authorized scope: finish screenshot → review → report, saving/editing/private
proof and phone/computer sync, fix issues, then publish. Preserve all existing
records and latest prices. eBay remains paused. The separately prepared home-screen
icon change is not included.

Branch: `codex/restock-phone-release-20261023`.
Latest main/pricing baseline: `798ce672cf6fc64c1eaa0feab0410746bd710a66`.

## Resulting behavior

- The three-step report form explains store, observation and review. Optional
  products, notes and proof remain available without crowding the basic flow.
- Real Facebook/Discord screenshot recognition produces a draft for explicit
  store/time review. A screenshot is an indirect community source, never verified
  shelf proof. Raw chat text and the original screenshot are not uploaded by this
  extraction workflow. Separately attaching proof is an explicit action.
- Category-only observations retain their category and stock label in the feed,
  filters and details, including after note/photo edits and reload.
- Add details opens the canonical permission-checked editor and updates the same
  server report ID. The deployed 26-column schema is respected; reviewed context
  and source provenance use the existing notes codec.
- Scout proof uploads persist a token-free private object locator. Authorized
  previews obtain fresh short-lived URLs and refresh after expiry. Sign-out and
  account changes clear previews. Existing Storage policies remain authoritative.
- All nine non-Scout upload folders retain their existing signed-link behavior;
  unrelated catalog and collection artwork keeps its legacy rendering behavior.
- Cloud snapshots, backups and recovery copies project recognized private image
  fields with trusted project context. Original device bytes stay in place.
  Narrow digest/object-name false positives are fixed without allowing arbitrary
  credentials, signed tokens, foreign storage URLs or payment data into backups.
- Public report visibility does not grant public access to private proof photos.
  Existing owner/workspace/admin authorization still applies.
- Runtime error logs remain on the device that recorded them. Snapshot capture
  omits only `beta-readiness-records.appErrorLogs` from a copy, fixing a real
  signed-in sync blocker. Hydration, restore, conflicts and historical recovery
  retain the current device's original logs. Generic secret scanning stays strict;
  other readiness fields sync and sanitized backup coverage is unchanged.
- Background saves that change no Phase 2 record no longer manufacture a new
  timestamp or storage write. Diagnostic-only saves also retain their existing
  business timestamp. Genuine edits still advance timestamps and invalidate a
  stale conflict review. This fixes a repeated conflict-apply blocker observed in
  the real signed-in browser flow.

## Scope and preservation

Runtime changes are limited to the report form/browser/details, Scout/App report
handlers, private reference/preview components and the relevant backup/sync
projection. Vite's brand replacement runs before asset normalization, fixing a
development-only `//assets` request without changing the approved artwork.

All 14 generated data/price files, package manifests/lockfiles, authentication
boundary, backend/API/schema/native files and supplied brand artwork are unchanged
against the baseline. No production migrations, bucket changes, record writes,
seeds, resets or file transfers are part of this release. Independent scope and
React reviews found no actionable blocker. Production aggregate fingerprints
were captured separately without returning account identifiers, records or paths.

## Fresh verification

Passed on the current release checkout:

- Source lint, production build and built/development branding metadata checks.
- Inventory valuation and pricing reliability checks.
- 32 actual report-handler/schema groups; 19 proof/category/upload compatibility
  groups; seven report-browsing groups; report-guidance assertions.
- Private access (49), private image security (7), backup digest security (9),
  workspace sync (20), workspace recovery (23), device transfer (15), legacy
  validation (42 assertions), legacy cloud backup (15), backup export and restore
  preview checks. Counts describe separate scopes and are not one combined total.
- Actual browser form, feed, details, and save → reload → edit → reload: four
  desktop/phone viewport and light/dark cases each. Exact IDs, category, status,
  privacy, provenance and entire existing synthetic record/price objects survive.
- Genuine Facebook/light and Discord/dark OCR/review/save/cancel: two cases, with
  no raw conversation/original screenshot in saved records. OCR utility: nine.
- Private image components: six 320/390/1440 light/dark cases. Canonical proof
  renews, explicit legacy proof reauthorizes, sign-out/unrelated-account access
  clears previews, and existing shared artwork/record/price sentinels survive.
- Real hosted Auth, private Storage, App handlers and snapshot clients: 38 checks
  on an isolated disposable project, including exact proof bytes, unrelated-user
  denial, bidirectional edits, offline reconnect and preserved conflict originals.
- Eleven diagnostic projection and timestamp regression groups, including actual startup-shaped
  capture, strict negative cases, legacy snapshot/conflict/checkpoint handling,
  reverse edits and no incoming diagnostic injection. Independent review passed.
  Fresh browser capture kept all original registered local storage bytes intact.
  Actual service savers are exercised between review and apply, including
  mutating callbacks; real business changes still fail stale-review checks.
- Final real signed-in two-origin UI acceptance: 12 checks passed on the rebuilt
  production-mode disposable configuration (2026-10-24 01:38:24 UTC). Genuine UI
  login and conflict review, previous item quantity 7/value $17.25 and four prior
  reports, real report UUID, explicit private upload, second-client exact proof
  bytes, reverse edit, identical category/source/privacy/status and both clients
  at Saved to your account. Existing core records/prices remained exactly equal;
  zero off-target requests. Browsers closed. Latest local reload rerun: 4/4.
- Legacy save-handler checks: 69. Deal Finder persistence: 22 offline/browser
  checks, including actual quota failure, retry, durable save and reload at
  360/light and 1440/dark. Existing IDs, relationships and receipt/custom data
  survive. This verifies durable state and visible saved history, not an ephemeral
  success toast. The large development modal needed its existing 30-second wait.

Production publication and physical Android/iPhone/computer comparison are
tracked separately below. Physical acceptance is not implied by browser,
viewport, mocked native or SDK checks.

## Isolated cloud environment

Disposable project `ssomdanfkjfxzfqqwiks`, branch
`39c3a2c2-0f63-44cb-9551-a79ad7647400`, data-less child of production. The owner
previously approved the same organization/rate ($0.01344/hour) and protected local
test credential use. No production accounts, files, records or prices were copied.

Its inherited migration sequence failed after the first ten legacy migrations.
A narrow, guarded setup restored only ten reporting/profile/session/snapshot
tables, 34 exact production functions/ACLs, six proof policies and one private
bucket. Seven local PGlite groups passed before root review and application to
the independently verified empty disposable branch. Applied SQL SHA-256:
`3ca10f8d16e8d9a4ae0d2d9ee7a86f4030af55614c883eb9cd6fd85cf492f672`.
Do not merge or apply this test setup to production.

Cloud metadata comparison found zero differences across those selected tables,
functions/permissions and policies. Advisors reported no errors; inherited helper
warnings and unrelated incomplete test tables remain documented. This establishes
reporting-scope parity, not full application-schema or privacy-rollout parity.

Test credentials are restricted to exact local execution accounts, ignored and
outside QA outputs. Only public anon configuration and ordinary synthetic logins
reach browser testing. Scanned production-mode test bundles contain no production
provider origin or server key. The real SDK runner's first attempt stopped at an
outdated upload-folder fixture; the corrected run uses the actual `scout-reports`
folder. Its offline scenario deliberately emits one synthetic transport error and
then passes durable retry/recovery assertions.

Evidence remains under ignored `artifacts/qa/restock-release-*`,
`artifacts/qa/mobile-beta/private-receipts/` and
`artifacts/qa/stock-cloud-live/`. No secret-bearing browser state is saved.

## Remaining gates

- Verified production release and unchanged aggregate data fingerprints.
- The owner's actual Android, iPhone and computer comparison on the published
  version, signed into the same account. Never clear app data for this test.
- Removal and verified absence of the disposable branch and protected files.

The legacy public `receipts` bucket closure, complete account deletion, native
package/signing work and store beta submission remain separate work. This web
reporting release does not certify those unfinished areas.
