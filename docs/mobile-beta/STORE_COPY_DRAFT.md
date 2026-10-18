# Code 3 TCG beta store copy draft

Updated 2026-10-18 for native beta preparation. These are reviewable wording and test notes, not a published listing or a claim that physical-device testing has passed. Android version 1.0.0, build 6 includes the final privacy/support changes and passes package/signature validation; it has not been uploaded. [Build evidence and hashes](./ANDROID_BUILD_6_2026-10-18.md). Hosted deletion and private-attachment acceptance passed 67 checks in an isolated branch. Production HTTPS/native CORS, deployed UI and activation, iOS archive/signing, store enrollment, and physical-device/data-transfer acceptance remain pending. Publisher and support contact below are owner-confirmed.

## Listing text

**Name:** Code 3 TCG

**Apple subtitle:** Restocks and your collection

**Google short description:** Find community restock reports and organize your trading card collection.

**Description:**

Code 3 TCG helps collectors find community restock reports and keep their collecting organized.

Browse reports from other collectors, follow stores, and share what you find. Add a photo and useful context when reporting a restock. Reports describe community observations; store availability can change.

Keep track of cards, sealed products and wants. Search products and review available price information. Occasional selling and trading tools help you organize those activities when you need them.

This beta uses approved accounts. Features vary by account and workspace. We are testing the native app's everyday collecting and restock experience before a wider release.

## What to test

- Find and filter restock reports; open the store and product details.
- Submit a synthetic test report only in the designated test environment. Test photo selection, cancellation, validation and Back behavior.
- Add, edit and search synthetic collection records; check prices and offline/stale labels.
- Confirm that account sign-in, confirmation/reset links, sign-out and session recovery return to the right screen.
- Verify data continuity using a designated test account and the transfer file's identifier/content/attachment comparison. Record counts alone are insufficient. Do not clear the browser's original records.
- Check text size, light/dark themes, keyboard and screen-reader navigation, camera permissions, file import/export, offline state and background/resume.

For owner-authorized operations tests, separately check manual bot tracking and reviewed purchase drafts. The mailbox workflow needs a real provider test performed by the verified owner in the app; passwords must not be included in feedback or reviewer notes.

## Fields to complete before upload

| Field | Status |
| --- | --- |
| Legal publisher / seller | Owner-confirmed: Anchor & Wing LLC DBA Code 3 TCG. Store display name follows verified organization enrollment. |
| Apple Team ID / app record / bundle ID | Local bundle ID: `app.code3tcg.mobile`. An account-free simulator compile/launch passed on a GitHub Mac; it is not a signed physical-iPhone build. Apple enrollment, Team ID, store app record, distribution signing and TestFlight delivery remain pending. |
| Android package / app record / signing | Local package: `app.code3tcg.mobile`, target API 36. Final build 6 signed release AAB passes (228 Gradle tasks); `jarsigner` verifies it and bundletool 1.18.3 validation exits 0. APK signature/manifest and all 176 packaged web assets also verified. The existing private local upload key uses ACL/DPAPI protection. Preserve portable owner recovery, create the store record and test the delivered beta. No Play upload occurred. |
| Monitored support and beta feedback contact | Owner-confirmed: support@code3tcg.com |
| Privacy policy URL | Intended: `https://code3tcg.app/privacy`. Updated public page implemented and browser-tested locally. Production publication, receipt privacy rollout and provider backup/log retention details remain pending. Do not submit declarations that describe the pending private-bucket change as already deployed. |
| Web account-deletion URL | Intended: `https://code3tcg.app/delete-account`. Public/in-app flow tested locally; deletion API passed 67 checks against real hosted Auth/Storage in an isolated branch. [Acceptance evidence](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md). Production HTTPS/UI publication, service enablement and physical-phone deletion remain pending. |
| Review account | Dedicated account with synthetic data; no owner's password or private records |
| Screenshots and store icon set | Capture/export from the tested native apps using existing Code 3 TCG branding |
| Age rating, target audience, privacy/data safety, encryption | Complete truthfully from actual behavior and selected beta scope |
| Build version and test notes | Android 1.0.0 (4): artifact hashes and signing evidence are recorded in the [build-6 report](./ANDROID_BUILD_6_2026-10-18.md). No signed iOS distribution artifact or physical-device acceptance is established. Record the delivered store builds and actual device results before submission. |

The [67-check hosted acceptance run](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md) used a loopback Express HTTP server backed by real hosted Supabase services. It verified private access in four attachment buckets, deletion retries and session invalidation, and preservation of another synthetic account. All four successful-run accounts were deleted through the service; the temporary branch and both restricted local test-key files were then removed. No production or shared-price writes occurred. This evidence does not verify production HTTPS/native CORS, the deployed deletion UI or either physical phone.

Read-only production metadata showed that the receipt bucket and its read policy are currently public. The attachment privacy migration and authenticated resolver preserve existing records/files, but still require production deployment in the correct order before submission. Verify existing owner access and anonymous denial after that rollout. No real customer's receipt file was opened during the audit; acceptance used synthetic files. Follow the [rollout checklist](./ACCOUNT_DELETION_ROLLOUT.md) and [phone test quickstart](./PHONE_TEST_QUICKSTART.md). Keep the PWA and original device records until both phones pass the identifier/content/attachment transfer comparison.

Do not advertise automatic retailer inventory, guaranteed restocks, universal cloud sync, automatic purchases, native bot control, card issuance, or verified AI card identification. Those capabilities are not established by the current release. Preserve the existing product and collectible-image rights requirements when selecting store assets.
