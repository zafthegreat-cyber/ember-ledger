# Live Vault Home UI

## Scope

This section integrates the live Vault Home dashboard inside the existing Vault route.

Included:

- Collection summary
- Cards count
- Sealed count
- Estimated value label
- Completion snapshot
- Search/filter row
- Mock folder tiles
- Recent additions
- Collection health
- Quick actions

This section does not integrate Vault item detail, Add Item, or Empty Vault redesigns. Those are reserved for the next section.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_VAULT_HOME.md`

## Route / Screen Updated

- `/vault/cards`

The existing Vault route remains intact. The new Vault Home dashboard appears above the existing collection list.

## Mock-Only Behavior

- Folder labels are mock UI grouping labels:
  - Main Binder
  - Sealed
  - Favorites
  - Kids Collection
  - Wish List
- Collection health is derived from existing local/read-only item values available in the UI.
- Quick actions open existing review-first UI flows only.

## Safety / Data Boundaries

- No backend writes were added.
- No database schema changes were added.
- No RLS/auth/billing behavior changed.
- No card scanning service, image upload service, or live market API was added.
- Add paths keep the existing review-before-saving behavior.

## Backend TODOs

- TODO: Replace mock folder health and binder reminders with a reviewed read-only Vault summary contract when available.
- TODO: Add real folder membership only after backend data ownership and family privacy rules are reviewed.

## Responsive QA Results

- 390x844: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 430x932: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.
- 1440x900: no horizontal overflow, no bottom dock overlap, no console errors, no maximum update depth errors.

## Accessibility QA Notes

- Primary quick actions remain reachable.
- Folder and action tiles preserve large touch targets.
- Summary cards wrap within compact widths.
- Search input stays readable on mobile.
- Standalone preview board still renders with approved Hearth / Scout / Vault / Market / More nav labels.

## Screenshot Paths

- `artifacts/qa/live-ui-integration-train/vault-home/vault-home-390x844.png`
- `artifacts/qa/live-ui-integration-train/vault-home/vault-home-430x932.png`
- `artifacts/qa/live-ui-integration-train/vault-home/vault-home-1440x900.png`
- `artifacts/qa/live-ui-integration-train/vault-home/live-vault-home-qa-results.json`

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

## Next Recommended Task

Continue to Section 4: Vault Item Detail, Add Item, and Empty Vault.
