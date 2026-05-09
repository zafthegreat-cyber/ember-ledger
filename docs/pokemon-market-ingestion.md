# Pokemon Market Ingestion

This repo includes `pokemon_market_ingestion_kit/`, a server-only import kit for loading Pokemon cards, sealed products, current market prices, item images, and Virginia Pokemon retailers into Supabase.

## Safety Rules

- Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend code or any `VITE_` variable.
- Do not commit `.env` files. This repo ignores `.env`, `.env.local`, and `.env.*.local`.
- Run import scripts only from a private backend/local shell.
- `public.product_catalog` requires `user_id`, so set `DEFAULT_USER_ID` to the Supabase Auth UUID that should own imported catalog rows.

## Environment Variables

Create a local `.env` in the repo root or run with environment variables set in your shell:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
DEFAULT_USER_ID=YOUR_AUTH_USER_UUID
POKEMON_TCG_API_KEY=OPTIONAL_KEY
```

Optional:

```bash
GROUP_LIMIT=2
WRITE_PRICE_HISTORY=true
SCRAPE_TCG_LIST=false
```

## Migration

The schema from the ingestion kit was added as:

```text
supabase/migrations/20260508203900_pokemon_market_ingestion_schema.sql
```

Apply it through your normal Supabase migration flow, or paste it into the Supabase SQL editor before running imports.

The migration:

- Extends `public.product_catalog` with Pokemon import fields.
- Adds `public.product_market_price_current`.
- Adds `public.product_market_price_history`.
- Adds `public.pokemon_retail_stores`.
- Adds idempotent unique indexes for repeated imports.
- Enables RLS and public read policies for current prices and retail stores.
- Adds a follow-up read-only policy migration for shared Pokemon `product_catalog` rows:
  `supabase/migrations/20260508213000_product_catalog_public_pokemon_read.sql`.

## Import Commands

Small TCGCSV test:

```bash
GROUP_LIMIT=2 npm run import:tcgcsv
```

PowerShell:

```powershell
$env:GROUP_LIMIT='2'; npm.cmd run import:tcgcsv
```

Full Pokemon TCG API card import:

```bash
npm run import:pokemon-tcg-api
```

Full TCGCSV product/price import:

```bash
GROUP_LIMIT=0 npm run import:tcgcsv
```

PowerShell:

```powershell
$env:GROUP_LIMIT='0'; npm.cmd run import:tcgcsv
```

Virginia Pokemon retailer import:

```bash
npm run import:va-stores
```

To store price history snapshots during TCGCSV imports:

```bash
WRITE_PRICE_HISTORY=true GROUP_LIMIT=0 npm run import:tcgcsv
```

## Validation Queries

Run these in Supabase SQL editor after imports:

```sql
select count(*) from public.product_catalog where category = 'Pokemon';
select count(*) from public.product_catalog where category = 'Pokemon' and product_type = 'Card';
select count(*) from public.product_catalog where category = 'Pokemon' and is_sealed = true;
select count(*) from public.product_catalog where image_url is not null;
select count(*) from public.product_market_price_current;
select count(*) from public.pokemon_retail_stores where state = 'VA';
select max(last_price_checked) from public.product_catalog where category = 'Pokemon';
```

Repeated imports should update existing rows because upserts use:

- `product_catalog (market_source, external_product_id)`
- `product_market_price_current (source, source_product_id, price_subtype)`
- `pokemon_retail_stores (name, city, state)`

## Admin Import Status

The app has an admin import-status panel in:

```text
Menu > Admin Tools > Admin Review Queue
```

It shows:

- total Pokemon products
- sealed products
- card products
- current market price rows
- Virginia stores
- last price checked
- products missing image_url
- products missing market price
- status errors visible to the current client

If the frontend Supabase anon client is not configured, the panel shows a note. The import scripts still run with server-only environment variables.

If market price rows and stores are visible but Pokemon catalog products show `0`, run the latest product catalog RLS migration above. Without that read-only policy, the service-role importer can write rows, but the frontend cannot browse/search imported catalog rows.

## TideTradr Imported Catalog Browsing

TideTradr has a Supabase import bridge in:

```text
TideTradr > Search & Catalog
```

Use **Load Imported Data** to pull recent imported rows into the local beta catalog, or type a search term and choose **Search Supabase Imports** to query `public.product_catalog` directly. Imported rows are mapped into the same catalog cards/detail drawer as beta rows and show images, market price, product type, set/expansion, source labels, and source links when available.

## Refresh Schedule

Recommended beta cadence:

- Run full `import:tcgcsv` once to load products/prices.
- Run `GROUP_LIMIT=0 npm run import:tcgcsv` nightly or daily for price refresh.
- Run `npm run import:pokemon-tcg-api` weekly or after new set releases.
- Run `npm run import:va-stores` monthly or when retailer source data changes.
