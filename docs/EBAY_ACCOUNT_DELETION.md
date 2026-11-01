# eBay Marketplace Account Deletion

Implemented on October 24, 2026. The user approved the rollout. Both production
migrations are applied; the private verification token, endpoint URL, and enable
flag are configured. The user added both Production eBay API credentials and
redeployed; the new deployment is READY and public endpoint checks pass. The
successful signed deliveries and committed processing receipts are now confirmed. No eBay
portal settings have been changed by this implementation.

## Endpoint and configuration

The implemented GET/POST route is `/api/ebay/account-deletion` in the existing
Express backend. Vercel rewrites it to the existing `api/health.ts` backend entry
point, with platform body parsing disabled so Express can verify the signed
payload. This stays within the existing 12-function hosting limit.
The existing Vercel project is `ember-tide-tcg`
(`prj_opLikOxbXPA3pTJ2EajgR5qzo4fq`), team
`zafthegreat-cybers-projects` (`team_SrWvifkcXd622u47TnXCZUT0`).

The existing authorized Vercel CLI confirmed `code3tcg.app` as a verified domain
of this exact project. The server callback URL is
`https://code3tcg.app/api/ebay/account-deletion`. Confirm the live challenge before
entering it into eBay. The public endpoint has now passed that check, including
an exact token/URL hash match, unsigned POST rejection (412), and missing
challenge rejection (400). `code3tcg.com` is not the backend host.

Server variables:

| Name | Value / handling |
| --- | --- |
| `EBAY_DELETION_ENABLED` | `true` only after the migration and configuration are ready |
| `EBAY_DELETION_ENDPOINT_URL` | Exact confirmed HTTPS endpoint, with no query string or trailing slash |
| `EBAY_DELETION_VERIFICATION_TOKEN` | Separate random 32–80 character token; letters, digits, `_`, `-` only; store as a Vercel Secret |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Existing eBay application credentials for fetching notification verification keys; review/reuse only with approval |
| `EBAY_ENVIRONMENT` | `production` for production notices; use separate sandbox configuration when testing sandbox |
| `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` / `VITE_SUPABASE_URL` | Existing server service credential and project URL, used for service-only database RPCs |
| `DATABASE_URL` | Optional alternative direct connection, when configured |

Never use a `VITE_` prefix for these values. Generate the verification token in a
password manager, retain it there, and copy the same value privately into the
server configuration and eBay portal. Rollout generated a random 64-character
token and stored it as a Production Secret, with a Windows DPAPI-encrypted
recovery copy at `.vercel/ebay-deletion-verification-token.dpapi`. This directory
is excluded from Git and Vercel uploads. To copy it without printing it, run
`powershell -File scripts/copy-ebay-deletion-token.ps1` on the same Windows
account, paste into eBay, then clear the clipboard. Save it in your password
manager as well. No secret belongs in source, deployment commands, chat,
screenshots, logs, backups, or client responses. Challenge responses contain only
the SHA-256 result. The URL is taken from configuration, never request headers.

## Storage audit

The source audit found:

- The Browse connector uses an application token in process memory, with no eBay
  user OAuth connections or eBay account-to-Code-3-account mapping.
- Browse results include seller name/rating, title/description, photos, location,
  and listing URLs. `sellerUserId` is now retained when eBay supplies it.
- `ember-and-tide.flip-scout.v1` stores provider listings and imported deals in
  device local storage. Appraisals copy seller identity into `SELLER_NAME`
  evidence observations. The backup registry includes this data.
- Cloud workspace snapshots and revision history store this data in JSONB.
  Optional canonical storage uses `public.code3_records.metadata` and provider
  columns. The live database currently has no `code3_records` table; the migration
  supports that deployed legacy state and the optional canonical schema.
- Existing Code 3 marketplace seller profiles refer to Code 3 auth users, not
  eBay identities. Catalog eBay search links are product queries, not evidence of
  a linked eBay account. Neither is treated as authorization to delete a Code 3
  account or another marketplace's data.

Read-only schema and aggregate checks against the connected **Code 3 TCG**
Supabase project (`gxsfququorfczvhrkudl`) found 2 current cloud workspaces and 79
revisions, with no matching eBay provider markers or seller identity fields in
those snapshots. The checked `master_market_price_sources` (63,784 rows),
`product_market_price_current` (44,236 rows), and `product_market_price_history`
(0 rows) likewise had no eBay source markers or seller identity keys. These
checks returned schema/aggregate counts only. They do not inspect offline browser
copies or certify that every arbitrary text field is free of personal data.

## Processing and deletion

GET returns HTTP 200 JSON:
`challengeResponse = SHA256(challenge_code + verificationToken + exactEndpointURL)`
as lowercase hexadecimal. Missing, repeated, empty, or extra challenge parameters
are rejected. Missing/invalid server configuration returns 503.

POST requires a bounded JSON body and a valid `x-ebay-signature`. The verifier
decodes the Base64 header, accepts eBay's ECDSA/SHA1 format, fetches the EC public key
only from the fixed production/sandbox Notification API using application OAuth,
and caches verified key material for one hour (maximum 100 cached keys). It
verifies the wire bytes or the JSON serialization used by eBay's official Node
SDK. The challenge token is not used as POST authentication. Unsupported/forged
signatures return 412. Key lookup or database failures return 503 with Retry-After.

A single PostgreSQL transaction stores namespaced SHA-256 identity digests,
redacts applicable provider fields in current and historical snapshots and
optional canonical records, advances changed workspace revisions, and records a
hashed notification receipt. The transaction is idempotent. **HTTP 204 is sent
only after commit.** If it fails, no receipt is committed and eBay can retry.
There is no untracked process-local queue or fire-and-forget work after success.

Business IDs, costs, quantities, statuses, and other sellers/providers are kept.
Matched eBay identity, descriptions, photos, locations, external listing IDs,
URLs, notes, and provider evidence are removed. Titles become “eBay data deleted.”
Database triggers sanitize later writes and restored cloud snapshots. Private
tables use RLS and no public/authenticated access; only server functions are
granted to `service_role`. Raw notice payloads and identities are not retained.
The minimal private suppression digests remain to prevent resurrection; they
are pseudonymous data and must stay access-controlled.

The private owner-authenticated `/api/ebay/deletion/sanitize` route reconciles
device snapshots. While Find is open, the app checks on opening, reconnect,
focus, and every minute. Writes use the existing exclusive inventory lock,
verify the saved result, and preserve protected business values. Failures stay
visible and retryable. Fresh Browse searches are sanitized before being returned
when deletion processing is enabled.

## Exact rollout sequence — requires approval first

1. Obtain approval to apply this migration, configure/reuse the named server
   credentials, and deploy this change to the existing app project. Authorize the
   Vercel connector's existing team access, then confirm the current production
   domain. Do not create a new project or use the marketing homepage as callback.
2. Run local checks from `terms-page`:

   ```powershell
   npm ci --prefix backend --ignore-scripts
   npm run test:ebay-deletion
   npm install --prefix artifacts/qa/ebay-test-runtime --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.10
   npm run test:ebay-deletion:postgres
   npm run test:flip-scout-ebay
   npm run test:flip-scout
   npm run build
   ```

   The isolated PGlite test database is in memory and never uses `DATABASE_URL`.
   The regular handler suite skips its database case if no PGlite module was
   supplied; **run the explicit `:postgres` command to include that case**.
3. Apply only
   `supabase/migrations/20261025013845_code3_ebay_account_deletion.sql` and
   `supabase/migrations/20261025015445_code3_ebay_deletion_rpc.sql` to the
   confirmed project through its reviewed migration process, or run that exact
   file in the project's SQL editor after approval. Do not run an unrestricted
   `db push` that might apply unrelated pending migrations. Confirm the new
   schema/functions and the two cloud privacy triggers exist; if canonical
   storage is introduced later, add its guard trigger before enabling writes.
4. Configure the variables above in the existing Vercel project's Production
   environment. Store the verification token, client secret, and database URL as
   Secrets. The database connection must target the inspected project. Review
   credential presence without returning values. Do not pull production secrets
   into frontend env files. Make sure no external log drain captures request
   bodies or signature headers for either deletion route.
5. Build a production candidate through the existing deployment pipeline and
   verify routing before assigning the production domain. With the current repo's
   CLI workflow, from the correctly linked project:

   ```powershell
   npm run verify:deploy
   npx vercel deploy --prod --skip-domain
   # Inspect and test the returned candidate URL, then promote that same build:
   npx vercel promote <the-returned-candidate-url>
   ```

   The registered URL remains the stable production domain, even when testing a
   candidate host. Check that the challenge result hashes the configured stable
   URL. Do not disable all deployment protection; ensure eBay can publicly reach
   the final callback. Check GET produces application/json, not the SPA document,
   and an unsigned POST produces 412 with no receipt. Do not send a fabricated
   deletion for a real seller to production.
6. Verify the final deployed HTTPS route and report that actual confirmed URL.
   In the eBay portal, use the monitored `support@code3tcg.com` inbox, the exact
   verified endpoint, and the matching private token. Keep the exemption off.
   Click **Save**, then **Send Test Notification**. Confirm 204 plus a committed
   receipt. If the eBay key format differs, diagnose safely; never bypass
   signature verification to make a test pass.
7. Confirm operational readiness: monitor 503/412 responses, eBay delivery alerts,
   and successful receipt timestamps without payloads. Resolve failures before
   eBay's retry window closes. Run the Supabase security advisor after applying
   the migration and review any new findings. Retain suppression state on
   rollback; deploy a code fix instead of dropping privacy tables/triggers.

## Scope limits that remain operational work

- Offline devices cannot be remotely erased. They reconcile when the updated
  app opens Find online. A pending inventory recovery journal must be resolved
  before reconciliation; a failed/oversized device snapshot reports a cleanup
  error. Other browser profiles, legacy clients, and user-downloaded files need
  their own cleanup. A server receipt is not proof that every offline copy is gone.
- Physical database backups/WAL and externally exported files are outside this
  handler. Set and enforce backup expiry and a restore procedure that restores
  suppression state and re-sanitizes old data **before** exposing it. This change
  does not claim instant physical erasure of provider-managed backups.
- Historical data containing only a public username cannot be linked to an
  immutable-only notification without a trusted mapping. The code matches all
  identities supplied by eBay and does not invent account mappings. New storage
  paths, attachments, arbitrary free text, and future eBay user-token integrations
  require a deletion-scope review before activation.
- The in-memory PostgreSQL suite covers transaction rollback, redaction,
  permissions, deduplication, and restore guards. Production concurrency and
  eBay's real signed test notification still require deployment verification.

## Local validation result

- Backend TypeScript build and production frontend build passed. Installing the
  backend's existing lockfile dependencies resolved an initially missing local
  `mailparser` type package; no dependency versions were changed.
- 60 handler, Browse connector, owner authorization, and legacy-boundary tests
  passed, including the in-memory PostgreSQL migration/rollback case.
- 3 device reconciliation tests and the existing Flip Scout calculations,
  allocation, sale-validation, storage, and CSV checks passed.
- Targeted ESLint and `git diff --check` passed. The frontend build retains its
  existing large-chunk and mixed static/dynamic Supabase-import warnings.
- Both production migrations are applied. A rolled-back production synthetic
  transaction verified processing without leaving receipts, suppression records,
  or changed app data. The public challenge and unsigned-request checks passed.
- Both eBay credential names are present in Production; their values were not
  read or printed. Live eBay delivery and committed processing are confirmed.

## Published deployment

The CompsAPI rollout subsequently restored these endpoint and routing changes
on top of production commit `4dbfcbf01436168c49fa8368d35d15344323b6d8` after a
catalog-only Git deployment had replaced the earlier manual release. Current
deployment: `dpl_9BDN54YnoJMgjyhku5sf2f2ddbSk`, immutable host
`https://ember-tide-8azg06n9h-zafthegreat-cybers-projects.vercel.app`. The exact
challenge hash, unsigned POST 412 and missing-challenge 400 passed on both the
staged build and `https://code3tcg.app`. Owner-authorized Browse verification
reported healthy access. Keep these changes in production source control before
the next daily catalog deployment. The historical rollout evidence below remains
unchanged; the CompsAPI provider authorization issue is tracked separately in
`docs/SOLD_MARKET_PRICES.md`.

- URL: `https://code3tcg.app/api/ebay/account-deletion`
- Previous routing deployment: `dpl_BxKvwDCYTLZPwrbMFSBzAozZ9EUH`, READY / production
- Immutable host: `https://ember-tide-8e4k6c1kj-zafthegreat-cybers-projects.vercel.app`
- The credential redeployment was `dpl_6oSr2qaSTVPZ1Yazo3kikQVCV9sD`.
- Initial tested endpoint deployment: `dpl_Ca7sQMwHMsrcbidG3PutRDc5TP5s`.
- Source base: `29a946136acc9d16aa5386d1987af9a086b24451` plus the local endpoint and routing changes;
  no commit, push, or merge was performed.
- Previous production: `dpl_FsYtzWk5ZizgYHxGcpjMFzxvX3uK`, retained as a code rollback reference.
  Preserve the database privacy guards and suppression records on any rollback.
- App homepage still returns HTTP 200. Data checks still show 2 workspaces and
  79 revisions; unsigned probes created no receipts or suppression entries.
- Post-deployment runtime error scan: 0 errors returned for this deployment.
- Live delivery confirmed: 10 committed notification receipts matched 10 callback
  POST responses with HTTP 204. The latest processing timestamp was
  `2026-10-25T02:32:29.086011Z` (October 24, 10:32:29 p.m. America/New_York).
  No payloads, signatures, user identities, or credential values were disclosed.

## eBay search routing verification

- The user approved the routing fix and production rollout. Explicit eBay API
  routing now selects the existing Express function before the SPA fallback,
  retaining all twelve function entrypoints and owner authorization. Previously,
  health returned the app HTML and search returned HTTP 405.
- Staged production and live deletion checks passed: exact challenge hash with
  HTTP 200 JSON, unsigned POST 412, and missing challenge 400. Anonymous search
  and health requests still receive HTTP 401 JSON. Public market sources remain
  available with HTTP 200; the homepage also returns HTTP 200.
- In the signed-in production app, Verify connection reported healthy eBay
  authorization. A `Pokemon Charizard` search returned 25 real listings in Import
  Review. Production logs confirm health HTTP 200 at `2026-10-25T02:50:38.526Z`
  and search HTTP 200 at `2026-10-25T02:50:48.367Z`. No result was imported into
  the Deal Inbox during verification.
- The remote production build passed. Local validation passed 54 packaging
  checks, 32 route-loading checks, menu routing, and 55 backend tests; the database
  integration case was skipped in this test invocation and was covered in the
  earlier deletion rollout validation.
- The final error/fatal runtime-log scan of this deployment returned zero
  records in the preceding 15 minutes.
- eBay results remain active asking-price/current-bid evidence. Completed-sale
  data is not connected and is not inferred from those results. Existing public
  TCGplayer/TCGCSV market snapshots are independent of the eBay credentials.

## References

- [eBay setup and notification requirements](https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion)
- [Official eBay Node SDK verification behavior](https://github.com/eBay/event-notification-nodejs-sdk/blob/main/lib/validator.js)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel production staging and promotion](https://vercel.com/docs/deployments/promoting-a-deployment)
