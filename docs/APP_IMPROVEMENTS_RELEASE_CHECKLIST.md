# App improvements: release checklist

Use this for each batch in `APP_IMPROVEMENTS_100_2026_10_25.md`. A passing local
check does not mean a release has been deployed. Record the source revision,
changed files, checks, known warnings and deployment state in the ledger.

## Local regression checks

- [ ] `node --no-warnings scripts/test-app-improvements.mjs`
- [ ] `node scripts/test-catalog-search-presentation.mjs`
- [ ] `node scripts/test-catalog-result-identity.mjs`
- [ ] `node scripts/test-market-search-presentation.mjs`
- [ ] `node --no-warnings --test scripts/test-import-review-safety.mjs`
- [ ] `node --no-warnings --test scripts/test-cloud-review-presentation.mjs`
- [ ] `node --no-warnings scripts/test-inventory-imports.mjs`
- [ ] `npm run test:restore-compatibility` and `npm run test:export-disclosure`
- [ ] `npm run test:route-loading` and `npm run test:legacy-routes`
- [ ] `npm run test:manual-lifecycles` for record-save validation and transitions
- [ ] `npm run test:workspace-recovery` and `npm run test:cloud-workspace-sync`
- [ ] `npm run test:role-management` for role and permission boundaries
- [ ] Lint every changed source file; identify existing warnings separately
- [ ] `npm run build`; record the app chunk size and any new build warnings

## Browser checks for search and collection batches

- [ ] Two catalog controls have independent list and active-option IDs.
- [ ] Keyboard arrows, Home/End, Escape, Tab, selection and IME Enter work.
- [ ] Cancelled or dismissed delayed requests cannot reopen suggestions.
- [ ] A named collector-number query cannot select another named card.
- [ ] Empty and failed searches retain their query and offer a useful next step.
- [ ] A manual draft retains a leading-zero UPC/SKU and invents no price.
- [ ] Market URL and browser Back restore the query and supported filters.
- [ ] New page headings receive focus; a late page does not interrupt typing.
- [ ] Owned values exclude wishlist budgets; listed copies are counted once.
- [ ] Missing prices stay unknown; quantity and valuation coverage are visible.
- [ ] History/collection tables expose headings and work with the keyboard.
- [ ] At 390px width, the page fits and wide tables scroll within their region.
- [ ] Invalid saved URLs are inert; valid external links name their destination.
- [ ] Invalid import values stay visible, correction links reach their fields,
  and an ambiguous printing cannot be confirmed without a choice.
- [ ] Compare copy attributes before merging; partial retries skip confirmed
  destinations and unknown save outcomes prompt a saved-record check.
- [ ] Cloud conflicts show changed fields and actual recorded timestamps; choices
  still apply the whole group and preserve original copies.
- [ ] Offline retry, paused saving and device-save failures use distinct wording.
- [ ] Private export contents are described before generating the file.
- [ ] Every export button is `aria-describedby` a disclosure that names the private
  fields the file will contain; hidden portfolio values are not promised.
- [ ] A backup with a newer source schema names the source and both versions in the
  recovery gate and offers no password step; a compatible backup shows the
  per-source dry-run table before recovery.
- [ ] Save a screenshot of the reviewed UI and check the browser error console.

Use loopback previews and synthetic records for these checks. Do not write test
records into production or spend provider requests just to exercise layout.
Authenticated saves and provider integrations require their own relevant checks;
synthetic presentation tests do not establish that a live provider is healthy.

## Before a production release

- [ ] Confirm the exact source and diff, including existing production API routes.
- [ ] Confirm migrations/configuration are compatible and keep secrets out of output.
- [ ] Obtain authorization for this release's production or credential changes.
- [ ] Deploy the approved source and verify the deployment and affected route.
- [ ] Update the ledger with the real deployment URL, or leave it marked local only.

Current batch state: **local implementation; no new production release requested**.
