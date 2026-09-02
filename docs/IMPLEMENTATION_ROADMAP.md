# Code 3 Implementation Roadmap

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`
Planning rule: no phase is authorized merely by appearing here.

## Repository-informed sequencing decision

The audit changes the conceptual “backend persistence first” phase into gated parts. **Phase 1A — Owner Security Boundary and Verified Recovery Contract** is published on the feature branch. It comes before a database migration or scheduled scanning because current canonical records are browser-local and recovery must be understood first. It protects the eBay route family and provides a trustworthy browser export/no-write preview, but it does not yet protect legacy APIs or include server/file data.

**Phase 1B — Canonical Backend Persistence and Reversible Migration Planning** is published on the feature branch as schema, repository/API, local/remote abstraction, backup-adapter, and no-write migration-preview contracts. `LOCAL_ONLY` remains authoritative. Schema and file metadata are `SCHEMA_ONLY`, the preview/remote comparison path is `DRY_RUN_ONLY`, and `REMOTE_ACTIVE` is `NOT_ACTIVE`. No migration was run and no owner record moved.

**Phase 1C — Intelligence and Card Analysis Foundation** is published through commit `af21199f610cc91e31d9dee59af6f0a2f748ab79`. It adds deterministic decision-support services and append-only local card-analysis history without changing the Phase 1B persistence state. Auction results can be saved without a generic linked revision series, and restock intelligence recomputes from observations. It does not configure an AI/computer-vision provider, apply a schema, activate remote persistence, move owner data, sync, or automate marketplace actions.

**Phase 2A — Account Ops Foundation** is published at `c76e3e4bc668c08d9a0908c9bb2cd96444610297`. It adds legitimate owner-managed profiles, alias metadata, retailer-account metadata, assisted human setup, account health, and tasks through a gateway fixed to `LOCAL_ONLY`. It adds no canonical domain, provider-provisioned email, mailbox/order integration, retailer signup submission, verification bypass, migration, sync, or remote cutover.

**Phase 2A.5 — Workspace Architecture / Mini-App Shell** is published at `4c6c7891a123777acec8f326793f30aee61f3de6`. It organizes existing features into Collect, Find, Sell, Bot, and Business through a central route/workspace registry, compatibility-first homes, workspace-local navigation, and a bounded recent-workspace preference. Owner Center remains separate; Account Ops is Business-associated but `VERIFIED_OWNER`; Bot is OWNER-only and has no provider.

**Phase 2B1 — Secure Provider Runtime + Inbox / Order Intelligence Foundation**, **Phase 2B2-A — Preview Trusted Express/API Runtime**, and **Phase 2B2-B — Preview Owner Auth + Managed Provider State** are published through `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`. The separate Phase 2B2-B.1 operational verification is paused. A Free Upstash resource and three branch-scoped Preview secrets exist, but Supabase owner/auth values and the remaining Preview CORS/activation/runtime values are not configured, no follow-up Preview was deployed, and `hostedRuntimeVerified=false`. Gmail, Outlook, IMAP, live Inbox ingestion, provider token use, Purchase import, migration, sync, and remote cutover remain inactive.

**Phase 2D-A — Bot Integration Foundation** is published at `cdde7df506c94bc55b2ec7995596843ae1c2261a`, **Phase 2D-B1 — Provider Integration Discovery and Pilot Design** at `e832ab67a153c5e672f8a77dda5474aedb1395af`, and **Phase 2D-B2 — Stellar Task Export Preview** at `0b45c3584f7f15b4d951c5e4cddd1e42dcbeb5a3`. **Phase 2C-A — Purchase → Receiving → Inventory Foundation** is published at `3b10644cf1be9498c08b876b5a3bbef98a24ee1c`, **Phase 2C-B — Owner-Confirmed Inventory Creation** at `bcff80042a15a29492ed32ba945291b50d35b5bb`, and **Phase 2C-C — Inventory Correction and Disposition** at `ef30033a3b30989737878252fb31354aaecf68a3`; **Phase 2C-D — Historical COGS, Sale & Transfer Reconciliation** is the current parallel local-only workstream. Hayha and Stellar remain `NOT_CONFIGURED`; no live provider, automatic evidence/Receiving-to-Inventory path, destructive historical edit, credentials, task control, proxy connection, checkout, billing, remote persistence, or deployment is active.

The published Phase 1A runtime applies Code 3 through the centralized brand configuration and coordinated PWA/browser/offline metadata. Storage, database, route, module, environment, cache, history, compatibility, and imported-source identifiers remain unchanged. The legal/public business name and tagline remain separately configurable and unresolved.

No time estimates are provided. Complexity is relative: Small, Medium, Large, or Extra Large.

## Phase 0 — Definitive audit and documentation

- **Objective:** establish one product contract and evidence-based current-state inventory.
- **Current code affected:** none; documentation only.
- **Likely files/modules:** the nine definitive documents in `docs/`.
- **Data changes:** none.
- **Migration risks:** older documents may conflict; this specification explicitly supersedes visible branding/navigation/product conflicts while retaining technical migration references.
- **Dependencies:** verified baseline and repository audit.
- **External authorization:** none.
- **Test plan:** diff, Markdown/path/link/source-reference and terminology checks.
- **Acceptance criteria:** all required documents exist, cross-link, distinguish implemented from placeholder, and name one next phase.
- **Rollback:** remove documentation changes; no runtime impact.
- **Complexity:** Medium.

## Phase 1A — Owner security boundary and verified recovery contract

**Status:** Published on the feature branch. Hosted configuration and Production acceptance remain separate gates.

- **Objective:** protect sensitive API operations with server-authenticated OWNER authorization and produce a complete, validated, restorable preview of current owner data before migration.
- **Current code affected:** authentication/profile code in `src/App.jsx`; `src/features/ownerCenter/ownerAuthorization.js`; Express application/middleware; all sensitive API routes; feature/local repositories and legacy persistence exports.
- **Implemented files/modules:** centralized brand/PWA metadata; `backend/src/auth`, `backend/src/security`, `backend/src/routes/auth.routes.ts`, protected eBay router/server mounts; `src/services/ownerSession.js`; `src/features/backup`; Owner Center auth/Data & Backup integration; environment examples and focused tests.
- **Data changes:** versioned backup manifest/schema and audit-event format; no irreversible migration.
- **Migration risks:** locking out the owner, local-development bypass leaking to preview/production, incomplete export coverage, exposing private data in backup files, incompatible legacy IDs.
- **Dependencies:** explicit auth provider/session choice; inventory of all local keys and Supabase tables; recovery procedure.
- **External authorization:** authentication service/configuration if not self-hosted; no marketplace expansion.
- **Test plan:** centralized-brand/PWA/title tests; unauthenticated/wrong-role/expired/owner API tests; CORS/CSRF/origin tests; eBay regression; export counts/hashes/parse; restore dry run; legacy-key coverage; credential and log-redaction scans.
- **Acceptance criteria:** primary runtime identity derives from centralized Code 3 configuration; business name/tagline remain independent; eBay routes default deny; owner access succeeds; UI hiding is not the security boundary; development/test adapters cannot operate in hosted runtimes; export coverage is explicit rather than always called complete; SHA-256 self-verification passes; Restore Preview reports counts/errors/duplicates without writing; rollback/recovery is documented; the full regression passes.
- **Rollback:** disable new middleware only in an isolated preview, restore previous server route deployment, and use the verified export; no record cutover has occurred.
- **Complexity:** Large.

## Phase 1B — Canonical backend persistence and reversible migration planning

**Checkpoint status:** Implemented, validated, and published on the feature branch. The schema is `SCHEMA_ONLY`; repository/API contracts remain hosted-gated; `REMOTE_ACTIVE` is `NOT_ACTIVE`; Migration Readiness is `DRY_RUN_ONLY` and no-write.

- **Objective:** select the owner-authorized Express/PostgreSQL target, define relational canonical repositories and file-reference metadata, and rehearse a reversible migration from browser/legacy data without writes.
- **Current code affected:** all domain repositories, phase-2 Supabase compatibility, backend database layer, receipt/image references, Owner Center data/backup.
- **Implemented/likely files/modules:** backend canonical domain/repository/validation/API modules; versioned schema migration source; client persistence-mode/data-source modules; migration adapters/plan/preview; `src/features/backup/MigrationReadinessPanel.jsx`; owner-authorized canonical remote-export read integration; the four Phase 1B contract documents. Exact local paths are recorded in [CANONICAL_PERSISTENCE_DECISION.md](./CANONICAL_PERSISTENCE_DECISION.md) after implementation review.
- **Data changes:** schema source only for canonical tables/entities from `DATA_MODEL.md`, stable IDs, integer minor currency units, record versions, provenance, future journal/audit fields, and file metadata. Existing local data is unchanged.
- **Migration risks:** float-to-minor-unit differences, ambiguous legacy-to-generic rate semantics, duplicate/overlapping or identity-less legacy records, orphan links, ambiguous owned-item purpose, local records on more than one device, file loss.
- **Dependencies:** Phase 1A authorization and verified export; database/object-storage choice; schema review.
- **External authorization:** database provisioning and later schema execution; object-storage provisioning is deferred because Phase 1B does not upload bytes.
- **Test plan:** schema inspection without applying owner migrations; owner-scoped repository/API behavior; strict validation, active/archive uniqueness parity across every domain, status/archive parity, strict remote timestamp/UUID keyset pagination, and legacy-compatible private local cursor ordering; optimistic conflicts; complete 80-path migration-registry coverage; deterministic mapping/plan/hash; plan-wide identity, FileAsset path, and forward-reference checks; zero-write preview; remote-backup unavailable/unauthorized/hash-mismatch/consistent-snapshot coverage; existing backup/restore; full regression.
- **Acceptance criteria:** no production/owner migration; server-derived owner scope; no client owner override; preview classifies insert/update/skip/decision and reconciles owner-wide IDs, plan-local/remote references, file metadata, and money without writes; inserts carry their exact stable UUID in `input.id`, invalid plan targets invalidate dependents, and unresolved decisions/intra-plan ID/provider/certification/FileAsset-path collisions block; identity-less, archived, and unmapped-rate candidates require owner review; no delete or archive action is proposed, canonical create/update cannot spoof archive, and archived records are immutable without a future restore contract; old keys remain readable; `REMOTE_ACTIVE` remains disabled; file references are reported without claiming byte coverage.
- **Rollback:** preview requires no data rollback because it writes nothing; retain local repositories/export/IDs/keys and remove unactivated schema/code as one bounded change. Future apply requirements are in [MIGRATION_ROLLBACK_CONTRACT.md](./MIGRATION_ROLLBACK_CONTRACT.md).
- **Complexity:** Extra Large.

## Phase 1C — Intelligence and card analysis foundation

**Status:** Published through `af21199f610cc91e31d9dee59af6f0a2f748ab79`. Its publication gate passed the bounded regression with `LOCAL_ONLY` authoritative, the Phase 1B schema unapplied, and `REMOTE_ACTIVE` disabled.

- **Objective:** provide a deterministic, explainable, owner-reviewable analysis layer for cards, deals, lots, auctions, and restock observations without autonomous action or fabricated provider/model evidence.
- **Current code affected:** Deal Analysis/appraisals, existing eBay normalized results, manual auction/lot calculations, Owner Center restock observations, and future scanner/image input boundaries.
- **Implemented files/modules:** `src/features/intelligence/constants.js`, `contracts.js`, `confidence.js`, `money.js`, `conditionAssessment.js`, `valuation.js`, `dealIntelligence.js`, `lotIntelligence.js`, `auctionIntelligence.js`, `restockIntelligence.js`, `analysisPipeline.js`, `analysisHistory.js`, provider evidence adapters, focused tests/fixtures, and [INTELLIGENCE_CONTRACT.md](./INTELLIGENCE_CONTRACT.md).
- **Data changes:** tagged `code3-intelligence-analysis-v1` card revisions append to the existing local `appraisals` collection. Auction saves retain a current result without joining that revision series, and restock intelligence derives results from existing observations. No repository schema version, existing record, canonical table, file byte, or hosted owner record is changed.
- **Migration risks:** local revisions need a future canonical mapping; owner-corrected values must remain separate from system proposals; image references are not protected bytes; existing float-based records must not be silently mixed into new minor-unit calculations.
- **Dependencies:** Phase 1A owner boundary and Phase 1B `LOCAL_ONLY` persistence gateway; existing eBay normalization; real owner-entered/provider evidence.
- **External authorization:** none for deterministic local rules or current official eBay active-listing evidence. Completed-sale evidence requires an approved/licensed source; future AI/CV requires a separately approved provider/privacy/file specification.
- **Test plan:** condition spectrum and structural damage; poor/conflicting evidence; shared confidence/source independence; exact money/currency/fees/ROI; valuation v2 matched-condition and explicit-`NM` basis selection; unknown/incompatible comparable exclusion; sold-vs-active evidence; every deal recommendation and explicit risk severity; auction premium/tax/shipping/pickup/downside; lot unknown/liquidity burdens; sparse/stale/conflicting restock observations with latest-positive freshness; deterministic card hashes/revisions/comparisons; owner correction/version conflict; recursive authority-field rejection; eBay/scanner capability truth including missing-currency behavior; mobile/accessibility; existing Phase 1A/1B and 28-scenario regression gates.
- **Acceptance criteria:** equivalent normalized inputs produce the same substantive hash/result; condition remains an apparent proposal, not a grade; owner confirmation is never silently replaced; only verified completed sales support completed-sale valuation; matching-condition sales are never double-adjusted; only explicit `NM` baselines may be adjusted when no match exists; unknown/incompatible bases are excluded; active eBay asks and official provider evidence remain separate, and provider currency is never fabricated; recommendation rationale, risk severity, and assumptions are visible; restock confidence cannot bypass source independence; no purchase/offer/bid action exists; card history is append-only/local without claiming generic auction/restock revisions; no remote adapter, migration, sync, file upload, or model claim is introduced.
- **Rollback:** revert the Phase 1C checkpoint and remove only explicitly created tagged local test data; no database or remote-data rollback is needed because Phase 1C performs no cutover or migration. Existing legacy appraisals remain untouched.
- **Complexity:** Large.

## Phase 2A — Account Ops foundation

**Status:** Published at `c76e3e4bc668c08d9a0908c9bb2cd96444610297`. This bounded product extension does not authorize the remaining structural extraction below.

- **Objective:** provide a mobile-first, legitimate owner workspace for reusable operational profiles, generated alias metadata, retailer-account records, human-assisted setup, verification state, explainable health, and account tasks.
- **Current code affected:** custom route registry/shell navigation; new `src/features/accountOps` domain, local repository/service, UI, and fixtures; Backup v1 registry/validation/Restore Preview; migration-source registry; focused route and Account Ops tests.
- **Implemented files/modules:** `src/features/accountOps`, `/account-ops/*` route integration, Account Ops backup/migration adapters, [ACCOUNT_OPS_CONTRACT.md](./ACCOUNT_OPS_CONTRACT.md), and focused domain/fixture/browser coverage.
- **Data changes:** one `code3.account-ops.v1` browser source with `profileGroups`, `profiles`, `emailDomains`, `emailAliases`, `retailers`, `storeAccounts`, `tasks`, and `activity`. `LOCAL_ONLY` is hard-wired. Backup includes allowed metadata; every migration path is `REQUIRES_MAPPING`.
- **Migration risks:** browser-local names/phones/addresses/aliases/usernames can be lost or exposed; downloaded JSON is unencrypted; alias status can be mistaken for real mail delivery; retailer/profile/account identities require a future canonical mapping; no secure-vault provider is active.
- **Dependencies:** published Phase 1A owner session, Phase 1B local persistence and verified recovery, existing Code 3 route/design patterns.
- **External authorization:** none for local metadata. Provider-managed aliases, catch-all verification, credential vaults, mailbox access, and order APIs each require a separately approved provider/security contract.
- **Test plan:** profile/group CRUD/archive/owner-scope; alias templates/secure randomness/collisions/validation/provisioning truth; password entropy and no persistence/log/backup; retailer/account/setup/status/health relationships; tasks; recursive authority/secret injection; Account Ops backup and zero-write Restore Preview; eight-path migration classification; 360px light/dark/long-content/empty/attention/setup cases; existing security, route, accessibility, and 28-scenario regression gates.
- **Acceptance criteria:** owner-authorized first-class route; private storage is not read before authorization; profile cannot become authentication identity; generated alias is never called provisioned; plaintext password/OTP/token/payment secret never persists; setup stops at human verification; health explains each signal; at the Phase 2A checkpoint Inbox/Orders remain contracts only; no bulk signup, retailer-limit evasion, purchasing, checkout, migration, sync, or remote activation exists.
- **Rollback:** revert the Phase 2A checkpoint while retaining the unchanged Phase 1A–1C sources. Because no database, provider, or remote write occurred, no schema or provider rollback is required; local Account Ops records remain separately owner-controlled.
- **Complexity:** Large.

## Phase 2A.5 — Workspace architecture / mini-app shell

**Status:** Published at `4c6c7891a123777acec8f326793f30aee61f3de6`. The route registry and preference remain presentation metadata and do not authorize provider access.

- **Objective:** make Collect, Find, Sell, Bot, and Business focused product workspaces inside one Code 3 application while retaining shared records, one authentication/persistence platform, Owner Center separation, and route compatibility.
- **Current code affected:** `src/App.jsx`, `src/utils/appRouteState.js`, the new central workspace registry, workspace switcher/home components, mobile/desktop navigation, safe local workspace preference, and route/accessibility/browser tests.
- **Implemented/likely files/modules:** `src/config/workspaceRegistry.js`; `src/features/workspaces/WorkspaceSwitcher.jsx`, `WorkspaceHomePage.jsx`, `workspacePreference.js`, and `workspace-shell.css`; existing shell/route integration; [WORKSPACE_ARCHITECTURE_CONTRACT.md](./WORKSPACE_ARCHITECTURE_CONTRACT.md).
- **Data changes:** bounded reconstructible `code3.workspace-preference.v1` UI preference only. It is distinct from historical persisted `Workspace`/`activeWorkspaceId`, contains no authority or business data, and joins the existing non-coverage Backup v1 safe-preferences group without changing source counts. No feature record changes.
- **Migration risks:** route/deep-link/back loops, stale private workspace visibility after session downgrade, naming collision with legacy Workspace records, accidental duplication of cross-workspace records, and client entitlement metadata being mistaken for authority.
- **Dependencies:** published Phase 2A, verified owner-session boundary, current route/legacy tests, and existing lazy feature modules.
- **External authorization:** none. Bot/email/mailbox/vault providers, billing, and subscriptions are explicitly excluded.
- **Test plan:** registry validity/unique routes/aliases; workspace switcher and direct-route precedence; safe remembered preference; verified OWNER gates for Bot/Owner Center/Account Ops; Account Ops Business context without inherited access; representative deep and legacy links; Back/history; no shared-record cloning; 360px light/dark navigation and homes; keyboard/focus/reduced motion; existing Phase 1A–2A and 28-scenario regression gates.
- **Acceptance criteria:** `/collect`, `/find/home`, `/sell/home`, `/bot`, and `/business` expose honest route-safe homes; current feature URLs remain compatible; only an authorized OWNER sees/opens Bot; Owner Center is outside the switcher; Account Ops stays `VERIFIED_OWNER`; direct routes override remembered public workspace; no navigation loop or 360px overflow; no duplicate records, provider, billing, migration, sync, or automation is introduced.
- **Rollback:** revert the shell/registry integration and remove only the reconstructible workspace preference. Existing routes and feature records remain unchanged; no schema, provider, or owner-data rollback is required.
- **Complexity:** Large.

## Phase 2B1 — Secure provider runtime and Inbox / Order Intelligence foundation

**Status:** Implemented, validated, and published at `2f49a5ed97cec827184c6080e4ada0f4c8194451`. No live provider is authorized or connected.

- **Objective:** establish fail-closed provider security contracts and a deterministic synthetic/minimized order-evidence domain before any live mailbox is permitted.
- **Current code affected:** `backend/src/providerRuntime`, the protected Account Ops provider route, Account Ops Connections/Inbox/Orders foundation, `src/features/inboxOrder`, backup/Restore Preview, migration classification, and focused tests.
- **Implemented files/modules:** provider/capability definitions; unavailable production connection/secret/OAuth-state adapters; test-only memory adapters; safe audit/redaction; `/api/account-ops/provider-connections` status/capabilities/disconnect contract; fixed client request boundary; normalized message, matching, money, Order Candidate, repository/service/history and synthetic fixtures; [INBOX_ORDER_PROVIDER_CONTRACT.md](./INBOX_ORDER_PROVIDER_CONTRACT.md).
- **Data changes:** one schema-versioned `code3.inbox-order.v1` local source with `messageEvents`, `orderCandidates`, `candidateEvents`, and `activity`. Backup Format v1 now registers 23 sources (19 locally included and four excluded/conditional); all four new paths are `REQUIRES_MAPPING`. No canonical schema/domain changes.
- **Migration risks:** protected content leakage, provider replay, duplicate or cross-account orders, wrong alias/retailer/account attribution, mixed/malformed money, owner correction loss, and a synthetic/local foundation being mistaken for hosted ingestion.
- **Dependencies:** published owner-session/authorization and workspace boundaries, Phase 1B `LOCAL_ONLY` gateway/recovery, Phase 1C confidence/money/provenance, and published Account Ops relationships.
- **External authorization:** none for synthetic processing. Live provider work requires provider registration/consent, minimum read-only scopes, a durable managed secret store, durable atomic OAuth-state store, verified Preview API/callback routing, retention/deletion review, and provider revocation proof.
- **Test plan:** OWNER status/capability/disconnect policy; unavailable hosted defaults; test-adapter runtime isolation; OAuth owner/provider/redirect/expiry/single-use behavior; secret and client exclusion; protected/unrelated-message minimization; retailer/alias matching; exact money; 10x retry idempotency; multi-message reconciliation and conflict repair; owner correction provenance; no Purchase write; backup/zero-write preview and four-path migration classification; inherited security/application regression.
- **Acceptance criteria:** production/default runtime cannot connect; provider capability truth is nonsecret; no OAuth/token field can enter React persistence or backup; OTP/reset/login values are removed before hashing/persistence; one scoped provider event cannot duplicate a candidate on retry; owner corrections/history survive reconciliation; every candidate requires review and cannot create a Purchase; `LOCAL_ONLY` remains authoritative and no schema/provider/deployment action occurs.
- **Rollback:** revert this local phase. No provider, database, remote record, Purchase, or file byte requires rollback because none is activated or written outside the existing browser-local evidence source.
- **Complexity:** Large.

## Phase 2B2-A — Preview trusted Express/API runtime

**Status:** Published at `c379416336e32a67346c7a3bb95f7b6469f679f5`; exact Express execution and fail-closed unauthenticated behavior are proven, while authenticated-owner proof remains incomplete.

- **Objective:** prove that the owner session and provider-status requests reach the canonical Express app in Vercel Preview, return server-owned non-Production proof, and keep provider readiness false.
- **Current code affected:** exact `api/auth/session.ts` and `api/account-ops/provider-connections.ts` entries; `backend/src/providerRuntime/trustedRuntime.ts`; provider status projection; Account Ops Connections client/UI; focused runtime/deployment tests and documentation.
- **Data changes:** none. No provider, canonical, Purchase, Inventory, migration, file, or mailbox data is written.
- **Dependencies:** published Phase 2B1; existing Preview project/auth configuration; authenticated Vercel deployment access; exact owner session for the final `200` proof.
- **External authorization:** no mailbox/provider authorization. A Preview deployment and existing Code 3 owner identity are required only for proof.
- **Test plan:** exact filesystem-before-SPA mapping; strict Preview/Production matrix; `401`/`403`/owner `200`; JSON/no-store/CORS; Gmail/Outlook not configured; all live capabilities false; no provider network; client response allowlist/UI; inherited security, persistence, Account Ops, route, build and regression gates.
- **Acceptance criteria:** real Preview JSON reaches Express; server proof is Preview/non-Production; owner middleware remains definitive; provider runtime loads but is unavailable; no secrets/provider calls/data mutation; Production untouched; `hostedRuntimeVerified` remains false if hosted verification is incomplete.
- **Rollback:** remove the two exact function wrappers and proof/status presentation together; keep provider runtime unavailable and never weaken auth/CORS or use browser secrets as fallback.
- **Complexity:** Medium.

## Phase 2B2-B — Preview owner authentication and managed provider state

**Status:** Source published at `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`; separate Phase 2B2-B.1 operational verification paused. A Free Upstash resource and three branch-scoped Preview secrets exist, but owner/CORS/activation configuration and authenticated readiness proof remain incomplete. `hostedRuntimeVerified=false`.

- **Objective:** support a legitimate authenticated OWNER proof in Preview and provide durable cross-instance connection metadata, encrypted-secret, and atomic OAuth-state storage without starting provider OAuth.
- **Current code affected:** Phase 2B1 provider store interfaces/runtime, trusted-runtime verification, protected provider status, CORS, Account Ops status presentation, backup exclusion guards, environment examples, and focused tests.
- **Implemented files/modules:** official Upstash Redis REST transport; exact Preview/project/branch managed-store selector with a derived namespace scope; durable metadata adapter; AES-256-GCM encrypted secret adapter; SHA-256-digest OAuth-state adapter with atomic Redis Lua issue/consume; write/read/delete readiness probes; Preview-only CORS isolation; status/client projections and tests.
- **Data changes:** none in browser or canonical business persistence. The operational Redis resource remains separate from business records and has no provider connection/secret/OAuth-state record. Phase 2D-A later raises Backup Format v1 to 24 registered/20 included sources but still excludes all managed-provider state.
- **Migration risks:** wrong environment targeting, exposed Redis/encryption credentials, weak key rotation, OAuth replay, wrong-owner/redirect binding, store outages, and operational provider state being mistaken for canonical business data.
- **Dependencies:** published Phase 2B2-A/B source, Preview-only Supabase owner configuration, an exact Preview-only origin, branch-scoped environment, exact expected Vercel project/branch values, and complete server-only managed-store activation/runtime variables.
- **External authorization:** resource provisioning was separately authorized and completed; resuming Supabase sign-in/configuration requires the owner's exact confirmation. Gmail/Microsoft registration, scope consent, and mailbox access are explicitly not part of Phase 2B2-B.1.
- **Test plan:** owner/non-owner/unauthenticated and spoof rejection; exact Preview/Production origin isolation with no general-origin inheritance; exact project/branch/runtime selection and derived namespace; managed metadata separation; AES-256-GCM store/retrieve/delete/redaction; bounded connection/secret/OAuth write-read-delete readiness; unavailable-store fail closed; test-memory runtime isolation; OAuth digest/expiry/owner/provider/redirect/atomic single-use/replay/capacity behavior; backup exclusion; Preview status truth; inherited builds/security/regression.
- **Acceptance criteria:** source never enables stores outside the exact Preview project/branch; missing configuration yields unavailable adapters; project-wide Preview secrets are rejected as an operational design; no hosted memory fallback; secret material is encrypted before Redis and never enters client/backup/logs; OAuth state is digest-only and atomically consumed; legitimate owner plus exact durable kinds and bounded readiness operations are required before `hostedRuntimeVerified=true`; providers/network remain disabled; Production and canonical persistence remain untouched.
- **Rollback:** keep the remaining enable/owner/CORS runtime configuration absent while paused. Any future removal of the resource or Preview credentials is a separately authorized operational action and does not change browser business data.
- **Complexity:** Large.

## Phase 2B2-C — Provisioned Preview proof and provider authorization decision

**Status:** Future and not authorized. Phase 2B2-B source is published; its operational Phase 2B2-B.1 proof is paused pending the owner's explicit `Supabase signed in.` confirmation. Phase 2B2-C must not begin automatically.

- **Objective:** only after the paused Phase 2B2-B.1 proof is completed and separately accepted, decide whether one mailbox-provider OAuth pilot is authorized. Resource existence or Phase 2D-A does not grant that authorization.
- **External authorization:** explicit resource terms/provisioning and owner identity configuration. Any Gmail/Microsoft registration, scopes, callback, test mailbox, or provider network call requires another explicit authorization.
- **Acceptance criteria:** exact commit-attributed Preview, authenticated owner proof, non-owner/unauthenticated denial, CORS denial, healthy managed stores, no secret exposure, Gmail/Outlook still `NOT_CONFIGURED` unless a later task explicitly authorizes a provider.
- **Rollback:** remove Preview-only values/resource access and retain `hostedRuntimeVerified=false`; no business-data rollback is required.
- **Complexity:** Medium before any provider pilot; a live provider pilot is separately Large.

## Phase 2C-A — Purchase → Receiving → Inventory Foundation

**Status:** Published at `3b10644cf1be9498c08b876b5a3bbef98a24ee1c`.

- **Objective:** add the explicit OWNER-reviewed boundary from external evidence to Purchase Draft, exactly-once local Purchase confirmation, append-only partial/discrepancy Receiving, and derived Inventory Handoff Preview without creating Inventory.
- **Current code affected:** new `src/features/purchaseReceiving`; the verified-OWNER Business Purchases surface; Backup Format v1 source/validator; Restore and Migration Preview mapping; focused tests and documentation.
- **Data changes:** one schema-versioned `code3.purchase-receiving.v1` browser source with `purchaseDrafts`, `purchases`, `purchaseEvents`, `receivingEvents`, and `activity`. The gateway is fixed to `LOCAL_ONLY`; Inventory Handoff Preview is not stored; every migration path is `REQUIRES_MAPPING`.
- **Money/allocation:** safe integer minor units and explicit currency only; order-level discount/tax/shipping/fee pools allocate proportionally with BigInt floors and stable largest-remainder pennies, reconciling exactly to the source pool and Purchase total.
- **Authority/idempotency:** verified OWNER before source construction/read; source records referenced, not copied; expected draft versions plus stable confirmation keys yield one Purchase; stable Receiving event IDs deduplicate retries while preserving distinct partial receipts.
- **Business boundary:** `Order Candidate != Purchase`; `Checkout Evidence != Purchase`; `Purchase Draft != Purchase`; `Purchase != Received Inventory`; `Delivery != Receiving`; `Inventory Handoff Preview != Inventory`. No Inventory writer, quantity/cost mutation, or automatic importer exists.
- **Security:** reject browser authority, passwords/tokens/cookies/OTPs, PAN/CVV/payment credentials, retailer/provider/proxy credentials, credential-bearing URLs, raw mail/Bot/provider content/logs and unsafe structures before persistence/backup.
- **External authorization:** none for local code and synthetic fixtures. No real order, retailer, payment, mailbox, Bot, managed resource, schema, remote persistence, or Production action is authorized.
- **Test plan:** drafts/corrections/rejection/confirmation; exact money and remainder allocation; cancellation/refund bounds; partial Receiving/discrepancies/idempotency; product match ambiguity; no Inventory mutation; security/backup/restore/migration; OWNER gate; responsive UI; upstream Account Ops/Inbox/Bot and business/inventory regression; full gate.
- **Acceptance criteria:** explicit confirmation produces exactly one Purchase; delivery creates no Receiving; receiving produces only a handoff preview; no secret/source payload enters storage/backup; local/remote and paused-provider boundaries remain unchanged.
- **Rollback:** remove the additive route/domain/backup/docs changes after exporting any safe owner-created local metadata. No remote, provider, Inventory, schema, or deployment rollback is required.
- **Complexity:** Large.

See [PURCHASE_RECEIVING_CONTRACT.md](./PURCHASE_RECEIVING_CONTRACT.md).

## Phase 2C-B — Owner-Confirmed Inventory Creation

**Status:** Published at `bcff80042a15a29492ed32ba945291b50d35b5bb`.

- **Objective:** add the first explicit verified-OWNER boundary from confirmed Purchase/Receiving evidence to canonical local Business Inventory while preserving every upstream non-equivalence invariant.
- **Current code affected:** `src/features/purchaseReceiving/inventoryCreation`, the existing Flip Scout/Business Inventory repository and protected record actions, `/business/purchases`, Backup/Restore Preview and migration classification, focused tests, and documentation.
- **Data changes:** normalized `ember-and-tide.flip-scout.v1` to schema version 3; retained existing `inventory` authority and added `inventoryLots`, `inventoryCreationApplications`, `inventoryCreationEvents`, and `inventoryAdjustments`. Inventory Handoff Preview and Inventory Creation Candidate remain ephemeral. New migration paths are `REQUIRES_MAPPING`.
- **Eligibility:** use only current positive owner-confirmed received quantities; block Purchase `RETURN_INITIATED`/`RETURNED`/`CANCELLED` and Receiving `RETURNED_TO_SENDER`/`CANCELLED`/`MISSING`/`NOT_RECEIVED`; exclude duplicate and unresolved-extra units. Require `MATCHED` or explicit `OWNER_RESOLVED` identity, reviewed condition/disposition, and exact Purchase cost reconciliation. Manual resolution must reference an existing local Inventory/product relationship and preserve a bounded reason. No title-based product creation.
- **Money/lot behavior:** use integer minor units; allocate each Receiving event's exact cost slice in authoritative persisted append order so mutable timestamps/client IDs cannot reorder pennies; divide per unit by floor plus deterministic early-position remainder; create a separate acquisition item/lot even for an existing product so source cost/provenance is not averaged away. Exact slices feed existing Business/Flip Scout sales, COGS, summary, and valuation projections.
- **Authority/idempotency:** OWNER gate before storage access; candidate re-derived within same-origin exclusive Web Lock; expected version plus deterministic application/item/lot/event IDs; one normalized whole-document write; exact read-back; compatible partial-write repair and conflict/stale fail-closed behavior.
- **History/reversal:** append `INVENTORY_CREATED` and later reviewed adjustment records; generic edit/delete cannot change provenance-managed acquisitions; refund does not remove Inventory; reversal checks current version and available quantity after sales and never makes quantity negative. Phase 2C-C separately extends the adjustment model without rewriting this creation history.
- **Business boundary:** `Receiving != Inventory`; `Inventory Handoff Preview != Inventory`; `Inventory Creation Candidate != Inventory`. Only explicit confirmation creates Inventory, and email/Bot/delivery/evidence paths cannot reach the writer.
- **Security:** reject client authority, payment/retailer/provider/proxy credentials, tokens/cookies/OAuth/OTPs, credential URLs, raw evidence/logs, dangerous keys, and unsafe structures. No payment credential is required.
- **Backup/migration:** extend the existing safe Deal Finder section rather than create another source; require strict complete item/lot/application/event identity/cost reconciliation; candidates/previews remain excluded; Restore Preview stays zero-write; mixed `deal-finder.inventory` and new provenance paths remain `REQUIRES_MAPPING`; no remote Inventory cutover or schema application.
- **External authorization:** none for local source and synthetic fixtures. No real business record, provider, Upstash/Supabase/Vercel auth change, schema, billing, Production action, or Phase 2D-B3 work is authorized.
- **Test plan:** candidate/eligibility/product/condition; exact unit and partial-receipt allocation; owner confirmation; lot/merge behavior; repeated/interrupted/two-tab/stale idempotency; reversals/returns/refunds/sales bounds; generic edit/delete protection; security; backup/migration; Purchase/Receiving and Inventory/business/sales regressions; UI/browser/accessibility/build/full gate.
- **Acceptance criteria:** only freshly re-derived eligible candidates can create one exact local result; retry repairs or deduplicates; no unavailable quantity is reversed; all provenance remains inspectable; `LOCAL_ONLY` stays authoritative and remote/provider/Production boundaries remain unchanged.
- **Rollback:** revert the additive schema-3 collections/gateway/UI/docs after exporting any safe local acquisition metadata. No remote/provider/schema/Production rollback is required.
- **Complexity:** Large.

See [INVENTORY_CREATION_CONTRACT.md](./INVENTORY_CREATION_CONTRACT.md).

## Phase 2C-C — Inventory Correction and Disposition

**Status:** Published at `ef30033a3b30989737878252fb31354aaecf68a3`.

- **Objective:** add explicit preview and OWNER confirmation for safe post-creation correction, physical return, and disposition while retaining immutable Purchase/Receiving/creation/sale/transfer history.
- **Current code affected:** `src/features/purchaseReceiving/inventoryCorrection`, the existing Purchase/Receiving UI/service, schema-v4 Inventory contracts/repository, Deal Finder backup/preview/migration validation, focused tests, and documentation.
- **Data changes:** keep `ember-and-tide.flip-scout.v1` and the same collections; advance to schema version 4; make `inventoryAdjustments` a typed append-only correction/disposition/reversal chain. Correction previews/candidates and the private recovery journal are not persisted domain collections or backup sources.
- **Eligibility:** whole-lot product/condition correction only when no units were sold or transferred; target product must already exist; physical return/quantity disposition cannot exceed unsold/untransferred availability; cost correction is blocked after sales/transfers; refund is never return.
- **Separate acquisitions:** replacements require a new Receiving Event and Inventory-creation review. Unexpected extras require a separate acquisition identity and cost review. Neither increases or overwrites an existing lot through correction.
- **Compatibility:** Sealed product and Accessory remain the active generic paths. Raw card and Graded card remain deferred until a type-specific card/slab condition, grading-company, grade, and certification contract exists.
- **Authority/idempotency:** verified OWNER before read; explicit preview then confirmation; stable request/candidate identity, expected version, exclusive lock, ordered adjustment sequence, whole-document journal/write/read-back, replay dedupe, and stale/conflicting fail-closed behavior.
- **Backup/migration:** no new source or count. Deal Finder schema 4 validates full creation and typed-adjustment chains; ephemeral previews and private journal are excluded; Restore Preview remains zero-write; all Inventory paths remain `REQUIRES_MAPPING` with no canonical schema or apply action.
- **External authorization:** none. The workstream does not resume Phase 2B2-B.1, use Upstash/Supabase/provider credentials, connect Gmail/Outlook/Bots, activate `REMOTE_ACTIVE`, migrate data, bill, or deploy Preview/Production.
- **Acceptance criteria:** one reviewed action appends one deterministic correction, current item/lot state matches the chain, original history and realized sales/transfers remain untouched, unavailable quantity/cost changes fail, and every local/remote/provider boundary remains unchanged.
- **Rollback:** before publication, revert the local schema-v4/correction/UI/docs changes after exporting any safe owner-created local metadata. No provider, remote schema, migration, environment, or Production rollback is required.
- **Complexity:** Large.

See [INVENTORY_CORRECTION_DISPOSITION_CONTRACT.md](./INVENTORY_CORRECTION_DISPOSITION_CONTRACT.md).

## Phase 2C-D — Historical COGS, Sale & Transfer Reconciliation

**Status:** Current local-only implementation candidate from published Phase 2C-C baseline `ef30033a3b30989737878252fb31354aaecf68a3`; publication is separately gated.

- **Objective:** preserve completed Sale/Transfer truth while adding explicit append-only reconciliation for post-sale acquisition-cost/product/provenance corrections.
- **Current code affected:** `src/features/purchaseReceiving/inventoryReconciliation`, schema-v5 Flip Scout Inventory, exact managed COGS projections, Purchase/Receiving reconciliation UI/service, Deal Finder backup/Restore Preview/migration validation, focused tests, and documentation.
- **Data changes:** keep `ember-and-tide.flip-scout.v1`; add `inventoryReconciliationEvents`; preserve immutable Sale rows and typed adjustment history. Candidates/previews and the private recovery journal remain non-domain state.
- **COGS behavior:** compare original repository-assigned Sale slices with corrected deterministic slices; append exact signed realized-COGS deltas; apply the unsold suffix to current Inventory cost; require sold plus remaining effects to equal the total lot-cost delta exactly.
- **Product/reporting behavior:** retain Sale-time product, COGS, profit, and ROI. Show original facts plus explicit reconciled projections and correction-period metadata; do not rewrite original Sales or prior-period source dates.
- **Transfer behavior:** no canonical managed-transfer collection exists, so transfer categories and multi-hop cases remain honest `NEEDS_REVIEW`/blocked states. Legacy movement is not promoted into authority.
- **Authority/idempotency:** verified OWNER before reads, current Inventory/lot/Sale/Purchase/Receiving re-read inside the existing Web Lock, exact recomputation, quantity/cost conservation, deterministic semantic identity, private-journal persistence, readback, replay dedupe, and stale/conflicting fail-closed behavior.
- **Security/backup/migration:** reject client authority and every credential/raw-source category; extend the existing Deal Finder safe section without adding a source; candidates/previews/journal excluded; Restore Preview zero-write; all affected paths `REQUIRES_MAPPING`; no server transaction, remote schema, or cutover.
- **Explicit deferrals:** Raw/Graded card authority, canonical managed Transfers, multi-device transactions, product creation, automatic refund/return/replacement behavior, provider work, billing, and Production.
- **Acceptance criteria:** original Sale bytes remain identical; confirmed deltas reconcile current exact cost; negative deltas are valid; partial sales preserve allocation order; transfer cases fail closed; repeated/interrupted/two-tab submissions produce one effect; full inherited regression passes.
- **Rollback:** remove the additive schema-v5 reconciliation layer after exporting safe local metadata. Original Sale/Transfer/Purchase/Receiving/creation/correction facts remain intact; no provider, remote schema, billing, or Production rollback is required.
- **Complexity:** Large.

See [INVENTORY_RECONCILIATION_CONTRACT.md](./INVENTORY_RECONCILIATION_CONTRACT.md).

## Phase 2D-A — Bot Integration Foundation

**Status:** Published at `cdde7df506c94bc55b2ec7995596843ae1c2261a`. It remains independent from the paused Phase 2B2-B.1 operational verification.

- **Objective:** establish provider-neutral Bot Operations contracts, local owner workflows, capability truth, security and event-history boundaries, safe synthetic fixtures, backup/Restore Preview coverage, and a responsive OWNER-only UI before any real Bot integration is considered.
- **Current code affected:** `src/features/botOps`; `/bot` route/shell integration; Account Ops reference projections; Backup Format v1 source/validator and migration-source registry; Restore Preview; focused tests and browser QA; definitive documentation.
- **Data changes:** one schema-versioned `code3.bot-ops.v1` browser source with ten arrays: `installations`, `retailerAccountLinks`, `botProfiles`, `proxyGroups`, `productTargets`, `taskGroups`, `tasks`, `attempts`, `checkoutEvidence`, and `activity`. The gateway is fixed to `LOCAL_ONLY`; normal runtime starts empty; all ten migration paths are `REQUIRES_MAPPING`.
- **Provider boundary:** Hayha and Stellar are static safe registry entries, both `NOT_CONFIGURED`, disconnected, with empty/unverified retailer coverage and all live capabilities false. The mock adapter is explicit automated-test injection only. Possible official API/local companion/export/webhook/owner-approved-local modes are metadata, not active integrations.
- **Security boundary:** recursively reject browser authority, Bot/provider/retailer/payment/proxy credentials, proxy connection/authentication values, raw provider payloads/logs/request-response bodies/headers, credential-bearing URLs/text, dangerous keys and unsafe/oversized input before hashing/persistence/backup. Do not use Upstash or any managed Bot secret store.
- **History/reconciliation:** scope provider events by provider + installation + event ID; make same-hash replay a no-op; distinguish installations; retain changed-hash conflicts, reordered times and contradictory states; repair interrupted local writes without duplicating complete history. Attempts/activity are append-only; evidence owner review/correction preserves source history.
- **Business boundary:** `Bot Success != Purchase`; `Checkout Evidence != Purchase`; no Purchase/lot/receipt/Owned Item/receiving/Inventory/quantity/cost-basis writer is reachable. Future handoff remains Attempt -> Evidence -> order reconciliation -> OWNER confirmation -> Purchase -> Receiving -> Inventory.
- **External authorization:** none for local contracts/synthetic fixtures. No real bot, account, proxy, retailer, mailbox, credentials, provider network, checkout, billing, managed resource or Production action is authorized.
- **Test plan:** provider registry/capabilities/unsupported behavior; installations/accounts/profiles/proxies/targets/groups/tasks; every normalized task/error state; append-only attempts/evidence; repeated/reordered/interrupted/cross-installation/contradictory events; malformed and secret-bearing provider payloads; recursive client authority; no business writer; Backup/Restore Preview exclusions and zero writes; all ten `REQUIRES_MAPPING`; OWNER-gated UI and honest empty states; 360px/tablet/desktop, keyboard, reduced motion, light/dark; Account Ops/business/inventory/route/build/security/credential/diff and complete regression gates.
- **Acceptance criteria:** local workflows are deterministic and validated; normal runtime never displays fixture connectivity; Hayha/Stellar remain not configured; no secret can enter client persistence/logs/backup; all retries/contradictions preserve history; Checkout Evidence requires review and cannot create business records; `LOCAL_ONLY` remains authoritative; `REMOTE_ACTIVE` and canonical schema remain inactive; Phase 2B2-B.1, Gmail/Outlook, billing, and Production remain untouched.
- **Rollback:** revert the additive Bot route/domain/backup/docs changes. No provider, remote record, Purchase, Inventory, credential, schema or deployment requires rollback. Any owner-created local Bot metadata remains separately exportable before code removal.
- **Complexity:** Large.

See [BOT_INTEGRATION_CONTRACT.md](./BOT_INTEGRATION_CONTRACT.md).

## Phase 2D-B1 — Bot provider integration discovery and pilot design

**Status:** Published at `e832ab67a153c5e672f8a77dda5474aedb1395af`. No live pilot is authorized.

- **Objective:** determine current legitimate Hayha/Stellar integration surfaces using public first-party evidence; classify each mode as `VERIFIED_SUPPORTED`, `DOCUMENTED_BUT_LIMITED`, `UNKNOWN`, `UNSUPPORTED`, or `DO_NOT_USE`; keep read/status distinct from control; and design the narrowest later pilot without connecting either provider.
- **Code/data impact:** immutable source/evidence metadata and a pure fail-closed readiness decision only. `code3.bot-ops.v1`, Backup Format v1, Restore Preview, migration classifications, backend routes, provider secrets, and adapter networking do not change.
- **Research result:** neither provider exposes a verified public read-only task/status/history API. Hayha's public docs are stale and its terms prohibit automated access/extraction/reverse engineering. Stellar's task-group export is manual JSON and same-version transfer is documented, but a stable root/field/version-marker contract is not; its Discord path is notification-only, and its developer WebSocket sends product pings into Stellar rather than status out.
- **Pilot decision:** `NO_LIVE_BOT_PILOT_YET`. The safest non-live precursor is the separately authorized Phase 2D-B2 synthetic-first preview with no `SUPPORTED` compatibility claim. Profiles, accounts, sessions, proxies, config, license material, unknown secret fields and credential-bearing values must be rejected.
- **External authorization:** none for research/static metadata. Any provider confirmation, real export, Discord app/channel, webhook URL, companion, token, test installation, or network request requires another explicit phase.
- **Acceptance gate:** official sources referenced; absence remains `UNKNOWN`; private/reverse-engineered modes remain `DO_NOT_USE`; every operational capability stays false; no Connect/control UI; no persistence/network/backend change; complete regression passes.
- **Rollback:** remove static discovery metadata/UI copy/tests/docs. No provider, remote record, credential, task, Purchase, Inventory, schema or deployment requires rollback.
- **Complexity:** Medium.

## Phase 2D-B2 — Stellar Task Export Preview

**Status:** Current local-only implementation from `e832ab67a153c5e672f8a77dda5474aedb1395af`; publication is separately gated.

- **Objective:** inspect one explicitly owner-selected Stellar task-group JSON export locally through bounded parsing, recursive fail-closed security screening, strict field allowlisting, conservative normalization, and ephemeral review/discard.
- **Evidence boundary:** current official guidance documents JSON task-group export/import and same-version transfer but no stable root, field schema, or embedded version marker. `SUPPORTED` remains reserved and is not emitted; recognized inputs are at most `PARTIALLY_RECOGNIZED`.
- **Data impact:** none. The 1 MiB/500-record pipeline retains no raw JSON or source hash, writes no browser/remote store, adds no Backup/Migration source, and loses all preview data on discard/navigation/refresh. `Stellar Export Preview != Bot Task Import`; `Previewed Task != Task`.
- **Security:** scan every nested object/array before normalization; reject credential/token/session/cookie/authorization/license/OTP/payment/proxy-authentication/credential-URL/raw-provider/dangerous-key content without echoing values; ignore harmless unknown fields with bounded warnings.
- **Explicit non-goals:** no live adapter, task import/creation, task control, Discord listener, WebSocket feed, credential store, checkout, Attempt/Activity/Checkout Evidence, Order Candidate, Purchase/Inventory mutation, private API, reverse engineering, provider network, or real export acquisition.
- **Acceptance gate:** owner-selected JSON only; strict type/size/depth/count/value bounds; exact money and quantity validation; conservative retailer/product mapping; duplicate warnings within one preview; no automatic file watching/write back; refresh/discard cleanup; Backup/Restore/Migration exclusion; accessible responsive UI; focused and inherited regression gates.
- **Rollback:** remove the isolated preview module, Tasks-section entry, tests, and documentation. No record, backup, remote resource, provider setting, or business mutation requires rollback.
- **Complexity:** Medium.

## Phase 2 — Remaining app-shell extraction and route ownership hardening

- **Objective:** continue beyond the Phase 2A.5 presentation registry to reduce the initial bundle and make one canonical renderer own each workflow before feature growth increases coupling.
- **Current code affected:** `src/App.jsx`, `src/utils/appRouteState.js`, legacy pages and compatibility renderers, Vite chunk configuration.
- **Likely files/modules:** domain route modules for detailed sourcing, collection compatibility, business compatibility, exchange, community/moderation, administration, settings/utilities; shared route boundary and loading/error components.
- **Data changes:** none; storage hydration behavior must remain compatible.
- **Migration risks:** direct-route refresh, query/hash loss, Android/browser Back, modal history, local hydration races, duplicated dependencies.
- **Dependencies:** existing `docs/APP_SHELL_EXTRACTION_PLAN.md`, route tests, stable authorization interface from Phase 1A.
- **External authorization:** none.
- **Test plan:** build-size comparison, every direct route, alias redirects, refresh/fallback, history/back, light/dark viewport, accessibility, 28-scenario regression.
- **Acceptance criteria:** Home/shell materially smaller; Owner Center and heavy domains load on demand; no duplicate workflow; all compatibility tests and full regression pass.
- **Rollback:** revert one domain extraction at a time; keep route registry/aliases stable.
- **Complexity:** Large.

## Phase 3 — Scheduled eBay intelligence

- **Objective:** run authorized Search Rules on a durable, rate-limit-aware schedule and attribute discovery through realized outcome, without account actions.
- **Current code affected:** existing eBay service/routes, Phase 1C eBay evidence normalization/deal intelligence, Search Rules, Import Review, Owner Center sourcing/performance/controls, notifications/jobs.
- **Likely files/modules:** backend job/search-run repositories, scheduler/worker, rule compiler, expiration checks, alert delivery, eBay adapter extensions, Owner Center history/metrics.
- **Data changes:** `SearchRun`, `BackgroundJob`, listing snapshots/change events, notification delivery, attribution links.
- **Migration risks:** duplicate jobs/results, quota exhaustion, alert floods, stale credentials, overwriting owner corrections.
- **Dependencies:** Phases 1A/1B; route extraction recommended; production eBay quota/terms review.
- **External authorization:** eBay production application approval and notification provider if alerts leave the app.
- **Test plan:** mocked schedules/tokens/rate limits/retries/idempotency; deduplication/change/expiry; quiet hours; rule attribution; owner authorization; no account-action endpoints.
- **Acceptance criteria:** bounded runs record full history; retry cannot duplicate imports; failures are visible; every result enters Import Review; new/change/expiry alerts link to records; no buying/offers/bids.
- **Rollback:** disable schedules by feature control, retain run history, preserve manual eBay search.
- **Complexity:** Large.

## Phase 4 — Auction sources and operational workflows

- **Objective:** formalize source capability/terms, authorized/manual ingestion, events/lots, maximum bid, calendar, and pickup planning.
- **Current code affected:** `src/features/flipScout/calculations.js`, `src/features/flipScout/screens/AuctionsScreen.jsx`, Phase 1C lot/auction intelligence, connectors, imports, purchases, Owner Center sourcing/performance.
- **Likely files/modules:** auction repositories/API, source registry, event/lot/detail screens, bid solver, import adapters, pickup/calendar modules.
- **Data changes:** `AuctionEvent`, `AuctionLot`, `BidPlan`, `PickupPlan`, source terms and performance attribution.
- **Migration risks:** source-specific tax/premium rules, unknown-content valuation, duplicate lots, time-zone/deadline mistakes, winning auction not becoming purchase.
- **Dependencies:** Phase 1 persistence/auth; authorized source access where used.
- **External authorization:** official APIs/feeds/email scopes per source; none for manual records.
- **Test plan:** all tax modes, complex numerical solver, fees/logistics, deadlines/time zones, import dedupe, event-to-purchase, lost/won states, no bid submission.
- **Acceptance criteria:** manual flow is complete; capability state is honest; maximum bid is reproducible; live mode is read-only; pickup deadlines and purchase linkage work.
- **Rollback:** disable source adapter, preserve manual records/plans, revert repository reads without deleting lots.
- **Complexity:** Large.

## Phase 5 — Restock collection and intelligence

- **Objective:** make fast reports, visits, observations, predictions, trip planning, and real evidence-based performance complete.
- **Current code affected:** Owner Center restock repository/models/page, Phase 1C restock intelligence, Find Restocks handoff, existing store/report services, purchase/mileage links.
- **Likely files/modules:** restock domain repository/API, mobile report/visit forms, store/product detail, pattern service, prediction review, trip planner.
- **Data changes:** canonical restock/store/visit/observation/prediction records and outcome links.
- **Migration risks:** store directory mistaken for evidence, inconsistent product/store identity, time-zone errors, incomplete trip profit attribution.
- **Dependencies:** canonical persistence/auth; store/product identity strategy; mapping of legacy local store reports.
- **External authorization:** mapping/routing data only if route calculations are introduced.
- **Test plan:** confirmation/reliability, pattern thresholds, stale reports, prediction outcomes/error, incomplete-metric disclosures, purchase/mileage/sale attribution.
- **Acceptance criteria:** reports are quick and auditable; probability language is enforced; no prediction appears without support; missing profit/trip data remains unavailable rather than zero.
- **Rollback:** disable predictions and keep raw events/visits; retain local export.
- **Complexity:** Large.

## Phase 6 — Collection enhancements

- **Objective:** complete sets, binders, printable placeholders, wishlist matching, grading submissions, and unassigned review without duplicating owned items.
- **Current code affected:** Collection workspace, owned-item purpose module, inventory compatibility, catalog/product references.
- **Likely files/modules:** collection domain pages/repositories, binder layout/print module, wishlist matcher, grading queue, unassigned migration review.
- **Data changes:** binder/page/slot, wishlist, grading submission, item assignment/audit records.
- **Migration risks:** duplicate physical records, ambiguous catalog identity, copyrighted image use in printouts, purpose/history loss.
- **Dependencies:** canonical `OwnedItem` and protected files from Phase 1B.
- **External authorization:** card-image licensing/usage review; grading-provider APIs only in a later approved integration.
- **Test plan:** purpose transition/audit, binder uniqueness/slots, placeholder layouts, wishlist match thresholds, grading cost/break-even, unassigned review.
- **Acceptance criteria:** Sell This Item changes purpose in place; every binder assignment is reversible; print preview works; apparent condition is labeled; ambiguous items remain unassigned.
- **Rollback:** disable enhanced views, retain owned-item core and audit history.
- **Complexity:** Large.

## Phase 7 — Business operations completion

- **Objective:** complete receiving, lot processing, allocation, storage/labels, listing drafts, shipping, returns, and booth workflows.
- **Current code affected:** records screens/utilities under `src/features/flipScout`, Business workspace, owned items, and sales validation.
- **Likely files/modules:** purchase/inventory/sales APIs and details, receiving/processing steps, allocation engine, storage hierarchy, label/print, listing/shipping/return/booth modules.
- **Data changes:** canonical purchase lots/allocations, inventory adjustments, storage, listings, shipments, returns, booth statements.
- **Migration risks:** overselling, duplicate inventory, COGS loss, allocation rounding, return quantity restoration, print side effects.
- **Dependencies:** Phase 1B owned-item/persistence; channel profiles; optional printer workflow decisions.
- **External authorization:** shipping/label or channel access only if separately approved; manual workflows require none.
- **Test plan:** purchase-to-item, all allocation methods/rounding, quantity reservations, listing oversell, sale/return/refund, shipping estimated/actual, label no-side-effect, booth reconciliation.
- **Acceptance criteria:** every dollar reconciles or has explicit exception; one item history persists; drafts do not sell stock; returns preserve the sale and restore only inspected quantity.
- **Rollback:** feature flags per submodule; preserve core purchase/inventory/sale records and adjustment audit.
- **Complexity:** Extra Large.

## Phase 8 — Money, reconciliation, and reports

- **Objective:** complete receipts, commitments, bookkeeping semantics, reconciliation, and trustworthy actual/projected reporting.
- **Current code affected:** expenses/mileage/sales/purchases, Money workspace, CSV/JSON exports, Owner Center performance.
- **Likely files/modules:** receipt storage/review, report queries, reconciliation rules/queue, commitment service, bookkeeping export package.
- **Data changes:** canonical receipts/assets, commitments, reconciliation issues/resolutions, report snapshots where required.
- **Migration risks:** double-counted fees/expenses, projected values presented as actual, missing COGS, tax-language overclaim, report drift.
- **Dependencies:** Phases 1B and 7; complete transactional associations.
- **External authorization:** accounting export format review if a third-party target is introduced.
- **Test plan:** semantic totals, date ranges/time zones, returns/refunds, reconciliation rules, duplicate detection, report-to-source-record trace, exports and restore.
- **Acceptance criteria:** every displayed total is traceable; actual/projected are distinct; reconciliation links the record and correction; exports validate and are not labeled tax returns.
- **Rollback:** disable derived reports/reconciliation suggestions; retain source transactions and exports.
- **Complexity:** Extra Large.

## Phase 9 — Record-grounded Business Assistant

- **Objective:** answer owner questions from authorized application records with explicit evidence and no autonomous mutation.
- **Current code affected:** legacy assistant UI/thread storage, universal search, reporting/query services, feature controls.
- **Likely files/modules:** assistant query/tool API, citation/link renderer, formula explanation, conversation storage, policy/confirmation boundary.
- **Data changes:** assistant sessions/messages/tool audit with minimized content and record links.
- **Migration risks:** disclosure across roles, hallucinated totals, projected/actual confusion, stale cache, unintended writes.
- **Dependencies:** server authorization, canonical records, reporting semantics, audit logs.
- **External authorization:** AI provider only if model-backed; a deterministic query assistant may precede it.
- **Test plan:** mocked questions, date range, authorization, evidence links, formulas, missing data, prompt injection, no-write guarantees.
- **Acceptance criteria:** answers are reproducible from linked records, disclose gaps, and cannot buy/bid/offer/message or mutate without a separate confirmed action.
- **Rollback:** disable feature flag; preserve underlying reports.
- **Complexity:** Large.

## Phase 10 — AI-assisted review

- **Objective:** add review-only extraction/recognition for screenshots, products, binders, receipts, and auction photos.
- **Current code affected:** Phase 1C normalized evidence/analysis contracts, imports, protected files, Deal Analysis, grading queue, receipts, feature controls, provider architecture.
- **Likely files/modules:** server AI adapter behind the Phase 1C provider-neutral boundary, protected evidence pipeline, review UI, model/version/cost logging, evaluation fixtures.
- **Data changes:** immutable AI result, confidence/evidence, correction, final confirmation, cost/usage.
- **Migration risks:** privacy/retention, cost, hallucination, copyrighted images, false authenticity/condition/value claims.
- **Dependencies:** Phase 1C provenance/history contract, protected files, authorization/audit, review queues, provider approval, evaluation dataset.
- **External authorization:** selected AI provider and data-use/retention approval.
- **Test plan:** mocked responses, adversarial/low-confidence evidence, no unseen-content value, apparent-condition wording, final-confirm requirement, budget/rate limits.
- **Acceptance criteria:** raw output never becomes final inventory; confidence/evidence/version are visible; owner corrections persist; guarantees are prohibited.
- **Rollback:** disable provider/feature, retain original evidence and confirmed manual records.
- **Complexity:** Extra Large.

## Phase 11 — Kids, community, and marketing

- **Objective:** complete private impact tracking and optional secondary content planning without cluttering everyday navigation.
- **Current code affected:** legacy community/kids/content modules, owned-item purpose, feature controls, profile menu.
- **Likely files/modules:** internal kids/community repositories and pages, impact reports, feature-flagged marketing modules, protected assets.
- **Data changes:** packs, donations, giveaways, events, content/calendar/campaign/assets/performance.
- **Migration risks:** children's personal data, mixing public/private records, inventory cost attribution, accidental publishing.
- **Dependencies:** owned items, money, files, server authorization, private/public boundary.
- **External authorization:** platform APIs only for separately approved confirmed publishing; otherwise none.
- **Test plan:** purpose/quantity/cost attribution, minimized personal data, feature visibility, no auto-publish, role access.
- **Acceptance criteria:** internal impact totals trace to records; disabled modules disappear; content remains draft until confirmed through approved access.
- **Rollback:** disable modules, retain owned-item donation history and exports.
- **Complexity:** Large.

## Phase 12 — Offline hardening, security review, and production readiness

- **Objective:** make the installed Android app conflict-safe and establish evidence for a production decision.
- **Current code affected:** service worker/cache, draft repositories, API mutation client, shell/history, monitoring, deployment settings.
- **Likely files/modules:** offline queue/idempotency/conflict UI, cache versioning, observability/redaction, security headers/CSP, environment gates, physical-device QA scripts/docs.
- **Data changes:** sync state, idempotency keys, conflict records, device/session records.
- **Migration risks:** duplicate writes, stale data, offline conflict loss, cache/schema mismatch, preview/production configuration drift.
- **Dependencies:** canonical server API and completed critical workflows; dependency/security review.
- **External authorization:** production hosting/domains/monitoring only after owner approval.
- **Test plan:** offline read/draft/retry/conflict, Android Back/keyboard/camera/safe areas, session revocation, load/performance, backup restore, security review, full regression.
- **Acceptance criteria:** queued writes are idempotent; conflicts are owner-resolved; physical Android checks pass; production blockers in `SECURITY_AND_PRIVACY.md` are closed or explicitly accepted; no automatic external action exists.
- **Rollback:** keep production disabled, revert service worker/cache version, restore prior verified deployment and backup.
- **Complexity:** Extra Large.

## Cross-phase gates

Every implementation phase must:

1. preserve storage keys and compatibility aliases until migration evidence permits retirement;
2. preserve server-only credentials and the eBay Import Review gate;
3. use real or honest empty data, never invented metrics;
4. add focused tests and retain the 28-scenario release gate when shared behavior changes;
5. create a verified backup before data migration;
6. document external authorization and provider limits;
7. supply rollback steps before irreversible work;
8. keep the approved minimal UI contract;
9. derive Code 3 app-name rendering from the centralized configuration while keeping the business name/tagline separate;
10. avoid generated catalog changes and unrelated refactors;
11. keep OWNER authority distinct from commercial entitlement metadata;
12. preserve shared record identity across product-workspace projections;
13. stop before production deployment unless separately authorized.
14. keep test-only adapters and synthetic fixtures out of normal runtime and capability health.
15. preserve `Bot Success != Purchase` and `Checkout Evidence != Purchase`; no provider evidence creates receiving or Inventory automatically.

## Exact next task recommendation

The current authorized task is Phase 2C-D local Historical COGS, Sale & Transfer Reconciliation and its detailed report only. After that report, stop. Phase 2D-B3 and every live provider/import path remain unauthorized. Phase 2B2-B.1 remains paused until the owner explicitly says `Supabase signed in.` and must not resume automatically. Do not deploy another Preview, create a bypass, connect a mailbox or Bot, begin provider OAuth, use real Purchase/order data, activate `REMOTE_ACTIVE`, migrate owner data, add billing, apply a schema, begin Raw/Graded authority, or modify Production without another explicit owner-approved specification.
