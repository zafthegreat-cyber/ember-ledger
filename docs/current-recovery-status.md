# Current Recovery Status

Date: 2026-05-10

## Supabase State

- Current project ref: `gxsfququorfczvhrkudl`
- Current status: database unavailable.
- Latest read-only check failed with `ECONNREFUSED`; earlier checks returned
  `57P03`, `ECONNRESET`, and “database system is not accepting connections.”
- Logs showed `No space left on device`, recovery/startup failure, shutdown, and
  possible corruption requiring restore from backup.
- Supabase was upgraded, but the database still was not accepting connections
  after the upgrade.
- Support ticket status: not confirmed in repo. Recovery notes and logs are
  prepared for support escalation.

## Local App State

- Frontend build passes.
- Backend TypeScript build passes.
- Beta smoke passes.
- Local fallback mode is visible in the app.
- Phase 2 workflow persistence has localStorage fallback paths for:
  - Deal Finder sessions
  - scanner intake sessions
  - receipt drafts and lines
  - notification preferences
  - marketplace channel drafts
  - Kid Pack Builder projects and items

## Migration Safety State

- `20260509003000_pokemon_card_number_sorting.sql` drops
  `public.pokemon_catalog_browse` before recreating it, avoiding
  `CREATE OR REPLACE VIEW` column-layout conflicts.
- `20260509170000_normalized_pokemon_catalog_model.sql` no longer runs large
  automatic catalog backfills during `db push`.
- Large normalized catalog backfills are isolated in:

  ```text
  scripts/backfill-normalized-catalog-batches.cjs
  ```

- Batch backfills require an explicit operator run and support dry-run,
  batch-size, section selection, resume/idempotency, and stop-on-error behavior.

## Recovery Artifacts

Snapshot folder:

```text
artifacts/supabase-recovery-snapshot
```

The snapshot contains migration copies, safe command-output files, git status,
git diffs, recovery notes, package metadata, and recovery scripts. It should not
contain env files, access tokens, DB URLs, anon keys, or service role keys.

## Next Decision Points

1. Wait for Supabase to accept read-only connections again.
2. Run only:

   ```powershell
   npx.cmd supabase migration list --linked
   ```

3. If it succeeds, inspect migration status and partial state read-only.
4. Decide whether the restored DB is safe to continue.
5. If not recoverable, create a new Supabase project and follow:

   ```text
   docs/new-supabase-project-migration-checklist.md
   ```

6. Do not run `db push`, repair, or SQL writes until explicit approval is given
   after reviewing recovered status.
