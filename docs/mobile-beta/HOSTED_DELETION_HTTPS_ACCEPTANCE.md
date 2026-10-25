# Isolated HTTPS deletion and attachment acceptance

This runner closes a different gap from the October 18, 67-check acceptance: it calls an actual deployed HTTPS API and can drive its real public deletion page. The existing loopback fault-recovery runner remains unchanged. Adding these scripts is not a hosted pass, production enablement, or physical-device certification.

## Prepare and independently review the target

Use only a disposable, data-less Supabase project with synthetic accounts/files. The currently prepared target is `gvudurifesjatwforpnx`, branch `code3-privacy-final-20261024`, parent `gxsfququorfczvhrkudl`. This names the intended environment; confirm its current identity, isolation, readiness and authorized cost before execution. Never copy production Auth records, business data, Storage bytes, prices or server secrets.

Install the reviewed empty schema, required grants and policies, current-session/cloud RPCs, and both account-deletion/private-attachment migrations. Historical migration gaps require reviewed reconstruction; do not blindly replay unrelated pending migrations. Four buckets must already exist and be private: `receipts`, `receipt-images`, `product-submissions`, and `feedback-screenshots`. The runner does not provision environments, apply SQL, create buckets, alter privacy, or enable production deletion.

Deploy the current source to an immutable **Preview** deployment. Inspect its actual Vercel metadata independently and record its deployment ID, immutable origin, environment, source revision and isolated configuration. URL syntax does not prove a deployment is Preview. Pin the reviewed ID and origin below; the runner checks `/app-version.json` matches that ID before creating any account. Stable project aliases, git aliases, custom domains, `code3tcg.app`, the production Supabase project and known production deployment URLs/IDs are rejected even when allowlisted. Add any newly observed production URL/ID to the explicit deny variables.

Configure only the intended test Preview/branch scope:

| Preview variable | Value/purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Exact isolated project origin |
| `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` | That project's public/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | That project's server-only secret, in an approved Sensitive Preview destination |
| `CODE3_ACCOUNT_DELETION_ENABLED` | `true` in the isolated Preview only |
| `VITE_API_BASE_URL` | Omit/empty, so the web app uses its own Preview API |
| `CODE3_PREVIEW_SELF_ORIGIN_ENABLED` | `true`, allowing the exact server-owned immutable `VERCEL_URL` only when Vercel identifies the runtime as Preview |

Do not inherit the production server key or copy production owner/provider configuration. The self-origin opt-in resolves the immutable-URL/redeployment cycle without wildcard CORS; unrelated origins remain denied. Native API routing stays pinned to production and is not changed for this web-only test.

## Test-runner configuration

Supply dedicated process variables through an approved secure runner. Never put keys, OIDC tokens or generated passwords in command arguments, source, chat, screenshots, traces, HAR, or output files. A production key is never needed.

| Runner variable | Required value |
| --- | --- |
| `CODE3_DELETION_TEST_ALLOWED_PROJECTS` | Exact isolated project ref, currently `gvudurifesjatwforpnx` |
| `CODE3_DELETION_TEST_SUPABASE_URL` | Exact `https://<isolated-ref>.supabase.co` origin |
| `CODE3_DELETION_TEST_ANON_KEY` | Isolated public key |
| `CODE3_DELETION_TEST_SERVICE_ROLE_KEY` | Isolated server key, in the separately approved test-runner destination |
| `CODE3_DELETION_TEST_ALLOWED_APP_ORIGINS` | Exact reviewed immutable HTTPS Preview origin |
| `CODE3_DELETION_TEST_PREVIEW_DEPLOYMENT_ID` | Reviewed `dpl_...` deployment ID |
| `CODE3_DELETION_TEST_PREVIEW_TARGET` | `preview`, after independently reviewing actual Vercel metadata |
| `CODE3_DELETION_TEST_DENIED_APP_ORIGINS` | Current production immutable origin and aliases, comma-separated |
| `CODE3_DELETION_TEST_DENIED_DEPLOYMENT_IDS` | Current production deployment ID(s), comma-separated |
| `CODE3_DELETION_TEST_PREVIEW_OIDC_TOKEN` | Optional short-lived same-project development OIDC token, memory-only |

Production `SUPABASE_*`/`VITE_*` credentials are not runner fallbacks. Permission to hold an isolated test key locally does not automatically authorize copying it into Vercel or another destination; use only the approved destinations.

Keep Deployment Protection enabled. For same-project protected Preview access, use the existing Vercel identity and short-lived development OIDC. Node adds `x-vercel-trusted-oidc-idp-token` only after checking the exact Preview origin and account/version paths, with redirects forbidden. Browser automation adds it only for reviewed first-party paths; protected-mode requests are fetched with zero redirects and their actual HTTPS response is forwarded unchanged. A redirect is refused. This transport forwarding is not a fake API/module/image response; provider requests receive no OIDC header. Never use context-wide headers that would send the token to Supabase. Missing/expired/denied OIDC must fail safely, not disable protection or widen Trusted Sources. See [Vercel protected-preview guidance](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources).

## Run

The default command makes zero network requests:

```powershell
node scripts/test-hosted-account-deletion-https.mjs
```

The configuration check likewise makes zero network requests and creates no fixtures:

```powershell
node scripts/test-hosted-account-deletion-https.mjs --check-config --project-ref <isolated-ref> --confirm-isolated <isolated-ref> --app-origin <immutable-preview-origin> --confirm-preview-origin <immutable-preview-origin> --with-browser
```

After review, the following explicitly creates and deletes only new run-stamped synthetic fixtures:

```powershell
node scripts/test-hosted-account-deletion-https.mjs --execute --project-ref <isolated-ref> --confirm-isolated <isolated-ref> --app-origin <immutable-preview-origin> --confirm-preview-origin <immutable-preview-origin> --with-browser
```

The runner generates its own random accounts/passwords and accepts no existing account ID or supplied user password. Each privileged fixture action rechecks the server-owned run stamp. Paths must match that run's exact four-file manifest. Normal deletion goes through the deployed password-confirmed API; no live fault-injection endpoint or forced privileged Auth cleanup is installed. Browser execution uses fresh, ephemeral contexts and holds only synthetic credentials in memory.

## Evidence and boundaries

Sanitized reports are saved under ignored `artifacts/qa/hosted-account-deletion-https/<run-id>.json`. They contain authored check labels, target/deployment identifiers, synthetic account IDs and completion states; not passwords, tokens, emails, private references, file contents or provider/Playwright error text. Failed fixtures remain for investigation instead of bypassing a failed safeguard.

Normal API coverage includes exact CORS, missing authentication, caller-selected-target rejection, incorrect password, private owner/cross-account access, original-reference/price preservation, hard Auth deletion, refresh/access-session rejection and four-bucket cleanup. A separate sentinel's profile, cloud snapshot/revision, original references, personal price fields and exact file bytes must remain unchanged before its own normal verified cleanup. No shared price/catalog API is used.

With `--with-browser`, the real deployed `/delete-account` page performs sign-in, review/cancel, wrong-password rejection, confirmation, deletion and account-switch completion isolation without source/module substitution. Private-attachment components are separately bundled from actual source with the actual client into an ephemeral integration page. Its Auth/RPC/signing/image requests use the real isolated provider, including real-time URL renewal/expiry and revoked-session denial. That component integration does **not** certify an existing production receipt workflow. The runner always keeps `deployedReceiptWorkflowVerified:false` and `physicalDevicesVerified:false`.

Production's existing legacy receipt still needs authorized browser-session signing/access checks. Disabled production deletion cannot validate the new server key because readiness is checked before Auth/RPC. Keep production enablement separately reviewed. Physical iPhone/Android acceptance remains paused and is not replaced by desktop browser viewport tests.

## Cleanup

On success, confirm all reported synthetic fixtures are deleted and no run files or pending deletion markers remain. On failure, preserve the sanitized run report and inspect the exact remaining stamped fixtures. Any separately approved manual cleanup must reverify their server-owned run marker and exact file manifest; never remove a pending marker while its Auth account remains or bypass a failed deletion guard. After investigation, remove the approved disposable branch/environment, staging secrets and protected local test files, and verify their absence. Do not merge the test branch into production or reopen private buckets.
