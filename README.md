# Market price history (data only)

Pokémon TCGplayer market prices from TCGCSV archives, built by .github/workflows/market-history.yml on main.
Weekly for every product in the root folder; daily for popular products in daily/.
One file per set: { groupId, dates, series: { "productId|subType": [cents|null] } }.
