# New Supabase Project Migration Checklist

Use this only if project `gxsfququorfczvhrkudl` cannot be restored safely.

## Ground Rules

- Do not run large catalog backfills during `db push`.
- Do not run migration repair on a new project unless a migration history
  problem is clearly understood and approved.
- Do not commit env values or credentials.
- Apply schema first, verify, then backfill data in small batches.

## Schema Migration Order

Run migrations in filename order:

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

## Schema-Safe Notes

- `20260509003000_pokemon_card_number_sorting.sql` drops and recreates
  `public.pokemon_catalog_browse` to avoid view column-layout conflicts.
- `20260509170000_normalized_pokemon_catalog_model.sql` creates schema objects,
  indexes, views, and policies, but does not run heavy catalog backfills.
- Phase 2 workflow schema is in `20260510203000_tcg_operating_system_foundation.sql`.

## Deferred Backfills

Run these later through `scripts/backfill-normalized-catalog-batches.cjs`:

- product kind classification
- sealed product type inference
- pack count/content metadata
- MSRP metadata
- barcode identifiers
- TCGplayer identifiers
- PokemonTCG API identifiers
- catalog variants
- default variant selection
- TCG card details
- expansion ID linking

## Backfill Commands

Dry-run all sections:

```powershell
npm.cmd run backfill:normalized-catalog -- --dry-run
```

Run one small test batch:

```powershell
npm.cmd run backfill:normalized-catalog -- --section product-kind --batch-size 250 --max-batches 1
```

Run one full section:

```powershell
npm.cmd run backfill:normalized-catalog -- --section product-kind --batch-size 250
```

Run all sections only after individual sections are proven stable:

```powershell
npm.cmd run backfill:normalized-catalog -- --section all --batch-size 250
```

## Count Verification

After each section, run read-only count checks:

```sql
select count(*) from public.product_catalog;
select count(*) from public.product_identifiers;
select count(*) from public.catalog_product_variants;
select count(*) from public.tcg_card_details;
select count(*) from public.product_catalog where product_kind is not null and product_kind <> 'unknown';
select count(*) from public.product_catalog where expansion_id is not null;
```

## Stop Conditions

Stop immediately if any batch reports:

- connection reset/refused
- no space left on device
- statement timeout
- database not accepting connections
- unexpected constraint violation

After a stop:

1. Do not retry with the same or larger batch size.
2. Check database health and storage.
3. Inspect read-only counts.
4. Resume only the failed section after understanding the failure.
