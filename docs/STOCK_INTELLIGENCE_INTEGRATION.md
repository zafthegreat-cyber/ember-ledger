# Stock intelligence and warehouse tracking

Status checked November 23, 2026. Work remains on draft PR #50; this is not a production release.

## Current verified state

- Repository: `zafthegreat-cyber/ember-ledger`, branch `feature/stock-intelligence-20261115`.
- Vercel project `code3-tcg`, production domain `code3tcg.app`. Production is not changed by this work.
- Supabase project `gxsfququorfczvhrkudl` is healthy. Deployed functions before this change are feed v4, review v3 and inbound v2, all with gateway JWT checking enabled.
- Six source rows exist: Target, Walmart, Pokémon Center, Best Buy, Sam's Club and Costco. Every row is `manual-watch`, disconnected, and has no successful source check.
- Eleven Target SKUs are user-supplied tracking targets. Their names, URLs and future availability have not been independently verified. Club category watches do not identify a shipment or product in stock.
- There are zero stock signals and zero inbound events. No warehouse counts, retailer connections or notifications were invented.
- RLS is enabled on the three private intelligence tables. Neither `anon` nor `authenticated` has SELECT or INSERT access. The bounded feed RPC is executable by `service_role` only. Existing product/monitor-target policies are restrictive, with no permissive member policy; table grants alone do not make those records writable.

## Changes in this PR

The current main branch is merged into the feature branch. Its newer Restocks map remains first. The stock panel follows it; Collect, Sell, auth and the other product areas retain main's changes.

The public response is rebuilt through a shared allowlist contract at the Edge boundary and again checked by the browser. Unknown fields, raw payloads, actor identifiers and quantities are never forwarded. Private Discord message URLs are refused. Until permitted-channel intake exists, staff reviews accept matching public retailer links only.

Admin-checked purchase availability must cite the watched product's page, not a retailer homepage. Compatible development dependency updates remove four existing audit advisories (glob/minimatch/rimraf and Zod); `npm audit` reports zero after the lockfile update.

Staff authorization verifies the user with Auth and calls the existing `is_admin()` RPC with the caller's token. That RPC checks the current account session and supports the app's owner/admin roles. No user-editable metadata or service-role identity is used to decide staff access. Account changes unmount private records and discard drafts. Failed loads clear records. Reports expire while the page stays open.

Source status distinguishes disconnected, awaiting validation, overdue and recently checked. A successful check older than 15 minutes is overdue. Feed generation time is never called a retailer stock check. Purchase availability expires within 15 minutes of observation; reported/forwarded leads cannot become official availability. Warehouse reports remain private and reported, with no conversion into public stock claims.

## Preview/backend rollout boundary

The repository contains the revised Edge code; pushing the frontend branch does **not** deploy Supabase functions. The shared hosted backend is intentionally left unchanged. The Vercel preview reads its existing bounded feed, which currently contains only the watchlist and source status. Staff actions from preview are blocked by the existing hosted CORS allowlist.

Before production approval, deploy and verify these functions against an isolated test backend with synthetic records and a test staff account. The current project lock is deliberate: a staging rollout must explicitly configure and verify the intended staging origin rather than silently reusing production. Include each function's imports from `_shared/stockStaff.mjs` and `_shared/stockContract.mjs`. Keep `verify_jwt=true`.

`STOCK_INTEL_PREVIEW_ORIGINS` is a JSON array of exact, reviewed HTTPS Vercel origins in the owner's namespace, including the current preview's origin. It defaults to no extra origins. No wildcard origin is accepted; CORS is not authorization. Never expose service keys or preview automation bypass secrets in frontend variables or artifacts.

Do not replay all migration files into the hosted project: the original three stock migrations were applied under different timestamps in hosted migration history. Reconcile migration history separately before an automated backend rollout. This update adds no database migration and does not alter hosted tables.

## Approved adapter boundary

`supabase/functions/_shared/stockAdapter.mjs` provides a pure normalizer with tests. It does not fetch retailer pages, run a bot, schedule polling, receive public webhooks, persist events or mark any source connected.

Server configuration must identify the approved retailer, source ID, agreement reference and source mode. Event input cannot change those permissions. Observations require a real source timestamp and a recent successful validation. Stable event IDs generate replay-stable keys; raw free text, quantities and shipment details are excluded. Authorized partner leads are reported only. Official evidence requires an approved official API registration and a matching retailer URL.

The caller must obtain that successful-validation receipt from its own authenticated connector health check, not from inbound event data. Bind each registration to its fixed endpoint/credentials; never fetch event-supplied URLs. On persistence, resolve the SKU to an approved product for the same retailer, write only the validated fields, enforce the unique event key and keep receipt/audit data private. The adapter cannot prove an agreement exists; provisioning and staff approval supply that trust.

## Realistic integration path

1. **Discord:** obtain the server owner's approval, install an official bot with minimal permissions and an explicit guild/channel allowlist, or accept owner-authorized forwarding. Verify webhook signatures or use the bot's authenticated gateway. No user tokens, selfbots, private-channel scraping or historical message collection. Keep guild/channel/message IDs private. Explicitly review publication consent before publishing any sanitized lead with a public retailer URL. A forwarded claim stays reported.
2. **Retailer/supplier feeds:** obtain written API/data access and permitted use, credentials and sample payloads. Agree on rate limits, caching, retention and downstream display rights. Implement a separate fixed-host adapter for each approved provider; test authentication, redaction, replays, retries, 429 backoff, schema drift and stale timestamps. A catalog/product page is not a warehouse feed.
3. **Warehouse evidence:** purchase orders support ordered; supplier advance shipping notices support expected/en-route shipment reports; receiving confirmations support arrived; warehouse-system inventory/putaway evidence supports in-warehouse. Never infer these from a product listing, queue or public stock alert. Correlation IDs, facilities, quantities, routes and schedules stay private. Staff prose remains an unverified report.
4. **Monitoring:** store private last-attempt, last-success and bounded error codes; alert staff on overdue checks. Mark a source connected only after an authenticated end-to-end test, permission review and verified production configuration. Do not reset last-success on a failed check or an empty/error response. A successful feed read does not imply available stock.
5. **Alerts:** collect SKU/UPC, matching public product URL, retailers, region and desired delivery/quiet hours. Device pins do not subscribe anyone. Add explicit opt-in, deduplication, expiry checks at send time and an unsubscribe control before enabling delivery. Do not dispatch checkout automation or queue bypass.

## Validation and release gates

- `npm run test:stock-intelligence`: contract, source health, attribution, expiry, public-field filtering, auth dependencies, preview CORS and adapter behavior.
- `node scripts/test-stock-intelligence-browser.cjs` with local Vite at `APP_URL`: synthetic mobile/desktop panel flows, no live writes, private records hidden from members, cleared on sign-out, expired signals removed and source failure shown honestly. Included in the CI browser suite.
- Run the node suites listed in `.github/workflows/ci.yml`, source lint, plain-language checks and production build. CI browser shards must all pass on the final commit.
- Verify the final Vercel preview commit and READY state. Inspect the preview as a member. In an isolated backend, verify actual staff requests, revoked-session rejection, exact-origin CORS and database permissions before approving backend deployment.
- Keep PR draft until those gates and user review are satisfied. Do not merge, promote production or connect external feeds automatically.
