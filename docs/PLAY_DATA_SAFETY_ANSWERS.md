# Code 3 TCG — Google Play Data safety form answers (Nov 23, 2026)

Package `app.code3tcg.mobile`. Rebuilt on Nov 23, 2026 by reading the Android build itself, not the schema: the manifest, `package.json`, `nativeLaunchScope.js` (what Android hides), and every place the app sends data. It replaces the Nov 7 draft, which listed things the app does not do (SMS, member messages, campaign IDs) and missed things it does (precise location sync, Sentry, Anthropic, push). The old version is in git history.

Copy the answers into Play Console → App content → Data safety. Lines marked **Decide** need you first.

## Overview questions
| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only: `usesCleartextTraffic="false"`, `androidScheme: https`) |
| Do you provide a way for users to request that their data is deleted? | **Yes** |
| Delete-account URL | https://code3tcg.app/delete-account |
| Privacy policy URL | https://code3tcg.app/privacy |

## Shared?
**No for every row.** Everyone who receives data is a service provider acting for us, which Play does not count as sharing: Supabase (account, database, files), Vercel (API), Sentry (crash logs), Anthropic (AI scan photos, not stored), Google FCM (push delivery), our own Discord webhook (feedback text), OpenStreetMap tiles (map tiles; IP only). No ads, no analytics SDK, no advertising ID, nothing sold. No payments in the Android app (Stripe is web-only and sandbox; no Play Billing).

Ephemeral processing = **No** everywhere except Photos (see that row).

## Data types collected
| Category | Data type | Collected? | Required or optional | Purposes | What it is |
| --- | --- | --- | --- | --- | --- |
| Personal info | Name | Yes | **Required** | Account management | First and last name at email sign-up (shown to no one; the public name is the username) |
| Personal info | Email address | Yes | **Required** | Account management, Developer communications | Sign-up and sign-in. Guests may add an email to feedback (optional) |
| Personal info | User IDs | Yes | Required | Account management, App functionality, Fraud prevention, security and compliance | Account ID and the public username chosen at sign-up |
| Personal info | Other info | Yes | Optional | App functionality | Age confirmation and consent dates; names the user gives their signed-in devices |
| Personal info | Phone number, address, race, political/religious, sexual orientation | **No** | | | |
| Financial info | Purchase history | Yes | Optional | App functionality | Purchases, receipts and expenses the user records |
| Financial info | Other financial info | Yes | Optional | App functionality | Sales, profit, mileage and listings the user records. No card numbers |
| Financial info | Payment info, credit score | **No** | | | |
| Location | Precise location | **Yes** | Optional | App functionality | Only if the user taps **Use Device Location** in Settings: saved to about 11 m and synced with cloud saving. Restock reports never include coordinates |
| Location | Approximate location | Yes | Optional | App functionality | City and state on seller listings and on restock reports' store |
| Photos and videos | Photos | Yes | Optional | App functionality | Receipt, item and restock-proof photos the user uploads (private storage). On paid plans, tapping **Identify with AI** sends that one photo to Anthropic to name the card; it is not stored there or by us. For that part only you may tick **processed ephemerally** |
| Photos and videos | Videos | **No** | | | |
| App activity | App interactions | Yes | **Required** | Analytics, App functionality | Signed-in use records which features were opened (e.g. search, a restock report sent). Not optional today: see Decide 2 |
| App activity | Other user-generated content | Yes | Optional | App functionality | Collection and inventory, restock reports, watchlists, saved searches, reports of bad content |
| App activity | Other actions | Yes | Optional | App functionality | Preferences and alert settings |
| App activity | In-app search history, installed apps, web browsing | **No** | | | |
| App info and performance | Crash logs | Yes | Optional | App functionality | Sentry error reports with emails, long numbers, tokens and typed text removed; never sent for kid-safe profiles. On by default, can be turned off in Settings |
| App info and performance | Diagnostics | Yes | Optional | App functionality | With feedback only: screen size, theme, language, app version, browser string |
| Device or other IDs | Device or other IDs | Yes | Optional | App functionality | The push notification token, only after the user turns on phone alerts |
| Messages | Emails, SMS, other in-app messages | **No** | | | Members cannot message each other. Feedback is declared under App activity / user content |
| Contacts, Calendar, Audio, Files and docs, Health and fitness | — | **No** | | | No such permissions in the manifest |

## Reviewer notes (optional field)
- Data is sent only for signed-in users, except: guest feedback (optional email), and crash reports, which also run for guests unless turned off.
- Restock reports are shown to other members without the reporter's identity.
- The Android app hides Community, the kids program and sponsor forms; they are website-only.
- Card, barcode and screenshot text reading happens on the phone (no upload).
- Deletion at /delete-account removes the account, its records, its synced workspaces and its uploaded files immediately; Supabase's own backups expire within about 7 days.

## Decide before you submit
1. **Social sign-in.** Google/Apple/Discord/Facebook buttons only show if `VITE_AUTH_VERIFIED_PROVIDERS` lists them in the build. If any are live in the Play build, deletion is a problem: it requires a fresh **password** sign-in, so a Google-only user cannot delete their account without first setting a password. Google requires deletion to work for every account. Either keep social sign-in off in the Play build, or I can make deletion work for social-only accounts.
2. **Activity records.** `app_activity_events` are sent for every signed-in user with no way to turn them off, so this row must say Required. If you would rather it be Optional, I can add an off switch (or put it under the existing crash-report switch).
3. **Crash logs on by default.** Play accepts an off switch as Optional. Also confirm in Sentry → Project settings → Security & privacy that **Prevent storing of IP addresses** is on (that is your setting, I can't change it).
4. **Privacy policy gaps** (`src/config/privacyPolicy.js`). The form and the policy should agree. The policy:
   - doesn't say device location from **Use Device Location** is saved and synced;
   - only vaguely mentions activity records;
   - says website Community posts stay on the device, but signed-in posts are saved to the server for moderation;
   - tells people to "confirm your password" to delete, with nothing for social-only accounts.
   I can update the policy text once you decide 1 and 2.
5. **Target audience.** Unchanged from the old draft: the app isn't directed at children (Android hides the kids program), so declare 13+ with parent-managed kid-safe profiles, or 18+.
