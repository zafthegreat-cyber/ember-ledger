# Code 3 Backup Format Version 1

Status: Phase 1A format and later Account Ops, Inbox/Order, and Phase 2B2-B exclusions are published through `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`. Phase 2D-A adds one sanitized Bot Operations source. Phase 2D-B2 adds no source: selected Stellar JSON, filename/path, preview model, normalized temporary tasks, warnings, metrics and source derivatives remain ephemeral and excluded. Managed provider/Bot credentials, connection secret envelopes, OAuth state/index/used markers, encryption keys, Redis credentials, runtime proof, raw provider data, and proxy authentication remain excluded. No owner data has migrated, no schema was applied, and no restore applies data.

## Purpose and boundary

Version 1 creates a deterministic JSON recovery artifact for Code 3's registered records before any database migration. Its published source set is browser-held; Phase 1B may add a validated, owner-authorized canonical server section when the gated export is available. It is an export and inspection contract, not a cloud backup, database migration, or restore-apply mechanism.

The format identifier is `code-3-backup`; the format version is `1`. The implementation generates neutral filenames in the form `code-3-backup-YYYY-MM-DD-HHmm.json`.

## Envelope

```text
BackupEnvelope
  format
  formatVersion
  createdAt
  applicationVersion
  sourceCommit
  coverageStatus
  coverageSummary
  manifest
  sections[]
  integrity
```

Each section contains:

```text
BackupSection
  sourceId
  schemaVersion
  recordCount
  data
  warnings[]
  sha256
```

The manifest contains the included and excluded source inventory, record counts, schema versions, file-reference summary, security exclusions, known limitations, section hash index, and manifest hash.

## Registered sources

`src/features/backup/backupSourceRegistry.js` is the versioned coverage registry. It records storage type, schema version, export and validation adapters, reference dependencies, security/session sensitivity, and whether an omission changes coverage.

The Phase 2D-A registry contains 24 sources: 20 locally included sources and four excluded or conditional sources. When every registered local source is readable, the 20 included sections come from these source families:

- Deal Finder / Deal Inbox, appraisals, auctions, Search Rules, purchases, lots, inventory, sales, expenses, mileage, activity, and provider-listing snapshots;
- Owner Center restock profiles/events/predictions, visits, observations, import summaries, and local job summaries;
- allowlisted legacy collection/business records;
- legacy restock/store and private community records;
- feedback, suggestions, administrative review summaries, and product sightings;
- manual/cached price records;
- allowlisted Phase 2 local fallback records, including receipt references and workflow records;
- beta-readiness, grading-assistance, Business Assistant thread, and daily-progress records;
- safe display preferences;
- safe workflow drafts from exact registered session-storage keys/prefixes.
- Account Ops schema 1 metadata from `code3.account-ops.v1`: profile groups, profiles, email-domain metadata, aliases, owner-created retailers, store accounts, tasks, and bounded activity.
- Inbox/Order Intelligence schema 1 metadata from `code3.inbox-order.v1`: minimized message events, Order Candidate projections, append-only candidate/review events, and sanitized activity.
- Bot Operations schema 1 metadata from `code3.bot-ops.v1`: installations, Account Ops retailer-account links, Bot profiles, proxy metadata, product targets, task groups/tasks, append-only attempts/activity, and reviewable Checkout Evidence.

Historical storage keys remain unchanged. Their names are compatibility identifiers, not visible branding.

## Registered exclusions

Version 1 still registers but does not fetch or embed:

- configured Supabase owner records;
- legacy PostgreSQL, Express process-memory, or other server-held records outside the Phase 1B canonical export;
- receipt, listing, evidence, or product file bytes;
- authentication/session persistence and any credentials.

Phase 1B canonical PostgreSQL records can be included through the bounded owner-authorized export described below. Any other configured server source keeps coverage `PARTIAL` when omitted. Referenced but unembedded file bytes make coverage `PARTIAL`. Authentication/session state is always prohibited but does not reduce coverage because it must never be restored as business data.

## Phase 1B server-export extension

Phase 1B defines a `code-3-server-export` version 1 adapter contract so an owner-authorized backup can include canonical remote records when that gated source is configured. The adapter is a bounded read interface with uppercase backend domain keys, `sourceHash`, `coverageStatus`, owner authorization, cursor pagination, record counts, sanitized data, and validation warnings. Server export reads all PostgreSQL domains inside one `REPEATABLE READ READ ONLY` transaction (or an isolated memory-repository snapshot in tests), preventing a nominally complete export from mixing unrelated points in time. Before treating it as available, the client deterministically canonicalizes `domains`, recomputes SHA-256, and requires an exact match with `sourceHash`. A response claiming `COMPLETE` is accepted only when every canonical domain key is present and no domain is truncated. The client migration registry uses the same canonical keys for comparison. The adapter does not grant generic table access and cannot accept a client-supplied owner subject.

Data & Backup supplies `createRemoteBackupExportAdapter` with the owner-authorized request helper in `src/services/code3OwnerApi.js`. When a valid server export is available, its sanitized records become a versioned backup section and `serverDataIncluded` is true. An unavailable or rejected export is not silently treated as an empty section. Until canonical remote records can be fetched, counted, validated, and hashed successfully, their registered source remains excluded and coverage stays `PARTIAL`. An authentication failure, authorization failure, unavailable database, unsupported schema, or incomplete page cannot be converted into an empty successful section.

Remote records, when included in the Phase 1B envelope, use the same canonical section and SHA-256 manifest rules as local sections. File metadata and file bytes remain distinct; a metadata record cannot make referenced bytes complete.

Phase 1B Migration Preview may consume an integrity-verified backup hash as plan provenance. It never modifies the backup and never treats plan readiness as restore readiness.

## Prohibited data

An export must exclude:

- access, refresh, ID, provider, session, and eBay tokens;
- authorization headers and cookies;
- passwords, private keys, API keys, provider secrets, and environment values;
- Supabase auth persistence;
- owner allowlists;
- local-development identity or impersonation state;
- invitation/session tokens and cached credentials.
- OAuth authorization codes/state/PKCE verifiers, reset/login links or tokens, security codes, raw/protected message bodies or content, and managed provider-secret references.
- Bot/provider API tokens, passwords, cookies or sessions; retailer passwords/OTPs/security answers; payment-card/PAN/CVV values; proxy hosts/IPs/endpoints/authentication URLs/usernames/passwords; raw provider payloads/request-response bodies/logs/headers; and credential-bearing URLs or text.

Registered legacy documents that mix business and security fields are exported only through explicit allowlists. A recursive sanitizer removes prohibited field names and records a warning count without writing raw values to logs.

For Account Ops, prohibited data additionally includes plaintext/generated passwords, OTPs, retailer or mailbox sessions/tokens, payment-card/CVV data, provider credentials, browser-supplied owner/role/subject fields, and development impersonation state. `CredentialReference` metadata may be included because it contains only provider/reference/label/timestamp data; the referenced secret is never part of the envelope. A generated alias record remains metadata and cannot make a provider or mail-delivery source complete.

For Bot Operations, every included value must pass the domain's recursive authority/credential/raw-provider guard and schema validator. Proxy type/provider/region/health/count/latency metadata may be included; proxy connection/authentication data may not. Static provider keys, normalized task/attempt states, or Checkout Evidence do not make a Bot connection, checkout, order, Purchase, receiving, or Inventory source complete.

## Phase 2A Account Ops extension

The Account Ops section uses source schema version 1 and the same deterministic section/manifest hash rules as every other Backup Format v1 section. Allowed records are counted from the eight declared paths:

```text
profileGroups
profiles
emailDomains
emailAliases
retailers
storeAccounts
tasks
activity
```

Restore Preview validates the Account Ops schema, bounded records, stable IDs, duplicate aliases, and profile/alias/retailer/store-account/task relationships without mutation. Unknown or invalid relationships are diagnostics; preview never repairs or applies them. Every writable store remains unchanged after inspection.

All eight Account Ops record paths are `REQUIRES_MAPPING` in Migration Preview because the Phase 1B canonical schema has no Account Ops domain. This classification creates no canonical action and does not authorize a schema, migration, restore, or remote write.

## Phase 2B1 Inbox / Order Intelligence extension

The `inbox-order-intelligence` section uses source schema version 1 and the same deterministic section/manifest rules. Its four declared record paths are:

```text
messageEvents
orderCandidates
candidateEvents
activity
```

The source validator accepts only minimized normalized metadata. It rejects provider secrets, OAuth state/codes/verifiers, tokens, sessions, authority fields, raw/protected message content, OTPs, reset/login links, unsafe prototype keys, malformed IDs/references, invalid collection shape, and unsupported schema versions. Restore Preview remains in memory and zero-write; it cannot contact a provider, repair a candidate, apply an owner correction, or create a Purchase.

All four paths are `REQUIRES_MAPPING` because the Phase 1B canonical schema has no Inbox/Order Intelligence domain. The backup section is local evidence only. It does not include a server provider connection, prove a mailbox is connected, make provider secrets recoverable, or authorize canonical persistence.

## Phase 2D-A Bot Operations extension

The `bot-operations` section uses source schema version 1 and the same deterministic section/manifest rules. Its ten declared record paths are:

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

The source validator accepts only bounded nonsecret metadata. It rejects provider/Bot/retailer/payment/proxy credentials, cookies/sessions/OTPs/security answers, payment-card/PAN/CVV data, proxy connection/authentication data, raw provider payloads/logs/request-response bodies/headers, credential-bearing URLs/text, unsafe prototype keys, browser authority, malformed IDs/references, invalid collection shape, and unsupported schema versions.

Restore Preview validates schema/counts/stable IDs, provider/installation/event scoped identities, Account Ops reference shapes, task-group/product/task/attempt/evidence relationships, duplicate/conflicting event identity and prohibited fields in memory with zero writes. It cannot contact a Bot/provider, invoke the test mock, repair a task, reconcile an order, create a Purchase, receive Inventory, or mutate any source.

All ten paths are `REQUIRES_MAPPING` because the Phase 1B canonical schema has no Bot Operations domain. No migration action, remote adapter, Purchase/Inventory handoff, or managed Bot-secret recovery is approved. `Bot Success != Purchase` and `Checkout Evidence != Purchase` remain mandatory.

## Phase 2D-B2 Stellar preview exclusion

`StellarTaskExportPreview` is not a Backup Format v1 source and does not add a record path to `bot-operations`. The owner-selected JSON file, raw text/bytes, full path, basename, file metadata, source hash/fingerprint, parsed tree, normalized preview rows, duplicates, format state, recognized/ignored fields, security findings, warnings, retailer labels, and summary counts are component-memory data only.

The preview reads one explicitly selected JSON file of at most 1 MiB and 500 candidate records. Recursive security screening and strict allowlisted normalization happen before display, but even a safe preview is never passed to the persistence gateway or backup registry. Discard, replacement, route exit, or refresh removes it and requires owner reselection.

Backup generation while a preview is open exports the same registered sources and records it would export without the preview. Restore Preview cannot populate, validate, revive, or apply a Stellar preview. Migration Preview cannot classify or map it. `Stellar Export Preview != Bot Task Import`; `Previewed Task != Task`; no Task, Attempt, Activity, Checkout Evidence, Order Candidate, Purchase, Receiving, or Inventory record is created.

## Phase 2B2-B managed-provider exclusion

Phase 2B2-B does not itself change registry totals. After Phase 2D-A's additive local section, the totals are **24 sources, 20 locally included, and four excluded or conditional**. Managed provider operational state is not a user-backup source.

The following remain prohibited even if a future Preview resource is provisioned:

- managed Redis endpoint credentials and server environment values;
- the Code 3 AES-256-GCM encryption key or key-version control state;
- encrypted provider-secret envelopes and secret references used only by the trusted runtime;
- OAuth state values or digests, owner/redirect binding hashes, expiry indexes, used-state replay markers, and ephemeral managed-store readiness keys;
- provider authorization codes, PKCE verifiers, access/refresh tokens, passwords, OTPs, sessions, or raw/protected mailbox content; and
- runtime health/proof data that could be reconstructed from deployment state.

Safe local `code3.inbox-order.v1` evidence remains the nineteenth included section, and `code3.bot-ops.v1` is the twentieth. A Free Upstash resource exists, but Phase 2B2-B.1 remains paused with incomplete owner/CORS/activation configuration and `hostedRuntimeVerified=false`; no provider connection/secret/OAuth state exists to export. Restore Preview stays browser-local and zero-write and cannot contact, seed, validate, or mutate a managed provider or Bot store.

## Coverage semantics

| State | Meaning |
|---|---|
| `COMPLETE` | Every coverage-relevant registered source for the current context was read and included; no referenced external file bytes or configured server sources are omitted |
| `PARTIAL` | All included sections passed integrity checks, but one or more relevant registered sources are intentionally excluded, such as configured server data or referenced file bytes |
| `FAILED` | A required registered source could not be read or validated |

`PARTIAL` does not mean corrupted. It means the artifact is valid but is not a complete recovery point. A partial artifact may be downloaded only with that limitation visible. `FAILED` must never be labeled verified. Independently, any self-verification failure prevents the verified-success claim even if the precomputed coverage state was complete or partial.

## Deterministic serialization

`src/features/backup/canonicalJson.js` canonicalizes JSON before hashing:

- object keys are sorted;
- array order is preserved;
- negative zero becomes zero;
- cyclic, non-finite, unsupported, and non-plain-object values are rejected;
- prohibited prototype keys are rejected.

Canonical serialization is used for integrity hashes, while the downloadable artifact may be pretty-printed JSON.

## Integrity

SHA-256 is computed with Web Crypto or an injected equivalent in tests.

The section hash covers exactly:

- `sourceId`;
- `schemaVersion`;
- `recordCount`;
- `data`;
- `warnings`.

The manifest stores a section index of source, schema, count, and section hash. The manifest hash covers the complete manifest except its own `manifestHash` field. The envelope integrity block identifies `SHA-256`, repeats the manifest hash, and records whether immediate self-verification passed.

Changing section data, count, schema, warning set, section order/index, included/excluded source inventory, or the manifest invalidates verification.

## Export sequence

1. Enumerate the registry.
2. Read only the registered storage keys and prefixes.
3. Parse and bound each source.
4. Apply allowlists and remove prohibited security/session fields.
5. Count records using the source's declared record paths.
6. summarize file references without fetching them.
7. Create sections and coverage details.
8. Hash each canonical section.
9. Build and hash the manifest.
10. Serialize the envelope.
11. Parse the generated JSON as untrusted input.
12. Recalculate every section and manifest hash.
13. Serialize the self-verification result and verify again.
14. Expose success only if integrity verification passes and coverage is not `FAILED`.

The UI must say `Backup verified` only after this immediate round trip succeeds. It must display `PARTIAL` separately from integrity success.

## Record counts

Counts are source-specific and come from declared record paths rather than arbitrary object-key counts. They are inventory aids, not financial reconciliation. A later migration rehearsal must also reconcile IDs, quantities, currency totals, audit history, and file hashes.

## File-reference summary

The manifest distinguishes:

- embedded `data:` references;
- ephemeral `blob:` references;
- signed or expiring remote URLs;
- ordinary remote URLs;
- unresolved/local references.

Version 1 does not fetch any reference or assert that it remains recoverable. Any nonembedded referenced file keeps coverage partial.

## Money

Version 1 preserves current values exactly. It does not round, convert, or migrate floating-point money. Restore Preview diagnoses nonnumeric values, non-finite spellings, forbidden negatives, excess precision, missing currency, and currency mismatches. Minor-unit conversion is deferred to a separately approved migration with record-level reconciliation.

## Activity summary

Export may return a safe in-memory activity summary containing event type, time, coverage, record count, integrity result, warning count, and error count. It must not contain records, hashes treated as secrets, tokens, identity claims, or raw backup data. Durable activity logging is deferred until an owner-authorized audit store exists.

## Compatibility and future versions

Restore Preview accepts only recognized, supported versions. New formats require a new version and explicit compatibility adapter; version 1 must not be silently reinterpreted. Unknown sources and unsupported section schemas are reported rather than automatically discarded or changed.

## Known limitations

- The export is generated in the browser and inherits the browser's ability to read local records.
- Only a successfully validated Phase 1B canonical server export can be included; legacy Supabase, other server/process-memory data, and unavailable or truncated canonical records remain excluded or partial.
- File bytes are not embedded.
- A valid partial backup is not a complete disaster-recovery artifact.
- There is no encryption layer in the JSON format; the owner must protect downloaded files.
- No restore is applied in Phase 1A.
- No cloud backup, retention schedule, or backup verification history is implemented.
- No durable audit entry is written during export or preview.
- Phase 1B remote export is a real read-only integration, but its hosted source is gated/not active by default and it does not make backup coverage complete when any registered source or file byte remains omitted.
- Phase 2A Account Ops metadata can include personal and operational identity data. It is sanitized but not encrypted by Backup Format v1, and no provider secret, plaintext password, OTP, mailbox content, or retailer session is recoverable from it.
- Phase 2B1 Inbox/Order Intelligence metadata can include retailer, alias/account relationship and order evidence. It is sanitized but not encrypted; raw/protected content, OAuth/provider secrets, and live connection state are intentionally unrecoverable, and no Purchase restore/import exists.
- Phase 2D-A Bot Operations metadata can include provider/installation/task/product/account/profile/proxy-metadata relationships, attempts and Checkout Evidence. It is sanitized but not encrypted; all credentials/raw provider data/live connection state are intentionally unrecoverable, and no task control, order reconciliation, Purchase, receiving, or Inventory restore/import exists.
