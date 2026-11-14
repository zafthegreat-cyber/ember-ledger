# Push notifications — setup

Server side built Nov 15, 2026; the Android/iPhone app side and Apple delivery
were finished Nov 14, 2026 (store audit). Until the steps below are done the
app works normally and simply sends no pushes.

## How it works

| Piece | Where |
| --- | --- |
| Device token table (owner-only, session-checked) | Supabase `device_push_tokens`, migration `20261115030000_device_push_tokens.sql` |
| Save a device for the signed-in account | RPC `register_push_token(token, platform, app_version)` |
| App asks permission, gets the token, saves it, opens tapped alerts | `src/native/pushNotifications.js`, used by the Alerts panel ("Turn on phone alerts") |
| Send a push | Edge function `send-push`: Android tokens through Firebase (FCM HTTP v1), iPhone tokens straight to Apple (APNs). Server-only: needs the service-role key. |
| Android permission | `POST_NOTIFICATIONS` in `AndroidManifest.xml` |
| Android Firebase file | `android/app/google-services.json` (local) or the `GOOGLE_SERVICES_JSON_BASE64` secret (GitHub build). Without it the app never tries to register, because that would crash. |
| iPhone | `ios/App/App/App.entitlements` (push), token hand-off in `AppDelegate.swift` |

## What you need to do

### Android (about 15 minutes)
1. **Create the Firebase project.** console.firebase.google.com → Add project → "Code 3 TCG" (Analytics off is fine).
2. **Add the Android app** with package name **`com.code3tcg.app`** (the Play application ID, not the iPhone bundle ID) → download `google-services.json`.
   - GitHub "Android signed beta build": add a repository secret `GOOGLE_SERVICES_JSON_BASE64` with the file base64-encoded
     (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json")) | Set-Clipboard`).
   - Local builds: put the file at `android/app/google-services.json` (it is not committed).
3. **Let Supabase send through Firebase.** Firebase → Project settings → Service accounts → Generate new private key.
   In Supabase → Edge Functions → Secrets add `FCM_SERVICE_ACCOUNT` = the whole JSON file. Delete the download afterwards; never commit or paste it in chat.

### iPhone (about 10 minutes, after Apple enrollment)
1. developer.apple.com → Certificates, IDs & Profiles → Identifiers → `app.code3tcg.mobile` → turn on **Push Notifications**.
   (The iOS TestFlight workflow's automatic signing also does this.)
2. Keys → **+** → name it "Code 3 push", tick **Apple Push Notifications service (APNs)** → download the `.p8` (offered once). Note the Key ID.
3. In Supabase → Edge Functions → Secrets add:
   - `APNS_KEY` = the whole `.p8` file contents
   - `APNS_KEY_ID` = the Key ID
   - `APNS_TEAM_ID` = your 10-character Team ID
   - `APNS_ENVIRONMENT` = `sandbox` only if you test with a build installed straight from Xcode; leave it unset for TestFlight and the App Store.

No Firebase setup is needed for iPhone.

## Sending a push (for the team)

`send-push` accepts only the service-role key, so it is called from other edge
functions or scheduled jobs, never from the app:

```json
POST /functions/v1/send-push
{ "user_ids": ["<uuid>"], "title": "Restock near you", "body": "Target Short Pump reported ETBs", "url": "/find/restocks" }
```

The response says how many were `sent`, `skipped` (platform not configured yet)
and `disabled` (tokens Firebase or Apple no longer accept).

## Still to do

- Hook the restock-alert and wants-alert senders to call `send-push`.
- Store forms: declare "Device or other IDs" (push token) for app functionality in Google Data safety and Apple App Privacy.
