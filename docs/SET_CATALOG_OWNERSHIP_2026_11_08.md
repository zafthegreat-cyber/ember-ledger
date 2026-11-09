# Set catalog browsing and owned quantities

Review branch: `codex/set-catalog-ownership-20261108`, prepared on current main `6bcb643c6d5055e971359309021cded8a9675d5c`. Merge and live publication remain pending. Prior unrelated local work is preserved.

Opening a set now shows its available catalog, with All, Cards, Sealed, name/card-number search, and an Owned only toggle. Owned products have a clear quantity badge and a brand-colored border. The default remains the full catalog. Catalog entries represent products/cards, not retailer availability.

The large set hero and empty statistics panels were replaced by a compact identity header. The outer Collection workspace hides its duplicate Card sets/Add Item/Back to Collection header while a set is open. Back to sets and the normal app navigation remain available. The existing set library, item details, copy details, and pricing preference remain intact.

## Catalog and ownership

- Uses the existing generated card and sealed-product snapshots. The source contains 28,372 cards and 4,735 sealed entries. Digital code cards and explicitly marked accessories are excluded from the new card/sealed browsing projection; their source records are not deleted.
- The build produces 219 independent, content-hashed public catalog assets containing 31,818 entries. Aquapolis has 185 card entries and two sealed products in a 79,727-byte asset. These counts include catalog variants and are not promoted into official checklist denominators.
- The app loads the public directory and selected set only. It renders 24 products initially, searches the entire loaded set, and can show more. An eight-set memory cache avoids repeated downloads. The card catalog is not put into account records, localStorage, cloud sync payloads, or the startup JS bundle.
- Exact catalog/TCGplayer IDs take priority. Proven catalog aliases for the same product remain usable after a newer catalog record changes its local ID. Existing exact set aliases and plain numbered-card padding are normalized for read-only matching. Different sets, subsets, games, recorded languages, and known variants are not silently combined. Uncertain matches remain visible as saved items needing a catalog match.
- Quantities aggregate original saved copies. Acquisitions, conditions, dates, costs, and saved prices remain on those original objects. Sealed products do not imply ownership of the cards inside them. Current ownership scope remains the existing personal collection; Hold and resale records are not newly included.
- Missing language metadata remains missing. The game category is not used to invent an English language assignment. No new official totals or release dates are imported.
- Loading, unavailable catalog, error/retry, empty-filter, and missing-photo states are present. Saved records remain visible if the full catalog cannot load. An aborted or stale set request cannot display the previous set's response.

## Review before saving

Clicking an entry opens a product sheet with its real photo, number, ownership summary, and original saved-record links. Add to collection / Add another copy opens the existing three-step Collection item wizard.

The new draft preserves catalog identifiers and valid recorded catalog price metadata, starts quantity at one, and never copies the catalog row ID into the owned-record ID. It does not invent purchase costs or dates. An unavailable price remains unknown, including normalized zero placeholders marked unknown. Existing values on owned copies are never filled or overwritten from the catalog.

Catalog drafts have a separate product/set/account scope, so an unrelated manual-entry draft remains intact. The existing repository save and sync path is used only after the user completes review and presses Save Item.

## Files

- `build/setCatalogPlugin.mjs`, `vite.config.js`: per-set public assets for development and production, rebuilt from the current source snapshots.
- `src/services/setCatalogLoader.mjs`: selected-set fetch, payload checks, cancellation, bounded successful-response cache.
- `src/utils/setCatalog.mjs`: read-only matching, duplicate acquisition quantities, filters, and new-item seed whitelist.
- `src/utils/collectionSets.mjs`: exposes the existing exact normalization helpers and the already-scoped catalog records on each derived set row.
- `src/components/CollectionSetCatalog.jsx`, `src/components/collection-set-catalog.css`: catalog controls, grid, owned markers, product sheet, loading and error states.
- `src/components/CollectionSets.jsx`, `src/components/collection-sets.css`: compact selected-set layout and catalog connection.
- `src/pages/EverydayWorkspaces.jsx`: routes selected catalog products into the existing isolated review draft and removes duplicate selected-set page chrome. Only the selected-set header and catalog draft wiring are included here. Earlier local performance and collection-grouping edits remain in the original checkout.
- `scripts/test-set-catalog.mjs`, `scripts/test-set-catalog-ui.mjs`: identity, preservation, emitted data, loading, controls, and actual existing wizard tests. The existing Sets UI test harness also marks the Vite virtual module external when bundling in Node.

## Verification

- 85 focused set checks passed: artwork 11, derivation 37, navigation 12, existing Sets UI 6, new catalog/model/loader 13, new catalog UI/review wizard 6.
- 86 existing copy-grouping checks passed in the isolated release checkout. The separate local catalog-stacking work is not included in this push.
- Targeted ESLint and whitespace checks passed. Git's existing Windows LF/CRLF normalization notices remain.
- Final production build on latest main passed: 132 JS chunks, 219 set assets. Imported the emitted production directory module, resolved every emitted asset URL, and checked each payload's set key.
- All 31,818 emitted entries retain their exact source price, source label, status, price timestamps, and language fields. Generated catalog/price files have no Git changes. Only the public projection is emitted; ownership/acquisition fields are absent.
- Browser viewports: 320×740, 390×844, and 1440×900 CSS pixels. Light and dark checked. No horizontal overflow, clipped product names at 320px, or visible controls below 44px. Keyboard product focus uses a 3px solid outline.
- Real catalog images loaded. Browser checks confirmed 187 All entries, 185 Cards, two Sealed, two synthetic owned products, card quantity two, and one owned sealed product. Sealed-filter ownership counts correctly exclude owned singles. Card-number search, product modal, and the no-save preview review action worked. No captured browser warnings/errors.
- The actual existing three-step record wizard was mounted in a disposable test. It preserved an unrelated manual draft, called its save callback only at Save Item, created a new linked item with quantity one, retained source price 12.50, and left missing acquisition cost blank. It made no production writes.

No live account, authentication, database, cloud data, receipt, existing price, or production deployment was changed. Full non-Pokémon catalogs, official checklist completeness, a real cloud save/sync, native camera behavior, and physical Android/iPhone acceptance are not claimed by this pass. The full repository test suite was not run for this scoped change.

## Preview

[Open the local set catalog preview](http://127.0.0.1:5291/artifacts/qa/set-catalog-ownership-20261108/preview.html). It uses real public catalog entries/photos and three explicitly fictional owned sample records. Its Add action shows a no-save review; the real app's existing wizard is covered by the integration test.

Evidence: `artifacts/qa/set-catalog-ownership-20261108/`, including phone/desktop light/dark screenshots, owned-only and sealed screenshots, browser checks, build validation, and an isolated production build. Screenshots capture the entire browser viewport, not a crop. Capture pixels may differ slightly from CSS viewport size due to browser scaling.
