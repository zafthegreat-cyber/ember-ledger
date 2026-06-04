# AGENTS.md - Ember & Tide

## Product

Ember & Tide is a family-first Pokemon / TCG collecting app.

Core mission:
Fair collecting. Kid-friendly access. Trusted community. Less scalper control.

The app should feel:
warm, premium, magical, simple, secure, family-centered, and polished.

The app should not feel:
childish, cluttered, generic, scalper-friendly, cold, or overly technical.

## Main areas

Use these product page names:

- Hearth: home dashboard
- Scout: local and online restock intelligence
- Vault: personal/family collection tracker
- Forge: trades, decks, listings, sales, inventory
- Market: discovery, search, fair price tools
- Tidepool: trusted family-safe community
- The Spark: kids program, donations, giveaways, events
- Ember Assist: warm helper / assistant layer

## Engineering rules

- Do not break working features.
- Prefer additive changes.
- Do not remove existing auth, database, billing, API, or routing logic unless explicitly asked.
- Keep TypeScript strict.
- Reuse components.
- Avoid large hardcoded screen files.
- Use mock data for UI unless real services already exist.
- Add TODO comments for backend integrations.
- Run available checks before finishing.
- Document any pre-existing failures.

## Design rules

- Mobile-first.
- Dark premium fantasy style.
- Strong contrast.
- Rounded cards.
- Warm ember and gold accents.
- Tide blue/teal accents.
- Large readable text.
- 44px minimum touch targets.
- Bottom navigation should be clear and thumb-friendly.
- Avoid tiny text and crowded cards.
- Use safe areas on iOS and Android.

## Safety rules

- No real retailer scraping unless explicitly approved later.
- No auto-checkout features.
- No exposed restock pattern history.
- No vendor schedule data.
- No exact inventory quantities unless shop-approved.
- No unmoderated kid messaging.
- Parent approval should be represented for child-sensitive actions.
- Tidepool should never become a scalper feed.
- Use trust badges, proof status, confidence scores, and moderation states.

## IP / assets

- Do not bundle copyrighted Pokemon card art, official logos, or official product images unless they already exist in the repo and are licensed/approved.
- Use generic TCG placeholders where needed.
- Keep copy compatible with a Pokemon / TCG collector audience without relying on unauthorized assets.

## Checks

Run the repo's available checks, usually:

- npm run lint
- npm run typecheck
- npm test
- npm run build
- npx expo-doctor
- npx tsc --noEmit

If a check does not exist, skip it and document that.
