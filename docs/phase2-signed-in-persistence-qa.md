# Phase 2 Signed-In Persistence QA

Do not start this checklist until `npm.cmd run verify:phase2:supabase`, `npm.cmd run backend:build`, `npm.cmd run build`, and `npm.cmd run smoke:beta` pass against the target Supabase project.

Use a signed-in non-admin test account unless a case explicitly requires admin access. Keep the browser devtools console open and capture any table, RLS, or network errors.

## Preflight

For signed-in QA, `.env.local` must include the cloud-mode flag and Supabase frontend config. Do not commit or print these values:

```env
VITE_BETA_LOCAL_MODE=false
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

When `VITE_BETA_LOCAL_MODE` is missing, the app intentionally defaults to local beta mode.

1. Confirm the app is using the target Supabase project.
2. Sign in with the QA account.
3. Confirm the dashboard sync status says `Supabase connected`.
4. Confirm it does not say `Local only mode`, `Supabase unavailable`, `Missing database table`, or `Permission/RLS blocked`.
5. Keep a written list of the test record names so they can be found after reloads.

## Deal Finder

1. Open Deal Finder while signed in.
2. Create a new session with a unique title, asking price, notes, and raw input.
3. Add at least two items with product names, quantities, asking prices, market values, and risk notes.
4. Save the session.
5. Confirm the UI reports a Supabase/cloud save, not local fallback.
6. Reload the app.
7. Confirm the session and items load from Supabase.
8. Edit the title, one item quantity, and one pricing field.
9. Save again and reload.
10. Confirm the edits persist.
11. If delete/archive is available, archive or delete the session and confirm that state persists after reload.

## Scanner Intake

1. Create a scanner intake record while signed in.
2. Use a unique raw value and choose a scan type.
3. Choose a destination such as Vault, Forge, Wishlist, Deal Finder, Store Report, Marketplace, or Search Only.
4. Save the intake.
5. Confirm the UI reports a Supabase/cloud save.
6. Reload the app.
7. Confirm the intake record, destination, status, and extracted clues persist.
8. Update the status or destination if supported.
9. Save and reload again.
10. Confirm the update persists.

## Receipts

1. Create a receipt draft or transcript while signed in.
2. Add merchant, purchased date, total, tax, category, split mode, and notes.
3. Add at least two line items with product names, quantities, unit prices, destinations, and match confidence.
4. Confirm parsed fields look correct before saving.
5. Save the receipt.
6. Confirm the UI reports a Supabase/cloud save.
7. Reload the app.
8. Confirm the receipt record persists.
9. Confirm all receipt line items persist and remain attached to the receipt.
10. Edit a line item and save again.
11. Reload and confirm the edit persists.

## Notification Preferences

1. Open notification or alert preferences while signed in.
2. Toggle at least three alert types.
3. Change channel settings and quiet-hours/filter settings if available.
4. Save preferences.
5. Confirm the UI reports a Supabase/cloud save.
6. Reload the app.
7. Confirm all toggles, channels, filters, and quiet-hours settings persist.
8. Toggle one preference back, save, reload, and confirm the update persists.

## Marketplace Channels

1. Create a marketplace/cross-listing channel draft while signed in.
2. Select a platform and enter a title, description, price, fees, shipping, SKU label, and listing status.
3. Save the draft.
4. Confirm the UI reports a Supabase/cloud save.
5. Reload the app.
6. Confirm the draft persists.
7. Run the all-platform CSV export.
8. Confirm the export includes the saved draft fields.
9. Run the Whatnot CSV export.
10. Confirm the Whatnot export includes the expected platform-specific fields.
11. Edit the listing status, save, reload, and confirm the edit persists.

## Kid Pack Builder

1. Create a Kid Pack Builder project while signed in.
2. Add a unique project name, budget, target pack count, event date, and notes.
3. Add at least three project items with item names, quantities, unit costs, MSRP, market value, community price, and donation amount.
4. Save the project.
5. Confirm the UI reports a Supabase/cloud save.
6. Reload the app.
7. Confirm the project and all items persist.
8. Export the project.
9. Confirm the export includes the project summary and item rows.
10. Edit one item and the project status, save, reload, and confirm the update persists.

## Dashboard Sync Status

Confirm each user-facing state is clear and actionable:

- `Supabase connected`: shown when signed in and cloud persistence is available.
- `Local only mode`: shown when the app intentionally saves locally.
- `Sync unavailable`: shown when Supabase cannot be reached.
- `Missing database table`: shown when a required Phase 2 table is absent or not exposed.
- `Permission/RLS blocked`: shown when writes or reads are blocked by policies.
- `Saved locally`: shown after local fallback succeeds.
- `Retry sync`: visible and usable when a retry is possible.

For negative states, confirm the workflow still saves locally and does not silently lose user data.
