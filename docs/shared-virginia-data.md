# Shared Virginia Store Directory and Pokemon Catalog

These files set up shared, non-user-specific data for Scout / Ember & Tide.

## Migration

Run this in the Supabase SQL editor or with your preferred Postgres migration runner:

```sql
supabase/migrations/002_shared_virginia_catalog.sql
```

For the statewide store directory metadata fields, review and apply this later through the approved migration process:

```sql
supabase/migrations/20260514120000_statewide_virginia_store_directory.sql
```

It creates or updates:

- `stores`
- `store_regions`
- `store_user_watchlist`
- `pokemon_products`
- `user_inventory`
- `store_reports`

It also enables RLS:

- Logged-in users can read shared `stores`.
- Logged-in users can read active `store_regions`.
- Users can manage only their own `store_user_watchlist` rows.
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

## Virginia Store Directory

The Store Directory scope is statewide Virginia. Hampton Roads / 757 remains the default/home region for Zena, but users should be able to browse, search, watch, favorite, guess, and submit Scout reports for any Virginia store.

Hierarchy:

- Country: United States
- State: Virginia
- Region
- City
- Retailer
- Store location

Required directory fields:

- `country`
- `state`
- `region`
- `city`
- `retailer`
- `store_name`
- `nickname`
- `address`
- `zip_code`
- `phone`
- `store_number`
- `retailer_store_id`
- `latitude`
- `longitude`
- `active`
- `pokemon_stock_likelihood`
- `notes`
- `source`
- `source_url`
- `last_verified_at`
- `verified_by`
- `confidence`

Virginia stores are imported in regional batches. Fill these files over time with verified public store rows:

- `seeds/stores/virginia-hampton-roads.json`
- `seeds/stores/virginia-richmond.json`
- `seeds/stores/virginia-northern-va.json`
- `seeds/stores/virginia-fredericksburg.json`
- `seeds/stores/virginia-charlottesville.json`
- `seeds/stores/virginia-roanoke.json`
- `seeds/stores/virginia-lynchburg.json`
- `seeds/stores/virginia-shenandoah.json`
- `seeds/stores/virginia-eastern-shore.json`
- `seeds/stores/virginia-southside.json`
- `seeds/stores/virginia-southwest.json`
- `seeds/stores/virginia-other.json`

Validate the batch files without touching Supabase:

```bash
npm run seed:stores:virginia:dry
```

Import all region files after the statewide store directory migration is approved/applied:

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
seeds/stores/virginia-store-import-template.csv
```

The importer accepts both regional JSON files and CSV files in `seeds/stores/`.

Do not add a store row unless its address is verified from a stable public source, such as an official store locator. The importer upsert key is:

```txt
retailer_store_id + retailer, falling back to chain + address
```

Target regions:

- Hampton Roads / 757
- Richmond / Central Virginia
- Northern Virginia
- Fredericksburg
- Charlottesville / Albemarle
- Roanoke / Southwest Virginia
- Lynchburg
- Shenandoah Valley
- Eastern Shore
- Southside Virginia
- Other Virginia

Target chains:

- Walmart
- Target
- Best Buy
- Dollar General
- Family Dollar
- Dollar Tree
- Five Below
- Barnes & Noble
- GameStop
- Costco
- Sam's Club
- BJ's
- Kohl's
- Michaels
- Hobby Lobby
- DICK'S Sporting Goods
- Walgreens
- CVS
- Local card shops
- Local game stores
- Toy stores
- Bookstores
- Other Pokemon-carrying retailers

Known Hampton Roads pattern notes are stored only as user guesses/pattern notes, not confirmed restock facts:

- College Drive Walmart: Thursday
- Franklin Walmart: Wednesday
- Suffolk Walmart: Wednesday

Admin Review Center queues:

- Missing store suggestions
- Duplicate store reports
- Nickname corrections
- Wrong city/region corrections
- Closed store reports
- Pokemon stock likelihood suggestions

## TideTradr Catalog Import

The beta app now has generated catalog slots so large Pokemon card/product datasets can be imported without editing React components:

- `src/data/generated/pokemonTcgSets.json`
- `src/data/generated/pokemonTcgCards.json`
- `src/data/generated/sealedProducts.json`
- `src/data/generated/marketPrices.json`
- `src/data/generated/searchAliases.json`

Place source exports in `seeds/catalog/`, then run:

```bash
npm run catalog:import
```

Supported local files:

- `seeds/catalog/pokemon-tcg/sets.json`
- `seeds/catalog/pokemon-tcg/cards.json`
- `seeds/catalog/pokemon-tcg/cards/*.json`
- `seeds/catalog/sealed-products.csv`
- `seeds/catalog/market-prices.csv`
- `seeds/catalog/search-aliases.csv`

This is intentionally local/import-first for beta. Live APIs, paid API keys, and protected provider credentials should be connected through backend/serverless code later, not hardcoded in the frontend.
