# CompsAPI free-plan trial

This optional owner-only feature is separate from the official eBay Browse
connector. It calculates a USD estimate from provider-reported completed sales
and never treats active asking prices or bids as sold prices.

## Account and server setup

1. Create the free account at <https://app.compsapi.com/>. The user completes
   signup and any terms. The advertised free plan includes 100 searches per month
   with no payment card. Do not select a paid plan during this trial.
2. After approval, add `COMPSAPI_API_KEY` as a **Production Secret** in the existing
   Vercel `ember-tide-tcg` project. Paste it directly from the provider dashboard,
   never into chat, source code, a command argument, or a `VITE_*` variable.
3. Set `COMPSAPI_ENABLED=true` as Production Config. The feature is off when the
   flag or key is missing. Neither variable changes the eBay credential values.
4. Stage a production build, verify the existing owner boundary and eBay deletion
   challenge, then promote after the user's production approval.
5. Open `/find/ebay` and expand **Calculate a card’s sold market price**, or in a
   card's price history find **Compare sources → eBay sold market estimate**.
   Confirm name, set, number, printing, language, and raw condition or slab grade,
   then choose **Calculate sold market estimate**. Check the original sale links.
   The displayed estimate does not overwrite saved values.

## Backend and calculation

- Owner-authenticated `GET /api/ebay/sold/health` reports configuration without
  contacting CompsAPI or returning a key. Configuration alone is not proof of
  valid provider access.
- Owner-authenticated `POST /api/ebay/sold/search` validates an explicit card
  identity and makes one bounded request to the fixed CompsAPI `/v1/sold` URL.
  It fetches one page of up to 100 reported sales from the preceding 90 days.
  Requests run only on the user's Calculate action; there is no background scan.
- Only single-unit US sales with known matching language, printing, card number,
  name/set title tokens, and raw condition or exact slab grade qualify. Unknown,
  duplicate, stale, future-dated, flagged, aggregate and incompatible rows are
  excluded. Current support covers non-holo, holo, reverse holo, first edition,
  and shadowless cards; it does not cover every printing or sealed products.
- Amounts use exact integer cents. At least 3 retained sales are required. At 8+
  matches, 1.5-IQR fences remove extreme prices before calculating the median.
  Even-sample half-cent medians round to the nearest cent, ties upward.
- Estimates exclude shipping, tax and fees. They are a sample from an independent
  provider, with title-derived matching, not independently authenticated cards or
  official eBay valuations. Thin sales or ambiguous metadata return no estimate.
- No new database tables or persisted provider payloads are introduced. Returned
  fields exclude seller names, user IDs and images. Results live only in screen
  state and clear on match edits, account changes, or unmount. Responses use
  `Cache-Control: no-store`. Ten requests per owner per minute are allowed per
  function instance; this is not a global quota manager. CompsAPI enforces the
  account's monthly limit. Do not enable paid upgrades automatically.
- Credentials remain server-side. Redirects, unbounded responses, provider error
  text, and malformed payloads are rejected; timeouts and quota failures produce
  an error without replacing saved prices.

## Local verification

- `npm run test:sold-comps`: normalization, outliers, exact cents, mixed-grade and
  condition rejection, configuration, provider failures, access boundary, private
  transport, and cancellation tests. No live provider requests.
- `npm run test:market-sources`: existing market-source identity, price-preservation
  and protected-write regressions.
- `node scripts/test-vercel-packaging.mjs`: the added routes use the existing
  Express function and preserve the twelve-function deployment limit.
- `node scripts/preview-sold-comps.mjs` starts a loopback-only UI/API fixture using
  synthetic sales. It refuses production/Vercel runtimes and cannot consume a
  real provider key. Artifacts are excluded from deployment.
- Local browser verification used synthetic $10/$12/$14 sales and displayed a
  $12 median. Changing the card from NM to LP cleared the result and returned
  insufficient sales instead of reusing the NM value. This is not live-data proof.
- Validation passed: 9 sold-backend tests, 4 client transport/cancellation tests,
  56 Vercel packaging checks, targeted ESLint, frontend/backend builds and the
  existing market-source regression suite. The combined eBay/owner/deletion/sold
  backend run passed 59 tests with 1 previously covered database case skipped.
  Existing frontend build warnings about large chunks and mixed Supabase imports
  remain. No dependencies or migrations were added for sold-price estimates.

## Current rollout state

The user explicitly approved production deployment and real sold-price testing
on October 25, 2026. `COMPSAPI_API_KEY` is a Production Secret and
`COMPSAPI_ENABLED=true` is Production Config; no key was exposed. The release
is prepared from production commit `4dbfcbf01436168c49fa8368d35d15344323b6d8`
with the reviewed notification/routing fixes and sold-price integration applied.
This preserves the newer catalog refresh, search metadata and Google verification
file without changing the separate local Discord branch.

- Promoted deployment: `dpl_9BDN54YnoJMgjyhku5sf2f2ddbSk`, READY / production,
  immutable host `https://ember-tide-8azg06n9h-zafthegreat-cybers-projects.vercel.app`.
- Staged checks passed: exact deletion challenge hash, unsigned POST 412, missing
  challenge 400, anonymous sold health/search 401 JSON, public market sources
  200, homepage 200 with search metadata, and Google verification file 200.
- Public deletion checks passed again after promotion. In a fresh signed-in app
  tab, eBay Browse verification reported healthy authorization. Account access
  finished loading normally; an older open tab remained on its loading screen.
- The production calculator submitted Charizard / Base Set / 4/102 / Holo /
  English / raw NM. The backend reached CompsAPI, but its authorization was
  rejected (the provider returned HTTP 401 or 403, mapped to safe application
  error `provider_access_failed`). The request log records application HTTP 502
  at `2026-10-25T17:35:59.604Z`. No sale data or estimate was returned, and no
  saved prices were overwritten. The UI correctly displayed the access error.
- Live sold pricing is **not yet verified**. The user was asked to confirm their
  CompsAPI account is active and replace the private Production key directly in
  Vercel. After that change, redeploy and repeat this same explicit card search;
  verify at least three matching sale records before claiming a working estimate.
- Evidence screenshot: `artifacts/qa/sold-comps/production-provider-auth.png`.
  The runtime error/fatal scan returned no runtime log records; the handled
  provider authorization rejection remains a failed live search.
- The scheduled market-price refresh deploys `main`. Keep these implementation
  changes in production source control so later catalog-only deployments retain
  the notification and search routes rather than replacing a manual deployment.

## Provider references checked October 25, 2026

- <https://compsapi.com/docs>
- <https://compsapi.com/terms>
- <https://compsapi.com/>

The provider permits display inside an app and derived valuations, but prohibits
bulk raw-data redistribution and does not represent that it has third-party
rights in underlying marketplace listings. This integration is not described as
an official or eBay-endorsed feed.
