# Code 3 TCG — Google Play Data safety form answers (draft, Nov 7, 2026)

Built from the live Supabase schema (public tables + storage buckets), the Android manifest (INTERNET, CAMERA, COARSE/FINE LOCATION) and package.json (no analytics, ads or crash SDKs; Stripe is sandbox only). Package `app.code3tcg.mobile`. Only the Supabase backend receives data; Vercel and Supabase are service providers, not third parties.

## Overview questions
| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only; `usesCleartextTraffic=false`) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — https://code3tcg.app/delete-account (in-app request → `data_requests`) |
| Delete-account URL field | https://code3tcg.app/delete-account |
| Privacy policy URL (Store listing → App content) | https://code3tcg.app/privacy |

## Data types — collected, not shared
"Collected" = sent to our servers. "Shared" = No for every row (no third-party transfer; no ads SDKs). Ephemeral = No everywhere (data is stored).

| Category | Data type | Collected? | Required or optional | Purposes |
| --- | --- | --- | --- | --- |
| Personal info | Name | Yes | Optional | Account management, App functionality |
| Personal info | Email address | Yes | **Required** | Account management, App functionality, Developer communications |
| Personal info | User IDs | Yes | Required | Account management, App functionality, Fraud prevention/security |
| Personal info | Phone number | Yes | Optional (SMS alerts opt-in) | App functionality (notifications) |
| Personal info | Other info | Yes | Optional | App functionality — kids-program applications collect a child's first name/nickname and age range entered by the guardian; seller display name; city/area |
| Financial info | Purchase history | Yes | Optional | App functionality — receipts, business expenses, purchases the user logs |
| Financial info | Other financial info | Yes | Optional | App functionality — sales records, profit, mileage; no card numbers, no payment info (billing is not live) |
| Location | Approximate location | Yes | Optional | App functionality — city/state/ZIP the user enters for listings, seller profile, local restock reports |
| Location | Precise location | **CONFIRM** — manifest requests FINE_LOCATION; if device GPS is only used on-device to sort nearby stores and is never sent to the server, answer No; if coordinates are uploaded (e.g. attached to a store report), answer Yes / Optional / App functionality | | |
| Messages | Other in-app messages | Yes | Optional | App functionality — marketplace listing messages between members |
| Photos and videos | Photos | Yes | Optional | App functionality — receipt images, listing photos, item photos, feedback screenshots (camera or gallery) |
| Files and docs | — | No | | (receipt images are declared under Photos) |
| App activity | App interactions | Yes | Optional | Analytics, App functionality — `app_activity_events`, AI-assist accept/decline |
| App activity | Other user-generated content | Yes | Optional | App functionality — collection items, listings, restock reports, notes, reviews, catalog suggestions |
| App activity | Other actions | Yes | Optional | App functionality — saved listings, watchlists, preferences |
| App info and performance | Crash logs | No (no crash SDK) | | |
| App info and performance | Diagnostics | Yes | Optional | Analytics, App functionality — `app_error_logs` (error message, page, user agent) |
| Device or other IDs | Device or other IDs | Yes | Optional | Analytics, Fraud prevention/security — campaign `anonymous_id`, user agent, audit-log IP address |
| Web browsing, Contacts, Calendar, Health, Audio, Videos, Installed apps | — | No | | |

## Notes for the reviewer fields
- Data is collected only after the user creates an account; browsing public catalog pages needs none of it.
- Approved community restock reports are published to the Code 3 Discord and app feed **without** submitter identity; the user is told this in the form before submitting. This is user-initiated publication, not third-party sharing.
- Children: the app is not directed at children; kids-program and "Kid Mode" features are operated by the parent's account. The separate **Target audience and content** declaration should say 18+ (or 13+ with parent-managed profiles) — decide before the COPPA review on the board.
- Account deletion: users can request deletion in-app and at code3tcg.app/delete-account; audited financial records are archived per policy, which the deletion page should state.

## Open items before submitting
1. Confirm the precise-location answer (above).
2. Confirm https://code3tcg.app/delete-account and /privacy both load publicly and the privacy page names every category above (name, email, phone, photos, location, purchase/sales records, in-app messages, activity and diagnostics).
3. Decide the target-audience declaration.
