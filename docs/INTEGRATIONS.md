# Code 3 Integrations and Capability Matrix

Phase 1C audited from published baseline `cdd57bbabb2243ff510eca7aec0487f23342834d`. Phase 1C provider-evidence adapters are local working-copy code pending checkpoint publication.

## Capability truth rules

- A visible placeholder is not an integration.
- `CONNECTED` requires a successful authenticated health check.
- Active asking prices are not completed sales or market value.
- Provider money without a usable provider-supplied currency remains unavailable; Code 3 does not substitute a default currency.
- Provider access never implies permission for account actions or marketplace-wide scanning.
- Unsupported automation falls back only to approved manual/share/import methods.
- Credentials, refresh tokens, and provider secrets remain server-side.

Target capability statuses are `AVAILABLE`, `CONNECTED`, `MANUAL_IMPORT_ONLY`, `SHARE_IMPORT`, `EMAIL_IMPORT`, `OWNER_DATA_ONLY`, `AUTHORIZATION_REQUIRED`, `NOT_CONFIGURED`, `UNSUPPORTED`, and `TEMPORARILY_UNAVAILABLE`.

The current UI also uses closely related display statuses such as Available, Manual Import Only, Not Configured, Authorization Required, and Unsupported. These should be normalized at the repository/API boundary during the backend phase without rewriting stored historical values silently.

## Current matrix

| Provider/capability | Current status | Current implementation | Allowed current input/action | Important gap | Next phase |
|---|---|---|---|---|---|
| eBay Browse search | IMPLEMENTED | `backend/src/services/ebayBrowse.service.ts`, `backend/src/routes/ebay.routes.ts`, `src/features/flipScout/ebayDiscovery.js`, Phase 1C evidence adapter | Owner-authorized official active-listing search, review import, and separately attributable active evidence | Hosted auth configuration and durable scheduler/history remain | Phase 3 scheduling |
| eBay connection health | IMPLEMENTED | protected server health endpoint and Sources/eBay screens | Owner-authorized server configuration check | Hosted configuration still needs environment verification | Phase 1A deployment verification |
| eBay sold comparables | MISSING | none | None | Requires approved/licensed completed-sale source | External authorization |
| Mercari | MANUAL_IMPORT_ONLY | placeholder in `src/features/flipScout/connectors.js` | manual URL/text/image entry | No approved API/partnership | Future authorization |
| Poshmark | MANUAL_IMPORT_ONLY | placeholder | manual URL/text/image entry | No approved API/partnership | Future authorization |
| Whatnot owner data | AUTHORIZATION_REQUIRED | placeholder | manual entry only today | Approved seller access/scopes and data contract | Future authorization |
| Facebook Marketplace | MANUAL_IMPORT_ONLY | placeholder | manual URL/share/screenshot/entry | No approved general search API | Future authorization |
| OfferUp | MANUAL_IMPORT_ONLY | placeholder | manual URL/share/screenshot/entry | No approved general search API | Future authorization |
| Auction sources | MANUAL_IMPORT_ONLY | manual auction records and generic source placeholder | URL/manual entry, JSON/CSV feature import | Source registry and authorized feed/email adapters | Phase 3 |
| Manual URL | AVAILABLE | Deal form and provider placeholder | saves URL plus owner-entered fields | Structured metadata remains manual | Implemented baseline |
| Screenshot/manual entry | AVAILABLE | upload/reference fields, manual forms, `src/features/intelligence/providerAdapters/scannerEvidence.js` | evidence/reference and provenance-preserved owner/catalog/barcode fields | No OCR, computer vision, file upload, or protected object storage | Future protected files; optional AI only after approval |
| CSV/JSON feature import | PARTIAL | `src/features/flipScout/csv.js`, Sources/Data screen, repository import/export | selected record imports/exports | Unified preview/mapping/error job model missing | Phase 1/7 |
| Authorized email alerts | NOT_CONFIGURED | placeholder only | none | authorization, mailbox scope, parser, review queue | Phase 2/3 after approval |
| Share target | MISSING | no complete OS share-target ingestion workflow | none beyond paste/manual | PWA share manifest/ingestion/review | Phase 2 or 3 |
| AI / computer-vision provider | NOT_CONFIGURED | feature flag, legacy placeholders, provider-neutral Phase 1C evidence boundary | no external model-backed analysis; deterministic rules and existing barcode/catalog metadata only | provider selection, server secret, protected files, privacy/cost/evaluation controls | Optional later AI phase |
| Background notifications | NOT_CONFIGURED | browser/client notification records and UI | in-app/local behavior only | durable scheduler and delivery provider | Phase 1/2 |
| Cloud file storage | MISSING | local references; no canonical protected objects | local references only | protected bucket, signed access, scanning, backup | Phase 1 |
| Sales-channel publishing | MANUAL_IMPORT_ONLY | local listing/sale records | owner records external listing and sale | approved channel APIs and confirmation workflow | Phase 6/future |
| Best Buy legacy monitor | IMPLEMENTED_DIFFERENTLY | legacy backend service/routes and scripts | legacy configured API/monitor behavior | not part of canonical provider contract; security/product review required | Archive/review before reuse |
| Supabase | PARTIAL | production identity provider, legacy client data/migrations, unapplied canonical schema source | authentication and optional legacy persistence | canonical schema remains unapplied; policy/schema/cutover review required | Separate approved persistence activation |
| PostgreSQL | PARTIAL | backend pool, legacy services, hosted-gated Phase 1B canonical repository contracts | selected legacy records; canonical tests/dry-run only | canonical schema and owner records are not active | Separate approved persistence activation |
| Vercel Preview | CONNECTED | `vercel.json` and repository Git integration | SPA/functions preview | production security gates remain open | Current preview only |

## eBay contract

Current official capabilities:

- OAuth client-credentials application token retrieved server-side;
- process-safe in-instance token caching with expiration margin;
- authentication retry after upstream rejection;
- keyword search and supported category, GTIN, price, condition, buying-option, delivery, and location filters;
- newest-listing sort, pagination, request timeout, rate-limit/authentication/error mapping;
- normalization of provider-supplied identity, price, shipping, seller, location, images, creation/end dates;
- deduplication, change detection, expiry handling, last-checked and data-source explanation;
- review before Deal Inbox import.

Environment variable names, never values:

```text
EBAY_CLIENT_ID
EBAY_CLIENT_SECRET
EBAY_ENVIRONMENT
EBAY_MARKETPLACE_ID
EBAY_REQUEST_TIMEOUT_MS
VITE_API_BASE_URL
```

`EBAY_CLIENT_SECRET` MUST never be prefixed with `VITE_`, stored in browser storage, returned by health endpoints, or written to logs. The browser calls the application's server route, never the OAuth token endpoint.

Current limitations:

- Browse results are active listings only;
- some fields are absent when eBay does not supply them;
- the application does not have seller-account actions, offers, buying, bidding, messaging, sold-comparable data, schedules, alerts, or durable search history;
- deduplication/discovery history is currently client-local;
- protected eBay API endpoints enforce server-verified OWNER access in source; hosted environment configuration still requires verification.

## Phase 1C provider-evidence boundary

`src/features/intelligence/providerAdapters/ebayEvidence.js` consumes only fields already returned by the official server connector. It retains official external identity, provider observations, image references, and `ACTIVE_LISTING` valuation evidence as separate attributable structures. Exact integer-minor-unit price/current-bid and reported-shipping objects are emitted only when the supplied amount and currency are usable. A missing or invalid currency produces an explicit warning and no money object; the adapter never invents `USD` or another default. It never emits a `SOLD_COMPARABLE` or converts an ask to market value. Missing listing identity, observation time, or usable price coverage also remains absent with explicit warnings.

If a future approved completed-sale provider is introduced, its comparable records must carry a validated `NM`, `LP`, `MP`, `HP`, or `DMG` condition or be explicitly excluded from a condition-specific center. Phase 1C valuation methodology `code3.valuation.v2` uses matching-condition verified sales directly, adjusts only an explicit `NM` baseline when no match exists, and excludes unknown or incompatible condition bases rather than double-adjusting them.

`src/features/intelligence/providerAdapters/scannerEvidence.js` is a provider-neutral input boundary, not an AI integration. It keeps barcode reads (`MACHINE_OBSERVED`), catalog/provider fields (`PROVIDER_SUPPLIED`), owner entries (`OWNER_ENTERED`), and deterministic inferences (`INFERRED`) distinct. Image URLs/references are retained with `imageAnalysisPerformed: false`. Current capabilities explicitly report OCR, computer vision, condition assessment, and grade prediction as false.

Neither adapter makes a new network request, handles a provider secret, uploads a file, starts a background job, or writes remote data. Analysis payloads cannot provide authoritative owner/role/session/token/security fields.

## Target provider contract

Each provider adapter should expose:

```text
providerId
displayName
providerType
capabilities
configurationStatus
authorizationStatus
termsReviewedAt
searchListings()
getListing()
getListingUpdates()
normalizeListing()
importUserData()
validateConfiguration()
healthCheck()
disconnect()
```

The existing `src/features/flipScout/connectors.js` contract has provider identity, display name, capability status, search, get, normalize, configuration validation, and health check. Provider type, update retrieval, owner-data import, disconnect, structured terms review, and normalized authorization state remain gaps.

## Approved ingestion by provider class

| Provider class | Approved methods | Prohibited assumptions |
|---|---|---|
| Official marketplace API | documented API within granted scopes, rate limits, and terms | no account action beyond scope; no sold-data claim without licensed endpoint |
| Marketplace without approved search API | manual URL, OS share, screenshot, manual entry, authorized email, official export | no scraping, login automation, private APIs, proxy/CAPTCHA evasion |
| Auction source | official API/feed/RSS, authorized email, CSV/export, share/manual entry | no universal tax rule; no automatic bid |
| Seller-owner integration | approved owner inventory/order/event scopes | no inference of permission to scan all sellers |
| AI provider | future server-side request over owner-selected protected evidence, human review, model/version provenance | no current provider; no automatic final record or guaranteed identity/value/condition/authenticity |
| Notification provider | explicit owner opt-in and verified delivery | no claim of background alert until delivery succeeds |

## Search and job attribution target

Every automated authorized run records provider, rule, configuration version, start/finish, page/cursor, counts (found/new/updated/duplicate/reviewed/imported), rate-limit state, runtime, error mapping, and job ID. Imported listings link back to the exact run and rule. Later purchases and realized outcomes preserve that attribution so rule/source performance can be calculated from real records.

Jobs MUST be idempotent, bounded, observable, quiet-hour aware, and safe under retry. Failure never fabricates an empty successful result.

## Sales-channel policy

The current application records sales manually. Future eBay, Whatnot, booth, local, website, or other channel adapters may import owner-authorized listings/orders or prepare confirmed drafts. No channel adapter publishes, edits, refunds, messages, or fulfills without an explicit approved specification and owner confirmation boundary.

## External approvals and blockers

| Capability | Required external condition |
|---|---|
| Scheduled eBay Browse searches | production eBay application access, quota review, server authorization, job host |
| Completed-sale comparables | licensed source and documented usage/storage rights |
| Marketplace automation beyond eBay | official API/partnership and approved scopes |
| Email import | owner mailbox authorization with minimized scopes and retention policy |
| Cloud files | provisioned protected storage, access policy, lifecycle and backup |
| AI assistance | approved provider, privacy terms, data retention choice, budget and model/version logging |
| Push/background alerts | delivery provider, opt-in, service worker/background architecture, failure truthfulness |
| Sales account sync | provider approval, owner-account scopes, idempotent reconciliation |
