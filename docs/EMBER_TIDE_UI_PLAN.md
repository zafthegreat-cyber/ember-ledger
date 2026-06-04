# Ember & Tide UI Foundation Plan

## Stack Finding

This repository is a React/Vite web app, not an Expo Router, React Navigation, SwiftUI, Jetpack Compose, or React Native project. The mobile UI foundation is therefore implemented as an additive React/Vite screen-set entry at `screen-set.html`.

## Safety Boundary

- No backend, auth, RLS, billing, inventory mutation, scraping, checkout, live AI, or retailer integration changes.
- No official Pokemon card art, logos, product art, set symbols, or proprietary frame styling is bundled.
- All new product content is mock-only and uses generic TCG placeholders.

## Implementation Checkpoints

1. Add central theme tokens in `src/theme`.
2. Add typed product model and mock data in `src/types` and `src/mock`.
3. Add reusable Ember UI components in `src/components/ember-ui`.
4. Expand the standalone screen set to represent all major product areas.
5. Build and capture visual QA screenshots for compact and desktop layouts.

## Mock-Only Backend TODOs

- TODO: Connect Scout report submission to the existing reviewed report save flow.
- TODO: Connect Vault item cards to real collection records where already supported.
- TODO: Connect Forge listings/sales/trade history only after inventory mutation rules are finalized.
- TODO: Connect Market price signals to approved fair-value data sources only.
- TODO: Connect Spark donation review to admin approval workflows.
- TODO: Connect Parent Center controls to approved child-safety backend rules.
- TODO: Connect Shop Portal posts only through opt-in shop moderation.
- TODO: Connect Ember Assist to approved helper services without exposing private child, admin, or Scout pattern data.

## Verification Plan

Run the available checks for this repo:

- `git diff --check`
- `npm run build`

Optional repo checks can run later once this additive screen-set is approved for integration.
