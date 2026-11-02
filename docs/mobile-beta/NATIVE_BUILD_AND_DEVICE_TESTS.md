# Native beta build and device verification

**October 24 status:** build 7 Android debug compilation and unsigned iPhone simulator compilation/launch passed in [cloud run 40121840615](https://github.com/zafthegreat-cyber/ember-ledger/actions/runs/40121840615). Both exact native API origins pass public CORS checks. The production privacy migrations are installed and receipt storage is private. An approved server key is stored only as a Vercel Production Secret; subsequent deployments receive it, while account deletion remains disabled pending authenticated service acceptance. See [current privacy readiness](PRIVACY_READINESS_2026-10-24.md). Developer enrollment, signed store distribution and physical phone acceptance remain outstanding; phone testing is paused at the owner's request. The October 18 evidence below is historical.

Updated 2026-10-18. Run commands from the repository root. This runbook describes the local native implementation; it does not claim a store upload, successful physical-device test, or a production configuration change.

For the owner's Android/iPhone handoff, the no-Mac TestFlight path and a fill-in physical test record, use [Phone test quickstart](./PHONE_TEST_QUICKSTART.md). Run `node scripts/native-phone-preflight.mjs` against existing artifacts before distribution; add `--hosted` only for the documented read-only public endpoint probes. Passing automated checks never marks the manual/device rows complete.

The configured Android packages were refreshed as **build 4** after the privacy updates and removal of private-location defaults from new public listings. Signatures, manifests, bundle validation and all 175 packaged web assets passed verification; builds 1–3 are preserved separately. See [build 4 evidence](./ANDROID_BUILD_4_2026-10-18.md). The most recent read-only hosted check found native origins are not yet allowed on the production API, so account testing remains gated on that deployment/configuration. iOS assets were synchronized, but this refresh did not compile/sign an iPhone build.

## Current evidence

| Check | Evidence | Remaining gate |
| --- | --- | --- |
| Android compilation | `assembleDebug testDebugUnitTest` completed successfully, including compilation of the custom Java secure-session plugin; 199 Gradle tasks. | The generated example unit test does not verify native behavior. No phone appeared in `adb devices` during this check. |
| Android release | Final signed AAB build completed with 228 Gradle tasks; `jarsigner` verified the signature, all 623 payload entries matched the upload certificate, and bundletool 1.18.3 validation exited 0. Local upload-key/password storage uses ACL and DPAPI protection. Artifact hashes are in `artifacts/native/release-verification.json`. | Preserve portable key recovery and test the actual delivered build. No Play upload occurred. |
| iOS project | First GitHub Mac build passed using Xcode 26.6. The unsigned app installed/launched on a disposable iPhone 17/iOS 26.5 simulator, survived the five-second check, and rendered the sign-in screen. [Evidence](./FIRST_IOS_CLOUD_BUILD_2026-10-18.md). | Configure signed archive/TestFlight distribution after enrollment, then run actual account/device tests. Account services were deliberately unconfigured in the simulator smoke run. |
| JavaScript native lifecycle | 19 behavior scenarios plus the App export data-source test pass: API destination, callback validation/deduplication, cancellation, refresh, Back dispatch, storage delegation and export behavior. Native OS bridges are mocked. | Mocks cannot prove OS permission dialogs, Keychain/Keystore behavior, actual app-link delivery or file sharing. |
| CORS and existing API client | 5 native-origin/authentication tests plus 7 unchanged legacy API client tests pass; backend TypeScript build passes. | Deploy the reviewed backend and explicitly activate its native-origin flag before testing protected production APIs. |
| Transfer/recovery | 15 transfer cases pass, alongside 23 existing workspace-recovery, 20 cloud-sync and 15 cloud-backup checks; existing backup check covers 22 sections/34 synthetic records. | Compare the real original-device export against each signed-in native device before accepting the handoff. |
| Transfer UI | Chromium at 320, 390 and 1440 pixels in both themes passed actual export/file comparison/recovery previews, password gates, no comparison writes, keyboard focus, 44px controls, no overflow, and text contrast checks in the actual `CloudSyncPanel` wrapper. | These are browser fixtures with synthetic account context, not native screenshots or verification of the owner's account. Evidence: `artifacts/qa/mobile-beta/device-transfer/`. |
| Store distribution | No store upload or submission was performed. | Verified Apple/Google developer accounts, owner-controlled signing, account-deletion rollout, store declarations and device acceptance. |

The owner has an iPhone and an Android phone. Device availability is not a test result. The final release operator should append the exact build number, Git revision, artifact hash, signing-certificate fingerprint and device/OS results to this document or its release report.

## Configuration and toolchain

The native app identifier is `app.code3tcg.mobile`, with display name **Code 3 TCG**. Confirm this identifier under the owner's store accounts before the first store record is created. Native builds bundle `dist-native`; there is no remote `server.url`. Android uses `https://localhost`, and iOS uses `capacitor://localhost` for the local WebView. The native-only HTML uses `viewport-fit=contain` with native system-bar inset handling, and Android enables edge-to-edge through AndroidX. This keeps existing fixed controls within the available native viewport; keyboard, rotation and safe-area behavior still require device acceptance. Website viewport behavior is unchanged.

The repository uses Capacitor 8.5.3. Use Node 24, JDK 21, Android SDK platform 36 and compatible Android build tools. The wrapper pins Gradle 8.14.3 and Android Gradle Plugin 8.13.0; minimum Android API is 24 and target API is 36. iOS builds require macOS and Xcode 26 or later. Check the selected Xcode version and SDK before each upload against current store requirements. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

Set the following **public** settings in ignored `.env.native.local`, or provide them as environment variables:

```dotenv
VITE_SUPABASE_URL=https://YOUR_EXISTING_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_EXISTING_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

Use the same project as the existing account and records. These values are embedded in the app. A service-role key, `sb_secret_` key, mailbox password, signing password or owner credential must never enter any `VITE_` variable or native bundle. The build script rejects service-role/secret keys and missing public configuration. Do not copy an entire server environment file into the native build.

The native builder forces `https://code3tcg.app` as the API/public destination and disables local/demo authentication flags. It does not create a new database, replace existing data, or run price imports. Public settings do not establish permission to bypass account/owner checks.

```sh
npm ci
npm run test:native
npm run native:build
npm run native:sync
```

`npm run native:build:smoke` is only a configuration/compilation smoke path: account services are deliberately blank. Never distribute that bundle or call it an account-ready build. A normal build writes `artifacts/native/web-build.json`; its flags describe the web bundle, not a later signed binary.

## Native account links and hosted API activation

In the existing Supabase project's **Authentication → URL Configuration → Redirect URLs**, add these two app redirects while retaining the existing website redirects and Site URL:

```text
code3tcg://auth/callback?flow=signin
code3tcg://auth/callback?flow=recovery
```

Do not add a broad `code3tcg://**` wildcard. The app accepts only its exact scheme/host/path, approved query fields and a PKCE authorization code. The initiating installation retains the verifier in secure session storage; a link requested on another device should not be treated as proof that this installation owns the account. Request a fresh link inside the native app for native verification. Supabase supports mobile deep links and requires the requested redirect to match the configured allowlist. Existing custom email templates must preserve the requested redirect rather than hard-code the website. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

The reviewed backend must be deployed with this **server-only** environment setting before protected native calls can succeed:

```dotenv
CODE3_NATIVE_CLIENT_ENABLED=true
```

It adds only `capacitor://localhost` and `https://localhost` to the selected runtime's existing exact-origin policy. Keep production/preview web allowlists distinct. Do not allow arbitrary origins, `null`, local development auth headers or wildcard credentials. Native requests still require verified bearer authentication and all existing account/owner permissions. A successful CORS preflight is not an authentication test.

Neither the Supabase redirect change nor the production flag was applied by these local tests. Verify sign-in, confirmation and recovery end to end after controlled activation. Treat wrong-device, expired, repeated and malformed links as negative tests; never log token/code values or capture them in screenshots.

Account deletion has separate migration, staging, provider-retention and feature-flag requirements. Follow [Account deletion rollout](./ACCOUNT_DELETION_ROLLOUT.md); native CORS activation must not implicitly activate deletion.

That rollout also documents a read-only production metadata finding: the receipt bucket is currently public. The authenticated private-attachment resolver must be staged and released before applying `20261024234513_code3_private_attachment_reads.sql`. Verify current owners retain access and former public URLs reject anonymous requests; preserve every existing object/path and record reference. This production privacy work is not complete merely because the local migration and synthetic tests pass.

## Android debug and signed release

Set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to the intended Android SDK. Keep a machine-specific `android/local.properties` ignored. Build from current source before synchronizing assets:

```powershell
npm run native:build
npx cap sync android
Push-Location android
.\gradlew.bat assembleDebug testDebugUnitTest
Pop-Location
```

On macOS/Linux use `./gradlew` from `android` instead. The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`; it is not a Google Play upload artifact. `npm run native:android` opens the project in Android Studio. Inspect the connected device with `adb devices`, then install only on the selected test device:

```powershell
adb -s DEVICE_SERIAL install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Stop on a signature mismatch. The debug and release builds currently share `app.code3tcg.mobile` but may have different certificates, including Google's eventual app-signing certificate. An incompatible install cannot preserve the same installation's local data through `-r`. **Do not uninstall, clear app data or change identifiers to bypass the error until a transfer export and matching cloud/backup copy are verified.** Retain the original PWA and its storage. Do not install two scheme-conflicting variants and assume recovery links choose the intended app.

For a release, supply the owner's intended upload keystore and these values through the current process environment or a controlled CI secret store:

| Variable | Value |
| --- | --- |
| `CODE3_ANDROID_KEYSTORE` | Absolute path to the private upload keystore |
| `CODE3_ANDROID_STORE_PASSWORD` | Keystore password |
| `CODE3_ANDROID_KEY_ALIAS` | Owner's upload-key alias |
| `CODE3_ANDROID_KEY_PASSWORD` | Key password |
| `CODE3_BUILD_NUMBER` | New positive integer, greater than earlier uploaded builds |
| `CODE3_VERSION_NAME` | Optional human-readable Android version; default `1.0.0` |

Do not type passwords into chat, checked-in files, shell history or command-line arguments. Keep a recoverable, owner-controlled copy of the upload key and its password separately from distributable build artifacts. If a key must be generated, check for an existing intended key first, use environment-based password arguments and record only public certificate metadata in the report. Losing an ephemeral random password after a process exits is not a signing setup.

```sh
npm run native:android:release
```

The script rebuilds, syncs Android and invokes `bundleRelease`; missing signing values fail closed. Expected output: `android/app/build/outputs/bundle/release/app-release.aab`. Verify the bundle signature/certificate and build number before uploading through the verified owner's Play Console. The script does not upload. Google Play installation and update behavior must be tested again on the delivered track build.

The local Windows helper `scripts/native-android-signing.ps1` requires PowerShell 7.2 or newer and supports one-time `-Initialize` and subsequent `-Build` with `CODE3_BUILD_NUMBER` supplied. It refuses to replace existing signing material, restricts its ignored `artifacts/native-signing-private/` directory to the current Windows user and SYSTEM, and stores the password in a DPAPI-protected credential file. Its `keytool` arguments read passwords from environment variables. The DPAPI file is tied to this Windows account and is **not a portable backup**; move key/password recovery into the owner's password manager before store publishing. Never include that private directory in a shared artifact bundle. The final reviewed AAB compiled, including Android release lint, and its verified hash is recorded in the [implementation report](./IMPLEMENTATION_REPORT_2026-10-18.md). Rebuild and reverify if source changes before distribution.

## iOS build and signed export

On the Mac, install the repository dependencies, configure only the public native variables above and select the intended Xcode:

```sh
xcodebuild -version
npm ci
npm run native:build
npx cap sync ios
npm run native:ios
```

An unsigned simulator compilation checks project integration without creating a TestFlight package:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -derivedDataPath artifacts/native/ios-simulator CODE_SIGNING_ALLOWED=NO build
```

For a store export, install the owner's **Apple Distribution** certificate/private key in the Mac's signing keychain and the matching App Store provisioning profile for `app.code3tcg.mobile`. Supply `CODE3_APPLE_TEAM_ID` (10-character team ID), `CODE3_IOS_PROFILE_NAME` and a new positive `CODE3_BUILD_NUMBER` through the environment, then run:

```sh
npm run native:ios:release
```

The script uses manual signing and produces `artifacts/native/ios/Code3TCG.xcarchive` plus `artifacts/native/ios/export/`. The generated export-options plist contains team/profile identifiers, not certificate passwords. Confirm the archive's bundle ID, version/build number, distribution signature and capabilities before an owner-authorized TestFlight upload. A simulator `.app` is not installable through TestFlight. This Windows environment cannot compile/sign an iOS archive; developer-account enrollment and Mac access remain external requirements.

The GitHub workflow `.github/workflows/native-beta-checks.yml` runs the iOS smoke check on relevant pushes to `codex/all-bot-integration-setup`, without merging to the production branch. Manual runs can select iOS, Android or both once GitHub registers the workflow on the default branch. Android requires the public repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; the iOS smoke path deliberately clears account configuration and needs no signing/account secrets. Artifacts expire after seven days. No step publishes to either app store or runs a database migration.

### Cloud Mac route

The owner confirmed no Mac on 2026-10-18 and authorized committing/pushing the native work and running the first iOS cloud build. Use the existing repository's GitHub Actions `macos-26` runner with Xcode. The smoke script creates a separate empty iPhone simulator, compiles for that destination, installs/launches the unsigned app, checks that its process survives five seconds, captures a screenshot, and archives the simulator app with its executable permissions. It removes only the simulator it created. The run has bounded command/job timeouts and records explicit untested fields in `result.json`. This is an account-free compile/launch check, not UI workflow assertions or physical-device verification. [GitHub hosted macOS runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

After Apple organization enrollment is active, an authorized signed-release workflow can import the owner's distribution certificate and matching profile into a temporary runner keychain, execute the existing iOS release script, and upload an approved build to App Store Connect. Keep signing inputs in protected GitHub secrets, restrict the release environment/branch, and keep private material out of logs/artifacts. GitHub documents this certificate/keychain approach; the current unsigned workflow does not yet implement signed release or upload. [Signing on macOS runners](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).

TestFlight then delivers the signed app to the owner's iPhone without a USB connection to a personal Mac. Apple Developer Program membership and App Store Connect setup are required for that distribution path. Simulator compilation is useful while enrollment is pending, but cannot replace actual camera, location, file-sharing, secure-session and sync tests on the iPhone. [Apple beta distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).

Repository metadata confirms `zafthegreat-cyber/ember-ledger` is public; standard GitHub-hosted runners are free for public repositories. Private-repository runs instead consume the owner's allowance and may incur charges beyond it. No paid quota increase is part of this work. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Preserve data during the device handoff

1. On the original browser/PWA, review **Settings → Cloud saving & recovery**. Resolve any reported conflict using the preserved-version review flow. Keep the original storage and downloaded backups. Record the confirmed-save time, account identity and relevant record counts without exposing private contents.
2. Use **Move to a new device → Save transfer file** with cloud records/attachments included. Keep the verified file in an owner-controlled location outside the app. The file may contain private records and attachment bytes; it does not include authentication credentials. Check any coverage warnings and preserve separately referenced files and unfinished session drafts.
3. Install the appropriate native build and sign into the **same account**. Let cloud loading finish before making changes. An empty new installation must load or review existing cloud state, not publish an empty replacement. If ownership or conflicts block loading, stop and review; do not reset storage.
4. Compare the transfer file on the native device. Check matching IDs/content and attachment hashes, missing records, different versions and extra native records. Equal counts alone do not prove continuity. The comparison does not import, delete or resolve conflicts.
5. If records are missing, open **Review recovery options**, select the same file and inspect the relevant device or cloud preview. Existing recovery adds missing records after account/password confirmation and preserves current versions. Do not apply an owner's real recovery merely to test the feature. Use synthetic accounts for destructive/error-path acceptance.
6. Open representative restock photos, collection items, wants, purchases, orders and enabled Bot records. Generic cloud workspace snapshots already include registered Bot Operations and Purchase/Receiving data; unsaved session drafts and some attachment references need separate attention. Keep the original PWA until both devices' records and files are checked.
7. Make one clearly labeled synthetic test record on the test account, confirm it arrives on the other device, edit it offline, reconnect and review any conflict. Check both directions. Do not manufacture edits in the owner's real collection just to prove a timestamp changed.

Transfer, device/cloud/history/conflict backups, Account Ops backups, private-file backups and diagnostic review reports use the shared native export helper with a temporary private-cache file. Choose a save target and confirm the file exists outside the app before treating it as a backup. Cancellation is not a saved backup. Account/lifetime cancellation is checked before sharing; a file prepared before a cancelled share is removed without opening the sheet. After an opened sheet, cleanup is scheduled; OS termination can delay it until cache eviction. Browser downloads retain their existing file behavior. Every export path, including the app's separate CSV/report exports, **still needs physical native verification**; one successful file share does not prove the rest.

## Physical acceptance record

Use fresh synthetic test accounts for recovery, session revocation, account switching and deletion failure tests. Never delete the owner's account, clear their browser/app storage, or overwrite their prices. Run every row on both the iPhone and Android phone. Record model, OS, native build, result and screenshot/recording reference; leave unrun rows unverified.

| Area | Steps and acceptance |
| --- | --- |
| Launch/session | Signed-out cold launch, sign in, background/resume, force-close/reopen and expired-session retry. No permanent loading screen; correct account and secure-session behavior. |
| Account links | Request confirmation/password recovery inside this installation; open with app closed and open. Verify recovery routing, single-use behavior and clear failure for expired/wrong-device links. Do not reuse actual bearer tokens in tests. |
| Account isolation | Sign out synthetic A and sign in synthetic B. A's drafts/records must not be claimed or uploaded as B. Verify local owner preservation and cloud permissions. |
| Data continuity | Follow the transfer steps above; verify IDs/content and representative attachment bytes on both devices, then safe additive recovery using synthetic missing records. |
| Offline/conflicts | Airplane mode, read existing data, synthetic edits, reconnect; preserve originals and review conflicts. Retry must not discard offline records or replace populated cloud with empty state. |
| Restocks | Find a nearby store, search/filter, report stock and attach a photo using a synthetic/test destination. Check location allow/deny, manual-location fallback, camera allow/deny, image chooser cancellation and retry. No accidental public synthetic report. |
| Collection/prices | Search/add/view a synthetic item and purchase; check artwork, full detail/Back and current online price precedence. Disconnect and confirm stale/source labels remain readable. Bundled prices are only a build snapshot. |
| Files | Native transfer save/cancel/reopen/compare; device and cloud backups, CSV exports and conflict-version downloads each independently. Verify exported content and file access after backgrounding. |
| Navigation | Android Back closes the active dialog before route navigation; unsaved forms keep their confirmation. Test menus, safe areas, keyboard, rotation and long pages on both platforms. |
| Accessibility | Light/dark and system theme changes, large text, TalkBack/VoiceOver labels/order, focus restoration, touch targets and modal escape/dismissal. Capture native screenshots, not browser fixture screenshots. |
| Privacy/deletion | Public privacy/support/deletion resource opens without account access. On staging, use disposable account/attachments to test typed/password confirmation, cancellation, pending retry and completed deletion. Follow the separate rollout requirements. |
| Updates | Upgrade an already populated installation using the intended signing identity and store track; verify account, local drafts, cloud records, photos and latest online prices remain. Do not uninstall to simulate a successful upgrade. |

## Repeatable local checks

These tests use synthetic data. Browser tests require a disposable local Vite server; their network guards block external and mutating requests.

```sh
node scripts/test-native-phone-preflight.mjs
node scripts/native-phone-preflight.mjs
npm run test:native
npm run test:device-transfer
npm run test:workspace-recovery
npm run test:cloud-workspace-sync
npm run test:legacy-cloud-backup
npm run test:code3-backup
npm --prefix backend ci
npm --prefix backend run build
node --experimental-vm-modules --test --test-isolation=none backend/test/nativeCors.test.mjs backend/test/legacyApiClient.test.mjs
```

In a separate terminal, start `npm run dev -- --host 127.0.0.1 --port 5252 --strictPort`, then run `npm run test:device-transfer-browser`. Check the separate privacy/deletion report and the release's full build/lint/regression results. A passing automated check does not fill an unperformed physical-device or store-account gate.
