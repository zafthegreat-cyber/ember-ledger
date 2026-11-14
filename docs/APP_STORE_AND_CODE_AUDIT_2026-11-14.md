# Code 3 TCG — store readiness and code audit

November 14, 2026, against `main` at `3155262`. Read-only: nothing was changed while auditing. Each finding below was spot-checked in the code, not only reported by a review pass.

The codebase is about 335,000 lines: `src` 202k, `scripts` 76k, `docs` 27k, `backend` 17k, `supabase` 13k. `src/App.jsx` alone is 56,177 lines. The git history is 482 MB.

---

## Part 1 — Before submitting to Google Play and the App Store

### Blockers (code changes)

1. **Community posts are only saved on the phone, but the store text says they're shared.** The server tables (`community_posts`, comments, moderation) are live, but nothing in the app reads or writes them. Posting still says "Post saved on this device. Sharing posts with other members is coming soon" (`src/App.jsx:16469`). The listing, the reviewer notes and the age-rating answers all describe a shared community. *Apple 2.1 / 2.3.1, Google misleading claims.* **Decide:** either connect Community to the server, keeping Report/Block, or remove Community from the listing and hide it in the native app.

2. **The kid-safety protection isn't connected.** The server blocks accounts marked as minors from posting, but the app never calls `mark_my_account_minor()`. Kid mode is decided only in the app (`src/utils/kidSafeView.js`). So `profiles.is_minor` stays false for everyone, and the server rules never apply. *Apple 1.2 / 5.1.4, Google Families/UGC.*

3. **Push notifications are half-built.** Android declares `POST_NOTIFICATIONS`, but:
   - there's no push plugin, no Firebase files and no iOS push entitlement;
   - nothing asks for permission or registers a token (`register_push_token` is never called);
   - the alerts toggle uses the browser Notification API (`src/utils/deviceNotifications.js`), which the native web view doesn't provide.

   *Google permissions policy, Apple 2.1.* **Decide:** either finish push (plugin, Firebase project, APNs key from you, permission prompt, Data safety update) or remove the permission and hide the toggle in the native app for launch.

4. **Beta, mock and "coming soon" screens ship in the native app.** Apple rejects betas and demos (2.2). Examples:
   - Parent Center calls itself "a mock-only safety shell" (`App.jsx:39685–39763`) and is in the menu.
   - Plans say "Plan cards are beta preview copy" (`MembershipContent.jsx:205`).
   - About 24 "coming soon" strings, plus disabled buttons such as "Add to Set" and "Report Guidelines are coming soon".

   The native build currently hides only bot and account tools (`VITE_NATIVE_BUILD`). **Fix:** hide unfinished screens in the native build, and take "beta" out of the store text.

5. **Official card images are shown.** The bundled catalog includes about 18,900 TCGplayer CDN image URLs (Pokémon card and product art), shown through `getProductImageUrl`. Apple 5.2 and Google's IP policy reject third-party art without permission, and your own submission guide says not to show it. **Decide:** license it, or turn off remote product images in the native build and show the existing generic placeholders.

6. **The privacy policy is out of date** (`src/config/privacyPolicy.js`, dated Nov 8). It doesn't cover:
   - the 13+ age minimum and the minor flag;
   - push tokens and Firebase;
   - Community posts with moderation;
   - Little Sparks collecting a child's first name, age range, ZIP code and favorite Pokémon.

   Its "Family information" section also conflicts with the 13+ sign-up gate.

### Should fix

7. **Kid appeal versus a 13+ rating.** "Kid collector" profiles, "Ask a grown-up" onboarding, the Kids Program menu and "families first" in the listing could make Google decide the app is aimed at children. Tone this copy down, or explain the audience in Play's target-audience form.
8. **Crash reporting isn't disclosed.** Sentry runs in the native build with no personal data. Add "Crash logs / Diagnostics" to the Apple and Google privacy forms, plus "Device ID" once push works.
9. **Correct the submission guide** ([STORE_SUBMISSION_GUIDE_2026-11-06.md](mobile-beta/STORE_SUBMISSION_GUIDE_2026-11-06.md)). Report/Block on community posts only covers posts saved on the phone, and "coming soon features are not released" won't satisfy Apple 2.2.
10. **Small iOS clean-ups.** Add the collected data types to `PrivacyInfo.xcprivacy`, and remove the unused iPad orientations, the `armv7` requirement and the unused photo-library permission text.

### Already correct

- Target and compile API 36; camera and location permissions match real use.
- Payments are hidden in the native app and every plan is free.
- Account deletion removes community posts and push tokens.
- No tracking; 13+ check on email and social sign-up; encryption declaration in place.
- Sign in with Apple gate on iPhone; Report and Block on restock reports.

### Only you can do (unchanged)

- Developer accounts and the store app records.
- GitHub secrets for the two build workflows.
- Reviewer account, store forms and screenshots.
- New if push ships: a Firebase project and an APNs key.

---

## Part 2 — Code that isn't needed or can be condensed

### Safe to delete (high confidence)

| What | Size |
|---|---|
| Unused source files: `pages/Hearth.jsx`, `components/WhatDidISee.jsx`, `components/Code3DesignSystem.jsx`, `utils/marketDataUtils.js`, `src/theme/*.ts`, `types/code3Tcg.ts`, `data/sharedPokemonCatalog.js`, Vite template assets | ~2,800 lines, ~140 KB |
| Stylesheets not loaded anywhere: `07-final-product-layers.css`, `08-command-shell-auth.css` | 3,598 lines |
| CSS rules for classes no component uses (`.hearth-v4-*`, `.web-command-sidebar/nav`, `.hearth-final-*`, …) | ~2,560 lines |
| CSS rules completely overridden by a later file | ~830 lines |
| 12 state values that are set but never read (each setter still re-renders the whole app) | 12 lines, small speed-up |
| Unused public images (`assets/brand/code-3-*`, `icons.svg`, …) and duplicate icon copies | ~900 KB |
| Exports nothing imports (184) | ~1,200 lines |

A few test scripts read Hearth and WhatDidISee as text, so update them in the same change.

### Move out of the shipped app

- **About 3,000 lines that only tests use** (`features/inboxOrder/*`, `fixtures/phase*Fixtures.js`, `offlineQueue.js`, and a few more). These were built and tested but never connected. Move the fixtures into `scripts/fixtures`, and keep or remove the unfinished features deliberately.
- **The `screen-set.html` design mockup** (146 KB) is built and deployed to production. Remove that Vite input unless you still use the page.
- **About 100 dated reports in `docs/` and about 40 one-off scripts** (preview, simulate, capture, rename). Move them to an archive folder.

### Condense (medium effort, careful testing)

- **CSS layering:** 33,000 lines, 2,017 `!important` and 872 `html body .app[data-theme]` selector chains. Files 11 and 12 redefine 311 of the same selectors. Fold 11 into 12, and merge the theme files into one, using CSS `@layer` ordering instead of ever-longer selectors.
- **Duplicate helpers.** Merge these into one shared version each:
  - 23 hand-written ID generators;
  - 7 `money` functions and 39 separate currency formatters;
  - 3 `toNumber`;
  - matching helpers copied between App.jsx and Scout.jsx (source labels, paging, report photos, store data);
  - `currentRoutePath` versus `pathFromActiveTab`;
  - two parallel UI kits (`Code3DesignSystem` and `OperationsUI`);
  - 4 separate API `request()` wrappers.
- **Splitting `App.jsx`** (no behaviour change):
  - the components at the end of the file (≈2,440 lines) and the helpers and data at the top (≈8,250 lines) can move to their own modules;
  - then the Restocks state and handlers (≈4,000 lines, the least tangled), then Market and Business;
  - the 19 hand-copied "scope" prop lists (≈1,300 lines) can be replaced by feature context.
- **Speed:**
  - the save effect re-reads and parses all saved data on every keystroke in the deal form (`App.jsx:17331`);
  - 63 derived lists are rebuilt every render;
  - large prop objects (up to 220 keys) are recreated every render.

### Leave alone

- **Old internal names** (scout, forge, vault, tidepool) are still the live tab IDs, storage keys and routes. Renaming them gains nothing and risks users' saved data.
- **The server-only npm packages at the root** are needed because Vercel's `api/` functions import the backend. Only the three `@types/*` packages can go.

---

## Part 3 — Visual bugs found along the way

- **1,786 class names used in components have no styles at all**, and 81% of them were styled before the June stylesheet split. This is the same problem found earlier in the Add to Collection form. The most visible:
  - item detail, edit item and inventory forms (`App.jsx:54668–56177`);
  - the menu drawer;
  - collection invite forms;
  - restock report optional fields and Restocks pagination;
  - collection search/filter bar, quick-add results and marketplace cards.

  Restore styles screen by screen, starting with these forms. The old rules are in commit `cb14250` and should be translated to the current theme colors.
- The location picker falls back to a hard-coded cream background (`components/nationwide-location-picker.css`). It probably looks wrong in dark mode.
- `--surface-raised` (18 uses) and a few other color variables are never defined, so those screens use fallback colors.

## Part 4 — Repository weight

`marketPrices.json` makes up 314 MB of the 482 MB history, because the daily "Refresh Market price data" workflow commits it every day (along with the 57 MB card file). Storing those files in Supabase Storage or as a release download would stop the growth. Shrinking the existing history needs a history rewrite, so do that only if the size causes problems.

## Suggested order

1. **Store blockers 1–6.** Decide on Community, push and card images, then do the code work.
2. **Restore styles on the unstyled forms** that reviewers will open (item detail, edit and add forms; menu drawer).
3. **Deletion pass:** unused files, the two unloaded stylesheets, dead CSS, write-only state and the mockup entry. Low risk and quick.
4. **Merge the duplicate helpers** and fix the save-effect slowdown.
5. **Split `App.jsx` and fold the CSS layers.** Larger and steady; can follow after launch.
6. **Stop committing price data to git** (then decide on a history rewrite).
