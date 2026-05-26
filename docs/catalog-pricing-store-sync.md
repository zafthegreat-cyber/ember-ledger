# Catalog, Pricing, and Virginia Store Sync

Ember & Tide keeps product and store reference data in local generated JSON files so app screens can render without live third-party calls.

## Sources

- Product catalog and reference prices: public TCGCSV JSON for Pokemon TCG category `3`.
- Virginia store directory: OpenStreetMap Overpass API, cached locally.
- Existing local store seed files still take priority when a generated directory match overlaps, so local nicknames such as `FC`, `GB`, and `GB B&N` are preserved.
- Store shorthand aliases are normalized during import/loading. `RM T`, `Pem T`, `FC`, `GB`, and `GB B&N` stay search-friendly for Scout and Drop Radar without marking those rows as verified restock signals.

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

`catalogImportStatus.json` includes the generated product/photo/reference-price counts, productId join coverage, fallback labels, and the current scheduling status so admin surfaces can explain freshness without implying live pricing.

## Daily Refresh

Daily Market price refresh is configured with GitHub Actions:

- Workflow: `.github/workflows/market-price-refresh.yml`
- Schedule: `17 9 * * *` UTC, plus manual `workflow_dispatch`
- Command: `npm.cmd run sync:market-prices -- --prices-only`
- Store refresh mode: `SYNC_STORES=false`, so the daily job preserves the generated store directory and avoids depending on Overpass every day.
- Write behavior: generated catalog/price/status JSON changes are committed back to `main`; Vercel's Git integration deploys the refreshed static cache.

The scheduled job uses public TCGCSV JSON only and does not require API secrets. GitHub Actions must have permission to write repository contents, and the Vercel project must continue deploying from `main`.

To refresh manually:

```powershell
npm.cmd run sync:market-prices
```

To test without writing generated files:

```powershell
npm.cmd run sync:market-prices -- --dry-run
```

To run the same price-only path used by the daily scheduler:

```powershell
npm.cmd run sync:market-prices -- --prices-only
```

The script writes deterministic generated data from public source records and logs counts only. It does not wipe manual app data and does not update Supabase.

Verify the last successful refresh by checking:

- the latest `Daily Market Price Refresh` GitHub Actions run
- the latest `Refresh Market price data` bot commit, if generated data changed
- `src/data/generated/catalogImportStatus.json` for `lastImportedAt`, `schedulingStatus`, and product/price counts
- production `/app-version.json` after Vercel deploys the refresh commit
- Market freshness labels in the app (`Updated`, `Stale`, or `Market data unavailable`)

## Fallback Behavior

- Missing product images render through the app's Ember & Tide product placeholder.
- Missing reference prices show as unavailable; the app should not claim fair pricing without a reliable reference.
- Reference prices are joined by source productId when available. Low-confidence fallback matching is for review only and must not power automatic fair-price labels.
- Missing stores can still be entered manually in Scout.
- OSM directory matches are not verified restock signals. Scout restock confidence still comes from reports and history.
- Directory rows carry a `Directory match`/`Local seed` source label and a `not_verified_restock_signal` status so UI copy can keep store existence separate from confirmed restock history.

## Options

- `TCGCSV_GROUP_LIMIT=0` syncs all Pokemon TCG groups. Set a positive number for a smaller recent-group refresh.
- `TCGCSV_GROUP_IDS=23821,24234` syncs specific TCGCSV groups.
- `SKIP_OVERPASS=true` skips the Virginia store directory call and keeps existing local store seeds.
- `SYNC_STORES=false` or `--prices-only` preserves the existing generated store directory and refreshes catalog/price data only.
- `--dry-run` fetches and logs refresh counts without writing generated files.
