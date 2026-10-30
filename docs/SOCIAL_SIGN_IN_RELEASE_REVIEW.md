# Social sign-in release review

Prepared October 30, 2026. **Discord provider configured; live acceptance and production activation pending.**

## Behavior

The website and Capacitor Android/iOS app can offer Google, Apple, Discord and Facebook alongside existing email/password login. A shared component covers the main sign-in page and both account-menu entry points. The signed-in Cloud saving account panel can connect another verified identity without changing the account's user ID. Nothing joins a Discord server or changes Discord roles.

Providers are hidden until their live Supabase provider setting and their nonsecret release gate both permit display. Manual connections have a separate gate. All gates default off. Real developer credentials, exact callbacks, provider verification/audience settings and real-account acceptance are still required; none of the four production providers was enabled during implementation.

## Account and data boundaries

- Keep the existing Supabase project and email/password session. Existing web email-confirmation and password-reset flows retain their original implicit handling.
- Social authorization uses a separate PKCE client/storage key. It verifies the provider result with the auth server and the existing server-side current-session RPC before adopting only the Supabase access/refresh tokens into the main client. Provider API tokens are not copied into the main session. Temporary OAuth storage is removed without revoking the original signed-in session.
- Pin server-session verification to the same bearer token used by the user lookup, then recheck that the session has not changed. The callback gate mounts no record writers before verification completes.
- Existing-account connection verifies the original signed user before the redirect and requires that same ID after returning. A different ID or revoked session cannot be adopted; no account or workspace records are merged by email input. Supabase's own verified identity-linking rules remain authoritative.
- Reject unknown providers, unapproved destinations, token fragments, duplicate callback parameters, external `next` redirects, missing/expired intents and unverified provider identities. Duplicate callback delivery shares one code exchange and checks that the resulting session remains valid before reusing its result.
- Native flows use the official pinned Capacitor Browser plugin, existing encrypted storage and bounded deep-link parsing. Email confirmation/recovery callbacks remain separate from OAuth callbacks.
- Existing private record ownership, beta/access approval, password confirmation, backup/recovery and account-deletion boundaries remain in place. Social-only users can set a Code 3 password using the existing secure email flow for password-protected account actions.
- The conditional public privacy description explains provider identity data, linking, Apple relay email and provider revocation without advertising unconfigured providers as working.

No database migration, auth-provider activation, RLS change, new user account, production deployment or retailer polling was performed. The earlier Google Cloud project-creation submission is recorded as pending console verification in the setup guide; no OAuth credential was created.

## Verification

- 29 social-auth/service and rendered-component tests pass, including a real SDK S256 challenge, Discord's two exact authorization paths, no UI for unconfigured providers, duplicate-click handling, callback writer gating, cancelled consent, revoked sessions, identity mismatch, same-account linking and replay after sign-out.
- 25 native runtime scenarios pass with mocked OS bridges, including verified social callbacks and preserved recovery behavior.
- 38 existing account-session checks pass; 20 cloud workspace/sync ownership scenarios pass. Existing native business-export checks also pass.
- Full source lint passes with zero errors and the existing `App.jsx` `checkUser` effect-dependency warning. The new files and other changed components have clean targeted lint.
- Website build and native web smoke bundle build pass. Existing chunk-size and mixed-import build warnings remain. Android and iOS Capacitor sync register Browser `8.0.5`; this is not an APK/archive, signed-store release or physical-device login test.
- Rendered-component tests use a DOM fixture, not a live browser authorization. Interactive browser verification stopped because Computer Use could not confidently determine the browser URL. No real provider roundtrip, provider secret configuration, ordinary-account linking against production, Apple relay-email acceptance or physical-device callback is claimed.

The old application checkout and the completed Discord community bridge are preserved. Best Buy stays paused.

## Discord activation preparation, October 30

The owner saved the Discord OAuth credentials in Supabase Auth and confirmed adding the production website, native OAuth deep link and temporary local test return URLs, plus manual identity linking. Public provider settings confirm Discord enabled while Google, Apple and Facebook remain disabled. Authorization redirects use application `1563636539370639420`, the Code 3 Supabase callback and only identity/email access. No provider credential was copied into the repository or frontend.

The private live canary runs the actual app and auth service with a development-only proof collector. It records outcome flags and per-run salted account hashes, never credentials, authorization codes or tokens. The first live attempt reached Discord but displayed **Invalid OAuth2 redirect_uri**. The owner must save `https://gxsfququorfczvhrkudl.supabase.co/auth/v1/callback` in that Discord application's OAuth2 Redirects before the roundtrip can finish. Supabase's application-return allowlist is a separate setting.

The Account page now exposes the existing verified connection component; Settings → Account Security links there. A usable native web bundle builds with Discord and the linking gate, and Android/iOS sync register Browser `8.0.5`. Native build receipts report the included provider gates, and the Android workflow reads their public repository variables. No APK, signed archive or physical-device authorization has been produced by these checks. Production gates remain off pending real authorization and same-account acceptance.

## Remaining activation

Follow [SOCIAL_SIGN_IN_SETUP.md](SOCIAL_SIGN_IN_SETUP.md) for exact provider callbacks and per-provider acceptance. Store credentials only in Supabase Auth provider configuration. Enable only accepted providers in `VITE_AUTH_VERIFIED_PROVIDERS` and set `VITE_AUTH_ACCOUNT_LINKING_VERIFIED=true` only after server configuration and live same-account linking acceptance. Rebuild both the website and native app with the accepted public gates; do not distribute the deliberately unconfigured native smoke bundle.

Rollback of a future activation: remove the affected provider ID from the public gate and redeploy/rebuild, then disable the provider in Supabase if appropriate. Keep email/password and existing identity/record ownership intact. Do not delete identities or records as a rollback action.
