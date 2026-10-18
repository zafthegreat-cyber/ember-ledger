# Testing Code 3 TCG on the Android phone and iPhone

Updated October 18, 2026. Keep using the existing PWA while these checks are completed. Installing a native app creates separate device storage; it does not automatically copy browser drafts or prove that every photo transferred.

The newer local restock/menu UI upgrades are not included in Android build 6 or the last synchronized iOS assets. Rebuild and reverify the native packages after the final client changes before testing or distributing that newer UI.

## What is ready now

| Item | Actual status |
| --- | --- |
| Android test APK | Refreshed as version 1.0.0, build 6 with the final privacy/support UI, policy wording and visible-branding rename. APK signature, manifest version and all 176 packaged web assets verified. [Build evidence](./ANDROID_BUILD_6_2026-10-18.md). |
| Android Play bundle | Build 6 upload-signed AAB built and validated using the existing upload key. An AAB cannot be installed by tapping it on a phone; no Play upload has occurred. |
| iPhone compile/launch | Passed on a GitHub Mac with an empty iPhone simulator. That account-free `.app` is **not** installable on the physical iPhone. |
| iPhone delivery | Pending Apple enrollment, distribution signing and TestFlight delivery. A personal Mac is not required for the planned GitHub Mac build, but the current workflow only creates an unsigned simulator app. |
| Hosted privacy/deletion | Passed 67 checks using real Supabase Auth/Storage and the deletion API in an isolated test branch. Production HTTPS/native CORS, deployed UI, activation and physical-phone checks remain pending. [Acceptance evidence and limits](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md). |
| Existing account/record continuity | Requires the comparison below on both physical phones. No real account or existing record was accessed by the readiness script. |

## Run the preflight before giving someone a package

From the repository root:

```sh
node scripts/test-native-phone-preflight.mjs
node scripts/native-phone-preflight.mjs
node --use-system-ca scripts/native-phone-preflight.mjs --hosted
```

The first command uses synthetic fixtures only. The second reads the existing build, copied assets and package verification record; it does not rebuild, install, sign in or write app data. It checks public-key type, configured-versus-smoke build, actual bundled public configuration, native origins, copied-asset hashes, source timestamps, callback registrations and recorded APK/AAB hashes. It does not print keys or read a signing keystore. Add `--json` for a shareable machine-readable report.

`--hosted` additionally sends only OPTIONS and unauthenticated GET requests to the two protected endpoints on `https://code3tcg.app`. Redirects are not followed; no cookies, bearer token, password, account ID or request body is supplied. It expects exact-origin CORS and a JSON 401. It does not call account creation, deletion, recovery or pricing operations. A connectivity failure leaves the hosted result unverified; do not infer a server defect from a blocked local network. Keep certificate checking enabled.

Exit code 1 means at least one automated check failed. Exit code 0 means those automated checks passed; **manual/unverified rows still remain**, including hosted redirect settings, signing/distribution, private attachments, real accounts and physical-device acceptance. Source timestamp checks are conservative and do not replace source/build provenance. Recorded artifact hashes establish that package bytes have not changed; they do not prove an old package contains newer source changes. Rebuild and regenerate signature/hash evidence after the final application changes.

The final October 18 build-6 local run passed every automated local check, including configured public account settings, synced Android/iOS asset equality, source callback registrations, source timestamps and current recorded APK/AAB hashes. The refreshed packages include the final privacy/support UI, policy wording and the fix that prevents a new public listing from defaulting to a saved private home/GPS location. Existing listings and draft values are preserved. Builds 1–5, with their verification evidence, remain in their `artifacts/native/buildN-archive` directories.

Sandboxed Node/PowerShell probes could not reach the host. A separately approved read-only PowerShell probe succeeded outside the sandbox: `/api/auth/session` returned **403 with no allowed-origin header** for both native origins; `/api/account/deletion/status` returned **204 with no allowed-origin header** for both. Native CORS is therefore **not ready on the production host**. No authenticated call or response body was used. Evidence: `artifacts/native/hosted-options-build2.json`.

## Hosted gates before account testing

The release operator must verify the intended Supabase project is the one holding the existing accounts and records. Public-key syntax and a matching bundled value do not establish that project choice. Keep the existing website Site URL and add these requested native redirects to the same project's Auth URL configuration:

```text
code3tcg://auth/callback?flow=signin
code3tcg://auth/callback?flow=recovery
```

Preserve existing web redirects. Verify confirmation/recovery email templates honor the requested redirect. Do not replace the website URL with the native scheme or broaden the native allowlist to every path. Supabase documents the allowlist and email-template relationship in its [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

The reviewed backend must be deployed with server-only `CODE3_NATIVE_CLIENT_ENABLED=true`, enabling only `capacitor://localhost` for iOS and `https://localhost` for Android. Bearer authentication and existing permissions remain required. Check both `/api/auth/session` and `/api/account/deletion/status`; a successful preflight is not an authenticated sync or deletion test.

The [hosted deletion acceptance run](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md) passed 67 checks through a loopback Express HTTP server backed by real hosted Supabase Auth, PostgREST and Storage. It verified password-confirmed deletion, failure/retry behavior, session invalidation, private attachment access and preservation of another synthetic account. All four successful-run accounts were deleted through the service; the temporary branch and both restricted local test-key files were then removed. It made no production or shared-price writes. That completed test does not establish production HTTPS/native CORS, deployed UI or physical-phone behavior, and the branch is no longer available as a test target.

Native API requests are deliberately fixed to `https://code3tcg.app`. Changing `.env.native.local` to a staging Supabase project **does not redirect the native API to staging**. Verify the deployed HTTPS/UI flow separately before native account testing; do not claim that a native build using a staging account has tested a staging deletion service. Production activation requires the separate [deletion/privacy rollout](./ACCOUNT_DELETION_ROLLOUT.md), including existing owner access to private receipt photos. No production deletion enablement or bucket privacy change was made by the acceptance run.

## Start safely on Android

1. Finish the hosted gates and distribute the refreshed, verified **APK** for direct testing, or a Play internal-test invitation when that track exists. The currently verified APK is `artifacts/native/Code3TCG-debug.apk`, build **6**; its SHA-256 is recorded in the build evidence linked above. It predates the newer local restock/menu improvements. Install only the intended file from the release operator and record its build number/hash.
2. Keep the existing browser/PWA installed and its stored data intact. If an Android native package already exists and installation says its signature conflicts, stop. Do not uninstall it or clear storage to bypass the error. First export and verify its local-only data. The debug certificate, local upload certificate and eventual Play App Signing certificate are different identities; a debug installation is not a valid Play upgrade test.
3. Open the native app and perform the synthetic checks below first. After those pass, sign into the same existing account for a read-only transfer comparison.

USB installation is optional. The engineering runbook includes `adb -s DEVICE_SERIAL install -r ...` for a specifically selected device; a generic `adb` install should not target an unknown connected phone. No phone installation is performed by the preflight script.

## Start safely on iPhone without owning a Mac

1. Complete the LLC's Apple Developer enrollment and App Store Connect setup. The team must configure protected distribution signing and an authorized GitHub Mac archive/export workflow; the existing account-free simulator workflow does not produce an IPA.
2. The release operator builds a configured, signed archive and sends a TestFlight invitation after the required processing/review. Install through TestFlight on the iPhone. Keep the PWA and its browser storage.
3. Run the same synthetic checks and existing-account comparison as Android. A working simulator screenshot does not prove iPhone Keychain persistence, email-link handoff, camera, location or file sharing.

TestFlight distribution uses the signed app and developer account; see [Apple's beta distribution guide](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases). While enrollment is pending, the simulator can continue checking compilation and launch, and the PWA can remain the everyday app.

## Preserve and compare the existing account

1. On the original computer/PWA, open **Settings → Cloud saving & recovery**. Record the account, saved status and last confirmed save time. If it reports a conflict, use the preserved-version review; do not reset storage.
2. Under **Move to a new device**, leave cloud records/attachment verification selected and choose **Save transfer file**. Confirm the file exists outside the app and retain it privately. Check coverage warnings and save unfinished drafts/referenced files separately.
3. On the native phone, sign into the same account and wait for cloud loading. Open **Move to a new device → Compare a transfer file**. Review matching/missing/different/additional IDs and contents, then attachment-byte results. Counts alone are insufficient. Comparison itself does not restore or delete anything.
4. Open representative collection items, wants, restock photos, purchases/orders and enabled Bot records. Confirm current online price source/time; an offline bundled catalog is a build snapshot. Do not import prices to test the transfer.
5. If anything is missing or different, keep both copies and record the affected group. Recovery must use its reviewed preview and account confirmation, not a storage reset. Never apply recovery to the owner's data just to exercise the button.
6. Repeat on the other phone. Keep the original PWA and transfer file until both devices are checked. Two-way sync edits, offline conflicts, account switching and deletion tests belong to disposable test accounts.

## Record the physical results

Use a disposable test account and test-only destinations for writes. Do not publish synthetic restock reports, delete the owner's account, or clear existing storage. For each row record the device model/OS, delivered build and result; **not run** is not a pass.

| Test | Android | iPhone | Required evidence |
| --- | --- | --- | --- |
| Sign in; force-close/reopen; background/resume | Not run | Not run | Correct account, no loading loop; no password/session values in screenshots. |
| Request an account/recovery link on this installation | Not run | Not run | Cold/warm app opens once; recovery routes correctly; old/wrong-device links fail safely. |
| Synthetic A signs out; B signs in | Not run | Not run | A's device records/drafts never attach or upload to B. |
| Synthetic two-way sync and offline edit/conflict | Not run | Not run | Both changes preserved, explicit review when needed, no empty-cloud replacement. |
| Existing account transfer comparison | Not run | Not run | IDs/content and attachment checks, relevant record groups and readable photos. |
| Restock workflow and permissions | Not run | Not run | Store/search/manual location; camera/location allow-deny; cancel without accidental report. |
| Save/reopen transfer, device/cloud backup and CSV | Not run | Not run | Actual file outside app; cancellation never claimed as saved; preview still correct. |
| Navigation, keyboard, safe areas and accessibility | Not run | Not run | Light/dark, large text, TalkBack/VoiceOver, modal close/Back and unsaved-draft behavior. |
| Privacy/support and native disposable-account deletion | Not run | Not run | Policy reachable, cancellation, success, blocked/pending retry and invalidated session. The hosted 67-check acceptance does not replace either phone test. |
| Intended store-track upgrade with existing records | Not run | Not run | Same signing identity/update path; local drafts, records and photos survive without uninstalling. |

The detailed engineering commands and test matrix remain in [Native build and device verification](./NATIVE_BUILD_AND_DEVICE_TESTS.md).
