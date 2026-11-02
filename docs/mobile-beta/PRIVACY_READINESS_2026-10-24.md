# Privacy and account-deletion release review — October 24, 2026

The privacy schema and private-receipt restrictions were installed in production on October 24, 2026. **Production account deletion is still disabled. A separately approved, named server secret is provisioned as a Production Secret; subsequent deployments receive it, while authenticated runtime validation remains unverified. This review does not certify store or physical-device readiness.** The controlled rollout changed schema/access metadata and made the legacy receipt bucket private. It did not request an account deletion, rewrite business records, remove files, or update prices. Phone acceptance is paused at the owner's request.

The publisher remains **Anchor & Wing LLC DBA Code 3 TCG**, with **support@code3tcg.com**. Public privacy, support, and deletion pages are reachable independently of app workspace recovery. They do not mount the normal app or start cloud record synchronization. Support explicitly explains that requesting help is not confirmation of deletion.

## What was fixed and tested

Deletion completion now belongs to the account that requested it. An authoritative account generation changes synchronously when an auth callback changes accounts, before React can unmount an old form. Stale completion cannot start sign-out or label the next account deleted. Forms are also keyed by generation, so an A → B → A change within one JavaScript task does not reuse the first A confirmation. This applies to the public deletion route and the in-app callback.

The browser suite includes an old deletion promise resolving in the **same task** as A → B and A → B → A auth events. Both cases preserve the current sign-in, make zero stale callback sign-out calls, reset confirmation fields, and retain synthetic record/price sentinels. Independent actual-route probes reproduced the original failure and passed after the fix. These checks address stale callbacks starting sign-out; they are not a claim about a separate provider SDK sign-out already in flight during a concurrent SDK sign-in.

Current local verification:

| Check | Result and boundary |
| --- | --- |
| Backend TypeScript build | Passed |
| Account-deletion client checks | 52 passed |
| Private-receipt authorization/client checks | 49 passed |
| Privacy/support checks | 30 passed |
| Marketplace location/privacy checks | 18 passed |
| Backend service/security tests | 25 passed: 10 account-deletion service/router, 7 hosted production-safety guard, 8 private-file client; no live deletion |
| Existing PostgreSQL fixtures on pinned PGlite 0.5.10 | 45 canonical + 45 deployed-legacy deletion checks and 9 private-attachment checks passed in memory |
| Captured production session helper versus proposed helper | 28 before/after cases passed in memory; active provider sessions without an app `account_sessions` row remain valid |
| Account deletion browser | 320/390/1440 px, light/dark; confirmation, cancellation, wrong password, duplicate submission, blockers, pending recovery, public routes, delayed completion, same-task account changes |
| Support browser | 320/390/1440 px, light/dark; unavailable/blocked/pending guidance, copy failure fallback, readable contrast, touch targets, no overflow |
| Targeted lint | No errors; existing `App.jsx` effect dependency warning for `checkUser` remains |

The real hosted Auth/Storage/router acceptance remains the separately recorded **67-check October 18 result**, not a new October 24 hosted or device run. See [the original acceptance record](HOSTED_DELETION_ACCEPTANCE_2026-10-18.md). No paid test database was created. The read-only review retrieved no production credentials; the later separately approved Production-only secret setup is recorded below and is not a hosted acceptance run.

## Production preflight before the migrations

Production project: `gxsfququorfczvhrkudl`. Queries returned schema/policy/grant metadata or small aggregates only; no account IDs, session IDs, JWT values, object paths, URLs, file bytes, or account payloads were output.

- The two proposed migrations are absent; their function/policy/trigger names have no deployment collisions. All 12 required relations and all 50 table/owner-column scope pairs exist, with UUID owner columns.
- All **49 distinct deletion-scope tables already have RLS enabled**. The migration will not newly enable RLS on a table that has only its new restrictive policy. Per-table permissive SELECT/INSERT/UPDATE/DELETE policies and browser/service grants were captured. `beta_invites` already has no browser grants/policies; `seller_reviews` already has no permissive browser policy. Neither absence is introduced by this migration.
- The current session helper checks the existing provider session and the confirmed, active account. An app `account_sessions` row is optional unless a matching revoked row exists. Comparing the captured function definition with the exact proposed replacement confirms that the only intended difference is denial while account deletion is pending. The wrapper's ACL is unchanged.
- `product_catalog.user_id` is mandatory and cascades on Auth deletion. It remains excluded from the deletion allowlist. An account holding shared catalog rows must fail closed until a reviewed ownership transfer is complete. Shared catalogs and current prices must never be removed to bypass this blocker.
- The other unknown owner column, nullable `inventory_items.owner_user_id`, is covered by the migration's explicit inconsistent-ownership blocker. Unknown future owner tables and storage providers remain blockers rather than being silently skipped.

Before rollout, the legacy `receipts` bucket was public and had a permissive public SELECT policy. Its **one object** had a known, consistent Auth owner; zero ownerless or inconsistent objects were counted. Across 104 schema-selected reference columns in 41 tables, zero standard same-project legacy-receipts URL references were found. This does not rule out device-only references, unusual encodings, or public artwork intent.

An actual production **READ ONLY** transaction selected an eligible existing owner session internally, set the local database role, and ran Storage RLS queries. The owner could see one receipt, the current session was valid, and one row passed the exact proposed ownership restriction. Before rollout, the anonymous role saw one receipt; the proposed anonymous restriction allowed zero. No file was fetched. Claims and roles were restored, aggregate session settings were cleared, and the object's identity/metadata digest remained `455bc926c1afa129dc33d7532ee42cbd`.

This preflight established the owner RLS query and proposed predicate; the completed post-migration RLS results are recorded below. **An actual Storage signed-URL/download check remains unverified.** Old receipt URLs are not promised to remain anonymously readable: anonymous access was intentionally removed. Existing object bytes, names and saved references are retained, and the deployed private-image resolver reauthorizes recognized legacy references for the owner. Other public artwork buckets remain public.

Ignored local evidence is under `artifacts/qa/privacy-beta-20261024/`:

- `schema-preflight.sql`, `production-schema-preflight.json`, `preflight-manifest.json`
- `scope-access-preflight.sql`, `production-scope-access.json`, `production-storage-policy-metadata.json`
- `receipt-reference-audit.sql`, `production-receipt-aggregates.json`
- `receipt-owner-access-preflight.sql`, `production-receipt-owner-access-before.json`
- `session-access-parity.mjs`, `session-access-parity-results.json`, `pglite-results.json`
- `public-https-check.json`

The generator `scripts/prepare-account-deletion-preflight.mjs` makes no network requests and executes no SQL. `scripts/check-privacy-release.mjs` uses only public GET/OPTIONS requests, no account cookies or real keys, and no deletion POSTs.

## Exact reviewed migrations and applied versions

| Order | File | SHA-256 |
| --- | --- | --- |
| 1 | `supabase/migrations/20261024234312_code3_account_deletion.sql` | `a3b879921a681d75412c3459111bad8d16d05eb14fd2213b9b96875246f4c6d1` |
| 2 | `supabase/migrations/20261024234513_code3_private_attachment_reads.sql` | `aa05543cde42e336026b80e4638f3de8bb01c2b0b9e226f3926dffe83b8be120` |

Both use transactions and were applied through MCP with the exact reviewed SQL bytes. The first installs deletion functions, the pending-operation table, guards and restrictive policies; installing it requests no deletion. The second constrains four private attachment buckets and adds read restrictions. Only `receipts.public` actually changed, from true to false; the other three were already private. It does not move, overwrite or delete files. Original source versions were `20261018172530` and `20261018174916`; the local filenames now follow the actual remote versions above, with both SHA-256 hashes unchanged.

Reviewed rollout procedure, retained for reference; the completed database checks and remaining gates are below:

1. Keep `CODE3_ACCOUNT_DELETION_ENABLED` unset/false. Capture a fresh aggregate record/revision/storage preservation baseline and rerun the saved metadata/access preflight. Stop on changed schema, function hashes, missing owner access, unknown ownership, or name collisions.
2. Retain the deployed authenticated legacy-attachment resolver. Review any newly discovered intentional public artwork separately; never reopen private proof storage or automatically publish personal files.
3. Review the exact hashes above and apply only these two migrations in order. Do not add optional canonical tables, seed records, change catalog ownership, clear cloud records, or backfill image references for this rollout.
4. Before enabling deletion, rerun the same owner/anonymous role query, compare object/record fingerprints, inspect function grants and all relevant RLS policies, and run Supabase security advisors. Expected owner count stays one; anonymous receipt visibility becomes zero; object identity/metadata stays unchanged. Verify private Storage signing/download using an authorized session without exposing credentials or copying file contents into QA artifacts.
5. Configure any required server credential through a separately authorized secure destination. The preflight production environment-name audit found no deletion server key or enable flag. A later explicit approval authorized the Production-only secret setup below; the enable flag remains absent. The earlier disposable-branch permission alone did not authorize this production setup. Never use a `VITE_` variable, a native bundle, chat, source control, or a screenshot for a secret value.
6. Enable the deletion service only after the reviewed schema, credential and isolated acceptance gates pass. Never validate by deleting the owner's real account. A successful flag change is not evidence of device acceptance.

If rollout fails before deletion is enabled, leave it disabled and investigate. A failing migration rolls back its transaction. If a confirmed deletion has already started, turn off new entry if necessary but retain the pending marker and write freeze; some files may already be removed and require a verified retry. Do not drop guards, remove pending markers, restore old records, or reopen `receipts` publicly as a rollback. Keep the compatibility resolver. See [the deletion rollout procedure](ACCOUNT_DELETION_ROLLOUT.md).

## Remaining external and release gates

Public HTTPS checks found `/privacy`, `/delete-account`, and `/support` loading successfully, unauthenticated status rejected, and an invalid synthetic bearer never accepted. The first check found both native origins denied; the refreshed October 24 check now passes all eight public HTTP/CORS gates: production web, `capacitor://localhost`, and `https://localhost` receive the expected preflight responses, while the unrelated origin remains denied. This confirms the narrow native-origin configuration, not authenticated native networking or device behavior. `CODE3_NATIVE_CLIENT_ENABLED=true` adds only those two origins to the existing exact allowlist and does not enable deletion. HTTPS destinations, bearer/session checks, untrusted-origin denial, and server-only secrets remain required. Account deletion still reports unavailable.

Before store submission, finish operational self-service deletion, verify retention and support procedures, complete the actual Apple/Google privacy disclosures, and perform the signed iPhone/Android device workflows when the owner resumes testing. D-U-N-S/developer-account access, signing, distribution and physical-device checks remain separate gates owned by the native release work.

Apple requires apps that create accounts to let users initiate account deletion in the app. Google requires an in-app deletion path plus a functional web resource. A support-only fallback does not establish ordinary in-app deletion readiness. [Apple account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion), [Google account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

Supabase Auth deletion and Storage cleanup require provider-aware handling; access JWTs can outlive Auth deletion until expiry, so the current provider-session check and pending write freeze remain necessary. Files must be removed through Storage APIs before Auth deletion, not by deleting provider metadata with SQL. [Supabase user-data guidance](https://supabase.com/docs/guides/auth/managing-user-data).

## Refreshed production review — October 24, 23:26 UTC

The production review was repeated after approval to continue the privacy rollout. It remained read-only: no schema/configuration/history change, credential retrieval, account deletion, file removal, production business-record write, or price update was performed by this review.

The 49 scope tables' policies, grants, and session-function definitions exactly match the earlier captured metadata. All 50 scope pairs still exist with UUID owners; the deletion objects and proposed policy/trigger names remain absent. The current-owner receipt query again passes with a current eligible provider session and one owner-visible receipt. Anonymous visibility is still one before the proposed migration. The exact proposed owner predicate retains one row, and the proposed anonymous restriction retains zero. The same object identity/metadata digest is unchanged. The original claims were restored and aggregate session settings cleared.

The 99 PostgreSQL fixture checks and 28 before/after session checks passed again locally. Public HTTP/CORS checks now pass all eight gates, including both exact native origins. The deletion endpoint remains unavailable, so this is not a successful production deletion test.

New ignored evidence is under `artifacts/qa/privacy-production-refresh-20261024/`: schema/scope/access/reference results, advisor function metadata, migration history, aggregate-only log summary, public HTTPS checks, `review-verdict.json`, `postflight-metadata.sql`, and `postflight-expectations.json`. The prepared postflight SQL was subsequently executed read-only after both migrations; its final result is `final-postflight-metadata.json`.

Available logs were queried as counts and fixed categories only, without returning IPs, account IDs, request URLs, message bodies, tokens or SQL statements. The available edge/auth request aggregates were 2xx; PostgreSQL included one `LOG:08006` connection event and no returned ERROR/FATAL category. This limited observation does not prove future availability or deletion correctness.

### Current advisor findings

| Finding | Current assessment |
| --- | --- |
| Four RLS/no-policy INFO findings | The final set contains the four `code3_private` session/security/deletion tables, with no browser grants. `beta_invites` still has no browser grants but now has the restrictive session policy, so it leaves this INFO list. These are intentional RPC/server boundaries. |
| Three mutable-search-path WARN findings | `beta_invite_status`, `normalized_app_role`, and `set_updated_at` are invoker helpers; their reviewed bodies calculate from supplied arguments or the trigger row. Anonymous/authenticated users cannot CREATE in `public`. These warnings remain for a separately tested hardening change; they were not silently dismissed or altered. |
| Five anonymous-callable definer WARN findings | Four workspace permission helpers explicitly return false/null without an authenticated current session and constrain membership to that account. The fifth function returns `trigger`, so its ordinary use is the existing table trigger. Existing grants still warrant review; this is not a blanket clean-security claim. |
| Fifteen authenticated-callable definer WARN findings | The reviewed admin/invite functions use trusted app metadata/profile authority, current-session checks, verified provider email and/or workspace permission checks. Existing API/RLS workflows depend on these functions. Do not revoke them indiscriminately as part of privacy deployment. |
| Leaked-password protection WARN | The advisor reports this Auth protection disabled. It remains an operator security-hardening decision before store beta; no Auth configuration changed in this review. [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). |

Performance advisors also report existing unindexed foreign keys, RLS initialization-plan warnings, unused indexes, overlapping permissive policies and a fixed Auth connection allocation. These are not newly introduced privacy findings and were not addressed with broad index/policy changes. Re-run both advisor sets after the narrow migration and compare deltas. [Database advisor guidance](https://supabase.com/docs/guides/database/database-linter).

### Server credential boundary

The current service reads `SUPABASE_SERVICE_ROLE_KEY` on the server. For the existing architecture, its destination is the **Production Sensitive environment variable of the Vercel `ember-tide-tcg` project**. It must never be placed in a `VITE_` variable, native build, preview deployment, local env file, chat, source control or screenshot. `SUPABASE_URL` and the public API key are separate nonsecret configuration; the service currently supports the existing public `VITE_` fallbacks. Keep `CODE3_ACCOUNT_DELETION_ENABLED` false/unset until reviewed setup and postflight complete.

Prefer a newly named, separately revocable backend secret key over retrieving/rotating the legacy JWT service-role key. A new `sb_secret_...` key still uses `service_role`, bypasses RLS and has full project data access; it is **not** a narrower permission grant. Every existing API entry imports the same Express app, and project environment variables are shared by its server functions. A separate key improves key management but does not create per-route isolation. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [new key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

Auth's administrative deletion API requires server authority. A publishable/anonymous key, ordinary user bearer, custom SQL role, personal access token or direct SQL deletion of Auth/Storage metadata is not a safe drop-in replacement. Moving the privileged orchestration into a separately authenticated broker or Supabase Edge Function could keep that key out of Vercel; it requires a new reviewed implementation and acceptance run, while the provider-side function still holds privileged authority. The read-only audit did not retrieve credentials; the subsequently approved secure setup is recorded below. [Auth admin deletion reference](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

### Migration history and controlled apply

Before rollout, production had 47 recorded migration versions, all represented locally, and six unrecorded local files. After applying the two privacy files it has 49 versions. The four unrelated local files remain unrecorded (`20260523213000_historical_scout_imports.sql`, `20260523223000_delete_sale_restore_inventory.sql`, `20260529123000_store_reports_owner_update_policy.sql`, `20260820120000_code3_canonical_owner_records.sql`). Do not run unrestricted `db push`/`--include-all`, apply those four files, or mark them applied to make this rollout proceed. Historical empty-database reconstruction gaps also remain; this rollout is not a reset or migration-history cleanup.

The current MCP `apply_migration` tool generates its own timestamp and accepts no source-version parameter. The operator selected the following controlled procedure; its two applies and database postflight are complete. The separately approved server secret is provisioned as a Production Secret for subsequent deployments; authenticated runtime validation, enablement and device gates remain:

1. Review the exact two SQL hashes above and a fresh preservation baseline. Keep deletion disabled and credentials absent. Apply the first exact SQL payload through MCP with name `code3_account_deletion`; inspect the outcome and capture its actual new history version. Do not blindly retry a timeout: inspect migration history, object names and function bodies first.
2. Apply the second exact payload with name `code3_private_attachment_reads`, then capture its actual version. If either apply fails, stop and inspect before continuing; do not run another migration or reset production to compensate.
3. Rename **only the two previously unapplied local SQL files** to the generated remote versions. Preserve their SQL bytes and the reviewed hashes. Update the tracked filename references listed below and record the source-version → applied-version mapping in this review. Do not invent generated versions or directly rewrite existing migration history.
4. Verify that all 47 previous history rows remain and exactly two matching new versions exist. The four unrelated pending files must still be pending. Re-run the focused PostgreSQL fixtures using the renamed files.
5. Run the prepared postflight metadata query, the identical receipt-owner/anonymous query and aggregate preservation comparison, plus advisor and grant/policy comparisons. Expected results: 49 current-session policies, every existing expected guard target covered, five service-only public invoker RPCs, no browser pending-table grants, zero pending deletions before enablement, unchanged legacy owner receipt access, anonymous receipt denial, unchanged records/object metadata, and only the intended four private bucket flags. Public artwork buckets stay public.
6. Verify authorized Storage signing/download and the deployed deletion route through an approved secure session/credential path. Secret provisioning was separately approved and completed below; enablement and acceptance remain gated. This read-only plan did not itself grant credential access or prove live deletion success. Physical devices remain paused.

If a CLI path is chosen instead, use a reviewed temporary work directory with the 47 recorded files and only the two intended pending files, then require its dry run to list exactly those two. The CLI is not presently installed/linked in this checkout. Do not add production DB credentials merely to avoid resolving migration-version alignment. [Supabase migration workflow and history repair](https://supabase.com/docs/guides/deployment/database-migrations).

The exact tracked filename-reference impact list is:

- `backend/test/accountDeletion.postgres.test.mjs` — deletion fixture migration load.
- `backend/test/privateAttachmentReads.postgres.test.mjs` — private-read fixture migration load.
- `scripts/prepare-account-deletion-preflight.mjs` — two source filenames used for hashes and SQL generation.
- `docs/mobile-beta/ACCOUNT_DELETION_ROLLOUT.md` — reviewed rollout references.
- `docs/mobile-beta/NATIVE_BUILD_AND_DEVICE_TESTS.md` — attachment dependency reference.
- `docs/mobile-beta/PRIVACY_READINESS_2026-10-24.md` — this review's table/mapping; preserve the original source hashes as historical evidence.

No runtime JavaScript/TypeScript import uses either SQL filename. Ignored QA scripts and manifests preserve original source evidence; update a rerun copy or an explicit mapping rather than rewriting historical results. Confirm the final list with a tracked-file search after the generated versions are known.

## Completed production database postflight — October 24, 23:46 UTC

| Original reviewed source version | Applied version | Migration name |
| --- | --- | --- |
| `20261018172530` | `20261024234312` | `code3_account_deletion` |
| `20261018174916` | `20261024234513` | `code3_private_attachment_reads` |

The final migration listing contains the original 47 entries and these two new entries. The SQL files were renamed to the applied versions without changing their reviewed bytes/hashes. The two database fixtures, preflight generator and rollout/device document references are updated by the release operator; four unrelated pending migrations remain untouched.

Independent read-only final metadata confirms 49 scope tables with the expected restrictive current-session policies, all 54 expected guard triggers, five public deletion RPCs that are invokers and executable only by the service role, zero pending jobs, no browser grants on the private job table, and an exact match to the reviewed session-helper body. Both attachment read policies are installed. Four private attachment buckets are private; `catalog-images` and `brand-assets` remain public.

Actual role tests confirm the existing receipt owner's current session is valid and can SELECT the one receipt; the anonymous role now sees **zero** receipts. All **four eligible existing provider sessions without an app `account_sessions` row** still pass the current-session check. These tests constructed local claims internally for existing eligible sessions, returned only counts/booleans, and restored claims, roles and temporary settings. They did not use real bearer tokens or fetch file contents.

The identical preservation SELECT was compared with the 23:25 baseline. It still returns two cloud workspaces, 79 saved revisions, zero reports and one Storage object. All source/full-row/object-identity/metadata fingerprints are unchanged. The **only** difference, aside from query timestamp, is the intended `receipts.public: true → false`. This aggregate baseline covers cloud workspace/report/storage data, not an independent shared-price-table fingerprint. Neither reviewed migration issues price-row writes, and no account deletion was requested.

Security advisor WARN categories/counts and all performance categories/counts match the preflight. The four no-policy INFO findings now include the private deletion table instead of `beta_invites`, as explained above. No broad privilege, index, authentication-setting or unrelated policy edits were made to suppress existing findings.

Final evidence: `final-postflight-metadata.json`, `final-migration-history.json`, `final-receipt-owner-access.json`, `final-active-session-parity.json`, `final-preservation.json`, `final-preservation-comparison.json`, and `final-{security,performance}-advisors.json` in the refreshed QA folder. The read-only verification itself performed zero production writes and retrieved no credentials.

**Remaining gates:** the approved server key is provisioned as a Production Secret and subsequent deployments receive it; authenticated runtime validation remains unverified. `CODE3_ACCOUNT_DELETION_ENABLED` remains absent, so account deletion stays disabled. Authorized Storage HTTP signing/download, production authenticated deletion-service acceptance and physical phone behavior remain unverified. The historical 67-check isolated hosted acceptance and current synthetic/local/database checks do not replace these gates. No new paid test database or live-account deletion was used to close them.

## Separately approved Production-only secret setup

After explicit owner approval, the release operator created a separate Supabase secret key named `code3_account_deletion` through the official Supabase UI. It was saved as the encrypted, Sensitive **Production-only** `SUPABASE_SERVICE_ROLE_KEY` variable in the existing Vercel `ember-tide-tcg` project, and the UI confirmed it was saved. It was not placed in a local file, chat, source control, native bundle, Preview or Development environment. The transient key value was cleared from memory and its source UI hidden. No secret value belongs in this document; the ignored `production-secret-saved.png` evidence shows only the save confirmation.

The key is provisioned as a Production Secret; subsequent deployments receive it, while authenticated runtime validation remains unverified. The deletion enable flag remains absent, and no production deletion request has been made. Saving a server credential is not proof that a particular deployment has loaded it, that authorized Storage HTTP operations work, or that account deletion has passed production acceptance. The key still carries the broad server authority described above; its separate name provides independent rotation/revocation, not narrower database permissions.

Local checks after aligning migration filenames passed **99 PostgreSQL fixture checks, 52 deletion-client checks, 49 private-receipt authorization/client checks, and 25 backend service/security tests** (10 deletion service/router, 7 hosted production-safety guards, 8 private-file client), plus the backend TypeScript build. These checks used synthetic/local fixtures and do not claim hosted production acceptance. The two applied SQL payloads retain their exact reviewed SHA-256 hashes, all 47 previous history entries remain, and the four unrelated pending migrations were neither applied nor marked applied.
