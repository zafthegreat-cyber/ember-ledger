# Sign-in options: owner checklist (Google, Facebook, Discord, Apple)

Written November 14, 2026. This is the click-by-click list for turning on each sign-in button. The app code is already finished; the background and safety rules are in [SOCIAL_SIGN_IN_SETUP.md](SOCIAL_SIGN_IN_SETUP.md).

**You type every client ID, secret and key yourself.** Never paste them into chat, Git, GitHub variables, Vercel or Discord. They only go into the Supabase provider page.

## Status on November 14, 2026 (live Supabase readback)

| Provider | Supabase switch | In release gate | What's left |
|---|---|---|---|
| Discord | **On** | No | Steps D1–D3, then test and add to the gate |
| Google | Off | No | Steps G1–G6 |
| Facebook | Off | No | Steps F1–F7 |
| Apple | Off | No | Steps A1–A7 (needs a paid Apple Developer membership) |

## How a button appears

A button shows only when **both** of these are true:

1. The provider is switched on in Supabase → Authentication → Sign In / Providers.
2. Its ID (`google`, `facebook`, `discord`, `apple`) is listed in the build setting `VITE_AUTH_VERIFIED_PROVIDERS`.

On the **iPhone app**, no social buttons show until **Apple** is also on and listed (App Store rule 4.8). The website and Android show any provider that passes both checks.

After any social sign-in, a new account sees the one-time "I am 13 or older" card before anything else. "I'm under 13" signs them out and points to the parent-managed (kid account) path. That works the same for all four providers. You don't need to set anything up for it.

## Values to copy and paste (these are public, not secrets)

| What | Value |
|---|---|
| Provider callback (paste into Google, Facebook, Discord, Apple) | `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback` |
| Supabase redirect URL: website | `https://code3tcg.app/auth/callback` |
| Supabase redirect URL: phone apps | `code3tcg://auth/callback?flow=oauth` |
| Website / home page | `https://code3tcg.app` |
| Privacy policy | `https://code3tcg.app/privacy` |
| Terms of use | `https://code3tcg.app/terms` |
| Account / data deletion instructions | `https://code3tcg.app/delete-account` |
| Android package | `com.code3tcg.app` |
| iOS bundle ID (Apple App ID) | `app.code3tcg.mobile` |
| Supabase project | `gxsfququorfczvhrkudl` |

To put a value on your clipboard from PowerShell, for example the callback:

```powershell
Set-Clipboard "https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback"
```

## Step 0: Supabase redirect URLs (do once)

1. Open [Supabase → Authentication → URL Configuration](https://supabase.com/dashboard/project/gxsfququorfczvhrkudl/auth/url-configuration).
2. Under **Redirect URLs**, make sure both of these are listed exactly. Add any that are missing and keep the existing entries:
   - `https://code3tcg.app/auth/callback`
   - `code3tcg://auth/callback?flow=oauth`
3. Do not add wildcards such as `https://*.vercel.app/**`.

## Discord (switched on in Supabase already)

App: the existing **Code 3 TCG** application, client ID `1563636539370639420`.

- **D1.** Open the [Discord Developer Portal](https://discord.com/developers/applications) → Code 3 TCG → **OAuth2**.
- **D2.** Under **Redirects**, add `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback` and save. (On Oct 30 this list was empty. Without this entry, Discord sign-in fails even though Supabase shows Discord as on.)
- **D3.** In [Supabase → Sign In / Providers → Discord](https://supabase.com/dashboard/project/gxsfququorfczvhrkudl/auth/providers), check that the client ID is `1563636539370639420` and a secret is saved. If you're unsure the secret is right, click **Reset Secret** in Discord under OAuth2 → Client Secret, then paste the new value straight into Supabase. This is **not** the bot token. Don't reset the bot token.
- No bot, guild or messaging scopes are needed. The app asks only for `identify email`.

## Google

- **G1.** Open [Google Cloud console](https://console.cloud.google.com/) signed in as the Code 3 owner account. Pick the Code 3 project, or create one named `Code 3 TCG Sign-in`. A project `code3tcg-signin-20261030` may already exist under another Google account. Check that account before creating a duplicate.
- **G2.** Go to **Google Auth Platform → Branding**. Fill in:
  - App name: `Code 3 TCG`
  - Support email: an inbox you own
  - Logo: optional (adding one triggers Google's brand review)
  - Home page, privacy and terms: from the table above
  - Authorized domains: `code3tcg.app` and `supabase.co`
- **G3.** Go to **Audience**. Choose **External**, then click **Publish app** so the status is **In production**. If you leave it in "Testing", only the test users you list can sign in.
- **G4.** Go to **Data Access**. The only scopes should be `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These don't need Google's sensitive-scope review.
- **G5.** Go to **Clients → Create client**:
  - Type: **Web application**
  - Name: `Code 3 TCG sign-in`
  - Authorized JavaScript origins: `https://code3tcg.app`
  - Authorized redirect URIs: `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback`
  - Create it. You don't need separate Android or iOS clients: the phone apps use the same browser sign-in.
- **G6.** In [Supabase → Sign In / Providers → Google](https://supabase.com/dashboard/project/gxsfququorfczvhrkudl/auth/providers), turn on **Enable Sign in with Google**, type the **Client ID** and **Client Secret**, leave "Skip nonce checks" off, and save.

## Facebook

- **F1.** Open [Meta for Developers → My Apps](https://developers.facebook.com/apps/) → **Create app**. Pick the use case **Authenticate and request data from users with Facebook Login**. Name: `Code 3 TCG`. Contact email: an inbox you own.
- **F2.** Go to **Use cases → Authentication and account creation → Customize**, and add the **email** permission next to `public_profile`. Both should be ready for testing. The app needs email.
- **F3.** Go to **Facebook Login → Settings**. Fill in:
  - Valid OAuth Redirect URIs: `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback`
  - Client OAuth login: on
  - Web OAuth login: on
  - Enforce HTTPS: on
  - Save.
- **F4.** Go to **App settings → Basic**. Fill in:
  - App domains: `code3tcg.app`
  - Privacy policy URL, Terms of Service URL and User data deletion URL (the "Data deletion instructions URL" option): from the table above
  - Category: e.g. Entertainment
  - App icon: 1024×1024
  - Save.
- **F5.** Still on **Basic**, copy the **App ID**. Click **Show** next to **App secret** and copy it.
- **F6.** In [Supabase → Sign In / Providers → Facebook](https://supabase.com/dashboard/project/gxsfququorfczvhrkudl/auth/providers), turn it on, type the App ID into **Facebook client ID** and the App secret into **Facebook secret**, then save.
- **F7.** Back in Meta, switch **App Mode** from Development to **Live**. Meta may first ask you to verify your business or finish the data-use checkup. Until it is Live, only people with a role on the app can sign in.

## Apple (required before any social button shows on iPhone)

Needs an active Apple Developer Program membership ($99/year, owner only).

- **A1.** Open [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list) → App IDs → `app.code3tcg.mobile`. Tick **Sign in with Apple**, keep "Enable as a primary App ID", and save.
- **A2.** Go to **Identifiers → + → Services IDs**:
  - Description: `Code 3 TCG Sign-in`
  - Identifier: e.g. `app.code3tcg.signin`. Write it down: this is the **client ID** for Supabase.
  - Register it.
- **A3.** Open the new Services ID. Tick **Sign in with Apple → Configure**. Fill in:
  - Primary App ID: `app.code3tcg.mobile`
  - Domains: `gxsfququorfczvhrkudl.supabase.co`
  - Return URLs: `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback`
  - Click Next → Done → Continue → Save.
- **A4.** Go to **Keys → +**. Name it `Code 3 Sign in with Apple`, tick **Sign in with Apple**, configure it with primary App ID `app.code3tcg.mobile`, and register it.
  - **Download the `.p8` file** (you can only download it once). Keep it outside the repo and OneDrive-synced code folders.
  - Note the **Key ID** and your **Team ID** (shown at the top right of the developer site).
- **A5.** Generate the Apple client secret, a signed token made from the `.p8` file, Team ID, Key ID and Services ID. Use the generator on the [Supabase Apple guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple) on your own computer. **The secret expires after at most 6 months.** Put a calendar reminder about 5 months out to make a new one and paste it in again.
- **A6.** In [Supabase → Sign In / Providers → Apple](https://supabase.com/dashboard/project/gxsfququorfczvhrkudl/auth/providers), turn it on. Put the Services ID (e.g. `app.code3tcg.signin`) **first** in **Client IDs**, type the generated secret in **Secret Key**, and save.
- **A7.** In App Store Connect, no extra setting is needed. Rebuild the iOS app after the gate below includes `apple`.

## Turn the buttons on (release gate)

Only do this for a provider after you've tested its sign-in (next section). These settings are public and not secrets.

1. **Website (Vercel):** Vercel → Code 3 TCG project → **Settings → Environment Variables** → Production. Set:
   - `VITE_AUTH_VERIFIED_PROVIDERS` = a comma list of the providers that work, e.g. `discord,google`
   - Redeploy production. The variable is read at build time.
2. **Phone apps (GitHub):** GitHub repo → **Settings → Secrets and variables → Actions → Variables**. Set the same `VITE_AUTH_VERIFIED_PROVIDERS` value. The Android and iOS release workflows read it. Build and upload new app versions: installed apps don't change until they update.
3. **Connecting a second sign-in method to an existing account** (Settings → Account → Ways to sign in):
   - In Supabase → Sign In / Providers, turn on **Allow manual linking**.
   - Then set `VITE_AUTH_ACCOUNT_LINKING_VERIFIED` = `true` in both Vercel and GitHub variables.
   - Leave it `false` until you've tried connecting a provider to an existing test account and seen that the same collection opens.

Leaving a provider out of the list hides its button, even if Supabase has it on. That's the off switch if anything goes wrong.

## Test each provider before adding it to the gate

Use a test account, not only the owner account.

1. **Website:** sign in with the provider, confirm the 13+ card appears once, then sign out. Try **Cancel** on the provider page and confirm you land back on a "Sign-in wasn't completed" screen with nothing changed. Email/password sign-in still works.
2. **Android phone:** the browser opens, you come back to the app signed in, and Cancel returns safely.
3. **iPhone:** same as Android. With Apple, also try **Hide My Email**.
4. **If linking is on:** sign in with email, connect the provider in Ways to sign in, sign out, sign in with the provider, and confirm the same collection opens.

Then add the provider ID to the gate and redeploy.
