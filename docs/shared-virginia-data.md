# Shared Virginia Store Directory and Pokemon Catalog

These files set up shared, non-user-specific data for Ember Scout / E&T TCG.

## Migration

Run this in the Supabase SQL editor or with your preferred Postgres migration runner:

```sql
supabase/migrations/002_shared_virginia_catalog.sql
```

It creates or updates:

- `stores`
- `pokemon_products`
- `user_inventory`
- `store_reports`

It also enables RLS:

- Logged-in users can read shared `stores`.
- Logged-in users can read shared `pokemon_products`.
- Users can read/write only their own `user_inventory`.
- Logged-in users can create and read community `store_reports`.

## Product Seed

Run this after the migration:

```sql
supabase/seeds/seed_shared_pokemon_products.sql
```

The seed is safe to run more than once. It uses the unique product key:

```txt
product_name + set_name + product_type
```

## Virginia Store Seed

Virginia stores are imported in regional batches. Fill these files over time with verified public store rows:

- `seeds/stores/virginia-hampton-roads.json`
- `seeds/stores/virginia-richmond.json`
- `seeds/stores/virginia-northern-va.json`
- `seeds/stores/virginia-fredericksburg.json`
- `seeds/stores/virginia-charlottesville.json`
- `seeds/stores/virginia-roanoke.json`
- `seeds/stores/virginia-lynchburg.json`
- `seeds/stores/virginia-shenandoah.json`
- `seeds/stores/virginia-southwest.json`

Validate the batch files without touching Supabase:

```bash
npm run seed:stores:virginia:dry
```

Import all region files:

```bash
npm run seed:stores:virginia
```

Required environment variables for importing:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or Vercel client env vars.

The legacy CSV template is still available for spreadsheet collection:

```txt
supabase/seeds/virginia_stores_import_template.csv
```

Do not add a store row unless its address is verified from a stable public source, such as an official store locator. The importer upsert key is:

```txt
chain + address
```

Target regions:

- Hampton Roads / 757
- Richmond / Central Virginia
- Northern Virginia
- Fredericksburg / Stafford / Spotsylvania
- Charlottesville / Albemarle
- Roanoke / New River Valley
- Lynchburg
- Shenandoah Valley
- Williamsburg / Peninsula
- Southside Virginia
- Southwest Virginia

Target chains:

- Walmart
- Walmart Neighborhood Market
- Target
- Best Buy
- Barnes & Noble
- GameStop
- Five Below
- Costco
- Sam's Club
- BJ's Wholesale Club
- Dollar General
- Family Dollar
- Dollar Tree
- Walgreens
- CVS
- Kohl's
- DICK'S Sporting Goods
- Hobby Lobby
- Books-A-Million
- Local card/game shops
- NEX / MCX / Exchange locations where publicly listed and applicable
