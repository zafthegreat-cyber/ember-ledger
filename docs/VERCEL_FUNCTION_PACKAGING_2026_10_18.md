# Vercel API packaging — October 18, 2026

The release preview completed its web build but Vercel rejected deployment with `exceeded_serverless_functions_per_deployment`: the current Hobby project allows twelve functions and the API directory supplied thirteen.

`api/account/deletion/status.ts` and `api/account/deletion.ts` both exported the same canonical Express app. The duplicate status adapter was removed. An exact `^/api/account/deletion/status$` route now selects `/api/account/deletion` before filesystem and SPA handling. The twelve other API entrypoints remain, including the deletion POST entrypoint. The backend still owns status handling, authentication, CORS, query rejection and deletion safeguards; no request-path normalization was added.

No plan, billing, external project settings, authentication, account service, database migration, user records, prices or native package settings were changed. The thirteen exact legacy artwork redirects and the existing filesystem/SPA fallback order remain.

The new `scripts/test-vercel-packaging.mjs` regression checks the function count and complete retained entrypoint manifest, the exact rewrite and its position, unrelated/suffix/prefix paths, the canonical deletion adapter and its backend status route. It also runs from the existing preview-runtime regression. The packaging checks are local source/configuration checks, independent of credentials and real records.

Local results:

- `node --no-warnings scripts/test-vercel-packaging.mjs`: passed all 23 checks.
- `npm --prefix backend run build`: passed TypeScript compilation.
- `node --no-warnings scripts/test-account-deletion-client.mjs`: passed 52 client and latest-price checks.
- `node --test --test-isolation=none backend/test/accountDeletion.test.mjs`: passed all 10 service/HTTP groups.
- `npm --prefix backend run test:release-security`: passed all 62 checks.
- `git diff --check`: passed.

The broader `test-code3-preview-runtime.mjs` passes the packaging block but then fails an older exact wording assertion for the provider-connection UI. The asserted sentence is also absent from that unchanged component in the pre-fix commit. The assertion was retained; this packaging fix does not alter provider behavior or claim that broader suite passes.

Local configuration checks alone do not prove Vercel forwards the original request pathname to Express. Before merging, verify a new hosted preview returns deletion-service JSON at `GET /api/account/deletion/status`, rather than an HTML SPA fallback or a route-not-found response. This check requires no real account deletion or record writes.

Vercel's [route configuration reference](https://vercel.com/docs/project-configuration/vercel-json#routes) documents ordered route matching, pathname-only source matching and function destinations. The existing project uses this `routes` configuration; no migration to a different routing or backend architecture is included.
