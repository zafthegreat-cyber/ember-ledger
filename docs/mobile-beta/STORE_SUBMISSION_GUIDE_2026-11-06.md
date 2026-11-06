# Code 3 TCG — App Store and Google Play submission guide

Updated November 6, 2026. This replaces the open-items lists in [READINESS.md](./READINESS.md) and the [store copy draft](./STORE_COPY_DRAFT.md); those files remain as history. Publisher: **Anchor & Wing LLC DBA Code 3 TCG**. App ID on both stores: `app.code3tcg.mobile`. Support: **support@code3tcg.com**.

## Where things stand

| Requirement | Status |
| --- | --- |
| In-app account deletion (Apple 5.1.1(v), Google) | **Live.** In-app flow plus public page `https://code3tcg.app/delete-account`; the production API answers native requests. |
| Privacy policy, support and terms pages | **Live:** `/privacy`, `/support`, `/terms` on code3tcg.app. |
| Native app can reach the server | **Live.** Production allows the iPhone (`capacitor://localhost`) and Android (`https://localhost`) app origins. |
| Private receipts and photos | **Done.** All four private storage buckets are private in production. |
| Report and block for user content (Apple 1.2) | **Done in this release.** Restock report cards and details now have **Report** and **Block reporter**; community posts have Report post and Block user. Reports used to stay on the reporter's own device; they now go to the `beta_feedback` table for staff (see "Reviewing reports" below). Blocking immediately hides that person's posts, replies and restock reports, and Settings → Privacy & safety → Blocked people lists them with Unblock. The Terms say there is no tolerance for objectionable content or abusive users, and sign-up requires accepting the Terms. |
| Sign in with Apple rule (Apple 4.8) | **Handled.** On iPhone, Discord/Google/Facebook buttons appear only when Sign in with Apple is also turned on. Until then the iPhone app offers email and password only. Android is unaffected. |
| No outside payment links (Apple 3.1.1) | **OK for launch.** Every plan is free during beta and the native app hides all checkout. If paid plans start later, the iPhone app must sell them through Apple in-app purchase. |
| Android target API | API 36, meets Google's current requirement. |
| iOS icon | 1024×1024, now saved without an alpha channel (App Store Connect rejects icons with one). |
| Export compliance | The iPhone app declares standard encryption only, so TestFlight doesn't hold each build for the question. |
| Devices | iPhone only for launch (no iPad screenshots or iPad review needed). Android phones and tablets. |
| Signed builds | Two manual GitHub Actions workflows: **Android signed beta build** and **iOS TestFlight build**. Both need your secrets (below). |

## What only you can do, in order

### 1. Developer accounts
- **Apple:** finish Apple Developer Program enrollment as the LLC (needs the D-U-N-S number), USD 99/year. Accept the agreements in App Store Connect → Business.
- **Google:** finish Play Console enrollment as an organization, USD 25 once. Organization accounts don't have the "12 testers for 14 days" rule that new personal accounts have.

### 2. Create the store records
- App Store Connect → Apps → **+** → New App: platform iOS, name **Code 3 TCG**, bundle ID `app.code3tcg.mobile` (register it first under Certificates, IDs & Profiles → Identifiers), SKU `code3tcg-ios`.
- Play Console → **Create app**: name **Code 3 TCG**, app, free. Turn on **Play App Signing** (default) and upload with the existing upload key from build 6.

### 3. Add the GitHub secrets
Repository → Settings → Secrets and variables → Actions → **New repository secret**.

Android (same upload key as build 6 so updates install over it):
- `CODE3_ANDROID_KEYSTORE_BASE64`: the keystore file as base64. In PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\upload.keystore")) | Set-Clipboard`
- `CODE3_ANDROID_STORE_PASSWORD`, `CODE3_ANDROID_KEY_ALIAS`, `CODE3_ANDROID_KEY_PASSWORD`

iPhone (no Mac or certificate files needed; Apple creates the signing certificate in the cloud):
- In App Store Connect → Users and Access → Integrations → **App Store Connect API** → Team Keys → **+**, role **Admin**. Download the `.p8` file (only offered once).
- `CODE3_ASC_KEY_ID`: the key's ID. `CODE3_ASC_ISSUER_ID`: the Issuer ID shown above the list. `CODE3_ASC_PRIVATE_KEY`: open the `.p8` in Notepad and paste all of it, including the BEGIN/END lines.
- `CODE3_APPLE_TEAM_ID`: the 10-character Team ID from developer.apple.com → Membership.

The existing repository **variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are already set. Add `discord` to `VITE_AUTH_VERIFIED_PROVIDERS` only after the Discord sign-in round trip works.

### 4. Build
Actions tab → run each workflow with **build number 7** (or higher than anything uploaded before) and version **1.0.0**.
- **Android signed beta build** produces an `.aab` artifact. Download it and upload to Play Console → Testing → **Internal testing** → Create release.
- **iOS TestFlight build** uploads directly. The build shows in App Store Connect → TestFlight after 10–30 minutes of processing.

Install both on your own phones (TestFlight app on iPhone; the internal-testing opt-in link on Android) and run through: sign in, browse Restocks, submit a restock report with a photo, add to collection, block and unblock someone, sign out, and delete a throwaway account.

### 5. Reviewer account
Create a dedicated account for store reviewers, such as `appreview@code3tcg.com`, with a few synthetic collection items and no real personal data. Never give reviewers your own account. Enter it under App Store Connect → App Review Information, and Play Console → App content → App access.

### 6. Screenshots and graphics
Ready-made images are in [store-listing](./store-listing/); upload them in order 1–5.
- **iPhone (6.9-inch, 1320×2868):** the five `app-store-iphone-6.9-*.jpg` files.
- **Google Play phone (1080×2160):** the five `google-play-phone-*.jpg` files, plus `google-play-feature-graphic.png` (1024×500) and the 512×512 icon `public/icon-512.png`.
- They use sample data with generic product names and no product photos. To regenerate after UI changes, start the dev server on port 5320 and run `node scripts/store-screenshots-capture.mjs . <raw-folder>`, then `node scripts/store-screenshots-compose.mjs . <raw-folder> docs/mobile-beta/store-listing`.
- Don't show official Pokémon card art, logos or product photos you don't have rights to, and don't put "Pokémon" in Apple keywords. Both stores reject other companies' trademarks used this way.

### 7. Fill in the store forms and submit
Use the text below, then submit the iPhone build for App Review and promote the Android release from internal testing to production (or to closed testing first).

## Listing text (ready to paste)

**Name:** Code 3 TCG

**Apple subtitle (30 max):** Restocks & card collection

**Google short description (80 max):** Find community restock reports and organize your trading card collection.

**Description:**

Code 3 TCG helps trading card collectors find restocks and keep their collection organized, with a community that puts fair collecting and families first.

RESTOCKS
• Browse recent restock reports from other collectors at stores near you.
• Store directory for Virginia, North Carolina, Maryland and Washington, DC.
• Share what you saw with a photo, the items and the time. Reports are community observations, and stock can change.

COLLECTION
• Track cards and sealed products, your wish list and what you've traded.
• Search products and check price information with clear "last updated" labels.

COMMUNITY
• Post questions, local events and trade nights.
• Report anything that breaks the rules, and block anyone you don't want to hear from.

BUSINESS TOOLS
• Optional tools for occasional sellers to keep inventory, sales and expenses in one place.

Every plan is free during the beta. Your collection and business records stay private to your account.

**Keywords (Apple, 100 max):** tcg,trading cards,card collection,restock,collector,sealed,binder,trade,card prices,tracker

**Category:** Lifestyle (primary), Utilities or Shopping (secondary).

**Support URL:** https://code3tcg.app/support · **Privacy policy URL:** https://code3tcg.app/privacy · **Marketing URL:** https://code3tcg.app

## Notes for App Review (paste into "Notes")

> Code 3 TCG is a free app for trading card collectors. Sign in with the review account provided. Restocks lists community-submitted store observations; collectors can submit a report with a photo. Collection tracks the reviewer's own items.
> User-generated content: every community post and restock report has Report (sends it to our moderators) and Block (immediately hides that person's posts, replies and reports; unblock under Settings → Privacy & safety → Blocked people). The Terms of Service, which users accept at sign-up, prohibit objectionable content and abusive users.
> Account deletion: Menu → Privacy / Data Requests → Delete account, or https://code3tcg.app/delete-account.
> There are no in-app purchases; all plans are free during the beta. Camera and photo access are used only when the user attaches a photo; location only when the user asks for nearby stores.

## App privacy (Apple) and Data safety (Google): quick answers

Answer **yes, data is collected**. Nothing is used for tracking or advertising, nothing is sold, and data is encrypted in transit. Users can request deletion in-app and at the delete-account URL. The full source-level inventory is in [STORE_DATA_DISCLOSURE_DRAFT.md](./STORE_DATA_DISCLOSURE_DRAFT.md); its "receipt bucket is public" and "deletion not enabled" warnings are now resolved.

| Data | Collected for | Linked to user | Optional |
| --- | --- | --- | --- |
| Email address, name, user ID | Account, app functionality | Yes | Required for an account |
| Photos (reports, collection, receipts, feedback) | App functionality | Yes | Optional |
| Other user content (collection, reports, posts, notes) | App functionality | Yes | Optional |
| Purchase history / other financial info (seller and receipt records) | App functionality | Yes | Optional |
| Precise and approximate location (only when the user taps "use my location"; ZIP/city if typed) | App functionality | Yes | Optional |
| Search history (saved searches) | App functionality | Yes | Optional |
| Customer support messages | App functionality | Yes | Optional |
| Diagnostics (server request logs) | App functionality, security | No | — |

## Age rating and audience

- **Apple age rating questionnaire:** answer "Yes" to user-generated content and to messaging/chat between users (community replies). No gambling, no unrestricted web browser. Apple will most likely assign 13+.
- **Google target audience:** choose **13 and over** (do not include under-13 groups). The Little Sparks family program is applied for by parents, not used directly by children, so the app should not be listed under Families/Designed for Kids. Google's content rating questionnaire (IARC): select "users can interact" and "shares user-provided content".

## Reviewing reports

Apple expects reported content to be acted on promptly; aim to check reports at least daily. In Supabase → Table Editor → `beta_feedback`, filter `related_entity_type` for `content_report_store_report` (restock reports) or `content_report_community_post`. Each row has the reason, the report or post ID and the author's user ID in `device_info`; "Unsafe or inappropriate" reports are marked `high`. To act, set the restock report's `status` to `rejected` in `store_reports`, suspend the author's profile if needed, then set the feedback row's `status` to `reviewing`, `fixed` or `rejected`.

## After launch

- Builds expire from TestFlight after 90 days. Each new store upload needs a higher build number.
- Blocks are saved on each device. Syncing them across a member's devices is a possible later improvement.
- If paid plans start, add Apple in-app purchase (iPhone) and Google Play Billing (Android) before showing prices in the apps.
