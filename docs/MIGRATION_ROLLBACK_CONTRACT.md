# Code 3 Migration Rollback Contract

Status: Phase 1B design contract. No real migration, cutover, cleanup, or rollback is implemented or executed.

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`.

## Purpose

This contract defines the evidence and mechanics required before a future local-to-canonical migration can be applied. Phase 1B creates schema and dry-run planning foundations only. It does not authorize a write to owner data.

## Preconditions for any future migration

A migration cannot begin until all of the following exist and verify successfully:

1. an owner-authorized session and correct target environment;
2. a `COMPLETE` verified pre-migration backup for every in-scope source, or explicit owner acceptance of a precisely described `PARTIAL` limitation;
3. backup format/version and SHA-256 manifest hash;
4. deterministic Migration Preview and plan hash;
5. no unresolved blocker, duplicate identity, broken required reference, or ambiguous money conversion;
6. reviewed canonical schema version and tested up/down or compensating migration path;
7. disposable-environment migration and rollback rehearsal;
8. record mapping between source IDs and canonical IDs;
9. transaction or bounded batch strategy with idempotency;
10. explicit owner confirmation immediately before apply.

Local data, the verified backup, and hashes remain untouched throughout.

## Required migration journal

A future append-only journal records only safe operational facts:

```text
migrationId
ownerSubjectHash
startedAt
completedAt
sourceBackupHash
planHash
applicationVersion
sourceCommit
schemaVersion
recordsAttempted
recordsInserted
recordsUpdated
recordsSkipped
recordsFailed
rollbackState
```

It may also store per-record source/canonical ID mappings and bounded failure codes needed for reversal. It must not contain secrets, tokens, owner allowlists, raw private records, or unnecessary identity claims.

Phase 1B may define this shape in code or schema but does not write a production journal.

## Apply strategy

The preferred future apply path is one database transaction when the full plan fits safe transaction and request bounds. Large plans use idempotent batches with a migration ID, immutable plan hash, monotonic batch sequence, and journaled commit state. A rerun must identify already-applied actions rather than duplicate them.

No operation may accept `owner_subject` from the plan as authority. The verified server principal supplies owner scope, and every affected row is constrained to it.

Initial plans permit `INSERT`, `UPDATE`, `SKIP`, and `REQUIRES_DECISION`; they never include `DELETE` or an archive action. Archived source candidates require owner review, and archived canonical records remain immutable until a separately designed restore workflow exists. An unresolved decision prevents its action from applying.

## Verification before cutover

After a future apply and before `REMOTE_ACTIVE`, Code 3 must compare:

- record counts by source/domain/status;
- source IDs and canonical mappings;
- section/backup/plan hashes;
- money totals by domain and currency;
- quantities and allocations;
- provider/external-ID and certification uniqueness;
- parent/child and related-record integrity;
- history/provenance/audit continuity;
- referenced-file inventory and hashes where bytes are in scope;
- owner scope for every row;
- a sample plus automated full reads through the canonical API.

Any unexplained difference blocks cutover.

## Local preservation and transition

Local records are never cleared as part of migration apply. The required transition is:

```text
remote write verified
  -> local source snapshot retained unchanged
  -> bounded read-only local fallback period
  -> owner verifies workflows and reconciliation
  -> owner explicitly confirms retirement eligibility
  -> optional local cleanup in a separate approved phase
```

Old storage keys, original IDs, and original backup artifacts remain readable until cleanup has its own validation and rollback plan.

## Rollback states

Suggested journal states are:

- `NOT_REQUIRED` — no apply occurred;
- `ELIGIBLE` — apply occurred inside the supported rollback window and evidence is intact;
- `IN_PROGRESS` — compensating work is running;
- `ROLLED_BACK` — target effects were reversed and verified;
- `PARTIAL_FAILURE` — some batches applied and require controlled recovery;
- `NOT_SAFE` — rollback evidence or invariants are incomplete; manual recovery is required.

Phase 1B does not create an owner-facing rollback button.

## Failure handling

- Failure before the first commit leaves canonical data unchanged.
- A transactional failure rolls back the entire transaction and records no false success.
- A batch failure stops later batches, preserves completed journal entries, and never retries without the same plan/migration identity.
- A conflict discovered during apply stops the affected batch; it is not resolved with last-write-wins.
- File-transfer failure does not discard metadata or source bytes and prevents complete recovery claims.
- Verification failure leaves persistence mode unchanged and local data authoritative.
- A partially applied plan is never called migrated or complete.

## Rollback mechanics

Rollback uses the migration journal and record mappings, not a new guess from current local data. It may reverse rows inserted by the migration and restore pre-migration versions for rows updated by it. It must preserve unrelated remote edits and any newer owner-confirmed remote activity; if that cannot be proven, rollback becomes manual and `NOT_SAFE`.

Destructive database down-migrations are not sufficient owner-data rollback by themselves. Schema rollback and record rollback are separate concerns.

## Backup retention

The pre-migration backup and manifest hash must survive apply, verification, cutover, and the complete rollback eligibility window. Code 3 must never delete or overwrite that backup as a side effect of migration. A later retention policy may archive it only after another verified recovery point exists and the owner confirms.

## Acceptance gate for a future apply phase

A future migration implementation must test successful apply, idempotent retry, transaction rollback, partial-batch recovery, conflict during apply, count/money/reference verification, local fallback, and rollback with intervening remote edits. Until that work is separately approved and passes, Phase 1B remains schema-only and dry-run-only.
