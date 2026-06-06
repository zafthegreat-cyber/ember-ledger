# Market Catalog Timeout Investigation

## Scope

This investigation covered the release blocker where `npm.cmd run test:market`
failed outside the sandbox after Supabase REST returned HTTP 500 for
`catalog_search_lightweight`, and `npm.cmd run smoke:catalog-search` reported
`canceling statement due to statement timeout`.

The master-card grouping work was preserved in
`artifacts/qa/master-card-grouping/master-card-grouping-wip.patch` before
investigation.

## Failing Commands

- `npm.cmd run smoke:catalog-search`
- `npm.cmd run test:market`

The browser test also hits the known sandbox-only Chromium `spawn EPERM`, so
browser verification must be rerun outside the sandbox.

## Findings

- `catalog_search_lightweight` is queried by `scripts/smoke-catalog-search.cjs`.
- The Market browser smoke reaches catalog search through
  `scripts/beta-smoke.cjs --area market`.
- The live app catalog loader calls `searchPokemonCatalogOnDemand`, which uses
  `src/services/pokemonCatalogSearch.js` against `catalog_search_lightweight`.
- The dirty master-card grouping changes do not modify the catalog
  Supabase RPC/view query path. They add frontend/mock types, grouping UI,
  premium image effects, and docs only.

## Current Result

The issue was reproducible during the release block, but the follow-up
investigation run passed:

- `npm.cmd run smoke:catalog-search`: passed.
- `npm.cmd run test:market`: sandbox Chromium `spawn EPERM`; outside-sandbox
  rerun passed.

This points to an intermittent Supabase catalog view timeout rather than a
master-card grouping regression.

## App Impact

The public Market UI already has graceful beta fallback behavior in the catalog
loader:

- If Supabase is unavailable, local saved catalog matches remain usable.
- If a catalog search throws and cached products exist, the app keeps cached
  local catalog matches.
- If no cached products exist, the app creates an editable market search draft
  result instead of crashing.

The fallback keeps Market usable but does not hide the backend health problem
from direct catalog smoke checks.

## Recommended Backend Follow-Up

If the timeout recurs, inspect the Supabase `catalog_search_lightweight` view
and related search indexes before deployment-sensitive releases:

- Verify text search/filter columns used by the smoke terms are indexed or
  backed by a faster search function.
- Check whether broad `ilike` clauses over `name`, `set_name`, `product_type`,
  and `set_code` scan too many rows.
- Consider a tuned search RPC or materialized search table for public beta
  catalog terms, while preserving the existing public fallback behavior.

No database, RLS, auth, billing, scraping, checkout, payments, uploads,
messaging, live AI, or live inventory changes were made in this investigation.
