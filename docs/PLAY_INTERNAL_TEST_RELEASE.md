# Google Play: first internal testing release (Nov 6, 2026)

Play Console needs a signed **Android App Bundle (.aab)**. The repo already has
the pipeline (`npm run native:android:release`); it must run on the PC because
it needs Java, the Android SDK and your upload keystore.

## One-time setup on the PC
1. Install Android Studio (brings the SDK) and a JDK 17+. Set `ANDROID_HOME`
   (usually `C:\Users\<you>\AppData\Local\Android\Sdk`) and `JAVA_HOME`.
2. Create the upload keystore **once** and keep it outside OneDrive
   (e.g. `C:\Keys\code3-upload.jks`). Back it up somewhere safe; losing it
   means a new app listing.
   ```
   keytool -genkeypair -v -keystore C:\Keys\code3-upload.jks -alias code3upload -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Play Console → Setup → App signing: choose **Google Play App Signing**
   (recommended). Your keystore is then only the *upload* key.

## Each release (PowerShell, in terms-page)
```
$env:JAVA_HOME="C:\Program Files\Java\jdk-17"          # your JDK path
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:CODE3_ANDROID_KEYSTORE="C:\Keys\code3-upload.jks"
$env:CODE3_ANDROID_STORE_PASSWORD="<store password>"
$env:CODE3_ANDROID_KEY_ALIAS="code3upload"
$env:CODE3_ANDROID_KEY_PASSWORD="<key password>"
$env:CODE3_BUILD_NUMBER="1"                            # +1 every upload
$env:CODE3_VERSION_NAME="1.0.0"
npm run native:android:release
```
Output: `android\app\build\outputs\bundle\release\app-release.aab`.
Drag that file into Play Console → Internal testing → Create release → Upload.

## Then in Play Console
- Release name: keep "Code 3 TCG — first internal test".
- Release notes (en-US): "First internal test of Code 3 TCG. Everything is free
  during beta. Sign in with the account you created on code3tcg.app."
- Testers: add an email list (you, Dillon, early testers) under Internal
  testing → Testers; share the opt-in link.
- App access declaration: Yes → use the `playreview@code3tcg.com` account
  (already confirmed and beta-approved in Supabase).
- Build number must go up by one on every upload (`CODE3_BUILD_NUMBER`).

## Notes
- The beta is open: every signup is auto-approved (see `docs/sql/open_beta_auto_approve.sql`).
- The web app on code3tcg.app and the Android build share the same Supabase backend; no separate accounts.
