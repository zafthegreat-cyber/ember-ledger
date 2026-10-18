# Receipt privacy compatibility audit

Read-only production checks on October 18, 2026. This narrows the compatibility risk; it is not confirmation that private file access has been deployed or tested on a phone.

## What was checked

Queries returned aggregate counts and schema metadata only. They did not return account identifiers, saved URLs, object names, file contents, or price values. No production table, record, file, permission, or bucket setting was changed.

- The four attachment buckets contained one object in `receipts` and no objects in the other three buckets at the time of the query. That object had an owner and no conflicting owner fields. The bucket remains public pending the staged privacy rollout.
- No legacy `/storage/v1/object/.../receipts/` references matched the checked image/photo fields in `product_catalog`, `pokemon_products`, `master_catalog_items`, `master_catalog_variants`, `listing_photos`, `marketplace_listings`, `store_reports`, `inventory_items`, `business_expenses`, `mileage_trips`, or `receipt_records`.
- No `/receipts/` reference matched current cloud workspace source groups, preserved workspace revisions, Scout report review snapshots, or catalog suggestion snapshots.

These are scoped string-reference checks. They do not establish the intended content of the existing object, cover browser-only drafts/downloaded backups, prove all possible historical URL encodings are absent, or authorize deleting an unreferenced file. An apparently unreferenced file may still belong to an existing device copy. Keep its original path and bytes.

## Remaining rollout proof

1. Test the private-access migration with synthetic owner, other-account, and anonymous requests against hosted Storage.
2. Release the authenticated receipt resolver before changing the existing public bucket.
3. Confirm the actual owner can open the preserved object through the updated app without changing its saved URL or bytes. Confirm former anonymous public access fails after the bucket migration.
4. Check representative existing item/report photos on both phones. Preserve downloaded backups and the old PWA until the native transfer comparison is complete.

No public artwork needs to be copied based on the aggregate matches above. If a later check finds an intentionally public artwork reference to a receipt object, review that specific object and its publication rights before planning a separate copy/reference change. Do not automatically publish receipt proof or reopen the entire bucket.

## Retention evidence and remaining limits

The signed-in production dashboard was inspected read-only on October 18, 2026. No restore, add-on, logging, or other setting was changed.

- The organization is on Pro. Scheduled backups displayed daily physical snapshots dated October 11 through October 18. The newest was October 18 at 11:26:34 UTC; the oldest was October 11 at 11:26:33 UTC. This verifies actual daily backup availability at inspection, not an exact permanent-erasure deadline.
- Point-in-time recovery was **not enabled**: its page offered the optional add-on. No add-on was purchased.
- The dashboard states that database backups contain Storage metadata but exclude Storage object bytes; restoring an old database backup does not recover files already removed through Storage.
- The log-drain settings showed no configured destinations. Supabase documents seven days of project-log access for the current Pro plan. Provider-internal security/support retention and actual purge schedules were not established by these settings.

The public policy now distinguishes these documented access windows from deletion deadlines. Supabase's documented seven-day backup window is not a promise that every provider-held copy disappears within exactly seven days; even the oldest visible snapshot was slightly older than seven days at inspection. See [database backups](https://supabase.com/docs/guides/platform/backups) and [plan log access](https://supabase.com/pricing).

The separate [Vercel retention audit](./VERCEL_RETENTION_AUDIT_2026-10-18.md) verifies the actual Hobby deployment and no configured drains. Its documented one-hour runtime-log window does not cover build logs, which Vercel retains separately per deployment. Provider-internal retention, separate operator-held copies, and permanent-erasure timing remain submission review items. Do not promise that cloud deletion erases copies on other devices or files downloaded by the user.

Local evidence, excluded from Git: `artifacts/qa/mobile-beta/privacy-support/supabase-backups.png` and `supabase-pitr.png`.

See [receipt compatibility](./RECEIPT_PRIVACY_COMPATIBILITY.md) and [account-deletion rollout](./ACCOUNT_DELETION_ROLLOUT.md).
