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
| 2 - Scout Improvement | Complete | `821567f` | Family-safe Scout polish. |
| 3 - Vault Improvement | Complete | `973e854` | Master-card grouping clarity, Add Item copy, and Vault QA. |
| 4 - Market Improvement | Complete | `b372544` | Fair discovery polish, honest value/source copy, and mobile search/results spacing. |
| 5 - Forge Improvement | Complete | `2f88f4e` | Exact variant/copy language, trade/listing/sales preview polish, and safer suggestion copy. |
| 6 - The Spark Improvement | Complete | `Improve The Spark impact and donation preview` | Impact dashboard, donation category, sponsor/volunteer, and no-payment preview polish. |
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

### Section 3 - Vault Improvement

Status: Complete. Commit message `Improve Vault master-card collection flows`.

Summary:

- Improved Vault Home master-card clarity with a compact model panel explaining that one card identity contains variants, duplicates, graded copies, promos, and wishlist wants.
- Tightened Vault folder and quick-action copy around master cards, variants, manual add, graded/sealed tracking, duplicate review, and review-before-saving behavior.
- Added item/detail copy for master-card grouping and exact copy context so variants and owned copies are easier to understand.
- Added the requested Add Item sentence to the main Review and Add wizard: already-owned cards should be added as a variant or duplicate under the same master card.
- Softened the shared public-facing disclaimer from `AI suggestions` to `Suggestions` to avoid implying live AI behavior.
- No Vault backend write, schema change, upload service, card API, scraping, live image fetch, auth change, billing change, database schema change, or RLS change was added.

Checks:

- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `git diff --check`: passed with existing LF-to-CRLF working-copy warnings only.
- `npm.cmd run test:vault`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:vault-workflows`: passed.
- `npm.cmd run test:inventory-detail`: passed.
- `npm.cmd run test:vault-set-mastery`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run smoke:beta`: passed.

QA:

- Screenshots and result JSON: `artifacts/qa/feature-improvement-train/vault/`
- Captured Vault Home, Vault master-card panel, and Vault Add Item / Quick Add at 390x844, 430x932, and 1440x900.
- Result: no horizontal overflow, no console errors, no maximum update depth errors.
- Automated fixed-bottom-nav detection flagged scrollable home content intersections at mobile sizes; visual review found no hidden primary Vault action. Current preview data has an empty Vault, so item-detail copy was source/build verified but not opened from a saved record in screenshot QA.

Mock-only notes:

- Folder counts, master-card preview examples, Add Item review paths, scan/binder/import flows, and suggestions remain UI/mock/local-only unless existing app behavior already stores local records.
- No deploy was run.

### Section 4 - Market Improvement

Status: Complete. Commit message `Improve Market discovery and fair value UI`.

Summary:

- Improved Market copy so fair value, source labels, data freshness, and no-checkout/no-stock-guarantee boundaries are clearer.
- Renamed result value labels from market-comps language to fair-estimate/fair-comps language.
- Kept source/freshness labels visible on compact Market cards while limiting badge density on mobile.
- Fixed the mobile Market prompt/search area so helper chips, UPC/SKU controls, Market tabs, and the fair-search card no longer collide at 390/430 widths.
- Fixed typed Market results so the discovery foundation is prompt-only and no longer pushes search results far below the first viewport.
- Fixed mobile searched-results spacing so the search field, results header, sort/filter controls, active filter chips, set match, and first result stack in a readable order.
- No Market catalog RPC/query path, pricing API, checkout, scraping, auth, billing, database schema, or RLS behavior was changed.

Checks:

- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `git diff --check`: passed with existing LF-to-CRLF working-copy warnings only.
- `npm.cmd run test:market`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run smoke:catalog-search`: passed.
- `npm.cmd run test:product-display`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run smoke:beta`: passed.

QA:

- Screenshots and result JSON: `artifacts/qa/feature-improvement-train/market/`
- Captured Market Home, typed Market results, and Product Detail at 390x844, 430x932, and 1440x900.
- Result: no horizontal overflow, no console errors, no maximum update depth errors.
- Automated fixed-bottom-nav detection flagged mobile home/results intersections because the fixed dock is present in the viewport; visual review did not find a hidden primary Market action.

Mock-only notes:

- Market home discovery cards, fair range cards, watch prompts, and grouped/premium presentation remain UI/mock/local-only unless existing safe catalog data is already being read.
- Existing catalog images may appear from the current product display path; this section did not add real image fetching or copyrighted assets.
- No deploy was run.

### Section 5 - Forge Improvement

Status: Complete. Commit message `Improve Forge trade and seller workspace`.

Summary:

- Added exact variant/copy rules to the Forge command panel for master-card identity, exact-copy selection, and parent approval expectations.
- Improved Forge trade/listing/sales preview cards so Trade Analyzer, Listing Builder, and Sales Ledger read as distinct workflows.
- Improved the locked Forge access state so normal users see exact-copy, trade, listing, sales, receipt, and recordkeeping value before enabling seller tools.
- Added exact-copy guidance to Trade Analyzer: select the specific raw, graded, sealed-related, or duplicate copy before saving trade history.
- Added exact-copy guidance to Forge item detail so listing, trade, and sale actions stay tied to the selected variant/copy.
- Softened remaining listing-draft copy from `AI` language to `Smart suggestions` / `Listing suggestion`, with review-before-saving and no-posting language.
- No Forge backend write, inventory mutation behavior, marketplace posting, payment, checkout, upload, live AI, auth, billing, database schema, or RLS behavior was changed.

Checks:

- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `git diff --check`: passed with existing LF-to-CRLF working-copy warnings only.
- `npm.cmd run test:forge`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run test:forge-grouped-inventory`: passed.
- `npm.cmd run test:trade-value`: passed.
- `npm.cmd run test:sales-records`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run smoke:beta`: passed.

QA:

- Screenshots and result JSON: `artifacts/qa/feature-improvement-train/forge/`
- Captured Forge Home and Forge Sales Ledger routes at 390x844, 430x932, and 1440x900.
- Result: no horizontal overflow, no console errors, no maximum update depth errors.
- Public beta local state currently shows Forge locked until seller tools are enabled, so screenshots verify the locked Forge preview and sales-ledger route fallback. Source/build/tests verify seller-workspace exact-copy and smart-suggestion copy.

Mock-only notes:

- Trade Analyzer, Listing Builder, Sales Ledger, listing suggestions, and seller workflow cards remain UI/mock/local-only unless existing app behavior already stores local records.
- No deploy was run.

### Section 6 - The Spark Improvement

Status: Complete. Commit message `Improve The Spark impact and donation preview`.

Summary:

- Added a warmer Spark impact dashboard with kids helped, packs planned, events supported, monthly progress, and reviewed support milestones.
- Expanded and clarified donation/support language around cards, sealed products, packs, supplies, toys/prizes, gift cards, sponsorship interest, services, volunteer time, food/snacks, and shipping help.
- Reframed donation and thank-you actions as public beta support previews with explicit no-payment, no-checkout, no-posting, and review-before-counting copy.
- Improved shop/sponsor/volunteer support copy so The Spark feels like an emotional impact hub without implying live payments or donation processing.
- Kept parent safety, private child/family details, admin review, and no private child messaging guardrails visible.
- No Spark payment processing, donation backend, checkout, upload, live AI, auth, billing, database schema, or RLS behavior was changed.

Checks:

- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `git diff --check`: passed with existing LF-to-CRLF working-copy warnings only.
- `npm.cmd run test:kids-program`: passed.
- `npm.cmd run test:quick-add`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:spark`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.
- `npm.cmd run smoke:beta`: outside-sandbox rerun passed.

QA:

- Screenshots and result JSON: `artifacts/qa/feature-improvement-train/spark/`
- Captured The Spark home, Donate, and Thank You routes at 390x844, 430x932, and 1440x900.
- Result: no horizontal overflow, no console errors, no maximum update depth errors.
- Automated fixed-bottom-nav detection flagged mobile intersections because the fixed dock is present in the viewport; visual review found no hidden primary Spark action.

Mock-only notes:

- Impact counts, monthly support goal, donation categories, sponsor interest, support review, and thank-you state remain UI/mock/local-only.
- No deploy was run.
