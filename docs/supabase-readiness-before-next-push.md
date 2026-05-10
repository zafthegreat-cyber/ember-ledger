# Supabase Readiness Before Next Push

No future `db push` should run until every item here is complete and approved.

## Required Readiness Checks

- [ ] `npx.cmd supabase migration list --linked` works.
- [ ] Database is stable across multiple read-only checks.
- [ ] Migration status is known.
- [ ] `20260509003000` status is known.
- [ ] `20260509004500` status is known.
- [ ] `20260509170000` status is known.
- [ ] Remaining pending migrations are listed.
- [ ] Partial state is inspected read-only.
- [ ] Partial objects/data from `20260509170000` are understood.
- [ ] No large backfills run automatically in migrations.
- [ ] Schema-only migrations are reviewed.
- [ ] `20260509170000_normalized_pokemon_catalog_model.sql` still contains the
      “Large catalog backfills are intentionally not run” guard comment.
- [ ] `scripts/backfill-normalized-catalog-batches.cjs` exists and is not wired
      into build, smoke, or migration push.
- [ ] A backup/restore point is available, if Supabase support or plan tier
      allows it.
- [ ] Local app checks pass:
      `npm.cmd run build`, `npm.cmd run backend:build`, `npm.cmd run smoke:beta`.
- [ ] Explicit approval has been received before any `db push`.

## Read-Only Partial-State Inventory

Before push approval, inspect these without writing:

- `product_catalog`
- `catalog_products`, if present
- `catalog_product_variants`
- `product_identifiers`
- `tcg_card_details`
- `pokemon_card_details`, if present
- catalog views from `20260509170000`
- indexes from `20260509170000`
- RLS policies from `20260509170000`

## Stop Conditions

Stop before push if any check shows:

- `ECONNRESET`
- `ECONNREFUSED`
- `57P03`
- database not accepting connections
- no space left on device
- unknown migration state
- partial state that could make reruns unsafe
- missing backup/restore option for a risky operation
