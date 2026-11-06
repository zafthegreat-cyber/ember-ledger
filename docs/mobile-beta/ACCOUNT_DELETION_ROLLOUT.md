# Account deletion rollout

Latest acceptance: [October 24 deployed HTTPS and attachment checks](HOSTED_DELETION_HTTPS_ACCEPTANCE_2026-10-24.md) passed 117 checks in an approved disposable environment, which was removed afterward. Production enablement, the unlinked legacy receipt's actual UI access, and paused physical-phone acceptance remain separate gates. Earlier dated evidence below is retained.

**Current production status — October 24, 2026:** the two reviewed migrations are installed as `20261024234312_code3_account_deletion.sql` and `20261024234513_code3_private_attachment_reads.sql`, with unchanged SQL hashes. The legacy receipt bucket is private; owner/session access and record/object fingerprints passed database postflight. With explicit owner approval, a separately named Supabase server key is saved as the Vercel project's Production-only Secret `SUPABASE_SERVICE_ROLE_KEY`; subsequent deployments receive it. Account deletion remains disabled and no deletion was requested. Authorized Storage HTTP access and authenticated production service acceptance remain unverified. See [the current readiness record](PRIVACY_READINESS_2026-10-24.md); dated implementation and audit sections below describe their original observations.

The local implementation provides password-confirmed deletion of a signed-in account. It is disabled by default. Installing the migration creates functions, a pending-operation table, write guards, and policies; it does not delete any existing data. No production deletion or production migration was performed during implementation.

## Server configuration

The server requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Keep `CODE3_ACCOUNT_DELETION_ENABLED` unset until the database migration and staging checks below pass. Do not put the service key in a `VITE_` variable, browser storage, a native bundle, source control, or a screenshot.

The new hosted entry points are `/api/account/deletion` and `/api/account/deletion/status`. Both are mounted behind the existing exact-origin CORS policy and authenticate before parsing JSON. Hosted requests require HTTPS. No URL argument, body field, profile role, or user metadata chooses the account to delete.

## Verification before enabling

1. Review the deployed schema against `20261024234312_code3_account_deletion.sql`. Unknown owner columns or Auth relations containing the account's data deliberately block deletion; do not disable this check to bypass an unfamiliar table. Review storage buckets, separate file providers, retention, and account ownership with the operator.
2. Apply the migration to an isolated staging project and run Supabase security advisors there. The local PostgreSQL suite checks function grants, RLS, and triggers; it does not replace the hosted advisors or a deployed schema audit.
3. Enable the flag only in staging. Use newly created synthetic users and synthetic attachments, never the owner's actual account. Verify fresh password confirmation, account isolation, all supported Storage removals, Auth session revocation, final hard Auth deletion, and inability to reuse the deleted session.
4. Force a Storage failure after one object is removed. Confirm the app says deletion is pending, ordinary app writes are blocked, and a new password-confirmed retry removes the remaining data without touching another user. Repeat with a dropped HTTP response and an Auth deletion failure.
5. Test web and native UI entry points, sign-in after an expired session during a pending operation, typed confirmation, keyboard focus, and cancellation before submission. Verify cleanup of this device's account cache only after the server reports success; keep unrelated local accounts and downloaded backups intact.
6. After review and release approval, apply the tested migration, configure the server key, and set `CODE3_ACCOUNT_DELETION_ENABLED=true` for the intended deployment. Smoke-check both hosted routes return JSON. Enabling a flag does not prove the physical-device tests passed.

## Read-only deployed metadata audit — 2026-10-18

Supabase project `gxsfququorfczvhrkudl` was inspected through catalog metadata and bucket configuration only: 101 tables across the reviewed schemas, 402 policies, and 94 foreign keys referencing Auth. No user rows, object names, file contents, record counts, or account-specific deletion status were read. Nothing was changed in production.

- All 88 public tables have RLS enabled. That establishes a baseline, not proof that every policy is correct.
- The deployed schema has the private session and sync tables, but none of the optional `public.code3_*` canonical tables. The deletion migration now handles their absence and is tested in both shapes. Do not deploy the canonical backend merely to satisfy this endpoint.
- `beta_invites` uses `recipient_email`, `claimed_email`, and `claimed_by`. The cleanup now handles those fields and verified-email guest feedback. A different signed-in account's explicit ownership takes precedence over a matching freeform email.
- `product_catalog.user_id` is mandatory and cascades on Auth deletion. Accounts owning these shared catalog rows must be blocked until ownership is transferred through a reviewed workflow. The current migration deliberately leaves this table outside its deletion allowlist. No assumption was made about which real account owns rows; the latest prices were not read or changed.
- `storage.buckets`, `storage.s3_multipart_uploads`, and upload parts have owner fields. Their owned resources now cause a storage-review blocker; they must be resolved through the appropriate Storage API, not SQL deletion of provider metadata. Separate protected canonical files also remain a blocker when that backend is installed.
- `receipts` is currently public. It also has a permissive public SELECT policy. Consequently anyone possessing a valid receipt asset URL can retrieve it under the current configuration. No actual file was opened, and the audit did not establish whether anyone has accessed one. The other three private attachment buckets are already private; `catalog-images` and `brand-assets` are intentionally public. [Supabase access-model documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals).

The separate local migration `20261024234513_code3_private_attachment_reads.sql` makes the four private attachment buckets private and constrains legacy receipt reads to the current owner session. Existing objects, paths, record URLs, and bytes are preserved. An anonymous user, a different account, an expired session, and inconsistent receipt ownership are denied. Other private buckets retain the existing workspace/moderator permissions; public artwork remains public. Synthetic PostgreSQL checks verify these boundaries, including that existing permissive rules cannot bypass the new restrictive policies.

**Rollout dependency:** release the authenticated private-attachment URL resolver before applying the attachment privacy migration. Review existing ownership and ownerless legacy attachments without deleting them, verify authorized users can open their existing receipts, then confirm an unauthenticated request to a former public receipt URL fails. Isolated hosted Storage checks passed for synthetic owner access, cross-account denial and public-URL denial; the production checks involving existing receipts and the deployed resolver remain outstanding. Signed URLs remain valid until expiry; keep them short-lived and memory-only. [Supabase signed-URL behavior](https://supabase.com/docs/guides/storage/serving/downloads).

## Deletion and retention boundaries

The service verifies the bearer with Auth and checks the current provider session. It verifies the password again in a transient Auth client, requires recent password authentication for the same immutable account ID, and records a durable pending deletion before removing any files. Ordinary user writes and legacy definer writes are blocked while pending. Cleanup is leased for five minutes, HTTP requests time out after twenty seconds, and attachment cleanup stops after a two-minute operation budget so retry remains possible.

Supported cloud deletion includes personal workspace records, cloud revisions, profiles, preferences, owned listings, messages, reports, requests, and supported receipt/submission attachments. Shared catalogs and prices remain. Administrative actions on shared records can remain with the account reference removed. Infrastructure backups expire under the actual provider retention settings, which the operator must confirm for the published policy. Downloaded exports, other-device copies, and data held by external services are not remotely erased by this endpoint.

Shared workspace owners must transfer or close shared records and invitations first. Cross-account workspace records, inconsistent storage ownership, separate protected file providers, unknown personal data tables, and the configured app owner cause a review blocker. The normal self-service path must not silently delete collaborators' data to bypass these blockers. Provide an operational support route for resolving them before store submission.

The operation is not a rollback or a backup recovery flow. Once confirmed, files may be deleted before a later step fails. The durable marker keeps ordinary app writes disabled and allows a verified retry; it must not be manually removed to pretend the deletion never started. Auth deletion is last. A tiny incomplete marker may remain if the final cleanup response fails after Auth deletion; an operator may remove that marker only after confirming the Auth account is absent.

## Local checks

`npm --prefix backend run build`

`node --test --test-isolation=none backend/test/accountDeletion.test.mjs`

`node --test backend/test/accountDeletion.postgres.test.mjs`

`node --test backend/test/privateAttachmentReads.postgres.test.mjs`

The PostgreSQL suite creates a unique `code3_test_delete_*` database on the existing loopback QA server at `127.0.0.1:55439` as `code3qa`. It never reads `DATABASE_URL`, never connects to a remote database, and does not modify an existing app database. Its Auth and Storage tables contain synthetic fixtures; the separate real hosted Auth/Storage acceptance result is recorded below.

The attachment-policy suite likewise creates a separate `code3_test_private_read_*` database. Verified results: 10 service/HTTP groups; 45 deletion PostgreSQL checks in each of the canonical and deployed-legacy schema shapes; 9 attachment-policy checks; 62 release-security tests; 102 mailbox-import/parser tests. Membership-only relationships and removed collaborators do not block deletion, while actual content shared with another workspace still does. The backend TypeScript build passes. Earlier regression suites also passed: 58 existing account-session checks and 19 legacy cloud-backup checks. These synthetic checks do not prove real-device or hosted-provider behavior.

## Hosted synthetic acceptance harness

`scripts/test-hosted-account-deletion.mjs` now exercises the actual deletion HTTP router against an isolated hosted Supabase project's Auth, Storage, session policies, and deletion RPCs. The router listens only on an ephemeral loopback port for this test. This verifies hosted provider integration; it does not replace a deployed HTTPS/CORS or real-phone UI check.

Before running, prepare a disposable isolated project with the app schema and the two reviewed deletion/privacy migrations. Do not clone personal records or production Auth/Storage contents. The test does not provision projects, apply migrations, enable production deletion, create buckets, or change bucket privacy. All four private attachment buckets must already exist and be private.

Set only these dedicated process environment variables through the local credential manager or secure test runner; never put key values in a command argument or commit them:

| Variable | Required value |
| --- | --- |
| `CODE3_DELETION_TEST_ALLOWED_PROJECTS` | Explicit comma-separated isolated project IDs; production IDs are rejected even if included |
| `CODE3_DELETION_TEST_SUPABASE_URL` | Exact `https://<isolated-project-id>.supabase.co` origin |
| `CODE3_DELETION_TEST_ANON_KEY` | That project's public key |
| `CODE3_DELETION_TEST_SERVICE_ROLE_KEY` | That project's server-only service key |

The hard production denylist includes `gxsfququorfczvhrkudl`. Normal `SUPABASE_*` and `VITE_*` app credentials are never inherited. Legacy JWT keys must name the selected project and correct role. Every provider request is restricted to the selected origin, with redirects forbidden and a 20-second deadline. The exported runner accepts only configurations issued by these checks, preventing direct import from bypassing them.

Run the safe configuration check first, substituting the same isolated project ID in both places:

```powershell
npm --prefix backend run build
node scripts/test-hosted-account-deletion.mjs --check-config --project-ref <isolated-project-id> --confirm-isolated <isolated-project-id>
```

The check makes **zero network requests**. Running the script with no arguments also makes no requests. Only the explicit execution command creates synthetic fixtures:

```powershell
node scripts/test-hosted-account-deletion.mjs --execute --project-ref <isolated-project-id> --confirm-isolated <isolated-project-id>
```

The acceptance run creates four new synthetic accounts with a random run marker in server-owned `app_metadata`. It never accepts an existing account ID or a supplied user password. Each account operation rechecks its run stamp, exact synthetic email, and returned account ID. File removal is limited to this run's exact generated manifest; folders, shared artwork, unknown paths, and other accounts are rejected.

Coverage includes fresh password confirmation, rejection of a client-selected target, private/owner/cross-account file access, an actual file removal followed by an injected Storage error, a lost begin-response, an injected Auth deletion error, durable pending state, rejected ordinary writes while pending, and a successful verified retry. The lost-response scenario releases only the captured synthetic lease to simulate expiry without waiting five minutes; it does not remove the pending marker. A separate synthetic sentinel account's snapshot, profile, and file bytes are checked unchanged before that sentinel is deleted through the same normal flow. The harness never writes to shared price tables.

Reports go to ignored `artifacts/qa/hosted-account-deletion/<run-id>.json`. They include only test stages, check labels, the isolated project ID, and synthetic account IDs—no passwords, tokens, keys, email bodies, or real user records. On a failure, the test preserves remaining synthetic fixtures for investigation instead of bypassing a failed deletion guard. Reported `failedStage` and the run marker identify them. Any manual cleanup must reverify that same server-owned run marker and exact synthetic file manifest; do not remove a pending marker while its Auth account still exists.

Local guard verification: `node --test backend/test/hostedAccountDeletionGuard.test.mjs` passes **seven test groups** covering production rejection, configuration bypass attempts, explicit confirmation, conflicting or duplicate command options, key/project mismatch, request destinations, account stamps, and exact file scope. The harness syntax and zero-network default path were checked.

**Hosted acceptance passed on 2026-10-18: 67 checks**, run `fd63d2a1-fd48-4f41-974f-607647eb263d`, against temporary project `gghayxrtqnvcbupxgnng`. The actual Express HTTP router used real Supabase Auth, database and Storage services. Four synthetic accounts were deleted through verified retries; the sentinel's records and attachment bytes were preserved until its own confirmed deletion. Auth rejected the original refresh token after deletion started, and old access sessions and pending cloud writes were denied. Storage and Auth failures and a lost begin-operation response were injected to test recovery.

The temporary branch and both restricted local test-key files were removed, with removal confirmed. Two early synthetic fixtures from missing staging ACLs were discarded with the branch; the successful run removed all four of its own accounts. Production data, prices, bucket privacy and deletion enablement were unchanged. The branch's historical schema gaps and exact metadata/permission repairs are documented in [the hosted acceptance report](HOSTED_DELETION_ACCEPTANCE_2026-10-18.md); the repair SQL remains ignored staging evidence, not production migrations.

**Production release remains pending.** This successful loopback-router/hosted-provider test does not verify the production HTTPS/CORS routes, deployed deletion UI, existing production receipt access or physical iPhone/Android flows. Keep the production feature disabled until the remaining rollout and device checks above are completed and the release is approved.

## Support handling for blocked deletion

| Blocker | Safe next action |
| --- | --- |
| Protected app owner | Verify the requester and transfer service ownership to an authorized successor before retrying. Do not temporarily remove protection merely to delete the account. |
| Shared workspace or shared content | Use the existing transfer/leave workflows. A regular membership or removed member alone is not a blocker; actual records shared across ownership boundaries need review. Preserve collaborators' records. |
| Shared catalog ownership | Transfer the mandatory catalog ownership reference through a separately reviewed procedure. Keep catalog records, current prices, and histories intact; do not allow the Auth cascade to remove them. |
| Unknown storage, multipart upload, or separate protected files | Verify the exact owner and use the relevant Storage/provider API. Resolve or cancel unfinished uploads without deleting provider metadata directly. |
| Unknown data table | Inspect its ownership and retention rules, extend the reviewed deletion scope with regression coverage, then retry. Do not disable the fail-closed check. |
| Deletion pending | Explain that some files may already be gone, then use fresh password confirmation to retry. Keep the durable write freeze. If Auth deletion already succeeded but the final marker remains, verify Auth absence before operator marker cleanup. |

The public support contact must remain usable when a user cannot sign in or cannot resolve a blocker. Support should never request a password, service key, or a complete backup by email. Finishing these exceptional support workflows and confirming actual provider retention periods are still release requirements; adding the harness does not mark them complete.

## Backend dependency review

Only compatible backend lockfile resolutions were updated: `proxy-addr` 2.0.8, `ws` 8.22.0, `qs` 6.16.1, `body-parser` 2.3.0, and development-only `tsx` 4.23.15 with `esbuild` 0.28.2. Direct Express and Supabase versions were retained. The post-update `npm --prefix backend audit --json` reports **zero vulnerabilities** across production and development dependencies.

Before the update, the installed packages included critical proxy trust, high WebSocket denial-of-service, query-string, body-limit, and development-server path advisories. Source review found no configured `trust proxy`, backend realtime/WebSocket listener, vulnerable `qs` parse/stringify sequence, user-controlled body limit, or production esbuild file server; no reachable exploit was demonstrated. Patches remove the known installed risks regardless of that reachability assessment. Primary advisories: [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [ws](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [qs](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), [body-parser](https://github.com/advisories/GHSA-v422-hmwv-36x6), [esbuild](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
