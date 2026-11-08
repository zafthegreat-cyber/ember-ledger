# Nationwide reporting and TCG expansion

Prepared November 8, 2026 on `codex/nationwide-tcg-expansion-20261108`. Pending review; not deployed or included in a new Android release.

The existing report workflow already accepts all 50 US states and DC. The report browser now adds a nationwide/state filter and a game filter, combined with its existing search, observed-time, stock, retailer and city filters. Same-named cities with a shared metro label remain distinct across recorded states. Missing state/game data remains accessible instead of being silently assigned to Virginia or Pokémon.

The shared game registry now supports 13 games: Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Disney Lorcana, Flesh and Blood, Digimon, Dragon Ball Super: Fusion World, Dragon Ball Super: Masters, Star Wars: Unlimited, Gundam Card Game, Union Arena and Riftbound. The registry supplies collection/inventory entry, game filters, sets, report categories and screenshot review. Dragon Ball's two games have separate identities; a generic Dragon Ball or Star Wars mention is not assigned to one automatically.

Screenshot extraction still proposes a draft. A store and explicit observation time must be reviewed before saving. Catalog suggestions are scoped to the selected game; choosing another game cannot attach a Pokémon catalog product or overwrite its category. Cloud-loaded reports retain their game filter identity when the existing schema returns the category in `productType`.

Coverage limits remain explicit:

- Nationwide reporting supports manual/reviewed stores. Bundled directory files currently cover VA, MD, NC and DC; no other state received invented store rows or live-stock claims.
- The existing Pokémon catalog and price pipeline remain unchanged. Other games support manual records, set names, photos and saved estimates; their live catalogs, full checklists and automatic prices are not connected.
- Existing approved artwork is retained. Newly listed games use text abbreviations until appropriate production artwork is supplied; no unrelated set artwork or generated logo is substituted.
- No database migration, price import, real report, collection edit, authentication change, notification delivery or deployment is part of this change.

Validation: 88 automated test entries pass, including all 663 state/game filter combinations, frozen-record preservation, existing collection/copy/artwork checks, screenshot review and production-schema save/reload fakes for all 13 games. These do not replace live two-device sync tests. ESLint passes for all six changed source files. The production build passes with its existing bundle-size/dynamic-import warnings.

Browser checks use the actual components with synthetic in-memory records at 320, 390 and 1440 pixels. They verify light/dark controls, no horizontal overflow, 44px targets, long game-name wrapping and keyboard selection/focus return. New report controls measure at least 14.68:1 text contrast in the checked themes. Screenshots and logs are under `artifacts/qa/nationwide-tcg-20261108/`.

Implementation files: `src/utils/collectibleGames.mjs`, `src/utils/restockFeedPresentation.mjs`, `src/utils/stockScreenshotDraft.mjs`, `src/components/CollectionGameFilter.jsx`, `src/components/RestockReportBrowser.jsx` and `src/features/deferredViews/ScoutSubmitContent.jsx`. Focused tests are available through `test:nationwide-tcgs`; existing national reporting and cloud-format tests were also run.
