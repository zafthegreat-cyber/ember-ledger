# PR #50: isolated database recovery and browser validation

Production is out of scope. This workflow does not create a paid branch, change
the base project's migration history, deploy to production, activate sources,
scrape retailers or send alerts. Obtain a fresh quote and explicit approval
before creating another temporary branch. Delete that branch after validation.

## Database failure and repair

The historical migration chain started at `002` and never created the original
`product_catalog`, `inventory_items` or `sales_records` tables. The first failing
hosted migration, `20260508203900_pokemon_market_ingestion_schema.sql`, alters
`product_catalog` and therefore cannot run on an empty branch.

The normal repository chain now starts with
`supabase/migrations/001_legacy_database_baseline.sql`. It creates only missing
legacy tables, with owner-only policies and explicit grants. When a table already
exists, its records, policies, grants and columns are untouched. The CLI generated
the file before it was ordered ahead of the existing legacy `002` migration.

The duplicate `20261127030000` version was fixed by moving the promo-copy cleanup
to `20261127200510`, its existing identifier in production history. No production
history was edited. `20261127211846_fresh_replay_access.sql` adds the narrow
profile/helper grants previously needed by manual staging recovery.

Three historical job-creation files now create jobs disabled, in the same
transaction as scheduling. Push dispatch, market history and catalog refresh can
never become active at a fresh replay's file commit. The catalog scheduler's old
mid-file COMMIT was moved after containment. Already-applied production migrations
and existing production jobs were not executed or changed.

`supabase/config.jsonc` explicitly enables migrations and disables seeding. It
declares no remote production override and no function deployments. It does not
connect GitHub or enable automatic creation of paid branches.

`supabase/bootstrap/legacy_database_foundation.sql` remains available only for
older failed branches. It refuses execution without the isolated runner's
transaction setting. Normal fresh repository replay needs no recovery prelude.

`scripts/bootstrap-isolated-staging.mjs` inspects the target before applying SQL.
It refuses the production project, mismatched connection identities, unsafe TLS
overrides, databases containing Auth users, connected sources, and migration
histories that are not a recognized prefix (only the restored `001` may be missing
ahead of the original prefix). It then wraps the foundation
and remaining migrations in **one transaction**. Dollar-quoted function bodies
are preserved while top-level BEGIN/COMMIT wrappers are removed.

Every scheduled job is disabled before that transaction commits. This includes
the historical push dispatcher command that points at production. No scheduler
can see a committed active job during recovery. No production default privileges
are copied: authenticated profile reads and service-only profile setup receive
explicit narrow grants. Application private tables retain their own grants/RLS.

The custom recovery does not rewrite `supabase_migrations.schema_migrations`.
It saves a local digest manifest instead. The platform branch status may continue
to say MIGRATIONS_FAILED even though this controlled validation schema is usable.
This recovery mode is separate from the standard migration runner, which now
records all 90 repository migrations normally on a clean database.

## Hosted branch source and approval boundary

Supabase has two different schema sources. [GitHub-backed branches](https://supabase.com/docs/guides/deployment/branching/github-integration#migrations)
replay the repository migration directory. [Dashboard-only branches](https://supabase.com/docs/guides/deployment/branching/dashboard#where-a-dashboard-branch-gets-its-schema)
replay production's stored migration history, which this PR does not modify.

A read-only dashboard inspection found that Code 3 TCG — Production has no GitHub
repository selected. Pushing this fix does not connect it or create a paid branch.
Automatic hosted replay from PR #50 therefore still requires a repository
connection; a dashboard-only branch cannot read this fix while production's
stored history remains unchanged.

The reviewable hosted validation setup is: connect `zafthegreat-cyber/ember-ledger`
with working directory `.`, keep **Deploy to production OFF** and **Automatic
branching OFF**, and manually create only a separately approved, data-less preview
associated with `feature/stock-intelligence-20261115`. Require the provider's
native workflow and migration ledger to pass without running a recovery prelude.
Delete the branch after verification. Changing the project's integration settings
and any paid branch creation require explicit approval; neither was done here.

## Secure credentials and test-account setup

The local Supabase CLI is already authenticated. After a branch is approved and
created, use its exact branch UUID and new project reference. CLI v3.4.0 can fetch
that branch's keys and database URL into a local child process. The runner captures
the output in memory, validates the project, and never prints or writes credentials.
No new public or JWT-disabled account-creation helper is deployed.

Only the local Node process holds the staging administrator key. It creates
confirmed `example.invalid` accounts through the standard Auth Admin API, without
sending email, and assigns synthetic owner/admin/moderator roles. The browser
receives only the staging public key and signs in normally using disposable
account passwords. No access or refresh token is exported to an operator/helper.
No screenshots, traces, video or browser storage exports are recorded.

The browser opens an ephemeral local fixture containing the actual PR's
`supabaseClient.js`, `StockAlertPreferences` and `WarehouseInboundPanel` modules.
Unrelated app integrations are not mounted. Environment files are disabled;
Auth and inventory origins are explicitly set to the approved staging project.
Requests are allowed only to `http://localhost:5173` and that project. The runner
blocks browser Admin API requests and administrator credentials in request headers.

At 390px and 1440px it checks normal sign-in, guest/member/moderator restrictions,
saved opt-in and quiet hours, reload, account switching, persistent opt-out,
preference deletion, owner warehouse creation, removal of staff UI at sign-out,
and fresh role checks after demotion. Disposable accounts are removed in `finally`;
the entire branch must also be deleted afterward, including synthetic reports.

## Approved branch procedure

1. Get approval for the new quoted hourly rate plus usage; create a data-less
   temporary branch. Verify its returned project reference differs from production.
2. Inspect branch status, logs, migration prefix, Auth hooks and outbound triggers.
   Branches can inherit settings/functions: reject active external hooks before
   creating test accounts. No Auth users or connected sources may be present.
3. Set only the public `CODE3_STAGING_PROJECT_REF` in the local process. Run:

   ```text
   node scripts/bootstrap-isolated-staging.mjs --plan --branch-id <approved UUID>
   node scripts/bootstrap-isolated-staging.mjs --apply --branch-id <approved UUID>
   ```

   If CLI credentials are unavailable, stop for normal CLI authentication. Do not
   substitute production keys, disable TLS, or deploy a credential-returning helper.
   If the database requires the Supabase root certificate, set
   `CODE3_STAGING_CA_FILE` to its public PEM certificate downloaded from the
   dashboard's certificate link. The runner accepts only a CA certificate and
   always verifies the server certificate. CLI `connect_timeout` values from
   1 to 30 seconds are supported without weakening TLS.
4. Deploy the reviewed PR's warehouse/review functions to the returned staging
   reference only. Keep gateway JWT verification enabled. Their existing exact
   `http://localhost:5173` allowlist entry supports this test. Do not deploy source
   intake, invoke copied notification functions, or connect any retailer source.
5. Run:

   ```text
   node scripts/test-stock-staging-browser.mjs --branch-id <approved UUID>
   ```

   Check the credential-free local results and cleanup failures. Preserve evidence,
   delete the branch, and verify that only main remains and production counts and
   Edge versions have not changed. No merge or promotion is part of this procedure.

## Local verification and limits

`test-isolated-staging-postgres.mjs` now replays all 90 migrations on a fresh local
PostgreSQL database and the remaining 80 from the observed failed-branch prefix.
Its 29 checks cover containment, RLS/grants, missing-table recovery, catalog column
parity, preservation of existing records and rollback.
Auth/Storage platform structure and inert cron/net/Vault APIs are fixtures; this
does not establish hosted platform-extension or real Auth behavior. Network fixture
functions raise if called. The test deletes only its uniquely named local databases.

`test-native-migration-baseline.mjs --fixture` additionally runs the **official
Supabase CLI 3.4.0** against a fresh local database. Its 26 checks verify all 90
distinct recorded versions, a second CLI run with zero applied files, preserved
existing records/policies/grants, RLS and permissions, and no active jobs at any
file commit (enforced by a deferred constraint trigger). Only pg_cron/pg_net
extension declarations are replaced by inert local fixtures; no foundation or
custom recovery bundle is prepended.

`Native Supabase migration replay` CI uses the actual local Supabase PostgreSQL
image and standard CLI startup, without those extension substitutions. Database
containers use a dedicated Docker bridge with outbound forwarding and new
connections to the runner blocked by firewall rules; the CLI can still connect
through its published local database port. Seeds are disabled, and the job has
no hosted credentials, production target or cloud provisioning step. It verifies
the native ledger and inactive jobs, then confirms another migration run is a no-op.

`test-staging-browser-runner.mjs` rehearses the new runner with the real frontend
Auth client/components and offline transport responses. It runs the same UI actions
and verifies test-account cleanup at both sizes. It is explicitly labelled offline
and is **not** a new hosted Auth/browser pass.

The previous disposable branch's 65 real hosted backend checks remain valid for
their original commit.

## Hosted browser result — November 27, 2026

The separately approved data-less branch `pr50-browser-validation-20261127`
(`rggmtsywhpemgjbslgyq`) was created at 19:55:33 UTC and deleted at 20:14:18 UTC.
The deletion succeeded and a follow-up inventory contained only the original main
branch. At the approved $0.01344/hour rate, that observed lifetime represents
approximately **$0.0042 compute plus usage/rounding**, not a finalized invoice.

The recovery runner applied all 77 remaining repository migrations in one
transaction, after the historical ten-migration prefix. Real strict TLS required
the official Supabase Root 2021 CA. Hosted setup revealed an additional missing
service-role authorization-helper grant; the narrow grant is now included in
the recovery bundle and exercised by both local schema-replay paths.

The actual frontend Auth client and preference/warehouse components passed the
browser sequence at **390px and 1440px**, with real password sign-ins and hosted
Auth sessions. Both runs covered opt-in/quiet-hours persistence, account switching,
opt-out, preference deletion, owner warehouse creation, member/moderator UI denial,
admin UI visibility and fresh demotion denial, sign-out cleanup, network isolation
and absence of administrator credentials in browser requests. Additional in-page
requests proved another account's saved preferences could not be read or changed,
and the member could not access the private warehouse endpoint.

Before branch deletion, direct verification found zero Auth users, zero sessions,
zero preferences, zero active jobs, zero connected sources, and two synthetic
warehouse reports (removed with the branch). No cleanup failures were recorded.
Production still had six disconnected sources, zero signals/reports, no preference
table, and unchanged stock function versions (feed v4/review v3/inbound v2).

This was a local browser fixture using real PR modules and hosted staging APIs.
The shared Vercel preview was not retargeted. Social OAuth, email delivery and
anonymous end-user sign-up were not exercised. This historical browser run
preceded the normal repository baseline fix above. The parent's stored migration
history remains unchanged. Inherited project-wide advisor warnings are
not a clean whole-project security audit.
