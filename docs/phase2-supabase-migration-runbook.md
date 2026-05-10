# Phase 2 Supabase Migration Runbook

Project ref: `gxsfququorfczvhrkudl`

Pending local migrations:

- `supabase/migrations/20260510190000_master_catalog_market_foundation.sql`
- `supabase/migrations/20260510203000_tcg_operating_system_foundation.sql`

## Apply With Supabase SQL Editor

Use this path when the CLI is not linked or the current agent session cannot run writable DDL.

1. Open the Supabase dashboard for project `gxsfququorfczvhrkudl`.
2. Open SQL Editor.
3. Open this local file and copy the full contents:
   `C:\Users\Zena\Apps\Embers ledger\ember-ledger\supabase\migrations\20260510190000_master_catalog_market_foundation.sql`
4. Paste into SQL Editor and run it.
5. If it succeeds, record the migration history row:

```sql
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260510190000',
  'master_catalog_market_foundation',
  array['Applied manually from supabase/migrations/20260510190000_master_catalog_market_foundation.sql']
)
on conflict (version) do nothing;
```

6. Open this local file and copy the full contents:
   `C:\Users\Zena\Apps\Embers ledger\ember-ledger\supabase\migrations\20260510203000_tcg_operating_system_foundation.sql`
7. Paste into SQL Editor and run it.
8. If it succeeds, record the migration history row:

```sql
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260510203000',
  'tcg_operating_system_foundation',
  array['Applied manually from supabase/migrations/20260510203000_tcg_operating_system_foundation.sql']
)
on conflict (version) do nothing;
```

9. Refresh PostgREST schema cache if needed:

```sql
notify pgrst, 'reload schema';
```

10. Run verification:

```powershell
cd "C:\Users\Zena\Apps\Embers ledger\ember-ledger"
npm run verify:phase2-supabase
```

Equivalent requested alias:

```powershell
npm run verify:phase2:supabase
```

For full index/RLS/policy verification, set one of these before running the script:

```powershell
$env:SUPABASE_DB_URL="postgresql://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
npm run verify:phase2-supabase
```

## Idempotency And Failure Notes

The migrations are designed to be safe to rerun where possible:

- Tables use `create table if not exists`.
- Indexes use `create index if not exists`.
- Policies and triggers are dropped with `drop policy/trigger if exists` before recreation.
- Backfills use `on conflict do nothing`, `on conflict do update`, or `not exists` guards.
- Views use `create or replace view` where possible.

Known things that can still fail:

- `20260510190000` drops and recreates `public.pokemon_catalog_browse`; if another live object depends on that view, Postgres may reject the drop unless the dependency is removed or the migration is adapted.
- `20260510190000` reads from legacy tables such as `product_catalog` and `product_market_price_current`; if those tables or referenced columns are missing, the backfill section can fail.
- Both migrations reference `public.is_admin_or_moderator()` in policies; that helper must exist first.
- `20260510203000` references `public.master_catalog_items`, so run `20260510190000` before `20260510203000`.
- SQL Editor manual apply does not automatically write migration history; add the history rows only after each migration succeeds.

## Apply With Supabase CLI

Use this path when the local machine has a writable Supabase CLI session.

```powershell
cd "C:\Users\Zena\Apps\Embers ledger\ember-ledger"
supabase --version
supabase login
supabase link --project-ref gxsfququorfczvhrkudl
supabase migration list --linked
supabase db push --linked
npm run verify:phase2-supabase
```

If the project is not linked but you have a direct DB URL:

```powershell
cd "C:\Users\Zena\Apps\Embers ledger\ember-ledger"
$env:SUPABASE_DB_URL="postgresql://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
supabase db push --db-url "$env:SUPABASE_DB_URL"
npm run verify:phase2-supabase
```

Do not run `migration repair` unless the SQL has already succeeded and only the history table is wrong.

## Migration 20260510190000: Master Catalog + Market Foundation

Creates/updates extension:

- `pg_trgm`

Tables:

- `master_catalog_items`
- `master_catalog_variants`
- `master_catalog_identifiers`
- `master_market_price_sources`
- `master_market_summaries`
- `universal_data_suggestions`

Views:

- `catalog_search_lightweight`
- `catalog_item_details`
- `pokemon_catalog_browse`
- `universal_data_review_queue`

Indexes:

- `master_catalog_identifiers_unique_idx`
- `master_catalog_items_type_idx`
- `master_catalog_items_name_trgm_idx`
- `master_catalog_items_set_name_trgm_idx`
- `master_catalog_items_product_type_trgm_idx`
- `master_catalog_items_card_number_idx`
- `master_catalog_items_tcgplayer_idx`
- `master_catalog_items_verified_name_idx`
- `master_catalog_identifiers_lookup_idx`
- `master_catalog_identifiers_value_trgm_idx`
- `master_catalog_variants_item_idx`
- `master_market_sources_item_idx`
- `master_market_sources_lookup_idx`
- `universal_data_suggestions_status_idx`
- `universal_data_suggestions_target_idx`

Function:

- `public.set_updated_at()`

Triggers:

- `set_master_catalog_items_updated_at`
- `set_master_catalog_variants_updated_at`
- `set_master_catalog_identifiers_updated_at`
- `set_master_market_price_sources_updated_at`
- `set_master_market_summaries_updated_at`
- `set_universal_data_suggestions_updated_at`

RLS policies:

- `Public read master catalog items`
- `Public read master catalog variants`
- `Public read approved catalog identifiers`
- `Public read master market price sources`
- `Public read master market summaries`
- `Users create universal data suggestions`
- `Users read own universal data suggestions`
- `Admins manage master catalog items`
- `Admins manage master catalog variants`
- `Admins manage master catalog identifiers`
- `Admins manage master market price sources`
- `Admins manage master market summaries`
- `Admins manage universal data suggestions`

Other behavior:

- Backfills normalized master catalog rows from `product_catalog`.
- Backfills identifiers and market summaries from existing catalog/current market tables.
- Grants read access on catalog/search views and suggestion access to authenticated users.
- Sends `notify pgrst, 'reload schema'`.

## Migration 20260510203000: TCG Operating System Foundation

Tables:

- `app_user_preferences`
- `notification_preferences`
- `deal_finder_sessions`
- `deal_finder_items`
- `scanner_intake_sessions`
- `marketplace_listing_channels`
- `receipt_records`
- `receipt_line_items`
- `kid_community_projects`
- `kid_community_project_items`
- `user_trust_profiles`

Views:

- None

Indexes:

- `app_user_preferences_user_idx`
- `notification_preferences_user_type_idx`
- `deal_finder_sessions_user_created_idx`
- `deal_finder_items_session_idx`
- `scanner_intake_sessions_user_created_idx`
- `marketplace_listing_channels_workspace_status_idx`
- `receipt_records_user_created_idx`
- `kid_community_projects_workspace_status_idx`

Functions/triggers:

- None

RLS policies:

- `Users manage own app preferences`
- `Users manage own notification preferences`
- `Users manage own deal sessions`
- `Users read own deal items`
- `Users write own deal items`
- `Users manage own scanner sessions`
- `Users manage own marketplace channels`
- `Users manage own receipts`
- `Users read receipt lines for own receipts`
- `Users write receipt lines for own receipts`
- `Users manage own community projects`
- `Users read own community project items`
- `Users write own community project items`
- `Users manage own trust profile`

Other behavior:

- Grants `select, insert, update, delete` on Phase 2 workflow tables to authenticated users.
- Sends `notify pgrst, 'reload schema'`.

## Post-Apply Validation

Run:

```powershell
cd "C:\Users\Zena\Apps\Embers ledger\ember-ledger"
npm run build
npm run backend:build
npm run smoke:beta
npm run verify:phase2:supabase
```

Manual signed-in QA checklist:

- Deal Finder:
  - Sign in with a real Supabase user.
  - Open TideTradr -> Deal Finder.
  - Enter title, asking price, market total, MSRP total, and notes.
  - Save the Deal Finder session.
  - Reload the app.
  - Confirm the saved session reloads from Supabase and the dashboard does not say local fallback.
- Scanner:
  - Sign in with a real Supabase user.
  - Open scanner intake.
  - Search/scan a UPC, SKU, or manual product clue.
  - Choose a destination such as Deal Finder, Wishlist, Vault, Forge, or Store Report.
  - Reload the app.
  - Confirm scanner intake persists from `scanner_intake_sessions`.
- Receipts:
  - Sign in with a real Supabase user.
  - Add a business expense.
  - Upload/take receipt image or paste receipt transcript text.
  - Save the expense.
  - Confirm `receipt_records` and parsed `receipt_line_items` exist.
  - Reload and confirm the receipt draft/transcript data is still available.
- Notifications:
  - Sign in with a real Supabase user.
  - Open Settings -> Notifications.
  - Toggle several alert preferences.
  - Reload and confirm preferences persist from `notification_preferences`.
- Marketplace:
  - Sign in with a real Supabase user.
  - Create or save a Marketplace listing draft.
  - Confirm cross-listing channel drafts are saved in `marketplace_listing_channels`.
  - Export cross-listing CSV for all platforms.
  - Export Whatnot CSV.
  - Reload and confirm channel drafts persist.
- Kid Pack Builder:
  - Sign in with a real Supabase user.
  - Add or mark Vault items for kid/donation/community use.
  - Save Kid Pack Builder project.
  - Reload and confirm project persists from `kid_community_projects`.
  - Export Kid Pack Builder project.
- Dashboard:
  - Confirm Phase 2 sync status displays one accurate state:
    - `Supabase connected`
    - `Local only mode`
    - `Supabase sync unavailable`
    - `Missing database table`
    - `Permission/RLS blocked`
    - `Sync failed`
  - Confirm `Retry sync` updates the state after migrations/policies are fixed.

Known blocking state before apply:

- Current agent Supabase session can read schema but cannot apply DDL.
- Live project currently has `master_catalog_items`.
- Live project is missing `catalog_search_lightweight` and Phase 2 workflow tables.
