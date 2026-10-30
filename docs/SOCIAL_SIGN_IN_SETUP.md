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

A dedicated Google project creation was submitted with ID `code3tcg-signin-20261030`. Its final console readback was interrupted by a browser-tool change. Check whether it exists before creating another project. No OAuth client or secret was created in that operation.

The existing Discord app's OAuth2 page was available and showed **no configured redirects** and a hidden client secret. Its bot token is not an OAuth client secret. Do not reset the bot token. If a client-secret reset is necessary, the owner must complete it and keep the resulting value private.

Apple enrollment, verification, contractual acceptance and any membership payment require the owner. No paid membership or new billing account has been created by this implementation. Google branding/audience and Meta app review may require owner verification before general availability.

## Existing-account linking

Enable Supabase's manual identity linking only as a reviewed production authentication change. Set the frontend linking gate only after testing it. Existing users sign in with their current method, open Settings → Cloud saving → Ways to sign in, and choose a provider to connect. Supabase verifies the provider identity; the app verifies the signed user and current server session before and after the exchange. The resulting user ID must match the original account. A different ID fails without adopting that session or moving records.

Supabase also has its own verified-email identity-linking rules. The app never merges records based on an email field entered in the browser. Apple relay addresses or a different provider email must use the signed-in connection flow to preserve the original account.

## Release gates

These are nonsecret build settings, initially disabled for both website and native builds:

```text
VITE_AUTH_VERIFIED_PROVIDERS=
VITE_AUTH_ACCOUNT_LINKING_VERIFIED=false
```

After live acceptance, add only the verified provider IDs (for example `google,discord`). A provider button also requires the live Supabase settings endpoint to report that provider enabled. A missing setting, failed lookup or unverified provider yields no working button. Public provider settings are never used to authorize access to records.

For native releases, include the same public gates in the native build configuration, then rebuild and sync Capacitor. Browser plugin `8.0.5` is pinned; both Android Gradle and iOS Swift Package Manager registrations are included. The existing encrypted native session storage and deep-link origin checks remain in place.

## Acceptance before each provider is advertised

1. Verify exact provider callback, minimal scopes, public/live audience and secret configuration without printing secrets.
2. Finish a real website authorization roundtrip, cancellation and expired-link check. Confirm the existing email login, confirmation and recovery flows still work.
3. Link a provider from an existing ordinary account; prove the same server user ID, collection and workspace permissions remain. Try a different account and confirm records remain isolated. Do not test only with the owner.
4. On Android and iOS devices, confirm the OS browser opens, the app deep link returns, the signed server session is valid, cancellation is recoverable and duplicate callbacks do not duplicate exchanges. Native web compilation and mocked bridges do not prove physical-device login.
5. Verify Apple relay-email behavior and Google/Meta public audience restrictions. Keep new-account beta/access checks.
6. Add that provider to the public build gate and deploy a reviewed release. Record the deployed commit and results. Do not claim an unconfigured provider works.

Official setup references: [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple), [Discord](https://supabase.com/docs/guides/auth/social-sign-in/auth-discord), [Facebook](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [Capacitor Browser](https://capacitorjs.com/docs/apis/browser).
