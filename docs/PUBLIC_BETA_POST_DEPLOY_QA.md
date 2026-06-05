# Public Beta Post-Deploy QA

## Summary

- Public URL: https://emberandtide.app
- QA date/time: 2026-06-05 12:03:34 -04:00
- Hosting provider: Vercel Git integration
- Original public beta deployment commit tested: `3209a126422a50e6ad1036b1e67454958894efeb`
- Local fix verification branch: `ui-100-preview-checkpoint`
- Redeploy status at document creation: pending code-fix deploy

## Screens Tested

Public production was tested at 390x844, 430x932, 768x1024, and 1440x900.

- Signed-out landing
- Hearth
- Scout
- Scout report flow
- Scout Online
- Scout Watchlist
- Vault
- Vault Add Item
- Market
- Market Product Detail
- More
- Settings
- Privacy & Safety
- Membership
- Parent Center
- Tidepool
- The Spark
- Donate
- Ember Assist
- Forge
- Shop Portal
- Admin Review protected state
- Onboarding
- Waitlist
- Permission Needed
- `screen-set.html`

## Public-Facing Issues Found

### Mobile Dock Overlap

Severity: blocker for public polish.

The first live public sweep found compact mobile content rendering under the fixed bottom dock on several public-beta preview pages:

- Hearth at 390x844 and 430x932
- Scout at 430x932
- Scout report flow at 390x844 and 430x932
- Onboarding / Waitlist / Permission Needed at 390x844 and 430x932
- Ember Assist at 390x844 and 430x932 because it opens over the Hearth surface

No backend or data behavior was involved. The issue was shell layout space around the fixed mobile dock.

## Fixes Made

- Added a mobile-only app-shell CSS rule in `src/App.css`.
- The compact command shell now reserves real bottom space for the fixed dock.
- The main content area scrolls above the dock instead of rendering beneath it.
- The bottom dock remains fixed, thumb-friendly, and five-tab only.
- No routes, backend writes, auth behavior, billing behavior, database schema, RLS policy, payments, uploads, messaging, live AI, scraping, checkout, or live inventory integrations changed.

## Local Fix QA

Local fixed build was verified against `http://localhost:5207/?betaLocalMode=true`.

- Screenshot folder: `artifacts/qa/public-beta-post-deploy/local-fix-final/`
- Result file: `artifacts/qa/public-beta-post-deploy/local-fix-final/local-fix-final-qa-results.json`
- Captures: 84
- Failures: 0
- Viewports: 390x844, 430x932, 768x1024, 1440x900

Results:

- No horizontal overflow.
- No visible mobile dock overlap.
- No console errors.
- No React maximum update depth errors.
- Membership retained Free as a complete core collector app.
- Scout retained anti-scalper copy and avoided unsafe pattern data.
- Admin Review remained protected in normal-user/signed-out state.

## Free Feature Parity Result

Passed. Membership still frames Free as the complete core collector app:

- Core collection tracking
- Manual card, sealed, and graded add
- Folders, tags, wishlist, missing cards, and set completion
- Basic fair value and trade analyzer
- Basic Forge ledger
- Market search/detail
- One watched Scout store
- Manual Scout reports and screenshot scan UI
- Tidepool read/report
- The Spark view/donation interest
- Ember Assist basic prompts
- Privacy and child-safety basics

Paid tiers remain framed as scale, convenience, family controls, seller/shop tools, or advanced analytics.

## Sensitive Surface Review

Passed.

- Admin Review stayed protected from normal users.
- Shop Portal stayed framed as preview/shop-review only.
- Parent Center stayed mock-only and did not expose real child data.
- The Spark donation flow did not process or imply payment.
- Market did not imply checkout, guaranteed prices, or guaranteed stock.
- Scout did not expose vendor schedules, employee schedules, exact restock patterns, or exact quantities.
- Ember Assist did not imply live AI guarantees.

## Real-Phone QA

Pending. This pass used browser automation at compact mobile, tablet, and desktop viewports. A real-phone tap/scroll pass is still recommended after the redeploy.

## Checks Run

- `git diff --check`: passed with existing LF-to-CRLF working-copy warning.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: passed.
- `npm.cmd run typecheck --if-present`: passed.
- `npm.cmd test --if-present`: passed.
- `npm.cmd run format:check --if-present`: passed.
- `npm.cmd run smoke:beta`: passed against the fixed local app.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:onboarding --if-present`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run test:scout`: passed outside sandbox.
- `npm.cmd run test:market`: passed outside sandbox.
- `npm.cmd run test:kids-program`: passed.
- `npm.cmd run test:spark`: passed outside sandbox.
- `npm.cmd run test:ember-assist`: passed.
- `npm.cmd run test:admin`: passed outside sandbox.
- `npm.cmd run test:admin-command-center`: passed.
- `npm.cmd run test:tidepool-community`: passed.
- `npm.cmd run test:sales-records`: passed.
- `npm.cmd run test:forge-grouped-inventory`: passed.
- `npm.cmd run test:trade-value`: passed.

## Known Warnings

- Existing Vite large chunk warning.
- Local sandbox Chromium can hit `spawn EPERM`; browser checks were rerun outside the sandbox and passed.
- Real-phone QA is still pending.

## Mock / Local-Only Boundaries

These remain preview/mock/local UI unless later backend work is explicitly approved:

- Scout report submission and screenshot extraction.
- Vault add/review and scan placeholders.
- Market fair-value examples and watch actions.
- Tidepool posts and moderation examples.
- The Spark donation interest and thank-you flows.
- Ember Assist helper responses.
- Forge trade/listing/sales ledger preview workflows.
- Shop Portal and Admin Review mock actions.
- Onboarding/waitlist UI beyond existing safe auth behavior.

## Safety Confirmation

- No backend/auth/billing/database/RLS changes were made.
- No scraping, checkout, payments, uploads, messaging, live AI, live inventory integrations, auto-buy behavior, vendor schedules, employee schedules, exact restock pattern history, or production secret changes were added.

## Next Recommended Task

Redeploy the CSS-only post-deploy public beta fix after checks pass, then run a focused live confirmation on Hearth, Scout, Onboarding, Ember Assist, Membership, Admin protected state, and `screen-set.html`.
