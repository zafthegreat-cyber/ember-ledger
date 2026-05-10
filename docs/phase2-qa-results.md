# Phase 2 QA Results

Date: 2026-05-10

## Passed

- Supabase migration verification: 77/77 checks passed.
- Cloud sign-in works with a real Supabase user.
- Dashboard shows Supabase connected after sync settles.
- Local only mode is gone in cloud mode.
- Deal Finder save/reload works.
- Scanner Intake save/reload works.
- Marketplace draft save/reload works.
- Marketplace exports run from persisted channel draft data.
- Notification preferences are reachable and support toggle/reload testing.
- Kid Pack Builder project/items save/reload works.
- Local beta smoke is isolated from cloud `.env.local` settings.
- Backend build passes.
- Frontend build passes.
- `smoke:beta` passes in forced local beta mode.

## View-Only / Documented

- Deal Finder saved rows are labeled View only.
- Deal Finder edit/resave is not supported yet and should not be counted as passed.

## Source-Verified / Automation-Blocked

- Receipt persistence is source-verified, but final UI save/reload proof is deferred.
- Reason: browser automation became unreliable due to native date/input wedging and later browser timeouts. This is not a confirmed app logic failure.
- QA unlock works.
- Receipt form is accessible with the QA unlock enabled.
- `Fill QA Receipt Draft` is QA-only and does not write directly to Supabase.
- Expense submit calls `persistReceiptWorkflowFromExpense`.
- `parseReceiptText` runs for receipt transcript line parsing.
- `saveReceiptRecord` writes `receipt_records`.
- Receipt line rows write `receipt_line_items`.
- Load path reads `receipt_records` and `receipt_line_items`.
- TCG OS receipt row exposes loaded receipt line counts.
- No RLS or missing-table errors were observed before browser automation timed out.

## Not Run

- Catalog backfills.
- OCR provider integration.
- SMS/push provider integration.
- Marketplace real provider exports.
- Online restock monitoring providers.

## Safety Confirmations

- No `db push` was run after final verification.
- No migration repair was run.
- No manual SQL writes were run.
- No direct data fixes were run.
- No backfill scripts were run.
- No provider integrations were run.
