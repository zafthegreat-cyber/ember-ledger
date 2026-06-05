# Live Shop Portal UI

## Scope

- Live Shop Portal / partner route.
- Mock-only shop trust controls, restock status composer, event draft, donation/sponsor tools, and admin review status.
- Existing partner interest form remains the only intake surface.

## Files Changed

- `src/App.jsx`
- `src/App.css`
- `docs/LIVE_UI_INTEGRATION_TRAIN.md`
- `docs/LIVE_SHOP_PORTAL.md`

## Screens Integrated

- Shop Portal.

## Mock-Only Behavior

- Shop profile, trusted family friend badge, restock status composer, event draft, and admin review status are static UI previews.
- Restock status labels do not post publicly.
- Event drafts do not create events.
- Sponsor/donation tools do not process payment, checkout, external links, or backend records beyond the existing local beta interest intake.

## Safety / Anti-Scalper Protections

- Copy says: "Post helpful updates without creating a rush feed."
- Restock status composer uses broad labels: In stock, Limited, Sold out, Call first, Family hold, Event only.
- Exact quantities, vendor schedules, live inventory sync, rush alerts, and checkout behavior are explicitly not connected.
- Trusted family friend badge remains pending/admin-reviewed.

## Backend TODOs

- TODO: If shop tools are approved later, require admin review, trusted shop status, and exact limits on what shop updates may publish.
- TODO: Keep exact inventory quantities hidden unless shop-approved and safety-reviewed.
- TODO: Keep Spark sponsor/donation flows separate from checkout or payment work until explicitly approved.

## Responsive QA

- `artifacts/qa/live-ui-integration-train/shop-portal/shop-portal-390x844.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/shop-portal/shop-portal-430x932.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/shop-portal/shop-portal-1440x900.png`: no horizontal overflow, no console errors, no maximum update depth errors.
- `artifacts/qa/live-ui-integration-train/shop-portal/live-shop-portal-qa-results.json`: required shop trust/composer copy present.
- QA text search found "checkout" only in explicit safety copy saying checkout is not connected.

## Accessibility QA Notes

- Trust controls use semantic cards and readable badges.
- Status labels are static chips instead of fake posting controls.
- The existing interest form keeps labeled fields and consent checkbox.

## Checks

- `git diff --check`: passed with existing LF-to-CRLF warnings only.
- `npm.cmd run build`: passed with existing Vite large chunk warning.
- `npm.cmd run lint --if-present`: exited cleanly.
- `npm.cmd run typecheck --if-present`: exited cleanly.
- `npm.cmd test --if-present`: exited cleanly.
- `npm.cmd run format:check --if-present`: exited cleanly.
- `npm.cmd run smoke:beta`: passed.
- `npm.cmd run test:app-fallbacks`: passed.
- `npm.cmd run test:menu-full-page-routes`: passed.
- `npm.cmd run test:kids-program`: passed.
- `npm.cmd run test:admin`: sandbox Chromium `spawn EPERM`; outside-sandbox rerun passed.

## Known Warnings

- Existing Vite large chunk warning may appear during build.
- Existing LF-to-CRLF working-copy warnings may appear during Git checks.
- Chromium may require outside-sandbox rerun if local sandbox launch hits `spawn EPERM`.

## Next Recommended Task

- Continue to Section 14: Admin Review after this section passes checks and is committed.
