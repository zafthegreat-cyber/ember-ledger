# Migration Safety Rules

These rules apply to all future Supabase migration work in this repo.

## Schema Migrations

- Do not put huge data backfills inside migrations that run during `db push`.
- Schema migrations should be idempotent wherever possible.
- Use `IF NOT EXISTS` for tables, columns, indexes, and extensions when the SQL
  supports it.
- Use guarded `DO $$ ... IF NOT EXISTS ... $$` blocks for constraints and
  policies when direct `IF NOT EXISTS` syntax is unavailable.
- Use `DROP VIEW IF EXISTS` before recreating a view when the column names or
  order may change.
- Avoid `CREATE OR REPLACE VIEW` when changing view column names, order, or
  shape.
- Avoid `CASCADE` unless dependencies have been inspected and the follow-up
  recreation is included in the same reviewed migration.
- Keep RLS enabled on exposed-schema tables and make policies explicit.

## Data Backfills

- Use explicit batch scripts for large catalog imports and backfills.
- Every batch script must support:
  - dry-run
  - resume/idempotency
  - configurable batch size
  - one-section-at-a-time execution
  - progress logging
  - clean stop-on-error behavior
- Use `ON CONFLICT` or `NOT EXISTS` guards for inserts.
- Prefer simple indexed predicates over expensive regex scans on large tables.
- Run small test batches before running full sections.
- Check counts after each batch section.

## Secrets And Operations

- Never echo access tokens, DB URLs, service-role keys, or passwords.
- Do not copy env files into recovery artifacts.
- Do not commit Supabase `.temp` link files.
- Do not run migration repair without explicit approval.
- Do not run `db push` after a failed migration until migration status and
  partial state have been inspected read-only.
- Always run the verification script after migration changes:

  ```powershell
  npm.cmd run verify:phase2:supabase
  ```

- Always run local checks after migration-related code changes:

  ```powershell
  npm.cmd run build
  npm.cmd run backend:build
  npm.cmd run smoke:beta
  ```
