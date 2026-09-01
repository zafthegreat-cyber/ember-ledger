# Code 3 Feature Status Matrix

Published Phase 2D-B2 / Phase 2C-A starting baseline: `0b45c3584f7f15b4d951c5e4cddd1e42dcbeb5a3`. Phase 1A through Phase 2D-B2 source is published on `ui-104-final-product-ui-2`. Phase 2C-A is the current local-only Purchase → Receiving → Inventory Handoff Preview foundation. None of these statuses represents an executed schema, migrated owner record, active remote persistence, connected email/Inbox/Orders/Bot provider, automatic evidence import, Inventory creation, live Bot task control, checkout, billing, configured AI/computer-vision provider, or autonomous retailer/marketplace action. The separate Phase 2B2-B.1 operational verification remains paused; `hostedRuntimeVerified=false`.

## Classification rules

Every row has one primary classification:

- `IMPLEMENTED`: target behavior is materially present and tested.
- `PARTIALLY_IMPLEMENTED`: a useful subset exists but the target workflow is incomplete.
- `IMPLEMENTED_DIFFERENTLY`: legacy/current behavior exists with materially different product semantics.
- `FRONTEND_ONLY`: presentation exists without the required durable/application service.
- `CLIENT_LOCAL_ONLY`: the workflow works but its authoritative records remain browser-local.
- `BACKEND_REQUIRED`: useful completion depends on a missing backend boundary/service.
- `MISSING`: no meaningful implementation was found.
- `BLOCKED_BY_AUTHORIZATION`: implementation requires external provider approval or a secure authorization boundary.
- `FUTURE`: optional/later capability intentionally not active.
- `DEPRECATED_COMPATIBILITY`: retained only for route/data compatibility and not a canonical product destination.

Phase-state qualifiers used in gap/evidence text are independent of the primary classification: `SCHEMA_ONLY` means a target representation exists but was not applied; `DRY_RUN_ONLY` means the path validates or compares without writes; `NOT_ACTIVE` means the capability cannot be used for owner data; `FUTURE` means it remains planned rather than locally implemented.

Test abbreviations: **FS** `test:flip-scout`; **OC** `test:owner-center`; **EB** `test:flip-scout-ebay`; **INT** Phase 1C intelligence/history/provider tests; **AO** published Phase 2A Account Ops domain/fixture/browser tests; **WS** Phase 2A.5 workspace registry/preference/browser tests; **IO** Phase 2B1 provider runtime/inbox/order tests; **BO** Phase 2D-A Bot Operations domain/fixture/security/UI/browser tests; **STP** Phase 2D-B2 Stellar preview parser/security/fixture/zero-write/browser tests; **PR** Phase 2C-A Purchase/Receiving domain/money/history/security/UI/browser tests; **BR** `test:flip-scout-browser`; **RL** `test:route-loading`; **LR** `test:legacy-routes`; **PL** `test:plain-language`; **A11Y** keyboard/viewport checks; **REG** bounded 28-scenario regression. “None focused” means broader loading/regression coverage may exist but no domain assertion was found.

## Shell, identity, and common behavior

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Brand configuration | all | PARTIALLY_IMPLEMENTED | `src/config/brand.js`, Vite brand metadata, Code 3 mark | bundled config | Code 3 branding, PL, build | Code 3 display/short/PWA/title/logo are centralized locally; business name/tagline remain separate; social/currency/time-zone and compatibility-copy sweep remain |
| Minimal app shell | all canonical | IMPLEMENTED | `src/App.jsx`, operations components/styles | route/profile/theme state | RL, PL, A11Y, REG | Large shell remains; Phase 2 extraction |
| Workspace-local mobile navigation | product routes | IMPLEMENTED | `src/App.jsx`, `src/config/workspaceRegistry.js`, `src/features/workspaces` | route/session/feature state | WS, RL, A11Y | Published Phase 2A.5 implementation; physical Android review remains |
| Workspace-local desktop navigation | product routes | IMPLEMENTED | `src/App.jsx`, `src/config/workspaceRegistry.js`, `src/features/workspaces` | route/session/feature state | WS, RL, PL | Published Phase 2A.5 implementation; remaining legacy renderer extraction is future |
| Profile menu target | menu/profile | PARTIALLY_IMPLEMENTED | `src/App.jsx` | profile/feature controls | REG | Legacy/extra entries differ from final target; Phase 2 |
| Global Add sheet | action sheet | IMPLEMENTED | `src/App.jsx` | enabled feature controls | A11Y, REG | Restock visit/report/donation actions not all working; later domain phases |
| Theme and dark mode | all | IMPLEMENTED | semantic CSS/tokens and theme state | `et-tcg-app-theme` | viewport light/dark, REG | Preserve |
| PWA install/offline shell | all | PARTIALLY_IMPLEMENTED | `public/manifest.webmanifest`, `public/sw.js`, `src/main.jsx` | browser cache/local records | smoke, REG | No conflict-safe offline mutation/sync; Phase 12 |
| Universal loading/error boundary | app bootstrap | IMPLEMENTED | `src/main.jsx`, operations states | runtime | build, RL | Domain fallbacks need extraction with routes; Phase 2 |
| Universal Search | conceptual `/search` | PARTIALLY_IMPLEMENTED | legacy search/render logic in `src/App.jsx` | mixed local/catalog data | REG | Not grouped across all canonical records; after Phase 1B |

## Product workspaces

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Product workspace registry | all registered routes | IMPLEMENTED | `src/config/workspaceRegistry.js` | bundled validated metadata | WS | Published Phase 2A.5 registry classifies product, OWNER, GLOBAL, and legacy routes; it is navigation metadata, not authorization |
| Workspace switcher | product shell | IMPLEMENTED | `src/features/workspaces/WorkspaceSwitcher.jsx`, `src/App.jsx` | current route + verified session | WS, A11Y | Collect/Find/Sell/Business are product choices; Bot requires OWNER; Owner Center stays outside |
| Remembered product workspace | product shell | IMPLEMENTED | `src/features/workspaces/workspacePreference.js` | `code3.workspace-preference.v1`; existing non-coverage safe-preferences backup group | WS, backup | Public fallback plus optional inert Bot selection; direct route/current OWNER verification wins, Owner Center/authority fields are excluded, and it adds no business source or coverage claim |
| Route-derived workspace context | direct and compatibility routes | IMPLEMENTED | `src/config/workspaceRegistry.js`, `src/utils/appRouteState.js`, `src/App.jsx` | browser path/history | WS, RL, LR | Published Phase 2A.5; physical Android Back remains recommended and legacy renderer extraction is incomplete |
| Collect workspace home | `/collect` | CLIENT_LOCAL_ONLY | `src/features/workspaces/WorkspaceHomePage.jsx` | existing owned-item/collection records | WS, A11Y | Honest local summary/actions exist; binders, full sets/grading and durable canonical data remain incomplete |
| Find workspace home | `/find/home` | CLIENT_LOCAL_ONLY | `src/features/workspaces/WorkspaceHomePage.jsx` | existing Deal Finder/auction records | WS, FS, A11Y | Honest local sourcing summary exists; no new provider, scheduler, or purchase action |
| Sell workspace home | `/sell/home` | CLIENT_LOCAL_ONLY | `src/features/workspaces/WorkspaceHomePage.jsx` | existing inventory/sales records | WS, A11Y | Local projections exist; listing publication and external Orders remain unavailable |
| Bot workspace foundation | `/bot` | CLIENT_LOCAL_ONLY | `src/features/botOps`, `src/features/workspaces/WorkspaceHomePage.jsx`, verified owner session | `code3.bot-ops.v1`; empty normal runtime | BO, WS, owner security, A11Y | Provider-neutral local workflows and honest disconnected UI; no Hayha/Stellar connection, credential, provider network, task control, checkout, Purchase, or Inventory mutation |
| Business workspace home | `/business` | CLIENT_LOCAL_ONLY | existing Business workspace renderer + workspace registry | local purchases/inventory/sales/money | WS, RL, REG | Shared local business view; reporting and canonical durability remain incomplete |
| Owner Center separation | `/owner-center/*` | IMPLEMENTED | workspace registry + existing owner-session gate | verified session/private local repositories | WS, owner security, OC | Separate from product switcher and never a paid entitlement; legacy APIs still need broader backend policy |
| Future entitlement metadata | workspace registry | FRONTEND_ONLY | `src/config/workspaceRegistry.js` | bundled labels only | WS/security | `FREE`/`PLUS`/`PRO`/`BUSINESS`/`OWNER` hints are nonauthoritative; no billing/subscription system and OWNER is not purchasable |
| Cross-workspace record/action boundary | workspace navigation and existing record actions | PARTIALLY_IMPLEMENTED | registry, workspace homes, existing collection/purchase/inventory/sale handlers | shared existing records | WS, REG | Routes project existing IDs; full handoff contracts remain domain work, and no duplicate product-workspace datastore exists |

## Bot Operations

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Provider-neutral Bot adapter contract | internal | IMPLEMENTED | `src/features/botOps/providerAdapters.js`, `contracts.js`, `constants.js` | validated contract; injected test adapter only | BO | Capability support is explicit; no live SDK/network/bridge/webhook/export watcher |
| Bot provider registry | `/bot/bots` | IMPLEMENTED | `src/features/botOps/providerRegistry.js` | static safe metadata | BO, UI | Hayha and Stellar are `NOT_CONFIGURED`, retailer coverage empty/unverified and all live capabilities false; mock is test-only |
| Bot provider discovery evidence | `/bot/bots` | IMPLEMENTED | `src/features/botOps/providerDiscovery.js`, `docs/BOT_PROVIDER_CAPABILITY_REVIEW.md` | immutable bundled public-source summaries; no owner persistence | BO discovery/UI | Evidence status never changes connection status or live capability; research can become stale and requires re-review |
| Hayha live integration | future Bot provider | BLOCKED_BY_AUTHORIZATION | static registry and public-source matrix only | none | BO capability truth/discovery | No verified public read/status API or safe export; old docs/terms and restricted newer support material require current written provider confirmation; no live pilot recommended |
| Stellar offline task-export preview | `/bot/tasks` | IMPLEMENTED | `src/features/botOps/importPreview`, Bot Operations Tasks UI | ephemeral component memory only | STP, BO UI/browser | Explicit owner-selected JSON; 1 MiB/500-record bounds, recursive fail-closed scan, strict allowlist and discard/refresh clearing; no raw retention, import, persistence, provider network or capability claim |
| Stellar live integration | future Bot provider | BLOCKED_BY_AUTHORIZATION | static registry and public-source matrix only | none | BO capability truth/discovery, STP | Discord is notification-only; task-group export is owner-operated JSON with same-version transfer but no stable schema/version marker; the offline parser does not grant a live capability; developer WebSocket is input-to-Stellar, not read/status output; no live pilot recommended |
| Bot installations | `/bot/bots` | CLIENT_LOCAL_ONLY | `src/features/botOps` | `installations` | BO | Logical metadata only; no device fingerprint, live health check or real connection |
| Retailer-account references | `/bot/accounts` | CLIENT_LOCAL_ONLY | `src/features/botOps`, Account Ops contracts | `retailerAccountLinks` referencing Account Ops IDs | BO, AO | No retailer credential, signup, session, account action or duplicated authorization identity |
| Bot checkout profiles | `/bot/profiles` | CLIENT_LOCAL_ONLY | `src/features/botOps` | `botProfiles` referencing Account Ops metadata | BO, AO | Nonsecret configuration only; no payment-card/CVV or raw profile credential |
| Proxy metadata | `/bot/proxies` | CLIENT_LOCAL_ONLY | `src/features/botOps` | `proxyGroups` | BO security/UI | No live IP/host/endpoint/authentication URL/username/password; provider connection future |
| Product Targets | `/bot/targets` | CLIENT_LOCAL_ONLY | `src/features/botOps` | `productTargets` | BO | Reusable provider-neutral targets; no availability claim or duplicated canonical product authority |
| Task Groups | `/bot/task-groups` | CLIENT_LOCAL_ONLY | `src/features/botOps` | `taskGroups` | BO, UI | Local configuration only; cannot start a task |
| Tasks | `/bot/tasks` | CLIENT_LOCAL_ONLY | `src/features/botOps` | `tasks` | BO, UI | Normalized statuses and synthetic fixtures only; no live command path |
| Attempts and activity history | `/bot/activity` | CLIENT_LOCAL_ONLY | `src/features/botOps/reconciliation.js`, `src/features/botOps/repository.js`, `src/features/botOps/service.js` | append-only `attempts`, `activity` | BO history | Scoped event identity, replay/reorder/interruption/contradiction handling; no raw provider logs |
| Bot Checkout Evidence | `/bot/activity` | CLIENT_LOCAL_ONLY | `src/features/botOps/reconciliation.js`, `src/features/botOps/repository.js`, `src/features/botOps/service.js` | `checkoutEvidence` | BO history/security | Review/correction only; `Bot Success != Purchase` and `Checkout Evidence != Purchase` |
| Bot event idempotency/reconciliation | internal | IMPLEMENTED | `src/features/botOps/reconciliation.js`, `service.js` | provider + installation + event identity/source hash | BO history | Preserves changed/reordered/contradictory history; no external-order/Purchase reconciliation activated |
| Bot Operations secret/authority rejection | all Bot input/backup boundaries | IMPLEMENTED | `src/features/botOps/security.js`, validators/repository | no secret source | BO security, client security | Rejects credentials, proxy auth material, payment data, raw provider payloads/logs and client authority recursively |
| Bot Operations backup/Restore Preview | Owner Center Data & Backup | PARTIALLY_IMPLEMENTED | `src/features/backup`, Bot Operations validator | sanitized `code3.bot-ops.v1` section | BO, backup/preview | Ten paths `REQUIRES_MAPPING`; zero-write preview, no restore apply and no credential recovery |
| Checkout Evidence to Purchase | future owner-confirmed handoff | FUTURE | contract only | none | BO no-write | Future Order Candidate/external reconciliation and explicit OWNER confirmation required; no Purchase/receiving/Inventory writer |

## Home

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Home landing | `/` | IMPLEMENTED | `src/pages/OperationsHome.jsx` | Flip repository + app state | RL, A11Y, REG | Approved minimal baseline |
| Needs Attention | `/` | CLIENT_LOCAL_ONLY | `OperationsHome.jsx`, selectors in `App.jsx` | local deals/purchases/inventory/sales | REG | Durable associations after Phase 1B/7 |
| Best Opportunity | `/` | CLIENT_LOCAL_ONLY | `OperationsHome.jsx` | local analyzed deals/auctions | REG | Cross-source backend attribution later |
| Today / Recent Activity | `/` | CLIENT_LOCAL_ONLY | `OperationsHome.jsx` | local activity/deadlines | REG | Calendar/task normalization later |
| Business summary strip | `/` | CLIENT_LOCAL_ONLY | `OperationsHome.jsx` | local purchase/inventory/sales values | REG | Reporting semantics Phase 8 |

## Find, Deal Inbox, and analysis

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Find landing | `/find` | IMPLEMENTED | `src/features/flipScout/FlipScoutPage.jsx` | feature repository | RL, BR, REG | Preserve minimal hierarchy |
| Deals / Deal Feed | `/find/deals`, `/find/deal-feed` | CLIENT_LOCAL_ONLY | `screens/DealsScreen.jsx` | `deals`, `providerListings` | FS, BR, REG | Canonical backend Phase 1B |
| Deal filters and sorting | `/find/deals` | IMPLEMENTED | `DealsScreen.jsx`, Flip page selectors | local deals | FS, BR | Some final filters may need expansion after canonical schema |
| Deal Detail | `/find/deals` record view | PARTIALLY_IMPLEMENTED | Deal row/editor/detail behavior in feature/App shell | local deal/appraisal/history | BR, REG | Dedicated flat detail and full provenance fields incomplete; Phase 1B/2 |
| Deal deletion confirmation | Deal Inbox record | IMPLEMENTED | `DealsScreen.jsx` | local repository | BR, REG | Preserve confirmed delete; financial records later favor archive |
| Saved Opportunities | `/find/saved-searches` / status filters | PARTIALLY_IMPLEMENTED | `FlipScoutPage.jsx`, deal statuses | local deals | FS, RL | No complete dedicated saved-opportunity product; Phase 3 |
| Manual URL/listing entry | `/find/deals` / Add | IMPLEMENTED | Deal form and manual connector | local deals | FS, BR | Protected file evidence later |
| Scan/share listing entry | Global Add / Find | FRONTEND_ONLY | manual/screenshot entry surfaces | local references | REG | No OCR/share-target pipeline; Phase 3/10 |
| Deal Analysis entry | `/find/deal-analysis`, `/find/analyze` | IMPLEMENTED | `screens/AppraiserScreen.jsx`, `src/features/intelligence` | local draft/appraisals | FS, INT, BR, RL, REG | Phase 1C adds reusable deterministic results and linked card history; expanded target inputs and full evidence UI remain partial |
| Guided analysis workflow | same | PARTIALLY_IMPLEMENTED | `AppraiserScreen.jsx`, `RecordExperience.jsx`, `analysisPipeline.js` | session draft + tagged local appraisal revisions | FS, INT, A11Y, REG | Normalization/condition/valuation/recommendation pipeline exists; complete five-step capture and protected image flow remain |
| Decision summary | same | IMPLEMENTED | `AppraiserScreen.jsx`, `dealIntelligence.js` | calculation/intelligence result | FS, INT, BR, REG | New recommendation is advisory and explainable; preserve approved minimal order |
| Landed cost / net / profit / ROI | same | IMPLEMENTED | `src/features/flipScout/calculations.js` | pure inputs | FS | Target adds payment fees/gross/margin/tolls/labor etc.; Phase 7 |
| Maximum offer | same | IMPLEMENTED | calculations utility | pure inputs | FS | Target minor-unit model later |
| Profit margin | same | MISSING | no canonical calculation found | none | None focused | Add with complete sales semantics; Phase 7/8 |
| Target expanded cost model | same | PARTIALLY_IMPLEMENTED | calculation/forms | local appraisal inputs | FS | Missing several definitive cost fields and gross-collected semantics; Phase 7 |
| Comparable Records | conceptual `/find/deals/:id/comparables` | MISSING | Phase 1C valuation v2 accepts typed/conditioned evidence but has no record workflow/source | none authoritative | INT contract only | Licensed source and repository/detail UI remain required; active asks stay separate; unknown/incompatible comparable conditions are excluded |
| Projection comparison set preservation | Deal Analysis | CLIENT_LOCAL_ONLY | `valuation.js`, `analysisHistory.js` | tagged card-appraisal revision retains input/evidence/system result | INT | Matched-condition sales are not adjusted again and only explicit `NM` baselines may be adjusted; no canonical comparable entity or licensed feed |
| Projected-versus-actual result | Business/results view | CLIENT_LOCAL_ONLY | records/results screen and sale calculations | purchases/inventory/sales | FS | Associations/report coverage incomplete; Phase 8 |

## Import Review and eBay

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Import Review | `/find/ebay` / import review state | IMPLEMENTED | `screens/EbayDiscoveryScreen.jsx`, `ebayDiscovery.js` | browser discovery snapshots | EB, BR, REG | Durable import jobs later; review gate must remain |
| Review status distinctions | same | IMPLEMENTED | eBay discovery classification | local provider listings/deals | EB | Unified non-eBay imports later |
| eBay active-listing search | `/find/ebay`, `/find/ebay-search` | IMPLEMENTED | eBay screen/client + backend service | official eBay API via owner-protected server route | EB, RL, REG | Configure hosted owner authentication before Preview verification |
| eBay token cache/auth retry | server `/api/ebay/*` | IMPLEMENTED | `backend/src/services/ebayBrowse.service.ts` | server memory + environment secret | EB | Durable distributed cache not necessary until scale evidence |
| eBay filters/pagination/errors | same | IMPLEMENTED | eBay backend/client | upstream response | EB | Provider field availability remains conditional |
| eBay normalization/dedupe/change/expiry | Find/eBay | IMPLEMENTED | backend normalizer + `ebayDiscovery.js` + Phase 1C evidence adapter | official source fields/local snapshots | EB, INT | Source observations remain separately attributable and missing currency is not fabricated; move history/dedupe to canonical repository Phase 1B/3 |
| eBay server OWNER authorization | `/api/ebay/health`, `/api/ebay/search` | IMPLEMENTED | `backend/src/auth`, `backend/src/routes/ebay.routes.ts` | Supabase verified principal + server allowlist | Phase 1A auth/eBay tests | Published source; hosted environment verification and legacy-route expansion remain |
| eBay scheduled Search Rules | Owner Center Sourcing | BLOCKED_BY_AUTHORIZATION | no durable scheduler | none | None | Server auth/jobs and eBay production quota; Phase 3 |
| eBay search history | Owner Center Sourcing | BACKEND_REQUIRED | local jobs have no durable run history | local summaries only | OC partial | Phase 3 after Phase 1 |
| eBay notifications | Owner Center Controls | BACKEND_REQUIRED | UI/control placeholder | local control only | OC partial | Durable jobs/delivery Phase 3 |
| eBay sold comparables | none | BLOCKED_BY_AUTHORIZATION | none | none | None | Approved/licensed source required |
| Unified import queue | Owner Center Sourcing/Imports | PARTIALLY_IMPLEMENTED | Owner Center imports + eBay review + Sources/Data | local feature documents | OC, EB | File/share/email job model Phase 1B/3 |
| CSV import preview/mapping | Sources/Data | PARTIALLY_IMPLEMENTED | `csv.js`, Sources/Data screen | local files/records | FS | Unified staged mapping/errors missing; Phase 1B/8 |
| JSON backup/import | Sources/Data | PARTIALLY_IMPLEMENTED | feature exports plus `src/features/backup` v1 and Phase 1B canonical-export adapter | registered browser sources; validated owner-authorized canonical export when available | FS + Phase 1A backup tests + Phase 1B backup extension | Deterministic verified export/preview exists; gated/unavailable/partial server sources and file bytes remain excluded or partial; no apply restore |

## Search Rules and providers

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Search Rules list/editor | `/find/rules`, `/find/saved-searches` | CLIENT_LOCAL_ONLY | `screens/SearchRulesScreen.jsx` | `searchRules` | FS, EB filtering | Target fields/history/usefulness incomplete; Phase 3 |
| Optional rule templates | same | IMPLEMENTED | Search Rules screen/data | local disabled templates | FS | Remain disabled until configured |
| Rule test action | same | PARTIALLY_IMPLEMENTED | Search Rules/eBay search integration | live/manual result flow | EB | Durable run attribution/history missing; Phase 3 |
| Rule schedule/quiet hours | Owner Controls | FRONTEND_ONLY | fields/control concepts | local settings | OC | No scheduler; Phase 3 |
| Provider status screen | `/find/sources`, `/find/integrations` | IMPLEMENTED | `screens/SourcesDataScreen.jsx`, connectors | provider contract/server health | FS, EB, RL | Move technical detail Owner Center Controls in Phase 2/3 |
| Provider adapter contract | internal | PARTIALLY_IMPLEMENTED | `src/features/flipScout/connectors.js`, `src/features/intelligence/providerAdapters` | static definitions + provenance-separated local evidence | FS, INT | eBay keeps official identity/observations/active evidence separate and refuses default currency; full provider type/update/import/disconnect/terms contract remains |
| Mercari/Poshmark/Facebook/OfferUp | provider placeholders | IMPLEMENTED_DIFFERENTLY | connectors | manual entry only | FS | Honest manual import; automation needs approval |
| Whatnot | provider placeholder | BLOCKED_BY_AUTHORIZATION | connectors | manual entry only | FS | Owner seller scopes/approved access required |
| Auction generic provider | provider placeholder | CLIENT_LOCAL_ONLY | connectors + auctions screen | manual records | FS | Source registry/feeds Phase 4 |
| Email alert import | provider placeholder | BLOCKED_BY_AUTHORIZATION | connector status only | none | FS status | Mail authorization/parser/review Phase 3/4 |
| OS share target | conceptual | MISSING | none | none | None | PWA ingestion/review pipeline Phase 3 |

## Restocks

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Find Restocks landing | `/find/restocks` | PARTIALLY_IMPLEMENTED | `screens/RestocksScreen.jsx`, owner handoff/legacy data | local owner/legacy store data | OC, RL, REG | Complete actionable normal-workspace flow Phase 5 |
| Live Restocks | `/find/restocks` / Owner Restocks Live | CLIENT_LOCAL_ONLY | Owner Center restock views/models | owner repository events/predictions | OC | Canonical data and fast entry Phase 5 |
| Store Directory | Restocks Stores | IMPLEMENTED_DIFFERENTLY | legacy stores data/UI + Owner profiles | seed/backend/local | OC/legacy store tests | Directory exists but canonical evidence separation/detail incomplete |
| Store Detail | conceptual Restocks store detail | PARTIALLY_IMPLEMENTED | Owner Center store profile view | local profiles/events/visits | OC | Dedicated everyday detail and canonical identity Phase 5 |
| Product Detail | conceptual Restocks product detail | PARTIALLY_IMPLEMENTED | Owner Center Products view | local observations/inventory | OC | Dedicated linked record incomplete; Phase 5 |
| Report Restock | Global Add / Restocks | PARTIALLY_IMPLEMENTED | legacy reports + owner repository model | legacy/local reports | OC/legacy tests | Fast canonical form/evidence/protected photo Phase 5 |
| Record Store Visit | Global Add / Restocks | FRONTEND_ONLY | owner model/forms are incomplete | local visits | OC | Working quick form and purchase/mileage link Phase 5 |
| Trip Planner | conceptual Restocks trip planner | MISSING | none | none | None | Real route inputs and no optimization claim; Phase 5 |
| Restock pattern calculations | Owner Center Restocks Patterns | CLIENT_LOCAL_ONLY | `ownerCenterModel.js`, `src/features/intelligence/restockIntelligence.js` | local events/predictions/visits/observations | OC, INT | Coarse bands use last-positive freshness and source-independent confidence; result recomputes from observations, and canonical records/full review UI remain Phase 5 |
| Prediction outcome review | Owner Center Restocks | PARTIALLY_IMPLEMENTED | owner model/repository fields | local predictions | OC | Full review workflow/timing error history Phase 5 |
| Restock performance | Owner Center Performance | PARTIALLY_IMPLEMENTED | owner metrics | local events/visits and some sales links | OC | Trip profit attribution often unavailable; Phase 5/8 |

## Auctions

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Auction Feed | `/find/auctions` | CLIENT_LOCAL_ONLY | `screens/AuctionsScreen.jsx` | `auctions` | FS, RL | Views/source feeds incomplete; Phase 4 |
| Add/edit manual auction | `/find/auctions` / Global Add | IMPLEMENTED | Auctions screen/forms | local auctions | FS | Canonical event/lot split Phase 4 |
| Auction Event detail | conceptual | PARTIALLY_IMPLEMENTED | combined auction record/editor | local auctions | FS | Registration/payment/pickup/terms model incomplete |
| Auction Lot detail | conceptual | PARTIALLY_IMPLEMENTED | combined auction record/editor, `lotIntelligence.js`, `auctionIntelligence.js` | local auctions + saved result snapshot | FS, INT | Conservative/expected/optimistic and explainable bid services exist; no generic linked revision series, and separate event/lot detail/source terms remain |
| Maximum Bid calculator | `/find/auctions` | IMPLEMENTED | existing calculation/UI plus `src/features/intelligence/auctionIntelligence.js` | pure integer-minor-unit inputs/local auction | FS, INT | Explainable bounded solver includes premium/tax/shipping/pickup/labor/disposal; full source workflow remains Phase 4 |
| Tax-base modes | same | IMPLEMENTED | existing utility + Phase 1C `AUCTION_TAX_MODE` | pure inputs | FS, INT | `NONE`, hammer, hammer-plus-premium, manual subtotal, and actual-tax contracts exist; source-specific terms UI remains |
| Live Bid Mode | conceptual | MISSING | none | none | None | Read-only decision display Phase 4 |
| Pickup Planner | conceptual | MISSING | none | none | None | Logistics/checklist Phase 4 |
| Auction Calendar | conceptual | PARTIALLY_IMPLEMENTED | ending/pickup indicators and app deadlines | local auctions | FS/REG | Dedicated calendar and time-zone hardening Phase 4 |
| Auction Source Detail | Owner Center Sourcing | FRONTEND_ONLY | provider/source status concepts | static/manual data | OC | Registry/terms/capabilities Phase 4 |
| Auction-to-purchase flow | Auction record actions | PARTIALLY_IMPLEMENTED | auction/purchase local forms | local repositories | FS | Canonical linkage and won/payment/pickup states Phase 4/7 |
| Auction performance | Owner Center Performance | PARTIALLY_IMPLEMENTED | owner source metrics | local auctions/purchases/sales | OC | Bid/win/terms/processing attribution incomplete; Phase 4/8 |

## Collection and owned items

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| My Collection | `/collection`, `/collection/collection` | CLIENT_LOCAL_ONLY | `src/pages/EverydayWorkspaces.jsx` | local inventory/owned-purpose compatibility | OC purpose, RL, REG | Canonical OwnedItem Phase 1B/6 |
| Collection search/filter/summary | same | IMPLEMENTED | Collection workspace | local items | REG | Extend filter fields with canonical product identity |
| Collection Item Detail | canonical/legacy detail | PARTIALLY_IMPLEMENTED | workspace/App detail renderers | local inventory/catalog | REG | One flat canonical detail, audit/provenance incomplete; Phase 6 |
| Owned-item purpose model | internal | IMPLEMENTED | `src/features/ownedItems/ownedItemPurpose.js` | inventory record/history | OC | Migrate to canonical server audit Phase 1B |
| Sell This Item purpose change | item detail/action | IMPLEMENTED | purpose utility and collection/business handoff | same physical local record | OC, REG | Preserve during canonical migration |
| Sets | `/collection/sets` | CLIENT_LOCAL_ONLY | Collection workspace derived set view | local items/catalog | RL, REG | Completion/missing/variants/cost details incomplete; Phase 6 |
| Set Detail | conceptual | PARTIALLY_IMPLEMENTED | set view/legacy catalog flows | local items/catalog | legacy catalog tests | Canonical dedicated detail Phase 6 |
| Binders | conceptual `/collection/binders` | MISSING | legacy collection fields only | local legacy records | None focused | Binder/page/slot model Phase 6 |
| Binder Detail | conceptual | MISSING | none | none | None | Phase 6 |
| Binder Placeholder Generator | conceptual | MISSING | none | none | None | Printing/licensed image review Phase 6 |
| Wishlist | `/collection/wishlist` | CLIENT_LOCAL_ONLY | Collection workspace wishlist view | local item flags/legacy data | RL, REG | Target matching/price/source/alert model Phase 6 |
| Grading Queue | `/collection/grading` | CLIENT_LOCAL_ONLY | Collection workspace/grade-assist legacy | local items/checklists | RL, legacy tests | Submission/cost/result lifecycle Phase 6 |
| Unassigned Item Review | Collection More | PARTIALLY_IMPLEMENTED | purpose compatibility/filter | local inventory | OC | Dedicated review/preview Phase 6 |

## Purchases

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Purchase List | `/business/purchases`, `/purchases` | CLIENT_LOCAL_ONLY | `screens/RecordsScreen.jsx`, Business workspace | `purchases` | FS, RL, REG | Canonical repository/status expansion Phase 7 |
| Purchase Detail | business record detail | PARTIALLY_IMPLEMENTED | Records screen/App detail | local purchase/lot/activity | FS/REG | Full dates/payment/receipt/logistics/history incomplete |
| Record Purchase | Global Add | IMPLEMENTED | purchase form | local repository | FS, REG | Backend persistence Phase 1B/7 |
| Receive Purchase | conceptual | FRONTEND_ONLY | statuses/basic editing only | local purchase | FS partial | Guided quantity/damage/dispute/photos Phase 7 |
| Lot Processing | business purchase/lot view | PARTIALLY_IMPLEMENTED | Records screen/allocation utilities | `lots`, `inventory` | FS | Unknown/bulk/purpose processing workflow incomplete; Phase 7 |
| Cost Allocation | lot view | IMPLEMENTED | `inventory.js` allocation/reconciliation | local lots/inventory | FS | Add BULK/MIXED and explicit rounding/accepted difference Phase 7 |
| Purchase Return / Refund | conceptual | MISSING | no complete purchase return entity/workflow | none | None | Phase 7 |

## Inventory

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Resale Inventory | `/business/inventory`, `/inventory` | CLIENT_LOCAL_ONLY | Records screen, Business workspace | `inventory` | FS, RL, REG | Canonical OwnedItem/adjustments Phase 1B/7 |
| Inventory Item Detail | business detail | PARTIALLY_IMPLEMENTED | Records/App detail renderers | local item/purchase/sales | FS/REG | Available/reserved/history canonical detail incomplete |
| Processing Queue | conceptual | PARTIALLY_IMPLEMENTED | status filters/forms | local inventory | FS | Full status workflow Phase 7 |
| Storage Locations | conceptual | PARTIALLY_IMPLEMENTED | storage text fields/legacy settings | local records | legacy tests | Hierarchical entity and move audit Phase 7 |
| Labels and QR Codes | conceptual | IMPLEMENTED_DIFFERENTLY | legacy label/print utilities if present | local item fields | legacy tests | Canonical Rollo sizes/preview/reprint and no-state-change tests Phase 7 |
| Inventory Aging | Business/reports | PARTIALLY_IMPLEMENTED | dashboard/report calculations | local inventory dates | FS/REG | Dedicated configurable aging view Phase 8 |
| Quantity validation / no double sale | sale form | IMPLEMENTED | `src/features/flipScout/inventory.js` | inventory/sales | FS | Server transaction/constraint Phase 7 |

## Sales and fulfillment

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Sales landing/list | `/business/sales`, `/sell`, `/sales` | CLIENT_LOCAL_ONLY | Records screen/Business workspace | `sales` | FS, RL, REG | Canonical server records Phase 7 |
| Listing Drafts | conceptual | PARTIALLY_IMPLEMENTED | local inventory/listing fields and forms | local records | FS partial | Dedicated draft/channel/template/confirmation Phase 7 |
| Active Listings | conceptual | PARTIALLY_IMPLEMENTED | inventory status/external URL fields | local inventory | FS | Reservations/oversell/view metrics Phase 7 |
| Record Sale / Sale Detail | Global Add / Business Sales | CLIENT_LOCAL_ONLY | sales form/results | `sales`, `inventory` | FS, REG | Full line items/payout/tracking/return model Phase 7 |
| Sales channel profiles | conceptual | MISSING | channel strings/defaults only | local fields | None | Phase 7 |
| Shipping | conceptual | MISSING | cost/tracking fields only | local sale | None focused | Dedicated shipment/label/checklist Phase 7 |
| Returns and Refunds | conceptual | MISSING | refunded status excluded in validation; no full return flow | local sales | FS partial | Preserve sale/inspection/quantity/profit Phase 7 |
| Antique Shop / Booth | conceptual | IMPLEMENTED_DIFFERENTLY | legacy seller/shop concepts | mixed legacy local data | legacy tests | Target private booth statement/reconciliation missing; Phase 7 |

## Money and reporting

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Money landing | `/business/money` | CLIENT_LOCAL_ONLY | Records/Business workspace | local financial records | FS, RL, REG | Backend/report semantics Phase 8 |
| Expenses | `/business/money/expenses` | CLIENT_LOCAL_ONLY | expense form/list | `expenses` | FS, RL | Receipts/recurrence/full associations incomplete |
| Mileage | `/business/money/mileage` | CLIENT_LOCAL_ONLY | mileage form/list | `mileage` | FS, RL | Odometer/parking/toll detail incomplete |
| Receipts | Global Add / legacy receipt workflows | PARTIALLY_IMPLEMENTED | legacy Phase 2 persistence/UI | local/Supabase optional | legacy receipt tests | Protected file + canonical association Phase 1B/8 |
| Cash Commitments | conceptual | MISSING | none | none | None | Phase 8 |
| Reports | `/business/money/reports`, `/reports` compatibility | PARTIALLY_IMPLEMENTED | local results/legacy reports | local/Supabase mixed | FS/legacy tests | Full semantic/traceable reports Phase 8 |
| Reconciliation | `/business/money/reconciliation` | FRONTEND_ONLY | records/results warning foundations | local records | FS partial | Canonical typed issues/corrections Phase 8 |
| Complete bookkeeping export | Owner Controls/Sources Data | PARTIALLY_IMPLEMENTED | CSV/JSON utilities | local feature data | FS | Date-range package/all domains/validation Phase 8 |

## Owner Center

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Owner Center authorization UI | `/owner-center/*` | PARTIALLY_IMPLEMENTED | `ownerSession.js`, `ownerAuthorization.js`, `src/App.jsx`, Owner Center page | verified Supabase session or narrow local/test adapter | Phase 1A auth, OC, RL, REG | Published session-backed states; eBay and Phase 1B canonical routes use server policy, legacy routes and hosted configuration remain |
| Overview five rows | `/owner-center/overview` | IMPLEMENTED | `OwnerCenterPage.jsx` | local/provider health summaries | OC, A11Y, REG | Preserve compact contract |
| Sourcing / All Opportunities | `/owner-center/sourcing/all` | CLIENT_LOCAL_ONLY | Owner Center page/models | local deals/auctions/restocks/imports | OC | Canonical cross-source backend Phase 1B/3–5 |
| Sourcing / eBay | `/owner-center/sourcing/ebay` | PARTIALLY_IMPLEMENTED | Owner Center + eBay handoff | live health and local outcomes | OC, EB | Durable run/performance attribution Phase 3 |
| Sourcing / Auctions | `/owner-center/sourcing/auctions` | PARTIALLY_IMPLEMENTED | Owner Center + auctions | local auctions | OC | Source registry and feed states Phase 4 |
| Sourcing / Imports | `/owner-center/sourcing/imports` | CLIENT_LOCAL_ONLY | Owner Center imports | local import summaries/eBay review | OC, EB | Unified import jobs/files Phase 1B/3 |
| Sourcing / Search Rules | `/owner-center/sourcing/rules` | CLIENT_LOCAL_ONLY | Owner Center/Flip Search Rules | local rules | OC, FS | History/usefulness/scheduler Phase 3 |
| Sourcing / Search History | conceptual | MISSING | no durable run entity | none | None | Phase 3 |
| Sourcing / Sellers | conceptual | MISSING | seller fields on deals only | local deal fields | None focused | SellerProfile Phase 1B/3 |
| Sourcing / Source Profiles | conceptual | PARTIALLY_IMPLEMENTED | connector definitions/status | static/local | FS/OC | Terms/coverage/outcomes repository Phase 3/4 |
| Restocks / Live | `/owner-center/restocks/live` | CLIENT_LOCAL_ONLY | Owner Center page/models | local restock repository | OC | Phase 5 |
| Restocks / Stores | `/owner-center/restocks/stores` | CLIENT_LOCAL_ONLY | Owner Center page/models | local profiles/events/visits | OC | Phase 5 |
| Restocks / Products | `/owner-center/restocks/products` | CLIENT_LOCAL_ONLY | Owner Center page/models | local observations/inventory | OC | Phase 5 |
| Restocks / Patterns | `/owner-center/restocks/patterns` | CLIENT_LOCAL_ONLY | Owner Center metrics | local real records | OC | More data/thresholds Phase 5 |
| Restocks / Visit History | conceptual/subview | PARTIALLY_IMPLEMENTED | visit data in store/pattern views | local visits | OC | Dedicated view Phase 5 |
| Restocks / Prediction Review | conceptual/subview | PARTIALLY_IMPLEMENTED | prediction outcomes/model | local predictions | OC | Dedicated review/audit Phase 5 |
| Performance / Overview | `/owner-center/performance/overview` | PARTIALLY_IMPLEMENTED | Owner Center metrics | local records | OC | Full funnel/attribution Phase 8 |
| Performance / Sources | `/owner-center/performance/sources` | PARTIALLY_IMPLEMENTED | `ownerCenterModel.js` | local deals/purchases/sales | OC | Complete COGS/days/loss variance Phase 8 |
| Performance / Search Rules | `/owner-center/performance/rules` | PARTIALLY_IMPLEMENTED | rule metrics with sample threshold | local records/rules | OC | Durable search-run review-time/false-positive Phase 3/8 |
| Performance / Restocks | `/owner-center/performance/restocks` | PARTIALLY_IMPLEMENTED | restock metrics | local visits/predictions | OC | Complete profit attribution Phase 5/8 |
| Performance / Auctions | conceptual | PARTIALLY_IMPLEMENTED | source metrics can include auctions | local auctions/purchases/sales | OC | Dedicated bid/win/performance Phase 4/8 |
| Performance / Deal Accuracy | `/owner-center/performance/deals` | PARTIALLY_IMPLEMENTED | projected/actual local metrics | appraisals/purchases/sales | OC, FS | Expected days and cause variance incomplete Phase 8 |
| Controls / Connections | `/owner-center/controls/connections` | PARTIALLY_IMPLEMENTED | Owner Center controls + provider health | static/live health/local controls | OC, EB | Server auth/connection repository Phase 1A/3 |
| Controls / Schedules | `/owner-center/controls/schedules` | FRONTEND_ONLY | controls UI | local settings | OC | No job scheduler Phase 3 |
| Controls / Scoring | `/owner-center/controls/scoring` | CLIENT_LOCAL_ONLY | owner repository/control UI | local scoring defaults | OC | Server persistence; saved analyses correctly not retroactive |
| Controls / Notifications | `/owner-center/controls/notifications` | FRONTEND_ONLY | controls UI/legacy notifications | local settings/records | OC | Durable delivery Phase 3 |
| Controls / Imports | `/owner-center/controls/imports` | PARTIALLY_IMPLEMENTED | local import/export controls | feature repositories | OC, FS | Canonical import jobs Phase 1A/1B |
| Controls / Data and Backup | `/owner-center/controls/data-backup` | PARTIALLY_IMPLEMENTED | Owner Center + `src/features/backup`, `MigrationReadinessPanel.jsx`, `src/services/code3OwnerApi.js` | registered browser sources; owner-authorized canonical read export when available | Phase 1A backup/preview + Phase 1B migration tests | Verified export/restore preview plus local `DRY_RUN_ONLY` Migration Readiness; canonical export remains unavailable/partial while gated, file bytes stay omitted, and no restore or migration apply exists |
| Controls / Feature Controls | `/owner-center/controls/features` | CLIENT_LOCAL_ONLY | owner repository | local feature flags | OC, REG | Not security; server capability states Phase 1A |
| Controls / Security | `/owner-center/controls/security` | PARTIALLY_IMPLEMENTED | owner session UI + backend auth policy | Supabase token/server allowlist | Phase 1A auth/CORS | No device/session administration; most legacy routes lack owner policy |
| Controls / System History | `/owner-center/controls/system` | FRONTEND_ONLY | local activity/job summaries | local owner repository | OC | Durable jobs/audit/version history Phase 1A/3 |

## Account Ops

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Account Ops private Business area | `/account-ops/*` | PARTIALLY_IMPLEMENTED | `src/features/accountOps/AccountOpsPage.jsx`, workspace registry, `src/App.jsx`, `src/utils/appRouteState.js` | verified session gate + local source | AO, WS, RL | Published local metadata UI is Business-associated but remains `VERIFIED_OWNER` before storage load; server persistence/per-record authorization remain future |
| Account Ops Overview | `/account-ops` | CLIENT_LOCAL_ONLY | Account Ops page/model selectors | `code3.account-ops.v1` | AO validated local | Metrics, attention, and activity derive from local records; no remote/provider activity |
| Profiles and custom groups | `/account-ops/profiles` | CLIENT_LOCAL_ONLY | Account Ops contracts/service/UI | `profileGroups`, `profiles` | AO validated local | CRUD/archive/relationships are local; profile is never authentication identity |
| Profile/account search and filters | Account Ops list sections | IMPLEMENTED | Account Ops UI/selectors | local snapshot | AO/A11Y validated local | Search/filter is local only; no universal-search indexing |
| Email alias generation | `/account-ops/emails` | CLIENT_LOCAL_ONLY | `aliasEngine.js`, Account Ops UI | `emailDomains`, `emailAliases` | AO validated local | Secure random/token templates and collision checks create metadata only, not receiving mail |
| Generated-versus-provisioned alias state | `/account-ops/emails` | IMPLEMENTED | alias/provider contracts and status UI | alias metadata | AO validated local | Capability truth is explicit; no provider call is implied |
| Email domain/catch-all metadata | `/account-ops/emails` | CLIENT_LOCAL_ONLY | email-provider/domain contracts | `emailDomains` | AO validated local | Owner metadata only; catch-all operation is not verified or provisioned by Code 3 |
| Provider-managed alias provisioning | future Account Ops Emails | BLOCKED_BY_AUTHORIZATION | provider-neutral adapter boundary only | none active | AO contract validated local | Requires approved provider, server secret, owner authorization, health checks, and retention policy |
| Retailer directory | `/account-ops/accounts` | CLIENT_LOCAL_ONLY | `retailerDirectory.js`, Account Ops service/UI | static presets + custom `retailers` | AO validated local | Presets do not assert signup/order capabilities; custom retailers remain device-local |
| Store account registry | `/account-ops/accounts` | CLIENT_LOCAL_ONLY | Account Ops contracts/service/UI | `storeAccounts` plus profile/alias/retailer links | AO validated local | Metadata and archive state exist; no retailer API, login, order, or secret storage |
| Assisted account setup | `/account-ops/accounts` | CLIENT_LOCAL_ONLY | setup contracts/checklist/UI | local account state | AO validated local | Owner-triggered preparation/checklist only; CAPTCHA, OTP, verification, signup submission, and limits stay human/retailer controlled |
| Account Health | Overview/Accounts | CLIENT_LOCAL_ONLY | `accountHealth.js` | local relationships, verification state, tasks | AO validated local | Explainable local derivation; it cannot infer a ban or retailer enforcement without evidence |
| Credential references | Store Account detail/setup | CLIENT_LOCAL_ONLY | credential-reference contract | nonsecret reference metadata | AO/security validated local | No plaintext secret; reference does not prove an external vault entry exists |
| Secure credential provider | future Account Ops Controls | BLOCKED_BY_AUTHORIZATION | provider types only | none active | AO contract validated local | External password-manager or OS-secure-store approval/integration required |
| Ephemeral password generator | assisted setup | IMPLEMENTED | `passwordGenerator.js`, setup UI | UI memory only | AO/security validated local | Immediate copy/regenerate only; unsaved value is unrecoverable and never logged, persisted, or backed up |
| Account Ops tasks | `/account-ops/tasks` | CLIENT_LOCAL_ONLY | Account Ops service/UI | `tasks` | AO validated local | Manual/account-generated local tasks work; this is not the full global Task/Calendar system |
| Safe bulk metadata actions | Account Ops lists | PARTIALLY_IMPLEMENTED | Account Ops selection/service actions | local records | AO validated local | Limited to metadata grouping/retailer assignment/archive/task/export; no bulk signup or verification action |
| Account Ops backup/preview | Owner Center Data & Backup | PARTIALLY_IMPLEMENTED | backup registry/validation/restore preview | Account Ops section in Backup v1 | AO + backup/preview validated local | Metadata is included and previewed zero-write; secrets prohibited, all eight migration paths require mapping, and no restore apply exists |
| Provider Connections foundation | `/account-ops/connections` | PARTIALLY_IMPLEMENTED | `src/features/accountOps/InboxOrderFoundation.jsx`, `src/services/accountOpsProviderApi.js`, `backend/src/providerRuntime`, exact Vercel entries | safe server capability/status projection only | IO, AO, owner security, Preview runtime | UI distinguishes trusted Preview execution from provider readiness; Gmail/Outlook have no active capability, connection, callback, token store, or mailbox access |
| Unified Inbox evidence foundation | `/account-ops/inbox` | CLIENT_LOCAL_ONLY | `src/features/inboxOrder`, `src/features/accountOps/InboxOrderFoundation.jsx` | `code3.inbox-order.v1` minimized message events | IO, AO | Deterministic synthetic normalization/protected-message handling works locally; no provider authorization, message fetch, raw-body store, cursor reader, webhook, or background delivery |
| Live mailbox connection and ingestion | future provider flow | BLOCKED_BY_AUTHORIZATION | provider interfaces and unavailable runtime only | none active | IO security | Requires approved provider/scopes, managed secret store, atomic OAuth-state store, verified hosted API/callback routing, retention, disconnect/revocation, and test-account approval |
| Protected-message minimization | local Inbox processing boundary | IMPLEMENTED | `src/features/inboxOrder/messageNormalization.js`, `src/features/inboxOrder/security.js` | minimized event metadata only | IO security | OTP/reset/login/security values are removed before hash/persistence/backup; live provider ingestion remains blocked |
| Retail order intelligence / Order Candidates | `/account-ops/orders` | CLIENT_LOCAL_ONLY | `src/features/inboxOrder`, `src/features/accountOps/InboxOrderFoundation.jsx` | local candidate projections and append-only events | IO, AO | Exact-minor-unit synthetic processing, idempotency, reconciliation/retry repair, confidence/provenance, and owner review exist; no live provider/order importer |
| Order Candidate owner review | local synthetic/owner evidence workflow | CLIENT_LOCAL_ONLY | `src/features/inboxOrder/service.js`, `src/features/inboxOrder/repository.js` | `orderCandidates`, `candidateEvents` | IO history/security | Confirm/correct/reject preserves prior evidence and owner provenance; later provider evidence cannot silently overwrite owner correction |
| Business Purchase import from candidate | future reviewed handoff | FUTURE | contract/mapping description only | none | IO no-write | No active Import Purchase action and no Purchase, lot, inventory, receipt, sale, or file write from external evidence |
| Purchase Draft review boundary | `/business/purchases` | CLIENT_LOCAL_ONLY | `src/features/purchaseReceiving`, owner-gated Purchase/Receiving page | `code3.purchase-receiving.v1.purchaseDrafts` | PR focused/local | Drafts retain source references/provenance and owner corrections; no Order Candidate or Checkout Evidence is automatically imported or mutated |
| Owner-confirmed local Purchase | `/business/purchases` | CLIENT_LOCAL_ONLY | Purchase/Receiving service and contracts | `code3.purchase-receiving.v1.purchases` | PR domain/money/idempotency | Explicit verified-OWNER confirmation creates exactly one exact-money local Purchase; no remote/canonical write and no implied receipt |
| Exact purchase cost allocation | Purchase confirmation and handoff preview | IMPLEMENTED | integer-minor-unit allocator | confirmed Purchase line allocations | PR money/allocation | Proportional BigInt floor plus stable largest-remainder distribution reconciles order pools; zero-weight/mixed-currency ambiguity blocks rather than guesses |
| Receiving workflow | `/business/purchases` | CLIENT_LOCAL_ONLY | Purchase/Receiving service/UI | `receivingEvents`, `purchaseEvents` | PR receiving/history | Multiple owner-confirmed partial/discrepancy events are append-only; delivery never auto-receives and repeated event IDs are idempotent |
| Inventory Handoff Preview | `/business/purchases` | CLIENT_LOCAL_ONLY | pure derived projection | component memory only | PR zero-inventory/security | Shows what eligible received units/cost would map to; no Save/Create Inventory action, persistence source, quantity mutation, or cost-basis mutation |
| Purchase/Receiving backup and preview | Owner Center Data & Backup | PARTIALLY_IMPLEMENTED | backup registry/validator/Restore Preview | sanitized `purchase-receiving` Backup v1 section | PR + backup/preview | Five paths included and `REQUIRES_MAPPING`; credentials/raw evidence and Inventory Handoff Preview excluded; restore apply remains absent |
| Inbox/Order backup and preview | Owner Center Data & Backup | PARTIALLY_IMPLEMENTED | backup registry/validator/Restore Preview | sanitized `inbox-order-intelligence` Backup v1 section | IO + backup/preview | Four local paths are included and `REQUIRES_MAPPING`; tokens, OAuth state/codes/verifiers, raw/protected content and security links are prohibited; restore apply remains absent |

## Secondary modules

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Kids' Packs | `/kids-community` / legacy kids routes | IMPLEMENTED_DIFFERENTLY | legacy kids/community renderers and Phase 2 persistence | local/Supabase legacy | legacy kids tests, REG | Recast as private internal records; Phase 11 |
| Donations | Kids & Community | PARTIALLY_IMPLEMENTED | legacy donation/community flows | legacy local/Supabase | legacy tests | Canonical owned-item/cost/privacy model Phase 11 |
| Giveaways | Kids & Community | PARTIALLY_IMPLEMENTED | legacy giveaway/community concepts | legacy local data | legacy tests | Internal tracking model Phase 11 |
| Community Events / Impact | Kids & Community | PARTIALLY_IMPLEMENTED | legacy event/impact UI | legacy local data | legacy tests | Minimized data and traceable cost Phase 11 |
| Marketing & Content | legacy content/calendar surfaces | IMPLEMENTED_DIFFERENTLY | legacy `App.jsx` content/planner features | Phase 2 local/Supabase | legacy tests | Feature-flagged private target Phase 11 |
| Content publishing | none canonical | BLOCKED_BY_AUTHORIZATION | draft-like legacy surfaces only | none approved | None | Approved provider and explicit confirmation required |
| Business Assistant | `/assistant`, settings help route | IMPLEMENTED_DIFFERENTLY | legacy assistant/thread logic | `et-ember-assist-thread` and local records | legacy assistant tests | Not full record-grounded/authorized query service; Phase 9 |
| Notifications | profile/legacy notification routes | PARTIALLY_IMPLEMENTED | legacy notification UI/services | local/Supabase optional | legacy tests | No reliable background delivery Phase 3/12 |
| Tasks and Calendar | legacy daily/calendar concepts | IMPLEMENTED_DIFFERENTLY | `src/App.jsx` legacy task/deadline views | local mixed data | REG/legacy tests | Canonical Task/CalendarEvent model missing |
| Settings | `/settings/*` | IMPLEMENTED_DIFFERENTLY | large legacy settings renderers | mixed profile/local/Supabase | RL, REG | Target private settings/security consolidation Phase 1A/2 |
| Lock App | profile target | MISSING | no complete secure device lock | none | None | Session/device security Phase 1A/12 |
| Sign Out | auth/profile | IMPLEMENTED | `src/App.jsx`, Supabase/local auth logic | auth session | auth/REG | Server session revocation target Phase 1A |

## Backend, data, backup, and optional intelligence

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Owner authentication | auth/session + onboarding compatibility | PARTIALLY_IMPLEMENTED | `src/services/ownerSession.js`, `backend/src/auth`, `/api/auth/session` | Supabase access token + server allowlist | Phase 1A auth/CORS, Preview runtime, REG | Published immutable-subject boundary; Phase 2B2-B retains it unchanged, but legitimate owner Preview proof/configuration, devices/revocation, and legacy routes remain |
| Future role policy | none | FUTURE | legacy role constants differ | profile roles | role tests | Collaborator/helper/bookkeeper/read-only disabled until needed |
| Canonical relational persistence | `/api/code3/*` target | PARTIALLY_IMPLEMENTED | `backend/src/code3`, `backend/src/routes/code3.routes.ts`, unexecuted `20260820120000_code3_canonical_owner_records.sql` | in-memory/dry-run test adapter; PostgreSQL target | Phase 1B repository/schema/migration tests | `SCHEMA_ONLY` and `NOT_ACTIVE`; filter/archive/ordering and active-identity semantics align, create/update cannot spoof archive, the server cursor is UUID-strict while the private local cursor preserves legacy IDs, and no schema executed, owner data migrated, or `REMOTE_ACTIVE` cutover |
| Protected object storage | private API target | BACKEND_REQUIRED | Phase 1B typed `FILE_ASSET` envelope/`code3_file_assets` metadata, explicit manifest preview, owner-scoped FK and related-record validation; no byte service | local URL/reference or supplied metadata manifest | Phase 1B schema/preview partial | Metadata is `SCHEMA_ONLY`; normal backup does not synthesize a manifest, and upload/protected access/scan/byte migration/byte backup remain future |
| Complete backup and restore | Owner Controls | PARTIALLY_IMPLEMENTED | `src/features/backup`, Data & Backup UI, `src/services/code3OwnerApi.js`, remote-export adapter | registered browser sources plus owner-authorized canonical export when available | Phase 1A backup/preview + Phase 1B backup extension | Integrity and no-write previews implemented; canonical export uses a consistent repository snapshot and verified hash, unavailable remote/file bytes keep coverage partial, and neither restore nor migration apply exists |
| Append-only audit log | system history | BACKEND_REQUIRED | Phase 1C append-only local card-analysis revisions plus unexecuted `code3_audit_events` schema and future migration-journal contract | local card history/schema only | INT, OC + Phase 1B schema | Auction/restock lack a generic revision series; no general durable audit writer or production migration journal |
| Background job scheduler | Owner Controls | BACKEND_REQUIRED | no canonical scheduler | none/local summaries | None | Phase 3 after auth/data |
| Cross-device sync/conflicts | app-wide | BACKEND_REQUIRED | Phase 1B persistence modes and offline/sync contract | browser-local | Phase 1B mode/conflict tests | `NOT_ACTIVE`; no cache sync or pending-write engine until a later phase |
| Mailbox provider trusted runtime | `/api/account-ops/provider-connections` | PARTIALLY_IMPLEMENTED | `api/account-ops/provider-connections.ts`, `backend/src/providerRuntime`, `backend/src/routes/providerConnections.routes.ts` | exact Preview/project/branch managed adapters; Free Upstash resource and three branch-scoped Preview secrets exist but activation remains incomplete; test-only memory adapters | IO provider runtime + Phase 2B2-A/B + owner security | Exact Preview function exists; legitimate owner plus exact durable-kind/write-read-delete proof is paused pending Supabase sign-in and remaining Preview configuration; connect/callback/network adapter/live scope remain absent |
| Exact Preview owner-session mapping | `/api/auth/session` | PARTIALLY_IMPLEMENTED | `api/auth/session.ts`, canonical `backend/src/server.ts` auth router | Supabase application identity only | Preview runtime + owner security | Exact filesystem function avoids SPA ambiguity; real Preview owner proof depends on existing server auth configuration and does not grant provider access |
| Mailbox secret storage | server-only provider boundary | PARTIALLY_IMPLEMENTED | `backend/src/providerRuntime/secretStore.ts`, `backend/src/providerRuntime/managedRedis.ts`, `backend/src/providerRuntime/managedStores.ts` | exact Preview/project/branch AES-256-GCM Redis adapter; approved resource and three branch-scoped Preview secrets exist but runtime activation/deployed proof are absent | IO security + managed-store tests | Store/get/delete/readiness and no-hosted-memory-fallback are implemented; remaining owner/CORS/runtime configuration, deployed proof, rotation procedure, and live provider remain absent; browser/backup storage is prohibited |
| OAuth state/replay protection | future provider authorization | PARTIALLY_IMPLEMENTED | `backend/src/providerRuntime/oauthStateStore.ts`, `backend/src/providerRuntime/managedStores.ts` | Preview-only digest/TTL/Lua Redis adapter; approved resource exists but runtime activation/deployed proof are absent | IO security + managed-store tests | Random digest-only state, owner/provider/exact-redirect binding, expiry, capacity, atomic consume and replay marker are implemented; owner/configuration proof and callback route remain absent |
| Receipt AI assistance | optional | FUTURE | no real provider | none | None | Phase 10 |
| Listing/card/binder/photo AI | optional | FUTURE | feature flag false; Phase 1C provider-neutral metadata boundary but no real model | image references only | INT boundary | Protected files, approved provider, evaluation, privacy/cost controls, and owner review remain future |
| Authenticity/condition assistance | optional | CLIENT_LOCAL_ONLY | `conditionAssessment.js`, `analysisPipeline.js`, explicit owner review/card history | normalized owner/provider observations in local appraisals | INT | Deterministic apparent-condition proposal and explicit deal-risk severity are implemented; no authenticity decision, professional grade, OCR, CV, or AI provider |
| Provider-backed notifications | optional | BLOCKED_BY_AUTHORIZATION | no delivery provider | none | None | Phase 3/12 |

## Compatibility-only routes

These are route families, not canonical product pages. Exact per-route actions are in `docs/LEGACY_ROUTE_MIGRATION.md`.

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Legacy sourcing routes | `/scout/*` | DEPRECATED_COMPATIBILITY | `src/App.jsx`, `src/pages/Scout.jsx` | legacy scout/local data | LR, RL, REG | Redirect/delegate as canonical parity permits; Phase 2 |
| Legacy collection routes | `/vault/*` | DEPRECATED_COMPATIBILITY | `src/App.jsx`, `src/pages/Vault.jsx` | legacy collection keys | LR, REG | Preserve storage/history, extract/redirect Phase 2/6 |
| Legacy sales routes | `/forge/*` | DEPRECATED_COMPATIBILITY | `src/App.jsx`, `src/pages/Forge.jsx` | legacy sales/settings | LR, REG | Redirect after Phase 7 parity |
| Exchange/market routes | `/exchange`, `/market`, `/tidetradr`, `/harbor` | DEPRECATED_COMPATIBILITY | legacy market/exchange renderers | mixed legacy data | LR/legacy tests | Private product review/archive Phase 2 |
| Legacy community/moderation | `/tidepool/*`, `/moderator`, `/moderation` | DEPRECATED_COMPATIBILITY | legacy community/moderation renderers | legacy local/Supabase | LR/legacy tests | Isolate private app; Phase 2/11 |
| Legacy administration | `/admin`, `/admin-review` | DEPRECATED_COMPATIBILITY | legacy admin renderers | legacy beta data | LR/legacy tests | Owner Center/system replacement Phase 2 |
| Legacy reports/exports | `/reports`, `/business-reports`, `/exports` | DEPRECATED_COMPATIBILITY | legacy report/export renderers | mixed local data | LR/legacy tests | Canonical Money Phase 8 |
| Legacy settings/utilities | older profile/account/help/menu/roadmap paths | DEPRECATED_COMPATIBILITY | `src/App.jsx`, settings/menu pages | profile/local data | LR, RL, REG | Explicit aliases and extraction Phase 2 |
| Legacy public invitation/waitlist | invite/waitlist/onboarding compatibility | DEPRECATED_COMPATIBILITY | auth/onboarding renderers | Supabase/legacy | auth/REG | Review private owner bootstrap in Phase 1A |

## Interpretation

The strongest complete features are the minimal shell, manual Deal Inbox/analysis foundations, eBay Browse connector and review gate, core calculations/allocation/quantity validation, purpose history, Phase 1C deterministic local intelligence services, published Account Ops metadata workflows, and focused compatibility/accessibility behavior. Phase 2A.5 adds product-workspace navigation and honest homes without claiming that every conceptual Collect/Find/Sell/Bot/Business capability is complete. Phase 2B1 adds deterministic minimized message/Order Candidate services and an owner-protected default-unavailable mailbox-provider runtime, not a connected mailbox. Phase 2D-A adds provider-neutral Bot contracts, local metadata/evidence workflows, test-only mocks, idempotency/reconciliation, secret rejection, and an honest OWNER-only UI. Phase 2D-B1 adds evidence-backed discovery truth, not a connected or controllable Bot. Phase 2D-B2 adds only an ephemeral, owner-selected Stellar JSON preview; `Previewed Task != Task`, and its parser does not make Stellar connected or supported. The largest false-positive risk is mistaking a workspace shell, local rule/evidence/alias/registry, documentation reference, file parser, or test adapter for AI, licensed market coverage, receiving email, retailer/Bot integration, checkout, billing, or durable canonical capability. This matrix therefore keeps Account Ops, Inbox/Order, and Bot Operations records `CLIENT_LOCAL_ONLY`, classifies live Hayha/Stellar work as blocked, and keeps Purchase/Inventory handoffs, live provider ingestion, provider provisioning, sold comparables, and AI appropriately blocked or future.
