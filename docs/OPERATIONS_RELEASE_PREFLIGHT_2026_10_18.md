# Operations release preflight — 2026-10-18

The user authorized commit, push, merge and production publication, preserving existing data and the latest prices. This is the pre-publication evidence snapshot, not a claim that every integration is operational. Publication must be confirmed against the merged Git revision by Vercel and the live `app-version.json`.

## Release scope

- Organized Account Ops, Bot Operations, and Email & Orders with shared module navigation, compact searchable records, focused details, and responsive list/Back behavior.
- Installation metadata and manual task tracking for Stellar, Hayha, Shikari, Valor, Refract, Polar, Sniped and Swooper AIO. These are not native bot connections or remote task controls.
- Owner-only, one-time AOL/Gmail/Yahoo app-password receipt previews; reviewed, duplicate-safe purchase drafts; existing confirmation, receiving and inventory workflows retained. Passwords remain transient. A real mailbox has not been tested.
- Detailed implementation and responsive evidence: [operations workspace report](./OPERATIONS_WORKSPACE_LOCAL_REPORT.md), [email import report](./PURCHASE_EMAIL_IMPORT_LOCAL_REPORT.md), [tracking report](./BOT_TRACKING_LOCAL_REPORT.md).

## Data and price preservation

The release branch `codex/all-bot-integration-setup` was fast-forwarded onto the current remote `main`, `89da91d1b1ae229097d0203f568ae240f0f33242`, including the 2026-10-18 market refresh. The generated catalog/price directory and price-refresh workflow have no candidate changes. Recheck remote main immediately before merging to retain any newer refresh.

No database migration, production-record write, storage reset, cloud-save authority change, authentication-policy change, backup-schema change, or deployment-setting change is part of this release. New purchase drafts use the existing local purchase store. This release does not add cross-device sync for those local records. Bot and purchase write guards preserve damaged or conflicting data rather than overwrite it.

## Acceptance evidence

- Fresh frontend production build and backend TypeScript build passed after incorporating the price refresh. The existing large App chunk warning remains.
- Fresh complete-source ESLint passed with zero errors/warnings (Babel emits its existing large-file formatting note).
- Fresh backend release-security suite: 62 tests passed.
- Focused implementation validation passed before publication preparation: 102 mailbox transport/route/parser tests, 89 client API checks, 1,814 purchase assertions, 25 order-selector checks, 4,141 bot/provider/Stellar assertions, 602 tracking domain/selector assertions, and 8,891 combined Account Ops checks.
- Browser evidence includes 320/390/1440px light/dark workspace and receipt cases; actual Account Ops and Bot app routes; keyboard focus, touch targets, Back behavior, filters, corrupt storage, duplicate imports and account-change cancellation. Purchase browser: 15 scenarios/337 assertions; downstream inventory/accounting: 20 scenarios/294 assertions. Backup: 22 sections/34 records; recovery: 23 checks.
- Release review found no concrete blocker in persistence, authentication, price preservation, mailbox credential handling, or package inclusion.

## Readiness harness limits

`npm run verify:deploy` did not pass: its local environment prerequisite requires a `.env.local` containing database/Supabase configuration that this checkout does not have. Production secrets were not copied locally to satisfy it.

Running its constituent checks exposed older test assumptions. Production-preview functional fixtures expect `betaLocalMode` to bypass sign-in, but production intentionally forbids that. Separate disposable development runs passed Vault, Scout layout and Spark. Other legacy cases expect retired Home/selling layouts or navigation, or fail on externally blocked map/image requests. Those failures are retained as evidence and are not counted as passes. The current feature-specific synthetic suites above provide the changed-workflow evidence. The menu source contract was updated to assert the existing experience gate and its verified-owner chain, without changing access behavior.

Local build/test logs are under ignored `artifacts/qa/release-candidate`, `artifacts/qa/release-candidate-development`, and `artifacts/qa/operations-workspace`. Existing signed-in development origins and production user records were not used for these tests.

## Hosted verification and remaining limits

The existing Vercel project is `prj_opLikOxbXPA3pTJ2EajgR5qzo4fq` / `ember-tide-tcg`, owned by `team_SrWvifkcXd622u47TnXCZUT0`, serving `https://code3tcg.app`. Authenticated inspection confirms Node 24 and a 300-second existing API function timeout, sufficient for the bounded 25-second mailbox operation. No settings were changed.

Before reporting publication complete: verify the preview build, merge the tested revision, await production READY, match the public app-version to the merged commit, check API health and unauthenticated mailbox denial, and inspect public mobile/desktop/PWA routes. Record the actual results separately from this preflight snapshot.

Real hosted mailbox connectivity/receipt parsing, physical-phone behavior, screen-reader use and cross-device saving of new local purchase records remain unverified. Native bot APIs, VCC issuance, browser automation and live retailer inventory are not added by this release. Do not clear device storage to update the phone app.
