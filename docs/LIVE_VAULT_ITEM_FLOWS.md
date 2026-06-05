# Live Vault Item Flows UI

## Scope

This section integrates and verifies the live UI shells for:

- Vault Item Detail
- Add Item
- Empty Vault

The existing item detail component remains the live detail surface. This pass only adds narrow UI polish for the Add Item and Empty Vault states.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_VAULT_ITEM_FLOWS.md`

## Screens Updated

- `/vault/cards` empty state
- Existing Vault Add Item flow
- Existing Vault Item Detail component remains intact

## Mock-Only / UI-Only Behavior

- Empty Vault first actions are UI-only entry points into existing review-first flows.
- Add Item quick choices now match the approved preview language:
  - Scan one card
  - Scan binder page
  - Add sealed product
  - Add manually
  - Import list
- A review-before-saving notice was added to the Vault add menu.
- No real scanner service, upload backend, database write, or API was added.

## Existing Item Detail Coverage

The existing `VaultItemDetail` already shows:

- Item placeholder/image
- Name
- Set / collection
- Card number
- Variant
- Condition
- Owned quantity
- Market/fair value label
- Notes
- Start Trade action
- Forge actions where seller tools are already visible
- Wishlist mark-owned behavior

The current beta-local Vault was empty during screenshot QA, so a populated item detail screenshot was not reachable without seeding data.

## Safety / Data Boundaries

- No backend writes were added.
- No auth, billing, database, schema, or RLS behavior changed.
- No inventory mutation behavior changed.
- No card scanning service or upload backend was added.
- Existing save/review behavior is preserved.

## Responsive QA Results

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-empty-390x844.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-empty-430x932.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-empty-1440x900.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-add-item-390x844.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-add-item-430x932.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/vault-add-item-1440x900.png`
- `artifacts/qa/live-ui-integration-train/vault-item-flows/live-vault-item-flows-qa-results.json`

## Checks Run

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:vault`: passed outside sandbox after sandbox Chromium `spawn EPERM`.

## Known Warnings

- Existing Vite large chunk warning.
- Existing LF-to-CRLF working-copy warning.
- Chromium needs outside-sandbox rerun in this environment when sandbox launch hits `spawn EPERM`.
- Populated item detail screenshot was not captured because the current beta-local Vault state is empty.

## Next Recommended Task

Continue to Section 5: Market Home.
