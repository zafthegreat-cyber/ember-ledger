# Google, Apple, Discord and Facebook sign-in

Prepared October 30, 2026 for the existing Code 3 TCG website and Capacitor Android/iOS app. The provider integration is implemented locally; all four production providers were disabled at the initial readback. This document is not an activation receipt. Email/password and its existing confirmation/recovery links remain supported. Best Buy remains paused.

## Destinations and scope

Use the existing **Code 3 TCG** Supabase project, `gxsfququorfczvhrkudl`. Do not substitute a portfolio identity service or another app's project.

All four developer applications use this exact authorized provider callback:

```text
https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback
```

Supabase's redirect allowlist also needs these exact application destinations:

```text
https://code3tcg.app/auth/callback
code3tcg://auth/callback?flow=oauth
```

Keep existing sign-in, confirmation and password-recovery destinations. Add only exact production/native destinations; do not add a wildcard Vercel domain. Local OAuth acceptance requires separately authorized exact localhost callback addresses.

Provider client secrets belong only in **Supabase Authentication → Sign In / Providers**, not in Vercel frontend variables, app bundles, Git, chat, Discord messages or function source. Supabase performs the provider token exchange. Code 3 stores its ordinary Supabase session; it does not retain provider API tokens after adopting the verified session.

## Developer setup

| Provider | Required developer setup | Minimum identity access |
|---|---|---|
| Google | Dedicated Google Cloud project; Google Auth Platform branding/audience; Web OAuth client; JavaScript origin `https://code3tcg.app`; exact Supabase callback above | OpenID, email, basic profile |
| Apple | Apple Developer membership; Sign in with Apple App ID; Services ID; Team ID and signing key; Supabase domain and callback; a generated client secret with rotation before expiry | Email and name when supplied; support Hide My Email |
| Discord | Existing Code 3 TCG Community application `1563636539370639420`, or a separate approved sign-in application; OAuth2 redirect above; OAuth client secret | `identify email`; no bot, guild, friends or messaging scopes |
| Facebook | Meta developer application with Facebook Login; exact callback; app domain, privacy/deletion information; email permission and appropriate live/test mode | Public profile and email; no posts, friends or groups |

A dedicated Google project creation was previously submitted with ID `code3tcg-signin-20261030`. The later console readback under the Code 3 owner Google account reports missing project access, and the project picker has no accessible project for it. This does not establish whether the project exists under another account. Select its owning account or confirm the intended project before creating a duplicate. No working Google OAuth client or secret has been verified.

The existing Discord app's OAuth2 page was available and showed **no configured redirects** and a hidden client secret. Its bot token is not an OAuth client secret. Do not reset the bot token. If a client-secret reset is necessary, the owner must complete it and keep the resulting value private.

Apple enrollment, verification, contractual acceptance and any membership payment require the owner. No paid membership or new billing account has been created by this implementation. Google branding/audience and Meta app review may require owner verification before general availability.

## Google, Facebook and Apple account setup

The October 30 public-settings readback reports email, Discord and phone enabled; Google, Facebook and Apple remain disabled. Phone reports Twilio with automatic phone confirmation off. This proves configuration flags only: no SMS was sent, no phone sign-in screen was added, and neither SMS delivery nor social authorization is accepted by this readback.

Shared application information:

| Field | Code 3 value |
|---|---|
| Application name | Code 3 TCG |
| Website | `https://code3tcg.app` |
| Privacy policy | `https://code3tcg.app/privacy` |
| Terms | `https://code3tcg.app/terms` |
| Account deletion instructions | `https://code3tcg.app/delete-account` |
| Existing native bundle/application ID | `app.code3tcg.mobile` |
| Provider callback | `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback` |

These public identifiers are not provider credentials. Confirm ownership of the chosen developer account before saving a client. Keep the existing Supabase app-return URLs and manual linking configuration.

### Google

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Select the intended Code 3 project using its owning account. Complete branding with the public app information and an owner-controlled support address. Configure the audience for the intended users; a restricted test audience is not public availability.

In Clients, create a **Web application** named `Code 3 TCG sign-in`. Set the JavaScript origin to `https://code3tcg.app` and its redirect URI to the shared provider callback above. Copy its client ID and client secret directly into [Supabase Auth providers](https://supabase.com/dashboard/project/gxsfququorfczvhrkudl/auth/providers) → Google. Do not request extra Google API access for login. Save, then verify a live roundtrip and existing-account connection before releasing the button. [Official guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

### Facebook

Open [Meta apps](https://developers.facebook.com/apps/). Use a Code 3 application with Facebook Login / Authentication and Account Creation. Configure **Valid OAuth Redirect URIs** with the shared provider callback. In Use Cases, confirm both `public_profile` and `email` are ready for testing; email is required by this integration.

Supply the public app/policy information where requested. Copy the app ID and app secret directly into Supabase → Facebook. Development access and a test login are not proof that ordinary members can use the application: complete Meta's applicable live-access requirements before releasing it. [Official guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook).

### Apple

Use the owner's [Apple Developer account](https://developer.apple.com/account/). Confirm enrollment and the existing `app.code3tcg.mobile` App ID, then enable its Sign in with Apple capability. Reuse an appropriate Services ID or register a separate one; `app.code3tcg.web` is a proposal, not a verified registration.

For this browser OAuth flow, configure the Services ID with domain `gxsfququorfczvhrkudl.supabase.co` and the shared provider callback. Generate the client secret from the owner's signing key and enter it directly in Supabase → Apple. Keep the Services ID first in Supabase's client-ID list if native audiences are also listed. Protect the `.p8` key outside the repository; record the generated secret's expiry and rotate it before expiration, at most six months. Verify Hide My Email and same-account linking. [Official guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple).

## Existing-account linking

Enable Supabase's manual identity linking only as a reviewed production authentication change. Set the frontend linking gate only after testing it. Existing users sign in with their current method, open Account → Ways to sign in, and choose a provider to connect. Settings → Account Security also links to this page. Supabase verifies the provider identity; the app verifies the signed user and current server session before and after the exchange. The resulting user ID must match the original account. A different ID fails without adopting that session or moving records.

Supabase also has its own verified-email identity-linking rules. The app never merges records based on an email field entered in the browser. Apple relay addresses or a different provider email must use the signed-in connection flow to preserve the original account.

## Release gates

These are nonsecret build settings, initially disabled for both website and native builds:

```text
VITE_AUTH_VERIFIED_PROVIDERS=
VITE_AUTH_ACCOUNT_LINKING_VERIFIED=false
```

After live acceptance, add only the verified provider IDs (for example `google,discord`). A provider button also requires the live Supabase settings endpoint to report that provider enabled. A missing setting, failed lookup or unverified provider yields no working button. Public provider settings are never used to authorize access to records.

For native releases, include the same public gates in the native build configuration, then rebuild and sync Capacitor. Browser plugin `8.0.5` is pinned; both Android Gradle and iOS Swift Package Manager registrations are included. The existing encrypted native session storage and deep-link origin checks remain in place.

The Android beta workflow reads these two public gates from GitHub repository variables alongside its existing public Supabase configuration. Local native builds read them from `.env.native.local` or the process environment. The native build receipt records the included provider IDs and linking gate. Smoke bundles force both gates off and must not be distributed for sign-in testing. Native app binaries installed before this release need an update; a website deployment alone does not replace their bundled code.

## Acceptance before each provider is advertised

1. Verify exact provider callback, minimal scopes, public/live audience and secret configuration without printing secrets.
2. Finish a real website authorization roundtrip, cancellation and expired-link check. Confirm the existing email login, confirmation and recovery flows still work.
3. Link a provider from an existing ordinary account; prove the same server user ID, collection and workspace permissions remain. Try a different account and confirm records remain isolated. Do not test only with the owner.
4. On Android and iOS devices, confirm the OS browser opens, the app deep link returns, the signed server session is valid, cancellation is recoverable and duplicate callbacks do not duplicate exchanges. Native web compilation and mocked bridges do not prove physical-device login.
5. Verify Apple relay-email behavior and Google/Meta public audience restrictions. Keep confirmed-session, explicit account restriction and private workspace checks. Ordinary signup no longer requires beta approval.
6. Add that provider to the public build gate and deploy a reviewed release. Record the deployed commit and results. Do not claim an unconfigured provider works.

Official setup references: [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple), [Discord](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord), [Facebook](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [Capacitor Browser](https://capacitorjs.com/docs/apis/browser).
