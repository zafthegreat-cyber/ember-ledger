# Nationwide community release candidate — November 8, 2026

Branch: `codex/nationwide-launch-20261108`. This is a preparation branch; no production merge, deployment or store submission has been performed for it.

## Scope

Community reporting and state selection support all 50 US states and Washington, DC. Manual stores require a name, city and state. Screenshot review can use a store outside the cached directory, retains reviewed no-stock observations, and starts private and unverified. Missing directories do not fall back to Virginia. The overview/map uses the chosen area and the actual observation time; uploading an old report does not make it current stock.

Cached directories currently cover VA, NC, MD and DC only. Coverage is verified against a generated manifest and file hashes. A live Texas OpenStreetMap import dry run timed out and wrote no data. Do not advertise nationwide live retailer inventory or complete nationwide store coverage. New locations can be reported manually or suggested for review.

## Preservation and release safeguards

- Existing record schemas, account ownership, private attachments, cloud sync and price calculations remain in place. The November 8 automated price refresh (`28a2ed3004d6fe799c995a52e59ba0df7d7ad0fe`) was merged into this candidate; generated catalog/price files must match it exactly.
- Public release-config checks reject local auth, QA bypasses, missing account services and public server secrets. No new credential is bundled.
- Settings is eagerly available across releases; missing asset requests return an uncached 404 rather than SPA HTML in the candidate's Vercel routing. The old production deployment still returned HTML for a missing asset during the public audit.
- Android signing has early validation and private cleanup. Existing signing identity is retained. The old build 7 must not be represented as containing this candidate.
- Complimentary reviewer access is separate from administration. See the updated submission guide for the account and release gate.

## Verification and remaining release gates

The QA results and screenshots are under `artifacts/qa/nationwide-launch-20261108` in the parent workspace. Actual browser testing used isolated localhost records with account services disabled: a manual Texas no-stock report and an OCR screenshot report both saved and survived reload. The UI correctly reported local-only saving. These are not evidence of phone-to-cloud sync.

The existing reviewer signed in on production and its Seller membership was visible. That session has an unresolved cloud comparison and encountered the existing stale-release asset recovery screen during the day's automated price deployment. Later browser inspection timed out. Neither issue was resolved by clearing data or overwriting saved copies.

Before public release: publish the approved candidate, verify fresh reviewer access in the actual signed build, finish Android/iPhone/computer authenticated save-and-attachment sync, complete reviewed Play Console declarations/assets and confirm moderation/support coverage. Do not claim these external/device checks passed based on unit tests or simulated users. iOS signing/distribution also depends on completed Apple enrollment.
