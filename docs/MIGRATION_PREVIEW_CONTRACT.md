# Code 3 Migration Preview Contract

Status: Phase 1B `DRY_RUN_ONLY`. Preview produces diagnostics and a deterministic plan; it never applies the plan.

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`.

## Non-negotiable boundary

Migration Preview performs zero writes. It may read current registered local sources and, when safely configured and owner-authorized, read a bounded canonical remote snapshot for comparison. It must not insert, update, archive, delete, upload, clear, reconcile, or switch persistence mode.

An absent or incomplete remote snapshot is never interpreted as proof that a canonical record does not exist. Preview proposes `INSERT` only when the corresponding remote domain has authoritative complete comparison coverage; otherwise it emits `REMOTE_COMPARISON_REQUIRED` / `REQUIRES_DECISION`.

The interface must state: **No records will be written during this preview.** There is no **Migrate now** action in Phase 1B.

Restore Preview and Migration Preview are distinct:

- Restore Preview inspects a supplied Code 3 backup without writing.
- Migration Preview maps current local records into the proposed canonical schema and may compare them with a read-only remote snapshot.

Neither operation applies data.

## Inputs

Migration Preview consumes only bounded, validated inputs:

- the Phase 1A backup-source registry and current local source adapters;
- canonical mapping/validation adapters;
- an optional integrity-verified Code 3 backup reference/hash;
- optional owner-authorized, read-only canonical comparison records;
- application/source commit metadata when available.

Authentication/session state, owner allowlists, credentials, tokens, environment values, cached provider credentials, and development impersonation state are prohibited inputs.

## Source classification

Every source is classified before mapping:

| Classification | Meaning |
|---|---|
| `MIGRATABLE` | a bounded adapter can map the source without guessing |
| `REQUIRES_MAPPING` | relevant records exist but need an owner-confirmed field or identity decision |
| `LEGACY_ONLY` | preserved as legacy evidence; no canonical write is proposed |
| `DUPLICATE_OF_CANONICAL` | another registered source is authoritative for the same record family |
| `UNSUPPORTED` | no safe Phase 1B mapping exists; the source is reported and excluded |

An unsupported or legacy source is never discarded from local storage because of this classification.

The Phase 1B registry in `src/features/persistence/migrationSourceRegistry.js` classifies every Phase 1A backup source. All 80 registered record-bearing paths have an explicit collection-level decision, including preserved legacy/compatibility collections; registry validation fails if a present or future backup `recordPath` lacks one instead of silently ignoring it:

| Classification | Registered source IDs |
|---|---|
| `MIGRATABLE` | `deal-finder`, `owner-center`, an explicitly supplied `file-assets` metadata manifest |
| `REQUIRES_MAPPING` | `legacy-core-business`, `legacy-restock-scout`, `product-sightings`, `phase2-local-fallback`, `safe-ui-preferences` |
| `LEGACY_ONLY` | `legacy-community`, `legacy-feedback`, `legacy-suggestions`, `legacy-admin-review-history`, `manual-market-price-cache`, `beta-readiness-records`, `grade-assist-checklists`, `assistant-thread`, `daily-progress`, `workflow-drafts` |
| `DUPLICATE_OF_CANONICAL` | `supabase-owner-data`, `postgres-owner-data` |
| `UNSUPPORTED` | `authentication-state` |

Collection-level decisions may be more restrictive than their parent source. For example, combined auction records require mapping, overlapping legacy sales/expenses/mileage are duplicate candidates, local activity/job summaries remain legacy-only, and legacy monitor/AI cache data is unsupported. These decisions preserve the input for review; they do not write or delete it.

## Domain result

For each canonical domain, Preview reports:

- local records found;
- valid and invalid records;
- proposed new records;
- matching remote records;
- potential updates;
- conflicts;
- duplicate stable IDs;
- duplicate provider/external-ID pairs;
- broken references;
- money conversion warnings or blockers;
- unsupported and excluded records;
- records requiring an owner decision.

Overall status is one of:

| Status | Meaning |
|---|---|
| `READY` | every proposed action validates and no warnings/blockers remain |
| `READY_WITH_WARNINGS` | no blocker exists, but owner review is required before any future apply |
| `BLOCKED` | at least one conflict, invalid value, unsupported required record, or broken invariant prevents apply |
| `NO_DATA` | no migratable local records were found |

`READY` is not approval to migrate.

## Deterministic migration plan

The preview emits a versioned `MigrationPlan` containing conceptually:

```text
format
formatVersion
createdAt
ownerSubjectHash
sourceCommit
sourceBackupHash
domains[]
actions[]
warnings[]
blockers[]
planHash
```

Plan and dry-run domain values use the uppercase canonical wire enums shared with the backend, such as `DEAL`, `OWNED_ITEM`, and `PURCHASE_LOT`. Human-facing documentation may use title-case entity names, but wire values are not translated ad hoc.

Allowed actions are:

- `INSERT` — no matching canonical record exists;
- `UPDATE` — the same canonical identity exists but validated content differs;
- `SKIP` — incoming and canonical content match, or the source is explicitly excluded;
- `REQUIRES_DECISION` — a conflict or ambiguity cannot be resolved automatically.

`DELETE` is not an allowed Phase 1B plan action. Preview never proposes clearing local data.

`ARCHIVED` is also not accepted as a create/update shortcut. A candidate carrying `archivedAt`, `archived_at`, or a normalized `ARCHIVED` status becomes `REQUIRES_DECISION` with `ARCHIVE_ACTION_REQUIRED`. Phase 1B deliberately proposes no archive action; a future apply phase must preserve the explicit, version-checked archive boundary.

Plan hashing uses canonical JSON and SHA-256. Volatile display metadata such as a generated timestamp must not make identical substantive inputs produce different action order or plan content. Actions and findings use stable deterministic ordering. The plan includes the source backup hash when supplied. Registered-source read warnings enter the preview status and the hashed plan/preview warnings rather than disappearing from readiness. Changing an input record, mapping version, action, warning, blocker, or source hash changes the plan hash.

The owner subject is represented only by a one-way safe hash or opaque reference. The raw allowlist and unnecessary identity claims are never stored in a plan.

## Stable identity and matching

Identity matching considers, without silently merging:

- canonical UUID;
- retained source and legacy identity;
- provider plus external ID;
- certification number where applicable;
- referenced purchase, lot, owned item, sale, storage, auction, store, or return.

A valid local UUID is preserved only when it is unique across every canonical domain for that owner. The database key is `(owner_subject, id)`, so the same UUID may be reused only by a different owner. A non-UUID legacy ID produces a deterministic proposal from source ID, source collection, and legacy ID. Recognized semantic identities are an active provider/external-ID pair, an active Owned Item certification number, or a Sale reference; these may produce a deterministic proposal with a visible warning. Archived provider/certification identities do not derive a new semantic UUID. A record with no stable legacy or recognized semantic identity receives no proposed UUID in Phase 1B and becomes `REQUIRES_DECISION`; content fingerprints, whole-backup hashes, array positions, and mutable labels do not establish identity.

A same-ID/different-content result is `STABLE_ID_CONTENT_COLLISION` and `REQUIRES_DECISION` unless matching migration provenance proves it is the same source/collection/legacy record. A same active provider/external ID with different stable IDs in the same canonical domain is a conflict; the same provider/external text may legitimately exist in a different domain. This domain-qualified rule applies to every canonical domain, not only deals. Archived remote records are excluded from provider/external and `OWNED_ITEM` certification matching, consistent with active-only partial unique indexes; stable IDs remain owner-wide even when archived. An identical remote record may be `SKIP`. A changed record may be an `UPDATE` proposal only when identity is unambiguous and neither record is a conflicting newer version.

## Conflict detection

Preview reports at least:

- one owner-scoped stable ID reused with different contents or across canonical domains;
- one provider/external ID attached to different stable IDs;
- one case-insensitive certification number attached to different active `OWNED_ITEM` records;
- duplicated sale reference;
- a purchase lot without its purchase;
- a sale line without its owned item;
- an orphaned allocation or return;
- duplicate stable IDs for expense/import records, normalized expense date/merchant/amount/currency matches, and repeated explicit import references; these are conservative owner-review blockers rather than automatic merges;
- duplicate stable IDs, provider/external-ID pairs, and certification numbers within the proposed action list itself;
- duplicate owner-scoped FileAsset storage-provider/path pairs in the plan or canonical repository;
- an archived candidate that would require the separately authorized archive action;
- incompatible record versions;
- a remote record newer than the local candidate.

Potential future choices may be described as Keep Local, Keep Remote, or Review Manually. Phase 1B does not select or apply one.

## Money conversion preview

Canonical money is integer minor units with explicit currency. For a currency supporting two decimal places:

| Local value | Proposal |
|---:|---:|
| `12.34` | `1234` |
| `12.3` | `1230` |
| `12` | `1200` |

Preview must preserve the original value beside the proposal. It warns or blocks more precision than the currency supports and blocks `NaN`, positive/negative Infinity, ambiguous numeric strings, and unsupported currency. A missing currency may use the configured default only with a visible warning; it blocks when no safe default exists. Preview never rounds silently or mutates the source value.

## Validation and bounds

Mapping validators reject or report:

- invalid UUIDs, dates, URLs, currencies, quantities, statuses, bounded `rateBasisPoints`, and foreign references;
- non-finite values and unsupported precision;
- unknown privileged fields and prototype-pollution keys;
- overly long notes/metadata, metadata beyond the 250,000-byte UTF-8 wire limit, excessive arrays, unbounded record counts, and excessive nesting;
- client-supplied owner authority;
- unsupported source or schema versions.

Provider evidence may remain bounded JSON when preserving the original snapshot is safer than over-normalizing it.

The canonical wire/API/schema validates the optional generic `rateBasisPoints` field. The Phase 1B migration mapper does not infer semantic mappings from legacy fee, tax, ROI, or other percentage fields into it; those values remain in preserved metadata and require a later owner-reviewed domain mapping.

## File-reference limit

Phase 1B supplies a strict single-record `FileAsset` metadata validator, schema representation, and migration path for an explicitly supplied `file-assets` metadata array. In that explicit manifest, records become `FILE_ASSET` candidates; unsafe/unknown paths, invalid asset IDs or hashes, missing required metadata, prohibited owner/security fields, and owner-wide duplicate IDs are reported. `storageProvider` is bounded to 80 characters and MIME type to 255 characters, in addition to format checks. The service/dry-run additionally validates the referenced canonical owner record. This covers metadata only; it never reads, uploads, hashes, or verifies file bytes.

The normal Phase 1A backup registry still has no file-manifest export adapter or record path, so current-source Migration Readiness does not automatically synthesize `FILE_ASSET` candidates from scattered receipt/image references. Without an explicit manifest, Preview emits `FILE_REFERENCE_MANIFEST_UNSUPPORTED` with `PARTIAL_WHEN_REFERENCED` plus `FILE_REFERENCE_MANIFEST_MISSING` findings for detected references. It cannot prove that a referenced byte exists, is owner-protected, or is recoverable. File bytes remain excluded and referenced files keep backup coverage `PARTIAL`.

## Backend dry run

The Phase 1B endpoint `POST /api/code3/migration/dry-run` is an owner-authorized, read-only validator. It accepts a bounded version 1 action list plus a SHA-256 source-backup hash, rejects client-supplied owner scope and `DELETE`, validates create/update inputs, and reads matching owner-scoped records to identify duplicate IDs, missing records, stale versions, external-identity conflicts, and certification conflicts. A `REQUIRES_DECISION` action is an explicit blocker rather than a server-valid no-op.

Before validating individual actions, the endpoint builds a plan-wide identity and insert index. A proposed `INSERT` must carry the exact future stable UUID in `input.id`; an action-level `recordId` alone is insufficient, and a mismatch blocks. The index rejects owner-wide stable-ID reuse, duplicate provider/external-ID pairs, duplicate `OWNED_ITEM` certification numbers, and duplicate FileAsset storage-provider/path pairs inside the plan. Repository comparison enforces the same active external/certification and file-path rules.

The plan index permits a relation or `FILE_ASSET` related-record reference to a valid insert anywhere in the same plan, including a later action, so deterministic action ordering does not create false broken-reference errors. References not found in either that planned-insert set or the owner-scoped repository remain blocking. After the main pass, invalid planned targets propagate `planned_reference_target_invalid` to every dependent action, including transitive dependencies, so a malformed insert cannot make its children appear valid. Archived remote records are immutable and cannot be dry-run updates without a future explicit restore workflow. The dry run never calls repository create, update, archive, or delete methods. Automated tests use the in-memory repository and compare snapshots before and after the dry run.

The current endpoint does not open a database transaction because it issues no proposed writes. It is unavailable in hosted environments unless the canonical persistence gate and database are explicitly configured, and its existence does not make canonical persistence active.

If a later phase adds deeper constraint validation against a configured disposable or Preview database by issuing provisional writes, the server must:

1. authorize the owner;
2. open an isolated transaction;
3. validate every proposed operation and constraint;
4. roll back unconditionally;
5. verify zero committed rows;
6. return only redacted diagnostics.

Production credentials are never required by Phase 1B automated tests.

## Zero-write proof

Automated tests snapshot or instrument every writable surface available to Preview and compare it afterward:

- localStorage and sessionStorage;
- local repository snapshots and persistence settings;
- IndexedDB when introduced;
- Supabase/PostgreSQL adapter mutation calls;
- files/object storage;
- auth/session state;
- owner settings and feature controls.

The generated plan is returned in memory. Preview must not write a durable business audit event because that would violate the zero-write guarantee. A bounded in-memory diagnostic summary is permitted.

## Migration Readiness UI

Owner Center → Controls → Data & Backup → Migration Readiness uses the approved minimal interface and shows:

- persistence target and current mode;
- local and optional remote record counts;
- ready/warning/blocked domain counts;
- money, reference, conflict, and exclusion findings;
- last in-memory preview time and preview hash;
- a primary **Run migration preview** action;
- the explicit zero-write statement.

No apply, migrate, cleanup, or local-delete action is present.

## Phase 1B acceptance

Preview is acceptable only when deterministic-order/hash, insert/update/skip/decision, collision/reference/money checks, source classification, owner-scope, bounds, and zero-write tests pass. It remains `DRY_RUN_ONLY` until a separately approved migration phase supplies verified backup, deployment configuration, rollback rehearsal, owner confirmation, and end-to-end apply tests.
