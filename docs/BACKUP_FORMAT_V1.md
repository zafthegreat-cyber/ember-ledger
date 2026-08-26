# Code 3 Backup Format Version 1

Status: Phase 1A format published on the feature branch. Phase 1B adds a local owner-authorized remote-read integration, but its canonical server source remains gated/not active by default. The local Phase 2A working copy registers sanitized Account Ops metadata. No owner data has migrated, no schema was applied, and no restore applies data.

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

The Phase 2A registry contains 22 sources: 18 locally included sources and four excluded or conditional sources. When every registered local source is readable, the 18 included sections come from these source families:

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

Registered legacy documents that mix business and security fields are exported only through explicit allowlists. A recursive sanitizer removes prohibited field names and records a warning count without writing raw values to logs.

For Account Ops, prohibited data additionally includes plaintext/generated passwords, OTPs, retailer or mailbox sessions/tokens, payment-card/CVV data, provider credentials, browser-supplied owner/role/subject fields, and development impersonation state. `CredentialReference` metadata may be included because it contains only provider/reference/label/timestamp data; the referenced secret is never part of the envelope. A generated alias record remains metadata and cannot make a provider or mail-delivery source complete.

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
