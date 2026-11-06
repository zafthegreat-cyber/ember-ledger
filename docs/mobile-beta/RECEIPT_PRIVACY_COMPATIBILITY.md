# Receipt privacy compatibility and rollout limits

Prepared 2026-10-18; production status refreshed 2026-10-24. The compatibility resolver is deployed, and the two reviewed privacy migrations are installed as [20261024234312_code3_account_deletion.sql](../../supabase/migrations/20261024234312_code3_account_deletion.sql) and [20261024234513_code3_private_attachment_reads.sql](../../supabase/migrations/20261024234513_code3_private_attachment_reads.sql). All four private attachment buckets are private; `catalog-images` and `brand-assets` remain public. The frontend did not rewrite saved references, and the migrations did not move, overwrite or delete attachment files. Production cloud record/object identity and metadata fingerprints are unchanged.

Database role checks preserve the current owner's receipt visibility and deny anonymous receipt reads. **Actual owner HTTP signing/download through the deployed resolver remains unverified.** Account deletion remains disabled, and physical-phone acceptance is paused at the owner's request. See the [current privacy readiness record](./PRIVACY_READINESS_2026-10-24.md) for the production postflight and remaining release gates.

## Why image compatibility is needed

The October 18 infrastructure audit found the legacy `receipts` bucket public. The October 24 privacy migration made it private and restricted receipt reads to the object owner with a valid current session. A saved legacy public URL therefore must no longer be treated as an anonymously readable image. This dated finding is retained in the [original receipt audit](./RECEIPT_PRIVACY_AUDIT_2026-10-18.md); it does not describe the current bucket setting.

The current shared `handleImageUpload` in `src/App.jsx` uses the already-private `receipt-images` bucket, and it serves more than receipts: personal product photos, inventory/collection photos, catalog uploads, and quick Scout report photos also use it. Relevant calls are in `App.jsx`, `features/deferredViews/CatalogWorkspaceContent.jsx`, and `features/deferredViews/ScoutSubmitContent.jsx`. Historical URL values can also be entered or imported into image fields. Source inspection establishes these supported paths; it does not establish the contents or purpose of every stored object.

## Runtime behavior

- Receipt-specific views and links recognize `receipts`, `receipt-images`, `product-submissions`, and `feedback-screenshots` references from the configured Supabase project. Public, authenticated, and expired signed reference forms retain the same bucket and decoded object path.
- The resolver verifies the authenticated identity, checks `code3_current_session_valid`, pins the bearer on the storage request, and relies on Storage RLS for access. It checks session identity and validity again before exposing the result. Arbitrary external URLs never receive credentials; a private-bucket URL from another project is rejected by receipt-specific resolution.
- A new authorized link lasts 60 seconds and is kept only in component memory. Mounted private views refresh it before expiry. Sign-out, account switches, stale requests, and revoked sessions clear or withhold the link. Signed URLs already copied outside the app can remain usable until their expiry; clearing the UI does not revoke them.
- Generic product/report artwork resolves **only the legacy `receipts` bucket made private on October 24**. Public catalog images and existing signed shared report photos from other buckets retain their prior direct-render behavior, including their existing URL and sharing scope. Those other buckets are not made viewer-private by this renderer change.
- Existing receipt links/previews, item details, expense/sale/mileage proof, search/catalog/collection artwork, report photos, and reusable image cards use the compatibility components. Image failure placeholders are noninteractive so they remain valid inside existing buttons/links. Standalone receipt links offer a retry control.

The original saved URL is never replaced or backfilled by viewing an image. Exported records retain their original references. Existing `handleImageUpload` still saves its existing seven-day signed URLs; this patch does not change that shared upload workflow or retroactively revoke those URLs. A broader move to durable private references and intentional public artwork publishing needs a separate compatibility review.

## Production rollout and remaining HTTP acceptance

Before rollout, the production reference audit found zero standard same-project legacy-receipts URL references across the 104 inspected columns in 41 tables. The one legacy receipt object had consistent ownership; its identity/metadata fingerprint remains unchanged after rollout. This does not exclude device-only references, unusual encodings or intentional public artwork. The code cannot infer public intent from a filename or a field. Another user or a signed-out visitor cannot gain access merely because a former public receipt URL was used as artwork. Current-owner access is supported by the resolver and database RLS, but the real HTTP path still needs acceptance.

If any newly discovered receipt-bucket objects are intended public artwork, review the content and rights, then plan a separate approved copy/publication into the existing appropriate public artwork storage with reviewed reference updates. Do not reopen the receipts bucket or copy personal proof automatically. The completed aggregate reference audit is not permission to publish an attachment or a claim that every device-only reference has been inspected.

Remaining acceptance must use real authorized HTTP sessions, with credentials and signed URLs kept out of chat, source control, screenshots and QA artifacts:

1. Have the existing receipt owner sign in normally and open the saved receipt through the deployed resolver. Confirm signing and image loading succeed without changing the original saved reference or object. SQL-generated claims are not an owner sign-in and cannot close this gate.
2. Use separately authorized accounts or disposable hosted fixtures to verify other-account, signed-out and expired/revoked-session denial. Check that a former public object URL is denied. Previously issued signed URLs may remain usable until expiry; denying new signing is distinct from revoking an already issued link.
3. Check the resolver's 60-second link renewal, account switches, sign-out, retry/error and offline behavior. Verify that no signed URL is persisted into saved records and that public artwork and previously shared report-photo behavior remain unchanged.
4. Preserve the existing data and price baseline before and after these checks. Record only outcomes and nonidentifying aggregates; do not save private file contents, attachment paths, account IDs, claims or tokens in QA evidence. Keep physical-device acceptance paused until the owner resumes it.

These are attachment-read checks, not permission to delete an account, remove files, change bucket privacy or enable deletion. See [account-deletion rollout](./ACCOUNT_DELETION_ROLLOUT.md) for the separately gated service acceptance and the [October 24 readiness record](./PRIVACY_READINESS_2026-10-24.md) for applied migration evidence. No migration needs to be reapplied to perform these reads.

## Evidence

`node scripts/test-private-receipts.mjs` verifies 49 synthetic cases: URL/path preservation, all receipt reference forms, current-session and identity checks, RLS denial, sign-out and account-switch races, token replacement, malformed/foreign URLs, bounded requests, and the generic artwork scope distinction.

`node scripts/test-private-receipts-browser.cjs` checks 320/390/1440-pixel light/dark views, legacy owner artwork, refresh before expiry, sign-out removal, other-account denial, unchanged existing shared report artwork, no bearer on image requests, and unchanged saved-record sentinels. Screenshots/results are in `artifacts/qa/mobile-beta/private-receipts/`. These use synthetic clients/images; they do not establish real receipt HTTP access or physical-device behavior.

The separate [October 18 hosted acceptance](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md) passed 67 checks with disposable accounts and real provider APIs. The October 24 production database postflight and refreshed aggregate/RLS checks are recorded in [privacy readiness](./PRIVACY_READINESS_2026-10-24.md) and ignored `artifacts/qa/privacy-final-acceptance-20261024/`. Neither the historical hosted run nor a database role rehearsal closes the remaining deployed owner HTTP check.
