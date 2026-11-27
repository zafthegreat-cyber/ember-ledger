# Inventory Intelligence reconciliation — November 26, 2026

PR #50 remains a draft release candidate. Production release is blocked on real
Supabase Auth staging acceptance. Passing synthetic tests is not that acceptance.

## Main reconciliation

Initially merged main `dabed6311f4fc243cd9fa0162266401d94a627df` into feature head
`5a16a19bf845491b026ad1f0b7862757be07d5a1` with both parents retained.
During validation main advanced by four more commits. A second reviewed merge
includes `1781bb2c9f5fac1e32a7ef50f80c051a6a7577b5`. A third merge preserves the
later scanner stale-page recovery at `0cc4296ff1ae2530a5469610190e35802159deba`.
The captured validation base is `a0fcf9a4383d0d59ceac4e69a22c27006c7ebe96`,
including its catalog classification/name-list corrections and refreshed bundled
data (33 newer main commits in total). Catalog data, camera/scanner changes,
card printing prices, reviewed card backs and App.jsx match this main snapshot. The later scanner
confirmation/save fixes and card-number prefix-index migration are preserved;
no hosted migration was run by this work.
The combined workflow retains main's catalog Postgres tests, new picture-quality
browser test, all inventory suites and the disposable opt-in RLS job.

## Staging isolation fix

The stock feed, review and warehouse clients previously hard-coded the shared
production project even when Auth used `VITE_SUPABASE_URL` for another project.
The Edge storage adapters also refused any other project. Clients now use the
same configured origin as Auth; Edge code uses its runtime `SUPABASE_URL`.
Missing, credential-bearing, non-HTTPS and noncanonical origins fail before a
request. No production fallback exists. Hosted Supabase origins are supported;
custom domains and self-hosted/local Supabase need a separately reviewed setup.

Project-isolation regression tests exercise all client operations and all four
Edge storage adapters against a synthetic second project. No test calls it.
Fresh owner/admin profile checks, current-session authorization, exact preview
CORS, anonymous denial and demotion/revocation checks remain required.

## Hosted read-only findings

- Only `Code 3 TCG` (`gxsfququorfczvhrkudl`) and its default `main` branch exist.
  No isolated project or development branch is available. No paid resource was
  created or requested, and no credentials or records were changed.
- `retailer_inbound_events`, `retailer_intelligence_signals` and
  `retailer_intel_sources` have RLS enabled, zero permissive policies, and no
  anon/authenticated SELECT grant. Service access stays behind the staff endpoint.
- Current `is_admin()` requires `code3_current_session_valid()`. The PR also
  checks the caller's fresh profile to reject stale privileged claims.
- The hosted inbound function is still v2. Its old profile check uses a service
  key and requires both admin fields; it lacks the PR's current-session guard
  and explicit preview-origin configuration. It was inspected only, not updated.
- Read-only preflights for both staff endpoints allow the production web origin
  (204) and reject this candidate preview origin (403, no allow-origin header).
  Real staff operations must be validated on an isolated backend.
- The preferences table is absent. Six retailer sources exist, all disconnected;
  zero stock signals and zero warehouse reports exist.

## Real Auth acceptance still required

Update, November 27: a separately approved temporary branch subsequently passed
65 real hosted backend Auth/API checks and was deleted. A second, separately
approved temporary branch then passed the real Auth browser workflow at 390px
and 1440px, including cross-account preference denial and member warehouse API
denial, and was deleted at 20:14:18 UTC. The staging-only recovery successfully
replayed all 77 remaining migrations; its fresh/recovery local checks now total
29. See [PR50 secure staging](./PR50_SECURE_STAGING.md) for exact scope, cleanup
and limits. The checklist below includes broader acceptance checks and is not
a claim that every item was newly rerun in the browser.

Use a separately approved isolated backend, never the production project above.
Review the existing schema and session functions before applying PR migrations;
hosted migration timestamps differ from repository filenames. Do not replay the
entire migration folder blindly. Configure the preview's public project URL/key
for that backend and verify the built Auth/feed/review/inbound origins agree.
Deploy only the reviewed staff/feed functions there and set
`STOCK_INTEL_PREVIEW_ORIGINS` to the single exact preview origin. Keep source
intake, source registrations, retailer connections and outbound delivery disabled.

With synthetic staging accounts and records, verify:

1. Owner and admin can read/create private warehouse reports; regular members,
   moderators and anonymous sessions cannot, including direct Data API/RPC calls.
2. Demotion and session revocation deny the next request with an old access token;
   sign-out/account switching immediately removes private UI records and drafts.
3. Preferences default disabled. A/B can save only their own opt-in, filters and
   quiet hours; neither account can read/change/delete/reassign the other's row.
   Opt-out persists after reload; revoked and anonymous sessions are denied.
4. Exact preview preflights succeed; unrelated and unlisted preview origins fail.
5. No source becomes connected, no retailer is scraped and no alert is delivered.

The existing disposable PostgreSQL fixture substitutes Auth/session functions.
It validates the real preference migration and RLS structure, but cannot prove
real Supabase JWT/session behavior, gateway CORS, or the deployed staff functions.

## Validation

- Locked dependency installation: zero audit vulnerabilities.
- Focused stock/consent/intake/project-isolation tests: 60 passed, zero skipped.
- After the later main reconciliations, the 60 stock tests plus 27 affected
  scanner/card-identity tests pass (87 total); source lint and build pass again.
- The captured catalog snapshot adds classification/card-back coverage: all 111
  focused tests pass, with lint, build and the chunk budget passing again.
- Connected sign-in regression tests: 41 passed.
- National-launch checks: 7 passed. Synthetic browser tests passed at 390px and
  1440px for warehouse visibility, sign-out, consent save/delete, account switching
  and stale-response suppression, with no external writes.
- Source lint and Vite production build passed locally. Largest budgeted JS
  chunk remains below the 2304 KiB limit (location index excluded by CI); the
  final measured size is recorded in the PR evidence.
- Final GitHub CI and commit-bound Vercel preview results are recorded on PR #50
  after the reconciled branch is pushed.
- Vercel emits four TS2339 diagnostics in the unchanged billing service. The
  earlier main production deployment has the identical diagnostics; a READY
  preview is not a clean backend type-check claim.

No production merge, deployment, migration, notification, retailer scrape or
connection-state update is authorized by this candidate validation.
