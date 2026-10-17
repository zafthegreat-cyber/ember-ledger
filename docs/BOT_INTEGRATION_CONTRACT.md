# Code 3 Bot Integration Contract

Status: Phase 2D-A local-only Bot Integration Foundation, Phase 2D-B1 provider capability discovery, and Phase 2D-B2 offline Stellar task-export preview. The foundation defines provider-neutral records, capability truth, synthetic adapters and fixtures, owner-only workflows, security rejection, backup/Restore Preview treatment, and a responsive Bot Operations UI. Phase 2D-B1 adds evidence-backed integration-mode and pilot-readiness contracts without connecting a Bot. Phase 2D-B2 adds an owner-selected, memory-only JSON inspection path; it is not an import and cannot write a Task or any other domain record. These phases do not operate a retailer account, control a task, automate checkout, create a Purchase, receive Inventory, configure credentials, activate remote persistence, or deploy Production.

Starting baseline: `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`.

Phase 2D-B1 starting baseline (published Phase 2D-A): `cdde7df506c94bc55b2ec7995596843ae1c2261a`.

Phase 2D-B2 starting baseline (published Phase 2D-B1): `e832ab67a153c5e672f8a77dda5474aedb1395af`.

## Purpose

Bot Operations gives Code 3 a safe, provider-neutral vocabulary for owner-reviewed purchasing-bot evidence without making a provider or purchase capability live. The domain is designed to accommodate Hayha, Stellar, and later approved providers while keeping their transport, authentication, and provider-specific payloads outside canonical client records.

The future conceptual relationship is:

```text
Bot Provider
  -> Bot Installation
  -> Bot Account / Profile reference
  -> Retailer Account reference
  -> Task Group
  -> Task
  -> Product Target
  -> Proxy Assignment metadata
  -> Runtime Status
  -> Attempt
  -> Bot Checkout Evidence
  -> future order reconciliation
  -> future owner-confirmed Purchase
  -> future Receiving
  -> future Inventory
```

Only the local metadata, normalization, history, review, and UI portions are implemented in Phase 2D-A.

## Non-negotiable boundaries

- Bot is visible and loadable only after the existing application session verifies `OWNER`.
- `LOCAL_ONLY` remains authoritative. `MIGRATION_PREVIEW` remains read-only and `REMOTE_ACTIVE` remains disabled.
- The Phase 1B canonical schema remains unapplied and contains no Bot Operations domain.
- No real Hayha, Stellar, retailer, payment, proxy, or purchasing account is contacted.
- Hayha and Stellar remain `NOT_CONFIGURED`; all live capabilities remain false.
- The mock adapter is an explicitly injected automated-test adapter. It is not selectable as a live provider or normal-runtime connection.
- No provider SDK, bridge process, webhook receiver, export watcher, browser automation, network adapter, provider token, or provider secret is active.
- No task start, stop, restart, cart, checkout, order, raffle, entry, queue, or purchase action is available.
- No Bot result can create or mutate a Purchase, Purchase Lot, Owned Item, receipt, sale, receiving record, Inventory record, quantity, or cost basis.
- Bot/provider, retailer, payment, and proxy credentials are not authorized for storage in Phase 2D-A.
- The paused Phase 2B2-B.1 Supabase/Upstash verification is a separate workstream and is not a Bot credential or persistence dependency.

The invariants are:

```text
Bot Success != Purchase
Bot Checkout Evidence != Purchase
Bot Checkout Evidence != confirmed order
```

## Authorization and workspace placement

`/bot` remains a verified-OWNER product workspace. Workspace metadata, a remembered Bot selection, a feature flag, an entitlement hint, a query parameter, browser storage, or a client role cannot authorize it. The owner gate runs before private Bot Operations storage is constructed or read.

Owner Center remains separate. Account Ops remains Business-associated and retains its own verified-OWNER gate. Bot Operations may reference permitted Account Ops records, but neither workspace grants authority to the other and neither may substitute an operational profile for the authenticated principal.

## Local data source

Phase 2D-A uses schema version 1 under the compatibility key `code3.bot-ops.v1`. It is accessed through the existing persistence gateway fixed to `LOCAL_ONLY`. Callers cannot supply a remote adapter, owner subject, role, session, entitlement, sync mode, migration mode, or cutover instruction.

The local document contains ten bounded collections:

```text
installations
retailerAccountLinks
botProfiles
proxyGroups
productTargets
taskGroups
tasks
attempts
checkoutEvidence
activity
```

The normal runtime begins empty. Synthetic fixtures and the healthy/degraded mock provider exist only in tests or an explicit test harness; they are not seeded into ordinary owner storage and cannot produce fake live metrics.

## Provider registry and adapter boundary

The provider registry contains safe, noncredential metadata:

- stable provider key and display name;
- supported future integration modes;
- explicit connection/configuration state;
- capability declarations;
- supported retailer metadata when known;
- optional bounded version metadata;
- readiness facts and warnings.

Initial real-provider definitions are `HAYHA` and `STELLAR`. Both are `NOT_CONFIGURED`, disconnected, and expose no active live capability. A provider definition never contains credentials or proves that an application, device, account, bridge, or provider API exists.

The provider-neutral adapter contract can describe:

- provider identity and version;
- runtime health;
- supported retailers;
- task discovery and task status;
- optional start, stop, and restart support;
- account/profile mapping visibility;
- proxy-assignment visibility;
- product-target visibility;
- checkout/order evidence;
- normalized errors and statuses; and
- optional event/history streams.

Every capability is independent. Unsupported behavior is reported as unavailable; an adapter must not simulate support. Possible future integration modes are official API, owner-approved local companion, provider export, webhook/event ingestion, and separately approved local automation. Listing a mode is architecture metadata only and does not authorize or implement it.

Phase 2D-B1 refines the adapter vocabulary into independent observation, control, and sensitive-metadata capabilities:

```text
Observation
  OBSERVE_RUNTIME
  READ_TASK_GROUPS
  READ_TASKS
  READ_STATUS
  READ_HISTORY
  READ_CHECKOUT_EVIDENCE

Control
  CREATE_TASK
  EDIT_TASK
  START_TASK
  STOP_TASK
  RESTART_TASK

Sensitive metadata
  READ_ACCOUNT_METADATA
  READ_PROXY_METADATA
  READ_PROFILE_METADATA
```

Every capability defaults false and must remain independently false unless current first-party evidence supports the exact provider integration path and a later phase explicitly activates it. In-client buttons, CLI commands, marketing claims, retailer guides, a file export, or internal network behavior do not prove an adapter capability. A read capability never implies a control capability.

The integration-mode review uses:

```text
OFFICIAL_API
DOCUMENTED_WEBHOOK
DOCUMENTED_EXPORT
DOCUMENTED_LOCAL_INTERFACE
SUPPORTED_PLUGIN
OWNER_FILE_IMPORT
LOCAL_READ_ONLY_COMPANION
MANUAL_IMPORT
UNSUPPORTED_PRIVATE_API
REVERSE_ENGINEERED_INTERFACE
```

Evidence states are `VERIFIED_SUPPORTED`, `DOCUMENTED_BUT_LIMITED`, `UNKNOWN`, `UNSUPPORTED`, and `DO_NOT_USE`. Evidence is short, source-linked, date/version-aware metadata; it is not copied provider documentation, private Discord material, a credential, or activation state. The definitive findings are in [BOT_PROVIDER_CAPABILITY_REVIEW.md](BOT_PROVIDER_CAPABILITY_REVIEW.md).

## Installations

A Bot Installation represents one logical provider runtime without a hardware fingerprint. It may contain:

- stable installation ID;
- provider key;
- friendly and runtime/device labels;
- declared connection mode;
- bounded version metadata;
- health and connection state;
- last-seen time when evidence exists;
- a capability snapshot;
- warning state; and
- enabled, disabled, or archived state.

No MAC address, serial number, device fingerprint, machine secret, or unnecessary hardware identifier belongs in the record. `HEALTHY` or `CONNECTED` requires real future provider evidence; Phase 2D-A real-provider installations remain disconnected or absent.

## Account Ops and Bot profile relationships

`retailerAccountLinks` is a Bot Operations assignment record, not a duplicate retailer account. When an Account Ops record exists, it references the stable Account Ops `storeAccount` and `profile` IDs. It may add only Bot-specific assignment status, aliases/labels, warning flags, related installation/task-group IDs, and bounded last-activity metadata.

Retailer identity is extensible and may represent Target, Walmart, Best Buy, or a later reviewed retailer through safe IDs/labels. Recognizing a retailer identifier does not configure an account, prove retailer support, or authorize automation.

`botProfiles` represents nonsecret checkout-profile configuration metadata. It may reference an Account Ops profile plus shipping, billing, or phone/profile reference IDs, retailer compatibility, Bot assignments, and active state. It never stores raw addresses merely to duplicate Account Ops, and it never stores payment-card credentials.

An Account Ops profile, retailer account, alias, Bot profile, or local label is never an `AuthPrincipal`, owner allowlist entry, or authorization input.

## Proxy metadata

`proxyGroups` stores metadata only:

- stable group ID and label;
- proxy type;
- provider label;
- region;
- installation, retailer, or task-group assignments;
- health state;
- bounded latency and last-check metadata;
- warning state; and
- usage/count metadata.

Proxy metadata is distinct from proxy credentials. Real proxy IP addresses, hostnames, authentication URLs, endpoints, usernames, passwords, bearer values, and connection strings are prohibited from records, fixtures, logs, backups, and browser-visible state. Reserved `.test` and `.invalid` labels are used in synthetic coverage.

## Product Targets

`productTargets` is the reusable provider-neutral target record. It supports retailer, canonical product identifier, SKU, TCIN where applicable, UPC/GTIN, title, category/game, exact maximum/reference price, quantity limit, availability mode, notes, owner-review state, and provenance.

Product targets reference existing product identity where practical so Target/Walmart sourcing lists can feed Bot Operations later without copying canonical product facts. A target is a monitoring/configuration intention, not evidence of availability, a cart, a checkout, or a Purchase.

## Task Groups and Tasks

`taskGroups` groups owner-reviewed local configuration by retailer, product category, provider, installation, retailer-account link, Bot profile, proxy group, schedule/mode, quantity limits, maximum price, enabled state, status, warnings, and timestamps.

Reserved test fixtures include Target Pokémon, Walmart Pokémon, and Target One Piece groups. Those examples never seed normal runtime or imply provider/retailer support.

`tasks` references one task group and one product target. It supports retailer/product identifiers, maximum price, quantity target, mode, account/profile and proxy assignments, normalized runtime status, last attempt, result, warnings, provider-specific reference metadata, and provenance.

Normalized task statuses are:

```text
DRAFT
READY
RUNNING
PAUSED
STOPPED
WAITING
MONITORING
CARTED
CHECKOUT_ATTEMPT
SUCCESS
FAILED
RATE_LIMITED
ACCOUNT_ERROR
PROXY_ERROR
PAYMENT_ERROR
RETAILER_BLOCK
UNKNOWN
```

These are observation and synthetic-test states. A local record carrying `RUNNING`, `CARTED`, `CHECKOUT_ATTEMPT`, or `SUCCESS` does not prove Code 3 controlled a bot or performed that action. Normal runtime creates no such provider event without a separately approved adapter.

## Attempts, event identity, and reconciliation

`attempts` is append-only provider-normalized history. A record may contain task/provider/retailer identity, event and observation times, normalized event, outcome/failure category, bounded message, product/account/profile/proxy references, checkout-evidence reference, and provenance. Raw provider logs and raw request/response bodies are rejected.

Provider event identity is scoped by:

```text
provider key + installation ID + provider event ID
```

The rules are:

- replaying the same scoped identity and normalized source hash is a no-op;
- the same provider event ID on another installation is distinct;
- changed evidence for an existing scoped identity is retained as a conflict/revision rather than overwritten;
- interrupted persistence is repaired deterministically without duplicating already written attempts or evidence;
- reordered events preserve provider time and ingestion time;
- success followed by failure, or any contradictory state, preserves both events and adds a review warning; and
- owner review/corrections are never silently replaced by later provider evidence.

Task projections may be recomputed from retained history, but history is never reduced to a destructive last-write-wins status.

## Bot Checkout Evidence

`checkoutEvidence` is the review boundary between a normalized Bot event and future business records. It may contain provider, installation, retailer, task, attempt, product, quantity, exact expected amount/currency, bounded external order/reference ID when available, account/profile relationships, timestamp, confidence, warnings, provenance, and review state.

Evidence identity is stable and provider-event ingestion is idempotent under the scoped provider event identity. The evidence projection may change only through version-checked owner review/corrections, bounded order-candidate links, or conflict warnings; the underlying attempt/activity history remains append-only. New, changed, conflicting, or contradictory evidence requires owner review. Synthetic evidence always carries synthetic provenance and is never shown as a real checkout.

Phase 2D-A has no Purchase mapper. A future separately approved flow may be:

```text
Bot Attempt
  -> Bot Checkout Evidence
  -> Order Candidate / external order reconciliation
  -> OWNER confirmation
  -> Purchase
  -> Receiving
  -> Inventory
```

Each arrow after Checkout Evidence is inactive. No automatic mutation is permitted, and no Bot Operations repository can reach a Purchase or Inventory writer.

Phase 2C-A now supplies the separate local Purchase Draft, Purchase, Receiving, and Inventory Handoff Preview contracts, but it does not activate the Bot-to-draft arrow. A future owner-selected adapter may reference a stable Checkout Evidence ID/version only; it must not embed or mutate the evidence record. `Checkout Evidence != Purchase`, `Purchase Draft != Purchase`, and `Receiving != Inventory` remain mandatory. See [PURCHASE_RECEIVING_CONTRACT.md](./PURCHASE_RECEIVING_CONTRACT.md).

## Security rejection

All record, fixture, import, event, and backup inputs pass the Bot Operations recursive security guard before hashing or persistence. It rejects:

- client-supplied owner, role, session, authorization, permission, or entitlement authority;
- Bot passwords, provider tokens/API keys, authorization codes, OAuth state, PKCE verifiers, cookies, and sessions;
- retailer passwords, cookies, OTPs, security answers, reset/login values, and bearer tokens;
- payment-card numbers, PANs, CVVs/CVCs, and payment credentials;
- proxy hosts/IPs/endpoints/authentication URLs/usernames/passwords;
- raw provider logs, payloads, request/response bodies, and headers;
- credential-bearing URLs or text;
- dangerous prototype keys, cycles, non-finite numbers, oversized/deep inputs, and unsupported object types.

Errors and activity retain bounded codes/messages only. Secret-bearing provider errors are replaced with a generic safe message. No prohibited value is printed, logged, analyzed, backed up, placed in a URL, or rendered into normal browser state.

Phase 2D-A does not authorize a Bot secret store. It does not reuse the Phase 2B2-B.1 Upstash resource, mailbox provider runtime, canonical database, localStorage, Backup Format v1, or an in-process map for Bot credentials.

Phase 2D-B1 also does not implement Bot credential storage. A future Bot API token, webhook verification secret, or Local Bridge pairing token requires a separate Bot-specific server-side security review. Retailer passwords, payment credentials, cookies, proxy credentials, and Bot license keys remain prohibited rather than secret-store candidates.

## Backup and Restore Preview

Backup Format v1 may include the validated `code3.bot-ops.v1` nonsecret metadata section. All ten collections are explicitly classified `REQUIRES_MAPPING` because the Phase 1B canonical schema has no Bot Operations domain. No insert, update, archive, delete, or cutover action is proposed.

Backup excludes Bot/provider, retailer, payment, and proxy credentials; raw provider logs/responses; cookies; sessions; OTPs; security codes; payment data; credential-bearing URLs; live provider configuration; and synthetic secrets. Restore Preview validates schema, IDs, scoped event uniqueness, collection references, evidence/task/attempt relationships, and prohibited fields in memory with zero writes.

Restore Preview cannot start a provider, contact a Bot, import an event, repair a task, reconcile an order, create a Purchase, receive Inventory, or mutate the managed provider store.

## UI contract

The full-page Bot Operations foundation exposes these responsive sections:

```text
Overview
Bots
Task Groups
Tasks
Accounts
Profiles
Proxies
Product Targets
Activity
```

Normal runtime shows honest state:

- Hayha — Not configured;
- Stellar — Not configured;
- runtime disconnected or unavailable;
- zero live tasks;
- zero Bot-linked real accounts;
- zero live proxies; and
- no successful checkout metric unless real future reviewed evidence exists.

Synthetic fixtures do not populate normal runtime. At 360 pixels the experience uses cards or compact rows rather than requiring a wide table, has no horizontal overflow, preserves 44-pixel targets, visible focus, semantic headings, keyboard operation, reduced motion, safe areas, and light/dark contrast.

## Test contract

Focused tests cover:

- provider registry and capability truth;
- unavailable/unsupported capabilities;
- installations, retailer-account references, Bot profiles, proxy metadata, product targets, task groups, and tasks;
- normalized attempts and Checkout Evidence;
- repeated, reordered, interrupted, cross-installation, and contradictory provider events;
- malformed provider input and secret-bearing payload rejection;
- client authority rejection and no remote mode;
- no Purchase/receiving/Inventory writer;
- safe backup inclusion, prohibited-data exclusion, all-path `REQUIRES_MAPPING`, and zero-write Restore Preview;
- owner-only route behavior and disconnected/empty UI;
- mobile/tablet/desktop, keyboard, reduced motion, and light/dark guards; and
- inherited Account Ops, business/inventory, security, route, build, and full regression gates.

Passing synthetic tests proves the contract, not a provider connection, checkout, order, or purchase.

## Phase 2D-B1 discovery decision

The official-source review dated 2026-08-31 found no publicly documented read-only status interface sufficient for a live Hayha or Stellar pilot. The decision is `NO LIVE BOT PILOT YET`.

Hayha's public guides document interactive GUI/CLI operation, limited Discord notification behavior, and a secret-bearing Amazon session-token export, but no safe public API, general signed webhook contract, task export, or read-only companion interface was established. Its public terms prohibit automated service access, data extraction, decompilation, and reverse engineering without explicit authorization. Private APIs, process/traffic inspection, CLI automation, and the session export are `DO_NOT_USE`.

Stellar documents task-group JSON export/import with a same-version requirement, Discord notifications, profile/config exports, session/account imports, and an external monitor WebSocket. The current public Tasks overview does not publish a stable JSON root, field schema, or embedded version marker. A sanitized task export is the only bounded offline path and remains a partially recognized preview rather than an import. Profile/config/session material is excluded because official guides show that it can contain PII, payment, retailer credential, proxy, or session data. The WebSocket direction is external product pings into Stellar rather than Bot status out, so it is not a read pilot. The Discord incoming-webhook URL is a posting credential, not a readable event feed; Code 3 will not use a Discord user token or scrape a channel.

Phase 2D-B2 implements only the previously approved zero-write, owner-selected preview boundary. Current official Stellar documentation establishes owner task-group import/export as JSON and requires the same Stellar version for the documented transfer workflow. It does not publish a stable JSON root, field schema, or embedded version marker. Code 3 therefore reserves `SUPPORTED` for a future verified adapter and emits only `PARTIALLY_RECOGNIZED`, `UNKNOWN_FORMAT`, `UNSAFE`, or `REJECTED` for current files.

The browser accepts one explicitly selected JSON file, limits it to 1 MiB and 500 candidate records, recursively screens every object/array before normalization, and copies only strictly allowlisted bounded fields into an ephemeral preview. Harmless unknown fields are ignored with warnings; sensitive fields or values, unsafe object keys, malformed input, and prohibited file shapes fail closed. Raw JSON, full paths, source hashes, normalized preview rows, filenames, and preview metrics are not persisted, logged, backed up, migrated, or sent over a network. Discard, replacement, route exit, or refresh removes the in-memory preview. `Stellar Export Preview != Bot Task Import` and `Previewed Task != Task`.

This parser does not alter the Phase 2D-B1 evidence registry. Hayha and Stellar remain `NOT_CONFIGURED`, every live provider/read/control capability remains false, and `NO_LIVE_BOT_PILOT_YET` remains the decision.

## Phase 2B2-B.1 operational isolation

The separate Preview managed-store verification remains paused. A Free Upstash resource exists and three server-only managed-store variables were configured as branch-scoped Preview secrets. Supabase owner/auth values and the remaining Preview activation/CORS/runtime values are not configured, no additional Preview was deployed, and `hostedRuntimeVerified=false`.

Phase 2D-B2 does not inspect, configure, use, test, or mutate that resource or those variables. It does not resume Phase 2B2-B.1. The pause remains in force until the owner explicitly says `Supabase signed in.`

## Explicit non-goals

The Phase 2D-A foundation, Phase 2D-B1 discovery, and Phase 2D-B2 offline preview do not:

- connect, authenticate, discover, operate, or reverse engineer Hayha, Stellar, or any other Bot;
- request or store Bot, retailer, payment, or proxy credentials;
- start/stop/restart a real task or installation;
- monitor a retailer or provider network;
- submit an entry, raffle, queue, cart, checkout, order, offer, bid, signup, or payment;
- bypass CAPTCHA, OTP, anti-bot, account, household, purchase-limit, rate-limit, or access controls;
- create or purchase accounts, phone numbers, proxies, or managed resources;
- create a Purchase, receive an item, create Inventory, adjust quantity, or alter cost basis;
- connect Gmail, Outlook, another mailbox, or another live provider;
- apply a schema, migrate owner data, activate `REMOTE_ACTIVE`, start billing, or deploy Production; or
- begin Phase 2D-B3 or a live provider pilot.

## Phase 2D-B2 zero-write preview contract

Phase 2D-B2 is a preview, not an import. It has no Save, Apply, Create Tasks, Sync, Connect, or send-to-Stellar action. The ephemeral preview model is deliberately separate from `BotTask`, `BotTaskGroup`, `ProductTarget`, Attempt, Activity, Checkout Evidence, Order Candidate, Purchase, Receiving, and Inventory models and repositories. It may show only bounded category-level security findings and normalized safe-field proposals; it never echoes a rejected value or exposes raw JSON by default.

The recursive scanner runs before any schema mapping. It rejects credential, token, session, cookie, authorization, license, OTP/recovery, payment-card/CVV, proxy-authentication, credential-bearing URL, raw-log/response, and prototype-pollution material at any depth. The field allowlist then validates task/group references, safe labels, retailer/site labels, product identifiers, title, quantity, exact minor-unit price/currency, mode, enabled/status state, and bounded timestamps where recognizable. An observed retailer string is not evidence of Stellar retailer support and does not change provider capability metadata.

No preview state is registered in Backup Format v1 or Migration Preview. Restore Preview remains zero-write and has no route into this feature. The existing `code3.bot-ops.v1` source is byte/record equivalent before and after preview, discard, and refresh.

## Future Phase 2D-B3 gate

A future task must separately approve any import, live adapter, local bridge, webhook receiver, provider credential, or data write. It must review current terms and anti-abuse constraints, validate a provider-confirmed schema/version, establish server-side authorization and secret boundaries where applicable, and retain the Checkout Evidence and explicit Purchase review boundary.

No future adapter may become live merely because Phase 2D-A metadata, fixtures, registry entries, or UI are present.
