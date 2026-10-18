# Privacy and account-deletion UI acceptance

Updated 2026-10-18. The frontend refinement began against baseline `986e831`; this report now also records the completed isolated hosted-provider acceptance. Organization enrollment, production rollout and physical-device acceptance remain pending. A successful staging test is not confirmation that the production deletion service, receipt privacy migration, or store submission is ready.

## User-facing changes

- Deletion review now says **Account to delete** before confirmation, rather than implying deletion has already started.
- Unavailable service, shared/protected ownership, unclear record/file ownership, and possibly partial deletion each show specific next steps. Ownership help states that this page neither transfers ownership nor removes a shared workspace. Partial deletion guidance continues to state that some cloud files may already be removed; it never claims everything is unchanged.
- Blocked deletion and the public support page offer a reviewable email draft to the confirmed `support@code3tcg.com`, a copy action, and a selectable manual-copy fallback. Public support has a topic selector. Notes are optional, bounded to 600 characters, and held only in component memory.
- Drafts contain the selected help topic and what the person chooses to type. Account email, IDs, credentials, saved records, attachments, device fingerprints, browser URLs, and raw server errors are not added automatically. The screen explains that opening/copying a draft does not send it, submit deletion, or confirm deletion. Sending occurs in the person's email app after review.
- Privacy/sign-in fallback wording describes unavailable information or access without exposing build/configuration terminology. Existing retention uncertainties remain stated; no unsupported retention period or deletion deadline was added.
- The policy separates database recovery backups, runtime logs and build logs, using the inspected Supabase Pro/Vercel Hobby configuration and documented viewing windows. Supabase daily backups and disabled PITR were observed; neither provider had a configured log drain in the inspected settings. These windows are explicitly not permanent-erasure promises. Provider-internal purge timing remains unverified. See the [receipt/retention audit](./RECEIPT_PRIVACY_AUDIT_2026-10-18.md) and [Vercel audit](./VERCEL_RETENTION_AUDIT_2026-10-18.md).
- New marketplace listings start with an empty **Public city** field and privacy guidance rather than copying saved home/GPS settings. Existing saved listings and drafts keep their chosen location. Optional saved precise location can still be included in cloud settings; the store disclosure draft records that behavior.

Successful ordinary deletion still uses the existing direct account-specific review, password confirmation, and exact typed confirmation. The support flow does not bypass account verification, ownership blockers, or pending-deletion safeguards. No deletion endpoint, permission, receipt bucket, saved record, price, stored URL, or file byte was changed by this frontend work.

## Verification

| Check | Actual result |
| --- | --- |
| `node scripts/test-privacy-support.mjs` | 30 checks passed: state-specific guidance, safe topic selection, encoded mailto fields, invalid-recipient rejection, note bounds, and exclusion of supplied account identifiers/credentials. |
| `node scripts/test-privacy-support-browser.cjs` | Six Chromium viewport/theme contexts passed: 320, 390, and 1440 pixels, light/dark. Each exercised unavailable service, shared ownership, file ownership review, and pending deletion. Keyboard copy and clipboard-denied manual selection passed; text contrast was at least 4.5:1, controls at least 44px high, and no horizontal overflow. No external request, actual deletion, email send, or saved-record write occurred. |
| `node scripts/test-account-deletion-client.mjs` | Existing 52 client checks passed. |
| `node scripts/test-account-deletion-browser.cjs` | Existing confirmation/cancel/error/duplicate-submit, account-switch, pending/blocker, public-route access, and record-preservation scenarios passed in both themes. |
| `node scripts/test-marketplace-location-privacy.mjs` | 18 actual-handler scenarios passed for private coordinates/address/home city, all new listing sources, and preservation of saved Draft/Active edits. Explicit public-city entry, photos and prices are preserved. |
| Existing save-handler regression | 69 checks passed after the public-city refinement. |
| Isolated hosted account-deletion acceptance | 67 checks passed using the actual Express routes with hosted Supabase Auth, PostgREST and Storage in a disposable branch. Covered fresh password confirmation, target isolation, private-file access, partial Storage failure, Auth failure, lost-response retry, session/refresh-token revocation, hard deletion and preservation of another synthetic account. Production/shared-price writes: zero. This used loopback HTTP, not the production HTTPS/CORS endpoint or deployed UI. [Full report](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md). |
| `npx eslint src/features/privacy src/config/privacyPolicy.js` | Passed with no errors or warnings. |
| Scoped `git diff --check` | Passed; only repository line-ending conversion notices. |

Screenshots and machine-readable results: `artifacts/qa/mobile-beta/privacy-support/`. The 390-pixel ownership-help screenshots were visually inspected in both themes. All browser data and account/service responses were synthetic. Native email-app handoff, OS clipboard permissions, and screen-reader behavior on physical iPhone/Android devices remain to be checked.

The older `scripts/test-marketplace-listings.mjs` fails a pre-existing source-text assertion for `Review before saving. Choose the destination now`. The phrase is absent from the committed baseline as well as the working source after an earlier component extraction. That unrelated test was not rewritten to hide the failure; the new location regression executes the current handlers directly.

Hosted-test cleanup is confirmed: all four successful-run accounts were deleted through the normal verified flow, then the disposable branch was removed, including two remaining fixtures from earlier prerequisite failures. A branch listing confirmed only main remained; both restricted local test-key files were removed and their absence verified. No production account, stored record, attachment or price was changed. [Cleanup evidence and scope](./HOSTED_DELETION_ACCEPTANCE_2026-10-18.md).

## Remaining acceptance boundaries

The isolated hosted deletion/failure/retry test and provider plan/settings inspection are complete. Remaining work is to resolve production receipt privacy, roll out the reviewed deletion service and public pages, verify the actual HTTPS/CORS endpoints and deployed UI, and complete both physical-phone flows. Provider-internal security/support retention and exact purge schedules remain unverified; documented log/backup access windows do not close that question. Ordinary users must be able to finish supported account deletion without being forced through email support; support remains for inaccessible accounts, unavailable services, and genuine ownership reviews.

Actual ownership transfer is not performed by these screens. Support must verify the affected account and the required transfer before a blocker can be resolved. No response-time promise, automatic ticket creation, or completed support request is implied.

This frontend/documentation work made no commit, push, production deployment, real-customer account deletion, ownership transfer, production bucket change, or outbound support message. The separately documented hosted test used only disposable synthetic accounts and files.
