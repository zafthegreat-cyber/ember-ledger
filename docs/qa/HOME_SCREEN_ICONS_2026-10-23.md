# Approved home-screen icon update

The phone's installed-app icon uses the supplied three-card emblem instead of
the retired teal C3 mark. This is an icon-only follow-up to the published color
release, based on latest main `798ce672cf6fc64c1eaa0feab0410746bd710a66`.
Branch: `codex/approved-home-screen-icons-20261023`.

## Files and behavior

- `src/config/brand.js`, `index.html`, and `public/manifest.webmanifest` select
  versioned 192/512px install PNGs, a separate Android maskable PNG, an opaque
  180px Apple touch icon, and a 32px favicon.
- `public/assets/brand-system/icons/v1/` contains deterministic exports of the
  unchanged approved 1254px emblem. Conventional public icon and favicon paths
  also contain the new artwork for older links and browser fallbacks.
- The iOS app-icon catalog has an opaque 1024px export. All five Android density
  sets have new launcher, round and adaptive foreground PNGs. Adaptive icons use
  the matching deep burgundy background. Complete cards, stars and orbit remain
  inside platform safe regions; decorative outer corners may be masked.
- `public/sw.js` advances the public asset cache to v5 and fetches install
  metadata from the network first, with its cached offline fallback. Cleanup
  targets older app caches only. No localStorage or IndexedDB clearing occurs.
- `scripts/export-code3-pwa-icons.mjs` packages the approved PNG without
  redrawing or recoloring it. `--check` verifies the checked-in exports. It uses
  a local browser canvas, with network requests blocked. Original artwork stays
  byte-for-byte unchanged.
- `scripts/test-code3-branding.mjs` verifies actual PNG dimensions, decoded
  opacity, fallback consistency, original source hash, native app identity and
  built/development install metadata.

The manifest id, start URL and scope remain `/`. Native app ID remains
`app.code3tcg.mobile`. All 14 generated catalog/price files, account and sync
code, backend/API/schema files and four supplied artwork PNGs match the latest
main baseline. No production data was read, written, seeded or removed.

## Verification

Passed:

- `npm run lint:src` (existing large-App Babel informational note only).
- `npm run build`.
- `CODE3_VERIFY_DIST=1 node scripts/test-code3-branding.mjs`.
- `node scripts/export-code3-pwa-icons.mjs --check`.
- `npm run test:native`: 23 mocked native bridge scenarios and export checks.
- Eight real Chromium install/upgrade/offline checks in a fresh synthetic
  context: new assets precache; stale install metadata refreshes; older app
  caches are removed while an unrelated cache survives; localStorage and
  IndexedDB record/price sentinels survive; offline manifest, icon and fallback
  navigation work; zero external HTTP requests.

Actual 64/72px browser mask previews were inspected. Evidence is under ignored
`artifacts/qa/icon-sw-results.json`, `icon-sw-preview.png` and
`home-screen-icon-build.log`. The fixture server and contexts were closed.

## Release and device limits

This branch is prepared for review; it has not been merged or deployed. Browser
mask previews do not establish a physical phone launcher refresh. Existing OS
icons may update on their own schedule. Do not clear app data to refresh an icon.
The native launcher resources require a new installed native build; this work
does not compile, sign or submit an iPhone/Android package.
