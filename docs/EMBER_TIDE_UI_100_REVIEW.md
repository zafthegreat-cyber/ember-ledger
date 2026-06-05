# Ember & Tide UI 100 Review

Date: 2026-06-04

## Scope

This pass polished the mock-only Ember & Tide full-app UI preview and reusable design-system foundation. It did not deploy, commit, change backend behavior, alter auth/RLS/billing/database logic, connect scraping, connect checkout, connect live AI, or change production API contracts.

## Files Updated

- `screen-set.html` remains the standalone visual QA entry.
- `src/mobileScreenSet.jsx` now renders a clickable full-app screen preview with role switching, screen rail navigation, semantic selected states, and mock-only safety states.
- `src/mobileScreenSet.jsx` now also replaces the repeated generic role card with contextual role/safety cards per screen, so Hearth, Scout, Vault, Forge, Market, Tidepool, The Spark, Ember Assist, More, Parent Center, Shop Portal, and Admin Review have page-specific context.
- `src/mobileScreenSet.css` now supports the responsive preview board, compact mobile ordering, accessible wrapped role controls, five-destination compact bottom nav, dock-safe phone scrollports, safety panels, focused loading/restricted states, compact Market chart treatment, overflow-safe detail badges, high-contrast role/context cards, Hearth command-center cue cards, Tidepool community preview cards, and cleaner Forge value comparison rows.
- `src/components/ember-ui/index.tsx` gained reusable icon and state primitives for the preview/component foundation.
- `src/mock/emberTideData.ts` and `src/types/emberTide.ts` now cover broader mock-only UI states, page types, role-gated previews, Scout safety copy, richer Scout report extraction examples, Vault tracker actions, Forge trade/listing/sales workspace content, Market search/discovery cards, Tidepool moderated-community examples, Spark emotional impact content, Ember Assist prompt/help examples, More command shortcuts, Parent Center privacy copy, Shop trust controls, and Admin review guardrails.
- `design/tokens/tokens.json` was adjusted for the phone preview density, touch layout, and detail badge width containment.

## Screenshot Artifacts

- Mobile 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-390x844.png`
- Mobile 430x932: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-430x932.png`
- Tablet 768x1024: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\tablet-768x1024.png`
- Desktop 1440x900: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\desktop-1440x900.png`
- Mobile Scout 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-scout-390x844.png`
- Mobile The Spark 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-spark-390x844.png`
- Mobile Parent Center 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-parent-center-390x844.png`
- Mobile Shop Portal 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-shop-portal-390x844.png`
- Mobile Admin Review 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-admin-review-390x844.png`
- Mobile Admin Hidden From Family 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-admin-hidden-family-390x844.png`
- Mobile Loading State 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-loading-state-390x844.png`
- Mobile Restricted State 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\mobile-restricted-state-390x844.png`
- Expanded QA results JSON: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\ui-100-qa-results.json`
- Expanded mobile screenshots folder: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\`
- Expanded Mobile Vault 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\vault-390x844.png`
- Expanded Mobile Market 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\market-390x844.png`
- Expanded Mobile Tidepool 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\tidepool-390x844.png`
- Expanded Mobile Ember Assist 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\ember-assist-390x844.png`
- Expanded Mobile More 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\more-390x844.png`
- Expanded Mobile Forge Seller 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\forge-seller-390x844.png`
- Expanded Mobile Forge Hidden From Family 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\forge-hidden-family-390x844.png`
- Expanded Mobile Trade Analyzer 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\trade-analyzer-390x844.png`
- Expanded Mobile Scout Reports 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\scout-reports-390x844.png`
- Expanded Mobile Scan Screenshot 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\scan-screenshot-390x844.png`
- Expanded Mobile Review Report 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\review-report-390x844.png`
- Expanded Mobile Empty Vault 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\empty-vault-390x844.png`
- Expanded Mobile Welcome 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\welcome-390x844.png`
- Expanded Mobile State Check 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\state-check-390x844.png`
- Expanded Mobile Notifications 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\expanded\notifications-390x844.png`
- Full 390px all-screen matrix folder: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\all-screens\`
- Full 390px all-screen QA results JSON: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\all-screens\all-screens-390-qa-results.json`
- Corrected Mobile Product Detail 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\all-screens\24-market-product-detail.png`
- Targeted realism screenshots folder: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\`
- Targeted realism QA results JSON: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\realism-pass-results.json`
- Realism Mobile Hearth 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\hearth-realism.png`
- Realism Mobile Scout 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\scout-realism.png`
- Realism Mobile Forge Seller 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\forge-realism.png`
- Realism Mobile Market 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\market-realism.png`
- Realism Mobile Tidepool 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\tidepool-realism.png`
- Realism Mobile The Spark 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\the-spark-realism.png`
- Realism Mobile Ember Assist 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\ember-assist-realism.png`
- Realism Mobile More 390x844: `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass\artifacts\qa\ember-tide-ui-100\realism-pass\more-realism.png`

## QA Results

| Check | Result |
| --- | --- |
| `screen-set.html` builds as standalone Vite entry | Pass |
| In-app browser page identity | Pass: `Ember & Tide Mobile Screen Set` |
| Meaningful content rendered | Pass: 41 phone screens, 40 screen rail buttons, 7 role buttons |
| Role switcher interaction | Pass: selected `Family`, `Shop`, and `Admin` for targeted screenshots |
| 390px role controls | Pass: role switcher wraps and fits the viewport with no clipped role labels |
| Screen rail interaction | Pass: selected Hearth, Scout, The Spark, Parent Center, Shop Portal, Admin Review, Market Loading, and Permission Needed |
| Compact bottom navigation | Pass: focused phone nav has exactly `Hearth`, `Scout`, `Vault`, `Market`, `More` |
| Ember Assist action | Pass: Ember Assist is a floating global action, not a bottom-nav peer |
| 390x844 horizontal overflow | Pass: none |
| 430x932 horizontal overflow | Pass: none |
| 768x1024 horizontal overflow | Pass: none |
| 1440x900 horizontal overflow | Pass: none |
| Framework overlay | Pass: none detected |
| Console warnings/errors during screenshot capture | Pass: none from page |
| Scout UX safety | Pass: current reports are framed as proof-led signals, not raw patterns |
| The Spark emotional polish | Pass: mission copy explains safe starter moments, trusted adults, and family support |
| Parent Center safety clarity | Pass: child profiles stay private, messaging is blocked, approvals are explicit |
| Shop Portal trust controls | Pass: quantity privacy, proof review, and family-first copy are visible |
| Admin Review readability | Pass: admin queue is readable in Admin role and hidden behind restricted state in Family role |
| Empty/loading/restricted states | Pass: loading state is focused, restricted state avoids hidden data exposure, and no duplicate feature preview renders under state cards |
| Expanded 390px page consistency | Pass: Vault, Market, Tidepool, Ember Assist, More, Forge, Trade Analyzer, Scout Reports, Scan Screenshot, Review Report, Empty Vault, Welcome, State Check, and Notifications captured with no overflow or console issues |
| Full 40-screen 390px matrix | Pass: onboarding, core, Scout, Vault, Forge, Market, community, Spark, Assist, More, Family, Shop, Admin, and required state screens captured with no overflow failures, no page console errors, no framework overlay, five bottom-nav labels per phone, role controls fitting the viewport, and focused phone content clearing the bottom dock |
| Market visual density | Pass: market chart is contained, static, and supporting instead of dominating the first mobile viewport |
| Product detail badge containment | Pass: source/freshness badge wraps inside the Product Detail phone frame at 390px |
| Bottom nav/FAB safety | Pass: phone content scrollport now reserves space above bottom nav and the persistent Ember Assist action |
| Persistent Ember Assist geometry | Pass: stricter 40-screen geometry check found no content overlap, no nav overlap, and no assist-action overlap |
| Role-context icon sizing | Pass: 20x20 rendered icon |
| Role summary text contrast | Pass: computed `rgb(255, 247, 232)` for title text |
| Generic role-card repetition | Pass: repeated `Family view` template phrase removed from the focused preview screens and role-gated header copy |
| Targeted realism screenshot pass | Pass: Hearth, Scout, Vault, Forge, Market, Tidepool, The Spark, Ember Assist, More, and Admin Review captured at 390x844 with no overflow, no page console errors, and no generic role-card copy |
| Page-specific realism | Pass: primary pages now have distinct contextual cards and mock content instead of duplicated safety cards |
| Forge workspace realism | Pass: Forge now shows trade desk, value comparison, grouped inventory, listing draft, sales ledger, and seller boundary content |
| Ember Assist utility | Pass: prompt cards include scan card, screenshot scan, trade fairness, listing price help, kid-friendly set guidance, unsafe-report routing, recent help examples, and privacy copy |
| More command menu | Pass: More surfaces Forge, Tidepool, The Spark, Parent Center, Shop Portal, Admin Review, Settings, Privacy & Safety, Membership, Ember Assist, and Support as role-aware shortcuts |

## Commands Run

- `git diff --check`
- `npm.cmd run build`
- `npm.cmd run lint --if-present`
- `npm.cmd run typecheck --if-present`
- `npm.cmd test --if-present`
- `npm.cmd run format:check --if-present`
- `npm.cmd run smoke:beta`
- `npm.cmd run test:quick-add`
- `npm.cmd run test:app-fallbacks`
- `npm.cmd run test:menu-full-page-routes`
- `npm.cmd run test:scout`
- `npm.cmd run test:market`
- `npm.cmd run test:kids-program`
- `npm.cmd run test:admin`
- `npm.cmd run test:ember-assist`
- One-off 40-screen Playwright geometry check for content, bottom nav, and persistent Ember Assist overlap
- Targeted 390x844 realism screenshot pass for Hearth, Scout, Vault, Forge, Market, Tidepool, The Spark, Ember Assist, More, and Admin Review
- Refreshed full 40-screen 390x844 matrix with no-overflow, five-item-nav, dock/assist overlap, console-error, and generic role-card checks

## Known Warnings

- Existing Vite large chunk warning remains.
- Existing LF-to-CRLF Git working-copy warning remains.
- Sandbox Chromium launch hit the known `spawn EPERM`; screenshots were captured with the same Playwright script rerun outside the sandbox.
- `test:scout`, `test:market`, and `test:admin` also hit the known sandbox Chromium `spawn EPERM`; each passed on outside-sandbox rerun.
- `npm.cmd run test:market` had one transient outside-sandbox Supabase REST 500 from `catalog_search_lightweight`; the same check passed on rerun without code changes.
- Final verification rerun passed `test:market` without the transient 500.

## Design Notes

- Bottom navigation now follows the compact production rule: five primary destinations only (`Hearth`, `Scout`, `Vault`, `Market`, `More`). Forge, Tidepool, The Spark, Shop Portal, Settings, and Admin-oriented areas are represented through the `More` destination in the preview.
- All screen data is mock-only and safety-bounded. No raw Scout patterns, exact vendor schedules, checkout, scraping, private child data, or live AI claims were introduced.
- The preview uses original Ember/Tide marks, icons, abstract foil cards, and generic placeholder language. It does not include official Pokemon artwork, logos, card frames, or proprietary product imagery.

## Next Step

Use this preview as the visual QA reference for future route-by-route integration. The next production integration should move one live page at a time and keep `screen-set.html` intact as the review surface.
