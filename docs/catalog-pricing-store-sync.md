# Catalog, Pricing, and Virginia Store Sync

Ember & Tide keeps product and store reference data in local generated JSON files so app screens can render without live third-party calls.

## Sources

- Product catalog and reference prices: public TCGCSV JSON for Pokemon TCG category `3`.
- Virginia store directory: OpenStreetMap Overpass API, cached locally.
- Existing local store seed files still take priority when a generated directory match overlaps, so local nicknames such as `FC`, `GB`, and `GB B&N` are preserved.

This sync does not scrape TCGplayer pages, retailer websites, or require API secrets.

## Command

```powershell
npm.cmd run sync:market-prices
```

The same script is also exposed as:

```powershell
npm.cmd run sync:catalog-prices
```

Generated files:

- `src/data/generated/sealedProducts.json`
- `src/data/generated/pokemonTcgCards.json`
- `src/data/generated/marketPrices.json`
- `src/data/generated/virginiaStores.json`
- `src/data/generated/catalogImportStatus.json`

## Daily Refresh

No scheduler is created by this pass. To refresh daily, schedule:

```powershell
npm.cmd run sync:market-prices
```

The script writes deterministic generated data from public source records and logs counts only. It does not wipe manual app data and does not update Supabase.

## Fallback Behavior

- Missing product images render through the app's Ember & Tide product placeholder.
- Missing reference prices show as unavailable; the app should not claim fair pricing without a reliable reference.
- Missing stores can still be entered manually in Scout.
- OSM directory matches are not verified restock signals. Scout restock confidence still comes from reports and history.

## Options

- `TCGCSV_GROUP_LIMIT=0` syncs all Pokemon TCG groups. Set a positive number for a smaller recent-group refresh.
- `TCGCSV_GROUP_IDS=23821,24234` syncs specific TCGCSV groups.
- `SKIP_OVERPASS=true` skips the Virginia store directory call and keeps existing local store seeds.
