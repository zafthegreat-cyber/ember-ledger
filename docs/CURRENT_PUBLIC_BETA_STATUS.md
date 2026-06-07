# Current Public Beta Status

## Reconciliation Time

- Checked at: 2026-06-06T17:06:00.7822969-04:00
- Public URL: https://emberandtide.app
- Branch checked: `ui-100-preview-checkpoint`

## Git State

- Latest local commit before this implementation pass: `310412d Document current public beta status`
- Current git status before this document: clean
- Current production branch reference: `origin/main` at `46c0d2c92457637d0e347b041a58d88c0601286a`
- Live app-version: `dpl_DXX6pT2oJhnKdnW8Eyn7UJtoMCS6-46c0d2c92457637d0e347b041a58d88c0601286a-2026-06-06T15:12:24.645Z`
- Live deployment ID: `dpl_DXX6pT2oJhnKdnW8Eyn7UJtoMCS6`
- Live deployed commit: `46c0d2c92457637d0e347b041a58d88c0601286a`

## Production Versus Local

Production is behind the current local branch.

The local branch includes these post-production feature-improvement commits:

- `87d7d1e Add public beta feedback and waitlist flow`
- `821567f Improve Scout family-safe restock flows`
- `973e854 Improve Vault master-card collection flows`
- `b372544 Improve Market discovery and fair value UI`
- `2f88f4e Improve Forge trade and seller workspace`
- `3af3205 Improve The Spark impact and donation preview`
- `fbf2b45 Improve Tidepool safe community UI`
- `5b11ee6 Improve Ember Assist guided helper UI`
- `29ae0e3 Improve Parent Center safety controls UI`
- `389d724 Improve Shop Portal trusted shop preview`
- `921dba2 Improve Admin Review moderation UI`
- `4f45ceb Improve onboarding and Virginia-first beta flow`
- `6314904 Polish public beta feature experience`

## Feedback And Waitlist Status

- Local commit exists: `87d7d1e Add public beta feedback and waitlist flow`
- Production status: not live on the public beta deployment checked here
- Evidence: live app-version and `origin/main` both resolve to `46c0d2c`, which predates `87d7d1e`
- Live browser check: public landing, Hearth route, More route, onboarding waitlist, Spark, shop, and Assist route checks did not expose the new `Join Beta / Request State`, `Request your state`, public beta feedback form, safety consent copy, validation state, or local fallback success state
- Live browser QA viewports checked: 390x844, 430x932, 1440x900
- Live browser QA result for those checked public pages: loaded with no console errors and no horizontal overflow

## Forge Business Ledger Status

Forge Business Ledger is now implemented locally as a front-end-only planning surface. It is not deployed to production.

The local Forge Business Ledger includes:

- `Money In`
- `Money Out`
- `Paid / Unpaid status`
- Helper or employee payout tracking
- Partner split tracking
- Profit assignment buckets
- Reinvestment buckets
- Event / card show report
- Export preview
- Exact visible disclaimer: `Planning tool only. Ember & Tide does not provide tax, payroll, accounting, or legal advice.`

The Ledger is reachable from Forge through the existing Forge action strip and by the local `/forge/ledger` route. It uses existing local sales, expenses, mileage, inventory, and payout-planning summaries where available, with clearly labeled planning examples when no records exist.

Forge Business Ledger deployment status: local only, not deployed. Production remains at `46c0d2c92457637d0e347b041a58d88c0601286a`.

## Checks Run

- `npm.cmd run build`: passed
- `git diff --check`: passed
- `npm.cmd run smoke:beta`: initial sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed
- `npm.cmd run test:forge`: passed outside sandbox
- `npm.cmd run test:sales-records`: passed
- `npm.cmd run test:forge-grouped-inventory`: passed
- `npm.cmd run test:trade-value`: passed
- `npm.cmd run test:quick-add`: passed
- `npm.cmd run test:app-fallbacks`: passed
- `npm.cmd run test:menu-full-page-routes`: passed
- `npm.cmd run test:onboarding --if-present`: passed
- `npm.cmd run test:spark`: passed outside sandbox
- `npm.cmd run test:ember-assist`: passed

## Known Warnings

- Existing Vite large-chunk warning appears during build.
- Chromium browser checks may hit sandbox `spawn EPERM`; outside-sandbox reruns passed during this reconciliation.
- The in-app Browser runtime could verify live pages, but could not create screenshot artifact files in this workspace during this pass.
- A local preview server was started on `http://127.0.0.1:5227/` for checks.

## Mock And Local-Only Areas

- Local public beta feedback/waitlist flow remains local/unpublished unless the branch is pushed and deployed.
- Feature-improvement train changes after `46c0d2c` remain local/unpublished.
- Forge Business Ledger planning tools remain local/unpublished until this branch is released.
- Existing Forge/Sales recordkeeping surfaces remain UI/local/mock-safe unless existing app-local behavior already applies.
- No payment, payroll, tax filing, upload, messaging, live AI, scraping, checkout, or live inventory integration was added in this reconciliation.

## Safety Confirmation

- No backend, auth, billing, database schema, or RLS changes were made during this reconciliation.
- No payments, payroll processing, tax filing, uploads, messaging, live AI, scraping, checkout, or live inventory integrations were added.
- No deploy was run during this reconciliation.

## Recommended Next Action

Decide whether to deploy the already-committed local feature-improvement branch to production. If the feedback/waitlist flow is intended to be public now, production needs a normal release of `ui-100-preview-checkpoint` or a merge/push path that advances `main` beyond `46c0d2c`.
