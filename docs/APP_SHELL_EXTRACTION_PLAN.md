# App shell extraction plan

This is a planning artifact for the phase after legacy-route compatibility and mobile polish. It deliberately makes no production extraction changes.

## Current measurable baseline

The final closure production build emitted the main `App` chunk at **2,337.03 kB minified / 585.71 kB gzip**. `src/App.jsx` is approximately **69,323 lines / 3,477.9 kB of UTF-8 source**. Source ranges below are a dependency-density proxy, not a claim that source bytes map linearly to minified bundle bytes; exact per-renderer byte attribution requires a source-map bundle analysis in the extraction phase.

| Legacy responsibility still in `App.jsx` | Approximate source footprint | Route ownership |
|---|---:|---|
| Detailed restock/report renderers (`renderScout*`, report/store/calendar flows) | 7,857 lines / 377.3 kB | `/scout/*`, compatibility support for `/owner-center/restocks/*` |
| Collection compatibility headers, item cards, editors, and transfer flows | at least 674 lines / 28.9 kB, plus shared flow-modal code | `/vault/*`, `/collection/*` compatibility |
| Resale, sales, expenses, mileage, reports, and receipt presentation | about 3,503 lines / 174.1 kB, plus inline route surfaces | `/forge/*`, `/business/*` compatibility |
| Community, Kids & Community, trust, and moderation renderers | about 5,865 lines / 341.6 kB | `/kids-community/*`, `/tidepool/*`, `/moderator*` |
| Older administration renderers | about 2,685 lines / 167.0 kB | `/admin/*` |
| Settings and utility renderers | about 2,156 lines / 117.1 kB | `/settings/*` and legacy utility aliases |
| Cross-domain legacy flow modals | about 6,831 lines / 381.0 kB | Global Add plus Collection, Business, Exchange, Community, and restock actions |
| Inline late-file route surfaces | about 2,631 lines / 161.3 kB | legacy Collection, Restocks, Find, and Business branches |

These ranges overlap where shared flow code serves several routes. They therefore must not be added together as a bundle estimate.

## Dependency map

| Domain | Storage/state dependencies | Primary tests |
|---|---|---|
| Detailed Scout/restocks | existing Scout storage namespace, report/store state, backend report hydration, map/calendar filters, route subview state | `test:scout`, Scout layout/map/save tests, `test:legacy-routes`, route direct-load tests |
| Vault/Collection compatibility | existing item/workspace/purchaser keys, catalog/set data, receipts/images, owned-item purpose history | `test:vault`, Vault workflow/set tests, workspace tests, regression inventory-transfer scenarios |
| Forge/Business compatibility | the same owned items plus sales, expenses, mileage, receipts, purchaser allocation, reports, feature gates | `test:forge`, business tax/sales/profit tests, resale regression scenarios |
| Exchange | catalog search state, marketplace listing state, price cache, collection/resale destination actions | `test:market`, exchange layout, marketplace listing, route compatibility tests |
| Community/moderation | existing community storage, public identity, trust/safety state, flags and moderation queues | community safety, public identity, Tidepool, moderation, kids-program tests |
| Administration | user/auth/role state, Supabase-backed review data, invitations, feedback, store/report queues | role, beta-user/invite, admin queue/store, authorization tests |
| Settings/utilities | theme, profile, workspace, route, backup/export, onboarding, feature-gate preferences | settings/workspace, backup resilience, onboarding, menu/full-page route tests |

The route resolver in `src/utils/appRouteState.js` and its existing `emberTideRoute` storage key are shared compatibility infrastructure. They must not be renamed during extraction.

## Safest extraction order

1. **Introduce route-owned presenter contracts.** Keep hydration and mutations in `App.jsx`, but replace ad hoc prop capture with explicit domain controller objects. This creates a testable seam without changing persistence.
2. **Detailed Scout routes.** Extract reports, stores, calendar, watchlist, and review panels behind a single lazy compatibility module. Keep the small canonical Find/Owner Center handoff eager. Preserve query/hash and store-detail parameters.
3. **Vault compatibility routes.** Extract collection cards, editors, import, set, wishlist, and move-to-resale views. Continue reading/writing the original item records and purpose history through passed controller methods.
4. **Forge compatibility routes.** Extract resale inventory, purchases, sales, receipts, expenses, mileage, and reports as one route family first; split reports later only if measurement supports it.
5. **Exchange.** Move catalog/search/listing presentation behind its existing route boundary while keeping shared catalog normalization and Add destination actions single-sourced.
6. **Community and moderation.** Extract public community presentation separately from protected moderation controls; preserve both authorization checks at render entry, not only in navigation.
7. **Older administration.** Extract queues and dashboards only after a narrow authorization adapter is covered by direct-load tests.
8. **Settings and utility routes.** Consolidate legacy aliases onto the canonical Settings module after backup/import, invite, and browser-back coverage passes.

Kids & Community page modules already load lazily, but their supporting modal renderers remain in `App.jsx`; migrate those with the community step rather than creating tiny chunks.

## Lazy versus eager ownership

Safe lazy candidates are route-specific Scout detail panels; Vault and Forge compatibility renderers; Exchange; community/moderation; older administration; Settings pages; reports; and route-specific flow bodies. Keep each domain's closely related cards/forms together to avoid dependency duplication.

The following must remain eager until their state boundary is deliberately replaced:

- `AppShell`, Home, global navigation, focus restoration, and route fallback UI.
- canonical route parsing and history synchronization.
- authentication bootstrap and top-level authorization decision points.
- safe local-storage hydration, schema normalization, workspace selection, and persistence error handling.
- global Toast, Dialog/confirmation host, and Global Add entry shell.
- shared error boundary and stable route loading state.

Do not lazy-load individual buttons, fields, badges, or other small primitives.

## Compatibility risks and controls

- **Route compatibility:** a legacy path can carry a subview, record ID, query, or hash. Resolve it before importing the lazy module, and pass the normalized state rather than replacing the URL twice.
- **Browser back behavior:** redirects must use the current `replaceState` convention where canonicalizing an alias; in-workspace transitions should continue using push history. Test back/forward after direct legacy loads.
- **Local-storage hydration:** lazy children must not independently hydrate or write shared keys. App/repository hydration completes first, then the child receives normalized records and mutation callbacks. Loading fallback must not overwrite empty-looking state.
- **Authorization:** Owner Center, administration, and moderation need guards at the lazy route boundary and inside the loaded module. A hidden link is not a guard.
- **Modal continuity:** extracting a flow while it is open can lose focus-return targets or unsaved form state. Keep ownership of a flow in one module and retain the current close/confirmation contract.
- **Chunk duplication:** inspect Vite output and source maps after each domain. Do not add hand-written vendor chunks unless duplicate modules are demonstrated.

## Acceptance criteria

- Main `App` chunk and initial gzip payload decrease measurably with before/after output recorded.
- Home and the application shell render without requesting legacy domain chunks.
- Every canonical and compatibility route direct-loads, refreshes, and shows a stable loading/error fallback.
- Query strings, hashes, record IDs, and intended replace-versus-push history behavior survive canonicalization.
- Back/forward navigation works across canonical and compatibility routes.
- Existing browser storage keys and serialized shapes round-trip unchanged; no empty fallback writes occur before hydration.
- Owner/admin/moderator authorization remains enforced for direct URLs.
- Global Add, dialog focus return, scroll restoration, keyboard navigation, 360 px viewport guards, and light/dark modes pass.
- The focused route suites and all 28 bounded beta regression scenarios pass with no leaked browser, listener, or timer handles.
- eBay server routes, environment-variable names, normalization, and Import Review behavior remain untouched.
- No generated catalog file or Virginia store seed is part of the extraction diff.
