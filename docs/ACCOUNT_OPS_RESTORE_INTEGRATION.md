# Account Ops restore integration handoff

Status on 2026-09-16: **whole-operation coordination, scoped export, fresh-proof host contract and durable receipts implemented and tested locally; real provider reauthentication is not connected and default Apply remains disabled.** See [the current next-ten report](./NEXT_TEN_LOCAL_REPORT.md). All 38 service mutation names and 24 collection mutation entry points use the shared browser Web Lock; linked records/activity are staged and committed as one verified storage value. Direct browser save cannot bypass coordination. The host verifies exact owner/plan/freshness, cancellation and expiry; committed receipt recovery survives restart. Synthetic export/empty-target restore/reload/subsequent-save parity passes. Full replacement/merge and other data domains are still excluded.

The remaining host integration is a trusted live provider challenge/session adapter and deliberate UI recovery integration, followed by hosted and device acceptance. A synthetic proof callback is not real reauthentication. One earlier two-tab failure remains unexplained despite a passing traced rerun and 20-round independent stress test; preserve that limitation.

The following 2026-09-15 handoff is **historical**. Its coordination and receipt implementation steps are complete in the current local scope and must not be repeated. Its full-app, fresh-authentication and publication boundaries still apply.

## Implemented and tested

[`accountOpsRestore.js`](../src/features/backup/accountOpsRestore.js) provides a read-only planner and an executor with explicitly injected storage, authorization, and an exclusive-lock adapter. It does not access ambient browser storage, make network requests, or add an Apply action.

Its supported scope is deliberately narrow:

- One verified `code-3-backup` v1 section: `account-ops`, schema 1. Full/multi-source backups, unsupported fields/schemas, and warning-bearing artifacts are rejected.
- The exact destination is `code3.account-ops.v1`. State is limited to 256 KiB.
- The destination must be absent or contain only unchanged code-defined profile-group presets. Nonempty, malformed, unreadable, and modified-preset destinations are blocked; they are never normalized into an empty writable target.
- Approval binds the exact input, destination bytes, normalized output, and record counts. The executor rechecks the plan, explicit confirmation, authorization, pending journal, and current target before writing.
- A readback-verified `PREPARED` journal precedes the data write. A verified data write precedes `COMMITTED`. Recovery rolls back a prepared operation to the exact previous bytes or finishes cleanup of a committed operation.
- Unexpected target changes are preserved and block recovery. Failed rollback/cleanup retains recovery requirements. An uncertain executor cannot clear its uncertainty merely because its journal disappeared.

The journal is `code3.account-ops.restore-journal.v1`; the required shared lock name is `code3.account-ops.restore.v1`. Hashes detect changes but do not authenticate a backup author. Storage adapters and authorization callbacks are trusted host dependencies, not implementations of owner authentication.

The legacy importer is separately protected by [`legacyBackupValidation.js`](../src/features/backup/legacyBackupValidation.js) and the narrow upload-handler change in [`App.jsx`](../src/App.jsx). Modern Code 3 envelopes are rejected before legacy normalization; selecting another file clears the previous preview, and stale FileReader results cannot restore it. The legacy Merge/Replace executor itself was not converted to the new recovery engine.

The subsequent [`recoveryState.js`](../src/features/accountOps/recoveryState.js) integration checks the journal around repository and backup reads and immediately before repository writes. The post-read guard also runs when the target read throws. Any present journal, including empty or malformed bytes, blocks use without parsing or clearing it. An unreadable recovery status also blocks. Account Ops handles a blocked startup, a relevant cross-tab storage event, or a mutation recovery error with an explicit unavailable screen. A transient real localStorage journal event latches that screen even if the peer clears the journal before the event is delivered. Clearing the journal does not silently reopen stale forms; Reload Account Ops creates a fresh view. Search, health and summary projections use the last committed React snapshot rather than performing repository reads during render. Ordinary malformed or unreadable target data also produces a handled unavailable view rather than presenting repository fallback records as usable. These are recovery gates, **not** a lock, an automatic recovery operation, or permission to expose Apply.

## Current read and write map

| Entry point | Current behavior | Integration requirement |
| --- | --- | --- |
| [`AccountOpsPage.jsx`](../src/features/accountOps/AccountOpsPage.jsx), authorized keyed initialization | Lazily creates the service and snapshot only for an authorized view. Recovery errors block private rendering; relevant cross-tab events recheck current storage. An explicit reload resets stale forms. | Preserve the gate and extend it to a coordinated completed restore. It does not run recovery or provide a restore-specific authorization grant. |
| [`service.js`](../src/features/accountOps/service.js), public mutation methods and `response()` | Validates references, invokes collection mutations, and often appends a separate activity record. Bulk operations invoke several mutations. | Hold the shared host lock across the entire operation, including validation, reads, record changes, and activity. Avoid nested-lock deadlocks. Locking only the final save is insufficient. |
| [`persistence.js`](../src/features/accountOps/persistence.js), validated collection gateways | All eight Account Ops collections use the generic local collection adapter. Account Ops is explicitly `LOCAL_ONLY`; callers cannot activate remote persistence. | Keep that boundary. Ensure collection mutations cannot bypass the same coordination and recovery guards. |
| [`dataSources.js`](../src/features/persistence/dataSources.js), `createLocalCollectionDataSource()` | Reads a full repository snapshot, modifies a collection, and calls `repository.save()`. Expected versions protect individual updates, not restore-wide serialization. | Protect the read/modify/write sequence. Prefer Account Ops-specific coordination rather than changing unrelated repositories. |
| [`repository.js`](../src/features/accountOps/repository.js), `load()` / `save()` | The direct writer remains synchronous. Ordinary malformed-target errors still provide a presentation fallback and block save. Pending or unreadable recovery status throws instead of returning cached/empty records; saves recheck the guard before writing. | Coordinate every browser writer across the complete read/modify/write operation. Journal checks alone cannot close cross-tab races between checks and writes. |
| [`backupFormat.js`](../src/features/backup/backupFormat.js), `readSourceData()` / `readCurrentBackupSources()` | Account Ops reads use the shared journal guard. Blocked sources are omitted from comparison/export with unavailable coverage instead of exporting an uncommitted target. | Preserve honest coverage and add the same coordinated snapshot contract as normal writers and restore. |
| [`BackupRecoveryPanel.jsx`](../src/features/backup/BackupRecoveryPanel.jsx) | Exports the full registry after remote inspection; preview retains diagnostics but not the selected raw input. Activity is in memory. Its only host capability prop is `localDevelopment`. | Add an explicitly scoped local Account Ops artifact path. Thread trusted restore/auth capabilities through Owner Center. Preserve zero-write preview and keep raw input ephemeral. |

The eight destination collections are `profileGroups`, `profiles`, `emailDomains`, `emailAliases`, `retailers`, `storeAccounts`, `tasks`, and `activity`. Other Account Ops screen projections do not expand this restore scope into Bot, Inbox, Purchase, Receiving, Inventory, provider credentials, or remote execution.

## Reauthentication and audit gaps

[`ownerSession.js`](../src/services/ownerSession.js) obtains the current session token and checks `/api/auth/session`; the app also rechecks owner access as the session changes/expires. That is current authorization, not a fresh restore-specific authentication challenge.

[`AuthPrincipal`](../backend/src/auth/authPrincipal.ts), [`supabaseIdentityProvider.ts`](../backend/src/auth/supabaseIdentityProvider.ts), and [`ownerAuthorization.ts`](../backend/src/auth/ownerAuthorization.ts) currently carry/verify subject, provider, issuance, and expiry information. They do not provide a fresh-authentication grant bound to a restore plan. Token issuance or renewal must not be treated as proof that the owner just reauthenticated. The existing normal login flow is not an inline restore reauthentication contract.

Before production Apply, introduce a verified fresh-authentication path for the same current owner, bound to the exact plan and an explicit short-lived confirmation. Cancellation, account change, expiration, denial, and unavailable authentication must cause zero restore writes. Local-development identity must remain confined to its existing development/loopback boundary. No credentials, bearer tokens, or raw identity claims belong in backup records, plans, journals, or receipts.

The new engine's journal is recovery metadata, **not durable audit**: successful cleanup deletes it. The panel's activity list is also not durable. A minimal receipt contract must record a safe operation identifier, scope, hashes/counts, result, and time without raw records/secrets; its persistence and crash behavior must be included in the transaction design.

## Next safe implementation sequence

1. **Add the Account Ops coordinator first.** Supply the same cross-tab exclusive lock to normal mutations and restore. Fail closed for restore where that lock is unavailable. Preserve the now-integrated repository/backup/startup journal gates without changing persistence mode or clearing existing data. There are 38 public service mutation names (37 functions plus the generated-alias alias), 24 collection mutation entry points and the direct repository writer. Hold one lock through validation, all record changes, activity and returned snapshot. Do not use a shared boolean to simulate async reentrancy; a second caller could bypass the lock while the first awaits. Keep synchronous public read APIs synchronous or explicitly migrate their callers.
2. **Validate coordination with disposable storage and two browser tabs.** Race a normal create/update and restore; verify no lost records, partial snapshot reads, or stale-form overwrite. Cover pending/invalid journals, read failures, unsupported locking, and reload at every durable stage. Verify current app writers actually use the coordinator.
3. **Add scoped export and durable completion evidence.** Produce a supported Account Ops-only artifact with explicit coverage. Preserve the existing full export and inspection-only preview. Do not silently extract/reseal a full backup or claim unrelated sources are restored. Extend fault tests to receipt persistence and recovery.
4. **Implement and test the fresh-owner-authentication contract.** Verify current provider documentation when implementing it. Use injected synthetic authentication in automated tests; do not test by restoring real browser data.
5. **Expose a narrowly named recovery flow only after those gates pass.** Display scope, counts, exclusions, empty-target requirement, and errors; retain the selected input only in memory; reauthenticate and confirm the exact current plan; execute; resolve any pending recovery; reload the Account Ops view and show the actual durable outcome. A changed file, session, target, or plan invalidates approval.
6. **Run an end-to-end acceptance round.** Export populated synthetic Account Ops data, restore it into an eligible fresh context, reload, and verify complete record/reference parity and subsequent normal saves. Verify zero changes to auth, unrelated storage, remote state, Bot, Purchase, Receiving, and Inventory. Check denial/error paths and mobile/desktop keyboard behavior in both themes.

This is a reasonable bounded integration phase because the Account Ops writer path is concentrated. It is not a panel-only change. Full-backup application, nonempty-target merge/replacement, attachments, server records, and broader migration/rollback remain separate work. The scope must stay visible in UI and reports; do not erase data merely to satisfy the empty-target gate.

## Verification evidence

Run from the repository root:

```text
node --no-warnings scripts/test-account-ops-restore.mjs
node --no-warnings scripts/test-legacy-backup-validation.mjs
node --no-warnings scripts/test-code3-backup.mjs
node --no-warnings scripts/test-code3-restore-preview.mjs
```

Observed local results on 2026-09-15:

- [`test-account-ops-restore.mjs`](../scripts/test-account-ops-restore.mjs): **24 scenarios passed**, using disposable in-memory storage only. Coverage includes exact-byte rollback; source/schema/security/reference rejection; the 256 KiB cap; stale/tampered input and plans; authorization and confirmation; quota/write/readback failures; prepared-journal verification before target writes; throw-after-durable behavior; failed rollback/cleanup; interruption at every durable stage; restart/retry recovery; invalid journals; unrelated changes; missing-journal uncertainty; and parallel attempts under the injected lock.
- [`test-legacy-backup-validation.mjs`](../scripts/test-legacy-backup-validation.mjs): **42 assertions passed**, including the actual upload handler in an isolated FileReader harness.
- Existing backup tests passed: **21 sections / 34 records**.
- Existing restore-preview tests passed: ready, warning, blocked, unsupported, corrupted, and zero-write paths.

The integrated journal-gate suite passes **52/52 scenarios: 43 actual-function checks and nine native browser cases**, with clean focused lint. It exercises all 24 collection mutation entry points, cached/fresh repositories, service/bulk/metadata paths, target and journal read failures, journal appearance during a failing read, pre-write checks, blocked export coverage, denied views, real peer-tab events, explicit reload, and retained private/journal/sentinel bytes. [Report, exact writer inventory and screenshots](../artifacts/qa/release-readiness/account-ops-recovery-guards/README.md). Independent review is [recorded separately](../artifacts/qa/release-readiness/account-ops-recovery-guards/independent-review.md).

An unavailable Account Ops source has `affectsCoverage: true`: full export omits its records and reports **FAILED / verified:false**, even though other readable sections remain in the diagnostic artifact. The panel does not offer a verified download for that result. It is not a complete or merely partial successful backup.

All ten existing storage-safety, restore, backup, preview, Account Ops domain/fixture and foundation suites also pass; [compatibility results](../artifacts/qa/release-readiness/account-ops-recovery-guards/compatibility-results.json). These results do **not** verify a production fresh-authentication flow, real browser restore, all application writers sharing a lock, a durable audit receipt, or a complete user-facing recovery workflow. A fault test explicitly demonstrates that a journal appearing between a record write and its separate activity write can leave the earlier record durable while blocking the later write. The coordinator and Apply UI remain unimplemented; the protective read/write/startup UI gates are now integrated.
