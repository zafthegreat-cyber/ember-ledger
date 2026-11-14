# AGENTS.md - Code 3 TCG

## Product

Code 3 TCG is a family-first Pokemon / TCG collecting app.

Core mission:
Fair collecting. Kid-friendly access. Trusted community. Less scalper control.

The app should feel:
warm, premium, magical, simple, secure, family-centered, and polished.

The app should not feel:
childish, cluttered, generic, scalper-friendly, cold, or overly technical.

## Main areas

One set of names everywhere a person reads (decided Nov 14, 2026): the app is
three workspaces, **Collect**, **Find** and **Sell**, plus Business, Community and
Settings. Code symbols, routes, storage keys and database names keep the older
words in parentheses; do not rename those.

- **Collect** (code: vault): tabs **Collection**, **Sets**, **Wants**. Never "Vault" or
  "Wishlist" in visible copy; the plain-language layer rewrites stragglers.
- **Find** (code: scout, flip scout): tabs Home, **Deals**, **Restocks**, Auctions.
  "Watchlist" means stores/products watched for restocks, not wanted cards.
- **Sell** (code: forge resale): Inventory and Sales.
- **Business** (code: forge/ledger): purchases, money, receipts and records.
- Home (code: hearth), Market: discovery, search, fair price tools
- Community (code: tidepool): trusted family-safe community
- Kids & Community / The Spark: kids program, donations, giveaways, events
- Safety Center (code: lantern) and Family (code: nest): safety and family settings
- Watch Center (code: ember watch / tide watch), Public Profile (code: ember id),
  Daily Points (code: ember/tide points), Trust Score (code: tide score)
- Business Assistant (code: ember assist): warm helper / assistant layer

`src/config/plainLanguage.js` (`renameLegacyProductNames`) is the render-time
catch-all; `npm run test:plain-language` fails on leaked old names.

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
- Warm premium style; dark and light themes follow the device until the person picks.
- Strong contrast.
- Rounded cards (14 px cards, 10 px controls, round badges).
- Maroon primary action in light, gold in dark; gold is for the one primary action, values and the brand line.
- Teal (`--accent-teal`) carries informational and secondary accents; small labels are quiet grey, never gold caps.
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
- Community (tidepool) should never become a scalper feed.
- Use trust badges, proof status, confidence scores, and moderation states.

## IP / assets

- Do not bundle copyrighted Pokemon card art, official logos, or official product images unless they already exist in the repo and are licensed/approved.
- Use generic TCG placeholders where needed.
- Keep copy compatible with a Pokemon / TCG collector audience without relying on unauthorized assets.

## Checks

Run the repo's available checks, usually:

- npm run lint:src
- npm run build (record the largest chunk; `node scripts/report-chunk-sizes.mjs dist`)
- the node suites in `.github/workflows/ci.yml` (same list CI runs on every push)
- `npm run test:plain-language` after any copy change

Status docs: `docs/APP_IMPROVEMENTS_100_2026_10_25.md` (work log) and
`docs/FEATURE_STATUS_MATRIX.md`. `docs/CURRENT_PUBLIC_BETA_STATUS.md` is a
June 2026 snapshot kept for history only.
- npm run build
- npx expo-doctor
- npx tsc --noEmit

If a check does not exist, skip it and document that.
