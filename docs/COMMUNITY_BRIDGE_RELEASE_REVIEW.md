# Reviewed community bridge release

The Scout Reports view adds a shared feed of staff-approved Discord observations, product/status/search filters, source-post links, publisher release dates, and handoffs to Discord's existing report and role menus. The Scout overview and map stay on their existing path. Personal app reports, authentication, workspace access, and parent flows are not replaced.

## Production scope

- Existing Vercel team `team_SrWvifkcXd622u47TnXCZUT0`, project `prj_opLikOxbXPA3pTJ2EajgR5qzo4fq`, domain `code3tcg.app`.
- Isolated base: production commit `5cbb3706b48b8a711a51b238e9ef99a0cd1ce2bb`.
- One additive, service-only SECURITY INVOKER RPC, already installed in the existing Code 3 TCG Supabase project.
- One new read-only Edge Function `code3-community-feed` v1, deployed with JWT verification enabled. It uses existing platform credentials internally; only the app's existing public project anon key reaches the browser.
- The new feed includes published observations created after the October 29 cutover and observed within 24 hours. It excludes tests, withdrawn/queued reports, uncertain deliveries, identities, private notes, photos, and private app records. It exposes at most 50 results. No historical backfill.
- A silent bot-owned app shortcut and updated submission disclosure explain that approved public observation details can also appear in Scout. Existing form buttons and staff review remain in place. No roles or room permissions change.
- Best Buy remains locked paused, with zero checks/sends and no inventory polling enabled. This release does not install a scraper, retailer cron, new role ping, or web submission endpoint.

## Verification — October 29, 2026

- Discord regression suite: 124/124 passed.
- App bridge client/gateway tests: 8/8 passed; targeted component/service lint and Edge Function typecheck passed.
- Disposable Postgres fixtures passed private/test/old/withdrawn exclusion, sold-out supersession, result cap, and service-only execution checks.
- Hosted endpoint: valid public gateway key returns 200; unsigned GET 401; authenticated POST 405; parameterized GET 400; HEAD 200; CORS OPTIONS 204. Current eligible report count is zero; no fake inventory was published.
- Browser component checks passed at 320, 390 and 1440 pixels, including filters, source links, calendar, error/empty/retry, and 44-pixel controls.
- Full local app checks passed at 390 and 1440 pixels: live gateway → Reports → release dates → existing keyboard-pannable map, without changing saved Scout state or producing page errors.
- Production build passed. Existing large-chunk and mixed dynamic/static Supabase import warnings remain.
- New function has no security advisor findings. Existing unrelated project warnings are outside this release.
- The hosted preview build is ready. Hosted browser verification is pending preview access approval because existing development authentication expired. The Vercel fetch tool can create a temporary share link, so it has not been used. Authenticated production member use is not represented by the local QA bypass.

## Rollback

Restore the prior Vercel deployment and remove the newly registered bot shortcut post. Restore the saved submission instructions if needed. The new read-only gateway can be disabled independently; no report, account, member, or existing interaction function needs deletion. Do not delete community records or enable Best Buy during rollback.
