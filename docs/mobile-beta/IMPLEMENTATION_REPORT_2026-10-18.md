# Native beta implementation report — 2026-10-18

Android packaging and signing are implemented and locally verified. The iOS project, privacy/deletion implementation and data-transfer checks are prepared and tested within the limits below. **This is not a store-submission or physical-device completion report.**

Work remains local and uncommitted on `codex/all-bot-integration-setup`, based on `3a1ca40a4bede9fb4ca41c64905ea409c2c43c07`. No commit, push, merge, website deployment, production migration, store upload or real-account deletion was performed. Existing data and the generated price assets were not changed. The latest-price baseline `89da91d1b1ae229097d0203f568ae240f0f33242` remains in the existing source history.

## Final Android artifacts

App: **Code 3 TCG**, package `app.code3tcg.mobile`, version **1.0.0 (1)**, minimum Android API 24, target/compile API 36.

| File under `artifacts/native/` | Purpose | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `Code3TCG-beta.aab` | Signed upload bundle for a future Play testing release; not directly installable | 7,442,184 | `54df1f3614bcade8520bd248e7b88e5f74d0cc5921960e6d44a7894fff905d71` |
| `Code3TCG-debug.apk` | Android device-test APK, signed with a separate debug certificate | 9,467,198 | `6a4e892ae7c0e04c78523b0e237dac67679d6256faf6945d89a42e43f291d691` |

Public upload-certificate SHA-256: `79:A2:A7:43:31:4B:1A:A6:AF:05:AC:B0:13:5E:7C:01:F9:A7:FD:71:EC:7C:5B:9F:23:F7:04:BF:C6:01:C9:1A`.

The upload key/password remain in an ignored, ACL-restricted local directory. The password is protected by Windows DPAPI; portable owner-controlled backup is still required before publishing. The private key and credential file are not in the APK/AAB, report or source control. Do not install over an existing incompatible signing identity by clearing data or uninstalling; follow the verified transfer procedure first.

`artifacts/native/release-verification.json` records artifact hashes and validation results at 18:06 UTC. Build/package logs are in that same directory. The web-build metadata describes only the web bundling step; the release verification file records the later Android signing result.

## What changed

- Capacitor Android/iOS projects bundle the existing app locally. Native builds use the existing production API/project and retain the website/PWA build. Native-only safe-area handling avoids putting fixed controls beneath system bars.
- Android Keystore and iOS Keychain adapters hold native authentication sessions. Callback handling uses PKCE, exact callback validation, account/lifecycle cancellation, refresh-on-resume and guarded Android Back behavior. Native binaries do not use the website service-worker update path.
- Native backup, transfer, conflict, private-file and business/report exports use an awaited share flow. Cancellation is distinguished from a confirmed save; account changes invalidate pending exports. Existing file contents and recovery formats are preserved.
- Settings includes an account-linked transfer file and comparison. Checks compare record IDs/content and attachment hashes, preserve both sides, and route missing data through existing additive recovery/password gates. Coverage limitations remain explicit.
- Public privacy, support and deletion pages use **Anchor & Wing LLC DBA Code 3 TCG** and **support@code3tcg.com**. They remain accessible outside normal cloud loading/recovery boundaries. Deletion requires the current account, fresh password and typed confirmation; shared ownership and protected accounts block unsafe deletion.
- A durable backend deletion operation freezes account writes, safely retries partial failures, deletes supported owned resources and revokes/deletes Auth last. The service remains disabled until its reviewed migration and hosted staging acceptance are complete.
- Receipt compatibility resolves existing private references using short-lived authorized URLs without rewriting records. A separate proposed migration closes the legacy public receipt bucket while preserving objects. Existing shared artwork from other buckets keeps its behavior.
- Compatible dependency fixes leave root and backend audits at zero reported vulnerabilities. Current server prices now take precedence over duplicate bundled catalog results; existing generated price files remain unchanged.

## Verification performed

| Area | Actual result |
| --- | --- |
| Final website/native builds | Pass; configured native bundle and Android/iOS synchronization complete |
| Full source lint | `npm run lint:src` passes; focused edited-file checks also pass |
| Backend TypeScript | Build passes |
| Android debug | `assembleDebug testDebugUnitTest` passes, 199 tasks; APK v2 signature and package manifest verified |
| Android release | `bundleRelease`, including release lint, passes, 228 tasks; JAR signature and bundletool 1.18.3 validation pass |
| Android payload integrity | All 623 payload entries validate against the expected upload certificate; no duplicate or missing ZIP entries |
| Native behavior | 19 mocked bridge/lifecycle scenarios plus App export behavior/data-source tests pass |
| Native API compatibility | 5 CORS/auth boundary checks and 7 existing legacy-client checks pass |
| Deletion frontend | 52 checks pass, including account changes and bounded response-body processing |
| Deletion backend/database | 10 service/HTTP groups, 90 local PostgreSQL checks across canonical/deployed-legacy schemas, and 9 attachment-policy checks pass |
| Receipt access | 49 checks and six responsive/theme browser contexts pass |
| Transfer/recovery | 15 transfer, 23 workspace recovery, 20 cloud sync, 15 cloud backup checks; existing backup verification covers 22 sections/34 synthetic records |
| Existing recovery/account regressions | Account Ops restore 24, recovery guards 43, review presentation 10, account-session client 38; prior local session PostgreSQL 58 and cloud-backup PostgreSQL 19 pass |
| Other affected regressions | Pricing reliability/review, year-end export, legacy backup validation 42, purchase-email API 92, backend release security 62 and mailbox/parser 102 pass |
| Responsive/accessibility checks | Privacy/deletion, receipt access and transfer UI checked at 320/390/1440px in both themes; public routes and Settings wrappers checked, screenshots inspected. Keyboard/touch/overflow/contrast checks pass in browser fixtures |
| Dependencies | Root and backend `npm audit` report zero vulnerabilities |
| iOS source integration | Xcode project/plist/storyboard parsing, SPM references, custom Swift registration, Keychain calls and release-script review pass; no Xcode build claimed |

Browser tests used synthetic accounts/records and blocked external/mutating network requests. Local PostgreSQL tests used isolated throwaway databases. No actual owner recovery or deletion was used as a test. Mock bridge tests and generated Android example unit tests do not establish device behavior.

Screenshots/results:

- `artifacts/qa/mobile-beta/privacy-deletion/`
- `artifacts/qa/mobile-beta/private-receipts/`
- `artifacts/qa/mobile-beta/device-transfer/`

Non-failing build findings remain visible: the existing large App bundle warning and ineffective dynamic Supabase import; Gradle deprecations for a future Gradle 9 migration. JAR verification reports the expected self-signed upload certificate, absence of timestamp and unprotected ZIP permission attributes. It also reports a streaming-reader manifest-order warning: the generated manifest is at ZIP index 625. Direct verification read every payload and validated its expected certificate; central/local entry lists match. No artifact was repacked to hide warnings. Google Play acceptance remains unverified.

## Required before store beta submission

Owner update, 2026-10-18: the D-U-N-S request is submitted. Issuance and Apple/Google organization enrollment remain unconfirmed; this does not change the build or device-test results above.

1. Complete Apple/Google organization enrollment and register the intended application IDs. Preserve portable Android key recovery. Supply Mac/Xcode access and Apple team/provisioning to compile, sign and validate the iOS archive.
2. Stage the reviewed account-deletion migrations/service with disposable accounts and attachments. Exercise actual hosted Auth/Storage success, partial failure, retry, revocation and isolation. Confirm infrastructure backup/log retention and finish truthful Apple privacy/Google Data safety declarations.
3. Finish the receipt-privacy rollout. Production metadata showed `receipts` is public; production is unchanged. Audit any receipts-backed public artwork and ownerless references before applying private access. Stage the resolver first and verify owner/nonowner/anonymous access through hosted Storage/CDN. See [receipt compatibility](./RECEIPT_PRIVACY_COMPATIBILITY.md).
4. Publish the final privacy/support/deletion routes and controlled native API/auth redirect configuration. Native origin activation and deletion activation are separate settings; neither was applied here.
5. Run the [physical-device checklist](./NATIVE_BUILD_AND_DEVICE_TESTS.md) on both phones. No Android device is connected; Windows cannot compile iOS. Test sign-in, cold/warm account links, safe areas, camera/photos/location, accessibility, offline sync, transfer comparison, backups/recovery and upgrade preservation. Keep the original PWA and its storage until records/files are compared on both native installs.
6. Prepare a dedicated synthetic reviewer account, verify store copy against actual enabled behavior, then upload through the owner's verified store accounts. Do not use the owner's real account as reviewer credentials.

The next actionable device step is connecting the Android phone by USB with debugging authorized. The owner has confirmed no Mac; the proposed iOS route is a GitHub-hosted Mac build, followed by TestFlight delivery to the owner's iPhone after Apple enrollment/signing. The local unsigned build workflow is prepared but unrun. This update does not establish simulator or physical-device acceptance.
