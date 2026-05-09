# Pokémon market-data ingestion kit

This kit is for adding Pokémon cards, sealed Pokémon TCG product, market prices, item photos, and Virginia Pokémon card retailers to the existing Supabase project.

## What it imports

1. **All Pokémon card rows from Pokémon TCG API**
   - Uses `GET https://api.pokemontcg.io/v2/cards?page=...&pageSize=250`.
   - Imports card name, set, number, rarity, image URL, TCGplayer/Cardmarket URL, and available price fields.
   - Writes to `public.product_catalog` using `market_source='PokemonTCGAPI'`.

2. **All Pokémon TCGplayer products and market prices from TCGCSV**
   - Uses `https://tcgcsv.com/tcgplayer/3/groups` because TCGCSV category `3` is Pokémon.
   - For each group/set, imports `/products` and `/prices`.
   - This includes individual cards, booster packs, booster boxes, ETBs, tins, collections, decks, bundles, and other sealed products where present in TCGplayer data.
   - Writes product rows to `public.product_catalog`, current price variants to `public.product_market_price_current`, and optionally history to `public.product_market_price_history`.

3. **Virginia Pokémon card retailers**
   - Creates/imports `public.pokemon_retail_stores`.
   - Uses a seed list from TCGList results found during research and optionally scrapes TCGList Virginia pages at runtime.
   - TCGList currently reports 39 Virginia TCG stores carrying Pokémon. The seed file includes the verified subset available from search/browser results; the scraper attempts to load page 1 and page 2 directly when you run it.

## Important scope notes

- “All stores in VA” is treated here as **TCG/card shops that carry Pokémon**. This does not automatically include every Target, Walmart, Best Buy, GameStop, Costco, or vending-machine location. For a true every-retailer list, add a Google Places or retailer-store-locator import.
- Your detected `public.product_catalog` table requires `user_id`, so the import scripts require `DEFAULT_USER_ID`. Use the Supabase Auth UUID for the account that should own the imported catalog rows.
- Run these scripts only in a private backend environment. Never expose your service-role key in a browser/client app.

## Setup

```bash
cd pokemon_market_ingestion_kit
npm install
cp .env.example .env
```

Edit `.env`:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
DEFAULT_USER_ID=YOUR_AUTH_USER_UUID
POKEMON_TCG_API_KEY=OPTIONAL_KEY
```

## Step 1: run SQL migration

Open Supabase SQL Editor and run:

```sql
-- contents of schema_additions.sql
```

## Step 2: import official Pokémon card data/photos

```bash
npm run import:pokemon-tcg-api
```

## Step 3: import TCGCSV products, sealed items, and market prices

For a small test:

```bash
GROUP_LIMIT=2 npm run import:tcgcsv
```

For the full import:

```bash
GROUP_LIMIT=0 npm run import:tcgcsv
```

To also write price history snapshots:

```bash
WRITE_PRICE_HISTORY=true npm run import:tcgcsv
```

## Step 4: import Virginia stores

```bash
npm run import:va-stores
```

The store importer uses `va_pokemon_stores_seed.json` and, when `SCRAPE_TCG_LIST=true`, tries to scrape TCGList page 1 and page 2 live.

## Recommended schedule

- Run the full product import once.
- Run `import:tcgcsv` daily or nightly for price refreshes.
- Run `import:pokemon-tcg-api` weekly or after new set releases.
- Run `import:va-stores` monthly, or replace it with a Google Places enrichment job if you need every big-box retailer too.

## Files

- `schema_additions.sql` — Supabase schema additions/indexes/RLS read policies.
- `import_pokemontcg_cards_to_supabase.mjs` — imports all card metadata/photos from Pokémon TCG API.
- `import_tcgcsv_to_supabase.mjs` — imports TCGCSV Pokémon products, sealed product, and market price variants.
- `import_va_stores_to_supabase.mjs` — imports Virginia Pokémon retailer data.
- `va_pokemon_stores_seed.json` — seed list of Virginia Pokémon-carrying stores found in research.
- `.env.example` — required environment variables.
