# After Phase 2 Verification Plan

This order keeps schema recovery, app QA, and catalog population separated so a failure has a clear boundary.

## Required Order

1. `npm.cmd run verify:phase2:supabase` passes.
2. `npm.cmd run backend:build` passes.
3. `npm.cmd run build` passes.
4. `npm.cmd run smoke:beta` passes.
5. Signed-in persistence QA passes.
6. Local fallback QA passes.
7. Dry-run catalog backfills.
8. Tiny batch catalog backfills.
9. Provider planning.

## Signed-In Persistence QA

Run [phase2-signed-in-persistence-qa.md](phase2-signed-in-persistence-qa.md) after verification and local checks are green.

Required workflows:

- Deal Finder sessions and items.
- Scanner intake sessions.
- Receipt drafts and line items.
- Notification preferences.
- Marketplace channel drafts and CSV exports.
- Kid Pack Builder projects and exports.
- Dashboard sync status states.

## Local Fallback QA

After signed-in persistence passes, intentionally test local fallback behavior:

- Disable Supabase configuration in a local-only environment.
- Confirm workflows save locally.
- Confirm no silent data loss.
- Confirm user-facing status text is clear.
- Confirm retry affordances remain visible where appropriate.

## Backfill Dry Runs

Only after QA passes:

```cmd
npm.cmd run backfill:normalized-catalog -- --dry-run
npm.cmd run backfill:master-catalog -- --dry-run
```

Then dry-run one section at a time.

## Tiny Batch Backfills

Start with:

```cmd
npm.cmd run backfill:normalized-catalog -- --section identifiers --batch-size 100 --max-batches 1
npm.cmd run backfill:master-catalog -- --section items --batch-size 100 --max-batches 1
```

Review counts and app behavior after every section. Increase batch size only after multiple clean runs.

## Provider Planning

After schema, persistence, fallback, and tiny batches are stable, plan providers for:

- OCR for receipt/image workflows.
- Push, SMS, and email notifications.
- Marketplace exports and listing provider integrations.
- Online restock monitoring.
- Price provider refresh scheduling.

Provider planning should not block schema verification or signed-in persistence QA.

