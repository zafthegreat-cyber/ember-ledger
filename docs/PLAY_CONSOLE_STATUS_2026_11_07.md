# Google Play Console — Code 3 TCG status (Nov 7, 2026)

App: Code 3 TCG · Play package name **com.code3tcg.app** · developer account 6824089950568083881 · app id 4973093410515701791.

## Done in the console today
- **Data safety** — complete and saved. 16 data types declared as collected, none shared, not ephemeral, encrypted in transit. Required: Email, User IDs. Optional: Name, Phone, Other info (kids-program names/age range), Purchase history, Other financial info, Approximate location, Precise location, Other in-app messages, Photos, Diagnostics, App interactions, Other user-generated content, Other actions, Device or other IDs. Delete-account and delete-data URLs: https://code3tcg.app/delete-account. Account creation: username+password and OAuth.
- **Content rating (IARC)** — questionnaire completed and saved. Result: **ESRB Teen / PEGI Parental Guidance / 12+ elsewhere**, driven by two answers made before this session: "app can contain violent material (cartoony)" and "user-generated content is the primary source of content". See the note below.
- **Internal testing → Testers** — email list "Code 3 internal testers" created and selected (owner@code3tcg.com). `playreview@code3tcg.com` was rejected because it is not a Google account.
- Dashboard: all 12 "Set up your app" tasks complete; closed/open/production tracks are unlocked.

## Blockers before the first internal test
1. **Package name mismatch.** Play App Signing is already active for `com.code3tcg.app` (key created Nov 6). The repo builds `app.code3tcg.mobile` (`android/app/build.gradle` → `applicationId`). An upload with the wrong package is rejected. Fix: set `applicationId "com.code3tcg.app"` in build.gradle (namespace can stay `app.code3tcg.mobile`), rebuild. Update the Google/Apple/Discord OAuth app registrations and `SOCIAL_SIGN_IN_SETUP.md` to the new id when those are created.
2. **No bundle uploaded.** The draft release "Code 3 TCG — first internal test" has release notes but no `.aab`. Build on the PC per `docs/PLAY_INTERNAL_TEST_RELEASE.md` (build.gradle requires `CODE3_BUILD_NUMBER` ≥ 7), then Internal testing → Edit release → upload → Save and publish.

## Decision to revisit: content rating
A Teen/12+ rating sits awkwardly next to a kid-friendly brand and the Target audience declaration. Both answers that raised it are judgement calls:
- *Violent material*: the app's own content is a card catalog, prices and collection tools; card artwork is third-party product imagery, not app content. Most collecting/marketplace apps answer **No**.
- *UGC is the primary source of content*: the catalog and the user's own collection are primary; community posts are secondary → **No**.
With both set to No (keeping "users interact", block/report = Yes) the result is typically **Everyone / PEGI 3** with "Users Interact". The questionnaire can be resubmitted any time from App content → Content ratings → Start new questionnaire.

## Housekeeping
- Privacy policy URL in console: https://code3tcg.com/privacy (loads; covers all declared categories). App docs cite code3tcg.app/privacy — make both resolve.
- Policy mentions Sentry/Vercel analytics; neither is in the Android bundle. Harmless over-declaration.
- Add Dillon's Gmail to the tester list; the opt-in link appears after the first release publishes.
