# Normalized Pokemon Catalog

This catalog keeps the existing `product_catalog` and `inventory_items` rows intact, then adds normalized tables beside them.

## Source Hierarchy

1. Pokemon TCG API sets are the source of truth for expansion identity.
   Use `tcg_expansions.official_name`, `pokemon_tcg_io_id`, release data, legalities, symbol, and logo for display.

2. TCGCSV / TCGplayer data is mapping and market data.
   Use it for `tcgplayer_group_id`, `tcgplayer_product_id`, product rows, sealed products, price rows, and variant prices.

3. User/admin submissions stay in suggestion tables until approved.
   Approved suggestions should merge into canonical tables such as `product_catalog`, `tcg_expansions`, `product_identifiers`, `catalog_product_variants`, and `product_msrp_rules`.

## Expansion Mapping

`product_catalog.expansion_id` points to `tcg_expansions.id`.

The old flat fields `set_name`, `set_code`, `expansion`, and `source_group_name` remain only for backfill/search compatibility. The app should display `tcg_expansions.official_name` when an expansion is linked.

TCGplayer group names are stored as mapping metadata:

- `tcg_expansions.tcgplayer_group_id`
- `tcg_expansions.tcgplayer_group_name`
- `tcg_expansions.tcgplayer_abbreviation`

They are not treated as official expansion names.

## Sealed Product Classification

Sealed products use:

- `product_catalog.product_kind = sealed_product`
- `product_catalog.sealed_product_type`
- `product_catalog.is_pokemon_center_exclusive`
- `product_catalog.contents`

Regular Elite Trainer Boxes and Pokemon Center Elite Trainer Boxes are separate products:

- `elite_trainer_box`
- `pokemon_center_elite_trainer_box`

Pokemon Center ETBs also set `is_pokemon_center_exclusive = true`.

Pack count defaults can be used only with source/confidence in `contents`, for example:

- regular modern ETB: 9 packs
- Pokemon Center ETB: usually 11 packs
- Booster Bundle: 6 packs
- Booster Display Box: 36 packs

## Card Variants

`catalog_product_variants` stores card versions and price variants:

- Normal
- Holofoil
- Reverse Holofoil
- 1st Edition
- Unlimited
- Cosmos Holofoil
- Cracked Ice Holofoil
- Stamped Promo

Condition is separate. Inventory condition belongs on `inventory_items.condition_name`, not in the variant name.

Inventory rows should store:

- `catalog_product_id`: base catalog product
- `catalog_variant_id`: selected version/finish/printing
- `condition_name`: Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged
- `language`
- `finish`
- `printing`

TCGCSV price identity is `productId + subTypeName`, represented as `product_market_price_current.source_product_id + price_subtype`.

## UPC / SKU / MSRP

Identifiers are separated in `product_identifiers`.

Do not put all IDs into one generic SKU field.

Identifier types:

- UPC
- EAN
- GTIN
- RETAILER_SKU
- POKEMON_CENTER_SKU
- TCGPLAYER_PRODUCT_ID
- TCGPLAYER_SKU_ID
- POKEMONTCG_IO_ID
- OTHER

MSRP belongs in explicit source-backed product data or `product_msrp_rules`. The app should not invent UPCs, retailer SKUs, or MSRP values.

## Useful Commands

```bash
npm run import:pokemon-tcg-api
npm run import:tcgcsv
npm run verify:catalog-normalized
```

`verify:catalog-normalized` checks the migration file locally. If Supabase env vars are present, it also checks live counts for normalized expansions, ETBs, Pokemon Center ETBs, Reverse Holofoil variants, and card anatomy rows.
