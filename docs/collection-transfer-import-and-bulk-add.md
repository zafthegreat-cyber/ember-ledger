# Collection Transfer, Import, and Bulk Add

## Purpose

Transfer Collection / Import is for users who already track a collection somewhere else.

Bulk Add is for users who just bought, opened, sorted, or scanned a pile of items and want to add many records quickly.

Both flows use the same batch intake pattern:

Input -> parse -> match -> review -> choose destination -> confirm -> save.

Nothing is auto-saved before review.

## Transfer Sources

### Spreadsheet / CSV

Export or save the sheet as CSV. Upload it in Ember & Tide. The app parses headers, suggests column mappings, previews rows, and matches items to the catalog before anything is added.

Recommended columns:

- item name
- set
- card number
- product type
- quantity
- condition
- variant
- purchase price
- cost basis
- market value
- location
- store
- notes
- date purchased
- UPC/SKU

### Collectr Or Other Collection App

Export the collection if the app supports CSV. Upload the file and review the mapped fields. Ember & Tide tries to match names, sets, quantities, and values where possible.

### TCGplayer / PriceCharting

Export collection or inventory CSV if available. Ember & Tide tries to match card names, set names, card numbers, quantities, conditions, and values.

### eBay / Whatnot / Facebook Seller Lists

Paste or upload seller lists. These can become Forge inventory or marketplace draft inputs after review.

### Notes App / Copied List

Paste one item per line.

Supported quantity examples:

- `2x Prismatic Evolutions ETB`
- `Prismatic Evolutions ETB x2`
- `qty 3 Charizard ex`
- `3 Charizard ex`

### Photos Or Screenshots

Image upload is reference-only in beta. The user should type the visible text into the paste field. Full OCR/vision provider support is planned later and is not connected yet.

### No Current Tracker

Use Bulk Add, scanner, search, or manual add to build a Vault, Forge inventory, or Wishlist from scratch.

## Bulk Add Methods

- Search and add multiple catalog items into a temporary batch.
- Paste a list and parse quantities.
- Add manual rows.
- CSV upload reuses the transfer/import parser.
- Batch scanner mode is planned later.

## Review Screen

Each row shows:

- original input
- suggested catalog match
- confidence: High, Medium, or Low
- top alternate matches when available
- quantity
- destination
- condition / variant
- purchase price or cost basis
- store/source
- notes
- edit controls
- remove/skip controls

Low-confidence rows are marked Needs Review. Users can pick a match, choose No Match / add manually, or create a manual catalog item.

## Destination Choices

- Vault
- Forge Inventory
- Wishlist
- Vault + Forge
- Ignore / do not import

Users can choose one destination for all rows or choose per row.

## Duplicate Handling

When a likely duplicate exists in the selected destination, the review row warns the user and offers:

- add as separate item
- increase existing quantity
- skip duplicate

## Save Behavior

Only the final confirm button saves records.

If a row fails, the app reports which item failed. It does not claim the whole batch saved when partial failures occur.

In beta, the batch itself is local UI state unless a backend `import_batches` table is added later. No new migration is required for the current foundation.

## Beta Limitations

- OCR/photo recognition is not connected.
- Spreadsheet formats other than CSV are reference-only in beta.
- Import batch history is not persisted as a separate backend record yet.
- Catalog matching uses the current app catalog/search helpers and should avoid large raw catalog payloads.
- Provider integrations and paid import connectors are not connected.

## Future Work

- Persist import batch history.
- Add backend import job records and row-level audit trail.
- Add OCR/vision provider abstraction after base review flow is stable.
- Add batch scanner mode.
- Add deeper marketplace listing draft generation from seller-list imports.
