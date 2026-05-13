# Workspace RLS Test-DB Validation Checklist

This checklist is for validating `supabase/migrations/20260511120000_workspace_rls_edit_role_hardening.sql` against a non-production Supabase database only.

Do not use this process against production. Do not run `supabase db push`, migration repair, backfills, provider integrations, deploys, commits, or pushes as part of this validation.

## 1. Confirm the Target Is Test

Before setting any environment variables or applying SQL, confirm all of these are true:

- The Supabase project ref is a disposable or non-production test project.
- The database URL is for the test project, not production.
- The anon key is for the test project, not production.
- The app URL used by the role test script is `RLS_TEST_SUPABASE_URL`, not `VITE_SUPABASE_URL`.
- The direct database URL used for applying SQL is `TEST_SUPABASE_DB_URL`, not `SUPABASE_DB_URL`.
- `.env.local` may still point at the normal app project. Prefer a separate `.env.rls-test.local` file for this validation.

Recommended local-only env file:

```text
.env.rls-test.local
```

This file is ignored by the repo through `.env.*.local`.
Use `.env.rls-test.local.example` as the non-secret template, then create
your own `.env.rls-test.local` with test-only values.

## 2. Required Test Users

Create or identify these auth users in the test Supabase project:

- Workspace owner
- Workspace admin
- Workspace editor
- Workspace viewer
- Unrelated signed-in user
- App admin or moderator, strongly recommended

The app admin/moderator user should have a row in `public.profiles` with:

```text
user_role = 'admin'
```

or:

```text
user_role = 'moderator'
```

The role test script creates the workspace and memberships itself. It uses the owner account to create:

- One test workspace.
- Active owner/admin/editor/viewer memberships.
- Generated `RLS Test ...` rows for each tested table.

## 3. Required Fixture Rows

The test database should already have:

- At least one `public.stores` row, or set `RLS_TEST_STORE_ID`.
- At least one `public.pokemon_products` row, or set `RLS_TEST_PRODUCT_ID`.

Optional orphan-workspace fixture:

- `RLS_TEST_ORPHAN_TABLE`
- `RLS_TEST_ORPHAN_ROW_ID`

Only provide these if the test database already contains a legacy row owned by the test owner where `workspace_id` references a missing workspace. The script will skip this case if no fixture is provided.

## 4. Required Environment Variables

Use a PowerShell session dedicated to the test project:

```powershell
$env:RLS_TEST_TARGET="test"
$env:RLS_TEST_ALLOW_WRITES="true"
$env:RLS_TEST_SUPABASE_URL="https://TEST_PROJECT.supabase.co"
$env:RLS_TEST_SUPABASE_ANON_KEY="TEST_ANON_KEY"

$env:TEST_SUPABASE_DB_URL="postgresql://postgres.TEST_PROJECT_REF:TEST_PASSWORD@TEST_POOLER_HOST:6543/postgres?sslmode=require"

$env:RLS_TEST_OWNER_EMAIL="owner@example.test"
$env:RLS_TEST_OWNER_PASSWORD="..."

$env:RLS_TEST_WORKSPACE_ADMIN_EMAIL="workspace-admin@example.test"
$env:RLS_TEST_WORKSPACE_ADMIN_PASSWORD="..."

$env:RLS_TEST_WORKSPACE_EDITOR_EMAIL="workspace-editor@example.test"
$env:RLS_TEST_WORKSPACE_EDITOR_PASSWORD="..."

$env:RLS_TEST_WORKSPACE_VIEWER_EMAIL="workspace-viewer@example.test"
$env:RLS_TEST_WORKSPACE_VIEWER_PASSWORD="..."

$env:RLS_TEST_UNRELATED_EMAIL="unrelated@example.test"
$env:RLS_TEST_UNRELATED_PASSWORD="..."

$env:RLS_TEST_APP_ADMIN_EMAIL="app-admin@example.test"
$env:RLS_TEST_APP_ADMIN_PASSWORD="..."
```

Optional:

```powershell
$env:RLS_TEST_PRODUCT_ID="..."
$env:RLS_TEST_STORE_ID="..."
$env:RLS_TEST_ORPHAN_TABLE="inventory_items"
$env:RLS_TEST_ORPHAN_ROW_ID="..."
$env:RLS_TEST_VERBOSE="true"
```

Safe local file option:

```text
.env.rls-test.local
```

The test script loads `.env.rls-test.local`, then `.env.local`, then `.env`, without overriding already-set variables.

## 5. Apply the Single Migration to Test Only

Do not run this until explicitly approved.

### Option A: Install Supabase CLI Later

The Supabase CLI is not currently available in this local environment. If CLI
validation is needed later, install and verify it first:

```powershell
npm install -g supabase
supabase --version
supabase db push --help
supabase migration list --help
```

Do not run `supabase db push` until it is explicitly approved and the linked
project is confirmed to be the test project.

### Option B: Use `psql` Against Test DB Only

Confirm the direct DB URL is test-only:

```powershell
$env:TEST_SUPABASE_DB_URL
```

Apply exactly one SQL file to the test database:

```powershell
psql "$env:TEST_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "supabase/migrations/20260511120000_workspace_rls_edit_role_hardening.sql"
```

Then run:

```powershell
node scripts\test-workspace-rls-roles.cjs
```

Never use the production database URL for this command.

Do not run:

```powershell
supabase db push
supabase migration repair
```

for this test unless a separate approval explicitly allows it.

## 6. Run the Role-Based RLS Test

After the migration is applied to test only:

```powershell
node scripts\test-workspace-rls-roles.cjs
```

The script should refuse to run unless:

- `RLS_TEST_TARGET=test`
- `RLS_TEST_ALLOW_WRITES=true`
- all required test user credentials are present

It uses the test anon key and real signed-in user sessions. It does not use the service-role key.

## 7. Validation Commands After Test Apply

Run these after the RLS role script:

```powershell
npm.cmd run build
git diff --check
```

Run Phase 2 Supabase verification only if the environment is pointed at the same test database:

```powershell
npm.cmd run verify:phase2:supabase
```

Before running that command, confirm it will not read production settings from `.env.local`:

- `SUPABASE_DB_URL` or `DATABASE_URL` should point to test.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` should point to test if REST checks are expected.

## 8. Expected Pass Behavior

The role test should confirm:

- Workspace owner can read/create/update/delete workspace-editable rows.
- Workspace admin can read/create/update/delete workspace-editable rows.
- Workspace editor can read/create/update/delete workspace-editable rows.
- Workspace viewer can read workspace rows but cannot create/update/delete.
- Unrelated signed-in user cannot read private workspace rows and cannot write them.
- Legacy null-workspace rows remain editable by their owner.
- Regular authenticated users can submit `catalog_suggestions`, `store_suggestions`, and `sku_suggestions`.
- Regular users cannot approve, reject, merge, or moderate suggestions by direct table writes.
- Store report moderation fields are blocked for non-admin users.
- Store report admin RPCs work for admin/moderator users.
- User store report retraction/mistaken RPCs work for the report owner only.
- Marketplace users can create draft/pending listings.
- Marketplace users cannot self-activate public `Active` listings.
- Public `Active` marketplace listings remain readable.

Expected skips:

- `user_inventory` may skip if no `pokemon_products` fixture exists.
- `store_reports` may skip if no `stores` fixture exists.
- Orphan-workspace safeguard may skip if no orphan fixture is provided.
- Some optional child tables may skip if absent from the test schema.

## 9. Failure Handling

If the migration fails:

- Stop.
- Do not run the role test.
- Save the error output.
- Reset or recreate the disposable test database if needed.
- Patch the draft migration locally.
- Reapply only to a fresh/non-production test database.

If the role test fails:

- Stop.
- Review the exact failing table/action/role.
- Do not apply to production.
- Patch migration or test fixtures as needed.

Preferred rollback for test:

- Recreate/reset the test database.
- Reapply the known baseline schema.
- Re-run the single patched migration.

Do not write a production rollback until the migration is proven in test.

## 10. What Not To Do

- Do not apply this migration to production during validation.
- Do not run `db push`.
- Do not run migration repair.
- Do not run backfills.
- Do not connect providers.
- Do not use service-role keys in frontend code or browser-visible scripts.
- Do not commit `.env.rls-test.local`, `.env.local`, or any secrets.
- Do not deploy from this validation step.
