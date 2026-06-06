# Master Card Grouping

## Scope

This pass adds a frontend-only master-card grouping model for Ember & Tide. It groups raw copies, duplicate copies, wishlist wants, and graded or special variants under one card identity before users inspect individual records.

No backend schema, RLS policy, auth rule, billing rule, scraping workflow, payment workflow, upload service, live AI call, or inventory integration was changed.

## Frontend Model

`src/types/emberTide.ts` now defines:

- `MasterCard`
- `CardVariant`
- `CardVariantType`
- `CardCondition`
- `GradingCompany`

The intended grouping key is:

- card name
- set name or set code
- card number when available

The live app derives this grouping from existing local UI records at render time. Existing item records remain the source of truth until a future backend migration is explicitly approved.

## Mock Data

`src/mock/emberTideData.ts` now includes generic Ember & Tide master-card examples using original card names and no licensed card art. These examples support future preview work without changing the approved standalone screen set.

When a local beta workspace has no saved card records, Vault and related grouping surfaces can show these examples as a clearly labeled preview model. They are not saved inventory and do not write to storage.

## Live UI Surfaces

The live UI now exposes master-card context in:

- Vault collection cards and grouped preview section
- Vault item detail
- Wishlist grouped preview section
- Market result cards
- Market product detail
- Trade Value selected item preview
- Forge inventory cards
- Forge item detail

## Premium Visuals

Card/product image frames now use CSS-only premium effects:

- foil-style light sweep
- warm ember and tide glow
- abstract placeholder crest
- variant-aware border tone

These effects do not use generated images, official card frames, licensed logos, energy symbols, set symbols, or copyrighted card art.

## Backend TODOs

Future backend work, when approved, should consider:

- persistent `master_cards` records
- persistent `card_variants` records
- safe catalog-to-master-card matching
- migration from local item fields into explicit variant records
- privacy-safe sharing rules for family collections and wishlists
- explicit seller/shop permission boundaries for Forge and Shop Portal data

## Safety Notes

The grouping model does not expose Scout restock patterns, vendor schedules, employee details, exact quantities from retailers, private child data, or admin-only data. Market and Scout surfaces remain review-first and anti-scalper.

## Public Beta Deploy QA

The master-card grouping pass was deployed to the public beta in commit
`46c0d2c92457637d0e347b041a58d88c0601286a`.

Deployment metadata:

- Public URL: `https://emberandtide.app`
- Vercel deployment ID: `dpl_DXX6pT2oJhnKdnW8Eyn7UJtoMCS6`
- Live app-version: `dpl_DXX6pT2oJhnKdnW8Eyn7UJtoMCS6-46c0d2c92457637d0e347b041a58d88c0601286a-2026-06-06T15:12:24.645Z`

Live QA covered Hearth, Scout, Vault, Vault Item Detail, Add Item, Market,
Product Detail, Forge, Trade Analyzer, and More at 390x844, 430x932, and
1440x900.

Result:

- Grouped master-card behavior appeared in Vault and Forge.
- Market rendered the premium master-style result treatment where applicable.
- Premium CSS image effects rendered without obscuring text.
- No horizontal overflow or console errors were captured.
- No backend/auth/billing/database/RLS changes were made.
- No scraping, checkout, payments, uploads, messaging, live AI, live inventory
  integration, real image fetching workflow, or copyrighted assets were added.

QA artifacts:

- `artifacts/qa/master-card-grouping-live/`
- `artifacts/qa/master-card-grouping-live/live-master-card-qa-results.json`
