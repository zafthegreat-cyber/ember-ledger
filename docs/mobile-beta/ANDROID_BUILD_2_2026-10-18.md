# Android build 2 verification

Historical evidence: [build 3](./ANDROID_BUILD_3_2026-10-18.md) supersedes this package with the final privacy-policy wording. Build 2 packages and evidence are preserved under `artifacts/native/build2-archive`; the top-level package filenames now refer to build 3.

Built locally on October 18, 2026 from `codex/all-bot-integration-setup`, base commit `986e831`, plus the completed local privacy/support UI changes. These packages are version **1.0.0**, build **2**, application ID `app.code3tcg.mobile`. No commit, push, store upload, production deployment, account operation or price update was performed for this refresh.

## Package evidence

| Package | SHA-256 | Purpose |
| --- | --- | --- |
| `artifacts/native/build2-archive/Code3TCG-debug.apk` | `2a48f45998e0977a96d0c3ac4530a720f6b03f24906f87b06d701c645a814c2c` | Direct Android device testing; debug-signed, not a Play upload. |
| `artifacts/native/build2-archive/Code3TCG-beta.aab` | `94bba38dbd4e94a103d2bdcad8839c64d62a10f0fac64b31891899ee66ff0827` | Upload-signed Android bundle; not uploaded and not directly installable. |

Build 1 APK, AAB, hash/signature records and final logs were copied to `artifacts/native/build1-archive` before replacement. Both archived package hashes matched the original verification report. Existing signing material was reused through `scripts/native-android-signing.ps1 -Build`; initialization was not invoked. Upload certificate SHA-256 remains `79:A2:A7:43:31:4B:1A:A6:AF:05:AC:B0:13:5E:7C:01:F9:A7:FD:71:EC:7C:5B:9F:23:F7:04:BF:C6:01:C9:1A`.

## Completed checks

- Configured native web build and Android platform sync passed. Both package manifests report `versionCode=2`, `versionName=1.0.0`, package `app.code3tcg.mobile`, target SDK 36.
- Release `bundleRelease` passed with 228 Gradle tasks, including release lint. Debug `assembleDebug testDebugUnitTest` passed with 199 tasks. The generated unit test is not a physical-device functional test.
- `jarsigner` verified the AAB. A separate verifier read every entry and confirmed all **623 payload entries** have the expected upload certificate, with no duplicate or missing ZIP entries. Bundletool **1.18.3** `validate` exited 0.
- Android `apksigner verify --verbose --print-certs` passed for the debug APK.
- All **175 current web assets** byte-match the corresponding contents inside **both** the APK and AAB.
- Native runtime **19 behavior scenarios** and the App export regression passed. Frontend `lint:src` and `build` passed. Eight phone-preflight scenarios and focused script ESLint passed. The final local phone preflight reports zero automated failures.
- iOS platform sync copied the same configured web assets into the local iOS project. **This refresh did not compile or sign iOS.** The earlier cloud simulator compilation remains separate evidence for the prior account-free build.

Non-failing warnings remain: the large App bundle/chunk warning, an ineffective dynamic import of the already statically imported Supabase client, Babel's large-source styling note, and Gradle 9 compatibility/deprecation notices. These do not represent device acceptance.

Machine-readable build 2 evidence: `artifacts/native/build2-archive/release-verification.json`, `package-web-assets-build2.json`, and `phone-preflight-build2.json` in the same archive directory. That archived release report lists the specific `*-build2.log` verification logs.

## Hosted/native and phone gates

A read-only OPTIONS probe reached the production host after sandboxed network attempts failed. For both `capacitor://localhost` and `https://localhost`, `/api/auth/session` returned 403 without `Access-Control-Allow-Origin`; `/api/account/deletion/status` returned 204 without that header. Native protected API access is **not ready** until the reviewed deployment and native-origin configuration are activated. OPTIONS used no bearer token, cookies, account identifier or body; no account data was accessed or changed. See `artifacts/native/hosted-options-build2.json`.

Physical Android/iPhone tests, real-account continuity, provider-backed deletion, authenticated private receipts, native email callbacks and store-track upgrades remain unverified. Apple enrollment and a signed TestFlight distribution build remain required for the iPhone. Use the [phone test quickstart](./PHONE_TEST_QUICKSTART.md); keep the original PWA and verified transfer files.
