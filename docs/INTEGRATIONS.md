# Code 3 Integrations and Capability Matrix

Phase 1C through Phase 2D-B1 is published through `e832ab67a153c5e672f8a77dda5474aedb1395af`. Phase 2D-B2 is a local-only offline Stellar task-export preview. No mailbox, OAuth app, Bot, retailer account, proxy, credential provider, billing provider, or checkout provider is connected. The separate Phase 2B2-B.1 operational verification remains paused; a Free Upstash resource exists but the remaining owner/CORS/activation configuration is incomplete and `hostedRuntimeVerified=false`.

## Capability truth rules

- A visible placeholder is not an integration.
- `CONNECTED` requires a successful authenticated health check.
- Active asking prices are not completed sales or market value.
- Provider money without a usable provider-supplied currency remains unavailable; Code 3 does not substitute a default currency.
- Provider access never implies permission for account actions or marketplace-wide scanning.
- Unsupported automation falls back only to approved manual/share/import methods.
- Credentials, refresh tokens, and provider secrets remain server-side.
- `Generated` email alias means local metadata only; it is never equivalent to provisioned or receiving mail.
- Account Ops retailer/profile metadata is not authorization to automate signup, verification, checkout, or account actions.
- A Bot workspace shell, navigation entry, or capability label is not a connected Bot provider and cannot authorize an account or purchase action.
- A Bot installation, normalized task state, synthetic attempt, or Checkout Evidence record is local metadata/evidence only. It does not prove Code 3 controlled a Bot, reached a retailer, carted an item, completed checkout, or created a Purchase.
- A test-only mock adapter cannot establish normal-runtime provider health or activate a live capability.
- A Gmail or Outlook provider definition is capability metadata only. `CONNECTED` or `HEALTHY` requires a trusted live provider check; Phase 2B2-B still has neither.
- A normalized synthetic message or Order Candidate is not evidence that Code 3 read a mailbox, and it is never a Business Purchase.

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
| Account Ops local alias metadata | AVAILABLE | `src/features/accountOps` alias/domain/provider contracts | secure-random local alias generation, copy, relationship and status metadata | Does not provision or receive mail | Published Phase 2A |
| Business-domain catch-all | NOT_CONFIGURED | Phase 2A domain/provider metadata contract | owner may record configuration/evidence only | No health check, routing API, or verified delivery | Future provider approval |
| Provider-managed email aliases | NOT_CONFIGURED | Phase 2A provider-neutral adapter boundary | no network action | approved provider, server secret, owner authorization, health/provisioning contract | Future authorization |
| External password manager / OS secure store | NOT_CONFIGURED | Phase 2A `CredentialReference` provider types | store nonsecret reference metadata only | No vault connection or proof a referenced secret exists | Future authorization |
| Mailbox provider runtime | NOT_CONFIGURED | protected runtime, exact Preview entry/proof, and local Phase 2B2-B managed-store adapters | safe server capability/status projection only | resource provisioning/owner health proof, provider registration/scopes and revocation | Phase 2B2-C after approval |
| Gmail mailbox | NOT_CONFIGURED | Phase 2B1 unavailable capability definition; no network adapter | none | future approved restricted read-only scope, Google verification/data-use review, managed secrets/state, Preview callback proof | Phase 2B2 after approval |
| Outlook / Microsoft mailbox | NOT_CONFIGURED | Phase 2B1 unavailable capability definition; no network adapter | none | future least-scope Graph decision, registration/consent, managed secrets/state, Preview callback proof | Phase 2B2 after approval |
| Authorized Account Ops Inbox | NOT_CONFIGURED | Phase 2B1 minimized normalization/protected-message/local evidence foundation | deterministic synthetic/owner-supplied fixtures only | no authorization, fetch, body mirror, webhook, polling, cursor, provider health, or background delivery | Phase 2B2 after approval |
| Retail Order Candidate intelligence | AVAILABLE_LOCAL_ONLY | Phase 2B1 exact-money, matching, idempotency/reconciliation and owner-review services | deterministic synthetic/minimized local evidence | no live provider feed and no canonical mapping | Phase 2B1 local foundation |
| Business Purchase import from Order Candidate | NOT_CONFIGURED | future mapping contract only | none | separately approved owner-confirmed mapping/idempotency/receiving workflow | Future after provider pilot |
| Bot provider-neutral local foundation | AVAILABLE_LOCAL_ONLY | `src/features/botOps` registry/contracts, local metadata/evidence service, security/reconciliation, test-only mock adapter, static discovery evidence, and ephemeral Stellar JSON preview | owner-reviewed local metadata; synthetic test input; official-source research references; explicitly selected local JSON held in memory only | no SDK/network/bridge/webhook/export watcher, import/persistence path, credential store, live health or task command | Phase 2D-A foundation + Phase 2D-B1 discovery + Phase 2D-B2 preview |
| Hayha Bot provider | NOT_CONFIGURED | static safe registry plus official-source capability review; all live capabilities false | none | no verified public read/status API or safe machine export; public docs/terms are old; written provider confirmation required | No live pilot; future separate approval only |
| Stellar Bot provider | NOT_CONFIGURED | static safe registry plus official-source capability review; all live capabilities false | none | documented owner task-group export/import is JSON and same-version, but no stable root/fields/version marker is public; Discord is notification-only; documented WebSocket is input-to-Stellar rather than status egress | Offline zero-write task-export preview only; no live pilot or import |
| Subscription/billing provider | NOT_CONFIGURED | future entitlement hints only | none | approved billing architecture, server-verified entitlement, privacy/tax/refund specification | Future; no billing in Phase 2A.5 |
| Authorized email alerts | NOT_CONFIGURED | sourcing placeholder plus Phase 2B1 provider/message foundation | none | approved authorization/scope, verified hosted runtime, provider reader, retention and review queue | Phase 2B2/3 after approval |
| Share target | MISSING | no complete OS share-target ingestion workflow | none beyond paste/manual | PWA share manifest/ingestion/review | Phase 2 or 3 |
| AI / computer-vision provider | NOT_CONFIGURED | feature flag, legacy placeholders, provider-neutral Phase 1C evidence boundary | no external model-backed analysis; deterministic rules and existing barcode/catalog metadata only | provider selection, server secret, protected files, privacy/cost/evaluation controls | Optional later AI phase |
| Background notifications | NOT_CONFIGURED | browser/client notification records and UI | in-app/local behavior only | durable scheduler and delivery provider | Phase 1/2 |
| Cloud file storage | MISSING | local references; no canonical protected objects | local references only | protected bucket, signed access, scanning, backup | Phase 1 |
| Sales-channel publishing | MANUAL_IMPORT_ONLY | local listing/sale records | owner records external listing and sale | approved channel APIs and confirmation workflow | Phase 6/future |
| Best Buy legacy monitor | IMPLEMENTED_DIFFERENTLY | legacy backend service/routes and scripts | legacy configured API/monitor behavior | not part of canonical provider contract; security/product review required | Archive/review before reuse |
| Supabase | PARTIAL | production identity provider, legacy client data/migrations, unapplied canonical schema source | authentication and optional legacy persistence | canonical schema remains unapplied; policy/schema/cutover review required | Separate approved persistence activation |
| PostgreSQL | PARTIAL | backend pool, legacy services, hosted-gated Phase 1B canonical repository contracts | selected legacy records; canonical tests/dry-run only | canonical schema and owner records are not active | Separate approved persistence activation |
| Vercel Preview SPA | CONNECTED | `vercel.json` and repository Git integration | authenticated SPA Preview | a frontend deployment is not trusted-runtime proof | Current preview only |
| Vercel trusted provider route | PREVIEW_PARTIAL | exact `api/auth/session.ts` and `api/account-ops/provider-connections.ts` entries into canonical Express | published Preview returns Express session JSON and fail-closed provider `401`; no provider read | Free Upstash resource and three branch-scoped Preview secrets exist, but legitimate owner plus healthy managed-store proof is paused pending Supabase sign-in and remaining configuration; `hostedRuntimeVerified=false` | Phase 2B2-B / 2B2-C |

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

## Phase 2A Account Ops provider boundary

Phase 2A declares three email modes:

- `LOCAL_METADATA_ONLY`: Code 3 generates and records an address candidate locally; it makes no delivery claim;
- `CATCH_ALL`: owner/provider evidence may record that a configured domain handles arbitrary recipients, but Phase 2A does not verify routing or fetch mail;
- `PROVIDER_MANAGED`: reserved for a future server-side provider that can create, disable, check, route/forward, or list messages within approved scopes.

Capabilities are declared independently. No provider credential is accepted by the browser, no email API is called, and no alias is marked provisioned or receiving merely because its syntax is valid. Domain examples are placeholders; owner configuration supplies any real domain.

Retailer directory entries store official URLs and capability metadata only when known. Static presets do not imply an API, permission, automated provisioning, Inbox, order-history access, or account health. Custom retailers are local owner metadata.

Credentials use reference-only provider types such as external password manager, OS secure store, or unavailable. Phase 2A has no vault adapter. A generated password exists only in ephemeral UI memory for immediate copy and is never persisted, logged, backed up, automatically submitted, or treated as recoverable.

At the Phase 2A checkpoint, Inbox categories and order-candidate relationships were normalized contracts only. Phase 2B1 now implements deterministic synthetic/minimized local processing under a separate source. A live Phase 2B2 connection still requires an approved minimally scoped provider, server-side secrets, owner authorization, protected content handling, retention/deletion rules, replay/deduplication controls, and the existing review gate. Parsed evidence can never create a Purchase or Inventory record without a separately approved explicit owner import action.

Account setup is an owner-guided workflow. Code 3 may open a legitimate signup URL and prepare copyable ordinary fields, but it does not submit bulk signup forms, bypass CAPTCHA/OTP/email/phone verification, evade bot or household/account/purchase limits, rotate identities, or automate checkout/payment.

## Phase 2A.5 workspace integration boundary

The Bot workspace began as an OWNER-only presentation foundation. Phase 2D-A adds local provider-neutral contracts, safe metadata/evidence workflows and a test-only mock adapter under `src/features/botOps`; it still has no active provider adapter, token, task controller, live proxy, account automation, checkout, or purchase action. Hayha and Stellar appear as `NOT_CONFIGURED` capability truth only; Code 3 does not claim a connection.

Account Ops remains contextually associated with Business. Phase 2A.5 itself did not connect an email, mailbox, order, or password-vault provider. Published Phase 2B1 adds a secure provider-runtime contract and synthetic/minimized Inbox/Order Candidate services. Published Phase 2B2-A adds exact Preview server routing and bounded execution truth. Published Phase 2B2-B adds managed-store adapters, not a provider connection, and imports no Purchase. Its separate Phase 2B2-B.1 operational proof remains paused with only the approved Free Upstash resource and three branch-scoped Preview secrets in place. Workspace/feature entitlement hints are not subscription state, and no billing or payment provider is configured.

Moving a route into a product workspace does not expand provider permission. Existing eBay OAuth and server-side secret boundaries remain unchanged, active eBay listings remain active evidence rather than completed sales, and no provider may create a Purchase without its existing owner review/confirmation boundary.

## Phase 2D-A Bot provider boundary

The provider-neutral Bot adapter declares identity, version, runtime-health support, retailer coverage, task discovery/status, optional start/stop/restart support, account/profile mapping, proxy and product-target visibility, Checkout Evidence, normalized errors, and optional history independently. Unsupported capabilities remain false or unavailable.

Phase 2D-A recognizes these future integration modes as metadata only:

- documented official API;
- owner-approved local companion/bridge;
- provider-exported task data;
- signed webhook/event ingestion; and
- separately approved owner-local automation.

No mode is active. There is no provider SDK, network client, local process, webhook route, filesystem/export watcher, token, cookie, session, username/password, or provider authentication. The `MOCK` adapter is dependency-injected only by automated tests and is not a real registry connection.

Bot event normalization uses provider + installation + event identity and deterministic source hashes. Retries, reordered events, interrupted local persistence, event-ID reuse across separate installations, and contradictory success/failure evidence preserve history without creating duplicate complete records. Checkout Evidence remains owner-reviewable evidence and cannot call a Purchase, receiving, or Inventory repository.

Bot/provider, retailer, payment, and proxy credentials; credential-bearing proxy/authentication URLs; raw provider request/response bodies; and raw logs are prohibited from local records, fixtures, browser state, backups, and normal logs. Phase 2D-A has no managed Bot-secret storage and does not use the paused mailbox-provider Upstash resource. See [BOT_INTEGRATION_CONTRACT.md](./BOT_INTEGRATION_CONTRACT.md).

## Phase 2D-B1 integration discovery

The evidence layer distinguishes documentation from activation. `VERIFIED_SUPPORTED` means an official source describes a mechanism; it does not mean Code 3 implements or may safely use it. `DOCUMENTED_BUT_LIMITED`, `UNKNOWN`, `UNSUPPORTED`, and `DO_NOT_USE` preserve uncertainty and prohibitions without guessing from internal network behavior.

The review found no verified read-only task/status/history API for Hayha or Stellar. Hayha's public material documents human GUI/CLI use and limited Discord notifications, while its published terms prohibit automated access, data extraction, and reverse engineering. Stellar documents three materially different mechanisms: Discord notifications; owner task-group JSON export/import with a same-version requirement but no stable schema/root/version marker; and an external product-monitor WebSocket that feeds pings into Stellar. None is a live Code 3 read/status adapter. Profile, account/session, proxy, and full-config exports may contain credentials, payment data, or other sensitive material and are not eligible inputs.

The current recommendation is `NO_LIVE_BOT_PILOT_YET`. Phase 2D-B2 implements the least-risk precursor only: one explicitly owner-selected JSON file is parsed locally after type/size/root bounds, recursively scanned before normalization, reduced to allowlisted safe fields, reviewed in memory, and discarded. It rejects profiles, accounts, sessions, proxies, config, license values, credential-bearing URLs, payment data and suspicious secret fields; retains no raw file/hash; performs no network, import, write back, Task/event/evidence creation, or provider activation. See [BOT_PROVIDER_CAPABILITY_REVIEW.md](./BOT_PROVIDER_CAPABILITY_REVIEW.md).

## Phase 2D-B2 offline file-preview boundary

The preview accepts JSON only, up to 1 MiB and 500 candidate records. The browser reads only the file explicitly selected through the OWNER-gated Bot Operations UI. There is no directory scan, automatic discovery, Stellar-folder watcher, process access, webhook, local bridge, upload endpoint, or remote API call.

Format recognition is intentionally conservative. `SUPPORTED` is reserved and not emitted until a stable provider schema/version can be verified. A structurally safe synthetic-compatible file may be `PARTIALLY_RECOGNIZED`; unrecognized, unsafe, and invalid files become `UNKNOWN_FORMAT`, `UNSAFE`, or `REJECTED`. A retailer label in the file does not change Stellar's supported-retailer or live-capability registry.

The preview object and basename remain component-memory data. Raw bytes/JSON, full paths, hashes, warnings, normalized rows and summary counts do not enter localStorage, IndexedDB, Bot Operations persistence, Backup Format v1, Restore Preview, Migration Preview, Upstash, Supabase, telemetry, or logs. Refresh requires reselection. No Import/Save/Create/Apply/Sync/Connect action exists. `Stellar Export Preview != Bot Task Import`; `Previewed Task != Task`.

## Phase 2B1 mailbox and order-provider boundary

`backend/src/providerRuntime` defines Gmail and Outlook/Microsoft as unavailable providers whose current capabilities are all false. The owner-protected `/api/account-ops/provider-connections` route can return safe status/capability truth and exercise a disconnect/revocation contract with injected test stores. There is no connect route, OAuth callback, provider SDK/network adapter, live scope request, cursor reader, webhook, polling job, or active provider connection.

Production/default provider connection, secret, and OAuth-state adapters fail closed. Automated-test memory adapters are dependency-injected and reject non-test runtimes. Phase 2B2-A maps the exact owner session and provider-status URLs to canonical Express and distinguishes trusted Preview execution from provider readiness. Published Phase 2B2-B implements an exact-Preview/project/branch-only Upstash Redis adapter set with a derived namespace: bounded owner-scoped connection metadata; AES-256-GCM-encrypted secret envelopes under a separate key family; and random SHA-256-digest OAuth state with exact owner/provider/redirect binding, TTL, capacity bounds, and atomic Lua consume/replay protection. Hosted verification additionally performs bounded write/read/delete readiness instead of trusting `PING` or test memory. Browser storage and ordinary Code 3 backup are never substitutes.

The approved Free Upstash resource now exists, and the URL/token/key variables are Secret, Preview-only, and scoped to `ui-104-final-product-ui-2`. No value is documented here. Supabase owner/auth values and the remaining exact Preview CORS/activation/runtime values are not configured, no follow-up Preview has been deployed, and no connection record, provider secret, or OAuth state has been written. Phase 2B2-B.1 is paused pending the owner's exact `Supabase signed in.` instruction; the adapter remains unavailable and `hostedRuntimeVerified=false`. Production and Development remain untouched. Code 3 makes no claim about platform encryption at rest. Live authorization still requires an explicit later provider decision after resource/owner readiness proof.

Future Gmail evaluation starts no broader than the provider's documented read-only permission needed for the reviewed use case; Google's `gmail.readonly` is a restricted scope and brings external verification/data-use obligations. Future Microsoft evaluation must compare metadata-only delegated permissions with `Mail.Read`; `offline_access` supports continued authorization but is not a mailbox permission by itself. Phase 2B1, Phase 2B2-A, and Phase 2B2-B request none of these scopes. See [INBOX_ORDER_PROVIDER_CONTRACT.md](./INBOX_ORDER_PROVIDER_CONTRACT.md) and [PREVIEW_TRUSTED_RUNTIME_CONTRACT.md](./PREVIEW_TRUSTED_RUNTIME_CONTRACT.md).

`src/features/inboxOrder` processes only deterministic synthetic or explicitly supplied minimized evidence. It distinguishes protected/unrelated messages, exact alias matches, retailer proposals, safe provider identity, confidence and provenance. It reconciles scoped provider-message retries and compatible multi-message order history into a reviewable Order Candidate using exact integer minor units. It does not fetch email, retain raw/protected bodies, fabricate provider health, or write a Business Purchase.

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
| Email alias provider | locally generated metadata, or documented provider API/catch-all evidence with explicit capability state | no claim that a generated address is provisioned, receiving, or verified |
| Retailer account workflow | owner-triggered copy/open/checklist using legitimate public pages and human verification | no bulk signup, CAPTCHA/OTP bypass, identity rotation, limit evasion, checkout, or account action automation |
| Mailbox/order provider | future minimized owner-authorized metadata ingestion with dedupe and review | no unnecessary body retention and no automatic Purchase creation |
| Bot provider | future documented official API, owner-approved local companion, provider export, signed event ingestion, or separately approved local automation | no credential storage in the client, reverse engineering, authentication bypass, account/limit evasion, unapproved task control, checkout, or automatic Purchase/Inventory creation |

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
| Provider-managed aliases/catch-all verification | approved email provider, server-secret storage, explicit domain ownership and capability health |
| Credential vault reference validation | approved password-manager or OS secure-store integration and least-privilege access; plaintext secrets remain outside Code 3 |
| Retail order import | approved owner-account/mail scope, idempotency/replay controls, retention, and owner review before Purchase |
| Cloud files | provisioned protected storage, access policy, lifecycle and backup |
| AI assistance | approved provider, privacy terms, data retention choice, budget and model/version logging |
| Push/background alerts | delivery provider, opt-in, service worker/background architecture, failure truthfulness |
| Sales account sync | provider approval, owner-account scopes, idempotent reconciliation |
| Live Hayha or Stellar adapter | separately selected/approved integration mode, provider terms and anti-abuse review, server-only credentials/revocation if required, owner-controlled test installation, health/capability proof and no-checkout boundary review |
| Bot Checkout Evidence to Purchase | separately approved order reconciliation, stable import identity, explicit OWNER confirmation, transactional duplicate prevention, receiving integration and rollback tests |
