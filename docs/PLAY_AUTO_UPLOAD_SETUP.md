# Automatic Play upload: one-time setup

After this setup, the **Android signed beta build** workflow uploads each build to Google Play
by itself. You no longer download the zip and drag the `.aab` into Play Console.

The workflow only creates a **draft** release on a testing track (Alpha by default, or Internal).
It never starts a rollout and never touches Production. You still open Play Console and click
**Start rollout**.

## 1. Create a service account (Google Cloud, about 5 minutes)

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=code-3-tcg
2. Click **Create service account**. Name it `play-upload` and click **Create and continue**.
3. Skip the role step: click **Continue**, then **Done**.
4. Click the new `play-upload@code-3-tcg.iam.gserviceaccount.com` account → **Keys** →
   **Add key → Create new key → JSON**. A `.json` file downloads.
   - If Google says key creation isn't allowed, set the organization policy
     **Disable service account key creation** (the "managed" one) to **Off** for
     project Code 3 TCG first. Turn it back **On** after the key is made.
5. Copy the `play-upload@...` email address.

## 2. Give it access in Play Console (about 2 minutes)

1. Play Console → **Users and permissions** → **Invite new users**.
2. Paste the `play-upload@...` email.
3. Under **App permissions**, add **Code 3 TCG** and tick only:
   - **Release apps to testing tracks**
   - **View app information (read-only)**
4. Click **Invite user**, then confirm.

Don't give it "Release to production" or any admin rights.

## 3. Add the key to GitHub (about 1 minute)

1. Copy the key file to the clipboard (PowerShell):
   ```powershell
   Get-ChildItem "$env:USERPROFILE\Downloads\code-3-tcg-*.json" | Sort-Object LastWriteTime | Select-Object -Last 1 | Get-Content -Raw | Set-Clipboard
   ```
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**.
3. Set the name to `PLAY_SERVICE_ACCOUNT_JSON`, paste the key, and click **Add secret**.
4. Delete the `.json` file from Downloads.

## Making a build after setup

Go to GitHub → **Actions → Android signed beta build → Run workflow** and fill in:
- **build number**: one higher than the last build in Play
- **Play track**: `alpha` (or `internal`; choose `none` to skip the upload)
- **What's new**: optional

When the run is green, open Play Console → **Testing → Closed testing → Alpha**. The draft
release is there. Review it and click **Start rollout**.

If the secret isn't set, the run still builds and shows a warning, and you upload by hand as before.
