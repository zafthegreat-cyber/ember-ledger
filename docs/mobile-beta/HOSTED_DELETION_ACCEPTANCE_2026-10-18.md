# Hosted account deletion acceptance — 2026-10-18

**Result: passed.** The actual Express deletion routes completed **67 checks** against Supabase Auth, PostgREST and Storage in a disposable, data-less test branch. All four accounts created by the successful run were hard-deleted through the normal password-confirmed service.

- Successful run: `fd63d2a1-fd48-4f41-974f-607647eb263d`.
- Isolated project: `gghayxrtqnvcbupxgnng`; production project `gxsfququorfczvhrkudl` was hard-denied by the harness.
- Production writes: **0**. Shared-price writes: **0**.
- Cleanup: **confirmed**. The temporary branch was deleted through the dashboard; a subsequent branch listing contained only main. Immediately before removal, the branch contained only the two earlier failed-run synthetic accounts, zero Storage objects and zero pending deletions. Those remaining accounts were discarded with the branch. Both restricted local test-key files were removed and their absence verified. Production remained active and healthy.

## What passed

The test used real hosted provider operations and newly generated accounts/files. It verified:

- Four private buckets: `receipts`, `receipt-images`, `product-submissions`, and `feedback-screenshots`. The owner could read its exact original bytes; another account and public object URLs were denied with expected provider authorization/not-found responses.
- The HTTP API rejected a caller-selected account ID and an incorrect password. Failed confirmation did not begin deletion.
- An injected Storage failure occurred after an actual receipt object was removed. The durable pending state blocked ordinary cloud writes. The original refresh token was rejected by the Auth service; the original access token no longer represented an active session.
- A fresh password-confirmed retry completed remaining files, owned records, profile and Auth deletion.
- Injected Auth-delete failure and a lost begin-operation response left recoverable pending state. Verified retries completed. The lost-response case released only its captured synthetic lease to simulate expiry; it did not bypass the pending marker.
- Another account's cloud snapshot, revision, profile and all four attachment bytes remained unchanged. That sentinel account was then deleted through the same verified flow.
- All four successful-run fixtures had their Auth accounts, profiles and preference rows removed; their former access tokens were unusable and all manifested files were gone.

These fixtures cover profiles, preferences, account cloud snapshots and private attachments. Existing local PostgreSQL regression suites cover additional legacy tables and ownership blockers. No real customer's records, files or account were used as deletion fixtures.

## Test-branch reconstruction and initial failures

Supabase's data-less branch creation stopped after historical migration `012`: the next migration assumed a manually created `product_catalog` table. Five legacy table foundations were missing from recorded migration history: `product_catalog`, `inventory_items`, `sales_records`, `vehicles`, and `mileage_trips`.

Only empty structures were reconstructed from read-only production catalog metadata. Historical migrations actually installed in production were replayed, then the two new account-deletion/private-attachment migrations were installed. Six historical receipts policies, 24 legacy own-row policies, missing table/function grants, and three business-expense column/default differences were restored from exact production metadata. Four empty test buckets were created through the Storage API.

The first two harness runs deliberately stopped at profile seeding:

1. Run `408e3b10-ce3b-469c-8484-9d9629c69dab`: the new branch lacked production's table grants, producing `42501`.
2. Run `42c23bb3-3696-4482-86ba-81e699cb0e2d`: a legacy profile trigger could not call `is_admin_or_moderator()` because the branch lacked production's service-role function EXECUTE grants.

The underlying production permissions were queried and reproduced exactly; application authorization was not weakened to bypass the failures. Both early runs created one synthetic Auth fixture before stopping. Their credentials were scrubbed, and the fixtures were removed by the confirmed whole-branch cleanup rather than forcibly deleting through a failed service path.

Connector mutation requests expired without applying changes. Read-only state checks established the last completed migration. The remaining reviewed SQL was executed through the authenticated Supabase SQL editor on the explicitly selected test branch. Guards required the isolated baseline marker and either an empty branch or only the exact registered synthetic run stamps. Statements were applied transactionally; no production migration history was rewritten.

## Metadata and security verification

Final read-only comparison found:

- Exact column/default/nullability and constraint parity across all **93** existing application/private tables; the test branch additionally contained the new deletion-state table.
- Exact parity for all **402** existing policies, plus the intended new deletion/private-file restrictions.
- No missing production table privileges for anonymous, authenticated or service roles.
- Exact EXECUTE privilege parity across **76** existing functions and all three roles.
- After normalizing line endings, the only changed existing function body was the intended pending-deletion check in `code3_private.current_session_id()`.
- All 17 historical Storage policies matched, with the two new restrictive read policies installed.
- No outbound HTTP/network/database-link references in application-trigger function bodies; the Auth user-created trigger matched production.

Security advisors ran after schema installation. They reported existing mutable-search-path/legacy callable-definer warnings and intentional no-policy information for private, RPC-controlled tables. This was not a clean audit of every legacy application function. Newly added deletion RPCs were separately confirmed service-role-only, with fixed search paths; anonymous and ordinary authenticated roles could not execute them.

## Evidence and remaining scope

Ignored local evidence is under `artifacts/qa/hosted-account-deletion/`:

- `fd63d2a1-fd48-4f41-974f-607647eb263d.json`: all 67 check labels and four confirmed deletions.
- `staging-final-parity.json` and `staging-final-function-acl-parity.json`: final metadata comparison results.
- `staging-security-advisors.json`: advisor findings from schema installation.
- Guarded empty-baseline, transaction, ACL and policy repair SQL with a source manifest. These are disposable staging artifacts, **not production migrations**.

The dashboard schema-success screenshot is `artifacts/qa/mobile-beta/hosted-deletion/isolated-schema-ready.png`.

The post-cleanup dashboard screenshot is `artifacts/qa/mobile-beta/hosted-deletion/temporary-branch-removed.png`; it shows only the production main branch remaining.

The test drove a loopback Express HTTP server with real hosted Supabase services. It did **not** verify the production-hosted HTTPS/CORS route, the deployed deletion UI, or a physical iPhone/Android deletion flow. Production enablement and the remaining device/release checks remain subject to the rollout plan. Nothing in this acceptance run enabled deletion or changed bucket privacy on production.

