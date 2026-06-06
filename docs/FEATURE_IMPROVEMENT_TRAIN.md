# Feature Improvement Train

## Run Context

- Start time: 2026-06-06T13:20:28.1146832-04:00
- Branch: `ui-100-preview-checkpoint`
- Starting commit: `87d7d1e4a6d8a7a4cbe7aa100dacfc6e411d3134`
- Starting git status: clean
- Deploy status: no deploy run during this train unless explicitly approved later
- Backend/auth/billing/database/RLS status: no changes intended or approved

## Safety Rules

- Keep new work UI/mock/local-only unless an existing safe read-only path is already present.
- Do not add scraping, checkout, auto-buy, payments, uploads, messaging, live AI, real image fetching, or live inventory integrations.
- Do not expose exact restock pattern history, vendor schedules, employee schedule data, private child data, raw Scout patterns, or admin-only data to normal users.
- Keep Free useful as a complete core collector experience.

## Section Tracker

| Section | Status | Commit | Notes |
| --- | --- | --- | --- |
| 1 - Public Beta Feedback + Waitlist | Complete | `87d7d1e` | Added public beta feedback/waitlist flow, local fallback, existing best-effort feedback path, safety copy, and docs before this train tracker was created. |
| 2 - Scout Improvement | Complete | `Improve Scout family-safe restock flows` | Family-safe Scout polish; final commit hash reported after commit. |
| 3 - Vault Improvement | Pending | Pending | Master-card and collection flow polish. |
| 4 - Market Improvement | Pending | Pending | Fair discovery polish and mobile search spacing. |
| 5 - Forge Improvement | Pending | Pending | Trade/seller workspace polish. |
| 6 - The Spark Improvement | Pending | Pending | Impact and donation preview polish. |
| 7 - Tidepool Improvement | Pending | Pending | Safe community polish. |
| 8 - Ember Assist Improvement | Pending | Pending | Guided helper polish. |
| 9 - Parent Center Improvement | Pending | Pending | Safety controls polish. |
| 10 - Shop Portal Improvement | Pending | Pending | Trusted shop preview polish. |
| 11 - Admin Review Improvement | Pending | Pending | Moderation readability polish. |
| 12 - Onboarding Improvement | Pending | Pending | Virginia-first beta flow polish. |
| 13 - Final Full-App Polish | Pending | Pending | Consistency, spacing, mock honesty, and public beta framing. |

## Section Logs

### Section 1 - Public Beta Feedback + Waitlist

Status: Complete. Commit `87d7d1e`.

Summary:

- Added public beta feedback/waitlist entry points from landing, Hearth, More, onboarding/waitlist, The Spark, Shop Portal, and Ember Assist.
- Added form fields for role, state, reason, interests, message, optional name, email/follow-up, and safety consent.
- Submission uses existing best-effort feedback storage when available and otherwise shows an honest local fallback.
- No backend/auth/billing/database/RLS changes were made.
- No deploy was run.

Checks:

- `git diff --check`: passed.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: passed.
- `npm.cmd run typecheck --if-present`: passed.
- `npm.cmd test --if-present`: passed.
- `npm.cmd run format:check --if-present`: passed.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:onboarding --if-present`: passed.
- `npm.cmd run test:kids-program`: passed.
- `npm.cmd run test:spark`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:ember-assist`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run test:vault`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:vault-workflows`: passed.

QA:

- Screenshots and result JSON: `artifacts/qa/public-beta-feedback-waitlist/`
- 28 captures across 390x844, 430x932, 768x1024, and 1440x900.
- Result: no horizontal overflow, no bottom-nav overlap, no console errors, no maximum update depth errors.

### Section 2 - Scout Improvement

Status: Complete. Commit message `Improve Scout family-safe restock flows`.

Summary:

- Improved Scout Home mock report cards with Worth the Trip guidance, proof strength, and protected-detail labels.
- Strengthened Scout safety copy: current reports, useful proof, exact quantities hidden unless shop-approved, no vendor schedules, no employee names, no private messages, and no checkout shortcuts.
- Improved Scout Online signal cards with manual-watch/source-scope labels.
- Added a Free-is-useful note to Scout Watchlist so one watched store, manual reports, screenshot review UI, and Worth the Trip context remain clear as core features.
- Improved Add Report, Scan Screenshot, and Review Report shells with reusable review guardrails and clearer review-before-sharing copy.
- Fixed mobile visual regressions found during QA: Scout stat tiles no longer collide, and mock-only Scout flow badges no longer stretch.
- No Scout backend write, upload, OCR, scraping, live AI, checkout, inventory pull, auth change, billing change, database schema change, or RLS change was added.

Checks:

- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `git diff --check`: passed with existing LF-to-CRLF working-copy warnings only.
- `npm.cmd run test:scout`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run smoke:beta`: passed.

QA:

- Screenshots and result JSON: `artifacts/qa/feature-improvement-train/scout/`
- Captured Scout Home, Scout Online, Scout Watchlist, Scout Add Report, Scout Scan Screenshot, and Scout Review Report at 390x844, 430x932, and 1440x900.
- Result: no horizontal overflow, no console errors, no maximum update depth errors.
- Automated dock-overlap detection flagged fixed-bottom-nav intersections on some mobile viewport captures; visual review did not find a hidden primary Scout action.

Mock-only notes:

- Scout report cards, online signals, product watches, extracted screenshot data, and report submission state remain mock/local UI examples.
- No deploy was run.
