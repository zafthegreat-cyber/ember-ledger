# Real-Phone-Style Master Card QA

## Scope

Focused public beta QA for the master-card grouping and premium card image effect release.

- Public URL: `https://emberandtide.app`
- Deployed commit checked: `46c0d2c92457637d0e347b041a58d88c0601286a`
- Vercel deployment ID: `dpl_DXX6pT2oJhnKdnW8Eyn7UJtoMCS6`
- Live app-version: `dpl_DXX6pT2oJhnKdnW8Eyn7UJtoMCS6-46c0d2c92457637d0e347b041a58d88c0601286a-2026-06-06T15:12:24.645Z`
- QA artifact folder: `artifacts/qa/real-phone-master-card-qa/`
- Result JSON: `artifacts/qa/real-phone-master-card-qa/real-phone-master-card-qa-results.json`

No deploy was run during this QA pass.

## Screens Tested

- Vault
- Vault Item Detail / grouped copies drawer
- Add Item / Review and Add
- Market
- Product Detail
- Forge
- Trade Analyzer / Forge preview context
- More access path

## Viewports Tested

- `390x844`
- `430x932`
- `393x852`
- `414x896`
- `768x1024`
- `1440x900`

Screenshots were regenerated for each tested screen and viewport. The run produced 48 viewport screenshots.

## Real-Phone Result

Real physical device QA is pending for the user. Codex could run real-phone-style browser viewports, but it does not have a physical phone available in this environment.

## Master-Card Grouping Findings

- Vault showed grouped master cards with the seeded `Ember Dragon ex` identity.
- Variants and copies stayed under the master card identity: Normal, Reverse Holo, PSA 9 slab, and Illustration Rare were visible in grouped chips/cards.
- Vault Item Detail exposed the grouped copy/variant context through the child record drawer.
- Forge showed the master-card preview model and clear exact-copy language: choose the card identity first, then choose the exact raw, graded, or special variant for listing or trade review.
- Market displayed premium grouped/master-style result treatment where applicable and kept fair-value language visible.
- Variant chips wrapped on mobile and remained readable.

## Premium Image Effect Findings

- CSS-only premium frames, glow, and foil-style effects rendered without obscuring text in Vault and Forge.
- Effects did not cause visible layout shift in the sampled mobile and desktop captures.
- Placeholder card surfaces stayed understandable for parents/kids.
- Product Detail can still show existing external catalog card images when the live catalog provides them. This QA pass did not add copyrighted assets, official symbols, real image fetching workflows, scraping, uploads, or new image integrations.

## Bottom Nav / Tap / Scroll Findings

- No horizontal overflow was detected in the QA matrix.
- No console errors or maximum update depth errors were captured.
- The live app uses an internal `main` scroll container, so QA scrolled that container directly.
- Automated overlap detection still flagged fixed bottom-nav intersections, mostly the active `Market` dock item. Visual review did not find release-blocking hidden primary actions in Vault, grouped copy detail, Add Item, Market, Forge, or More.
- Product Detail action rows can sit near the bottom of some scrolled captures, but they remain reachable by scrolling and were not release-blocking in this pass.

## Issues Found

No release-blocking issue was found.

Non-blocking follow-ups:

- Market top/search cards are cramped at `390x844` and `430x932`; small labels can visually crowd each other. This is not caused by master-card grouping and did not block grouped card actions.
- Add Item is review-first and reachable, but the exact requested sentence, `Already have this card? Add it as a variant or duplicate under the same master card.`, is not present. A later copy pass should add that clearer wording.
- Add Item still uses the phrase `AI suggestions may be incomplete or incorrect.` This did not add live AI, but public beta copy would be clearer if softened to generic `Suggestions may be incomplete or incorrect.`
- The normal-user path reviewed did not expose a separate full Trade Analyzer route from More/Forge; the live Forge screen currently presents Trade Analyzer as preview/access-state content, while `test:trade-value` continues to pass.

## Fixes Made

No app code, CSS, backend, auth, billing, database, RLS, scraping, checkout, payments, uploads, messaging, live AI, live inventory, real image fetching, or image asset changes were made.

Only this QA documentation file was added.

## Checks Run

- `npm.cmd run build` - passed
- `npm.cmd run smoke:beta` - passed
- `npm.cmd run test:vault` - sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed
- `npm.cmd run test:market` - sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed
- `npm.cmd run test:forge` - sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed
- `npm.cmd run test:trade-value` - passed
- `npm.cmd run test:quick-add` - passed
- `npm.cmd run test:app-fallbacks` - passed
- `npm.cmd run test:menu-full-page-routes` - passed
- `git diff --check` - run after documentation update

## Redeploy Status

No redeploy was run. The QA pass found no release-blocking issue requiring a production update.

## Safety Confirmation

- No backend/auth/billing/database/RLS logic changed.
- No scraping, checkout, payments, uploads, messaging, live AI, live inventory, real image fetching, auto-buy behavior, exact restock pattern history, vendor schedules, or employee schedule data was added.
- Master-card grouping remains frontend/mock/local UI preparation on top of existing safe data paths.

## Next Recommended Task

Prepare the public beta feedback and waitlist task:

- add a safe public beta feedback path
- keep submissions demo-safe or explicitly approved before backend wiring
- preserve anti-scalper Scout copy
- do not alter backend/auth/billing/database/RLS without separate approval
