# Open registration and social sign-in release review

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
- Existing private record ownership, explicit account restrictions, password confirmation, backup/recovery and account-deletion boundaries remain in place. Open registration replaces the separate beta-approval requirement as described below. Social-only users can set a Code 3 password using the existing secure email flow for password-protected account actions.
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

## Owner-requested open registration

The owner requested free account signup without a beta-access request, with optional feedback and links to development groups. The login and signup entry points now say Create Account. Existing welcome, state-check and waitlist entry routes lead to the open welcome page. Account and Hearth expose the existing feedback form; signed-out users can email feedback. The existing Code 3 Discord invite and Facebook group are linked without enrolling members or sending messages. The Discord invite was verified against Discord's public API as Code 3 TCG. The optional Little Sparks program application retains its guardian confirmations and staff review; it is separate from ordinary app access.

The exact database change is `supabase/migrations/20261030155049_code3_open_member_registration.sql`. It replaces only `code3_private.has_full_app_access()`. A non-anonymous, confirmed, current server session and an existing profile are still required. Unrequested, pending and waitlisted profiles can enter. Explicit denied, suspended, disabled or blocked profile states remain restricted. Staff authorization keeps its existing checks. No profile status, role, tier, membership, private record, table policy or retention setting is rewritten.

The frontend reads the existing `has_full_app_access` RPC with the same bearer token used for the verified server user, then checks that the session has not changed. This result affects app entry only; existing row ownership and workspace-membership policies continue to authorize each request. A blocked or unavailable check shows a retry/support screen rather than an approval form. Provider release gates remain separate and default off.

Validation includes six new account-access behavior tests and 83 real local Postgres assertions (58 existing session checks and 25 open-registration checks). They cover profile creation, ordinary access without approval, own-row writes, cross-account denial, unchanged roles and plans, explicit restrictions, unconfirmed/expired/anonymous/revoked/deleted sessions, unchanged existing profiles, migration idempotency and rollback. Existing social, account-session and cloud ownership tests also pass. These fixtures create and remove only a uniquely named local test database; no real member was registered by the tests.

Roll out this function migration with the reviewed web release. Read back its exact definition and verify that the existing session/role functions and RLS policies are unchanged. Best Buy stays locked paused. To roll back enrollment, restore the preceding function definition below and redeploy the previous application commit; do not delete accounts or records:

```sql
create or replace function code3_private.has_full_app_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then false when not public.code3_current_session_valid() then false else exists(
    select 1 from public.profiles p where p.id=auth.uid() and (p.app_access is true or p.beta_status='approved'
      or p.beta_access_status='approved' or p.user_role in ('admin','moderator') or public.is_admin_or_moderator())) end
$$;
```
