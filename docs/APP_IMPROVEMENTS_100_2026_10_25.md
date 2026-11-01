# Code 3 TCG: 100 app improvements

Requested October 25, 2026. This is an app-wide implementation backlog, starting
with shared controls used in Market, Vault and item entry. The existing feature
train and June UI review describe earlier work; this list tracks a new pass.

Status: **33 verified complete; 3 in progress; 64 queued.**
Items are refinements to inspect and implement, not claims that every existing
feature is absent. Verify the current behavior before changing each queued item.
Local implementation and verification are authorized. Production deployment,
credentials, paid services and new external publication are separate release
actions. Existing eBay work remains intact.

Priority: P1 = correctness, access or reliable completion; P2 = usability and
clarity; P3 = optimization or operational refinement. An item is complete only
when the stated outcome is implemented and its relevant check passes.

## Batch 1: shared catalog search

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 1 | P1 | Connect each combobox to its own suggestion list and active option using unique accessible IDs; two controls cannot interfere. | Complete |
| 2 | P1 | Announce loading, result count, empty results and search failures to screen readers without duplicating visible content. | Complete |
| 3 | P1 | Escape cancels pending suggestions and keeps the popup closed when a delayed response arrives. | Complete |
| 4 | P1 | Leaving the search control cancels pending work; delayed results cannot steal attention by reopening the popup. | Complete |
| 5 | P1 | Choosing a suggestion or submitting a full search cancels the old request and does not reopen suggestions for the chosen value. | Complete |
| 6 | P1 | Parent-driven close signals invalidate pending suggestion requests as well as hiding the popup. | Complete |
| 7 | P1 | Japanese and other IME composition can use Enter and arrows without accidentally selecting or submitting a card. | Complete |
| 8 | P2 | Arrow Down opens at the first suggestion, Arrow Up opens at the last, and Home/End reach either end of an open list. | Complete |
| 9 | P2 | Keep the active suggestion visible in a bounded, scrollable panel with mobile touch targets and normal Tab navigation. | Complete |
| 10 | P1 | Highlight the original title correctly after accents, ampersands, punctuation and emoji; aliases never corrupt visible text offsets. | Complete |

## Batch 2: Market search and trustworthy price presentation

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 11 | P1 | Prevent unrelated catalog fallback results from being presented as matches to a named card and collector number. | Complete |
| 12 | P1 | Preserve collector-number slashes, prefixes and leading-zero equivalence throughout query parsing and matching. | Complete |
| 13 | P1 | Distinguish exact identity matches from nearby suggestions before an item can be selected for pricing. | Complete |
| 14 | P2 | Give empty catalog searches a useful recovery action while retaining the entered query. | Complete |
| 15 | P2 | Restore search text and supported filters from a shared Market URL and browser Back navigation. | Complete |
| 16 | P1 | Keep result count, current page and filters consistent across every catalog search entry point. | In progress |
| 17 | P1 | Keep price source, as-of date, currency and applicable condition visible alongside each estimate. | Complete |
| 18 | P1 | Explain incompatible language, printing, grading and currency when comparison values are withheld. | Queued |
| 19 | P2 | Explain thin price coverage with a concrete next action instead of displaying a zero valuation. | Complete |
| 20 | P2 | Preserve an unmatched UPC/SKU and typed name when the user continues to a manual-item draft. | Complete |

## Batch 3: Vault and collection management

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 21 | P2 | Give empty folders a direct add-to-this-folder action with the destination already selected. | Queued |
| 22 | P1 | Make possible duplicate copies reviewable by set, printing, language, condition and existing quantity. | Complete |
| 23 | P1 | Preview affected copies and changed fields before applying collection bulk edits. | Queued |
| 24 | P2 | Offer row-specific CSV import corrections and an export of rejected rows. | Complete |
| 25 | P1 | Show portfolio valuation coverage separately from total owned quantity so unpriced cards are visible. | Complete |
| 26 | P1 | Keep owned, wanted and listed quantities distinct in collection totals. | Complete |
| 27 | P2 | Explain which variants count toward a selected set-completion target. | Queued |
| 28 | P2 | Make individual duplicate-copy notes and storage locations distinguishable in compact rows. | Complete |
| 29 | P1 | Require a clear variant choice when one barcode or catalog entry maps to multiple owned-copy identities. | In progress |
| 30 | P2 | Make collection exports use predictable dates, headers and explicit currency for spreadsheet use. | Queued |

## Batch 4: Forge and seller recordkeeping

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 31 | P1 | Explain the sale-profit calculation with separate cost, fees, shipping charged and shipping paid. | Queued |
| 32 | P1 | Flag received inventory whose purchase cost is still unallocated before profit is shown. | Queued |
| 33 | P1 | Keep return corrections visibly linked to original sale amounts and remaining quantities. | Queued |
| 34 | P2 | Use clear pending, received, sold and returned labels with the next valid action. | Queued |
| 35 | P1 | Preview bundle/lot cost allocation and show that rounded line amounts reconcile to the total. | Queued |
| 36 | P1 | Show a mismatch notice before comparing trade values from different conditions or languages. | Queued |
| 37 | P2 | Surface missing or detached receipt references without losing the expense or inventory record. | Queued |
| 38 | P1 | Explain an insufficient-quantity failure beside the affected item before a save is attempted. | Queued |
| 39 | P2 | Make order status filters preserve selection and expose their active state clearly. | Queued |
| 40 | P1 | Provide a focusable validation summary that links to invalid seller-record fields. | Queued |

## Batch 5: Scout and useful local restock reports

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 41 | P1 | Pair report freshness labels with a readable observation timestamp. | Queued |
| 42 | P1 | Explain the difference between a current observation, an older report and an unverified claim. | Queued |
| 43 | P2 | Keep selected store and filters synchronized between map and list views. | Queued |
| 44 | P2 | Offer manual city/area selection when location access is unavailable. | Queued |
| 45 | P1 | Ask for review of a stale offline report before publishing it as a current observation. | Queued |
| 46 | P1 | Explain missing evidence and sensitive information in the report review step before submission. | Queued |
| 47 | P2 | Make travel context understandable without exposing private restock patterns or exact quantities. | Queued |
| 48 | P1 | Distinguish a manual watch, a configured provider and a verified notification delivery. | Queued |
| 49 | P2 | Make potential duplicate report review preserve the reporter's draft and evidence. | Queued |
| 50 | P2 | Use consistent, actionable moderation reasons across report cards and review screens. | Queued |

## Batch 6: Hearth, navigation and startup

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 51 | P1 | Offer a recoverable startup timeout with clear retry state and no loss of local drafts. | Queued |
| 52 | P2 | Keep the most common context-specific actions easy to find without another large dashboard panel. | Queued |
| 53 | P2 | Make recently visited areas private to the active account and easy to clear. | Queued |
| 54 | P1 | Warn before navigation discards an unsaved form, with a route to keep editing. | Queued |
| 55 | P2 | Restore list position, selected tab and filters when returning from an item detail. | Queued |
| 56 | P1 | Move keyboard focus to the new page heading after an app route change. | Complete |
| 57 | P1 | Avoid briefly presenting an incorrect beta-access state while the real account profile is loading. | Queued |
| 58 | P2 | Make global Add show the active workspace and intended record destination. | Queued |
| 59 | P2 | Reduce repeated administration notices while keeping the actual account role clear. | Queued |
| 60 | P2 | Keep long page titles and breadcrumbs readable at narrow widths and large text sizes. | Queued |

## Batch 7: family access, Tidepool and The Spark

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 61 | P1 | Explain which parent controls work now and which still require a future approval workflow. | Queued |
| 62 | P1 | Make community previews omit private child, household and contact details. | Queued |
| 63 | P1 | Keep role-preview controls visually distinct from actual access permissions and save actions. | Queued |
| 64 | P1 | Preview moderation redactions before a community report is submitted. | Queued |
| 65 | P2 | Make community-report reasons keyboard-accessible with an optional explanation field. | Queued |
| 66 | P1 | Validate community external links and provide a clear destination label. | Queued |
| 67 | P2 | Make donation/request progress show the current review state and next available action. | Queued |
| 68 | P2 | Make sponsor and volunteer contact-sharing consent explicit at the relevant step. | Queued |
| 69 | P1 | Clear private draft and selection state when switching between family/account contexts. | Queued |
| 70 | P2 | Explain trust badges using the actual verification scope and review date. | Queued |

## Batch 8: recovery, offline use and data confidence

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 71 | P1 | Show field-level differences and timestamps when reviewing a cloud-save conflict. | Complete |
| 72 | P1 | Keep an acknowledged sync notice from immediately reappearing for the same unchanged conflict. | Queued |
| 73 | P1 | Scope recoverable drafts to the account and workspace, with clear age and discard controls. | Queued |
| 74 | P1 | Show actionable storage-quota guidance before another large local save fails. | Queued |
| 75 | P1 | Distinguish offline work that will retry from work requiring manual review. | Complete |
| 76 | P1 | Make blocked cloud-saving status explain whether local work is still preserved. | Complete |
| 77 | P1 | Preview the scope and recovery path for reversible bulk changes before applying them. | Queued |
| 78 | P1 | Make account-deletion progress clearly explain pending, completed and retryable states. | Queued |
| 79 | P2 | Give failed private attachments a retry action while preserving their parent record. | Queued |
| 80 | P1 | Show import schema/version compatibility and a dry-run summary before accepting a backup. | Complete |

## Batch 9: performance, mobile layout and accessibility

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 81 | P2 | Give shared controls their own scoped styles instead of relying on missing or accidental global selectors. | Complete |
| 82 | P2 | Reduce the initial app bundle by extracting a measured legacy admin/settings area. | Queued |
| 83 | P2 | Keep long catalog/record lists responsive without losing keyboard position or selection. | Queued |
| 84 | P2 | Bound search-index/cache growth and verify invalidation when the catalog changes. | Queued |
| 85 | P2 | Reserve image dimensions and show stable placeholders to reduce result-card layout shifts. | Queued |
| 86 | P1 | Provide readable labels and a table alternative for value and collection charts. | Complete |
| 87 | P2 | Respect reduced-motion preferences for nonessential transitions and loading animation. | Queued |
| 88 | P1 | Improve low-contrast secondary text and focus indicators in the shared theme. | Queued |
| 89 | P1 | Keep primary form actions clear of the mobile keyboard and bottom navigation. | Queued |
| 90 | P1 | Maintain usable reflow at 200% text size without clipped controls or lost actions. | Queued |

## Batch 10: release quality and operational clarity

| # | Priority | Improvement and acceptance outcome | Status |
|---|---|---|---|
| 91 | P1 | Make deploy readiness verify that the selected source contains required production API routes. | Queued |
| 92 | P1 | Keep build-time configuration checks restricted to names and safe status, never secret values. | Queued |
| 93 | P1 | Add a compact owner-only integration status that distinguishes configured, verified and failing providers. | Queued |
| 94 | P2 | Show provider quota/retry guidance when available without background paid requests. | Queued |
| 95 | P1 | Keep failed requests traceable with a safe request identifier and no private payload logging. | Queued |
| 96 | P1 | Check that user-supplied links use approved protocols before rendering clickable destinations. | Complete |
| 97 | P1 | Make downloads and exports explicitly describe included private fields before generation. | Complete |
| 98 | P1 | Add a small release checklist covering shared search, record save, recovery and role boundaries. | Complete |
| 99 | P2 | Record measurable frontend size and route-load changes for each performance release. | Queued |
| 100 | P1 | Keep this implementation ledger accurate: completed work, test evidence, remaining issues and release state. | In progress |

## Work log

- Baseline: original working tree contains the previously deployed eBay and
  deletion integration. New work starts in shared search files that matched
  `origin/main` before editing. No existing work was reset or removed.
- Batch 1 files: `SmartCatalogSearchBox.jsx`, scoped search CSS,
  `catalogSearchPresentation.mjs` and focused presentation regression tests.
- Completed: #1–15, #17, #19–20, #25–26, #56, #81, #86, #96 and #98.
- Shared search browser checks passed: two independent comboboxes, live status,
  delayed responses after Escape/blur/parent close, selection/full-query submit,
  IME Enter, arrows/Home/End, keyboard scrolling and Tab. The mobile panel fits
  a 390px viewport and its result targets exceed 44px. Title highlighting
  preserves Unicode offsets and literal punctuation.
- Market fixes preserve collector fractions and require the named card to match.
  Empty server pages cannot replay unrelated cached rows. The picker and Market
  distinguish a name/number match from a nearby suggestion. Empty-query recovery
  retains the draft, including a leading-zero UPC/SKU, without inventing a price.
  The real app's manual-entry fields were checked without saving a record.
- Market shared links now carry supported kind/set/type/data filters. Loading a
  link clears unrelated saved filters; browser Back restores the query. New page
  headings receive focus after lazy loading, with a bounded wait that stops when
  the user starts interacting.
- Collection coverage uses the existing strict portfolio valuation parser.
  Wishlist budgets do not enter owned totals or the owned type denominator.
  Listed copies are an owned subset. Tables show priced/unpriced copies, known
  values, and actual price-history points; missing prices remain explicit.
  The pre-existing portfolio module was restored byte-for-byte after a file-name
  collision; its 30 regression scenarios passed.
- Saved web destinations in catalog details, Scout product/source references,
  inventory, deals and auctions now use a shared protocol check. Rejected URLs
  render inert text; valid links expose their hostname and open safely.
- Verification: 12 app-improvement tests, 7 catalog-identity/service tests,
  6 Market-presentation tests, 4 highlighting tests, 32 route-loading checks,
  49 route-compatibility checks, 34 manual lifecycle tests, 23 recovery checks,
  20 cloud-sync checks, role-management checks and 30 existing portfolio
  scenarios passed. Browser checks covered the actual Market and Vault pages
  plus synthetic delayed-search and nonempty collection/history presentations.
- Changed-file lint has no errors. The pre-existing App `checkUser` hook
  dependency warning remains. Production build passed; existing large-chunk and
  mixed Supabase import warnings remain. The app chunk is approximately
  1,944.69 kB raw / 518.32 kB gzip; this batch makes no bundle-reduction claim.
  A fresh final Market session had no browser console errors. Earlier import
  edits generated development hot-reload errors, resolved before that check.
- #16 remains in progress: exact local matches, filter-before-page counts,
  empty page identities and Market result navigation have been improved. Broad
  query counts and the remaining legacy client-side filters still need a pass
  across the other catalog entry points. #100 stays in progress while this
  implementation program continues.
- Market result expansion now exposes all loaded matches and keeps keyboard
  focus on the expand/collapse control. Page navigation connects to the existing
  catalog loader. Supplied currencies are preserved; an unknown currency no
  longer silently receives a dollar sign in the Market preview.
  The final visual check also replaced a cramped four-column result grid with
  wrapping title, price-context and action rows. Titles no longer overlap values.
- Local evidence: `artifacts/qa/catalog-search-100/` and
  `artifacts/qa/collection-coverage-100/`. The screenshots with populated
  coverage/history use synthetic records and do not establish provider health.
- Release state: **local only**. No production deployment, schema change,
  credential change, new GitHub publication or paid provider request was made
  for this improvement batch. See `APP_IMPROVEMENTS_RELEASE_CHECKLIST.md`.

### October 26: import review, copy details and cloud recovery

- Completed in this batch: **#22, #24, #28, #71, #75 and #76**. Total verified
  completion is now 31. #16, #29, #97 and #100 remain in progress.
- Import review compares possible copies by set/collector number, printing,
  language, condition, grade, quantity and private storage/notes. Quantity
  increases require the same copy attributes and an explicit target when several
  copies match. Other workspace records are excluded. The production query uses
  the expected quantity as a guard and updates quantity without overwriting notes.
- Invalid quantities, amounts and calendar dates stay visible for correction;
  they are not silently converted to valid values. Source-line links identify
  affected fields. Quoted multiline CSV cells and escaped quotes are preserved.
  An ignored column stays ignored in the field mapping. Reference-only uploads
  cannot be confirmed as inventory. Correction exports include the original row,
  safe spreadsheet text and per-row errors, with a private-data disclosure.
- Confirmed destination successes remain recorded within the staged review.
  A partial retry skips those destinations, and concurrent confirmation is
  blocked. An unconfirmed save still requires checking saved records before
  retrying; this does not claim server-side idempotency for new inventory rows.
- Imported copy details use a versioned entry in the existing private
  `action_notes` field. The mapper restores set, number, printing, grading and
  notes after reload without a migration. An unknown imported condition is not
  changed to Near Mint. Existing non-import records keep their original defaults.
- Compact portfolio rows now show separate printing/language/condition, storage
  and note descriptions, including unique accessible description IDs for copies
  with the same name. Full notes remain available when the item is opened.
- Cloud conflict review pairs records by stable IDs and shows field differences,
  cloud save time and recorded edit times. The preview is bounded and marks its
  limits. Existing whole-group choices, stale-review checks, recovery copies and
  account verification remain in place. It does not silently merge fields.
- Cloud saving now distinguishes automatic retry, paused saving, required review,
  confirmed saves and device-storage failures. Device save failures explicitly
  avoid promising that a complete local save has been verified.
- Verification passed: **16 import safety/actual-handler tests**, **13 cloud and
  copy presentation tests**, existing import tests, 34 manual lifecycle tests,
  20 cloud-sync checks, 23 recovery checks, 30 portfolio scenarios, role checks
  and native export checks. Changed-source lint has no errors; the existing
  `checkUser` hook dependency warning remains. Build passed with the existing
  large-chunk/mixed Supabase import warnings; App is 1,949.62 kB raw / 519.92 kB
  gzip. No bundle-size reduction is claimed.
- Browser checks used synthetic records and actual components: invalid import
  fields, explicit printing choice, copy comparisons, offline/device-save status,
  changed cloud fields, notes and storage. The recovery preview fits a 390px
  viewport and the comparison scrolls inside its focusable region. The recovery
  preview console had no errors. Actual production import writes and a physical
  device/native correction-file download were not exercised.
- Evidence: `artifacts/qa/import-review-100/` and
  `artifacts/qa/cloud-review-100/`. Shared-barcode ambiguity is handled in import;
  #29 still needs the other scan/add entry points. #97 covers import corrections
  and backup/conflict downloads so far; other exports remain to be audited.
- Next: backup schema/version presentation (#80), ambiguous scan/add identity
  (#29), previewing bulk changes (#23/#77), and completing export disclosures
  (#97). Sign-in changes must follow the portfolio preferences and verified
  account-linking boundary; no new provider is presented as configured here.
- Release remains **local only**. No new production, credential, database schema,
  GitHub publication or paid-provider changes were made for this batch.

### October 30: backup compatibility review and export disclosures

- Completed in this batch: **#80 and #97**. Total verified completion is now 33.
  #16, #29 and #100 remain in progress.
- #80: `restoreCompatibility.js` summarizes, per backup section, the saved schema
  version against the versions this build reads (readable, newer than this app,
  too old, version missing, unknown source) and whether the current recovery
  restores that source. It also compares the backup format version and the
  saving app version with the running app. `previewBackupRestore` now returns
  `compatibility`, `dryRun` and `sourceSummaries`; `planWorkspaceRestore` returns
  a display-only `review` beside the unchanged hashed plan, and a blocked plan
  throws with the specific source/version message plus `error.review` so the
  recovery gate can still show which source stopped it. The dry run counts, per
  source, records in the backup, already saved, to be added, existing versions
  kept and the total after restore; its totals match the plan's `addedRecords`
  and `preservedConflicts`. `RestoreReviewSummary.jsx` renders both tables in the
  Data & Backup preview and in the pre-app recovery gate (table rows collapse to
  labelled cards at 560px; the gate component imports no receipt/Supabase/native
  modules). Review-report downloads now record the compatibility and dry-run
  summary without record contents.
- #97: `exportDisclosure.mjs` turns real column names (or a known export kind)
  into one sentence naming the format, record count, each private category
  (contact details, people's names, private notes, locations, where you bought
  or sold, money amounts, receipt/reference numbers, links, record IDs) and what
  the file leaves out. `ExportDisclosure.jsx` renders it next to each export
  control, and every control points at it with `aria-describedby`. Covered:
  Forge sales and mileage CSV/JSON, year-end summary/report exports, Marketplace
  cross-listing CSV, Vault portfolio CSV (value columns omitted when values are
  hidden), Scout "What did I see" JSON, beta data export, Business Hub sourcing
  JSON backup and CSV exports, booth statement CSV, event calendar entry,
  verified record backup and private file backup. Existing disclosures on import
  corrections, workspace backups and cloud comparison downloads are unchanged and
  guarded by the new test. Mileage disclosures name driver names (carried in
  notes) and do not claim locations, which trips do not store.
- Verification passed: **10 restore-compatibility tests**, **7 export-disclosure
  tests** (including a source audit that every export control is described),
  12 app-improvement tests, 16 import safety, 13 cloud review, 7 identity,
  6 Market, 4 search presentation, 32 route-loading, 49 route-compatibility,
  34 manual lifecycle, 23 recovery, 20 cloud-sync, 15 device-transfer,
  24 Account Ops restore, 30 portfolio, backup (22 sections), restore-preview,
  42 legacy backup validation, 10 review presentation, year-end export and role
  checks. Changed JSX parses cleanly with esbuild. New scripts:
  `npm run test:restore-compatibility`, `npm run test:export-disclosure`.
- Not run in this batch: `npm run build` and ESLint. This pass was prepared in a
  cloud workspace that could not install the repository's dependencies; the
  domain and presentation tests ran against matching local copies of React 19.2,
  esbuild 0.28.2 and TypeScript 6.0.3. Run `npm run build` and `npm run lint:src`
  on the development machine before any release and record the chunk size here.
- Evidence: `artifacts/qa/restore-compatibility-100/` and
  `artifacts/qa/export-disclosure-100/` (compiled presentation bundles).
- Next: ambiguous scan/add identity across the remaining entry points (#29),
  bulk-change previews (#23/#77), storage-quota guidance (#74) and the remaining
  #16 catalog entry points. No deployment, schema, credential or provider change
  was made; release remains **local only**.

### October 30 (later): simulated 100,000-user beta

- See `BETA_SIMULATION_100K_2026_10_30.md`. Offline run of the real domain
  modules over 100,000 synthetic users plus persona walkthroughs; no production
  traffic. No crashes or access leaks; findings are scale and copy issues.
- Fixed during the run: `workspaceRestorePlan.js` `mergeMissing` duplicate scan
  was quadratic (121 s for a 7,000-record restore); now linear with identical
  results. Recovery, device-transfer, restore-preview and restore-compatibility
  tests pass.
- New follow-ups surfaced for the backlog: verified backups over 10 MB fail
  verification (large sellers); Marketplace listing drafts skip the
  contact/address safety check that Tidepool posts receive; every restore
  preview warns about missing currency on legacy records; manual sale drafts do
  not validate `saleDate`; Free-plan copy promises gated features. #74 should be
  pulled forward.


### October 30 (evening): tester-reaction corrections, batch 1 (items A1–A40)

Source: `BETA_SIMULATION_VOICES_2026_10_30.md`, section A, items 1–40. Each
item is listed with what changed; "copy" means wording only. All changes are
additive; no route, storage key, table, migration or RLS policy was renamed.

- **A1–A2 access.** Beta review now covers Virginia, North Carolina, Maryland,
  West Virginia, Tennessee, Kentucky and Washington, DC
  (`BETA_OPEN_ACCESS_STATES`, `isOpenAccessState` in `onboardingGuidance.js`;
  used by `shorelineAccessService.js` and the access gate). Other states still
  join the waitlist, and the waitlist and pending screens now say what happens
  next (a person reviews, usually within a few days, email either way, account
  and public catalog stay available). The Virginia-area question stays
  Virginia-only. The state rule lives only in the client; no SQL change.
- **A3–A4 onboarding.** Checklist items carry `core` or `goals`; parents,
  collectors and newcomers no longer see Forge/Scout steps
  (`checklistItemAppliesTo`, `onboardingChecklistForGoals`). Items already
  completed stay visible.
- **A5–A7 pricing copy.** Free-tier copy no longer promises collection value,
  set progress or the Forge/Business ledger; it lists what is not included.
  Collector copy names collection value, set progress, missing-card lists,
  binder view, unlimited items and export. Gates unchanged.
- **A8 storage full.** `legacyAppStorage.js` detects quota errors, keeps the
  unsaved payload in an IndexedDB overflow copy (`code3-local-overflow-v1`)
  and tells the person exactly what happened and what to do. #74 (moving the
  main store off localStorage) is still the real fix.
- **A9 backup limits.** `BACKUP_PARSE_LIMITS` raised to 64 MB / 250k array /
  500k records; size errors say the actual and allowed size;
  `createVerifiedBackup` returns `verificationReasons`/`verificationSummary`
  (plain-language) and both backup panels show them.
- **A10 currency warning.** A backup that declares one currency (or none) is
  treated as single-currency (`assumedCurrency`); the missing-currency warning
  only fires when currencies are mixed. Restore-preview test updated.
- **A11 local-only copy.** "Local only" labels now read "Saved on this device"
  with the consequence and the two ways to protect the records.
- **A12 alerts.** New `utils/deviceNotifications.js`: opt-in browser
  notifications mirror new unread alert rows while the app is open or
  installed; the Alerts panel has a "Turn on device alerts" button and honest
  copy about closed-app delivery (still needs a push provider).
- **A13–A15 reporter unlock.** `featureGates.js`: `SCOUT_EARNED_FEATURES`
  (current details, alerts, advanced/priority alerts, verified tips, store
  confidence) unlock at `SCOUT_EARNED_UNLOCK_POINTS` (40) or the Trusted
  Reporter role; raw history and pattern tools stay admin-only. The lock card
  explains it. `describeScoutPointsProgress` and the guess-locked message now
  say exactly how points are earned.
- **A16–A17 barcode scan.** `BarcodeScanner` restarted the camera on every
  parent render (inline `onScan` in the effect deps), so decoding rarely
  finished. It now starts once per mount/retry, prefers the back camera via
  `decodeFromConstraints`, shows a live status and explains permission
  failures.
- **A18–A19 search.** App-wide search now matches owned items on card number,
  set, variant, catalog IDs and cert number, labels results "In your
  collection / wishlist / business inventory" and ranks them above catalog
  rows.
- **A20 missing cards.** `vaultSetMastery.js`: when the catalog checklist is
  incomplete but the set size is known, missing cards are listed by number
  (`missingBasis: "numbers"`, `buildMissingNumberCards`), with names where the
  catalog has them.
- **A21 binder.** New `components/SetBinderView.jsx` (nine-pocket pages in
  card-number order, owned/missing/wishlist pockets, Got it / Want actions) as
  a third layout in set detail.
- **A22 trade analyzer.** Names the missing side instead of "Unknown Balance";
  the trade form offers a one-tap Market Watch estimate for the received item
  (`options.receivedEstimate`).
- **A23 price these.** Vault valuation panel gets a "Price these N items"
  button that filters to items with no market value.
- **A24 Spark age input.** `normalizeSparkAgeRange` accepts "6-8", "6 to 8",
  "ages 9–12", "under 6", "13+", "teen" or a single age; exact birthdates are
  still refused.
- **A25–A26 Spark honesty.** `SPARK_FEATURE_STATUS` renders a live/coming-soon
  panel at the top of The Spark before any form (fulfilment, giveaways and
  event sign-ups are marked not built).
- **A27–A28 review timing.** Posts record `safetyReviewReason`; pending copy
  and the save toast say whether the post is in the quick queue or held for a
  closer look, with the expected timing.
- **A29–A32 safety parity.** `validateTidepoolCommentDraft` and
  `validateMarketplaceListingDraft` run the same contact/address/child-safety
  detector as posts; unsafe patterns now cover F&F / FF / "no G&S" / Zelle-only
  phrasings and replica/counterfeit/fake/proxy/resealed wording. **This closes
  the P1 from both simulation rounds.**
- **A33–A35 exports.** Sales and mileage exports have a "Leave out names and
  notes" option (`includePrivateFields`, `stripPrivateSaleFields`,
  `stripPrivateTripFields`); the disclosure sentence updates with it and the
  file name gets a `-no-names` suffix.
- **A36–A37 sale dates.** `validateSaleDate` requires a real, non-future date;
  the sale form defaults to today; year-end and sales summaries no longer count
  undated sales in every year and report `undatedSaleCount` instead.
- **A38–A39 performance.** Year-end and set-completion inputs go through
  `useDeferredValue`, and set completion is computed once and filtered instead
  of twice.
- **A40 chunk size.** Not changed in this batch; it needs the #82 extraction
  and a measured `npm run build` on the development machine.
- **Rename.** The product names Forge and Scout are retired from user-facing
  copy: Forge → Business, Scout → Restocks, with phrase rules (restock
  report/points/alerts, watched store, Trusted/Active/New Reporter). Source
  strings were rewritten with an AST pass over string literals, template text
  and JSX text (single-word enum values, keys, imports, routes and storage keys
  untouched), and `config/plainLanguage.js` gained catch-all rules
  (`renameLegacyProductNames`) so anything still rendered from old data reads
  correctly. Routes (`/scout`, `/forge`), storage keys, DB names and code
  symbols are unchanged per the branding rule.
- Verification: new `npm run test:beta-corrections` (16 tests); backup,
  restore-preview (updated for A10), restore-compatibility, export-disclosure,
  legacy-backup, workspace-recovery, account-ops-restore, inventory-imports,
  import-review-safety, legacy-route-compatibility, manual-lifecycles,
  native-app-exports (harness updated), route-loading, role-management and
  year-end-export tests pass; every `src/` file parses with esbuild; the
  persona simulation now reports "Pricing copy vs gates: consistent".
- Not run: `npm run build` and ESLint (cloud workspace). Run `npm run build`
  and `npm run lint:src` on the development machine before release and record
  the chunk size for A40.

### October 31: tester-reaction corrections, batch 2 (items A41–A80)

Source: `BETA_SIMULATION_VOICES_2026_10_30.md`, section A, items 41–80. Product
decisions applied from `claude/code3-open-decisions.md`: free during beta,
Free = complete collector app, names Forge/Scout retired.

- **A41–A42 naming.** `plainLanguage.js` gained catch-all rules for the old
  brand feature names (Ember Watch → Watch Center, Ember ID → Public Profile,
  Ember/Tide Points → Daily Points, Tide Score → Trust Score, Tidepool →
  Community, Hearth → Home) and the AST copy pass was re-run (255 edited
  lines, enum strings/keys/routes untouched). The lone "Tide Watch" string is
  gone. Icon file names under `/assets/brand/ember-tide-*` and the Vercel
  project name are left for the rename decision (board item).
- **A44 dark mode.** Dark overrides added for the surfaces that kept a cream
  gradient: Spark sidebar, admin review hero, collection-set artwork, active
  exchange card.
- **A45 theme default.** With no saved choice the app follows the device's
  light/dark setting; only a choice the person makes is saved.
- **A46–A47 Home.** The "best action" card collapses to a one-line note when
  nothing is urgent.
- **A48–A51 kid-safe view.** New `utils/kidSafeView.js`: a profile whose
  collector/account type says kid gets no business strip or seller cards on
  Home, "—" instead of dollar amounts on Home/Market/Business/Collection
  pages, valuation panels hidden, community posting disabled with a plain
  explanation, and the trade "parent approval" note now says it is a
  reminder, not an approval step. Kid Mode proper stays in safety review.
- **A52–A56 plans.** All tier and add-on prices read "Free during beta",
  CTAs say "Ask the Code 3 team" (the request button opens the feedback form),
  the Shop card explains there is no checkout and staff seats are enabled by
  hand, and the partner seat add-on says the team adds a partner to your
  workspace on request. The assistant's plan answer matches.
- **A57–A59 selling.** `businessTaxRecords.js`: `SALES_CHANNEL_DEFAULTS` /
  `estimateChannelFees` pre-fill platform and processing fees per channel
  (editable, labelled as estimates); sale records carry `shipStatus`,
  `shipCarrier`, `trackingNumber`, `saleStatus`, `returnDate`,
  `quantityReturned`, `originalGrossSale`; `applySaleReturn` records a return
  or partial refund without losing the original amounts. The sale form and
  sale cards show these; exports include status columns.
- **A60–A62, A65–A66 honesty.** Marketplace says listings are drafts and the
  CSV is for other sites' bulk tools (no posting yet); Deal Finder explains it
  compares a price you enter and does not search for deals; receipt scan says
  there is no automatic reading yet.
- **A63–A64, A61 features.** Auction live-bid mode, pickup/trip planner and
  real cross-listing remain unbuilt; added to the tasks board, not faked.
- **A67–A71 import.** "Send every row to" buttons apply a destination to all
  rows in one tap (`applyImportBulkUpdates(overrides)`); the invalid-rows
  summary lists row numbers, item names and the specific problem (including
  "you typed 'two'"); the correction-CSV note explains why original rows are
  kept; "Existing Forge copy" reads "Matching item already in your Business
  inventory".
- **A72–A75 backup.** Coverage warnings name what the backup does not include;
  records without a stable ID are named and explained; the backup panel says a
  complete backup is two files and labels private files as step 2.
- **A77–A78 recovery.** The recovery sign-in explains why it appears (an
  interrupted save) and the "account changed" errors say what happened and
  what to do.
- **A79 quota.** New `utils/storageQuota.js` estimates localStorage use after
  saves and shows a banner at 75% / 90% with the backup path, before a save
  fails.
- Not changed: A43 (Vercel project name), A53 (payments: none during beta by
  decision), A76 (device transfer sign-in), A80 (wording preference).
- Verification: `npm run test:beta-corrections` now runs batch 1 (16) and
  batch 2 (6); restore-preview and export-disclosure tests updated for the new
  copy; backup, compatibility, legacy backup, recovery, account-ops, imports,
  import safety, native exports, year-end, roles, lifecycles, routes and
  review-presentation tests pass; all `src/` files parse. Build and ESLint
  still need the development machine.

### October 31 (later): verified feedback findings F01–F20 (QA report `feedback-20-verified-20261030`)

The Codex report fixed these on an unpushed branch built on a newer `main`;
the same behaviors were implemented here against the working copy. Nothing
below rewrites saved records, routes, DB keys or code symbols.

- **F01 cloud account switch.** `CloudSyncPanel` now renders its controls
  keyed by the signed-in user id, so a conflict review, cloud history or
  device-copy list opened for one account is discarded when the workspace
  switches accounts; late operations were already aborted and are ignored.
- **F02/F03 screenshot review.** A new or removed screenshot resets the
  reviewed store, time, products and status; editing the extracted text after
  reviewing marks the review stale and disables Apply until re-reviewed.
- **F04–F08 screenshot parsing** (`utils/stockScreenshotDraft.mjs`): changing
  the reviewed game clears the previous catalog identity and artwork;
  questions without a question mark ("Is X in stock at Target") are not
  claims; "never sold out" needs review instead of becoming no-stock; a bare
  "Sold out" line with no product nearby is ignored and flagged; products
  past the 8-item list are counted (`omittedProductCount`) and flagged
  `product_list_truncated` instead of being dropped.
- **F09/F10 business search.** New `utils/businessInventorySearch.mjs`: SKU,
  barcode, UPC, catalog/TCGplayer/cert IDs (with or without dashes), game
  name/abbreviation, language, edition, grader, grade and storage fields in
  camelCase or snake_case are searchable in Business and Collection lists.
- **F11 lists.** Business record lists show 24 rows then a "Show 24 more"
  button with "Showing N of M" (`RevealMoreList`), instead of silently
  stopping at 24.
- **F12–F14 totals.** New `utils/businessInventoryTotals.mjs`: quantity
  aliases (`ownedQuantity`, `quantity_on_hand`, …) are honored and an unknown
  quantity shows "Not recorded" rather than 0 / sold out, with the Units on
  hand metric saying how many items have no saved quantity; "Available cost"
  is the cost of the units still in stock after sales; "Projected resale" is
  per-unit midpoint × remaining units, keeps explicit $0 estimates, and its
  helper text says how many items have no estimate. Cards and detail label
  the midpoint "per unit".
- **F15 forms.** Projected resale low/mid/high inputs use `??` so a saved 0 is
  no longer blanked when editing.
- **F16 value visibility.** The Collection "hide values" eye also hides
  acquisition cost, purchase cost, allocated cost and estimates on the item
  detail and in wishlist/grading/unassigned cards.
- **F17 currency.** `getPortfolioItemValuation` reads a saved price/estimate
  currency; non-USD estimates stay saved and are shown as "5 EUR (not
  converted)" but are excluded from the USD total, the estimate note lists
  them, and the CSV gains an "Estimate currency" column. Explicit USD wins.
- **F18 presentation boundary.** New `utils/recordPresentation.mjs`
  (`presentAmount`, `presentMoney`, `recordCurrency`): booleans, blank
  strings, negatives and Infinity present as "Not recorded" while numeric 0
  still shows $0.00. `money()` in the everyday workspaces uses it; records
  are never changed.
- **F19 portfolio export.** Uses the shared `exportFile` adapter (browser
  download or mobile share sheet), guards duplicate taps with a ref, reports
  cancellation/failure honestly, and the button says "Export this portfolio"
  / "Export all portfolios".
- **F20 login.** `handleAuth` has a synchronous `authInFlightRef` guard set
  before the provider call and cleared in `finally`, so a double submit before
  the re-render cannot reach Supabase twice.
- Verification: `npm run test:feedback-20-findings` (17 tests); collection
  portfolio test updated for the new valuation fields; beta-corrections (22)
  and export-disclosure (7) pass; all `src/` files parse. Build and ESLint
  still need the development machine.
