# Code 3 TCG ongoing UI refinement

Started 2026-09-15 after the user instructed continued UI improvement until stopped. Work remains local, uncommitted and unpublished at detached baseline `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2` (associated with `ui-104-final-product-ui-2`). The graphite/off-white/teal palette in COLOR_REVIEW.md remains the shared direction.

## Implemented in this continuation

- Listing intake now groups all 31 existing fields into four visible sections: listing details, price/costs, timing/pickup, and review/notes. The existing landed-cost calculation sits with its inputs. All field bindings, save/analyze handlers and validation remain.
- Shared record pages have inset summaries, organized disclosure panels, proper Back/chevron arrows, and clearer More controls. Guided forms use readable steps, opaque sticky controls and mobile-safe inputs; draft retention and navigation remain.
- Sign-in has a clearer form hierarchy and quieter recovery/access actions. Signup's public username uses the full form width with a normal 48px input. Consent controls are aligned and the Terms/Privacy link no longer has a legacy gradient. Auth markup, handlers and submissions are unchanged.
- Scout's desktop side cards size to their content and use the existing scrollable rail so values, descriptions and 44px actions fit. Keyboard focus can reach the last rail action.
- Older mobile Market/Exchange/Spark plan tiles place icons above readable labels. Current-context/status ribbons use semantic foregrounds rather than white on mint.
- Existing record Delete actions use the shared danger treatment. Navigation icons now support the existing secure/store/history keys, replacing misleading fallback plus symbols without changing navigation.

The work is presentation-only. Business rules, permissions, auth, data models, integrations, remote-execution safeguards and deployment settings remain unchanged. Bot-specific operational layouts were not edited.

## Verification so far

- Integrated production build and backend TypeScript `--noEmit` passed. Existing large bundle warning remains.
- Semantic themes: 30/30 screen/theme/width combinations passed.
- Listing form: six light/dark and 360/768/1440px scenarios passed for all fields, grouped labels, live estimates, save/review/Back, danger-action foreground, overflow and browser errors.
- Find regression passed listing intake/deletion, analysis, auction calculator, eBay configuration truth, import review, persistence and browser-error checks. Two stale test expectations were corrected to the previously approved Code 3 TCG name and already-implemented empty-feed copy; assertions were preserved.
- Shared record/forms: six scenarios and 30 captures passed for keyboard disclosures, More/Back, all form steps, required-field validation, Previous retaining values, synthetic save and original record preservation.
- Auth: existing six scenarios passed, now including signup username width/height and gradient-free Terms/Privacy assertions. An additional 12 login/reset/signup captures passed across mobile/desktop and both themes; no account was submitted.
- Older boards: 16 combinations passed bounds, plan touch targets, ribbon contrast and browser-error checks, plus Scout keyboard scrolling.
- Keyboard/reduced-motion contracts passed.
- UI lint remains non-clean at its previous baseline: 91 errors and three warnings across six existing modules, with zero added non-unused rule/message/count. The new record markup passed a supplemental JSX-aware lint check. Independent review found no introduced behavior regression.
- Full beta regression: **28/28 scenarios passed** in 356 seconds, with no open handles after cleanup. Integrated viewport matrices: **46 light + 46 dark** checks passed.
- Default repository diff whitespace check passed. A diagnostic attempt with an incompatible line-ending override reported CRLF lines as whitespace; re-running with the repository's normal configuration passed without source changes.

## Next active pass

The first integrated checkpoint above is complete.

**Account Ops responsive addition verified:** Store Accounts now uses its existing complete account cards when its nested container is 1120px or narrower, and retains a readable table in wider space. All table fields, selection controls, row actions and warning labels remain available; cards also retain the existing verification details and health reasons. The foundation browser suite passed **five scenarios / 926 assertions**. Six additional light/dark checks at 360/1440/1920px passed field/action parity, 44px actions, no clipping/overflow/errors and byte-unchanged storage. Only `account-ops-polish.css` changed. Evidence: `artifacts/qa/account-table/` and the current foundation captures.

**Search and shared overlays verified:** Search is visible on mobile, with readable destinations and scrollable local results. Scoped UI keyboard handlers add Escape dismissal, mobile Tab/Shift+Tab containment and focus return on explicit Close; destination handlers remain unchanged. The durable Search test passed four light/dark 360/1440 scenarios. Add no longer blurs the page behind it, and its More disclosure has a visible chevron; four focused checks passed. Shared dialog Close buttons stay 44×44px without flex shrink; eight Profile/Collection filter scenarios passed. The sample Order status stays a compact pill in four responsive/theme checks. A fresh production build passed after Search changes.

**Legacy navigation/map checkpoint verified:** Four existing boards retain all six inner links in a compact desktop row, outside the fixed main sidebar. The 32-case navigation matrix passed before the subsequent typography pass. Existing Scout map pins now use their provided map coordinates and 44px semantic-color targets; the existing map interaction suite passed desktop/mobile in both themes, including selection, pan, zoom, list and store navigation. No map logic changed.

**Legacy typography/layout verified:** Older boards had beige compatibility surfaces, serif figures, 6–9px captions and fixed-height containers. Shared aliases now resolve to the semantic palette and readable text scale, including nested caption text. Cards and headings fit their content; mobile decision cards stack. Normal vertical page scrolling is intentional. Header tools meet 44px targets, the covered duplicate bottom dock is excluded from layout/tab order, and focus scrolling reserves space for the visible shared dock. The existing horizontal route strip reveals focused tabs by adjusting only its own horizontal scroll position; click handlers, route state and vertical position remain unchanged.

The durable legacy presentation suite passed **24/24** cases (four routes × three widths × both themes), checking real caption text, full focused-control bounds, navigation parity, clipping, semantic canvas, map pins and browser errors. Independent visual review passed eight Exchange/Spark cases. The original Scout/Exchange layout scripts now recognize the actual shared mobile dock and permit vertical scrolling while asserting supporting-content bounds and limiting empty page tails. All **six Scout + six Exchange** cases passed; original failing fixed-height/hidden-legacy-dock results are preserved in the logs.

Final shared-theme checks passed **30/30** cases; viewport guards passed **46 light + 46 dark**. Search regression expanded to **12/12** cases across Settings, Scout and Market, with two additional mobile Menu → Settings → Search checks. Existing map interactions passed desktop/mobile in both themes after the final styling. Production build, backend TypeScript, keyboard/reduced-motion contracts and full-page menu navigation passed. A fresh full beta regression passed **28/28** scenarios in 504 seconds, with no open handles after cleanup.

Final visual follow-up removed duplicated mobile bottom padding (278px after content becomes 124px) and increased the actual Scout header status labels to 12px. The 24-case legacy checks and two focused mobile Scout header checks passed. The compact-landscape audit passed at 720×450 in both themes: forms, filters, Search and listing actions remain reachable. Back to top now uses the neutral surface, has a 44px target and visible focus, and is excluded from keyboard/accessibility navigation while hidden.

## Rendered-page verification and additional refinements

**Correction to the earlier viewport evidence:** at least 13 captures from the previous viewport run showed a loading placeholder. The original route-text regex could match a shell label or fallback, so that run's 92 passing checks did not establish that every page had loaded. `test-viewport-guard.cjs` now requires each route's real content root, including the nested Find Deals screen, and no lazy fallback. It no longer swallows readiness timeouts. Thirty focused cases and the subsequent full **46 light + 46 dark** matrix passed with these stronger checks. The semantic theme suite now also waits for real route content; all **30/30** strengthened cases passed. All **48 gallery images** were decoded and visually reviewed; every capture contains real screen content.

- Loaded legacy Collection overview and records now use readable captions, cards that fit their contents, consistent desktop navigation and grouped empty-state actions. Forge's proof and decision sections use two readable columns on desktop, with the existing responsive content on mobile. Existing record, scan, display-mode, navigation and data handlers remain unchanged.
- The additional Vault/Collection/Forge presentation matrix passed **18/18** route/theme/width cases, plus 30 mobile native-Tab targets. Final Forge captures explicitly verify two columns at desktop and tablet after correcting an older CSS rule that overrode the intended layout.
- A record-state audit captured 36 populated, empty, warning and error states. It found a shared paragraph reset that made validation errors gray. The scoped error style now restores semantic danger color. Four invalid-sale checks passed contrast, visible error text, unchanged validation and byte-identical persisted records.
- Account and Help utility pages no longer reserve an empty viewport for their header. Help feedback choices now have readable labels and full-size controls. Notifications has a contained panel with readable actions; explicit Close and Escape restore focus to the opener. Twelve focused utility/notification cases and **four legacy Vault Beacon cases** passed. The old hidden topbar ancestor now exposes only the opened Notifications panel on legacy pages.
- The existing loading status now has a structured neutral panel, readable title/detail and an unobtrusive spinner. Four held-module browser checks passed; reduced motion stops the animation, and releasing the module loads the real page.
- Relevant Vault/Forge regression scenarios passed **3/3** plus setup in 63 seconds, covering item edit/delete, wishlist separation and the existing workspace lock. The focused Vault summary check also passed after its stale `Vault Command Center` heading expectation was updated to the already-existing `Collection` heading. The original failing log is retained. This focused runner has pre-existing unreachable workflow code; the separate regression scenarios provide the actual workflow verification.

Production build and backend TypeScript passed again after the Notifications keyboard changes. The keyboard/reduced-motion contract passed after correcting its assumption that the last reduce-motion block contains all global rules; it now checks all reduce-motion block contents. The loading spinner also passed actual reduced-motion browser checks. Existing lint diagnostics remain unchanged at the reported baseline.

**Settings readability verified:** Profile, Plans, Trust, Preferences and Privacy now use readable captions, natural wrapping and full-size controls. Twenty route/theme/viewport cases passed, including keyboard disclosure behavior and the existing disabled checkout state. A visual follow-up found the legacy Profile rail extending below the fixed desktop sidebar. Profile, Plans and Trust now use the existing horizontal inner-navigation treatment; six additional desktop cases passed, preserving all six links and proving that no text extends beneath the sidebar. The Profile content-grid background is transparent so unequal card heights do not produce a large filled block.

**Final card organization verified:** Profile places its usage summary above two side-by-side support cards on desktop, eliminating the large empty area. Plans and included features use five balanced columns when space permits, with three columns on smaller desktops and the existing mobile treatment. Eight additional Profile/Plans mobile/desktop light/dark cases passed clipping, readability, touch targets, sidebar separation, keyboard navigation and disabled plan actions. Both themes were visually reviewed. This changes CSS only; the existing content, DOM order and handlers remain. Final production build passed in 1.30 seconds, with the existing bundle-size warning.

The local review gallery now includes **68 captures** across 17 screens, both themes and desktop/mobile sizes. All 68 image decodes, dimensions, screenshot links and accessible labels passed, with no browser errors. The five Settings sections supplement the previously verified 48-image gallery. This local refinement checkpoint is complete; no commit, push, merge, deployment or hosted activation occurred.

The visible duplicate `Business Assistant Assist` label was corrected to `Business Assistant`. The plain-language suite passes, with obsolete brand expectations updated to the approved `Code 3 TCG` name. No assistant workflow changed.

Expanded configured lint covers ten changed UI modules. It remains non-clean with **378 errors and 75 warnings**; the non-unused diagnostic rule/message/count comparison introduced none. Embedded hook line numbers were normalized because source insertions shift them; the six apparent additions before normalization were the same existing receipt-hook warnings. CommandBoardV4 retains its existing JSX unused-import diagnostic. The large App component also triggers the existing Babel size notice and production bundle warning. These checks do not claim a clean repository lint baseline.

Existing navigation limitation observed during Search testing: a directly loaded Settings page opening Search Collection routes to `/vault/cards`, and Back does not recover the initial Settings entry. This predates the Search visual fix; routing remains unchanged.

## Evidence

- `artifacts/qa/continuous-ui/`: listing form captures/results, build and integrated test logs.
- [Interactive local screenshot gallery](../artifacts/qa/UI_REVIEW.html): 68 desktop/mobile light/dark captures, including the existing Collection overview/records, Forge decision desk and five Settings sections.
- [Rendered-route readiness correction](../artifacts/qa/viewport-readiness/README.md)
- [Compact landscape checks](../artifacts/qa/compact-landscape/REPORT.md)
- [Record state/color audit](../artifacts/qa/record-color-audit/REPORT.md)
- [Loading state checks](../artifacts/qa/route-loading-panel/README.md)
- [Vault/Forge presentation checks](../artifacts/qa/legacy-presentation/VAULT-FORGE-REPORT.md)
- [Settings/Help/Notifications checks](../artifacts/qa/settings-alerts-fixes/results.json)
- [Legacy Beacon checks](../artifacts/qa/legacy-notifications/results.json)
- [Settings readability checks](../artifacts/qa/settings-readability/results.json)
- [Settings desktop navigation checks](../artifacts/qa/settings-readability/desktop-results.json)
- [Profile/Plans card organization checks](../artifacts/qa/settings-readability/organization-results.json)
- [Legacy presentation report](../artifacts/qa/legacy-presentation/REPORT.md)
- [Search checks](../artifacts/qa/global-search-presentation/results.json)
- [Record, dark desktop](../artifacts/qa/record-layout/dark-1440-detail.png)
- [Signup, light desktop](../artifacts/qa/auth-refinement/light-1440-signup.png)
- [Market, dark mobile](../artifacts/qa/legacy-board-clarity/after/dark-mobile-market.png)
- [Scout rail keyboard focus](../artifacts/qa/legacy-board-clarity/after/dark-desktop-scout-rail-focused.png)

All browser testing uses disposable synthetic local sessions. Physical devices, assistive screen readers and production were not tested. The repository has no standalone frontend TypeScript check; the production build and configured backend TypeScript check are the available checks used here. The user's live preview was inspected read-only; no theme or workspace preference was changed in it.
