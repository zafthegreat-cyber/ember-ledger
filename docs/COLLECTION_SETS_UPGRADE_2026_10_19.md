# Collection sets upgrade

October 19, 2026. The modern `/collection/sets` page now follows the user's reference direction: a compact, artwork-led set library with search, All sets and Your sets, sorting, recorded progress and saved values. It uses the existing Code 3 TCG semantic light and dark themes. This follow-up and the preceding portfolio upgrade remain local and uncommitted on `codex/all-bot-integration-setup`, based on `11f58ad3378c0d065f939372bfaa1e686dfd979c`. The preceding published release remains main `78f16b02097db0b47a79dcea31aff7001b7bce45`.

## User experience

Sets appear in two columns on ordinary phones, with more columns on larger screens and reflow for enlarged text. The compact search and filter row brings the first set artwork to approximately 390 pixels from the top in the 390-pixel phone fixture, about 200 pixels earlier than the first reviewed layout. Clear keyboard focus and controls of at least 44 pixels remain available.

Opening a set shows its recorded unique cards, sealed records, saved estimate coverage and existing item artwork. Item cards open the existing full record. Item Back, set Back and browser Back and Forward restore the set, search and filter state and the appropriate keyboard focus. Add an item pre-fills the set name; the existing creation form and saving handlers remain in use. Binder, assignment and set-plan tools remain under the Binders & set plans disclosure.

Collection view state is keyed by account and active workspace so a prior workspace's open detail or draft does not remain mounted after switching scope. No authentication or permission policy changed. Actual authenticated account and workspace switching was reviewed in source but was not exercised with production accounts.

## Data and artwork

Only the permitted personal-collection items supply owned counts and values. Resale, Hold and community records do not inflate set progress. Duplicate physical copies, quantities and finish variants do not inflate numbered unique-card counts. Explicit languages remain distinct; mixed or partly unrecorded languages suppress misleading completion percentages. Cards without a usable number or catalog identity are identified as unresolved.

Saved values reuse the portfolio valuation helper, including quantity, coverage, explicit zero and overflow handling. Missing values never become purchase costs, catalog prices or a fabricated zero estimate. The collection value visibility preference and existing feature gate control value display.

The bundled set metadata currently has no logos, set release dates or official card totals. Existing approved set metadata is supported when available; existing collection or catalog product artwork provides a clearly labelled alternative. Product release dates, card-number denominators and a partial catalog's size are not substituted for official set metadata. Language filters appear only from actual recorded language data; Japanese, Chinese or Pokédex catalogs were not invented.

The page derives its rows without changing any source record, price or cloud schema. It adds no new persisted set metadata, backend service, dependency or remote write.

## Verification

- Production web build and full source ESLint passed. Targeted source ESLint passed again after the final compact layout. Existing non-failing Vite chunk/dynamic-import and Babel notices remain. There is no frontend typecheck script; unchanged backend TypeScript was not rebuilt.
- Thirty-two set derivation scenarios and twelve navigation scenarios passed. Existing thirty portfolio scenarios, Vault Set Mastery, twenty-nine report/history checks, seventeen App modal-history checks, workspace identity and native export checks passed.
- Final actual-app checks passed at 320, 390 and 1440 pixels in both themes. All 296 measured visible controls met the 44-pixel target; neither page nor set region overflowed, including both 320-pixel themes with 200 percent text.
- Those browser checks covered search, collection filters, sorting, artwork and broken-image fallbacks, recorded progress, unknown-only and explicit-zero-only estimates, hidden values, record/set navigation and focus, binder disclosure and reload. Original item, repository, sales, expense and current catalog-price bytes remained unchanged in all six contexts. No server writes, external requests or page errors occurred.
- The preceding portfolio browser regression passed all six viewport/theme contexts and three existing Free-preview, corrupt-storage and quota guards.
- All fourteen generated catalog files retained their SHA256 hashes. Git reports no changes to generated data, backend, Supabase, package manifests or deployment configuration. `git diff --check` passed.

The browser evidence uses isolated synthetic records. Two synthetic set metadata fixtures supply logos, dates and totals to exercise those branches without altering the actual bundled catalog. Physical iPhone and Android devices, production accounts, native packages and app-store submission were not tested in this visual follow-up.

## Evidence

Final browser results and screenshots: `artifacts/qa/collection-sets-browser/compact-final/`. The useful phone previews are `390-dark-your-sets.png`, `390-dark-your-sets-viewport.png` and `390-dark-detail.png`; enlarged-text evidence includes `320-dark-text-200-viewport.png` and its light counterpart.

Build and lint logs: `artifacts/qa/sets-build-final.log` and `artifacts/qa/sets-lint-final.log`. Portfolio browser regression: `artifacts/qa/collection-sets-regression/portfolio/`. Catalog hash baselines: `artifacts/qa/sets-catalog-before.json` and `artifacts/qa/sets-catalog-after.json`.
