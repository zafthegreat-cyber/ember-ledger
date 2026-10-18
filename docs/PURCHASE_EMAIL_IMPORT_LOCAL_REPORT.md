# Purchase email import local completion

Date: 2026-10-17. Branch: `codex/all-bot-integration-setup`, based on published main `eb560fc97d36939f19ae68aafbb1e1c7806e8632`. This continues the uncommitted bot setup and tracking candidate. The email-import implementation is local and has not been committed, pushed, merged, or deployed. No real mailbox or production data was accessed.

## User flow

Business → Purchases & Receiving → Pull purchase emails → choose AOL, Gmail, or Yahoo → enter an app password for one pull → review matching receipts → save selected purchase drafts → use the existing Confirm Purchase action.

The form links to each provider's app-password instructions. Users can check the last 7, 30, or 90 days. Missing item names, quantities, prices, dates, and currencies stay unresolved for review. Item amounts, tax, shipping, fees, and discounts must reconcile exactly to the reviewed order total. Confirming a purchase does not receive items or create inventory automatically.

Saved drafts identify their source as Email receipt. Purchase and order dates display consistently in UTC so a reviewed calendar date stored at midnight does not shift to the previous day on a phone or computer.

## Connection and data handling

- A new server route, `/api/account-ops/mailbox-import`, uses existing verified Supabase owner authorization before parsing a bounded request. Development and automated-test pseudo-identities cannot open a real mailbox. Hosted access requires HTTPS; local HTTP is restricted to loopback.
- The server uses fixed official IMAP hosts on TLS port 993 and requires read-only INBOX access. BODY.PEEK fetches leave message read/unread state unchanged. The implementation has no send, delete, move, or mailbox-write operation.
- The app password is cleared from the form on submission/unmount and kept only transiently for the request. It is not saved in local storage, purchase records, connection metadata, logs, or backups. Provider errors are replaced with safe messages. Closing the form or changing account aborts the request and clears the preview.
- Each request inspects at most the latest 500 INBOX message headers and reads at most 25 matching bodies, with a 512 KiB per-message limit, 4 MiB total body budget, and 25-second deadline. Oversized, incomplete, unrelated, protected/security, shipping-only, refund-only, and cancellation-only messages are skipped. Results disclose limits rather than claiming the entire inbox was imported.
- Recognized sender domains cover Target, Walmart, Best Buy, GameStop, Pokémon Center, Amazon, Costco, Sam's Club, and Barnes & Noble. Sender matching is a candidate filter, not proof of authenticity. Parsing uses bounded Schema.org Order data and explicit receipt fields; arbitrary layouts may need manual completion. There is no email-link fetching, HTML execution, attachment import, or retailer scraping.
- The minimized response contains receipt/order references, retailer labels, reviewed product candidates, exact amounts, dates, and warnings. No raw message body, headers, mailing address, payment details, or credential enters persistence.
- Reviewed drafts use the existing `code3.purchase-receiving.v1` storage and backup schema. Existing records and price data remain intact. Stable message references and same-retailer/order checks prevent reimports, including recognized preset retailer IDs and copies received by different mailboxes. Exact-source conflicting replays fail instead of overwriting the first version. Older records without reliable order identifiers still require manual comparison.
- Saving is serialized with the existing Purchase/Inventory lock and rechecks the owner after waiting. Corrupt storage, quota failures, and queued account changes preserve original bytes. No account schema, permission, price feed, deployment setting, or existing provider-runtime activation gate was changed.

## Verification

- New mailbox transport, route, and receipt parser: **102 tests passed**. Includes a real MIME/parser boundary with synthetic messages, fixed host/TLS selection, read-only UID fetches, auth before parsing, size/time limits, aborts, sanitized errors, ambiguous money, mixed currencies, and protected/private-content exclusion.
- Client API: **89 checks passed** for authorization before fetch, secure endpoints, fixed request shape, no redirects/cache, strict minimized responses, error redaction, and provider-auth errors distinguished from app sign-in errors.
- New draft mapping/service tests passed: exact money and dates, missing fields, unsupported currencies, source and cross-mailbox duplicates, preset retailer identities, conflicting replay, concurrent saves, revoked owner, quota failure, and corrupt storage.
- Browser testing exposed an intermittent generated-ID failure: digits across UUID hyphens could trigger the existing payment-card detector. New Purchase/Receiving IDs retain UUID entropy with letter separators; existing IDs are unchanged and the credential scanner remains strict. A deterministic regression reproduces the original UUID collision and verifies successful draft saving with the revised generator.
- Existing Purchase/Receiving suite: **1,814 assertions passed**, including 41 fixtures. Existing owner/provider-runtime/preview/managed-store regression: **60 tests passed**.
- Backup: **22 sections / 34 records**. Workspace recovery: **23 checks passed**.
- Browser: **nine result groups passed**: six flows at **320, 390, and 1440 pixels in light and dark themes**, a deterministic generated-ID collision flow, a failure/access/storage suite, and the actual app route at 320px in dark mode. Covers receipt pull/review/draft/explicit confirmation/reload/deduplication, keyboard focus, 44px controls, overflow, immediate/provider-change/unmount password clearing, denial, safe failures, owner-change cancellation, unchanged calendar dates, and storage preservation. The actual app `/business/purchases` check includes global navigation/styles and saved draft reload. API responses and identity are mocked; this does not prove a real mailbox connection.
- Frontend production build and complete-source ESLint passed. Backend TypeScript build passed. Existing App bundle warning remains (about 1.93 MB before gzip); lint retains the existing Babel large-file note. No frontend TypeScript script is configured.

## Evidence

- [Browser results](../artifacts/qa/purchase-email-import/results.json)
- [Desktop dark receipt preview](../artifacts/qa/purchase-email-import/1440-dark-receipts.png)
- [Mobile light connection form](../artifacts/qa/purchase-email-import/320-light-connect.png)
- [Mobile dark review](../artifacts/qa/purchase-email-import/390-dark-review.png)
- [Actual app on mobile](../artifacts/qa/purchase-email-import/320-dark-actual-app-viewport.png)
- [Build log](../artifacts/qa/purchase-email-import/build.log) and [lint log](../artifacts/qa/purchase-email-import/lint.log)

## Remaining verification

No real app password was supplied. A verified owner must enter a provider-generated app password inside the app to verify a real mailbox pull; never send it through chat. Hosted deployment, IMAP egress from the deployed host, real receipt-template coverage, physical phone hardware, and screen-reader operation remain unverified. The feature performs one pull at a time and does not provide stored credentials, scheduled email sync, attachment imports, Outlook/Microsoft OAuth, or native bot integrations. Drafts use the existing local Purchase/Receiving authority; this change adds no new cloud-sync behavior.

The installed IMAP and MIME packages are pinned, with lifecycle scripts disabled during installation. The backend dependency audit reports five pre-existing advisories in body-parser, esbuild, proxy-addr, qs, and ws; none names the added IMAP/MIME/HTML parser packages. A broad dependency upgrade was not mixed into this feature.

## Provider references

Setup help uses [AOL app passwords](https://help.aol.com/articles/create-and-manage-app-password), [Gmail app passwords](https://support.google.com/accounts/answer/185833?hl=EN), and [Yahoo app passwords](https://help.yahoo.com/kb/SLN15241.html). Gmail app passwords require 2-Step Verification and may be unavailable on some managed or protected accounts. Transport behavior was checked against the official [Gmail IMAP documentation](https://developers.google.com/workspace/gmail/imap/imap-smtp), [Yahoo IMAP settings](https://my.help.yahoo.com/kb/imap-settings-sln4075.html), and [IMAPFlow fetching guide](https://imapflow.com/docs/guides/fetching-messages/).
