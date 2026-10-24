# Native beta package handoff — October 24, 2026

The current icon update uses the approved three-card emblem for PWA, Android and iOS install assets. Browser and native app identities are unchanged. Organization enrollment remains pending: the owner reports D‑U‑N‑S status **In-Progress**, submitted October 18. This is not store-submission approval.

## Package status and build numbers

- The previous Android APK/AAB evidence is **build 6**, dated October 18. Those files predate the current restock features and icons; do not distribute them as this release.
- New project defaults and build validation start at **7**. This is a floor, not an automatic reservation or proof of a unique number. Before each signed release, inspect the intended store console and set `CODE3_BUILD_NUMBER` explicitly to an unused number greater than all earlier distributed/uploaded builds. The release script requires an explicit value. Android rejects lower overrides; the iOS archive command passes the validated value to Xcode. Android uses increasing version codes to protect against downgrades. [Android versioning](https://developer.android.com/studio/publish/versioning).
- Local native runtime/export tests, public-configuration preflight fixture tests, deterministic icon export verification and an **account-free native web smoke build** passed. A subsequent configured native web build also passed with the existing validated public configuration, and its copied Android/iOS web assets match. All **4,729 bundled catalog objects and price fields** deep-equal preserved baseline `f54dfa287eb559ac892fb769e2fcee82ba7b891a`. This local bundle has no final Git-commit provenance and does not compile Java/Swift or certify either physical phone. Rebuild from the final committed source before package delivery.
- This Windows environment has no located Java/JDK, Android SDK/adb or Xcode toolchain. No tool installation, signing material, account creation, store upload or phone installation was performed. The full local preflight correctly remains incomplete because no fresh APK/AAB exists. The earlier smoke bundle was deliberately unconfigured for account sign-in and must not be distributed.
- A fresh isolated Chromium context verified the actual service worker upgrade from app cache v4 to v5, branded offline navigation/manifest, unchanged synthetic localStorage/IndexedDB bytes and retention of an unrelated cache. Full-viewport icon masks preserve all three cards, stars and orbit; the outer decorative frame may be masked. The standalone offline phone panel now includes border-box sizing so its padding fits a 390px viewport. These results do not prove an existing physical home-screen icon refreshed.

## Cloud checks without a personal Mac

The existing `Native beta build checks` workflow supports manual dispatch of `ios`, `android` or `all` with `build_number`. Select the reviewed final branch/commit. Do not rely on its historical push trigger to run the new branch. Capture the run URL and exact commit; verify its conclusion and artifact metadata before sharing anything.

All action references retain the existing v4 major and are pinned to immutable commits. The official repositories' `refs/tags/v4` were read directly through GitHub on October 24, 2026; no hash was inferred. Workflow permissions remain `contents: read`.

| Official v4 reference checked | Pinned commit |
| --- | --- |
| [actions/checkout](https://api.github.com/repos/actions/checkout/git/ref/tags/v4) | [`11d5960a326750d5838078e36cf38b85af677262`](https://github.com/actions/checkout/commit/11d5960a326750d5838078e36cf38b85af677262) |
| [actions/setup-node](https://api.github.com/repos/actions/setup-node/git/ref/tags/v4) | [`49933ea5288caeca8642d1e84afbd3f7d6820020`](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020) |
| [actions/setup-java](https://api.github.com/repos/actions/setup-java/git/ref/tags/v4) | [`cf277c60eb25467037889841efdb72551f06f6c3`](https://github.com/actions/setup-java/commit/cf277c60eb25467037889841efdb72551f06f6c3) |
| [actions/upload-artifact](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v4) | [`ea165f8d65b6e75b540449e92b4886f43607fa02`](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02) |

The iOS job uses GitHub's Mac runner, builds an account-free simulator bundle, and compiles/launches a new empty simulator with signing disabled. Its `.app` is **not an IPA, TestFlight build or installable iPhone package**. The job requires no Apple credentials. The current Capacitor 8 guide calls for Node 22+, Xcode 26+ on macOS, and Android Studio 2025.2.1+ plus an SDK for Android; this repository uses Node 24 and Java 21 in its cloud workflow. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

The Android job reads exactly two **public repository variable names**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The coordinator verified both names in Actions settings and populated them from the existing production **public** frontend configuration after checking the anon role/project match. No server secret was retrieved. No service-role, secret key or signing credential belongs there. The configured builder rejects missing/private-key forms; the final cloud run must still verify the intended commit and artifacts.

The Android artifact contains `Code3TCG-debug.apk`, `web-build.json`, this README and `SHA256SUMS.txt`. Check the workflow run's exact commit, recorded build number, configured-versus-smoke mode and APK checksum. A checksum establishes file identity, not signature compatibility or phone acceptance.

## Preserve existing installations

**A fresh GitHub runner's debug certificate is temporary. This APK is not a verified upgrade over an existing native install and is not for Play upload.** Updates depend on compatible app-signing identity; an upload certificate is distinct from the certificate used for Play-delivered APKs. [Android signing](https://developer.android.com/studio/publish/app-signing).

Keep the existing PWA/browser and its data. If a native installation already exists, first verify a private transfer export/cloud comparison and inspect both packages' public signing certificates and application IDs. Stop on a mismatch. **Do not uninstall or clear storage to bypass it.** Do not change the application ID to evade the check. A disposable phone/profile with no existing native installation can test a debug artifact after account-service gates are verified. Existing-account comparisons remain read-only; synthetic write tests belong to disposable test accounts.

## Signed beta delivery gates

For Google Play: finish the intended developer account, preserve the owner's existing upload key, choose an explicit unused build number, build/verify an upload-signed AAB, configure Play App Signing, and publish an internal-test release to the selected testers. A raw AAB is not a tap-to-install phone file. The current debug workflow does not sign or upload a Play release. [Google Play internal testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

For iPhone: finish LLC enrollment and App Store Connect, confirm `app.code3tcg.mobile` and the team, provision protected signing on an authorized Mac runner, build a configured archive/IPA, verify signing and upload, then deliver a TestFlight invitation after processing and any required beta review. A personal Mac is not required when the authorized cloud runner provides macOS/Xcode. Apple requires Developer Program membership for TestFlight distribution; signed distribution and the current simulator job are separate. [Apple beta distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases), [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## Acceptance on both physical phones

The following remain unverified until the owner/operator records the actual device model, OS, delivered build, result and safe evidence:

1. Home-screen icon after browser/OS refresh, native launcher masking, safe areas, text size and keyboard/Back behavior. Browser mask previews do not prove an existing home-screen shortcut refreshed.
2. Same-account sign-in, force-close/reopen, email callback/recovery, account switching and private photo access. Preserve web redirects; verify the exact existing native callback and API-origin gates from [Phone test quickstart](./PHONE_TEST_QUICKSTART.md).
3. Screenshot → review → restock save → reopen → edit/photo → computer sync → reverse sync using disposable test data; deny/cancel permissions, disconnect/reconnect and review conflicts. Never publish synthetic reports to the production community to exercise a button.
4. Existing-account transfer comparison by stable IDs, content and photo bytes; check live market-price source/time without importing or replacing prices. A packaged catalog is a build snapshot.
5. Actual file export/cancel behavior, accessibility, privacy/support reachability, and staged disposable-account deletion. Native CORS, account deletion and attachment privacy have separate rollout gates; passing a web smoke test does not enable them.

Keep both original copies whenever a comparison differs. Do not use a reset, reinstall or destructive recovery as a test shortcut.
