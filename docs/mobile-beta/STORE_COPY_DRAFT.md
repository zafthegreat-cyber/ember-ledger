# Code 3 TCG beta store copy draft

Updated 2026-10-18 for native beta preparation. These are reviewable wording and test notes, not a published listing or a claim that physical-device testing has passed. A signed Android App Bundle builds and passes signature/bundle validation; it has not been uploaded. iOS archive/signing, staged receipt privacy and hosted deletion rollout, store enrollment, and device acceptance remain pending. Refresh packages after the final receipt-access changes. Publisher and support contact below are owner-confirmed.

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
| Apple Team ID / app record / bundle ID | Local bundle ID: `app.code3tcg.mobile`. Team, store app record, release signing, and Xcode build not yet confirmed. |
| Android package / app record / signing | Local package: `app.code3tcg.mobile`, target API 36. Signed release AAB build passes (228 Gradle tasks); `jarsigner` verifies it and bundletool 1.18.3 validation exits 0. The private local upload key uses ACL/DPAPI protection. Preserve portable owner recovery, refresh the final package, create the store record and test the delivered beta. No Play upload occurred. |
| Monitored support and beta feedback contact | Owner-confirmed: support@code3tcg.com |
| Privacy policy URL | Intended: `https://code3tcg.app/privacy`. Updated public page implemented and browser-tested locally. Production publication, receipt privacy rollout and provider backup/log retention details remain pending. Do not submit declarations that describe the pending private-bucket change as already deployed. |
| Web account-deletion URL | Intended: `https://code3tcg.app/delete-account`. Public/in-app flow and backend implemented and tested locally. Hosted Auth/Storage staging, service enablement, and production publication remain pending. |
| Review account | Dedicated account with synthetic data; no owner's password or private records |
| Screenshots and store icon set | Capture/export from the tested native apps using existing Code 3 TCG branding |
| Age rating, target audience, privacy/data safety, encryption | Complete truthfully from actual behavior and selected beta scope |
| Build version and test notes | Record the final Android/iOS artifact versions, hashes, signing identity and actual physical-device results; current Android compilation/signature validation does not establish device acceptance. |

Read-only production metadata showed that the receipt bucket and its read policy are currently public. The local attachment privacy migration and authenticated resolver preserve existing records/files, but must be staged and deployed in the correct order before submission. Test existing owner access and anonymous denial against the hosted service; no actual receipt file was opened during this audit. Follow the [rollout checklist](./ACCOUNT_DELETION_ROLLOUT.md) and [native build/device runbook](./NATIVE_BUILD_AND_DEVICE_TESTS.md).

Do not advertise automatic retailer inventory, guaranteed restocks, universal cloud sync, automatic purchases, native bot control, card issuance, or verified AI card identification. Those capabilities are not established by the current release. Preserve the existing product and collectible-image rights requirements when selecting store assets.
