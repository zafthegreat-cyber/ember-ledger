# TideTradr Catalog Import Seeds

Drop local export files here, then run:

```bash
npm run catalog:import
```

Supported beta inputs:

- `pokemon-tcg/sets.json` from Pokemon TCG API / Scrydex style set JSON.
- `pokemon-tcg/cards.json` or any `pokemon-tcg/cards/*.json` files from Pokemon TCG API / Scrydex style card JSON.
- `sealed-products.csv` for sealed product rows.
- `market-prices.csv` for manual/cached market price rows.
- `search-aliases.csv` for admin/user shorthand aliases.

The importer writes normalized generated files into `src/data/generated/`.

Data truth rules:

- Do not invent UPCs, SKUs, market prices, restock days, or stock status.
- Leave unknown fields blank or use `Unknown`.
- Use `sourceType` values such as `pokemon_tcg_api_json`, `tcgcsv`, `manual_csv`, `seed`, `mock`, or `unknown`.
- Market values are not live unless they are actually refreshed from a live source.
