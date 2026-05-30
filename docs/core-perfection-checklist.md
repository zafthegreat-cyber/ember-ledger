# Ember & Tide Core Perfection Checklist

Last updated: May 30, 2026

Purpose: keep the current beta focused on reliability, trust, and mobile usability before future systems expand. This checklist is for the existing core app only; Kid Mode expansion, friends/circles, games, partner shops, Vault Play, full marketplace selling, rewards, checkout, and notification systems stay in the future backlog until separately approved.

## Release Gate

- Core routes load for Hearth, Scout, Vault, Forge, Market, Admin, More, and auth/access states.
- Mobile pages fit 390px and 430px widths without horizontal overflow.
- Bottom navigation, Quick Add, and Ember Assist do not cover primary actions.
- Required fields block invalid saves with field-level messages where practical.
- Duplicate submit protection is present for Scout reports and other high-risk save paths.
- Owner/admin edit and delete permissions are respected in the UI and backed by existing RLS where applicable.
- Empty, loading, success, and error states are understandable to beta users.
- Tier and locked-feature copy does not imply live billing, checkout, or unsupported access.
- No raw Scout history or restock pattern tooling is exposed to non-admin users.

## Hearth

- Today’s Sparks show real-action missions, not manual completion checkboxes.
- Dismissed Sparks do not earn Ember Points.
- Completed or dismissed Spark states provide useful Quick Actions.
- Hearth cards adapt to role, tier, enabled tools, and real data instead of showing useless empty stats.
- Mobile cards remain tappable, readable, and bottom-nav safe.

## Scout

- Report save flow blocks missing store/manual store, observed date/time, and meaningful item or detail.
- Screenshot scan review prefills editable fields only and never auto-saves.
- Add More Details opens the exact report just created or selected.
- Normal users can confirm, add proof/context, or flag when allowed; they cannot edit/delete/merge other users’ reports.
- Admin moderation controls stay admin-only and destructive actions require confirmation.
- My Watch Stores uses tier slot limits and makes change windows clear.
- Store Detail and Report Detail show current reports only, with protected raw history/pattern context hidden from non-admins.

## Vault

- Add/save and item detail flows show clear success/error states.
- Grouped item detail exposes copies, condition, variant, cost/date, notes, and missing photo context where available.
- Grid/list/filter controls wrap or scroll safely on mobile.
- Empty states explain how to add cards, sealed products, photos, or manual records.
- Owner/admin edit/delete controls are clear and permission-safe.

## Forge

- Sales, expenses, receipts, mileage, and grouped inventory actions are reachable on mobile.
- Sales records show item, date, sale price, fees, shipping, cost basis, profit/loss, and notes where available.
- Destructive record actions use confirmation.
- Profit/loss and tax-support copy stays informational and does not overclaim tax advice.
- Seller-only tools do not clutter collector-only contexts.

## Market

- Search supports cards, sets, sealed products, and category narrowing where catalog data supports it.
- Strong sealed-product matches are not buried under unrelated card results.
- Search results identify Card, Set, and Sealed types clearly.
- Results scroll into view after search and remain readable on mobile.
- Empty/error states avoid fake price or availability claims.

## Admin

- Admin pages clearly separate users, reports, content, beta access, shop/Spark review surfaces, and cleanup tools where present.
- Normal users never see admin-only controls.
- Fake/test account cleanup remains deliberate and confirmation-based.
- Moderation controls are clear enough for mobile use without exposing raw technical IDs by default.

## Auth And Access

- Username creation validates reserved/admin names and unsafe formats.
- Admin usernames and elevated roles rely on existing protected profile metadata/RLS patterns, not frontend-only trust.
- Beta access, VA-focused support, and out-of-state waitlist copy are clear.
- Restricted users cannot bypass access gates through route navigation.

## Checks

- `git diff --check`
- `npm.cmd run build`
- `npm.cmd run smoke:beta`
- `npm.cmd run test:app-fallbacks`
- `npm.cmd run test:tier-foundation`
- `npm.cmd run test:quick-add`
- `npm.cmd run test:inventory-detail`
- `npm.cmd run test:sales-records`
- `npm.cmd run test:scout-report-save-flow`
- `npm.cmd run test:scout`
- `npm.cmd run smoke:catalog-search`
