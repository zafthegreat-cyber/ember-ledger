# Receipt privacy compatibility and rollout limits

Updated 2026-10-18. This is a local compatibility change; no saved record, object path, file bytes, or production bucket setting was changed by the frontend work.

## Why image compatibility is needed

Infrastructure metadata showed that the legacy `receipts` bucket is public. The separate proposed privacy migration makes it private and restricts receipt reads to the object owner with a valid current session. A saved public URL therefore must no longer be treated as an anonymously readable image after that migration.

The current shared `handleImageUpload` in `src/App.jsx` uses the already-private `receipt-images` bucket, and it serves more than receipts: personal product photos, inventory/collection photos, catalog uploads, and quick Scout report photos also use it. Relevant calls are in `App.jsx`, `features/deferredViews/CatalogWorkspaceContent.jsx`, and `features/deferredViews/ScoutSubmitContent.jsx`. Historical URL values can also be entered or imported into image fields. Source inspection establishes these supported paths; it does not establish the contents or purpose of every stored object.

## Runtime behavior

- Receipt-specific views and links recognize `receipts`, `receipt-images`, `product-submissions`, and `feedback-screenshots` references from the configured Supabase project. Public, authenticated, and expired signed reference forms retain the same bucket and decoded object path.
- The resolver verifies the authenticated identity, checks `code3_current_session_valid`, pins the bearer on the storage request, and relies on Storage RLS for access. It checks session identity and validity again before exposing the result. Arbitrary external URLs never receive credentials; a private-bucket URL from another project is rejected by receipt-specific resolution.
- A new authorized link lasts 60 seconds and is kept only in component memory. Mounted private views refresh it before expiry. Sign-out, account switches, stale requests, and revoked sessions clear or withhold the link. Signed URLs already copied outside the app can remain usable until their expiry; clearing the UI does not revoke them.
- Generic product/report artwork resolves **only the newly private legacy `receipts` bucket**. Public catalog images and existing signed shared report photos from other buckets retain their prior direct-render behavior, including their existing URL and sharing scope. Those other buckets are not made viewer-private by this renderer change.
- Existing receipt links/previews, item details, expense/sale/mileage proof, search/catalog/collection artwork, report photos, and reusable image cards use the compatibility components. Image failure placeholders are noninteractive so they remain valid inside existing buttons/links. Standalone receipt links offer a retry control.

The original saved URL is never replaced or backfilled by viewing an image. Exported records retain their original references. Existing `handleImageUpload` still saves its existing seven-day signed URLs; this patch does not change that shared upload workflow or retroactively revoke those URLs. A broader move to durable private references and intentional public artwork publishing needs a separate compatibility review.

## Required before changing the production bucket

Audit references to the `receipts` bucket in catalog images, listing/report photos, and other intentionally public artwork. The code cannot infer public intent from a filename or a field. After the migration, another user or a signed-out visitor cannot view an owner-only receipt object merely because its former public URL was used as artwork. Current-owner access remains supported through the resolver.

If any such objects are intended public artwork, review the content and rights, then plan a separate approved copy/publication into the existing appropriate public artwork storage with reviewed reference updates. Do not reopen the receipts bucket or copy personal proof automatically. The reference audit and any required approved remediation are rollout blockers; this work does not claim they are complete.

Apply the schema/privacy migration and frontend compatibility release together after staged owner/nonowner/anonymous checks. The migration remains local. See [account-deletion rollout](./ACCOUNT_DELETION_ROLLOUT.md) for the related staged database review.

## Evidence

`node scripts/test-private-receipts.mjs` verifies 49 synthetic cases: URL/path preservation, all receipt reference forms, current-session and identity checks, RLS denial, sign-out and account-switch races, token replacement, malformed/foreign URLs, bounded requests, and the generic artwork scope distinction.

`node scripts/test-private-receipts-browser.cjs` checks 320/390/1440-pixel light/dark views, legacy owner artwork, refresh before expiry, sign-out removal, other-account denial, unchanged existing shared report artwork, no bearer on image requests, and unchanged saved-record sentinels. Screenshots/results are in `artifacts/qa/mobile-beta/private-receipts/`. These use synthetic clients/images; no real receipt was downloaded, and no hosted or physical-device result is claimed.
