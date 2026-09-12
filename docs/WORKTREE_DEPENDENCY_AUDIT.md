# Working-tree dependency audit

Audit date: 2026-08-15

Repository: `ember-hearth-command-pass`

Branch: `ui-104-final-product-ui-2`
Audited checkpoint: `a23ad55cb074fc50afc9d6d990911019bfef36e7`

## Scope and method

This audit classifies every non-ignored file that remained outside Git at the start of the reproducibility phase. Classification is based on import and package-script references, clean-checkout build/test evidence, diff contents, runtime reachability, and file history—not names alone.

The primary worktree began with no staged files. `git diff a23ad55 --name-only` matched the tracked-modified list below; untracked files were collected separately with `git ls-files --others --exclude-standard`.

Ignored development data was not eligible for the closure commit. Relevant ignored paths were:

- `.env.local` — local configuration and credentials; absent from the clean worktree.
- `node_modules/` and `backend/node_modules/` — installed dependencies.
- `dist/` and `backend/dist/` — generated build output.
- `artifacts/backups/`, `artifacts/local-checkpoints/`, `artifacts/design-references/`, and `artifacts/qa/` — local patches and QA output.

The clean worktree was created at `C:\Users\Zena\Apps\Embers ledger\ember-hearth-command-pass-clean-a23ad55` directly from the audited commit, with no source files copied from the primary worktree. Its initial status was clean and detached at the exact checkpoint.

## Clean-checkout evidence

The first untouched frontend build failed in 0.53 seconds with two unresolved imports from committed `src/App.jsx`:

- `./components/ScoutTileMap`
- `./data/appPreviewFoundation`

The committed `package.json` also referenced four scripts absent from Git:

- `scripts/deploy-readiness.cjs`
- `scripts/test-exchange-layout.cjs`
- `scripts/test-scout-layout.cjs`
- `scripts/test-scout-map-interactions.cjs`

The clean backend build passed. Flip Scout, Owner Center, eBay, legacy-route, plain-language, and keyboard-accessibility source tests passed. The route-loading test failed exactly three checks because its committed assertions require the working versions of `src/pages/Vault.jsx`, `Market.jsx`, `Forge.jsx`, `Spark.jsx`, `Menu.jsx`, and the current `src/App.css` import graph. Browser suites could not be meaningfully launched from that untouched checkout because no frontend artifact could be built; this was recorded before selecting closure files.

After the first closure candidate made the clean build and route-loading checks pass, the bounded regression reached scenario 10 and failed on `Scout: report wizard shows visible selected choices`. Diagnostics showed the selected report choice was focused, but the committed Scout route never exposed the selected-choice summary required by the existing workflow. The tested primary worktree's `src/pages/Scout.jsx` contains that route behavior and uses the now-tracked `ScoutTileMap`; this supplied concrete browser evidence to reclassify that file as required before the final proof checkout.

The next clean regression passed all Scout scenarios, then failed scenario 16 while confirming deletion of a Business inventory record. The confirmation dialog was visible, but the desktop sidebar intercepted pointer events because the committed modal backdrop used `z-index: 120`. The primary working file already contains the narrow stacking fix (`1500`, with purchaser management at `1510`). Only those two declarations are part of dependency closure; the remainder of that pre-existing CSS diff stays uncommitted.

## Remaining tracked modifications

| Path | Git state | Classification | Imported/referenced by committed code | Runtime dependency | Test dependency | Recommended action and evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/FEATURE_IMPROVEMENT_TRAIN.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Planning-copy edits dated before the checkpoint; no source or test references. |
| `docs/FREE_FEATURE_PARITY.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Product-planning changes do not participate in build or tests. |
| `docs/LIVE_UI_10HR_PASS.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Local planning edits only. |
| `docs/PUBLIC_BETA_POST_DEPLOY_QA.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Post-deploy checklist is outside this non-deploy task. |
| `docs/ember-and-tide-product-vision.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Historical product-direction edits are not a runtime dependency. |
| `docs/ember-tide-final-product-standard.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Large pre-existing standards draft is unrelated to checkout execution. |
| `docs/paid-tiers-and-feature-gates.md` | Modified | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. Pre-existing product/tiers draft; no runtime import. |
| `package-lock.json` | Modified | `UNRELATED_EXISTING_CHANGE` | Used by `npm ci` | Tracked HEAD lock is sufficient | CI install dependency, but current diff is not | Exclude the one-line root-name drift. Clean `npm ci` left the tracked lock unchanged, package dependencies match, and `package.json` has no root `name`. Decision: `EXISTING_LOCKFILE_ALREADY_SUFFICIENT`. |
| `src/App.css` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Imported by committed `src/App.jsx` | Yes | Yes | Include. The committed route-loading test requires the 10/11 structural layers and rejects the retired 08 layer; it failed against HEAD. Its three imported untracked styles are included separately. |
| `src/data/virginiaStoresSeed.js` | Modified | `UNRELATED_EXISTING_CHANGE` | Dynamically imported by committed app | Runtime uses the tracked version successfully | Route-loading checks loading strategy, not this one-line order change | Exclude and do not touch. The only diff swaps two seed records and was explicitly identified by the user as unrelated. |
| `src/index.css` | Modified | `INTENDED_FUTURE_WORK` | Imported by committed `src/main.jsx` | Tracked styles render successfully | No failing test depends on the added progress animation | Exclude. The addition styles an existing loader but is not required to build or pass the audited source checks. |
| `src/mobileScreenSet.css` | Modified | `INTENDED_FUTURE_WORK` | Only imported by the non-entry `mobileScreenSet.jsx` module | Not reached by committed application entry | No required test imports it | Exclude the large pre-existing visual experiment. |
| `src/mobileScreenSet.jsx` | Modified | `INTENDED_FUTURE_WORK` | Not imported from the committed app entry graph | No | No required test | Exclude the standalone screen-set experiment. |
| `src/mock/emberTideData.ts` | Modified | `INTENDED_FUTURE_WORK` | Referenced by the standalone screen-set experiment, not the committed app | No production dependency | No required test | Exclude mock/demo data changes. |
| `src/pages/Forge.jsx` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Lazy route imported by committed `src/App.jsx` | Yes, for Exchange/Business compatibility routes | Yes | Include. The committed route-loading assertion explicitly requires its delegated `CommandBoardV4` renderer and failed against HEAD. |
| `src/pages/Hearth.jsx` | Modified | `INTENDED_FUTURE_WORK` | Legacy page module exists, but canonical Home uses `OperationsHome` | Not needed for the failing build or canonical Home | No observed clean-checkout failure | Exclude the large pre-existing route experiment unless a later clean test supplies contrary evidence. |
| `src/pages/Market.jsx` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Lazy route imported by committed `src/App.jsx` | Yes, for Market compatibility routes | Yes | Include. The committed route-loading assertion requires its V4 route body and failed against HEAD. |
| `src/pages/Menu.jsx` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Lazy route imported by committed `src/App.jsx` | Yes, for Settings | Yes | Include. The committed route-loading assertion requires the delegated Settings renderer and failed against HEAD. |
| `src/pages/Scout.jsx` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Lazy compatibility route imported by committed app | Yes, for the report workflow and map route | Yes | Include. The second clean checkout built, then the bounded regression failed scenario 10 because the tracked Scout route did not expose the selected report-choice state; the primary working version supplies that existing tested behavior. |
| `src/pages/Spark.jsx` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Lazy route imported by committed `src/App.jsx` | Yes, for Kids & Community compatibility | Yes | Include. The committed route-loading assertion requires its delegated V4 renderer and failed against HEAD. |
| `src/pages/Vault.jsx` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Lazy route imported by committed `src/App.jsx` | Yes, for Collection compatibility routes | Yes | Include. The committed route-loading assertion requires its delegated V4 dashboard and failed against HEAD. |
| `src/services/featureGates.js` | Modified | `INTENDED_FUTURE_WORK` | Imported by production code | Tracked behavior is complete and tests did not identify a missing dependency | No audited failure requires this product-tier rewrite | Exclude pre-existing feature-plan changes. |
| `src/styles/app/02-app-shell-navigation.css` | Modified | `INTENDED_FUTURE_WORK` | Imported through `App.css` | Tracked layer remains present | No audited failure requires the one-line change | Exclude unless final viewport validation proves necessity. |
| `src/styles/app/03-cards-buttons-forms.css` | Modified | `INTENDED_FUTURE_WORK` | Imported through `App.css` | Tracked layer remains present | No audited failure | Exclude pre-existing visual adjustments. |
| `src/styles/app/04-route-pages.css` | Modified | `INTENDED_FUTURE_WORK` | Imported through `App.css` | Tracked layer plus required 10–12 layers provide the committed graph | No static test requires this large pre-existing rewrite | Exclude unless final browser evidence proves necessity. |
| `src/styles/app/05-modals-search-data.css` | Modified | `REQUIRED_COMMITTED_DEPENDENCY` | Imported through `App.css` | Yes, confirmation overlays must stack above the desktop sidebar | Yes | Partially include only the proven backdrop `z-index` changes (`120` → `1500`, `132` → `1510`). The clean regression's Business deletion dialog was visible but unclickable because the sidebar intercepted it. Keep all other pre-existing changes in this file unstaged. |
| `src/styles/app/06-mobile-responsive.css` | Modified | `INTENDED_FUTURE_WORK` | Imported through `App.css` | Tracked layer remains present | No audited failure | Exclude unless final viewport evidence proves necessity. |
| `src/styles/app/07-final-product-layers.css` | Modified | `INTENDED_FUTURE_WORK` | Removed from the required `App.css` graph | No after closure | No | Exclude. It is a retired, pre-existing visual layer. |
| `src/styles/app/08-command-shell-auth.css` | Modified | `INTENDED_FUTURE_WORK` | Removed from the required `App.css` graph | No after closure | The committed route-loading test explicitly rejects importing it | Exclude. It is a retired visual layer. |
| `src/utils/emberAssist.js` | Modified | `INTENDED_FUTURE_WORK` | Lazy-loaded by committed code | Tracked implementation works | No audited failure depends on the one-line copy change | Exclude; AI expansion is also out of scope. |
| `src/utils/onboardingGuidance.js` | Modified | `INTENDED_FUTURE_WORK` | Imported by committed code | Tracked implementation works | No audited failure | Exclude pre-existing copy edits. |

## Remaining untracked files

| Path | Git state | Classification | Imported/referenced by committed code | Runtime dependency | Test dependency | Recommended action and evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `docs/DEPLOYMENT_READINESS.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude. It is a local deployment checklist and deployment is out of scope. |
| `docs/design/ember-tide-v4-page-goals.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude pre-existing visual planning. |
| `docs/design/recommended-local-scout-command-spec.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude pre-existing design specification. |
| `docs/design/recommended-local-scout-command.png` | Untracked | `QA_ARTIFACT` | No | No | No | Exclude image reference; it is not used by production code. |
| `docs/ember-tide-full-screen-map.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude historical screen-map planning. |
| `docs/ember-tide-must-have-visual-features.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude historical visual requirements draft. |
| `docs/ember-tide-plan-model.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude historical plan-model draft. |
| `docs/ember-tide-redesign-implementation-plan.md` | Untracked | `INTENDED_FUTURE_WORK` | No | No | No | Exclude historical redesign plan. |
| `public/design/hearth-v4-command-center-reference.jpg` | Untracked | `QA_ARTIFACT` | No committed source reference | No | No | Exclude design reference image. |
| `public/design/hearth-v4-map-reference.png` | Untracked | `QA_ARTIFACT` | No committed source reference | No | No | Exclude design reference image. |
| `scripts/deploy-readiness.cjs` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Direct target of committed `verify:deploy` script | Only when explicitly invoked; it does not deploy by itself | Makes the committed verification command resolvable | Include. This closes a manifest-to-file dependency; do not execute deployment commands or supply credentials. |
| `scripts/test-exchange-layout.cjs` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Direct target of committed `test:exchange-layout` | No production runtime | Yes | Include so the committed test script is reproducible. QA output remains ignored. |
| `scripts/test-scout-layout.cjs` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Direct target of committed `test:scout-layout` | No production runtime | Yes | Include so the committed test script is reproducible. QA output remains ignored. |
| `scripts/test-scout-map-interactions.cjs` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Direct target of committed `test:scout-map` | No production runtime | Yes | Include so the committed test script is reproducible. QA output remains ignored. |
| `src/components/ScoutTileMap.jsx` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Direct static import from committed `src/App.jsx` | Yes | Frontend build cannot start without it | Include. The untouched clean build reported it as an unresolved import. |
| `src/data/appPreviewFoundation.js` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Direct static import from committed `src/App.jsx` | Yes, for existing preview constants | Frontend build cannot start without it | Include unchanged. The untouched clean build reported it as an unresolved import; no new seed data is added in this phase. |
| `src/styles/app/09-experience-lock.css` | Untracked | `INTENDED_FUTURE_WORK` | Explicitly absent from the required `App.css` graph | No | Route-loading test rejects importing it | Exclude retired visual experiment. |
| `src/styles/app/10-scout-command-board.css` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Imported by required `src/App.css` | Yes | Required by committed App CSS graph assertion | Include. |
| `src/styles/app/11-command-ui-overhaul.css` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Imported by required `src/App.css` | Yes | Required by committed App CSS graph assertion | Include. |
| `src/styles/app/12-command-board-v4-lock.css` | Untracked | `REQUIRED_COMMITTED_DEPENDENCY` | Imported by required `src/App.css` | Yes | Build dependency of the selected CSS entrypoint | Include. |

## Checkpoint coverage already in Git

Exact inventories were recorded with `git diff-tree --no-commit-id --name-only -r <commit>`.

### `c1d926a931c34a0eba0bdea90d391fc49b876ab9` — foundation (74 files)

This checkpoint already contains the eBay server routes/service/mock/fixtures/tests and server-only example variable names; the brand and operations UI; Flip Scout storage, calculations, connectors and screens; owned-item purpose and Owner Center models/routes; navigation, loading, viewport and route tests; and the Vite split configuration. Its exact files span `.env.production.example`, `.gitignore`, `backend/**`, `docs/OWNER_CENTER_FOUNDATION.md`, `docs/UI_REDESIGN_AUDIT.md`, `index.html`, `package.json`, the brand asset/manifest, the cited scripts, and the cited `src/components`, `src/config`, `src/features`, `src/pages`, `src/utils`, and `vite.config.js` modules.

### `ad01c80fa9cf2fd8bf66439773df456d92b0a6e3` — stabilization (14 files)

`scripts/beta-smoke.cjs`; `scripts/capture-stabilization-qa.cjs`; `scripts/test-menu-full-page-routes.mjs`; `src/App.jsx`; `src/components/operations/RecordExperience.jsx`; `src/components/operations/record-experience.css`; `src/features/flipScout/flipScout.css`; `src/features/flipScout/screens/AuctionsScreen.jsx`; `src/features/flipScout/screens/DealsScreen.jsx`; `src/features/flipScout/storageRepository.js`; `src/features/ownerCenter/OwnerCenterPage.jsx`; `src/features/ownerCenter/owner-center.css`; `src/pages/EverydayWorkspaces.jsx`; `src/pages/everyday-workspaces.css`.

### `a23ad55cb074fc50afc9d6d990911019bfef36e7` — legacy/mobile/performance closure (24 files)

`docs/APP_SHELL_EXTRACTION_PLAN.md`; `docs/BETA_REGRESSION.md`; `docs/BUNDLE_AND_ROUTE_PERFORMANCE.md`; `docs/LEGACY_ROUTE_MIGRATION.md`; `package.json`; `scripts/beta-smoke.cjs`; `scripts/capture-legacy-performance-qa.cjs`; `scripts/test-flip-scout.mjs`; `scripts/test-lazy-route-direct-load.cjs`; `scripts/test-legacy-route-compatibility.mjs`; `scripts/test-menu-full-page-routes.mjs`; `scripts/test-plain-language.mjs`; `scripts/test-route-loading.mjs`; `src/App.jsx`; `src/components/command-system/CommandBoardV4.jsx`; `src/components/command-system/index.js`; `src/components/operations/OperationsUI.jsx`; `src/components/operations/operations-ui.css`; `src/components/operations/record-experience.css`; `src/config/plainLanguage.js`; `src/features/flipScout/FlipScoutPage.jsx`; `src/features/flipScout/screens/RestocksScreen.jsx`; `src/pages/EverydayWorkspaces.jsx`; `src/utils/appRouteState.js`.

The complete 74-file foundation list remains available directly from the immutable commit with the command above; no file from any of these checkpoint inventories is considered uncommitted merely because another local worktree has a later modification.

## Package-lock decision

Decision: `EXISTING_LOCKFILE_ALREADY_SUFFICIENT`.

- `package.json` dependency changes are already represented by the tracked lockfile.
- The root `package.json` intentionally has no `name`; the only local lock diff changes the lockfile display name from `ember-ledger` to `ember-hearth-command-pass`.
- Root and backend `npm ci` completed from the clean checkout and left both lockfiles unchanged.
- The repository's GitHub workflow uses `npm ci`.
- Committing the local one-line lockfile name drift would add no dependency closure and would mix an unrelated older change into this checkpoint.

## Closure rule

Only files marked `REQUIRED_COMMITTED_DEPENDENCY` are candidates for the dependency-closure commit, plus this audit. If the second clean checkout supplies concrete build, route, responsive, or browser evidence that a presently excluded file is required, this audit must be updated before adding that file. No generated catalog data, Virginia seed change, QA capture, local artifact, or environment file may be selected.
