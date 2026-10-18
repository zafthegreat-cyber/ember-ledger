# Code 3 TCG web release preflight — October 18, 2026

Prepared for the owner's explicit request to commit, push, merge and publish the tested updates for phone use. This is the pre-publication snapshot, not evidence that a deployment has completed.

## Candidate and target

- Source branch: `codex/all-bot-integration-setup`, incorporating native preparation commits `890b9dc` and `986e831` plus the reviewed local privacy, branding and restock/menu updates.
- Fetched production branch: `origin/main` at `3a1ca40a4bede9fb4ca41c64905ea409c2c43c07`. It is already an ancestor of the candidate; no newer upstream price refresh was missing at preflight.
- Existing Vercel project: `prj_opLikOxbXPA3pTJ2EajgR5qzo4fq` / `ember-tide-tcg`, team `team_SrWvifkcXd622u47TnXCZUT0`, serving `https://code3tcg.app`. The existing project identity is retained.
- Vercel's connector denied access to that team. Its mapped CLI fallback authenticated successfully and independently confirmed the intended project and owner. No token, project link, environment variable or deployment setting was changed.

## Included behavior

The release includes the direct menu report action, local catalog reference images in restock reporting, simpler save confirmation, complete Code 3 TCG visible branding/file references, and the reviewed privacy/support and public-listing location safeguards. See [restock/menu verification](./RESTOCK_MENU_UPGRADE_2026_10_18.md) and [native/privacy readiness](./mobile-beta/READINESS.md).

Release review corrected invalid branded support URLs/email, spaced social hashtags and a case-normalization issue in the current-brand sales-platform alias. Seven tests explicitly preserve legacy/current platform equivalence. Existing sales and tax calculations were not changed.

## Preservation

- All generated price/catalog values match current main; the only generated change is the placeholder display label in `catalogImportStatus.json`.
- Root/backend dependency graphs are unchanged apart from package names.
- Authentication, stored-data keys, backup formats, cloud-sync authority, recovery, permissions and production records are unchanged by the local follow-up. No migration, deletion-service enablement, bucket-policy change, live account action or price refresh is part of this publication.
- Thirteen exact legacy-image redirects preserve old asset URLs before the unchanged filesystem/SPA routes. Existing API and app paths do not match those rules.
- No env files, private signing files, package artifacts or credential-like literals were found among the reviewed release candidates.

## Verification completed

- Fresh production web build, full source ESLint, and backend TypeScript build passed after the release-review fixes. Existing large-chunk/dynamic-import and Babel notes remain non-failing.
- Fresh backend release-security run: 62 passed, zero failed.
- Privacy support: 30 checks; public-listing location privacy: 18 scenarios; legacy backup validation: 42 assertions; account-deletion client: 52 checks; isolated-hosted-test guard: seven groups; native phone preflight harness: eight synthetic cases. All passed without real account/record operations.
- Branding, plain language, sales-platform equivalence, profit dashboard and business assistant checks passed after the targeted review corrections.
- The preceding actual UI runs passed six report and six menu width/theme contexts, restricted/guest checks, five membership previews across three screen contexts, restock entry/Back preservation, and thumbnail failure/recovery checks. Evidence and limits are in the restock/menu report.
- `git diff --check` passed. Independent reviews found no remaining concrete release blocker.

The older keyboard source contract still expects a Bot Operations label absent in committed HEAD; it remains a documented pre-existing failure. The new report/menu keyboard paths passed actual browser checks. No frontend `typecheck` or generic `test` script exists.

## Hosted packaging and cloud-runner follow-up

The initial preview compiled but exceeded the current plan's twelve-function limit. The deletion status URL now shares the existing deletion Express function through an exact deployment route; twelve function entrypoints remain. No endpoint, backend guard or data behavior was removed. The 23-check packaging regression passes and is included in the preview-runtime runner. The broader preview runner retains a separate pre-existing provider UI wording assertion failure; it is not counted as passed. Hosted deletion-status JSON routing must pass before merge. See [packaging evidence](./VERCEL_FUNCTION_PACKAGING_2026_10_18.md).

The automatic iOS run passed native unit/export tests and web synchronization, then timed out while discovering a cold CoreSimulator before compilation. Discovery now has a bounded timeout-only retry; the real compile, install, launch, survival and screenshot requirements remain unchanged. All 23 native runtime scenarios and legacy export checks pass locally. Only a successful replacement Mac run establishes recovery on that runner; no signed distribution build is implied.

## Publication and phone limits

After pushing, check the exact source commit's preview and CI results before merging; fetch main again to retain any intervening price refresh. After merge, confirm production READY, the public `app-version.json` commit, new assets/redirects, public mobile/desktop screens, and protected API authorization denial. Record the actual outcome separately from this preflight snapshot.

This web release updates the website and installed PWA. It does not upload Apple/Google store packages or claim that native build 6 contains the newer restock/menu UI. Native distribution, hosted deletion/privacy rollout, native CORS and physical-device acceptance remain separate gates. The pending local workspace-folder rename is unrelated to the deployed app and is not attempted during publication.
