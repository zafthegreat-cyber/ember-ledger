# Set library artwork and card cleanup

Included in review branch `codex/set-catalog-ownership-20261108`. Merge and live publication remain pending. Earlier unrelated local work is preserved.

The Sets library now uses compact, complete cards with one title, larger supporting text, consistent artwork sizing, and a warm neutral backdrop for real logos in both themes. Missing artwork uses a small unbranded card icon and an accessible named fallback. Product photos are never substituted for set identity.

The game name is omitted from individual tiles when all displayed rows share the same game. Empty, unknown-checklist rows say “Not collected”; they no longer repeat zero unique cards and unavailable checklist text. Official checklist progress, recorded unique cards, sealed quantities, unresolved card identities, partial value coverage, and explicit zero estimates remain distinguishable. Hidden estimates are explained once above the grid. Exact values stay absent from tiles while hidden. Detailed checklist explanations remain in the set detail screen.

## Artwork

Added the publisher's exact Battle Academy logos from the separate [2022](https://press.pokemon.com/en/products/Pokemon-TCG-Battle-Academy-2022) and [2024](https://press.pokemon.com/en/products/Pokemon-TCG-Battle-Academy-2024) product pages. Both publisher pages supply the same shared logo artwork; separate source URLs and checksums document the edition mapping. The registry does not infer any other year or language.

The bundled directory audit covers 181 rows: 152 resolve to reviewed artwork and 29 still lack an exact verified logo. The complete list is in `artifacts/qa/set-library-cleanup-20261108/artwork-audit.json`. The owner's additional Back to School grouping also remains a fallback. Broad categories such as Assorted and Alternate Art Promos are preserved; no unrelated expansion logo or invented artwork is assigned. This is not a claim that a logo can never be found for every remaining product group.

## Changed files

- `src/components/CollectionSets.jsx`: one privacy notice and shared checklist/artwork explanation.
- `src/components/CollectionSetsViews.jsx`: quiet accessible artwork fallback and compact, honest card summaries.
- `src/components/collection-sets.css`: complete card surfaces, typography, spacing, artwork contrast, and two/three/four-column layouts.
- `src/data/setArtwork.json` and two new PNGs under `public/assets/catalog/set-logos/pokemon/en/`: exact publisher references and original image bytes.
- `scripts/test-set-artwork.mjs`: edition, game, and language safeguards for the new logos.
- `scripts/test-collection-sets-ui.mjs`: actual component tests for privacy, counts, missing values, fallback failures, mixed games, search, scope, and original-row navigation.

## Verification

- 66 focused scenarios passed: artwork 11, set derivation 37, navigation 12, component UI 6.
- Targeted ESLint and `git diff --check` passed. Git reports the existing Windows LF/CRLF normalization notice for the artwork JSON.
- Production Vite build passed, 129 chunks, written to an isolated QA directory.
- Compared every bundled derived row with HEAD's artwork registry: only `logoUrl` changed for the two Battle Academy rows. All other fields, including ownership, quantities, estimates, dates, and checklist metadata, matched exactly. Generated catalog and price files are unchanged.
- Chrome viewport checks: 320×740, 390×844, and 1440×900 CSS pixels. No horizontal overflow; all 24 initially rendered titles fit at 320px; visible controls meet the 44px touch-target minimum. Four desktop columns and two phone columns verified.
- Light/dark card title and supporting-text contrast ratios are 15.55/6.63 and 14.40/8.51 respectively. Keyboard card focus has a 3px visible outline. No motion was introduced.
- Search found both new Battle Academy logos and both loaded successfully. Set detail/Back and the existing owned-scope action worked. An explicitly labelled synthetic Arceus record retained quantity 2 and its $25 saved estimate through browsing and privacy changes. Browser console had no captured warnings/errors.

No live account, database, authentication, sync, pricing logic, or saved records were changed. Browser testing used the actual components in a disposable local fixture; physical Android/iPhone behavior and live deployment remain unverified for this candidate. The full repository test suite was not run for this scoped presentation change.

## Preview and evidence

[Open local preview](http://127.0.0.1:5291/artifacts/qa/set-library-cleanup-20261108/preview.html). “Preview options” changes the fixture theme, estimate visibility, and optional synthetic collection. It does not save account preferences or records.

Evidence directory: `artifacts/qa/set-library-cleanup-20261108/`. Includes `validation.json`, `browser-checks.json`, artwork audit, viewport screenshots, preview source, and the isolated build. Screenshots are uncropped browser viewport captures; their encoded image size can differ slightly from CSS viewport size due to browser capture scaling.
