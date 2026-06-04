# Mobile UI Screen Set

This implementation is an isolated React/Vite screen set at `screen-set.html`.

## Assumptions

- The current repository is a React/Vite app, not a SwiftUI, Jetpack Compose, or React Native project.
- The requested `design/tokens/tokens.json`, `references/crops`, `copy`, `mock-data`, and `api/openapi.yaml` inputs were not present in the repo.
- New token, copy, typed theme, typed mock-data, and reusable UI component files were added for this screen set. No backend, auth, RLS, tier, or inventory behavior is changed.
- The current repo is not Expo or React Native, so this pass adapts the native-style product brief to the existing React/Vite stack.

## Token Additions

All new screen-set styling maps to values in `design/tokens/tokens.json`:

- `color`: dark base, ember, tide, vault, market, forge, spark, assist, text, line, and shadow tokens.
- `space`: compact phone spacing scale.
- `radius`: control, card, pill, and phone radii.
- `typography`: font family, type scale, line-height, and weights.
- `size`: phone frame, touch target, nav, icon, card thumbnail, and map height.
- `border`: reusable stroke widths for cards, controls, icons, and signals.
- `motion`: timing and easing.
- `breakpoint`: compact and medium layout breakpoints.

CSS media-query literals mirror `breakpoint` token values because CSS custom properties cannot be used in media queries.

## Screen Coverage

The standalone board represents:

- Hearth
- Scout
- Vault
- Forge
- Market
- Tidepool
- The Spark
- Ember Assist
- More
- Parent Center
- Shop Portal
- Admin Review
- Virginia-first signup / waitlist

## Component Layer

Reusable components are in `src/components/ember-ui/index.tsx`, including the requested primitives such as `AppScreen`, `AppHeader`, `PageHero`, `MagicCard`, `SectionHeader`, `StatCard`, `ActionTile`, `BottomNav`, `TrustBadge`, `ConfidenceRing`, `SafeNoticeCard`, and related card/button components.

Typed mock product data lives in `src/mock/emberTideData.ts`, with shared types in `src/types/emberTide.ts`.

## Non-Infringement Notes

The screen set does not use Pokemon characters, card art, logos, set symbols, energy symbols, pack art, or card-frame styling. Product/card visuals are original abstract foil rectangles, crests, maps, and generic silhouettes.
