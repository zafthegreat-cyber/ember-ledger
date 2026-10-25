# Collection products and copy records

Status: local review on `codex/group-collection-copies-20261025`. Not published.

## Behavior

Collection displays matching personal-collection and Hold acquisitions as one
product tile with their combined quantity. For example, PC quantity 1 and Hold
quantity 1 display as one product with Qty 2 and a PC/Hold breakdown.

Opening the product shows Overview, followed by Copies as the second tab. Each
purchase record keeps its quantity, purpose, actual purchase date, recorded cost,
purchase source and storage. A saved record containing multiple units remains
one purchase record. Missing dates/costs stay unrecorded; zero is a real cost.

Open copy record enters the existing record detail and edit handlers. Editing,
changing purpose or deleting still targets that original record. Back restores
the selected copy/product and scroll position. Product and record entry bring
the heading into view and focus it for keyboard/screen-reader orientation.

Grouping follows the current portfolio, search, game and condition filters.
One copy assigned to a custom portfolio remains Qty 1 there. All portfolios
shows both copies. Sets completion continues to use personal-collection records
only. Existing Wishlist/Hold access remains available.

## Data and price preservation

This is a derived presentation. There is no database, schema, authentication,
cloud-sync, import, attachment or pricing change. No migration, row merge,
automatic save or synthesized copy occurs. Product identity uses namespaced
catalog/TCGplayer/barcode/SKU identifiers with conservative game, language,
variant, condition, grading and currency guards. Manual records need a complete,
unambiguous product identity; title alone cannot merge unrelated items.

Grouped values sum the existing per-record valuation using its original source
precedence. They are labeled Total saved value. Partial and unknown values stay
explicit. Acquisition costs are shown once per original purchase record, without
averaging or multiplying a saved lot cost. The explicit Hide values control
hides grouped values and copy costs; no new paid feature gate was introduced.
Portfolio memberships, CSV exports and snapshots retain the original records.

## Changed implementation

- `src/utils/collectionCopyGroups.mjs`: read-only grouping and summaries.
- `src/components/CollectionProductDetail.jsx` and its CSS: Overview/Copies.
- `src/components/CollectionPortfolio.jsx`, `CollectionPortfolioViews.jsx` and
  `collection-portfolio.css`: grouped grid/list, ranking and quantities.
- `src/pages/EverydayWorkspaces.jsx`: product/copy selection and navigation.
- Two new grouping test scripts; existing portfolio browser expectations updated
  for Hold inclusion and the intentional product-to-copy navigation.

## Validation

- Grouping model: 86 checks.
- Actual component browser flow: 289 checks at 390×844 and 1440×1000, light/dark.
  Covers Qty 2, PC/Hold, paired dates/costs, original-record Edit then Cancel,
  scoped portfolios/search, variants/languages, hidden values, free saved values,
  missing data, focus/scroll, 44px targets, contrast and overflow. Final synthetic
  record, photo, price, portfolio, session and IndexedDB bytes are unchanged.
- Existing portfolio browser suite: 6 viewport/theme cases plus free, corrupt
  storage and quota guards. Existing legacy Collection suite: 8 cases.
- Existing Sets browser suite: 6 viewport/theme cases. Existing workspace keyboard
  suite: 4 contexts. Portfolio model 30, Sets model 37, Sets navigation 12,
  market-price preservation 14 and cloud-workspace model 20 scenarios pass.
- Scoped ESLint, diff whitespace check and production build pass. Build retains
  the existing large-chunk and mixed static/dynamic Supabase import warnings.

Preview gallery and results are ignored local artifacts under
`artifacts/qa/collection-copy-groups-20261025/`. Screenshots use synthetic records
and clearly marked sample artwork, with the real components and brand shell.
No owner account or production service was used. Physical-phone acceptance and
production deployment remain unverified until review and publishing approval.
