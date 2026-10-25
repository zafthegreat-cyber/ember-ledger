# Inventory, screenshot review and sync-navigation UI review

October 25, 2026. Branch: `codex/app-ui-notices-20261025`.

This is local review work. Publication requires the user's approval of the phone
and desktop previews. No push, merge, deployment or live settings change was made.

## Behavior and files

- `src/pages/EverydayWorkspaces.jsx`, `src/pages/everyday-workspaces.css` and
  `src/utils/businessInventorySearch.mjs`: the current Business Inventory route
  has inline, labeled multi-field search, stock filters with selected states,
  clear filters, matching/total counts, distinct no-match and empty states, and
  a read-only Show more action beyond 24 records. Search and filters appear
  before the unchanged all-inventory metrics, available in a native disclosure.
  The compact phone header and quieter Back action are Inventory-specific.
  Existing authoritative quantity, sale/return, cost and resale calculations
  are reused; original records and their order are retained.
- `src/components/StockScreenshotImport.jsx` and its CSS: initial intake shows
  upload/paste/manual entry. Extraction or manual entry opens the review fields.
  Applying validated details shows a compact confirmation with Edit details
  restoring the same choices. Focus follows explicit review/error/edit actions.
  The report-modal close target is now at least 44 × 44 pixels. OCR parsing,
  exact store/time requirements, private indirect provenance, cancellation,
  entered-field preservation and replacement opt-in are unchanged. Applying
  details still edits a draft; final report saving remains a separate action.
- `WorkspaceSyncNotice.jsx`, `useCloudSyncReviewNavigation.js`,
  `CloudWorkspaceBoundary.jsx`, `src/App.jsx`, `src/pages/Menu.jsx` and
  `cloud-workspace.css`: Review changes uses the existing guarded Settings
  navigation, opens Cloud saving & recovery, and focuses its native summary.
  Accepted navigation dismisses only that specific floating notice so it does
  not cover the recovery controls. Declined navigation retains the notice.
  Underlying conflict status and both versions remain preserved. New revisions,
  changed conflict sets and account changes can still display a new notice.
  This action never calls sync, load, conflict review/resolution or restore.

## Verification

- Production build passed. Focused ESLint has zero errors and one existing
  App.jsx `checkUser` dependency warning. Existing large-chunk and ineffective
  dynamic-import build warnings remain. No generic lint/typecheck/test npm
  scripts exist; focused scripts were used.
- `test-ui-workflow-polish-browser.cjs`: 471 checks in 12 cases covering
  390 × 844 and 1440 × 1000, light/dark, all three workflows. Real page,
  navigation, brand, screenshot and recovery components; synthetic records,
  isolated callbacks and deterministic OCR Worker output. No provider calls,
  unexpected requests or page errors. Local/session/IndexedDB record, photo
  and price sentinel bytes remain identical. Minimum sampled contrast 6.20:1;
  touch targets, focus, overflow and actual click obstruction were checked.
- `test-stock-screenshot-import-browser.cjs`: six full-app cases at
  320/390/1440 in light/dark with the genuine local OCR engine. Tests include
  draft review, editing, preservation/replacement, fallback, cancellation,
  private final-only save and retained original synthetic records/prices.
  All external requests were blocked; startup product-image attempts did not
  leave the isolated browser. OCR itself requested only local assets.
- `test-sync-review-navigation-browser.cjs`: 96 checks using the actual App
  utility-navigation function, real navigation hook and Settings. Keyboard
  activation, rejected leave guard, accepted notice dismissal, exact conflict
  status, repeat requests, request consumption and owner isolation pass;
  no transport, storage or IndexedDB calls are triggered.
- Existing notice tests: 198 checks; the fixture now serves the production
  semantic token stylesheet so focus checks use actual values.
- Inventory helper tests and 93 workspace UI contracts pass. Existing screenshot
  draft/cloud/OCR safety checks pass (43/32/15); cloud workspace checks pass (20),
  price-preservation checks pass (14), route compatibility passes (49).

## Evidence and limits

Ignored local evidence is under `artifacts/qa/`:

- `ui-workflow-polish-20261025/preview.html` and `results.json` — 54 screenshots,
  full viewport and optional full-page views, generated from passing cases only.
- `stock-screenshot-import/results.json` — genuine OCR/full-app checks.
- `sync-review-navigation-20261025/results.json` — guarded navigation checks.
- `workspace-sync-notice/results.json` — existing notice behavior.

No production account, record, attachment or price was changed. Catalog/pricing,
sync transport, database schema, authentication and integrations were not edited.
The approved artwork and existing font/theme system remain in use. The website
and bot projects were not modified.

These are isolated browser checks and desktop/phone viewport previews. They do
not certify physical iPhone/Android behavior, native beta distribution or real
phone/computer account sync. The user's physical-device acceptance remains
paused. Production's existing conflict was not resolved or loaded for this work.
