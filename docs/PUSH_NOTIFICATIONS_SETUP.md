# Push notifications (Firebase Cloud Messaging) — setup

Built Nov 15, 2026. The code is in place; three things only the owner can do
turn it on. Until then the app works normally and simply sends no pushes.

## What is already built

| Piece | Where |
| --- | --- |
| Device token table (owner-only, session-checked) | Supabase `device_push_tokens`, migration `20261115030000_device_push_tokens.sql` |
| Register a device for the signed-in account | RPC `register_push_token(token, platform, app_version)` |
| Send a push to members' devices | Edge function `send-push` (server-only: requires the service-role key) |
| Android permission | `POST_NOTIFICATIONS` in `AndroidManifest.xml` |
| Android build picks up Firebase | `android/app/build.gradle` applies the Google Services plugin when `google-services.json` exists |
| CI build writes the Firebase file | `.github/workflows/android-release.yml` step "Add Firebase config…" |
| App asks for permission and registers | `src/native/pushNotifications.js` (only on Android/iOS, only after the person turns alerts on) |

## What you need to do (about 15 minutes)

1. **Create the Firebase project.** console.firebase.google.com → Add project
   → name it "Code 3 TCG" (Analytics off is fine).
2. **Add the Android app.** In the project: Add app → Android → package name
   `com.code3tcg.app` → download `google-services.json`.
   - For local builds: put it in `android/app/google-services.json`.
   - For the GitHub "Android signed beta build": add a repository secret
     `GOOGLE_SERVICES_JSON_BASE64` whose value is the file base64-encoded
     (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json"))`).
3. **Give Supabase permission to send.** Firebase → Project settings → Service
   accounts → Generate new private key (a JSON file). In Supabase → Edge
   Functions → Secrets, add `FCM_SERVICE_ACCOUNT` with the **whole JSON file
   contents** as the value. Treat this file like a password: don't commit it,
   don't paste it in chat, delete the download after adding the secret.

Then build a new Android bundle (the workflow turns the app's push code on automatically when the secret exists). On the phone, turning on alerts asks for
notification permission and registers the device.

## Sending a push (for the team)

`send-push` accepts only the service-role key, so it is called from other
edge functions or scheduled jobs, never from the app:

```json
POST /functions/v1/send-push
{ "user_ids": ["<uuid>"], "title": "Restock near you", "body": "Target Short Pump reported ETBs", "url": "/find/restocks" }
```

Tokens Firebase reports as unregistered are disabled automatically.

## Still to do after setup

- Hook the restock-alert and wants-alert senders to call `send-push`.
- iOS: add an APNs key to Firebase and enable Push Notifications in Xcode.
