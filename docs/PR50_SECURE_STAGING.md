# PR #50: isolated database recovery and browser validation

Production is out of scope. This workflow does not create a paid branch, change
the base project's migration history, deploy to production, activate sources,
scrape retailers or send alerts. Obtain a fresh quote and explicit approval
before creating another temporary branch. Delete that branch after validation.

## Database failure and repair

The historical migration chain starts at `002` and never creates the original
`product_catalog`, `inventory_items` or `sales_records` tables. The first failing
hosted migration, `20260508203900_pokemon_market_ingestion_schema.sql`, alters
`product_catalog` and therefore cannot run on an empty branch.

`supabase/bootstrap/legacy_database_foundation.sql` provides the missing minimal
tables, owner-only policies and explicit grants. It is an isolated bootstrap
prelude, outside normal production migrations, and refuses direct execution
without the staging runner's transaction setting. Existing historical migration
files are unchanged. Do not rewrite production history to make this branch work.

`scripts/bootstrap-isolated-staging.mjs` inspects the target before applying SQL.
It refuses the production project, mismatched connection identities, unsafe TLS
overrides, databases containing Auth users, connected sources, and migration
histories that are not an exact recognized prefix. It then wraps the foundation
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
Native branch creation/replay is **not** repaired on the base project; that would
require a separately reviewed migration-history baseline change in production.

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

`test-isolated-staging-postgres.mjs` replays all 87 migrations on a fresh local
PostgreSQL database and the remaining 77 from the observed failed-branch prefix.
Its 27 checks cover containment, RLS/grants, missing-table recovery, catalog column
parity, preservation of existing records and rollback.
Auth/Storage platform structure and inert cron/net/Vault APIs are fixtures; this
does not establish hosted platform-extension or real Auth behavior. Network fixture
functions raise if called. The test deletes only its uniquely named local databases.

`test-staging-browser-runner.mjs` rehearses the new runner with the real frontend
Auth client/components and offline transport responses. It runs the same UI actions
and verifies test-account cleanup at both sizes. It is explicitly labelled offline
and is **not** a new hosted Auth/browser pass.

The previous disposable branch's 65 real hosted backend checks remain valid for
their original commit. A new paid branch is still required for a real hosted run
of this browser workflow. Keep PR #50 draft until that evidence is complete.
