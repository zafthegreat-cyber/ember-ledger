# Multi game collection upgrade

October 19, 2026. Collection and Card sets now offer a focused picker for Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece and Disney Lorcana. The picker follows the reference direction with readable text tiles, neutral surfaces and the existing teal selection colors, without adding unapproved game logos or a long list of unavailable catalogs.

This update and the preceding portfolio and Sets updates remain local and uncommitted on `codex/all-bot-integration-setup`, based on `11f58ad3378c0d065f939372bfaa1e686dfd979c`. The preceding published main release remains `78f16b02097db0b47a79dcea31aff7001b7bce45`. Nothing in this follow-up has been pushed, merged or deployed.

## Available behavior

Collection and Card sets have a compact game disclosure that expands into five game choices, All games and Unspecified / other. Filtering changes the displayed collection items. Portfolio totals, rankings, snapshots and exports continue to represent the entire selected portfolio, with explanatory text when a game filter is active. Clear search and filters also resets the game choice.

Set groups are qualified by game, so matching set names, aliases and card numbers from different games remain separate. Game labels appear on set and item cards. Ambiguous same-name set buttons have game-qualified accessible names, and Back focus resolves the exact set ID. Existing full record pages, item photos, purpose separation, binder tools and portfolio organization remain available.

The modern Collection and Business inventory forms accept a trading card game. Collection Add actions retain the selected game, and Add from a set retains its game and set name, including an existing custom unsupported game label. The existing Pokémon subject field has a neutral Character or subject label for other games; its stored key remains compatible. Portfolio CSVs include a readable Game column, and Business inventory CSVs include the optional stored `tcgGame` field.

## Catalog and data boundaries

Only Pokémon has the existing live catalog integration. The other four choices support manual collection and inventory entry, saved photos, set names and estimates. Empty game libraries explain that live catalog and price lookup are not connected and offer manual entry. The existing Market search now explicitly identifies its Pokémon catalog. No new catalog, price feed, scanner provider, retailer integration or restock lookup has been added.

Game classification is read-only. Exact explicit game labels take priority over legacy clues; conflicts and unsupported labels remain outside the Pokémon group. A full canonical Pokémon set name or precise catalog provenance can identify an old Pokémon record; a short abbreviation or an unrelated product title cannot. Existing unlabelled records are not automatically rewritten. Custom games remain distinguishable from one another and from records with no game label.

When a person deliberately changes an existing game's label in the manual form, the draft archives exact previous game fields in `tcgGameAssignmentHistory` and removes stale conflicting aliases. The ordinary Save action applies the change; cancelling retains the original. A visible explanation and the record timeline identify the correction. Malformed prior history blocks the correction instead of discarding saved information.

Saved artwork remains first choice. The modern workspace's catalog fallback requires matching known games, so an explicitly labelled Magic item cannot receive Pokémon artwork through a matching product ID or name. Existing unlabelled legacy artwork links remain compatible. No source photo or price is replaced.

The optional fields use existing repository, backup and cloud-envelope formats. Their round trips were tested with synthetic records; no schema, authentication, permission or deployment setting changed, and production account synchronization was not exercised in this visual follow-up.

## Actual verification

- Production build and full source ESLint passed. Existing non-failing Vite chunk/dynamic-import, Babel and Node module-type notices remain. There is no frontend typecheck script; backend code was unchanged.
- Nineteen game classification, correction and preservation scenarios passed, including repository, backup and cloud-envelope capture. Thirty-seven set scenarios, thirty portfolio scenarios and twelve set navigation scenarios passed. Existing inventory valuation and native export checks passed.
- New actual-app browser checks passed at 320, 390 and 1440 pixels in both themes, including both narrow themes at 200 percent text. All 668 measured visible controls met the 44-pixel minimum, with no horizontal overflow, external requests, server writes or page errors.
- Those six cases covered five-game filtering, clear/reset, whole-portfolio totals, same-name set separation, game-qualified accessible names, ID-based Back focus, manual prefill/cancel, custom game preservation and rejection of wrong-game catalog artwork. Original records and prices remained unchanged in every case.
- Two additional browser guards passed: an empty non-Pokémon library could save one disposable manual Magic item, and editing an imported MTG label produced the correct preserved-label draft while Cancel kept the original record intact.
- Existing portfolio browser checks passed all six viewport/theme cases and three Free-preview, corrupt-storage and quota guards. Existing Sets browser checks passed all six cases. The portfolio CSV assertions now include the new Game column while retaining the same quantity and price checks.
- All fourteen generated catalog files retained their original SHA256 hashes. Git reports no changes to generated data, backend, Supabase, package manifests or deployment configuration. `git diff --check` passed.

Physical phones, native signed packages, production accounts and new live non-Pokémon integrations were not tested or published. Browser screenshots use disposable synthetic records and artwork, not the owner's holdings.

## Evidence

Final game browser results: `artifacts/qa/multi-game-browser/final/results.json`. Readable phone preview: `artifacts/qa/multi-game-browser/final/390-dark-sets-game-picker-viewport.png`.

Build and lint logs: `artifacts/qa/multi-game-build-final.log` and `artifacts/qa/multi-game-lint-final.log`. Portfolio regression: `artifacts/qa/multi-game-regression/portfolio-final/`; Sets regression: `artifacts/qa/multi-game-regression/sets/`. Catalog preservation compares `artifacts/qa/sets-catalog-before.json` with `artifacts/qa/multi-game-catalog-after.json`.
