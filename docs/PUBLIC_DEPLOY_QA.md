# Public Deploy QA

## Deploy Summary

- Deploy date/time: 2026-06-05 11:39:59 -04:00
- Hosting provider: Vercel Git integration
- Public URL: https://emberandtide.app
- Branch deployed: main
- Commit deployed: 3209a126422a50e6ad1036b1e67454958894efeb
- Vercel deployment ID: dpl_9eN2QDy372TSnTfb8wbFRsH65hy7
- App version result: dpl_9eN2QDy372TSnTfb8wbFRsH65hy7-3209a126422a50e6ad1036b1e67454958894efeb-2026-06-05T15:20:02.231Z
- Built at: 2026-06-05T15:20:03.993Z

## What Is Live

- Public signed-out beta landing, login, create account / beta request framing, and public preview entry.
- Integrated live UI train through Section 16.
- Hearth, Scout, Vault, Market, More, Membership, onboarding, The Spark, Tidepool, Forge, Parent Center, Shop Portal, and protected Admin Review surfaces.
- screen-set.html remains available as the approved 40-screen visual reference.
- Free tier copy presents Free as the complete core collector app.

## Mock / Local-Only Boundaries

These surfaces remain preview/mock/local UI unless later backend work is explicitly approved:

- Scout report submission and screenshot extraction flows.
- Vault add/review and scan placeholders.
- Market fair-value examples and watch actions.
- Tidepool posts and moderation examples.
- The Spark donation interest and thank-you flows.
- Ember Assist helper responses.
- Forge trade/listing/sales ledger preview workflows.
- Shop Portal and Admin Review mock actions.
- Onboarding/waitlist UI beyond existing safe auth behavior.

## Checks Run Before Push

- git diff --check: passed.
-
pm.cmd run build: passed with existing Vite large chunk warning.
-
pm.cmd run lint --if-present: exited cleanly.
-
pm.cmd run typecheck --if-present: exited cleanly.
-
pm.cmd test --if-present: exited cleanly.
-
pm.cmd run format:check --if-present: exited cleanly.
-
pm.cmd run smoke:beta: passed.
-
pm.cmd run test:app-fallbacks: passed.
-
pm.cmd run test:menu-full-page-routes: passed.
-
pm.cmd run test:onboarding --if-present: passed.
-
pm.cmd run test:quick-add: passed.
-
pm.cmd run test:scout: sandbox Chromium spawn EPERM; outside-sandbox rerun passed.
-
pm.cmd run test:market: sandbox Chromium spawn EPERM; outside-sandbox rerun passed.
-
pm.cmd run test:kids-program: passed.
-
pm.cmd run test:spark: sandbox Chromium spawn EPERM; outside-sandbox rerun passed.
-
pm.cmd run test:ember-assist: passed.
-
pm.cmd run test:admin: sandbox Chromium spawn EPERM; outside-sandbox rerun passed.
-
pm.cmd run test:admin-command-center: passed.
-
pm.cmd run test:tidepool-community: passed.
-
pm.cmd run test:sales-records: passed.
-
pm.cmd run test:forge-grouped-inventory: passed.
-
pm.cmd run test:trade-value: passed.

## Production Smoke / Checks

Run against https://emberandtide.app/?betaLocalMode=true where browser checks need the public beta preview surface:

-
pm.cmd run smoke:beta: passed.
-
pm.cmd run test:scout: passed.
-
pm.cmd run test:market: passed.
-
pm.cmd run test:spark: passed.
-
pm.cmd run test:admin: passed.
-
pm.cmd run test:app-fallbacks: passed.
-
pm.cmd run test:menu-full-page-routes: passed.
-
pm.cmd run test:onboarding --if-present: passed.
-
pm.cmd run test:quick-add: passed.
-
pm.cmd run test:kids-program: passed.
-
pm.cmd run test:ember-assist: passed.
-
pm.cmd run test:admin-command-center: passed.
-
pm.cmd run test:tidepool-community: passed.
-
pm.cmd run test:sales-records: passed.
-
pm.cmd run test:forge-grouped-inventory: passed.
-
pm.cmd run test:trade-value: passed.

## Post-Deploy Visual QA

Screenshots saved under:

- rtifacts/qa/public-deploy/

Result files:

- rtifacts/qa/public-deploy/public-deploy-final-qa-results.json
- rtifacts/qa/public-deploy/public-deploy-final-qa-compact-evaluated.json

Viewports tested:

- 390x844
- 430x932
- 768x1024
- 1440x900

Screens tested:

- Signed-out landing
- Hearth
- Scout
- Vault
- Market
- More
- Membership
- Onboarding
- The Spark
- Ember Assist
- Tidepool
- Forge
- Parent Center
- Shop Portal
- Admin Review protected state
- screen-set.html

Results:

- URL loads: passed.
- No console errors: passed.
- No horizontal overflow: passed.
- Mobile bottom nav / compact dock overlap: passed.
- Mock-only actions do not present as completed real transactions: passed by copy review.
- Free still reads like a complete collector app: passed.
- Scout avoids scalper-friendly data: passed.
- Admin Review remains protected for normal signed-out users: passed.

## Known Warnings

- Existing Vite large chunk warning.
- Local sandbox Chromium can hit spawn EPERM; browser checks were rerun outside sandbox and passed.
- Direct no-query app routes currently show the signed-out public beta landing. Full app section QA uses the public beta preview state (Preview the app) or etaLocalMode=true for routed screenshots.
- Desktop routes can have desktop navigation/sidebar geometry that should not be evaluated as mobile bottom-dock overlap; compact mobile dock checks passed.

## Safety Confirmation

- No backend/auth/billing/database/RLS changes were made for this deployment.
- No scraping, checkout, payments, uploads, messaging, live AI, live inventory integrations, auto-buy behavior, vendor schedules, employee schedules, exact restock pattern history, or production secret changes were added.

## Next Recommended Task

Start post-public-beta issue triage from the live app, beginning with route/preview-mode behavior and any signed-out public beta onboarding refinements the user wants.
