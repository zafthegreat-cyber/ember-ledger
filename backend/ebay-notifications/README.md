# eBay account-deletion release

This release is based on the production pricing commit
`91f63f3878011fcb69b95ce3d24afed4ebd5cda5`. It contains only eBay privacy
handling and device protections; no catalog, generated prices or brand refresh.

## Endpoint and deployment order

Endpoint: `https://gxsfququorfczvhrkudl.supabase.co/functions/v1/ebay-account-deletion`

1. Apply the reviewed migration in
   `supabase/migrations/20261020182434_code3_ebay_deletion_notifications.sql`.
   Installation creates private infrastructure and write guards; it does not
   rewrite existing owner records. The existing cloud write function receives
   the privacy advisory lock before acquiring workspace locks.
2. Call the service-only `code3_ebay_initialize_runtime(owner_uuid, endpoint)`
   for the verified publisher account. A random 64-character verification token
   is generated inside the database and encrypted with Supabase Vault.
3. Deploy `supabase/functions/ebay-account-deletion/index.ts` with its two local
   dependencies and `verify_jwt=false`. eBay authenticates POST deliveries with
   its ECDSA signature; private status/retry actions require server credentials.
4. Verify the live GET challenge against a server-computed expected digest.
   Promote the isolated, tested client privacy bundle after its tombstone RPC
   is available. Use Vercel's existing Production environment for the build.
5. Complete eBay setup through the local publisher page, then exercise eBay's
   real Send Test Notification. A successful challenge alone does not verify
   signed POST delivery or complete deletion.

Never publish service-role keys, Cert IDs, tokens, auth sessions or `.env` files.
Do not deploy the local publisher page as a public website.

## Publisher setup

Create an ignored, public-only configuration JSON containing `supabaseUrl` and
`publishableKey`, then run:

```powershell
node backend/ebay-notifications/serve-setup.cjs artifacts/qa/ebay-public-setup-config.json
```

Open `http://127.0.0.1:5370/`. The page only binds loopback, has a restrictive
CSP, and sends login credentials directly to the existing Supabase Auth service.
The exact publisher and a live provider session are checked by each setup RPC.
Tokens remain masked and can be copied directly into eBay. Session credentials
are held only in memory; sign-out clears them and revokes that local session.
App ID and Cert ID are written to Vault, not to the phone bundle.

Use `support@code3tcg.com` for eBay's endpoint failure email. Save the exact HTTPS
endpoint and matching verification token in eBay's Marketplace Account Deletion
form. Once the keyset activates, enter the Production App ID and Cert ID in the
publisher setup page. Wait 30 seconds for runtime refresh, then send eBay's test.
The setup status view reports aggregate delivery counts without personal data.

## Processing and preservation

- Verify the original request bytes and eBay public key before accepting work.
- Store a durable, idempotent inbox entry with hashed identity evidence only.
- Process current workspaces, revision history and applicable canonical records
  atomically. Redact matched eBay personal/provider evidence while preserving
  owner inventory, quantities, costs, independent prices and unrelated sellers.
- Bump affected workspace revisions and reject stale tombstoned writes.
- Keep digest-only tombstones available to authorized app sessions. Refresh and
  apply them on startup/reconnect, including local archives, pending payloads,
  imports and exports. Reseal integrity hashes and preserve recovery references.
- Retain failed work for retry. Unknown identity mappings are `needs_review`,
  never a false assertion that erasure completed. The publisher delivery view
  distinguishes these states. A verified test identity absent from saved data
  may legitimately require review.

Previously downloaded/offline exports cannot be remotely changed. Updated
clients sanitize copies when brought back into the app. Physical device and real
provider delivery checks must be recorded separately from local fixtures.

## Verification

Local suites, using synthetic data only:

- 81 PostgreSQL/PGlite assertions: ownership, durability, retry, rollback,
  revision conflict, stale restore rejection and mixed-seller preservation.
- 21 runtime configuration/access assertions with a synthetic Vault adapter.
- 47 protocol/Edge tests, including real generated EC signatures, bounded
  dependencies, bootstrap behavior and safe status/retry response envelopes.
- 18 client privacy unit tests; 11 native IndexedDB privacy checks; existing
  9 IndexedDB, 10 account-startup, 20 sync, 23 recovery and 18 ownership/quota
  checks. Backup checks cover 22 sections and 34 records.
- Targeted lint, application build, backend TypeScript build, 32 route checks
  and existing menu route checks.
- 11 isolated publisher-page browser cases at 1280px, 390px and 320px widths:
  setup, copy, save, delivery status, sign-out and failure paths. No real login,
  provider requests or system clipboard changes are part of that suite.

The aggregate deploy-readiness script requires local production configuration,
including a database URL. It was not run to completion because those credentials
were intentionally not pulled. Focused tests pass; staging must use a remote
Production build and be verified before promotion.

The SQL test harness requires `CODE3_PGLITE_MODULE` to point to an isolated
installation of `@electric-sql/pglite@0.5.10`. It performs no production calls.

Official protocol: <https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion>
