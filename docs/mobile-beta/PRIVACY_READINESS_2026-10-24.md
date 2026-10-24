# Privacy and account-deletion release review — October 24, 2026

The privacy pages and local deletion implementation are testable. **Production account deletion is not enabled, and this review does not certify store or physical-device readiness.** No production migration, bucket change, account deletion, record rewrite, file removal, or price update was performed for this review. Phone acceptance is paused at the owner's request.

The publisher remains **Anchor & Wing LLC DBA Code 3 TCG**, with **support@code3tcg.com**. Public privacy, support, and deletion pages are reachable independently of app workspace recovery. They do not mount the normal app or start cloud record synchronization. Support explicitly explains that requesting help is not confirmation of deletion.

## What was fixed and tested

Deletion completion now belongs to the account that requested it. An authoritative account generation changes synchronously when an auth callback changes accounts, before React can unmount an old form. Stale completion cannot start sign-out or label the next account deleted. Forms are also keyed by generation, so an A → B → A change within one JavaScript task does not reuse the first A confirmation. This applies to the public deletion route and the in-app callback.

The browser suite includes an old deletion promise resolving in the **same task** as A → B and A → B → A auth events. Both cases preserve the current sign-in, make zero stale callback sign-out calls, reset confirmation fields, and retain synthetic record/price sentinels. Independent actual-route probes reproduced the original failure and passed after the fix. These checks address stale callbacks starting sign-out; they are not a claim about a separate provider SDK sign-out already in flight during a concurrent SDK sign-in.

Current local verification:

| Check | Result and boundary |
| --- | --- |
| Backend TypeScript build | Passed |
| Account-deletion client checks | 52 passed |
| Privacy/support checks | 30 passed |
| Marketplace location/privacy checks | 18 passed |
| Service/router and isolated-hosted-runner guard tests | 17 groups passed; no live deletion |
| Existing PostgreSQL fixtures on pinned PGlite 0.5.10 | 45 canonical + 45 deployed-legacy deletion checks and 9 private-attachment checks passed in memory |
| Captured production session helper versus proposed helper | 28 before/after cases passed in memory; active provider sessions without an app `account_sessions` row remain valid |
| Account deletion browser | 320/390/1440 px, light/dark; confirmation, cancellation, wrong password, duplicate submission, blockers, pending recovery, public routes, delayed completion, same-task account changes |
| Support browser | 320/390/1440 px, light/dark; unavailable/blocked/pending guidance, copy failure fallback, readable contrast, touch targets, no overflow |
| Targeted lint | No errors; existing `App.jsx` effect dependency warning for `checkUser` remains |

The real hosted Auth/Storage/router acceptance remains the separately recorded **67-check October 18 result**, not a new October 24 hosted or device run. See [the original acceptance record](HOSTED_DELETION_ACCEPTANCE_2026-10-18.md). No paid test database or production credential was created or read for this review.

## Fresh production preflight

Production project: `gxsfququorfczvhrkudl`. Queries returned schema/policy/grant metadata or small aggregates only; no account IDs, session IDs, JWT values, object paths, URLs, file bytes, or account payloads were output.

- The two proposed migrations are absent; their function/policy/trigger names have no deployment collisions. All 12 required relations and all 50 table/owner-column scope pairs exist, with UUID owner columns.
- All **49 distinct deletion-scope tables already have RLS enabled**. The migration will not newly enable RLS on a table that has only its new restrictive policy. Per-table permissive SELECT/INSERT/UPDATE/DELETE policies and browser/service grants were captured. `beta_invites` already has no browser grants/policies; `seller_reviews` already has no permissive browser policy. Neither absence is introduced by this migration.
- The current session helper checks the existing provider session and the confirmed, active account. An app `account_sessions` row is optional unless a matching revoked row exists. Comparing the captured function definition with the exact proposed replacement confirms that the only intended difference is denial while account deletion is pending. The wrapper's ACL is unchanged.
- `product_catalog.user_id` is mandatory and cascades on Auth deletion. It remains excluded from the deletion allowlist. An account holding shared catalog rows must fail closed until a reviewed ownership transfer is complete. Shared catalogs and current prices must never be removed to bypass this blocker.
- The other unknown owner column, nullable `inventory_items.owner_user_id`, is covered by the migration's explicit inconsistent-ownership blocker. Unknown future owner tables and storage providers remain blockers rather than being silently skipped.

The legacy `receipts` bucket is still public and has a permissive public SELECT policy. Its **one object** has a known, consistent Auth owner; zero ownerless or inconsistent objects were counted. Across 104 schema-selected reference columns in 41 tables, zero standard same-project legacy-receipts URL references were found. This does not rule out device-only references, unusual encodings, or public artwork intent.

An actual production **READ ONLY** transaction selected an eligible existing owner session internally, set the local database role, and ran Storage RLS queries. The owner could see one receipt, the current session was valid, and one row passed the exact proposed ownership restriction. The anonymous role currently sees one receipt; the proposed anonymous restriction allows zero. No file was fetched. Claims and roles were restored, aggregate session settings were cleared, and the object's identity/metadata digest remained `455bc926c1afa129dc33d7532ee42cbd`.

This proves the current owner RLS query and the future predicate on current metadata. **It does not prove post-migration RLS or an actual Storage signed-URL download**, which must be verified after a separately reviewed apply. It does not promise that old receipt URLs stay anonymously readable: anonymous access is intentionally removed. Existing object bytes, names and saved references are retained, and the deployed private-image resolver reauthorizes recognized legacy references for the owner. Other public artwork buckets remain public.

Ignored local evidence is under `artifacts/qa/privacy-beta-20261024/`:

- `schema-preflight.sql`, `production-schema-preflight.json`, `preflight-manifest.json`
- `scope-access-preflight.sql`, `production-scope-access.json`, `production-storage-policy-metadata.json`
- `receipt-reference-audit.sql`, `production-receipt-aggregates.json`
- `receipt-owner-access-preflight.sql`, `production-receipt-owner-access-before.json`
- `session-access-parity.mjs`, `session-access-parity-results.json`, `pglite-results.json`
- `public-https-check.json`

The generator `scripts/prepare-account-deletion-preflight.mjs` makes no network requests and executes no SQL. `scripts/check-privacy-release.mjs` uses only public GET/OPTIONS requests, no account cookies or real keys, and no deletion POSTs.

## Exact proposed migrations and review order

| Order | File | SHA-256 |
| --- | --- | --- |
| 1 | `supabase/migrations/20261018172530_code3_account_deletion.sql` | `a3b879921a681d75412c3459111bad8d16d05eb14fd2213b9b96875246f4c6d1` |
| 2 | `supabase/migrations/20261018174916_code3_private_attachment_reads.sql` | `aa05543cde42e336026b80e4638f3de8bb01c2b0b9e226f3926dffe83b8be120` |

Both use transactions. The first installs deletion functions, the pending-operation table, guards and restrictive policies; installing it requests no deletion. The second changes four bucket public flags and adds read restrictions. It does not move, overwrite or delete files. These are still **proposals for a reviewed production rollout**, not completed production changes.

Before applying:

1. Keep `CODE3_ACCOUNT_DELETION_ENABLED` unset/false. Capture a fresh aggregate record/revision/storage preservation baseline and rerun the saved metadata/access preflight. Stop on changed schema, function hashes, missing owner access, unknown ownership, or name collisions.
2. Retain the deployed authenticated legacy-attachment resolver. Review any newly discovered intentional public artwork separately; never reopen private proof storage or automatically publish personal files.
3. Review the exact hashes above and apply only these two migrations in order. Do not add optional canonical tables, seed records, change catalog ownership, clear cloud records, or backfill image references for this rollout.
4. Before enabling deletion, rerun the same owner/anonymous role query, compare object/record fingerprints, inspect function grants and all relevant RLS policies, and run Supabase security advisors. Expected owner count stays one; anonymous receipt visibility becomes zero; object identity/metadata stays unchanged. Verify private Storage signing/download using an authorized session without exposing credentials or copying file contents into QA artifacts.
5. Configure any required server credential through a separately authorized secure destination. The production environment-name audit found no deletion server key or enable flag. The prior permission to read a disposable branch key does not authorize reading the production service key. Never use a `VITE_` variable, a native bundle, chat, source control, or a screenshot for it.
6. Enable the deletion service only after the reviewed schema, credential and isolated acceptance gates pass. Never validate by deleting the owner's real account. A successful flag change is not evidence of device acceptance.

If rollout fails before deletion is enabled, leave it disabled and investigate. A failing migration rolls back its transaction. If a confirmed deletion has already started, turn off new entry if necessary but retain the pending marker and write freeze; some files may already be removed and require a verified retry. Do not drop guards, remove pending markers, restore old records, or reopen `receipts` publicly as a rollback. Keep the compatibility resolver. See [the deletion rollout procedure](ACCOUNT_DELETION_ROLLOUT.md).

## Remaining external and release gates

Public HTTPS checks found `/privacy`, `/delete-account`, and `/support` loading successfully, unauthenticated status rejected, and an invalid synthetic bearer never accepted. Production web CORS passed. Both exact native origins currently return 403. `CODE3_NATIVE_CLIENT_ENABLED=true` adds only `capacitor://localhost` and `https://localhost` to the existing exact-origin allowlist; it must retain HTTPS API destinations, bearer/session checks, untrusted-origin denial, and server-only secrets. The flag does not enable account deletion by itself. Root must review/configure it and rerun the no-key GET/OPTIONS smoke check before native networking is declared ready.

Before store submission, finish operational self-service deletion, verify retention and support procedures, complete the actual Apple/Google privacy disclosures, and perform the signed iPhone/Android device workflows when the owner resumes testing. D-U-N-S/developer-account access, signing, distribution and physical-device checks remain separate gates owned by the native release work.

Apple requires apps that create accounts to let users initiate account deletion in the app. Google requires an in-app deletion path plus a functional web resource. A support-only fallback does not establish ordinary in-app deletion readiness. [Apple account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion), [Google account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

Supabase Auth deletion and Storage cleanup require provider-aware handling; access JWTs can outlive Auth deletion until expiry, so the current provider-session check and pending write freeze remain necessary. Files must be removed through Storage APIs before Auth deletion, not by deleting provider metadata with SQL. [Supabase user-data guidance](https://supabase.com/docs/guides/auth/managing-user-data).
