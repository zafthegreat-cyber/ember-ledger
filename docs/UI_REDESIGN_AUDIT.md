# Private Business Hub UI Redesign Audit

Audit date: 2026-08-14
Repository: `ember-hearth-command-pass`
Branch: `ui-104-final-product-ui-2`

## Scope and protected work

The working tree contains substantial uncommitted work. The Phase 2 eBay Browse API implementation is present in `backend/src/routes/ebay.routes.ts`, `backend/src/services/ebayBrowse.service.ts`, `backend/src/services/ebayBrowse.mock.ts`, backend fixtures/tests, and the Flip Scout provider/import-review UI. Those files and contracts are protected during this redesign except for presentation-only client changes.

The following must not change:

- Server-only eBay credentials and existing environment-variable names.
- `/api/ebay/health` and `/api/ebay/search` behavior.
- Provider normalization, deduplication, updated/expired detection, and review-before-import behavior.
- The `ember-and-tide.flip-scout.v1` storage key and schema-compatible saved data.
- Existing database schema, generated Pokémon catalog data, and legacy internal route names.

## Current architecture

- React 19 and Vite 8 single-page application.
- Route state is custom and history-based, centered in `src/utils/appRouteState.js` and `src/App.jsx`; React Router is not used.
- Shared browser/local persistence plus Supabase-backed areas. Flip Scout uses a versioned local repository and JSON/CSV exports.
- Express/TypeScript backend plus Vercel catch-all/API functions. The repository is configured for Vercel in `vercel.json`.
- The visible shell, navigation, modal orchestration, and many route surfaces are concentrated in `src/App.jsx` (about 69,000 lines).
- Route pages exist for Home (`Hearth.jsx`), collection (`Vault.jsx`), sourcing (`Scout.jsx`), exchange/business (`Forge.jsx`), market research (`Market.jsx`), kids (`Spark.jsx`), and settings/menu (`Menu.jsx`).
- Flip Scout is modular under `src/features/flipScout/` and must remain modular.

## Route and screen migration map

| Existing screen | Existing route | Current visible name | Replacement visible name | Current component pattern | Redesign status | Data/business logic to preserve | Migration risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | `/` | Hearth | Home | Command-board dashboard with many bespoke cards | Rebuild in this phase | Real inventory, sales, expense, activity, and attention counts | High: large prop surface and tests reference legacy copy |
| Sourcing overview | `/scout` and `/scout/*` | Scout | Find / Sources | Map-and-signal command board | Shell rename; retain specialist screen | Store reports, watch state, privacy rules | High: many stateful subroutes |
| Flip Scout | `/scout/flip-scout` | Flip Scout | Find | Feature-local tabs and cards | Rebuild shell and requested screens | Entire Phase 1/2 repository and calculations | High: uncommitted Phase 2 work |
| Deal feed/inbox | feature view `deals` | Deal Inbox | Deal Feed / Deal Inbox | Responsive record cards | Redesign in this phase | Manual intake, statuses, sorting, appraisal seed | Medium |
| eBay discovery | feature view `ebay` | eBay Search | eBay Search | Connection panel, filters, result queue | Redesign in this phase | Search Rules, API calls, pagination, merge/import gate | High |
| eBay review queue | within eBay view | eBay import review | Import Review | Status-filtered record cards | Redesign in this phase | New/changed/expired/imported states and explicit import | High |
| Deal appraiser | feature view `appraise` | Appraiser | Deal Analysis | One long form plus result cards | Guided five-step redesign | All tested calculations and saved appraisal behavior | High |
| Auction tracking | feature view `auctions` | Auction Watch | Auctions | Form, calculator, records | Foundation styling in this phase | Maximum-bid math and timing indicators | Medium |
| Search rules | feature view `rules` | Search Rules | Saved Searches | Form and optional templates | Foundation styling in this phase | Rule schema and eBay compatibility | Medium |
| Provider/data settings | feature view `sources` | Sources & Data | Sources / Integrations | Provider cards and import/export tools | Foundation styling in this phase | Honest connector states, JSON/CSV, reset confirmation | Medium |
| Purchases and lots | feature records view | Purchases | Purchases | Feature-local forms/cards | Foundation styling in this phase | Lot splitting and allocation reconciliation | Medium |
| Inventory records | `/vault/*`, `/forge`, feature records view | Vault / Forge inventory | Inventory | Gallery/cards plus business records | Shell rename and shared styling | Existing collection and business inventory records | High |
| Sales | `/forge/sales` | Sales & Profit | Sell | Forms, records, reports | Shell rename and shared styling | Quantity validation and realized results | High |
| Expenses | `/forge/expenses` | Forge expenses | Business / Expenses | Forms and receipt review | Shell rename and shared styling | Business records, receipt links | Medium |
| Mileage | `/forge/mileage` | Forge mileage | Business / Mileage | Forms and summaries | Shell rename and shared styling | Mileage records | Medium |
| Business reports | `/forge/reports` | Forge reports / Tax Center | Business / Reports | Summary panels and exports | Shell rename and shared styling | Bookkeeping-estimate wording and exports | Medium |
| Market/catalog | `/exchange/market`, `/market`, `/tidetradr` | Market / TideTradr | Product Research | Search/results/detail panels | Navigation wording only | Catalog search and pricing provenance | High |
| Exchange/listings | `/exchange`, `/harbor` | Exchange / Harbor | Sell | Multi-hub command board | Navigation wording only | Listings, trades, seller workflows | High |
| Kids program | `/kids-program` | The Spark | Kids & Community | Dedicated family program page | Shell rename; deeper migration later | Parent approvals and child-safety rules | High |
| Community | `/tidepool` | Tidepool Community | Community | Posts, moderation, trusted circle | Shell rename; deeper migration later | Moderation and privacy behavior | High |
| Assistant | global panel | Ask Ember / Ember Assist | Business Assistant | Global helper drawer | Entry-point rename in this phase | Existing local/admin help behavior | Medium |
| Settings | `/settings`, `/menu`, `/more` | You / Menu | Settings | Utility menu/page | Shell rename in this phase | Account, workspace, notification settings | Medium |
| Account/profile | `/account`, `/profile`, `/profile/progress` | Ember ID / Profile | Account / Profile | Utility pages | Shell rename; deeper migration later | Identity and permissions | Medium |
| Workspaces | `/collections`, `/workspaces` | Workspace / Family | Workspaces | Utility page | Shell rename; deeper migration later | Workspace membership and privacy | Medium |
| Data backup | `/data-backup`, `/backup` | Data Safety & Export | Data & Backup | Utility page | Shell rename; deeper migration later | Existing export/import behavior | Low |
| Admin/moderation | `/admin`, `/moderator` | Admin Command Center | Admin / Review | Large protected dashboards | Shared styling only | Role checks and review queues | High |
| Supporting pages | `/help`, `/trust`, `/links`, `/whats-new`, `/known-limitations`, `/coming-soon`, `/membership` | Mixed fantasy/beta wording | Plain descriptive labels | Inline App render functions | Shared styling; copy migration later | Existing content and permissions | Medium |
| Access/onboarding | `/onboarding/*`, `/welcome`, `/state-check`, `/waitlist`, `/invite/*`, `/workspace-invite/*`, `/reset-password` | Ember & Tide access language | Private Business Hub access language | Full-page auth/onboarding surfaces | Brand/config foundation now; deeper screen pass later | Auth and invite flows | High |

Legacy paths remain valid. New `/find/*`, `/purchases`, `/inventory`, `/sell`, `/business`, `/kids-community`, `/assistant`, and `/integrations` aliases will resolve to existing internal route states where safe.

## Navigation inventory

- Desktop: `web-command-sidebar`, top bar brand/search/assistant/workspace/quick-add/profile/menu controls, secondary command-desk groups, per-page command-board rails, and feature-local Flip Scout tabs.
- Mobile: fixed five-item `mobile-bottom-nav`, floating quick-add button, top bar actions, menu drawer, command-board mobile docks, and feature-local horizontal tabs.
- Current primary labels are Hearth, Vault, Scout, Exchange, and You. These will become Home, Find, Inventory, Sell, and Business.
- Current desktop secondary terms include Tidepool, The Spark, Ember Watch, Ember ID, Forge, Harbor, and Command Desk. Updated shell language will be direct and operational.

## Brand-language inventory

Visible legacy language occurs in `index.html`, `public/manifest.webmanifest`, `src/main.jsx`, `src/App.jsx`, route pages, fallback/error components, onboarding/help utilities, notifications, feature gates, test expectations, and numerous historical docs. Internal identifiers and historical documents can remain where renaming would create migration risk; current user-visible shell and redesigned screens must use centralized brand copy.

High-risk internal names that remain temporarily include route keys (`scout`, `vault`, `forge`, `tidepool`, `kidsProgram`), storage/event keys beginning with `ember-`, generated asset paths, utility function names, and build constants.

## Theme, color, and responsive inventory

- Global styles start in `src/index.css` and `src/App.css`, which imports numbered layers in `src/styles/app/`.
- Additional route CSS lives in `src/mobileScreenSet.css` and `src/features/flipScout/flipScout.css`.
- Existing tokens use `--et-*` and `--cb-*` names, with many route-specific hard-coded navy, orange, teal, gold, gradients, glow shadows, and late `!important` overrides.
- Existing breakpoints cluster at 410, 520, 700, 760, 1100, 1180/1181, 1320, and 1700 pixels. The new semantic contract uses 360px as the minimum supported mobile viewport, 768px for tablet navigation changes, and 1180px for the full desktop sidebar while retaining compatibility with legacy breakpoints.
- Light mode exists but the primary visual system and fallbacks are dark-first. The redesign will make light the default and keep an optional dark token set.

## Shared component-pattern inventory

Current reusable patterns include command-board shells, mockup cards/buttons/pills, `PageHeader`, `QuickActionGrid`, badges, buttons, form fields, dialogs/modals, toast notices, record cards, data/detail grids, and feature-local Flip Scout fields. Their names, props, focus behavior, spacing, and visual treatments are inconsistent across routes.

This phase standardizes an operations UI layer containing AppShell, mobile and desktop navigation, headers, button variants, status/source/confidence/risk indicators, currency/percentage/search/filter/sort inputs, cards, empty/loading/error/offline states, provider state, bottom sheet/dialog/toast, responsive record/table patterns, and the sticky decision bar.

## Accessibility and visual-regression baseline

- `npm run test:accessibility-keyboard` passes before the redesign.
- The existing viewport guard passes its mobile/tablet/desktop routes, including 390px mobile, before the redesign.
- Focus-visible and reduced-motion layers already exist and must be preserved.
- Main risks found by inspection: mobile text rules as small as 7–9px, large click surfaces that rely on very dense card grids, repeated icon-only meanings, extremely long pages, horizontal feature-tab rows, excessive late overrides, and some mojibake punctuation in Phase 1/2 feature copy.
- The current shell uses low-light backgrounds, glow/gradient effects, fantasy marks, and route-specific visual systems. It does not provide a calm, consistent, light-first operational hierarchy.
- The current Home screen presents too many equal-weight dashboards and decorative command-board sections instead of prioritizing attention and next work.

## eBay Phase 2 audit

- Client screens: `EbayDiscoveryScreen.jsx`, `EbayConnectionPanel.jsx`, `ebayClient.js`, and `ebayDiscovery.js`.
- Server routes: `GET /api/ebay/health` and `POST /api/ebay/search`.
- Search supports keyword/category/GTIN/price/condition/buying-option/delivery/location fields, newest sorting, pagination, timeout/error mapping, and health/configuration reporting.
- Results normalize to provider listings, deduplicate by provider plus external ID, detect changes/expiration, retain source links/times/prices/shipping/location/seller/images, and record `lastCheckedAt` plus provenance.
- Import review is explicit; imports create/update Deal Inbox records only and never create purchases or inventory.
- The screen correctly states active listings are not sold comparable records and never invents market value.

## Baseline conclusion

The safest migration is additive: introduce centralized brand and semantic operations tokens, replace only the global shell/navigation contract and the Home/Find/Deal Analysis surfaces, then let untouched legacy routes inherit the new surfaces through compatibility CSS. Internal routes, storage keys, eBay APIs, database behavior, and generated data remain unchanged.

## Implementation status update

- Completed: centralized brand configuration and build-time browser/PWA metadata.
- Completed: semantic light-first token layer with optional dark tokens and compatibility mappings for legacy `--et-*` surfaces.
- Completed: new desktop sidebar, mobile five-item navigation, global Add entry point, shared operations components, and plain shell wording.
- Completed: operational Home, Find overview, Deal Feed, eBay Search/connection, Import Review, Sources, and five-step Deal Analysis.
- Completed: 360px overflow coverage for the redesigned Find workflows, visible focus treatment, 44px controls, reduced-motion inheritance, and mobile card layouts in place of forced tables.
- Preserved: legacy routes, local storage keys/schema, eBay server routes/environment names, normalization/deduplication/update/expiration logic, explicit Deal Inbox import gate, calculation behavior, and generated catalog files.
- Foundation styling only: Auctions, Saved Searches, purchases/lots, inventory records, sales, expenses, and mileage retain their existing record logic and now inherit the semantic surface/form treatment.
- Deferred: deeper content and component migration inside legacy Collection, Sell, Kids & Community, local store-report, onboarding, administrative, and supporting utility screens. Their user-visible shell entry points are plain, but some route-body terminology remains a migration risk.

Baseline and final visual artifacts are stored under `artifacts/qa/ui-foundation-replacement/before/` and `artifacts/qa/ui-foundation-replacement/after/` for the eight required Home, Deal Feed, eBay Search, Import Review, and Deal Decision views.

## Information architecture correction — Owner Center phase

The earlier five-destination mobile proposal has been corrected. The active mobile contract is Home, Find, center Global Add, Collection, and Business. Global Add is an action and never owns a route. Inventory and Sell remain compatible URLs but resolve into the Business workspace. Desktop primary navigation is limited to Home, Find, Collection, and Business; Owner Center and Settings are separated at the bottom.

| Everyday workspace | Primary content | Secondary or compatible screens | Preserved logic and risk |
| --- | --- | --- | --- |
| Home (`/`) | Needs Attention, Best Opportunities, Today, Business Snapshot, Recent Activity | Legacy daily command route remains `/today` | Reads real local sourcing records; no fabricated values |
| Find (`/find/*`) | Deals, Restocks, Auctions, Saved | eBay Search, Deal Analysis, Import Review, Sources, record editors | Phase 2 eBay connector, normalization, review gate, and calculations remain unchanged |
| Collection (`/collection/*`) | My Collection, Sets & Binders, Wishlist, Grading | Legacy `/vault/*` remains available | Owned-item compatibility is read-time; purpose changes are audited |
| Business (`/business/*`) | Purchases, Inventory, Sales, Money | `/purchases`, `/inventory`, and `/sell` resolve here; legacy `/forge/*` remains | Existing costs, sales, expenses, mileage, and local keys remain intact |
| Owner Center (`/owner-center/*`) | Overview, Sourcing, Restocks, Performance, Controls | Mobile profile menu; desktop secondary navigation | Owner-role guard is enforced at render, with a documented local-beta-only owner fallback |

Owner Center adds a separate versioned local repository and does not change any existing storage key. Restock directory rows, reports, and predictions are adapted at read time. Store-directory presence is not treated as restock confirmation, and metrics with missing trip/profit attribution display the missing requirement instead of zero.
