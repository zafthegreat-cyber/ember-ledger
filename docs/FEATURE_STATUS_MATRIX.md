# Code 3 Feature Status Matrix

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`. Phase 1A and the validated Phase 1B checkpoint source are published on the feature branch; none of the Phase 1B statuses below represents an executed schema, migrated owner record, or active remote persistence.

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

Test abbreviations: **FS** `test:flip-scout`; **OC** `test:owner-center`; **EB** `test:flip-scout-ebay`; **BR** `test:flip-scout-browser`; **RL** `test:route-loading`; **LR** `test:legacy-routes`; **PL** `test:plain-language`; **A11Y** keyboard/viewport checks; **REG** bounded 28-scenario regression. “None focused” means broader loading/regression coverage may exist but no domain assertion was found.

## Shell, identity, and common behavior

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Brand configuration | all | PARTIALLY_IMPLEMENTED | `src/config/brand.js`, Vite brand metadata, Code 3 mark | bundled config | Code 3 branding, PL, build | Code 3 display/short/PWA/title/logo are centralized locally; business name/tagline remain separate; social/currency/time-zone and compatibility-copy sweep remain |
| Minimal app shell | all canonical | IMPLEMENTED | `src/App.jsx`, operations components/styles | route/profile/theme state | RL, PL, A11Y, REG | Large shell remains; Phase 2 extraction |
| Mobile primary navigation | all canonical | IMPLEMENTED | `src/App.jsx` | feature controls/route state | RL, A11Y, REG | Preserve contract |
| Desktop primary navigation | all canonical | IMPLEMENTED | `src/App.jsx` | feature controls/route state | RL, PL, REG | Preserve contract |
| Profile menu target | menu/profile | PARTIALLY_IMPLEMENTED | `src/App.jsx` | profile/feature controls | REG | Legacy/extra entries differ from final target; Phase 2 |
| Global Add sheet | action sheet | IMPLEMENTED | `src/App.jsx` | enabled feature controls | A11Y, REG | Restock visit/report/donation actions not all working; later domain phases |
| Theme and dark mode | all | IMPLEMENTED | semantic CSS/tokens and theme state | `et-tcg-app-theme` | viewport light/dark, REG | Preserve |
| PWA install/offline shell | all | PARTIALLY_IMPLEMENTED | `public/manifest.webmanifest`, `public/sw.js`, `src/main.jsx` | browser cache/local records | smoke, REG | No conflict-safe offline mutation/sync; Phase 12 |
| Universal loading/error boundary | app bootstrap | IMPLEMENTED | `src/main.jsx`, operations states | runtime | build, RL | Domain fallbacks need extraction with routes; Phase 2 |
| Universal Search | conceptual `/search` | PARTIALLY_IMPLEMENTED | legacy search/render logic in `src/App.jsx` | mixed local/catalog data | REG | Not grouped across all canonical records; after Phase 1B |

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
| Deal Analysis entry | `/find/deal-analysis`, `/find/analyze` | IMPLEMENTED | `screens/AppraiserScreen.jsx` | local draft/appraisals | FS, BR, RL, REG | Preserve formulas while expanding target fields |
| Guided analysis workflow | same | PARTIALLY_IMPLEMENTED | `AppraiserScreen.jsx`, `RecordExperience.jsx` | session draft + appraisals | FS, A11Y, REG | Target five-step field set and one-open disclosure not complete |
| Decision summary | same | IMPLEMENTED | `AppraiserScreen.jsx` | calculation result | FS, BR, REG | Approved minimal order |
| Landed cost / net / profit / ROI | same | IMPLEMENTED | `src/features/flipScout/calculations.js` | pure inputs | FS | Target adds payment fees/gross/margin/tolls/labor etc.; Phase 7 |
| Maximum offer | same | IMPLEMENTED | calculations utility | pure inputs | FS | Target minor-unit model later |
| Profit margin | same | MISSING | no canonical calculation found | none | None focused | Add with complete sales semantics; Phase 7/8 |
| Target expanded cost model | same | PARTIALLY_IMPLEMENTED | calculation/forms | local appraisal inputs | FS | Missing several definitive cost fields and gross-collected semantics; Phase 7 |
| Comparable Records | conceptual `/find/deals/:id/comparables` | MISSING | none | none | None | Licensed source/repository required; blocked before implementation |
| Projection comparison set preservation | Deal Analysis | MISSING | no comparable-set entity | none | None | Phase 1B data model plus licensed records |
| Projected-versus-actual result | Business/results view | CLIENT_LOCAL_ONLY | records/results screen and sale calculations | purchases/inventory/sales | FS | Associations/report coverage incomplete; Phase 8 |

## Import Review and eBay

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Import Review | `/find/ebay` / import review state | IMPLEMENTED | `screens/EbayDiscoveryScreen.jsx`, `ebayDiscovery.js` | browser discovery snapshots | EB, BR, REG | Durable import jobs later; review gate must remain |
| Review status distinctions | same | IMPLEMENTED | eBay discovery classification | local provider listings/deals | EB | Unified non-eBay imports later |
| eBay active-listing search | `/find/ebay`, `/find/ebay-search` | IMPLEMENTED | eBay screen/client + backend service | official eBay API via owner-protected server route | EB, RL, REG | Configure hosted owner authentication before Preview verification |
| eBay token cache/auth retry | server `/api/ebay/*` | IMPLEMENTED | `backend/src/services/ebayBrowse.service.ts` | server memory + environment secret | EB | Durable distributed cache not necessary until scale evidence |
| eBay filters/pagination/errors | same | IMPLEMENTED | eBay backend/client | upstream response | EB | Provider field availability remains conditional |
| eBay normalization/dedupe/change/expiry | Find/eBay | IMPLEMENTED | backend normalizer + `ebayDiscovery.js` | local snapshots | EB | Move history/dedupe to canonical repository Phase 1B/3 |
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
| Provider adapter contract | internal | PARTIALLY_IMPLEMENTED | `src/features/flipScout/connectors.js` | static definitions | FS | Missing type, updates, owner-data import, disconnect, terms fields |
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
| Restock pattern calculations | Owner Center Restocks Patterns | CLIENT_LOCAL_ONLY | `ownerCenterModel.js` | events/predictions/visits | OC | Canonical records and sample thresholds Phase 5 |
| Prediction outcome review | Owner Center Restocks | PARTIALLY_IMPLEMENTED | owner model/repository fields | local predictions | OC | Full review workflow/timing error history Phase 5 |
| Restock performance | Owner Center Performance | PARTIALLY_IMPLEMENTED | owner metrics | local events/visits and some sales links | OC | Trip profit attribution often unavailable; Phase 5/8 |

## Auctions

| Page / feature | Route | Status | Current component/module | Storage/data source | Tests | Gap, dependency, recommended phase |
|---|---|---|---|---|---|---|
| Auction Feed | `/find/auctions` | CLIENT_LOCAL_ONLY | `screens/AuctionsScreen.jsx` | `auctions` | FS, RL | Views/source feeds incomplete; Phase 4 |
| Add/edit manual auction | `/find/auctions` / Global Add | IMPLEMENTED | Auctions screen/forms | local auctions | FS | Canonical event/lot split Phase 4 |
| Auction Event detail | conceptual | PARTIALLY_IMPLEMENTED | combined auction record/editor | local auctions | FS | Registration/payment/pickup/terms model incomplete |
| Auction Lot detail | conceptual | PARTIALLY_IMPLEMENTED | combined auction record/editor | local auctions | FS | Separate lots/visible contents/reserve/history incomplete |
| Maximum Bid calculator | `/find/auctions` | IMPLEMENTED | `src/features/flipScout/calculations.js`, `src/features/flipScout/screens/AuctionsScreen.jsx` | pure inputs/local auction | FS | Complex solver and expanded toll/storage/cleaning fields Phase 4 |
| Tax-base modes | same | IMPLEMENTED | auction calculation utility | pure inputs | FS | Target adds NONE/actual tax mode naming normalization |
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
| Owner authentication | auth/session + onboarding compatibility | PARTIALLY_IMPLEMENTED | `src/services/ownerSession.js`, `backend/src/auth`, `/api/auth/session` | Supabase access token + server allowlist | Phase 1A auth/CORS, REG | Published immutable-subject boundary; hosted configuration, devices/revocation, and legacy routes remain |
| Future role policy | none | FUTURE | legacy role constants differ | profile roles | role tests | Collaborator/helper/bookkeeper/read-only disabled until needed |
| Canonical relational persistence | `/api/code3/*` target | PARTIALLY_IMPLEMENTED | `backend/src/code3`, `backend/src/routes/code3.routes.ts`, unexecuted `20260820120000_code3_canonical_owner_records.sql` | in-memory/dry-run test adapter; PostgreSQL target | Phase 1B repository/schema/migration tests | `SCHEMA_ONLY` and `NOT_ACTIVE`; filter/archive/ordering and active-identity semantics align, create/update cannot spoof archive, the server cursor is UUID-strict while the private local cursor preserves legacy IDs, and no schema executed, owner data migrated, or `REMOTE_ACTIVE` cutover |
| Protected object storage | private API target | BACKEND_REQUIRED | Phase 1B typed `FILE_ASSET` envelope/`code3_file_assets` metadata, explicit manifest preview, owner-scoped FK and related-record validation; no byte service | local URL/reference or supplied metadata manifest | Phase 1B schema/preview partial | Metadata is `SCHEMA_ONLY`; normal backup does not synthesize a manifest, and upload/protected access/scan/byte migration/byte backup remain future |
| Complete backup and restore | Owner Controls | PARTIALLY_IMPLEMENTED | `src/features/backup`, Data & Backup UI, `src/services/code3OwnerApi.js`, remote-export adapter | registered browser sources plus owner-authorized canonical export when available | Phase 1A backup/preview + Phase 1B backup extension | Integrity and no-write previews implemented; canonical export uses a consistent repository snapshot and verified hash, unavailable remote/file bytes keep coverage partial, and neither restore nor migration apply exists |
| Append-only audit log | system history | BACKEND_REQUIRED | local history plus unexecuted `code3_audit_events` schema and future migration-journal contract | local records/schema only | OC + Phase 1B schema | `SCHEMA_ONLY`; no durable audit writer or production migration journal |
| Background job scheduler | Owner Controls | BACKEND_REQUIRED | no canonical scheduler | none/local summaries | None | Phase 3 after auth/data |
| Cross-device sync/conflicts | app-wide | BACKEND_REQUIRED | Phase 1B persistence modes and offline/sync contract | browser-local | Phase 1B mode/conflict tests | `NOT_ACTIVE`; no cache sync or pending-write engine until a later phase |
| Receipt AI assistance | optional | FUTURE | no real provider | none | None | Phase 10 |
| Listing/card/binder/photo AI | optional | FUTURE | feature flag false; no real provider | none | mocked tests absent | Phase 10 |
| Authenticity/condition assistance | optional | FUTURE | legacy heuristic concepts only | none authoritative | legacy tests | Review-only Phase 10 |
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

The strongest complete features are the minimal shell, manual Deal Inbox/analysis foundations, eBay Browse connector and review gate, core calculations/allocation/quantity validation, purpose history, and focused compatibility/accessibility behavior. The largest false-positive risk in a visual audit is mistaking client-local or legacy UI for durable target capability. This matrix therefore classifies many useful screens as `CLIENT_LOCAL_ONLY`, `FRONTEND_ONLY`, or `PARTIALLY_IMPLEMENTED` rather than “implemented.”
