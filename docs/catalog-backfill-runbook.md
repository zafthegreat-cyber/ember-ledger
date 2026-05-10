# Catalog Backfill Runbook

Do not run catalog backfills until schema verification passes and the user explicitly approves the run. These scripts intentionally do not run during `db push`, build, backend build, or smoke tests.

## Prerequisites

- `npm.cmd run verify:phase2:supabase` passes against the target project.
- `npm.cmd run backend:build`, `npm.cmd run build`, and `npm.cmd run smoke:beta` pass.
- The database is stable after multiple read-only checks.
- A backup, restore point, or support-approved recovery path is available if possible.
- `SUPABASE_DB_URL` or `DATABASE_URL` is set locally and never printed.

Use Windows CMD syntax:

```cmd
if defined SUPABASE_DB_URL (echo SUPABASE_DB_URL is set) else (echo SUPABASE_DB_URL is missing)
```

## Safety Rules

- Start with dry runs only.
- Start with batch sizes from `100` to `250`.
- Run one section at a time until confidence is high.
- Stop immediately on connection resets, disk/storage warnings, timeouts, lock waits, or unexpected row counts.
- Do not run both normalized and master catalog backfills at the same time.
- Do not run during app launch, imports, or other database-heavy work.
- Never paste or commit DB URLs, passwords, service keys, or access tokens.

## Dry Runs

Run these first, without executing data changes:

```cmd
npm.cmd run backfill:normalized-catalog -- --dry-run
npm.cmd run backfill:normalized-catalog -- --section identifiers --dry-run
npm.cmd run backfill:master-catalog -- --dry-run
npm.cmd run backfill:master-catalog -- --section items --dry-run
```

## Normalized Catalog Sections

Recommended first-pass batch size:

```cmd
npm.cmd run backfill:normalized-catalog -- --section product-kind --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section sealed-type --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section pack-count --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section msrp-metadata --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section identifiers --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section variants --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section default-variants --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section card-details --batch-size 100 --max-batches 1
npm.cmd run backfill:normalized-catalog -- --section expansion-links --batch-size 100 --max-batches 1
```

Increase to `--batch-size 250` only after the first tiny batches are stable.

## Master Catalog Sections

Recommended first-pass batch size:

```cmd
npm.cmd run backfill:master-catalog -- --section items --batch-size 100 --max-batches 1
npm.cmd run backfill:master-catalog -- --section identifiers --batch-size 100 --max-batches 1
npm.cmd run backfill:master-catalog -- --section variants --batch-size 100 --max-batches 1
npm.cmd run backfill:master-catalog -- --section price-sources-product-catalog --batch-size 100 --max-batches 1
npm.cmd run backfill:master-catalog -- --section price-sources-current --batch-size 100 --max-batches 1
npm.cmd run backfill:master-catalog -- --section summaries --batch-size 100 --max-batches 1
```

Run `items` before identifiers, variants, price sources, or summaries. Run `summaries` after price sources.

## Count Checks

After each approved batch, check counts with read-only SQL or a future verification script:

- `product_catalog`
- `tcg_expansions`
- `product_identifiers`
- `catalog_product_variants`
- `tcg_card_details`
- `master_catalog_items`
- `master_catalog_identifiers`
- `master_catalog_variants`
- `master_market_price_sources`
- `master_market_summaries`

Expected behavior:

- Pending counts decrease for the section being run.
- Total inserted/updated counts grow gradually.
- Re-running the same section skips already-processed rows.
- No duplicate identifiers or variants appear.

## Stop Conditions

Stop immediately if any of these occur:

- Database connection reset/refused.
- Storage/disk/no-space warnings.
- Query timeout or statement timeout.
- Batch count is unexpectedly huge.
- Duplicate key errors.
- RLS or permission errors in scripts.
- App verification starts failing after a batch.

## Retry Notes

The scripts are intended to be idempotent. If a batch fails, do not delete data manually. First inspect the failed section, confirm the database is stable, rerun dry-run for that section, and then retry only that section with a smaller batch size.

## Rollback Notes

Prefer restore points/backups over manual deletes. If a bad batch creates incorrect data, pause and prepare a targeted correction plan for review before any live mutation.

