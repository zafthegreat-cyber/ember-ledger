# Android build 3 — final privacy-policy package

Historical evidence: [build 4](./ANDROID_BUILD_4_2026-10-18.md) supersedes this package with the public-listing location correction. Build 3 packages/evidence are preserved under `artifacts/native/build3-archive`; top-level package filenames now refer to build 4.

Built locally October 18, 2026 from `codex/all-bot-integration-setup`, base commit `986e831`, plus the final local privacy/support changes including `src/config/privacyPolicy.js`. Version **1.0.0**, build **3**, application ID `app.code3tcg.mobile`, minimum Android API 24, target API 36. This refresh did not commit, push, deploy, upload to a store, access account data or alter prices.

| Package | SHA-256 |
| --- | --- |
| `artifacts/native/build3-archive/Code3TCG-debug.apk` | `cdb09a04525aa4635c14f9e2b26964a26670f724078f7d5b627a19b1c24b0e2d` |
| `artifacts/native/build3-archive/Code3TCG-beta.aab` | `f635c5a9bedc2e15bcd71c23c72501cd2ef2996159586735eb96963c2319ce1b` |

The APK is debug-signed for direct Android testing; the upload-signed AAB is for a future Play upload and is not directly installable. The existing upload key was reused through the helper's **`-Build`** path, with no initialization. Its certificate SHA-256 remains `79:A2:A7:43:31:4B:1A:A6:AF:05:AC:B0:13:5E:7C:01:F9:A7:FD:71:EC:7C:5B:9F:23:F7:04:BF:C6:01:C9:1A`.

Build 2 packages and evidence were copied to `artifacts/native/build2-archive` first, and both copied hashes matched their recorded values. Build 1 remains in `artifacts/native/build1-archive`.

## Actual results

- Configured native web build and Android sync passed. Release `bundleRelease` passed **228 Gradle tasks**, including release lint. Debug `assembleDebug testDebugUnitTest` passed **199 tasks**. The generated unit example does not establish functional-device acceptance.
- Both package manifests report build **3**. AAB `jarsigner` verification passed; a separate full-entry verifier checked **623 payload entries** against the expected certificate and found no duplicate/missing ZIP entries. Bundletool **1.18.3** validation exited 0. Debug APK `apksigner` verification passed.
- All **175 generated web assets** byte-match the packaged files inside **both** APK and AAB. The source privacy-policy SHA-256 is recorded with the release metadata.
- Native **19** behavior scenarios and the App export regression passed; **30** privacy-support checks passed; frontend build and `lint:src` passed. The local phone preflight reports **zero failed automated checks**, with manual/hosted/device rows still unverified.
- iOS platform sync passed and contains matching configured web assets. Its SPM package still uses relative `../../../node_modules/...` paths; sync introduced no absolute Windows paths or substantive generated Gradle/SPM changes. **Build 3 has not been compiled or signed for iOS.** Earlier iPhone simulator evidence applies to the prior account-free cloud build.

Non-failing warnings remain for the large App chunk, the already statically imported Supabase client's dynamic import, Babel large-source styling, Gradle deprecations, and the privacy-support test's existing module-type warning.

Archived machine-readable evidence: `artifacts/native/build3-archive/release-verification.json`, `package-web-assets-build3.json`, and `phone-preflight-build3.json` in that same directory. The release report lists the specific `*-build3.log` files. These generated artifacts are local and ignored by Git.

## Remaining gates

The most recent hosted OPTIONS evidence remains `hosted-options-build2.json`: `/api/auth/session` returned 403 with no allowed-origin header for both native origins, and `/api/account/deletion/status` returned 204 without that header. This refresh did not repeat or change those hosted settings. The reviewed backend/native-origin activation and exact Supabase callback allowlist must be verified before account testing.

Hosted deletion/private-receipt rollout, real-account/attachment continuity, email callbacks, native sharing/permissions, both physical phones and store-track upgrades remain separate acceptance work. Signed TestFlight delivery still requires Apple enrollment and protected distribution signing. Follow the [phone quickstart](./PHONE_TEST_QUICKSTART.md) and keep the existing PWA and verified transfer files.
