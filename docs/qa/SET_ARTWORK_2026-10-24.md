# Matching set and game artwork — October 24, 2026

The set browser previously used the first owned or catalog product photo when no logo metadata existed. The imported set metadata file is empty, so this happened frequently. A booster pack or collection box therefore appeared to represent an unrelated set.

## Correction

- A read-only artwork registry supplies 178 exact English Pokémon set/product logos and the five existing game logos. Files are served from the app origin and retain the reviewed source bytes. Artwork matching never supplies prices, checklist totals, dates, ownership, or saved records.
- The 176-provider set snapshot is pinned to [PokemonTCG/pokemon-tcg-data commit 39a26a1](https://github.com/PokemonTCG/pokemon-tcg-data/blob/39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11/sets/en.json), SHA-256 `9df2f1e4de63037925ced583afc1fa7cf807e0f1240b21f292f0eea2782a3859`. Source URLs and image checksums are retained in `src/data/setArtwork.json`. The original provider JSON is not imported as new checklist or price data.
- Two supplemental logos come from the exact official English [Delta Reign expansion page](https://tcg.pokemon.com/en-us/expansions/delta-reign/) and [Trading Card Game Classic press page](https://press.pokemon.com/en/Pokemon-Trading-Card-Game-Classic). The Classic JPEG is kept as a JPEG; no raster artwork was generated or altered.
- Game logos were checked against the official Pokémon, Wizards of the Coast, Yu-Gi-Oh!, One Piece and Disney Lorcana pages. The white One Piece variant and the complete Lorcana header logo are used on charcoal panels. An incomplete Lorcana candidate was excluded.
- Exact names, provider IDs and reviewed aliases are matched only within English Pokémon artwork. Ambiguous abbreviations, custom names and foreign games cannot borrow a Pokémon logo. Explicit foreign-only records do not inherit enriched English artwork. Existing mixed-language set grouping is unchanged.
- Set tiles and details try matching logo, then explicit set symbol, then the full set name with “Set artwork unavailable.” Owned and catalog item photos remain available in item views. They no longer serve as set identity.
- Phone game filters use two columns so the actual logos and labels remain readable. Existing selection, navigation, values and manual-entry behavior remain intact.

These assets identify the referenced games and products; the registry does not claim ownership of their artwork or marks. The requested actual logos were used instead of generated substitutes or screenshot crops.

## Verification

| Check | Result |
| --- | --- |
| Asset downloads and visual review | 176 provider set logos, 2 publisher supplements and 5 game logos verified; exact source checksums retained |
| Focused identity/asset/language checks | 10 passed, including PNG/JPEG identity, ambiguous aliases, game separation, Japanese-only records and unchanged prices/photos |
| Existing set derivation suite | 37 passed |
| Set browser regression | 320/390/1440 px, light/dark: 6 passed; final mobile CSS: 4 passed |
| Actual local logo previews | 320/390/1440 px, light/dark: 6 passed; two supplemental phone cases passed |
| Layout and interaction | No horizontal overflow; 44px targets, keyboard focus/back navigation, value privacy and 200% text checked |
| Data preservation | Exact synthetic collection/sale/expense/catalog/repository bytes retained; all derived bundled-catalog row fields except artwork compared with main `8c1a9e1` |
| Source lint | Passed with the existing `App.jsx` `checkUser` dependency warning |
| Production web build and branding | Passed |

Browser tests used fresh disposable contexts, loopback requests and synthetic records. They made no production requests or server writes. No production database, account, storage object, generated price/catalog file, backend, migration or API was modified.

The current bundled catalog yields 220 derived set groups. This count is not a promise about a signed-in user's catalog snapshot. Named categories, combined trainer kits, unsupported language editions and entries without verified matching artwork retain named unavailable states. McDonald’s 2023/2024 provider metadata supplies no logo; another edition’s artwork is not substituted. The screenshot’s “183 sets” must not be used as a hardcoded coverage claim.

Local evidence: `artifacts/qa/set-artwork-20261024/`, including `real-art-app/`, `browser-regression/`, `browser-mobile-final/`, `supplemental-app/`, source manifests and baseline comparisons. Screenshots show disposable test records, not the owner's collection. Phone acceptance remains paused. This visual revision stays on its review branch until approved; it has not been merged or published.

## Future artwork updates

Verify the exact set, game and language against provider metadata or an official publisher page. Preserve its source URL and byte checksum, use a local asset with the correct format, and add only explicit art aliases. Never derive an image from an approximate name, borrow a different edition, or rerun the full catalog/price importer just to add a logo. Run `node scripts/test-set-artwork.mjs`, the existing set checks and responsive browser checks after updating the registry.
