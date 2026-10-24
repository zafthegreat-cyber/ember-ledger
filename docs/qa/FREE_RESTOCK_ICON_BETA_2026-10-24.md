# Free restock, install icon and beta preparation

Authorized scope: publish the prepared three-card app icon, improve free restock
reporting, prepare beta packages/privacy work, and preserve existing records and
latest prices. The owner paused physical-phone testing on October 24. eBay stays
paused. This release does not publish the separate website, AIO or Discord work.

Branch: `codex/free-restock-beta-20261024`.
Latest pricing/main baseline: `f54dfa287eb559ac892fb769e2fcee82ba7b891a`.
The prepared icon commit was integrated as `6f236c0` on top of that baseline.

## Behavior

- Versioned PWA/Apple/fallback icons and native launcher resources use the
  approved emblem. Manifest identity, app ID, URLs and original artwork stay
  unchanged. Public-cache v5 refreshes install metadata; no account storage reset.
- Free reporters can choose up to three recent active-directory stores, derived
  only from their signed-in account's own reports. No previous stock, proof or
  observation time is reused.
- A new visit can reuse a location and privacy choice after a save. It requires
  fresh stock selection and review, with old notes/photos/source/category cleared.
- Offline guidance and device-only confirmation link to the existing cloud-saving
  settings. There is no automatic report repost/retry or invented server success.
- Account-deletion completion belongs to the deleted account ID. A different
  account cannot inherit that confirmation; delayed cleanup retains the new user.
- The standalone offline page fits the phone viewport after border-box sizing.

## Native preparation

Build-number validation now starts at seven (earlier builds existed). Signed
release commands require an explicit number; the operator must still verify it
exceeds every accepted store upload. Both platform defaults are aligned. The
manual cloud workflow uses verified immutable official action commits, read-only
repository permissions, and labeled artifacts/checksums with upgrade limitations.

Only the existing public Supabase origin and anon client configuration were added
to GitHub Actions variables. No server key, signing secret or password was read.
Android debug compilation and unsigned iPhone simulator validation are separate
from store signing and physical-device testing. See
`docs/mobile-beta/BETA_PACKAGE_READINESS_2026-10-24.md`.

## Verification before candidate publication

- Full source lint and production web build; built branding checks.
- Deterministic icon/export/native checks and real isolated-browser cache upgrade,
  offline navigation/manifest, unrelated-cache and exact localStorage/IndexedDB
  preservation. Mask previews are not a physical launcher-refresh claim.
- New free-report browser checks: two full phone/desktop cases, 44px targets,
  modal fit, owner-only stores, offline transitions, two deliberate saves, fresh
  visit reset, Settings handoff and unchanged existing records/prices.
- Existing report browser: six light/dark cases at 320/390/1440. Screenshot
  draft checks (43), actual report-handler schema checks (32), helper tests and
  scoped lint pass. Counts describe separate test scopes.
- Account deletion client (52), support (30), location privacy (18), actual public
  route account-switch browser regression, privacy/support viewport suites and
  backend build pass. In-memory deletion SQL: 45 canonical + 45 deployed-legacy
  fixture checks and nine private-receipt policy checks pass without credentials.
- Native readiness (7), native bridge scenarios (23), platform exports and eight
  preflight fixtures pass. Configured native web bundle and both platform copies
  retain all 4,729 complete catalog objects and prices from the baseline.

## Explicit remaining gates

Candidate cloud compilation and published static/data-preservation checks are
recorded separately after this implementation snapshot. No fresh APK or IPA is
implied by the local native web build. Physical phone/launcher/sync checks remain
paused at the owner's request. The D-U-N-S application is still In-Progress
(submitted October 18); organization enrollment and store signing are unfinished.

Production account-deletion migration/enablement and legacy private-attachment
rollout require the separate reviewed schema/access/preservation preflight. This
candidate's UI fix does not enable deletion or alter buckets. Production migration
or configuration changes must be recorded separately, and no owner account is a
deletion test fixture.
