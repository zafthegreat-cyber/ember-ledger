# Code 3 Backup Format Version 1

Status: Phase 1A local implementation, not committed or deployed.

## Purpose and boundary

Version 1 creates a deterministic JSON recovery artifact for Code 3's current browser-held records before any database migration. It is an export and inspection contract, not a cloud backup, database migration, or restore-apply mechanism.

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

Phase 1A currently produces 17 included browser-source sections when all registered local sources are readable. They come from these source families:

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

Historical storage keys remain unchanged. Their names are compatibility identifiers, not visible branding.

## Registered exclusions

Version 1 registers but does not fetch or embed:

- configured Supabase owner records;
- PostgreSQL, Express process-memory, or other server-held records;
- receipt, listing, evidence, or product file bytes;
- authentication/session persistence and any credentials.

Server data makes coverage `PARTIAL` when that source is configured. Referenced but unembedded file bytes make coverage `PARTIAL`. Authentication/session state is always prohibited but does not reduce coverage because it must never be restored as business data.

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
- Server data and process-memory data are not included.
- File bytes are not embedded.
- A valid partial backup is not a complete disaster-recovery artifact.
- There is no encryption layer in the JSON format; the owner must protect downloaded files.
- No restore is applied in Phase 1A.
- No cloud backup, retention schedule, or backup verification history is implemented.
- No durable audit entry is written during export or preview.
