# Code 3 TCG production publication

Published September 29, 2026 after the user's explicit **“publish it”** approval.

- **Public URL:** https://code3tcg.app
- **Target / status:** production / READY
- **Deployment:** `dpl_423RWsrNw4ZR1cTwNYM48KVnhMAJ`
- **Immutable deployment:** https://ember-tide-7o0c7ppp3-zafthegreat-cybers-projects.vercel.app
- **Existing Vercel project:** `zafthegreat-cybers-projects/ember-tide-tcg`
- **Framework / remote build:** Vite; build completed in 29 seconds.
- **Checkout:** detached `ba68b2eb5f4fe027f5234cf207a44f8c07514ea2`, associated with `origin/ui-104-final-product-ui-2`, including the preserved uncommitted application work. No commit, push, or merge was performed.
- **Previous production deployment:** `dpl_Ef8g6aMUFP7c5GXiqxcoHGmLtdYJ` (`ember-tide-d1bayta14-zafthegreat-cybers-projects.vercel.app`), recorded before publication as a rollback reference.

## Published scope

The existing completed UI, workspace, backup review, keyboard, and Buy Offer work is now published. Before release, all 518 runtime/build files matched the September 24 Buy Offer completion manifest.

A bounded installation fix exports the existing Code 3 TCG SVG mark as Apple 180px, Android 192/512px, and maskable 512px PNGs. Brand configuration owns the icon paths and background. The Apple home-screen link uses PNG, and development and production now use the same manifest template. Existing artwork and legacy PNG files were preserved.

The final [source manifest](../artifacts/qa/production-release-2026-09-29/source-final.json) records 522 runtime/build files, digest `42521eb66d5005bc2942c019a9481a1da546bedb736c7efb7dfa44b22a4b75b8`. Relative to the Buy Offer baseline, only `index.html`, `public/manifest.webmanifest`, `src/config/brand.js`, and `vite.config.js` changed, plus the four new PNGs. The export script and focused branding tests are additional tooling changes outside that runtime manifest.

Deployment used the existing production environment and project settings. No environment variables, provider configuration, database schema, deployment protection, or authorization logic were changed. Vercel's dry upload inspection confirmed local environment files, QA artifacts, dependencies, and local build output were excluded.

## Fresh checks

| Check | Actual result |
| --- | --- |
| Local and Vercel production builds | Passed; existing large JavaScript chunk warning remains. |
| Source lint | 336 files, zero errors and warnings; changed brand module separately rechecked. |
| Backend TypeScript | Passed; also rebuilt by security suite. |
| Synthetic release security | 60/60 passed; memory repositories, synthetic identities, loopback HTTP. |
| Buy Offer | 23 domain checks and 14 route checks passed. |
| Existing navigation | 32 route-loading checks, menu contracts, and 49 legacy route compatibility checks passed. |
| Workspace | 87 UI assertions; 20 fixture cases / 117 assertions passed. |
| Accessibility contracts | Keyboard and reduced-motion contracts passed. |
| Branding / icons | Source and built metadata passed; actual development manifest equals built manifest; PNG dimensions, opacity, and maskable safe circle passed. |
| Local production browser | Six login/reset/signup navigation combinations: light/dark at 360, 875, and 1440px. Phone installation probe passed. |
| Live production browser | Same six login/reset/signup navigation combinations passed, with no horizontal overflow or page errors. No forms or credentials were submitted. |
| Live mobile installation | Manifest name and short name are Code 3 TCG; standalone display; correct root start URL/scope; all five referenced SVG/PNG assets load and decode; Chromium reports zero installation errors; service worker activated. |
| Live signed-out routes | Buy Offer and private owner record routes remain signed out even with `betaLocalMode=true`; developer access is not enabled. |
| Public API | `/api/health` returned HTTP 200 and `status: ok`. |
| Public version | `dpl_423RWsrNw4ZR1cTwNYM48KVnhMAJ-2026-09-29T17:39:22.514Z`; public domain resolves to the new deployment. |
| Whitespace | `git diff --check` passed; existing Windows LF/CRLF notices remain. |

Production was built using `vercel deploy --prod --skip-domain`, then published using `vercel promote` after local production browser verification and authenticated staged HTTP checks. Direct staged browser probes initially reached Vercel's protected login and timed out; they are not counted as passing. The authenticated Vercel CLI successfully checked staged HTML and manifest without disabling protection. All stated live browser checks ran after promotion against the public domain.

Fresh evidence is under [production-release-2026-09-29](../artifacts/qa/production-release-2026-09-29/). Previous proof directories were not overwritten.

## Screenshots

- [Live phone login](../artifacts/qa/production-release-2026-09-29/live-phone/phone-login.png)
- [Live light mobile](../artifacts/qa/production-release-2026-09-29/live-login/light-360.png)
- [Live dark desktop](../artifacts/qa/production-release-2026-09-29/live-login/dark-1440.png)

## Limits and observation

The new deployment's error-level runtime log query returned zero entries in the checked 30-minute window. This is an immediate post-release observation, not ongoing monitoring. Log-drain configuration was not assessed.

No physical iPhone/Android installation, real credential sign-in, two-account isolation, two-device sync, recovery cutover, live provider operations, or screen-reader session was verified. Existing [private beta acceptance gates](PRIVATE_BETA_ACCEPTANCE.md) remain open. The frontend has no separately configured type-check script. Broad 28-scenario and 30-theme/viewport checks were previously passed for the unchanged Buy Offer source; they were not rerun in this release.

Read-only release review noted that the inherited `qaUnlockPaid` query still affects client-side paid-feature gates. Owner authorization is separate; this publication did not change either mechanism. This remains a follow-up item before claiming billing enforcement is verified.

To install, open the public domain on the phone. On iPhone, use Safari Share → Add to Home Screen → Open as Web App → Add. On Android, use Chrome's installation menu. A previously installed Code 3 TCG shortcut may retain its old icon/name until the browser updates it; reopening the website allows the current app version to load. Full offline use and automatic transfer of computer-local records are not established by PWA installation.
