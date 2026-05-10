# Supabase Recovery Plan

Project ref: `gxsfququorfczvhrkudl`

## Current Issue

The linked Supabase database became unavailable after a migration backfill in
`20260509170000_normalized_pokemon_catalog_model.sql`.

Observed database errors:

- `No space left on device`
- `database system is shut down`
- `database system is not accepting connections`
- `Hot standby mode is disabled`
- `database system was interrupted while in recovery`
- possible data corruption requiring restore from last backup

Do not run `db push`, migration repair, SQL writes, manual drops, inserts,
updates, or deletes until the database is recovered and read-only inspection has
been reviewed.

## If Supabase Support Restores The DB

1. Run only:

   ```powershell
   npx.cmd supabase migration list --linked
   ```

2. Report whether these migrations are applied or pending:

   - `20260509003000`
   - `20260509004500`
   - `20260509170000`
   - all later pending migrations

3. Inspect partial state read-only:

   - `product_catalog`
   - `catalog_products`, if present
   - `catalog_product_variants`
   - `product_identifiers`
   - `tcg_card_details`
   - `pokemon_card_details`, if present
   - views, indexes, and RLS policies created by `20260509170000`

4. Stop for approval before any push, repair, or write.

## If The DB Does Not Recover

1. Preserve the local recovery snapshot in:

   ```text
   artifacts/supabase-recovery-snapshot
   ```

2. Create a new Supabase project.
3. Link the new project locally.
4. Apply schema-safe migrations only.
5. Confirm `20260509170000_normalized_pokemon_catalog_model.sql` does not run
   large automatic catalog backfills during `db push`.
6. Rebuild/import catalog and market data in batches, not through automatic
   migration backfills.
7. Run verification and signed-in persistence QA before shipping.

## New Supabase Project Steps

1. Create the new Supabase project in the dashboard.
2. Record the new project ref.
3. Link locally:

   ```powershell
   npx.cmd supabase link --project-ref <new-project-ref>
   ```

4. Confirm migration history:

   ```powershell
   npx.cmd supabase migration list --linked
   ```

5. Apply only schema-safe migrations first. The normalized catalog schema
   migration no longer runs the heavy catalog backfills automatically.

6. Run:

   ```powershell
   npx.cmd supabase db push --linked
   ```

7. Run schema verification:

   ```powershell
   npm.cmd run verify:phase2:supabase
   ```

8. Run local app checks:

   ```powershell
   npm.cmd run build
   npm.cmd run backend:build
   npm.cmd run smoke:beta
   ```

9. Update local environment variables outside git:

   - `.env.local`
   - `.env`
   - `backend/.env`

10. Update Vercel environment variables for Preview and Production.

11. Redeploy after local verification passes.

12. Test signed-in persistence before running catalog backfills.

## New-Project Migration Checklist

Apply migrations in filename order. Do not run catalog data backfills as part of
`db push`.

Schema-safe migration order:

1. `002_shared_virginia_catalog.sql`
2. `003_user_profile_home_stats.sql`
3. `004_user_profile_dashboard_layout.sql`
4. `005_user_profile_subscription_plan.sql`
5. `006_feature_tiers.sql`
6. `008_forge_expense_marketing_fields.sql`
7. `009_catalog_image_sources.sql`
8. `010_profiles_roles_tiers.sql`
9. `011_universal_data_approval_system.sql`
10. `012_marketplace_listings.sql`
11. `20260508203900_pokemon_market_ingestion_schema.sql`
12. `20260508213000_product_catalog_public_pokemon_read.sql`
13. `20260508214500_admin_product_catalog_controls.sql`
14. `20260509001500_auth_metadata_admin_access.sql`
15. `20260509003000_pokemon_card_number_sorting.sql`
16. `20260509004500_market_price_history_snapshots.sql`
17. `20260509170000_normalized_pokemon_catalog_model.sql`
18. `20260509183000_beta1_rls_hardening.sql`
19. `20260510035208_bestbuy_restock_monitoring.sql`
20. `20260510093000_product_identifier_scan_support.sql`
21. `20260510113000_workspace_access_model.sql`
22. `20260510163000_restore_pokemon_catalog_browse_fast_search.sql`
23. `20260510172000_admin_visible_private_scout_reports.sql`
24. `20260510172500_harden_admin_visibility_helpers.sql`
25. `20260510190000_master_catalog_market_foundation.sql`
26. `20260510203000_tcg_operating_system_foundation.sql`

Deferred data/backfill work:

- product catalog kind classification
- sealed product type inference
- pack count and contents metadata
- MSRP metadata
- product identifiers
- catalog product variants
- default variant selection
- TCG card details
- expansion ID linking
- large catalog imports from Pokemon TCG API or TCGCSV
- market price history refreshes

Before running `db push` on a new project:

1. Confirm no migration contains large automatic data scans/backfills.
2. Confirm `20260509170000_normalized_pokemon_catalog_model.sql` contains the
   “Large catalog backfills are intentionally not run” comment.
3. Confirm `scripts/backfill-normalized-catalog-batches.cjs` exists.
4. Run local checks:

   ```powershell
   npm.cmd run build
   npm.cmd run backend:build
   npm.cmd run smoke:beta
   ```

After schema push:

1. Run:

   ```powershell
   npm.cmd run verify:phase2:supabase
   ```

2. Confirm all expected Phase 2 tables, indexes, grants, and RLS policies exist.
3. Do signed-in persistence QA.
4. Only then run catalog backfills intentionally.

## Batch Catalog Rebuild

Run catalog backfills only after schema migrations are applied and the database
has enough storage headroom.

Dry-run:

```powershell
npm.cmd run backfill:normalized-catalog -- --dry-run
```

Run all sections:

```powershell
npm.cmd run backfill:normalized-catalog -- --section all --batch-size 250
```

Run one section:

```powershell
npm.cmd run backfill:normalized-catalog -- --section product-kind --batch-size 250
```

Limit test batches:

```powershell
npm.cmd run backfill:normalized-catalog -- --section product-kind --batch-size 250 --max-batches 1
```

Backfill sections:

- `product-kind`
- `sealed-type`
- `pack-count`
- `msrp-metadata`
- `barcode-identifiers`
- `tcgplayer-product-identifiers`
- `tcgplayer-external-identifiers`
- `pokemontcg-identifiers`
- `variants-from-current`
- `variants-from-catalog`
- `default-variant`
- `tcg-card-details`
- `expansion-pokemontcg`
- `expansion-tcgplayer`

Verify counts after each batch section with read-only SQL:

```sql
select count(*) from public.product_catalog;
select count(*) from public.product_identifiers;
select count(*) from public.catalog_product_variants;
select count(*) from public.tcg_card_details;
select count(*) from public.product_catalog where product_kind is not null and product_kind <> 'unknown';
select count(*) from public.product_catalog where expansion_id is not null;
```

If a batch fails:

1. Stop immediately.
2. Do not rerun with a larger batch size.
3. Check database health and available storage.
4. Run read-only count queries to identify partial progress.
5. Reduce `--batch-size`.
6. Resume the same section only after the error cause is understood.
7. Do not run migration repair for batch-script failures.

## Environment Variables To Update

Do not commit actual values.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL` or `DATABASE_URL`
- Vercel frontend environment variables matching the public Supabase URL/key
- Vercel backend/API environment variables for Supabase service access and DB
  connection

## Vercel Redeploy Checklist

1. Update Preview environment variables.
2. Update Production environment variables.
3. Redeploy Preview first.
4. Run signed-in QA against Preview.
5. Promote or redeploy Production only after Preview passes.
6. Keep the old project credentials available outside git until rollback is no
   longer needed, then rotate or revoke them.

## Signed-In Persistence QA

After schema verification passes:

- Sign in with a real Supabase user.
- Confirm dashboard sync status is accurate.
- Deal Finder: save, reload, and confirm persistence.
- Scanner intake: save, reload, and confirm persistence.
- Receipts: save draft/transcript, reload, and confirm persistence.
- Notifications: change preferences, reload, and confirm persistence.
- Marketplace: create/save listing drafts and channel exports.
- Kid Pack Builder: save project, reload, and confirm persistence.

## Rollback Plan

- If the restored project is unstable, pause writes and open a Supabase support
  escalation with the no-space and recovery-failure logs.
- If a new project migration fails, stop immediately and inspect migration
  history before retrying.
- If batch backfill pressure becomes too high, reduce `--batch-size`, run one
  section at a time, and pause between sections.
- Keep the old project env values available outside git until the new project is
  verified, then rotate any exposed or obsolete credentials.
